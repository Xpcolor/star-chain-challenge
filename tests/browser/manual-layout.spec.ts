import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { RELEASE } from "../../dist/version.mjs";

test("manual remains readable, scrollable and closable on desktop and phone", async ({ page }) => {
  const errors: string[] = [];
  const layouts = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", route => route.fulfill({ status: 401, body: "{}" }));
  mkdirSync(".local/qa/manual", { recursive: true });
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1280, height: 720 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    const trigger = page.getByRole("button", { name: "玩法说明", exact: true });
    await trigger.click();
    const dialog = page.locator("#modal");
    await expect(dialog.getByRole("heading", { name: `星链对战 · 玩法 V${RELEASE.version}`, exact: true })).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "跃迁 J", exact: true })).toBeAttached();
    const bounds = await dialog.evaluate(element => {
      const box = element.getBoundingClientRect();
      const text = element.querySelector(".manual-content")!;
      return {
        width: box.width, left: box.left, right: box.right, top: box.top, bottom: box.bottom,
        overflow: element.scrollWidth - element.clientWidth,
        fontSize: parseFloat(getComputedStyle(text).fontSize),
        columns: getComputedStyle(element.querySelector(".manual-steps")!).gridTemplateColumns.split(" ").length,
      };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.bottom).toBeLessThanOrEqual(viewport.height + 1);
    expect(bounds.overflow).toBeLessThanOrEqual(1);
    expect(bounds.fontSize).toBeGreaterThanOrEqual(16);
    expect(bounds.columns).toBe(viewport.width > 900 ? 2 : 1);
    if (viewport.width >= 1280) expect(bounds.width).toBeGreaterThan(1100);
    await page.screenshot({ path: `.local/qa/manual/${viewport.width}-top.png` });
    await dialog.getByRole("heading", { name: "跃迁 J", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `.local/qa/manual/${viewport.width}-cards.png` });
    const back = dialog.getByRole("button", { name: "回到牌桌", exact: true });
    await back.scrollIntoViewIfNeeded();
    await expect(back).toBeVisible();
    const close = dialog.getByRole("button", { name: "关闭", exact: true });
    const closeBox = await close.boundingBox();
    expect(closeBox!.y).toBeGreaterThanOrEqual(bounds.top);
    expect(closeBox!.y + closeBox!.height).toBeLessThan(bounds.top + 150);
    await close.click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    layouts.push({ viewport, ...bounds });
  }
  expect(errors).toEqual([]);
  writeFileSync(`.local/qa/manual-v${RELEASE.version}.json`, JSON.stringify({ version: RELEASE.version, layouts, pageErrors: errors }, null, 2));
});
