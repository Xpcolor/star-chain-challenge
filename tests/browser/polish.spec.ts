import { test, expect } from "@playwright/test";
import { legalMoves } from "../../dist/engine.mjs";
import { readFileSync, writeFileSync } from "node:fs";
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
async function dispatch(page: any, action: string, data = {}) {
  return page.evaluate(
    ({ action, data }: any) => {
      const c = window.starChainClient!,
        s = c.getSnapshot()!;
      return c.dispatch({
        protocol: 1,
        id: crypto.randomUUID(),
        matchId: s.matchId,
        action,
        data,
      });
    },
    { action, data },
  );
}
async function actionReady(page: any) {
  for (let i = 0; i < 150; i++) {
    const s = await page.evaluate(() => window.starChainClient!.getSnapshot()!);
    if (s.ui.humanAction) return s;
    for (const a of ["module", "roll", "sector", "boon"]) {
      const button = page.locator(`[data-action=${a}]`).first();
      if ((await button.isVisible()) && (await button.isEnabled()))
        await button.click();
    }
    await page.waitForTimeout(150);
  }
  throw Error("Human turn did not become ready");
}
function observation(s: any) {
  const g = s.game;
  return {
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
}

test("changing enemy fleet warms hidden fracture shaders before the first fatal hit", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "star-chain-demo-v1",
      JSON.stringify({ version: 6, unlocked: 15, matches: 0 }),
    ),
  );
  await page.route("**/api/**", (r) => r.fulfill({ status: 401, body: "{}" }));
  await page.goto("/");
  await page.locator("[data-action=module]").first().waitFor();
  for (const level of [7, 15]) {
    await page.evaluate((level) => {
      const c = window.starChainClient!,
        s = c.getSnapshot()!;
      return c.dispatch({
        protocol: 1,
        id: crypto.randomUUID(),
        matchId: s.matchId,
        action: "confirm-new",
        data: { level },
      });
    }, level);
    await page.waitForFunction(
      (level) =>
        Number(document.documentElement.dataset.modelLevel) === level + 1,
      level,
    );
    await page.locator("[data-action=module]").first().waitFor();
    await page.evaluate(() => {
      const s = window.starChainBridge!.battleView as any;
      (window as any).coldFragments = [];
      s.renderer.debug.onNodeBuilderCreated = (_: unknown, o: any) => {
        if (o.object.name.startsWith("debris_"))
          (window as any).coldFragments.push(o.object.name);
      };
      const event = {
        epoch: s.epoch,
        seq: 991,
        actor: 0,
        rawDamage: 9,
        damage: 9,
        healing: 0,
        blocked: 0,
        claimed: ["a", "b", "c", "d"],
        chain: 0,
      };
      s.settle(event);
      s.terminalCue({
        ...s.state,
        hp: [24, 0],
        phase: "over",
        outcome: "player",
        event,
      });
    });
    await page.waitForFunction(
      () => (window.starChainBridge!.battleView as any).ships[1].fall !== null,
    );
    await page.waitForTimeout(400);
    expect(
      await page.evaluate(() => (window as any).coldFragments),
      `level ${level + 1} cold fracture compilation`,
    ).toEqual([]);
    await page.evaluate(() => {
      (
        window.starChainBridge!.battleView as any
      ).renderer.debug.onNodeBuilderCreated = null;
    });
  }
});

