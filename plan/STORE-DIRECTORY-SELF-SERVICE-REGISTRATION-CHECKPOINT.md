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


## Profile 真实身份提示修正 — PR #67 与 Preview 证据

**记录时间：** 2026-07-26 04:16 +08:00
**功能分支：** `fix/registration-profile-guidance`
**功能提交：** `1a7949eb656789c3d4d976efbce38e9dddbd6818`
**检查点提交：** `d59c57244db3a2da1fea40866459170c6a8b3f87`
**PR / 合并 SHA：** [#67](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/pull/67) 已合并为 `9cf88c1555bd3a7e055ef8842926d778dcb18123`
**公开版本：** V5.7.8（Preview-only 文案修正不递增版本）
**部署状态：** Preview 已部署并完成独立服务端身份复核；Staging/Production 未授权、未执行。

### 完成范围

- Profile 输入框 placeholder 改为 `请输入真实 Profile`，移除昵称式示例 `例如：小王`。
- 增加持续可见的说明：Profile 必须与公司系统实际使用的身份一致；昵称或临时名称可能导致后续提权、门店转移等权限流程无法正常处理。
- 输入框通过 `aria-describedby` 关联说明；说明沿用现有 Endfield 注册表单可读文本样式。
- 新增 `tests/registration-profile-guidance.test.mjs`，锁定文案、可访问性关联、旧提示移除与样式约束。

### 验证与部署证据

| 门禁 | 结果 |
| --- | --- |
| CodeGraph 前置 | 176 files / 2,032 nodes / 6,276 edges |
| CodeGraph 后置 | 177 files / 2,038 nodes / 6,281 edges；影响仅 `RegistrationWizard` 与其 `App` 调用点 |
| 新增回归测试 | 2/2 通过 |
| 全量 `pnpm test` | 150/150 通过：domain 5、database 8、web 106、API 16、Worker 15 |
| `pnpm check:workflows` | 88 policies 通过 |
| 全量 `pnpm typecheck` | 通过 |
| `pnpm build` | 通过；Preview source 已登记，公开版本仍为 V5.7.8 |
| PR #67 CI | `verify`、`secrets` 均通过，workflow `30173034704` |
| Preview 部署 | workflow `30173143885` 成功；精确 release SHA `9cf88c…` |
| Cloudflare Worker | `bike-ops-preview` Worker Version `0cd1c215-15b9-43c1-9e4f-84e17d32c4b8`，Deployment `e2fd3337-c7dc-4e9c-9cb3-78a8f67f2118`，100% |
| 独立端点复核 | live、ready、meta/version、Web Shell、registration directory 均 HTTP 200；live / ready / meta 均为 V5.7.8 / SHA `9cf88c…`，meta environment `preview` |
| `git diff --check` | 通过 |
| CodeGraph 覆盖例外 | CSS 与 Markdown 无结构化节点；CSS 由新增源码回归测试覆盖，Markdown 检查点只记录已验证证据 |

### 人工验收与边界

- Browser Harness 当前不可用/禁止，未使用任何回退浏览器或无障碍自动化，因此不声称已完成页面视觉验收。
- 下一步仅为用户在 Preview 中确认 Profile 提示与说明在真实设备上的可见性和可理解性。
- 未获新的明确授权，不进入 Staging 或 Production。

## 安全与运行边界

- Preview 已配置最小权限、仅限 verified `work2die.asia` 的 Resend sending key、注册 HMAC secret、sender identity 与 CHU13 setup-token hash；原始值不写入仓库、项目文档、日志或检查点。
- `work2die.asia` 已验证为发送域；Preview OTP 投递已收到。
- 不执行 Staging 或 Production 迁移/部署。

## 下一步

1. 合并本 Preview 验收检查点 PR；
2. 用户以 CHU13 完成登录、目录维护、提权与调店审批的完整交互验收；
3. 另选尚未注册的真实公司邮箱时，才验证 OTP → completion → operator 建号完整链路；
4. 未获新的明确授权，不进入 Staging 或 Production。

## Preview 提权与调店测试账号（2026-07-27 03:44 +08:00）

- 用户明确授权仅在 Preview D1 创建两个已激活 operator 测试账号，用于角色提权与门店转移验收；Staging/Production 未触碰。
- 创建方式严格复用已部署的正式 OTP → verify → complete 注册链路，由 Worker 使用 Preview Secret 生成 PBKDF2-SHA256（100,000 iterations）密码哈希并原子写入用户、门店成员关系、Session 与永久账号审计；未读取或暴露 `PASSWORD_PEPPER`，未临时替换 Worker，未直接写入明文密码。
- 测试身份：
  - Profile `preview1670test`，显示名 `Preview 1670 测试员`，user id `b1f9749e-193c-43fd-a819-a09bd45757ef`，归属 1670 民族东店，角色 operator。
  - Profile `preview0994test`，显示名 `Preview 994 测试员`，user id `481f5566-fa61-41c0-a845-f0dcb0eea84a`，归属 994 穿山店，角色 operator。
- 两个合成 `@decathlon.com` 测试邮箱均不存在，因此 Resend 最终状态为 bounced；只用于生成注册 challenge，不对应真实员工邮箱。OTP、completion token 与 Session token 均未写入本检查点。
- 两次注册均返回 HTTP 201；两次使用用户指定密码的真实登录均返回 HTTP 200，并确认 `mustChangePassword=false`、`isPlatformAdmin=false`、正确门店与 operator 角色。
- Preview D1 独立只读复核：两个用户均 `status=active`、成员关系 `status=active`、密码方案 `pbkdf2-sha256-100000`、各 1 条 `self-register` 永久审计；待处理角色申请与调店申请均为 0。
- 创建与登录验收产生的 4 个测试 Session 已按两个 Profile 精确撤销；最终两个账号的有效 Session 均为 0，用户首次手工登录会获得全新 Session。
- 账号密码仅在当前对话中返回给用户，不写入仓库、检查点、session-state、日记或长期记忆。
- 建议验收顺序：先由 `preview0994test` 申请 admin 并由 CHU13 批准；重新登录后作为 994 目标门店 admin。再由 `preview1670test` 申请从 1670 调往 994，由 994 admin 批准；验收调店后角色重置为 operator。也可交换两账号方向重复验证。
- 本检查点仅修改 Markdown。CodeGraph 当前不解析 Markdown 符号，前后图统计应保持不变；格式例外由 Git diff、Preview API 登录结果和 D1 查询交叉验证。
