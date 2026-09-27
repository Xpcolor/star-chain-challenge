import { test, expect } from "@playwright/test";

async function boot(page: any) {
  await page.route("**/api/**", (r: any) =>
    r.fulfill({ status: 401, body: "{}" }),
  );
  await page.goto("/");
  await page.locator("[data-action=module]").first().waitFor();
}

// Read the digit actually inside each clipped reel, not its aria-label or all
// thirty offscreen digits. The old renderer said 5 to accessibility but drew 0.
async function visibleHp(page: any) {
  return page
    .locator(".ship-caption .odometer")
    .evaluateAll((meters: Element[]) =>
      meters.map((meter) =>
        [...meter.querySelectorAll(".number-reel")]
          .map((reel) => {
            const r = reel.getBoundingClientRect();
            return [...reel.querySelectorAll(".number-strip > span")]
              .filter((digit) => {
                const d = digit.getBoundingClientRect();
                return (
                  d.top < r.top + r.height / 2 &&
                  d.bottom > r.top + r.height / 2
                );
              })
              .map((digit) => digit.textContent)
              .join("");
          })
          .join(""),
      ),
    );
}

test("HP reels draw the actual value through digit-count changes, healing and zero", async ({
  page,
}) => {
  await boot(page);
  for (const [width, height] of [
    [2179, 1244],
    [1774, 887],
    [1280, 720],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    for (const value of [24, 11, 5, 6, 2, 0, 5, 10, 15, 9, 0]) {
      await page.evaluate((value) => {
        const snapshot = structuredClone(
          window.starChainClient!.getSnapshot()!,
        );
        snapshot.game.hp = [value, value];
        window.starChainBridge!.render(snapshot);
      }, value);
      // Check the resting digit; an incorrect reel can briefly pass the right
      // number while it is still moving toward the wrong final position.
      await page.waitForTimeout(700);
      await expect
        .poll(() => visibleHp(page), {
          timeout: 1800,
          message: `${width}px HP ${value}`,
        })
        .toEqual([String(value), String(value)]);
    }
  }
});

test("four attack entries appear in ascending damage order", async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    const snapshot = structuredClone(window.starChainClient!.getSnapshot()!);
    const [area, precise, linked] = snapshot.game.goals;
    snapshot.game.goals = [
      { ...area, damage: 1 },
      { ...precise, damage: 2 },
      { ...linked, damage: 3 },
      { ...area, id: "fixture-extra-area", damage: 1 },
    ];
    window.starChainBridge!.render(snapshot);
  });
  await expect(page.locator(".targets .inline-damage")).toHaveText([
    "伤害 1",
    "伤害 1",
    "伤害 2",
    "伤害 3",
  ]);
  await expect(page.locator(".targets .eyebrow")).toHaveText([
    "01 / 区域",
    "02 / 区域",
    "03 / 精准",
    "04 / 联动",
  ]);
});

test("warp destination buttons stay clear of the command deck", async ({
  page,
}) => {
  await boot(page);
  await page.evaluate(() => {
    const snapshot = structuredClone(window.starChainClient!.getSnapshot()!);
    snapshot.ui.opening = "";
    snapshot.ui.calibrate =
      '<div class="calibrate-row"><button class="btn quiet">校准</button><span class="section-note">剩余 1 次。先选牌和星链，落点离攻击目标差 1 格时才会亮。</span></div>';
    snapshot.ui.operations =
      '<div class="operation-panel" id="operation-region"><div class="expression">紫星链 <strong>4 → 17</strong></div><div class="op-group warp-picker" role="group" aria-label="跃迁落点"><button class="op-btn">落到 15</button><button class="op-btn">落到 16</button><button class="op-btn">落到 17</button></div><p class="section-note">可选 20 − 当前值，以及前后各一格；越界和原位除外，不计加法或减法。</p></div>';
    window.starChainBridge!.render(snapshot);
  });
  for (const [width, height] of [
    [2179, 1244],
    [1920, 1080],
    [1774, 887],
    [1280, 720],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    for (const button of await page.locator(".warp-picker button").all()) {
      await button.click({ trial: true, timeout: 1500 });
    }
    const separation = await page.evaluate(
      () =>
        document.querySelector(".command-deck")!.getBoundingClientRect().top -
        document.querySelector("#operation-region")!.getBoundingClientRect()
          .bottom,
    );
    expect(separation, `${width}px clearance`).toBeGreaterThanOrEqual(0);
  }
});
