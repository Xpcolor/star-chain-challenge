# 星链算式 · 星舰对战

三条共享星链、六张手牌、明牌人机对战的中文浏览器游戏。

## 入口与当前状态

| 项目 | 当前状态 |
| --- | --- |
| 原站点 | https://xinglian-challenge.xutaoping.chatgpt.site |
| GitHub 仓库 | https://github.com/Xpcolor/star-chain-challenge （公开，仅 Xpcolor 可写） |
| 独立正式游戏 | https://star-chain-challenge.star-chain-challenge.workers.dev |
| 正式版本 | `1.0.0`，提交 `401312ef33ddae3016ed0c183994313c527dbce4` |
| 记录登录 | https://star-chain-challenge.star-chain-challenge.workers.dev/login 已出现 Access 登录；Worker 尚未写入身份配置，记录同步仍待验收 |
| 已合并预览 | PR #2：https://star-chain-pr-2.star-chain-challenge.workers.dev |
| 稳定源码基线 | `83a5badcb2121204c8bcf9bddcf9441be6b5f646` |

2026-09-26 已核对：正式页、样式、脚本和飞船图片返回 HTTPS 200；`/api/version` 与 `main` 一致；`/api/profile` 在未登录时返回 401。主分支禁止强推和删除，要求 `verify` 检查和 PR，审批人数为 0。GitHub Actions 的正式发布作业目前会跳过，因为还没有 `CLOUDFLARE_CI_ENABLED` 和部署 Token。旧站记录尚未迁移。

游戏规则和数值保持稳定基线，未加入尚未批准的实验玩法。

## 本地启动

需要 Node.js 24（测试使用 `node:sqlite`）、npm。无需先登录 GitHub 或 Cloudflare。

```powershell
npm ci
npm run dev
```

打开 http://127.0.0.1:8787 。此服务只绑定本机地址，使用固定开发玩家，记录写入 `.local/star-chain.sqlite`，重启后保留。不要把该开发服务映射到公网，也不要将开发身份用于云端。

```powershell
npm test
npm run build
```

`npm run verify` 依次运行测试和构建。实际验证结果见 [docs/VALIDATION.md](docs/VALIDATION.md)。

## 文件结构

| 路径 | 作用 |
| --- | --- |
| `dist/*.mjs` | 游戏、规则、机器人、任务、记录和界面源码；不能把整个 dist 删除 |
| `dist/assets/` | 全部游戏图片 |
| `server/worker.mjs` | 记录接口；独立部署前必须替换原平台身份验证边界 |
| `db/`、`drizzle/` | SQLite / D1 数据结构和追加式迁移 |
| `scripts/dev.mjs` | 本机服务，提供模拟身份与本地数据库 |
| `scripts/build.mjs` | 打包浏览器文件与 Worker，独立部署配置尚需续接 |
| `tests/` | 规则、界面状态、记录、API 和模拟测试 |
| `docs/` | 规则、接口、历史报告与部署交接说明 |
| `.github/` | CI、CODEOWNERS、PR 模板；主分支保护已在远端启用 |

## 交接说明

- [完整续接任务](CODEX_DESKTOP_TASK.md)
- [部署与权限要求](docs/DEPLOYMENT_HANDOFF.md)
- [验收项目](docs/ACCEPTANCE.md)
- [AI 读取记录和修改流程](docs/AI_HANDOFF.md)
- [当前记录接口](docs/RECORDS_API.md)
- [现行规则与实现说明](docs/TECHNICAL_BASELINE.md)

真实游玩记录、账号凭据、部署密钥和数据库文件不进入 Git。公开仓库不会自动赋予访问者写权限；CODEOWNERS 不能代替远端权限与分支保护。

`package.json` 的 `private: true` 仅禁止误发布 npm 包，不决定 GitHub 仓库的公开或私有。
