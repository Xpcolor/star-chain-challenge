# 星链算式 · 星舰对战

2026-09-29 **V1.1.11 已发布**：PR [#15](https://github.com/Xpcolor/star-chain-challenge/pull/15) 经CI通过后合并，提交 `1e6ea75584eb9281226c20733aaee29260142fdb` 已上线 novaw.net 与 www.novaw.net。本次紧急缺陷修复：（1）**修复 Cockpit 组件中 React Hook 条件调用顺序**：彻底消除早先因 `useEffect` 置于早退后引起的 Minified React Error #310，恢复组件树正常挂载；（2）**修复飞船中央对撞与对战卡死**：组件树恢复后正常挂载 `#hero-anchor` 与 `#enemy-anchor` 锚点，Three.js 战场获取精准两翼站位坐标，彻底消除双方飞船向屏幕正中央 (0,0,0) 对撞重叠与界面无法操作问题；（3）**样式稳定性与排版兜底**：校准按钮去除导致自动化测试抖动的 scale 缩放改为光晕脉冲，窄屏下隐藏飞船血条避免横向微溢出。94项测试、18项端到端浏览器场景及线上双域名生产验收全部通过。回执见 `deployment-status.json`。

2026-09-29 **V1.1.10 已发布**：PR [#13](https://github.com/Xpcolor/star-chain-challenge/pull/13) 经CI通过后合并，提交 `64139d764c3e6004c0427f4e87722d9342cef9d3` 已上线 novaw.net 与 www.novaw.net。本次优化重点：（1）**PC指挥官专属快捷操控**：新增数字键 1~6 选卡、Q/W/E 选星链轨、+/- 切换加减运算、Space/Enter 蓄能执行、C键校准、R键休整补牌，全卡牌与轨道增设键帽徽标提示、3D透视悬浮与卡牌品阶全息光晕；（2）**结算窗免滚动双栏排版**：对战结算弹窗重构为960px双栏桌面画卷，左侧首屏直达胜负舰体徽章、结算原因与“再来一局/挑战下一级”核心按钮，彻底告别向下拖拽滚动；（3）**跃迁规则极简重构**：跃迁牌落地规则直接简化为 `20 - 当前值`（0↔20，10在起点时直接落地10，自然触发二十星门与十号港口）。94项测试、构建与线上双域名验收全部通过。回执见 `deployment-status.json`。

2026-09-29 **V1.1.9 已发布**：PR [#11](https://github.com/Xpcolor/star-chain-challenge/pull/11) 经CI通过后合并，提交 `62a4d95f047d73fa5646aed9d6197f49777f16b8` 已上线 novaw.net 与 www.novaw.net。针对用户提出的“背景星星过多、引起视觉疲劳”反馈，重新设计并替换为纯净、极简、低噪的黑曜石深空背景，减少噪点与密集恒星，保留柔和冷光星云与微弧度地平线，大幅降低眼部疲劳并突显对战卡牌与刻度轨道。94项测试、类型检查与构建通过，双域名版本一致且页面零脚本错误。生产D1无变更。回执见 `deployment-status.json`。

2026-09-29 **V1.1.8 已发布**：PR [#9](https://github.com/Xpcolor/star-chain-challenge/pull/9) 经CI通过后合并，提交 `5a45245d1923f74829a94895d42b7a3712cae06e` 已上线 novaw.net 与 www.novaw.net。采用全新16:9高清深空背景，调优Three.js材质纯白映射提升全景对比度与清晰度；数轴引入0/5/10/15/20主次刻度分级与动态跳跃轨迹抛物线（Jump Arc）；攻击目标增加E区域、P精准、L联动专属几何图标徽标，消除撞色；校准增加磁吸金色目标落点光圈与按钮高亮动效；飞船生命下方增加双层能量血条与受击残影消退反馈（Damage Ghosting）。94项测试、类型检查、构建及真实浏览器回归全部通过，双域名版本一致、页面零脚本错误。生产D1无变更。回执见 `deployment-status.json`。

2026-09-27 **V1.1.7 已发布**：PR [#7](https://github.com/Xpcolor/star-chain-challenge/pull/7) 经CI通过后合并，提交 `643ddc0d9d1659b7810c7adb254ab216bf0593f3` 已上线 novaw.net 与 www.novaw.net。玩法说明扩为最大1380px，正文17px/手机16px，分区与功能牌色卡便于阅读，固定关闭按钮；同时包含此前确认的 V1.1.1–V1.1.6 修正。94项测试、类型、构建通过；18个浏览器场景分次通过，四项补给排版缺陷修复后相关复验通过。两个域名版本一致、模型就绪、音乐资源200、说明书无横向溢出、页面零脚本错误，访客记录API仍401。生产D1无变更。线上证据见 `docs/qa/release-v1.1.7-20260927.json` 和 `deployment-status.json`。

以下是历史开发与发布记录，旧版等待确认语句不代表当前状态。

上一版发布：PR [#5](https://github.com/Xpcolor/star-chain-challenge/pull/5) 已通过 CI 并合并，版本 1.1.0、提交 `1acf617fb19794b0cd1a0e24928e41dfdb2b4ab9` 已部署到 novaw.net 和 www.novaw.net。两个域名均验证真实 WebGPU 模型、V3 规则、静态入口内容与提交一致、页面零报错；访客记录接口返回 401。生产数据库保持不变，无新增生产迁移。回执见 `docs/qa/release-20260927.json`、`deployment-status.json`。真实账号同步和旧记录迁移仍未重新验收。

三条共享星链、六张手牌、明牌人机对战的中文浏览器游戏。

## 当前版本

本次升级为完整可玩的人机驾驶舱：React 界面、统一 Three.js WebGPU / WebGL 2 战场、GSAP 动效和 Howler 音频。玩家的近看、转向与独立侧光可在下方舰队区开启。敌方按十六个等级使用不同模型，不提供近看操作。

当前 V4 规则：第 1–7 级双方 18 血、攻击和维修各 3 项；第 8–16 级固定 24 血、各 4 项，并加入定轨和调拨。调拨后可立即出牌，跃迁可选择反射值及相邻格，攻击触发全部达成目标。加速允许返回原位，按最终局面结算一次，不额外限制次数；旧战绩继续按各自规则回放。规则、模拟结果与限制见 [V3 验证](docs/RULES_V3_VERIFICATION_20260927.md)。用户于 2026-09-27 明确批准将试玩版通过 PR 发布到 novaw.net；实际发布提交与回执以 deployment-status.json 为准。

- 正式游戏：https://novaw.net （https://www.novaw.net 同步）
- 仓库：https://github.com/Xpcolor/star-chain-challenge
- 实际线上版本与提交： https://novaw.net/api/version
- 本轮架构和验证说明：[docs/PVE_ARCHITECTURE.md](docs/PVE_ARCHITECTURE.md)
- 真人房间后续实现。当前对局接口已可替换，本地人机规则与表现层分离。

## 本地启动

需要 Node.js 24.3+、npm；浏览器测试需要 Chrome。

```powershell
npm ci
npm run dev
```

打开 http://127.0.0.1:8793 。Vite 提供驾驶舱，8792 的本机 API 使用固定开发身份，数据在 `.local/star-chain.sqlite`。不要公开这两个开发服务。旧界面可通过 `npm run dev:classic` 在 8787 对照。

```powershell
npm run verify
npm run test:browser
```

浏览器测试默认访问 8792 的生产构建。先 `npm run build`，然后在另一个 PowerShell 窗口运行：

```powershell
$env:STAR_CHAIN_LOCAL_PORT='8792'
$env:STAR_CHAIN_BUILT='1'
$env:STAR_CHAIN_LOCAL_DATA='.local/browser-test'
node scripts/dev.mjs
```

## 文件结构

| 路径 | 作用 |
| --- | --- |
| `src/ui/` | React 驾驶舱、稳定卡牌组件和 CSS |
| `src/application/`、`src/contracts.ts` | 本地对局适配器、版本化指令与快照契约 |
| `src/presentation/` | 统一三维战场、TSL 后处理、GSAP 编排、Howler 声音和 HUD 电弧 |
| `dist/*.mjs` | 保留的规则、机器人、回放、记录和兼容控制器源码；不可删除整个 dist |
| `dist/assets/` | 运行资产；`fleet-models.json` 固定模型版本、SHA 和分件数量 |
| `资产库/` | 转换原图、来源与模型接入说明 |
| `server/worker.mjs` | Cloudflare Access 认证和按用户隔离的记录接口 |
| `db/`、`drizzle/` | SQLite / D1 结构和追加式迁移 |
| `scripts/` | 本机 API、Vite 构建、Blender 分件、部署 |
| `dist/client/`、`dist/server/` | 生成目录，不进 Git |
| `tests/` | 规则、API、回放、架构资产和浏览器回归 |

## 交接说明

- [完整续接任务](CODEX_DESKTOP_TASK.md)
- [部署与权限要求](docs/DEPLOYMENT_HANDOFF.md)
- [验收项目](docs/ACCEPTANCE.md)
- [AI 读取记录和修改流程](docs/AI_HANDOFF.md)
- [当前记录接口](docs/RECORDS_API.md)
- [现行规则与实现说明](docs/TECHNICAL_BASELINE.md)

真实游玩记录、账号凭据、部署密钥和数据库文件不进入 Git。公开仓库不会自动赋予访问者写权限；CODEOWNERS 不能代替远端权限与分支保护。

`package.json` 的 `private: true` 仅禁止误发布 npm 包，不决定 GitHub 仓库的公开或私有。