test("version/manual, triangle destination and continuous three/four-cell circuits stay readable", async ({
  page,
}) => {
  const layouts: any[] = [];
  await page.addInitScript(() =>
    localStorage.setItem(
      "star-chain-demo-v1",
      JSON.stringify({ version: 6, unlocked: 15, matches: 0 }),
    ),
  );
  await page.route("**/api/**", (r) => r.fulfill({ status: 401, body: "{}" }));
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator("[data-action=module]").first().waitFor();
  await expect(page.locator(".brand")).toHaveText(`星链对战 V${version}`);
  await page.locator("[data-action=help]").click();
  await expect(page.locator("#modal-title")).toHaveText(
    `星链对战 · 玩法 V${version}`,
  );
  await page.locator("dialog [data-action=close-modal]").first().click();
  for (const level of [0, 7]) {
    if (level) await dispatch(page, "confirm-new", { level });
    const s = await actionReady(page),
      m = legalMoves(observation(s)).find(
        (m: any) =>
          m.move.ids.length === 1 &&
          s.game.hand.find((c: any) => c.id === m.move.ids[0])?.type === "N",
      )!;
    expect(m).toBeTruthy();
    await dispatch(page, "card", { id: m.move.ids[0] });
    await dispatch(page, "chain", { index: m.move.chain });
    await dispatch(page, "op", { step: 0, value: m.move.ops[0] });
    await expect(page.locator(".landing-marker")).toHaveAttribute(
      "data-landing",
      String(m.info.after),
    );
    // A layout-only fixture includes long copy and progress details every time;
    // the engine and the real legal destination above are unchanged.
    await page.evaluate(() => {
      const fixture = structuredClone(window.starChainClient!.getSnapshot()!);
      fixture.game.goals[2].text = "三条星链的数值各不相同，且等距排列";
      for (const repairs of fixture.game.repairs) {
        Object.assign(repairs.at(-1)!, {
          name: "双线呼应",
          text: "在 2 条不同星链上触发攻击",
          metric: "goalChains",
          target: 2,
          healing: 2,
        });
      }
      window.starChainBridge!.render(fixture);
    });
    for (const [width, height] of [
      [2179, 1244],
      [1774, 887],
      [1280, 720],
      [390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(180);
      const result = await page.evaluate(() => {
        const marker = document.querySelector(".landing-marker")!,
          star = document.querySelector(".position-star")!,
          hint = document.querySelector(".tick.target")!;
        const cells = [...document.querySelectorAll("[data-electric-cell]")];
        const border = (window.starChainBridge!.battleView as any).hud.borders;
        const r = marker.getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          marker: parseFloat(getComputedStyle(marker).width),
          star: parseFloat(getComputedStyle(star).width),
          hint: parseFloat(getComputedStyle(hint, ":before").width),
          markerBottom: r.bottom,
          labelTop: Math.min(
            ...[...marker.parentElement!.querySelectorAll(".rail-label")].map(
              (e) => e.getBoundingClientRect().top,
            ),
          ),
          cells: cells.length,
          circuits: border
            .filter((b: any) => b.element.classList.contains("instrument"))
            .map((b: any) => ({
              closed:
                JSON.stringify(b.points[0]) === JSON.stringify(b.points.at(-1)),
              points: b.points.length,
              total: b.total,
            })),
          textOverflow: cells.some((e) => e.scrollHeight > e.clientHeight + 2),
        };
      });
      await page.screenshot({
        path: `.local/qa/polish-level${level + 1}-${width}.png`,
        fullPage: width < 700,
      });
      layouts.push({ level: level + 1, width, height, ...result });
      expect(result.overflow).toBe(false);
      expect(result.marker).toBeLessThan(result.star);
      expect(result.marker).toBeGreaterThanOrEqual(18);
      expect(result.hint).toBe(12);
      expect(result.markerBottom).toBeLessThan(result.labelTop);
      expect(result.cells).toBe(level ? 8 : 6);
      expect(
        result.textOverflow,
        `level${level + 1} ${width} cell overflow`,
      ).toBe(false);
      expect(result.circuits).toHaveLength(2);
      for (const c of result.circuits) {
        expect(c.closed).toBe(true);
        expect(c.points).toBeGreaterThan(level ? 32 : 26);
      }
    }
    await dispatch(page, "card", { id: m.move.ids[0] });
    await expect(page.locator(".landing-marker")).toHaveCount(0);
  }
  expect(errors).toEqual([]);
  writeFileSync(
    ".local/qa/polish-layouts.json",
    JSON.stringify({ layouts, errors }, null, 2),
  );
});

test("one continuous music voice follows the sound switch and survives match reset", async ({
  page,
}) => {
  const musicResponse = await page.request.get(
    "/assets/music-relaxing-ambient.ogg",
  );
  expect(musicResponse.status()).toBe(200);
  expect(musicResponse.headers()["content-type"]).toContain("audio/ogg");
  await page.addInitScript(() => {
    const w = window as any;
    w.musicVoices = [];
    const connections = new WeakMap<AudioNode, AudioNode>();
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (destination: any, ...args: any[]) {
      const result = connect.apply(this, [destination, ...args] as any);
      if (destination instanceof AudioNode) connections.set(this, destination);
      return result;
    } as typeof connect;
    const start = AudioBufferSourceNode.prototype.start,
      stop = AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start = function (...args: any[]) {
      if (this.buffer && this.buffer.duration > 60)
        w.musicVoices.push({ node: this, loop: this.loop, stopped: false });
      return start.apply(this, args as any);
    };
    AudioBufferSourceNode.prototype.stop = function (...args: any[]) {
      for (const v of w.musicVoices) if (v.node === this) v.stopped = true;
      return stop.apply(this, args as any);
    };
    w.musicMix = () => {
      const source = w.musicVoices.find((v: any) => !v.stopped)?.node;
      if (!source?.buffer) return null;
      let node: AudioNode | undefined = source,
        gain = 1;
      const visited = new Set<AudioNode>();
      while (
        node &&
        node !== source.context.destination &&
        !visited.has(node)
      ) {
        visited.add(node);
        if (node instanceof GainNode) gain *= node.gain.value;
        node = connections.get(node);
      }
      const b: AudioBuffer = source.buffer;
      let sum = 0,
        opening = 0;
      for (let ch = 0; ch < b.numberOfChannels; ch++) {
        const data = b.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
          sum += data[i] ** 2;
          if (i < b.sampleRate * 2) opening += data[i] ** 2;
        }
      }
      return {
        context: source.context.state,
        routedToOutput: node === source.context.destination,
        duration: b.duration,
        gain,
        mixedRmsDb:
          20 *
          Math.log10(Math.sqrt(sum / (b.length * b.numberOfChannels)) * gain),
        openingRmsDb:
          20 *
          Math.log10(
            Math.sqrt(opening / (b.sampleRate * 2 * b.numberOfChannels)) * gain,
          ),
      };
    };
  });
  await page.route("**/api/**", (r) => r.fulfill({ status: 401, body: "{}" }));
  await page.goto("/");
  await page.locator("[data-action=module]").first().waitFor();
  await expect(page.locator("h1")).toContainText(`V${version}`);
  await page.locator("[data-action=help]").click();
  await expect(page.locator("dialog").first()).toContainText(
    `玩法 V${version}`,
  );
  await page.waitForFunction(
    () => (window as any).musicVoices.some((v: any) => v.loop && !v.stopped),
    undefined,
    { timeout: 20_000 },
  );
  await page.locator("dialog [data-action=close-modal]").first().click();
  const active = () =>
    page.evaluate(
      () => (window as any).musicVoices.filter((v: any) => !v.stopped).length,
    );
  expect(await active()).toBe(1);
  const mix = await page.evaluate(() => (window as any).musicMix());
  expect(mix.context).toBe("running");
  expect(mix.routedToOutput).toBe(true);
  // A playing voice alone missed the original very quiet (-42.6 dBFS) music.
  expect(mix.mixedRmsDb).toBeGreaterThan(-35);
  expect(mix.mixedRmsDb).toBeLessThan(-25);
  expect(mix.openingRmsDb).toBeGreaterThan(-36);
  expect(mix.duration).toBeCloseTo(94, 1);
  writeFileSync(".local/qa/music-mix.json", JSON.stringify(mix, null, 2));
  await page.locator("[data-action=sound]").click();
  expect(await active()).toBe(0);
  await page.locator("[data-action=sound]").click();
  await expect.poll(active).toBe(1);
  // Exercise the visibility handler without touching the user's real game tab.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(await active()).toBe(0);
  await page.evaluate(() => {
    delete (document as any).hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(active).toBe(1);
  await dispatch(page, "confirm-new", { level: 0 });
  await page.locator("[data-action=module]").first().waitFor();
  expect(await active()).toBe(1);
  await page.locator("[data-action=help]").click();
  await page.locator("dialog [data-action=close-modal]").first().click();
  expect(await active()).toBe(1);
});
