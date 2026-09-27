import { defineConfig } from "vite";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
const localProxy = {
  target: "http://127.0.0.1:8792",
  changeOrigin: true,
  configure(proxy: any) {
    proxy.on("proxyReq", (request: any, incoming: any) => {
      if (
        ["http://127.0.0.1:8793", "http://localhost:8793"].includes(
          incoming.headers.origin,
        )
      )
        request.setHeader("Origin", "http://127.0.0.1:8792");
    });
  },
};
export default defineConfig({
  publicDir: false,
  server: {
    host: "127.0.0.1",
    port: 8793,
    strictPort: true,
    proxy: { "/api": localProxy, "/login": localProxy },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
    target: "es2022",
    chunkSizeWarningLimit: 1800,
  },
  plugins: [
    {
      name: "release-metadata",
      load(id) {
        if (
          id.replaceAll("\\", "/").endsWith("/dist/version.mjs") &&
          process.env.STARCHAIN_BUILD_RELEASE
        )
          return `export const RELEASE=Object.freeze(${process.env.STARCHAIN_BUILD_RELEASE});`;
      },
    },
    {
      name: "local-game-assets",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const path = (req.url || "").split("?")[0];
          if (!/^\/assets\/[a-zA-Z0-9_.-]+\.(glb|png|hdr|wav|json)$/.test(path))
            return next();
          try {
            const data = await readFile(resolve("dist" + path));
            res.setHeader(
              "Content-Type",
              path.endsWith(".png")
                ? "image/png"
                : path.endsWith(".json")
                  ? "application/json"
                  : "application/octet-stream",
            );
            res.end(data);
          } catch {
            next();
          }
        });
      },
    },
  ],
});
