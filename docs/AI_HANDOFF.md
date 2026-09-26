# 给后续 AI 的项目说明

先读 README、CODEX_DESKTOP_TASK、docs/ACCEPTANCE、docs/RECORDS_API 与相关源码。规则以版本化源码为准，历史平衡报告只适用于其注明版本。未批准的无限模块与轮换星域不能顺手合入。

## 本地开发

Node.js 24，npm ci，npm run dev；浏览器打开 http://127.0.0.1:8787 。本地固定开发玩家，数据库 .local/star-chain.sqlite 不提交 Git。

npm test / npm run build 是基础检查。仅玩法和数值变化需要按 BALANCE / SIXTEEN_LEVELS 文档追加必要配对模拟，记录种子、样本、策略和限制；界面文案修改无需全面重跑梯度。

## 当前记录入口

在已登录的同一游戏页面内：

```js
await window.starChainRecords.schema();
await window.starChainRecords.list({limit: 20});
await window.starChainRecords.get('返回的记录编号');
await window.starChainRecords.export();
```

独立部署后保留这些接口并更新登录说明。优先由用户导出 JSON 交给 AI，或使用授权只读接口；仓库可读不等于数据可读。不能将数据库公开、把 Token 写入 URL、提交真实记录到 PR。

分析按规则版本、代码提交、机器人参数、所选/实际等级、支援、先手、模块、星域分组。退出不算失败，支援胜利不归到原难度，thinkingMs 含动画和等待，不等于纯思考时间。游戏中不暴露未来牌序；结束记录可重放。每局使用开局参数快照，不在局中偷偷调难度。

## 提交

修改通过分支和 PR，说明具体问题、变更行为、验证、预览和试玩重点。维护者按任务授权决定合并；不直推未经批准的玩法，不覆盖已应用迁移，不强推主分支，不擅自添加协作者或改仓库公开范围。
