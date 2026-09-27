import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 240_000,
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: ".local/qa/browser-results.json" }],
  ],
  use: {
    baseURL: process.env.STAR_CHAIN_TEST_URL || "http://127.0.0.1:8792",
    channel: "chrome",
    headless: true,
    launchOptions: { args: ["--enable-unsafe-webgpu"] },
    viewport: { width: 1920, height: 1080 },
    trace: "retain-on-failure",
  },
  outputDir: ".local/qa/browser-artifacts",
});
