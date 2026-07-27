# V5.7.8 Preview-only：维修完成状态与取车规则修复

更新时间：2026-07-27 22:26 +08:00  
状态：已授权，启动检查点  
目标分支：`feature/cloudflare-workers-d1`  
隔离分支：`fix/repair-completion-pickup-status-v578`  
基线：`e6eb93addba06f0d4e6fc27c5db2ae8abd400815`

## 授权与发布边界

- 允许：修复代码、补齐回归测试、普通 push / PR / CI / merge、部署 Preview 并验证。
- 版本：公开版本保持 **V5.7.8**；Preview-only 改动不变更版本号。
- 禁止：Staging、Production、任何生产发布或生产数据写入。
- 浏览器：不调用应用内 `browser_*`，不调用 Android 无障碍；本任务以自动化测试和公开 Preview 端点验证为准。

## 已确认业务规则

### 点击“维修完毕”

仅允许以下五种当前状态完成，并一一映射：

| 完成前状态 | 完成后状态 |
| --- | --- |
| `已开付款单` | `维修完成-已开付款单` |
| `已开维修单` | `维修完成-已开维修单` |
| `已开质保维修单` | `维修完成-已开质保维修单` |
| `已开质保付款单-请过机` | `维修完成-已开质保付款单-请过机` |
| `快速服务免费` | `维修完成-快速服务免费` |

- 完成后进入待取车界面。
- 当前状态不属于上述五项时，阻止“维修完毕”，提示先选择对应开单状态。
- 门店产品维修既有“原地完成留档”流程不在本次用户报告范围内，修复时必须保持既有行为和回归覆盖。

### 完成后编辑

- 待取车中的维修完成记录允许直接编辑车辆、联系方式、维修类型、维修项目和取车时间。
- 状态只允许在五个 `维修完成-*` 状态之间人工切换。
- 不允许通过编辑表单回到未完成状态；回退必须使用操作记录撤回。
- “已开付款单”等状态仅作取车提醒，不因其它字段变化自动作废、重算或同步票据。

### 操作记录撤回

- 撤回“维修完毕”后恢复完成前的精确原状态。
- 记录从待取车返回维修界面。
- 车辆、联系方式、维修项目、取车时间等数据保留。

### 确认取车

| 完成状态 | 规则 |
| --- | --- |
| `维修完成-已开付款单` | 允许直接取车 |
| `维修完成-已开维修单` | 阻止；提示先变更为 `维修完成-已开付款单` |
| `维修完成-已开质保维修单` | 阻止；提示先变更为 `维修完成-已开质保付款单-请过机` |
| `维修完成-已开质保付款单-请过机` | 允许；取车前弹出“请确保顾客已过机核验”，仅确认提醒，不阻止 |
| `维修完成-快速服务免费` | 允许直接取车 |

## 变更前 CodeGraph 门禁

- 本地 CodeGraph：从 `~/tools/codegraph-v1.5.0` 源码构建的 **1.5.0**。
- 工具源码 SHA：`ea72e1b190921232aa7bd02e96bef5bbe4fe0ab6`。
- Android/Termux 的标准 shebang 无法直接执行 `/usr/bin/env node`，因此使用当前 Termux Node 显式执行同一 TypeScript 编译入口；未修改 CodeGraph 源码。
- 项目完整索引：181 files / 2,138 nodes / 7,267 edges；状态 current，SQLite WAL。
- 重点影响链：Web 状态/编辑/取车、共享 Domain、Contracts、API/Worker 完成与撤回、D1 状态约束及对应测试。

## 初步根因

1. “维修完毕”把所有顾客维修统一写成 `维修完成`，丢失开单提醒语义。
2. 浏览器校验将 `维修完成` 当作非免费维修可取车状态，与开单提醒规则冲突。
3. 共享 Domain 和编辑器仍只接受旧未完成状态；完成记录再次保存时被拒绝。
4. Worker 为规避 D1 旧 CHECK，不把 repair detail 写成完成状态，造成主记录与详情状态分裂。
5. 缺少五种映射、完成后编辑、取车阻止/提醒和精确撤回的完整回归测试。

