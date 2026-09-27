# 星链算式项目约定

- 新任务先确认实际 Git 根并读取 `.codex/memory/CURRENT_WORKING_STATE.json`，再绑定 Memorix；界面、模型、架构或开发分工任务同时读取 `docs/PROJECT_DIRECTION.md`。最新阶段是先稳定人机版本，再实现真人对战。
- Memorix 使用实际项目根，`agent=codex`、`agentType=codex`、`joinTeam=false`，每项任务先加载一次项目 brief。检索限 project scope，写入使用 project visibility 和稳定 topicKey；只读任务需用户明确要求才写记忆。
- 当前文件和实时验证高于记忆。Memorix 不可用时使用项目文件继续并说明限制；不绑定父目录、HOME 或其他项目，不记录凭据和原始玩家数据。
- 项目概况看 README；涉及部署、身份或部署交接时读取 CODEX_DESKTOP_TASK 的相关部分。历史任务说明不自动恢复旧授权；本约定仅用于当前项目。
- dist 顶层为源码，构建产物仅 dist/client、dist/server、dist/.openai。
- 保持现行稳定规则。部署任务未授权无限模块、星域轮换或机器人重调。
- scripts/dev.mjs 仅 loopback 固定开发身份，不能公网部署。
- 玩家记录、数据库、凭据和部署密钥不进入 Git/PR。
- 记录/身份迁移测试账号隔离、幂等、旧版重放、换账号队列。
- 每PR独立测试数据；未审查代码不得获得生产凭据。
- 基础检查 npm test / npm run build；数值改变再追加必要模拟。
- 不覆盖已应用迁移、不强推主分支、不添加未授权协作者。
- 明确本地、线上与待完成步骤；不得虚构仓库或部署成功。
