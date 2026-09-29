import test from "node:test";
import assert from "node:assert/strict";
import { checkManual, assertNewRelease } from "../scripts/check-manual.mjs";
import { manualHTML } from "../dist/manual.mjs";
import { rulesForLevel, warpLandings } from "../dist/engine.mjs";
test("version and reviewed manual stay in sync with rule sources", () => {
  const version = checkManual(),
    html = manualHTML({ shieldAllowance: 2 });
  assert.ok(html.includes(`玩法 V${version}`));
  assert.match(html, /第1–7级：18血/);
  assert.match(html, /第8级起：24血/);
  assert.match(html, /换来的牌立即可用/);
  assert.match(html, /可选 20 − 当前值，以及前后各一格/);
  assert.match(html, /两条星链都是 0 时/);
  assert.match(html, /两条都是 20 时/);
  assert.match(html, /两条都是 10 时/);
  assert.match(html, /所有对局触发全部达成/);
  assert.match(html, /允许回到起点/);
  assert.match(html, /每次出牌结算一次，不限使用次数/);
  assert.equal(rulesForLevel(0).hp, 18);
  assert.equal(rulesForLevel(7).hp, 24);
  assert.equal(rulesForLevel(0).repairSlots, 3);
  assert.equal(rulesForLevel(7).repairSlots, 4);
  assert.deepEqual(warpLandings(10), [9, 10, 11]);
});

test("production builds require a newer release number, not a repeated or lower version", () => {
  for (const next of ["1.1.1", "1.2.0", "2.0.0"])
    assert.doesNotThrow(() => assertNewRelease(next, "1.1.0"));
  for (const next of ["1.1.0", "1.0.9", "0.9.9", "1.2.0-preview"])
    assert.throws(() => assertNewRelease(next, "1.1.0"));
});
