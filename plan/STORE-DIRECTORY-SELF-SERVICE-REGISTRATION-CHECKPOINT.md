# 门店目录与自助注册 — 实施检查点

**记录时间：** 2026-07-26 03:15 +08:00
**功能分支：** `feat/store-directory-self-registration`  
**开始基线：** `8c03ac9b6dc1637e21a4afb8f7e27c15f1fe1072`  
**功能合并 SHA：** `a9c5f9036ee18249477ee495eefeb905e8b2c085`  
**公开版本：** V5.7.8（Preview-only 变更不递增版本）  
**部署状态：** Preview 已部署并完成服务端验收；仍等待用户的完整交互验收。Staging/Production 未授权。

## 完成范围

- 受控全国目录、`@decathlon.com` OTP 自助注册、CHU13 platform-admin、角色提权、目标门店 admin 调店审批。
- D1/Supabase 前向迁移与旧成员关系收敛，含既有门店代码的稳定 id 保留。
- Worker 路由、原子状态机与条件化审计；Web 注册、初始化与治理界面；配置、CI 与事实源同步。
- Preview fingerprint 现覆盖 D1 migrations；旧直接建号接口被关闭，永久历史筛选同步替换为项目标准 `ProjectSelect`，满足 CI 的无原生 `<select>` 规则。

## 质量与合并证据

| 门禁 | 结果 |
| --- | --- |
| CodeGraph 前置 | 168 files / 1,868 nodes / 5,683 edges |
| CodeGraph 后置 | 176 files / 2,031 nodes / 6,237 edges |
| D1 顺序迁移演练 | 通过：`0001` → `0006`，含多门店历史和既有 `1299` 代码 |
| 数据库 / Worker / 全量 tests | 通过 |
| 全量 `pnpm typecheck` | 通过 |
| `pnpm build` / Worker bundle | 通过 |
| Preview fingerprint | 341 files；V5.7.8 不变 |
| 工作流策略 | 88 policies 通过 |
| CI 静态守卫 | 无原生 `<select>`；无旧示例身份 |
| `git diff --check` | 通过 |
| 功能 PR | #64，`verify` + `secrets` 通过（run `30170421228`） |
| 合并后 CI | SHA `a9c5f903…`，run `30170517906` 成功 |
| 管理检查点 PR | #65，CI `30170749738` 通过；合并 SHA `90c16c8a188f4db416a7436a7cecf00aee58122b` |
| 管理检查点后 CI | SHA `90c16c8…`，run `30170845072` 成功 |
| Preview 部署 | workflow `30171022977` 成功；Worker Version ID `a4f789da-8e59-4feb-a1c2-f5ab3e645242` |
| Preview 身份复核 | live / ready / meta / root / directory 均 HTTP 200，当前均为 V5.7.8 / SHA `90c16c8…` |
| CHU13 | 已手动初始化；D1 只读核验唯一 active platform-admin，角色 admin，所属 1299 五象店 |
| OTP 投递 | 受权测试 Profile `SAINT13` / 1299 的请求获 challenge；用户确认公司邮箱收到 OTP；未提交验证码，因此未创建测试账号/成员关系 |

## 安全与运行边界

- Preview 已配置最小权限、仅限 verified `work2die.asia` 的 Resend sending key、注册 HMAC secret、sender identity 与 CHU13 setup-token hash；原始值不写入仓库、项目文档、日志或检查点。
- `work2die.asia` 已验证为发送域；Preview OTP 投递已收到。
- 不执行 Staging 或 Production 迁移/部署。

## 下一步

1. 合并本 Preview 验收检查点 PR；
2. 用户以 CHU13 完成登录、目录维护、提权与调店审批的完整交互验收；
3. 另选尚未注册的真实公司邮箱时，才验证 OTP → completion → operator 建号完整链路；
4. 未获新的明确授权，不进入 Staging 或 Production。
