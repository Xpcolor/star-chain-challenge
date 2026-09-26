# 独立部署与权限说明

## 目标结构

GitHub main 保存正式代码，功能分支通过 PR 提交。Cloudflare Worker 提供游戏和记录 API，D1 持久保存玩家记录。正式与每个 PR 的数据库分开。身份验证、数据库、发行版本关联；代码可见性与玩家数据权限独立。

当前 server/worker.mjs 依赖原平台可信请求头，构建的 D1 ID 是原平台接管用占位值，不能直接独立部署。必须先适配。

## 官方参考（核对日期：2026-09-26）

- Workers / GitHub：https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/
- 分支部署：https://developers.cloudflare.com/workers/ci-cd/builds/build-branches/
- 预览配置：https://developers.cloudflare.com/workers/previews/configuration/
- 预览资源隔离：https://developers.cloudflare.com/workers/previews/resources/
- D1 环境：https://developers.cloudflare.com/d1/configuration/environments/
- Access：https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- 邮箱验证码：https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
- JWT 验证：https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- GitHub 分支保护：https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule

官方文档目前注明：带 Static Assets 的 Worker 经过内部路由，不一定获得 ctx.access。不能只靠该字段实现本游戏身份验证，需实际验证 Access JWT 或采用明确支持的成熟方案。

## 配置检查

- 公开仓库仅维护者及其明确授权的工具有写权限；CODEOWNERS 不是权限控制。
- 主分支禁 force push / 删除，启用 PR 和真实 CI 检查，不使单人维护者因不能批准自己而锁死。
- 正式 D1 固定；PR N 指向不同的独立 D1，记录携带 preview 环境、PR编号和提交号。
- 预览版本 URL 不代表数据库隔离，必须核对绑定 ID 并迁移对应库。
- 不向未审查 PR 的构建暴露生产/部署凭据。不能让 fork workflow 获得生产权限。

## 后续修改流程

1. AI 从最新 main 建分支并明确验收条件。
2. 提交 PR，附测试结果及对应最新提交的预览网址。
3. 用户试玩，问题在同一 PR 继续修复。
4. 维护者确认后合并，自动更新固定正式网址。
5. 故障时恢复正常代码版本；数据库按备份和兼容迁移单独处理。

独立部署完成后，桌面 Codex 必须补上本项目已实测命令和真实地址，不能保留模板冒充完工。