## 实施队列

1. 建立统一的未完成/已完成状态常量、双向映射与取车决策函数。
2. 新增 D1 迁移，安全扩展 `repair_status` CHECK；同步其它持久层约束。
3. 同步 Web、Domain、Contracts、API、Worker 完成/编辑/取车行为。
4. 增加非阻断“请确保顾客已过机核验”确认交互。
5. 补 Domain、Web、Worker/API、迁移和撤回回归测试。
6. CodeGraph 后置门禁、全量测试/typecheck/build/workflow/离线安装/差异检查。
7. 普通 push、PR、CI、正常 merge；随后仅部署 Preview 并验证。

## 当前状态

- 项目业务代码尚未修改。
- 未 push、未建 PR、未部署、未写远端 D1。
- 下一步：提交本启动检查点，然后实施统一状态模型。

## 2026-07-27 23:xx — 实现与本地验收完成

### 已完成实现

- Web 与共享 Domain 建立一致的维修状态模型：
  - 五种完成前状态；
  - 五种 `维修完成-*` 状态；
  - 精确双向语义映射；
  - 1/4/5 放行、2/3 阻止的取车决策；
  - 质保付款状态返回非阻断“请确保顾客已过机核验”提醒。
- 点击“维修完毕”时，Web 预判、Worker 和 Postgres API 均使用同一映射规则；不属于五种开单状态时拒绝完成。
- Worker/API 同时更新 `work_items.status` 与 `repair_details.repair_status`，移除旧 D1 兼容绕路，避免主记录与详情状态分裂。
- 待取中的维修完成记录可直接编辑；前端仅显示五个完成状态，服务端也拒绝通过编辑跨回未完成状态。
- 操作记录撤回复用完整 before 快照，已由真实 D1 路由测试验证：恢复精确原状态、维修场景和原始字段，并删除完成时创建的 pickup detail。
- 新增 D1 `0007_repair_completion_statuses.sql` 和 Supabase `202607270001_repair_completion_statuses.sql`：
  - 扩展维修状态约束；
  - 将旧 `维修完成` / `已开质保单` 数据保守迁移；
  - 同步主记录与维修详情；
  - 不修改任何已应用迁移历史。
- 旧版 v5 本机数据导入同样规范为新完成状态，避免旧数据重新导入后复发。
- UI 增加质保付款取车确认弹窗；仅提醒过机核验，不阻止继续取车。
- Preview-only 版本政策保持：公开版本仍为 **V5.7.8**，未修改更新公告或正式版本号。

### CodeGraph 后置门禁

- 本地源码构建 CodeGraph 1.5.0。
- 后置同步：183 files / 2,199 nodes / 7,490 edges，SQLite WAL，状态 current。
- 共同步 28 个代码文件：新增 2、修改 26、476 nodes。
- `affected` 返回 17 个受影响测试文件；全量回归已覆盖其相关测试组。
- SQL、Markdown 与 JSON 不产生 CodeGraph 符号；迁移和项目文档通过数据库执行测试、静态断言、状态 parity 和人工 diff 独立覆盖，未静默跳过。

### 本地验收

- 全量仓库回归：**174/174**
  - Domain：7/7
  - Database：10/10
  - Web：108/108
  - API：21/21
  - Worker：28/28
- Worker 真实 D1 路由覆盖：
  - 五种完成映射；
  - 未开单完成阻止；
  - 完成后编辑与状态集合限制；
  - 1/4/5 取车放行；
  - 2/3 取车阻止及目标状态提示；
  - 操作记录撤回精确恢复。
- D1 迁移执行测试：旧待取维修记录按付费、质保、免费与未知付费语义保守迁移；`foreign_key_check` 为 0。
- 完整 TypeScript typecheck：通过。
- 工作流治理：88/88 policies。
- API build：通过。
- Worker 普通与 minified bundle：通过。
- Web Vite build：通过（专项构建阶段）。
- 冻结离线安装：通过，lockfile 无变化。
- Web/Domain 状态集合与映射 parity：通过。
- `git diff --check`：通过。

