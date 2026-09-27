import { test, expect, type Page } from "@playwright/test";
import { legalMoves, includeCalibrate } from "../../dist/engine.mjs";
async function snapshot(p: Page) {
  return p.evaluate(() =>
    window.starChainClient!.getSnapshot()!,
  ) as Promise<any>;
}
async function dispatch(p: Page, action: string, data = {}) {
  return p.evaluate(
    async ({ action, data }) => {
      const c = window.starChainClient!,
        s = c.getSnapshot()!;
      return c.dispatch({
        protocol: 1,
        id: crypto.randomUUID(),
        matchId: s.matchId,
        action: action as any,
        data,
      });
    },
    { action, data },
  );
}
async function ready(p: Page, url = "/") {
  await p.goto(url);
  await p.waitForFunction(
    () => document.documentElement.dataset.models === "ready",
  );
}
async function choices(p: Page, s: any) {
  if (s.game.phase === "loadout")
    await p.locator("[data-action=module]").first().click();
  else if (s.game.initiative.stage === "idle")
    await p.locator("[data-action=roll]").click();
  else if (s.game.phase === "sector" && s.game.current_player === "human")
    await p.locator("[data-action=sector]").first().click();
  else if (s.game.phase === "boon" && s.game.current_player === "human")
    await p.locator("[data-action=boon]").first().click();
}
function moves(s: any) {
  const g = s.game,
    o = {
      actor: 0,
      shield: g.shields[0],
      opponentShield: g.shields[1],
      sectorId: g.sector?.id || null,
      moduleId: g.modules[0],
      opponentModuleId: g.modules[1],
      moduleProgress: g.module_progress[0],
      opponentModuleProgress: g.module_progress[1],
      hp: g.hp,
      level: g.opponent_level - 1,
      board: g.board,
      hand: g.hand,
      opponentHand: g.robot_hand,
      goals: g.goals.map((g: any) => g.id),
      market: g.market,
      round: g.round,
      turnInRound: g.turn_in_round,
      challengeIds: g.challenge_ids,
      challengeProgress: g.challenge_progress[0],
      opponentChallengeProgress: g.challenge_progress[1],
      calibrates: g.calibrates,
      boon: g.boon,
    };
  return includeCalibrate(o, legalMoves(o)).sort(
    (a: any, b: any) =>
      Number(b.lethal) - Number(a.lethal) || b.points - a.points,
  );
}

test("half-second preparation locks duplicate input, restart cancels queued FX, reduced motion skips the queue", async ({page}) => {
  await ready(page);
  const nextMove = async () => {
    for(let i=0;i<150;i++){
      const s=await snapshot(page);
      if(s.game.phase==='action' && s.game.current_player==='human' && !s.game.animation && s.game.initiative.stage==='none')return moves(s)[0];
      await choices(page,s);await page.waitForTimeout(100);
    }
    throw Error('No human action');
  };
  const select = async (m:any) => {
    for(const id of m.move.ids)await dispatch(page,'card',{id});
    await dispatch(page,'chain',{index:m.move.chain});
    for(const [step,value] of m.move.ops.entries())await dispatch(page,'op',{step,value});
    if(m.move.wild)await dispatch(page,'wild',{value:m.move.wild});
    if(m.move.warpTo!==undefined)await dispatch(page,'warp-to',{value:m.move.warpTo});
    if(m.move.calibrate)await dispatch(page,'calibrate');
  };
  await select(await nextMove());
  await page.evaluate(()=>{
    const scene=window.starChainBridge!.battleView as any;
    (window as any).fxCalls=[];
    for(const kind of ['shoot','repair','collapse']){const fn=scene[kind];scene[kind]=function(...args:any[]){(window as any).fxCalls.push({kind,t:performance.now()});return fn.apply(this,args);}}
    document.addEventListener('starchain:commit',()=>{(window as any).commitTime=performance.now();(window as any).fxCalls=[];});
  });
  await page.locator('[data-action=play]').click();
  expect((await snapshot(page)).game.animation).toBe(true);
  await expect(page.locator('.orders')).toContainText('已确认');
  const hp=(await snapshot(page)).game.hp;
  expect((await dispatch(page,'play')).ok).toBe(false);
  expect((await snapshot(page)).game.hp).toEqual(hp);
  await page.waitForFunction(()=>(window as any).fxCalls.length>0);
  const delay=await page.evaluate(()=>(window as any).fxCalls[0].t-(window as any).commitTime);
  expect(delay).toBeGreaterThanOrEqual(450);expect(delay).toBeLessThan(900);
  // Restart during active presentation cancels its future hits and repair pulses.
  await page.locator('[data-action=restart]').click();await page.locator('[data-action=confirm-new]').click();
  await page.evaluate(()=>(window as any).fxCalls=[]);
  await page.waitForTimeout(1400);
  expect(await page.evaluate(()=>(window as any).fxCalls.length)).toBe(0);
  expect((await snapshot(page)).game.phase).toBe('loadout');
  expect(await page.evaluate(()=>{const s=window.starChainBridge!.battleView as any;return s.effects.length+s.fxPool.items.filter((x:any)=>x.busy).length;})).toBe(0);
  await page.getByRole('button',{name:'减弱动效',exact:true}).click();
  await select(await nextMove());
  await dispatch(page,'play');await page.waitForTimeout(180);
  expect((await snapshot(page)).game.animation).toBe(false);
  expect(await page.evaluate(()=>(window as any).fxCalls.length)).toBe(0);
});

