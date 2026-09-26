# 给用户：如何交给桌面 Codex

1. 把 ZIP 解压到新目录，建议 `D:\ais\StarChain`。同名目录已有内容时使用新目录，不要覆盖。
2. 用桌面 Codex 打开包含 `package.json` 和本文的那个目录。
3. 复制下面整段作为新任务：

> 请完整阅读此目录的 CODEX_DESKTOP_TASK.md，并将它作为本次任务要求执行。这里是星链算式当前稳定版的完整源码。请使用本机 GitHub CLI 和 Cloudflare 官方工具，完成 Xpcolor 账号下公开仓库、固定正式游戏网址、按玩家保存的游玩记录、独立数据库的 PR 预览、分支保护、自动测试以及中文交接说明。需要登录时打开本机浏览器让我完成，不要向聊天索取密码、验证码或 Token。保留现行玩法；实验方案暂不加入。请执行到完成全部客观验收，再交付真实地址和验收结果，不要停在只给我操作教程。账号权限或平台限制阻塞时，先完成能完成的工作，明确剩下哪一步需要我操作。

## 已完成 / 待完成

已提取当前正式游戏完整源码、全部图片及测试，增加本地开发入口、GitHub CI、PR 模板和部署验收规格。实际本地验证见 docs/VALIDATION.md。

2026-09-26 续接结果：公开仓库、主分支保护和正式游戏网址已经存在，详见 README 与 deployment-status.json。记录登录页已转到 Cloudflare Access，但 Worker 还没有写入身份配置，旧站真实记录也还没迁移。

原站点：https://xinglian-challenge.xutaoping.chatgpt.site
正式站点：https://star-chain-challenge.star-chain-challenge.workers.dev

## 为什么交给桌面端

当前云端浏览器不能使用本机 Chrome 的登录会话。Google 短信验证通过后，GitHub 仍要求验证器、恢复码或通行密钥；云端浏览器不支持通行密钥。Cloudflare 持续停在安全验证。

桌面 Codex 可通过本机 `gh auth login --web`、`wrangler login` 的标准浏览器流程获得授权。不要复制 Chrome Cookie、密码或通行密钥。桌面 Codex 仍须先检查本机工具与登录状态，不能假定 gh 已安装或已授权。
