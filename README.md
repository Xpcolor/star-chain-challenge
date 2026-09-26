# 星链算式 · 星舰对战

三条共享星链、六张手牌、明牌人机对战的中文浏览器游戏。

## 入口与当前状态

| 项目 | 当前状态 |
| --- | --- |
| 当前已发布游戏 | https://xinglian-challenge.xutaoping.chatgpt.site |
| 拟建 GitHub 仓库 | `Xpcolor/star-chain-challenge`；本交接包生成时尚未创建 |
| 独立正式游戏网址 | 待桌面 Codex 部署后填写；原网址尚未完成迁移 |
| 当前记录入口 | 游戏右上角「记录与难度」，支持导出、重试同步 |
| 独立记录入口 / PR 预览 | 待部署实现与验收 |
| 稳定源码基线 | `83a5badcb2121204c8bcf9bddcf9441be6b5f646` |

**先读 [START_HERE.md](START_HERE.md)，再将 [CODEX_DESKTOP_TASK.md](CODEX_DESKTOP_TASK.md) 交给本机 Codex。**

本包包含完整游戏源码、全部飞船素材、历史平衡报告、自动测试，以及 Windows 可用的本地开发入口。云端账号验证未完成，所以本包是本地核验的交接包，不是已经部署好的独立云服务。游戏规则和数值保持稳定基线，未加入尚未批准的实验玩法。

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
| `.github/` | CI、CODEOWNERS、PR 模板；远端分支保护仍须实际设置 |

## 交接说明

- [完整续接任务](CODEX_DESKTOP_TASK.md)
- [部署与权限要求](docs/DEPLOYMENT_HANDOFF.md)
- [验收项目](docs/ACCEPTANCE.md)
- [AI 读取记录和修改流程](docs/AI_HANDOFF.md)
- [当前记录接口](docs/RECORDS_API.md)
- [现行规则与实现说明](docs/TECHNICAL_BASELINE.md)

真实游玩记录、账号凭据、部署密钥和数据库文件不进入 Git。公开仓库不会自动赋予访问者写权限；CODEOWNERS 不能代替远端权限与分支保护。

`package.json` 的 `private: true` 仅禁止误发布 npm 包，不决定 GitHub 仓库的公开或私有。
