import { spawn } from "node:child_process";
import { createServer } from "vite";
const api = spawn(process.execPath, ["scripts/dev.mjs"], {
  stdio: "inherit",
  env: { ...process.env, STAR_CHAIN_LOCAL_PORT: "8792" },
});
const server = await createServer();
await server.listen();
server.printUrls();
async function stop() {
  api.kill();
  await server.close();
  process.exit(0);
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