test("complete human versus AI game, exact preview, refills, records, help, restart", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await page.evaluate(()=>{
    const scene=window.starChainBridge!.battleView as any,original=scene.collapse;
    scene.collapse=function(...args:any[]){(window as any).collapseTime=performance.now();return original.apply(this,args);};
    new MutationObserver(()=>{if(document.querySelector('dialog[open]')&&!(window as any).resultTime)(window as any).resultTime=performance.now();}).observe(document.getElementById('modal')!,{attributes:true,attributeFilter:['open']});
  });
  let fallCaptured = false;
  let plays = 0,
    refills = 0;
  for (let i = 0; i < 500; i++) {
    const s = await snapshot(page),
      g = s.game;
    if (g.phase === "over" && !g.animation) break;
    if (
      g.animation ||
      g.current_player === "robot" ||
      ["rolling", "result"].includes(g.initiative.stage)
    ) {
      const falling = await page.evaluate(()=>{const s=window.starChainBridge!.battleView as any;return s.ships.some((ship:any)=>ship.fall!==null&&s.age-ship.fall>.65&&s.age-ship.fall<1.6);});
      if(falling&&!fallCaptured){
        await expect(page.locator('dialog[open],.opening-overlay')).toHaveCount(0);
        await page.screenshot({path:'.local/qa/cinematic-game-fall.png'});fallCaptured=true;
      }
      await page.waitForTimeout(400);
      continue;
    }
    if (g.phase !== "action" && g.phase !== "refill") {
      await choices(page, s);
      continue;
    }
    if (g.phase === "refill") {
      await page
        .locator(refills++ % 2 ? "[data-action=draw]" : "[data-action=supply]")
        .first()
        .click();
      continue;
    }
    const m = moves(s)[0];
    expect(m).toBeTruthy();
    for (const id of m.move.ids)
      await page.locator(`[data-action=card][data-id="${id}"]`).click();
    await page
      .locator(`[data-action=chain][data-index="${m.move.chain}"]`)
      .click();
    if (g.hand.find((c: any) => m.move.ids.includes(c.id) && c.type === "J")) {
      if (m.move.warpTo !== undefined)
        await page
          .locator(`[data-action=warp-to][data-value="${m.move.warpTo}"]`)
          .click();
    } else {
      for (const [step, value] of m.move.ops.entries())
        await page
          .locator(
            `[data-action=op][data-step="${step}"][data-value="${value}"]`,
          )
          .click();
      if (m.move.wild)
        await page
          .locator(`[data-action=wild][data-value="${m.move.wild}"]`)
          .click();
    }
    if (m.move.calibrate) await page.locator("[data-action=calibrate]").click();
    const preview = await snapshot(page);
    expect(preview.game.automatic_damage).toBe(m.damage);
    expect(preview.game.automatic_healing).toBe(m.healing);
    await page.locator("[data-action=play]").click();
    const after = await snapshot(page);
    expect(after.game.hp).toEqual([
      g.hp[0] + m.healing,
      Math.max(0, g.hp[1] - m.damage),
    ]);
    plays++;
    if (plays === 1) {
      await page.waitForTimeout(350);
      await page.screenshot({ path: ".local/qa/attack.png" });
    }
  }
  await page.waitForFunction(
    () =>
      window.starChainClient!.getSnapshot()!.game.phase === "over" &&
      !window.starChainClient!.getSnapshot()!.game.animation,
  );
  expect(plays).toBeGreaterThan(0);
  expect(refills).toBeGreaterThan(0);
  await expect(page.locator('dialog[open] .pin-modules')).toBeVisible();
  const timing=await page.evaluate(()=>({collapse:(window as any).collapseTime,result:(window as any).resultTime}));
  if((await snapshot(page)).game.hp.includes(0)){
    expect(timing.collapse).toBeGreaterThan(0);expect(fallCaptured).toBe(true);
  }
  if(timing.collapse)expect(timing.result-timing.collapse).toBeGreaterThanOrEqual(1900);
  const offered=await page.locator('[data-action=pin-module]').evaluateAll(es=>es.map(e=>(e as HTMLElement).dataset.id));
  expect(offered).toHaveLength(3);
  await page.locator('[data-action=pin-module]').first().click();
  await expect(page.locator('.pin-modules .pinned')).toContainText('已钉住');
  await page.locator('dialog [data-action=close-modal]').first().click();await page.locator('[data-action=result]').click();
  expect(await page.locator('[data-action=pin-module]').evaluateAll(es=>es.map(e=>(e as HTMLElement).dataset.id))).toEqual(offered);
  expect((await dispatch(page,'pin-module',{id:'unoffered-module'})).ok).toBe(false);
  await page.screenshot({ path: ".local/qa/result.png" });
  if (await page.locator("dialog[open]").count())
    await page.locator("dialog [data-action=close-modal]").first().click();
  await page.locator("[data-action=help]").click();
  await expect(page.locator("dialog")).toContainText("玩法");
  await page.locator("dialog [data-action=close-modal]").first().click();
  await page.locator("[data-action=records]").click();
  await expect(page.locator("dialog")).toBeVisible();
  await page.locator("dialog [data-action=close-modal]").first().click();
  await page.locator("[data-action=restart]").click();
  await expect(page.locator("[data-action=module]")).toHaveCount(3);
  await expect(page.locator(`[data-action=module][data-id="${offered[0]}"]`)).toHaveClass(/pinned/);
  expect(errors).toEqual([]);
});