### 尚未执行

- 尚未普通 push、创建 PR、运行 GitHub CI、合并或部署 Preview。
- 尚未对远端 Preview D1 应用 `0007`；只有获授权的 Preview 工作流会执行。
- Staging/Production 均未触碰。

## 2026-07-27 23:27 +08:00 — Preview 源码指纹与发布前门禁

- 干净实现提交固定为 `d282a972dd364c6f736f1c4a808d016bbf7b9104`；登记前 tracked/untracked 工作树均为空。
- 本地源码构建 CodeGraph 1.5.0（工具源码 `ea72e1b190921232aa7bd02e96bef5bbe4fe0ab6`）前置复核：183 files / 2,199 nodes / 7,490 edges，SQLite WAL，索引 current。
- `pnpm version:preview` 已在该精确实现提交上登记 350 个版本化源码文件：fingerprint `59e6543dab45b5b5fda4c57af598d17bfc29efa042121e5f7922d33e4accfbcf`；`preview-manifest.json` 仍按项目规则由 Git 忽略，不进入提交。
- root `package.json`、Web `package.json` 与 `APP_VERSION` 均保持 **5.7.8**；更新公告与正式版本文件未改动。
- 标准版本门禁通过：`VERSION OK · V5.7.8 · 5 项更新 · 350 files · preview`。
- 完整版本化 `pnpm build` 通过：Web、Contracts、Database、API 全部成功；Web 产物为 `index-BHqbXYMd.css` 与 `index-CC_QFcwx.js`；生成身份为 V5.7.8 / `d282a972dd364c6f736f1c4a808d016bbf7b9104`。
- Production 反向门禁按预期以退出码 1 拒绝：Preview 源码登记不能用于 Production，且缺少 `formal-release.json`。这证明当前提交不是 Production 候选。
- 本阶段只完成本地 Preview 源码登记、最终版本门禁与发布前检查点；未 push、未建 PR、未部署、未写远端 D1，Staging/Production 均未触碰。
- 下一步队列：CodeGraph 后置门禁 → 提交本检查点 → 普通 push / PR / CI / merge → 仅在合并实现 SHA 上部署 Preview 并验证 `0007` 迁移、身份端点和目标业务回归。任何 Production 操作仍需用户人工验收 Preview 后另行明确授权。

## 2026-07-27 23:38 +08:00 — 抗中断冻结恢复点

- 用户明确要求在任何远端动作前先执行抗中断协议。
- 冻结前事实基线：
  - 启动检查点：`9040958a17c70dbcc450ed45e659c89b71fe1ca0`；
  - 功能实现与本地验收：`d282a972dd364c6f736f1c4a808d016bbf7b9104`；
  - Preview 发布门禁检查点：`0dc7005f9ce240a58d43b71d74a60fce9e8f11c1`。
- 分支 `fix/repair-completion-pickup-status-v578` 在最后一次已知远端状态上 ahead 3 / behind 0；冻结时工作树干净。
- 验收事实保持：174/174、完整 typecheck、88 workflow policies、API/Web/Worker builds、Worker bundles、冻结离线安装、diff checks 均通过。
- CodeGraph 在冻结前按强制规则重新从本地源码构建 1.5.0 并复核：183 files / 2,199 nodes / 7,490 edges，SQLite WAL，索引 current。
- Preview 源码指纹保持 350 files / `59e6543dab45b5b5fda4c57af598d17bfc29efa042121e5f7922d33e4accfbcf`；公开版本仍为 V5.7.8；Production 门禁继续按设计拒绝。
- 恢复事实源：
  1. 本文件；
  2. `~/session-state.md`；
  3. `~/journal/2026-07-27.md`；
  4. 长期记忆中的 Workshop release/project facts。
