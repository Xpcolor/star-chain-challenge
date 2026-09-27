import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
export function assertNewRelease(version, published) {
  const parse = value => {
    if (!/^\d+\.\d+\.\d+$/.test(value || "")) throw Error("正式版本须为主版本.次版本.修订号");
    return value.split(".").map(Number);
  };
  const next = parse(version), previous = parse(published);
  const changed = next.findIndex((part, i) => part !== previous[i]);
  if (changed < 0 || next[changed] < previous[changed])
    throw Error(`发布版本 ${version} 必须高于已发布的 ${published}；每次更新先递增版本号并核对玩法说明。`);
}
export function checkManual(root = ".") {
  const read = (p) => readFileSync(`${root}/${p}`, "utf8");
  const version = JSON.parse(read("package.json")).version;
  const review = JSON.parse(read("docs/manual-review.json"));
  if (review.version !== version)
    throw Error(
      "玩法说明尚未核对当前版本；请检查说明书并更新 docs/manual-review.json。",
    );
  for (const [path, sha] of Object.entries(review.sha256)) {
    const actual = createHash("sha256")
      .update(read(path).replace(/\r\n/g, "\n"))
      .digest("hex");
    if (actual !== sha)
      throw Error(
        `玩法/说明书变更尚未核对：${path}。请复核实际规则和说明后再更新回执。`,
      );
  }
  if (JSON.parse(read("wrangler.jsonc")).vars.RELEASE_VERSION !== version)
    throw Error("Worker 与游戏版本号不一致");
  const localVersion = read("dist/version.mjs");
  if (!localVersion.includes(`version:'${version}'`))
    throw Error("经典本地入口与游戏版本号不一致");
  if (process.env.DEPLOY_ENV === "production")
    assertNewRelease(version, JSON.parse(read("deployment-status.json")).releaseVersion);
  return version;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(`玩法说明与版本 V${checkManual()} 已核对`);