test("readable cards, doubled markers and visible navigation at desktop and phone sizes", async ({
  page,
}) => {
  await ready(page);
  await page.locator("[data-action=module]").first().click();
  await page.locator("[data-action=roll]").click();
  for (let i = 0; i < 60; i++) {
    const s = await snapshot(page);
    if (
      s.game.phase === "action" &&
      !s.game.animation &&
      s.game.current_player === "human" &&
      s.game.initiative.stage === "none"
    )
      break;
    await choices(page, s);
    await page.waitForTimeout(300);
  }
  await expect(page.locator("[data-action=rest]")).toBeVisible();
  for (const [width, height] of [
    [1920, 1080],
    [1774, 887],
    [1280, 720],
    [2560, 1080],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    const result = await page.evaluate(() => {
      const rect = (el: Element) => {
        const r = el.getBoundingClientRect();
        return {
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          b: r.bottom,
          r: r.right,
        };
      };
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        cards: [".hand .card", ".refill .card", ".opponent-hand .card"].map(
          (s) => rect(document.querySelector(s)!),
        ),
        nav: rect(document.querySelector(".masthead nav")!),
        stars: [...document.querySelectorAll(".position-star")].map((el) => {
          const r = rect(el),
            css = getComputedStyle(el);
          return {
            size: parseFloat(css.width),
            bottom: r.b,
            labels: [...el.parentElement!.querySelectorAll(".rail-label")].map(
              (l) => rect(l).y,
            ),
          };
        }),
        deck: rect(document.querySelector(".command-deck")!),
        controls: rect(document.querySelector(".rail-controls")!),
        rest: rect(document.querySelector("[data-action=rest]")!),
      };
    });
    expect(result.overflow, `${width} overflow`).toBe(false);
    expect(result.nav.x).toBeGreaterThanOrEqual(0);
    expect(result.nav.r).toBeLessThanOrEqual(width);
    for (const s of result.stars) {
      expect(s.size).toBe(24);
      expect(Math.min(...s.labels) - s.bottom).toBeGreaterThanOrEqual(0);
    }
    if (width > 700) {
      expect(Math.abs(result.cards[0].w - result.cards[1].w)).toBeLessThan(2);
      expect(Math.abs(result.cards[0].h - result.cards[2].h)).toBeLessThan(2);
      expect(result.deck.b).toBeLessThanOrEqual(height + 1);
      expect(result.rest.b).toBeLessThanOrEqual(height);
      expect(result.controls.b).toBeLessThan(result.deck.y);
    }
    await page.screenshot({
      path: `.local/qa/layout-${width}.png`,
      fullPage: width < 700,
    });
  }
});