- 恢复顺序固定：先重新构建/检查本地 CodeGraph → 检查工作树与三个既有 SHA → 仅刷新一次远端目标分支 → 若仍为线性后继则普通 push / PR / CI / merge → 仅在合并后的目标分支 SHA 上执行 Preview 工作流与 `0007` 远端 D1 迁移。
- 禁止项不变：force push、历史改写、Staging、Production、正式版本号变化、未经验收的 Production 候选。
- 冻结时没有发生 push、PR、CI、merge、Preview deployment、remote D1 write、Staging 或 Production 动作。

## 2026-07-27 23:46 +08:00 — 冻结后远端目标复核通过

- 用户明确授权继续完整的普通交付流程：push、PR、CI、正常合并与 Preview-only 部署；公开版本继续为 V5.7.8，Staging/Production 仍禁止。
- 按冻结恢复顺序仅刷新一次远端目标分支：`origin/feature/cloudflare-workers-d1` 仍为 `e6eb93addba06f0d4e6fc27c5db2ae8abd400815`。
- 本地冻结 HEAD 为 `3e9b9c6ee6baa42a3ca7b6de9ca61028cca8b2f3`；相对远端目标 ahead 4 / behind 0，merge-base 等于远端目标 HEAD，确认无漂移、无需 rebase/merge 或历史改写。
- 本检查点前重新从本地源码构建 CodeGraph 1.5.0（工具源码 `ea72e1b190921232aa7bd02e96bef5bbe4fe0ab6`）；状态保持 183 files / 2,199 nodes / 7,490 edges，SQLite WAL，索引 current。
- 此处只记录恢复复核证据；尚未 push、创建 PR、触发 CI、合并、部署 Preview 或写远端 D1。
- 下一步：提交本 Markdown 检查点后普通 push；PR 必须等待全部 CI 通过后正常合并；随后只在目标分支精确合并 SHA 上触发 Preview 工作流并验证 `0007`、身份与公开健康端点。

## 2026-07-27 23:51 +08:00 — 修复分支普通推送完成

- 仓库实际版本门禁 `pnpm check:version` 通过：`VERSION OK · V5.7.8 · 5 项更新 · 350 files · preview`。
- 通过普通 push 创建远端分支 `fix/repair-completion-pickup-status-v578`；首次远端头精确验证为 `5d04a3274bcab68d6b396b88ce414b9d600b87e8`。
- 未使用 force push，未修改目标分支，未创建 PR、触发部署或写入远端 D1。
- 本证据检查点仅修改 Markdown；CodeGraph 前置状态为 183 files / 2,199 nodes / 7,490 edges、current，Markdown 无结构化符号的覆盖例外继续显式记录。
- 下一步：提交并普通推送本检查点，创建目标为 `feature/cloudflare-workers-d1` 的 PR，等待全部 CI 通过后正常合并。

## 2026-07-27 23:52 +08:00 — PR #72 已创建，等待最终 HEAD CI

- 已创建 PR [#72](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/pull/72)：`fix(repair): preserve completion billing status for pickup`，目标 `feature/cloudflare-workers-d1`。
- PR 初始 head 为 `9005cd91012ed8f4cb7b83951296465ededf6abd`，base 为 `e6eb93addba06f0d4e6fc27c5db2ae8abd400815`；交付说明明确公开版本保持 V5.7.8，合并后只允许 Preview，禁止 Staging/Production。
- 初始 GitHub Actions run `30282041240` 已启动 `verify` 与 `secrets`；本检查点推送后应以新的最终 PR head 及其对应 CI 结果作为合并门禁，不能使用旧 head 的检查结果代替。
- 本检查点仅修改 Markdown；CodeGraph 前置保持 183 files / 2,199 nodes / 7,490 edges、current。下一步是后置同步、提交、普通推送，然后等待最终 head 的全部 CI 通过。

## 2026-07-28 00:01 +08:00 — PR #72 PostgreSQL 16 迁移失败已最小修正

- PR 最终 head `2d4537ba8aae0667236f6c3ddba137bc2cb8c3e1` 的 Actions run `30282150098` 中，`secrets` 通过，`verify` 在 PostgreSQL 16 迁移执行阶段失败；合并、Preview 部署与远端 D1 写入随即阻断，未绕过门禁。
- 失败为 PostgreSQL `42P01`：`UPDATE bike_ops.repair_details r ... FROM` 中，`pickup_details` 的 JOIN `ON` 子句非法引用了更新目标别名 `r`。
- 最小修正：将 JOIN 改为 `p.work_item_id = w.id`，并继续用 `where w.id = r.work_item_id` 将 `work_items` 与更新目标行关联；业务迁移规则、D1 迁移和状态映射均未改变。
- 数据库迁移静态测试新增两项防回归约束：必须出现 PostgreSQL 合法 JOIN 形态，且不得再次出现 `p.work_item_id = r.work_item_id` 的非法形态。
- 本地验证：Database 10/10；完整仓库 174/174；完整 typecheck；88/88 workflow policies；`git diff --check` 全部通过。
- CodeGraph 后置同步：1 个测试文件、4 nodes；总计保持 183 files / 2,199 nodes / 7,490 edges，current。SQL 不产生结构化符号；其 PostgreSQL 16 实际解析/执行必须由新的 GitHub CI 临时数据库提供，不能由本机静态测试替代。
- `pnpm build` 首次复跑在编译前被版本门禁按设计阻止，因为源码修正后旧 Preview 指纹已过期；这不是编译失败。下一步：提交本修正，在干净新 SHA 上重录 Preview 指纹，再完成 build、Worker bundles、冻结离线安装和版本门禁后普通推送。

## 2026-07-28 00:04 +08:00 — PostgreSQL 修正后的完整本地发布门禁通过

- 修正提交为 `4d4ed59f2676ce85f091ae4b40bdb73d424e675c`；提交后工作树干净，并在该精确 SHA 上重新登记 Preview 源码。
- 新 Preview manifest：350 files / fingerprint `02524923dcc76d954c0c19684b287a399becb6b417febebe2125de694966310b`；公开版本继续为 V5.7.8。
- 修正后完整验证通过：仓库 174/174、完整 typecheck、88/88 workflow policies、完整 root build、冻结 offline install、`git diff --check` 与标准版本门禁。
- 仓库实际 Worker bundle 命令 `pnpm build:worker-bundle` 通过：普通产物 353,740 bytes，minified 产物 198,083 bytes；两者均非空并含 fetch handler。
- CodeGraph 在本检查点前保持 183 files / 2,199 nodes / 7,490 edges、current；本检查点仅修改 Markdown，格式覆盖例外继续显式记录。
- 本机没有 PostgreSQL 可执行环境，因此修正后的 PostgreSQL 16 迁移解析和两次 checksum runner 幂等执行仍须由新的 GitHub Actions `verify` 证明。下一步：提交并普通推送本检查点，以新 PR head 的全部 CI 作为唯一合并门禁。

## 2026-07-28 00:07 +08:00 — PR #72 修正后 PostgreSQL 16 CI 全部通过

- PR head `e68a2818452769339d7056e3efe2a6c926a9f725` 的 GitHub Actions run `30282970061` 已完成：`secrets` 成功，`verify` 成功。
- `verify` 包含 PostgreSQL 16 临时数据库中的完整 migration runner；修正后的 Supabase migration 成功应用，并在第二次 runner 执行时保持幂等，迁移历史计数为 6。
- PR 复核状态为 `clean`，head/base 未漂移；本地与远端修复分支均精确指向 `e68a2818452769339d7056e3efe2a6c926a9f725`。
- 本检查点仅修改 Markdown；CodeGraph 前置保持 183 files / 2,199 nodes / 7,490 edges、current。提交并普通推送后，必须等待这个新最终 head 的 `verify` 与 `secrets` 再次全部通过，才允许普通 merge；此后不再追加合并前文档提交。