test("WebGL fallback and missing-model fallback keep game usable", async ({
  browser,
}) => {
  const page = await browser.newPage();
  await ready(page, "/?backend=webgl");
  await expect(page.locator("html")).toHaveAttribute("data-backend", "webgl2");
  await page.close();
  const fallback = await browser.newPage();
  await fallback.route("**/detailed-*.glb*", (route) => route.abort());
  await fallback.goto("/");
  await fallback.waitForFunction(
    () => document.documentElement.dataset.battle === "fallback",
  );
  await fallback.locator("[data-action=module]").first().click();
  await expect(fallback.locator("[data-action=roll]")).toBeVisible();
  await fallback.close();
});

test("sixteen distinct models load, player-only inspection and fracture render without errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await page.locator("[data-action=module]").first().click();
  await page.locator("[data-action=roll]").click();
  for (let i = 0; i < 60; i++) {
    const s = await snapshot(page);
    if (
      s.game.phase === "action" &&
      !s.game.animation &&
      s.game.current_player === "human" &&
      s.game.initiative.stage === "none"
    )
      break;
    await choices(page, s);
    await page.waitForTimeout(300);
  }
  await expect(page.locator("[data-action=rest]")).toBeVisible();
  for (let level = 0; level < 16; level++) {
    await page.evaluate((level) => {
      const s = window.starChainClient!.getSnapshot()!;
      window.starChainBridge!.battleView.sync({
        ...s.battle,
        level,
        match: 100 + level,
      });
    }, level);
    await page.waitForFunction(
      (level) =>
        document.documentElement.dataset.modelLevel === String(level + 1),
      level,
    );
    if ([0, 7, 15].includes(level)) {
      await page.waitForTimeout(1700);
      await page.screenshot({ path: `.local/qa/model-${level + 1}.png` });
    }
  }
  await page.getByRole("button", { name: "近看飞船", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "返回战斗视角", exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "开启侧光", exact: true }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: ".local/qa/player-inspect.png" });
  await page
    .getByRole("button", { name: "返回战斗视角", exact: true })
    .first()
    .click();
  await page.evaluate(() => {
    const s = window.starChainClient!.getSnapshot()!;
    window.starChainBridge!.battleView.sync({
      ...s.battle,
      level: 15,
      match: 115,
      hp: [0, 18],
      phase: "over",
      outcome: "enemy",
      event: {
        epoch: 115,
        seq: 1,
        actor: 1,
        damage: 18,
        rawDamage: 18,
        healing: 0,
        blocked: 0,
        claimed: ["a", "b"],
        chain: 0,
      },
    });
  });
  await page.waitForFunction(() => {
    const scene = window.starChainBridge!.battleView as any;
    return (
      scene.ships[0].fall !== null &&
      scene.age - scene.ships[0].fall > 0.9 &&
      scene.ships[0].fragments.length >= 6 &&
      scene.ships[0].fragments.every((part: any) => part.visible) &&
      scene.ships[0].hull.every((part: any) => !part.visible)
    );
  });
  await page.screenshot({ path: ".local/qa/fracture.png" });
  expect(errors).toEqual([]);
});
