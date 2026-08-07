# 恢复账本 · Workshop 平台管理后台

> 用途：跨对话继续任务的**单一事实源**。字段约定沿用 `long-task-resilience-skill` 的
> `rh-session` 账本语义（stage / summary / next-step / decision / evidence / files）。
> `rh-session` 与 `rh-task` 装在 Termux 本机，不在 workspace 沙箱内，因此本轮以本文件等价落盘。
>
> **恢复入口**：新对话只需说「继续」，先读本文件，再按「下一步」执行；
> 执行前必须先跑「恢复前核验」，不要凭本文件记载直接假定线上状态。

---

## 会话身份

- 目标（用户原话）：优化平台管理后台的可读性；随后「对 workshop 项目进行全栈优化补齐」，
  **硬约束：不能改变非后台管理的其它页面排版**。
- 项目根：`/workspace/decathlon-bike-daily-phase1`（私有仓库 `SAINTTaiYi/decathlon-bike-daily-phase1`）
- 账本更新时间：2026-08-07 04:4x (+08:00)
- 当前阶段：**三轮改动已完成并推送，全部卡在 GitHub Actions 故障，未交付 Preview**

---

## 阶段状态

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 1 | 总览「变化流 / 最近平台事件」可读性 | **已上 Preview**（PR #176 合并 `fee1b0e`） |
| 2 | 目录 + 用户可读性 | 已提交推送 `40ec0bd`，PR #177 OPEN，**CI 未跑** |
| 3 | 全栈优化补齐（静默失败 / 索引 / 分包） | 已提交推送 `894ac1e`，**未交付** |
| 4 | 审批分区可读性 | 已提交推送 `a6ea72d`，**未交付** |

五个分区（总览 / 目录 / 用户 / 审批 / 审计）可读性均已处理；审计在 #172 已具备双形态，核对后无需再改。

---

## 关键身份（精确值，勿凭记忆改写）

- 工作分支：`fix/admin-directory-users-readability-20260807`
- 分支 HEAD = 远端 = **`a6ea72d02ae7026dac0fad91a02514b62182097d`**
- 分支三次提交（自 `fee1b0e` 起）：
  - `40ec0bd1e6eb9e334a6193d517c29945364742eb` — 目录/用户可读性
  - `894ac1ec1e52f3d7cc99969a33d1582692258c08` — 分包 + 索引 + 静默失败
  - `a6ea72d02ae7026dac0fad91a02514b62182097d` — 审批可读性
- 集成分支 `feature/cloudflare-workers-d1` head = **`fee1b0e7c9bafc0c47de1d292fb5edeca1041aaf`**（尚未合入 PR #177）
- PR **#177** OPEN，base=`feature/cloudflare-workers-d1`，`mergeStateStatus=CLEAN`、`mergeable=MERGEABLE`
- Production `workshop.skin` = **5.8.3 / `3ec28a321b1f1f02a28a0e4d94abb1be1432065b`**，`environment=staging`，**未部署未触碰**
- Preview `bike-ops-preview.geeklightonefish.workers.dev` = **5.8.3 / `fee1b0e7c9ba…`**（仅含阶段 1）
- 公开版本 V5.8.3 全程未变；`version-manifest.json` 仍记 5.8.5（历史遗留，有意未改，待用户决定对账方式）

---

## 阻塞原因（GitHub 侧，非代码问题）

- 故障：**Incident with Actions**，critical，`2026-08-06T15:22:49Z` 起，截至 `20:34Z` 仍 `investigating`
- 组件：Actions = `major_outage`，Pages = `major_outage`；Git Operations / API / PR / Webhooks 组件本身 operational
- 官方通报要点：**webhook 触发被限流到约 15%**，故 push / PR 多数不触发 workflow；
  已排队任务成功率约 **65%**（最低谷 30–40%）；剩余问题是 runner 卡在重试已失效任务，
  GitHub 托管与自托管均受影响
- 诊断依据（避免误判为断言失败）：run `31125304368` 两次尝试均排队 ~15m04s 后 **cancelled**，
  job 级 `steps=0`、`runner` 为空 → job 从未创建。**`gh pr checks` 会把 cancelled 显示成 fail**，
  必须查 job 级 `steps` 与 `runner` 字段才能分辨
- 已排除：Actions 未禁用（`enabled=true`, `allowed_actions=all`）；ci.yml 无 concurrency 块；
  同期无并发 run 抢占；当日 10:16Z 的 CI 曾成功
- 未能核实：Token 缺 `user` scope，查不到 Actions 用量配额
- **重要**：PR CI 与 Preview 部署工作流都跑在 `ubuntu-latest`，绕过 PR CI 直接合并**无意义**，
  Preview 同样拿不到 runner。不要盲目重试。

---

## 下一步（按序执行）

1. **先查故障是否恢复**（不要跳过）：
   `node -e "fetch('https://www.githubstatus.com/api/v2/summary.json').then(r=>r.json()).then(d=>{console.log(d.status.indicator);for(const c of d.components)if(/^Actions$/.test(c.name))console.log(c.name,c.status)})"`
   要求 Actions = `operational` 再往下走。
2. **恢复前核验**（见下节），确认线上与分支状态与本账本一致。
3. 确认 PR #177 的 `verify` + `secrets` 均为绿。
   - 若无 run 被触发（webhook 限流所致），可用 `workflow_dispatch` 手动触发绕过 webhook；
     用户已知晓此方案但**尚未批准**，需再确认。
4. **普通合并**（非 squash）PR #177 → 取合并 SHA。
5. 触发 Preview：
   ```
   gh workflow run deploy-cloudflare-preview.yml \
     --ref feature/cloudflare-workers-d1 \
     -f release_sha=<合并SHA> \
     -f confirm_free_plan=true -f confirm_no_billing=true -f confirm_preview_only=true
   ```
   `seed_preview_data` **保持 false**，保住既有 Preview D1 验收数据。
6. 部署后三轮绕缓存核验 `/health/live`、`/health/ready`、`/api/v1/meta/version` = 5.8.3 + 精确合并 SHA，
   并对线上 CSS/JS 逐条断言本轮特征（见「验收要点」）。
7. 交给用户验收。**未获明确同意不得部署 Production、不得变更正式版本号。**

---

## 恢复前核验（不可跳过，防止重复不可逆副作用）

```
cd /workspace/decathlon-bike-daily-phase1
export PATH=/workspace/toolchains/node-v22.22.2-linux-arm64/bin:$PATH
git rev-parse --abbrev-ref HEAD          # 期望 fix/admin-directory-users-readability-20260807
git rev-parse HEAD                       # 期望 a6ea72d02ae7026dac0fad91a02514b62182097d
git status --porcelain                   # 期望空
git ls-remote origin refs/heads/feature/cloudflare-workers-d1   # 期望 fee1b0e…（若已变，说明有人合入，需重新评估）
gh pr view 177 --json state,mergeStateStatus,headRefOid
# 线上（沙箱无 curl，必须用 Node fetch）
node -e "['https://workshop.skin','https://bike-ops-preview.geeklightonefish.workers.dev'].forEach(b=>fetch(b+'/api/v1/meta/version?cb='+Date.now()).then(r=>r.json()).then(j=>console.log(b,j.appVersion,j.gitSha,j.environment)))"
```

---

## 已完成内容与验收要点

### 阶段 2 · 目录 + 用户（`40ec0bd`）
- 目录根因（像素实测）：大区列 226.4px，头部状态+两按钮占 199px → **名称列仅剩 1.4px**，22px 中文名逐字竖排；
  门店行嵌三层内可用宽 148.4px，min-content 需求 504px → **溢出 3.4 倍**
- 修复：`repeat(auto-fill, minmax(260px,1fr))`；展开态 `grid-column:1/-1` 独占整行（门店识别列 148px → ~700px）；
  折叠态 head 改 flex-wrap，状态与操作收进新增 `.admin-directory-module-meta` 第二行
- 用户：「角色」「门店」顿号分列合并为配对列「门店与角色」（7 列→6 列），新增 `MembershipList` / `LastLogin`；
  最近登录日锚点，未登录显示「从未登录」
- 时间格式化抽出 `apps/web/src/components/admin/admin-format.js`
- SSR 暴露并修掉两个真实缺陷：目录 `module()` 根 div 缺 `key={item.id}`（#174 遗留）；
  门店行 `.admin-directory-actions` 嵌套两层导致 ≤1023px 仅「查看」被撑开
- **总览逐字节回归**：搬走 `formatStamp` 后，已验收版与共享模块版 SSR 输出 5454 B、
  SHA-256 同为 `de272f935e4a37a7480723d099f3c67f3209baaeaeb341dcd0eac8662912c1eb`

### 阶段 3 · 全栈优化（`894ac1e`）
- 审计结论：底子扎实（CSP、安全头、`AppErrorBoundary`、乐观锁、幂等键、请求闸门、1 MiB body limit 均已就位），
  故只补四处真实缺口，未做无意义改造
- 目录 4 处 `catch {}` 静默失败 → `role="alert"` 错误条（新增、重命名、停用、成员变更）
- 新增 `migrations/d1/0010_admin_console_query_indexes.sql`：纯追加、`IF NOT EXISTS` 幂等、无 DROP/ALTER/DML
  - **原写 7 条，EXPLAIN 实测后删掉 3 条无效的**：两条 `(created_at DESC, id DESC)` 对
    `status IN (三值)` 跨值排序无效（SQLite 必走 TEMP B-TREE，三种组合对照验证）；
    `store_members(user_id,…)` 与既有唯一分区索引重复
  - 保留 4 条均经 EXPLAIN 确认被选中；`decided_at` 此前**完全无索引**，总览每次加载全表扫两张申请表
  - 已同步 `apps/worker/security/d1-test-adapter.ts` 迁移清单
- 后台按需分包：`lazy` + `Suspense`，`admin-console.css` 从全局 `index.css` 移入后台入口
  - 首屏 JS 480→429.1 kB、CSS 306→280.3 kB，共减 76.6 kB；gzip 减 16.4 kB（7.0%）
  - **分包前排掉的红线隐患**：admin CSS 280 条选择器中恰有 2 条服务非后台页面 ——
    `.workshop-pending-badge`（`WorkshopShellHeader`）、`.dialog-action-badge`（`MenuDialog`），
    已先搬进常驻 `components.css`；`Suspense` 占位 `.admin-console-loading` 同理
  - **红线验证**：从 HEAD 按 `@import` 顺序复原基线全局 CSS 做规则级比对
    （`@media` 按块内选择器是否全为 admin 判定）→ 基线 1478 条中 270 条为 admin 专属，
    **非 admin 规则缺失 0 条**，270 条全部落入后台 chunk 无丢失，全局仅新增 1 条占位样式

### 阶段 4 · 审批（`a6ea72d`）
- 先算宽度：身份列 ~365px，调店去向串 ~300px → **宽度不是瓶颈**，问题在别处
- 身份列原 `nowrap + ellipsis` → 可换行，去向拆 `move-from / arrow / move-to`
- 元信息「·」长串 → `ApprovalMeta` 标签+值分项，审批意见单独成段
- **`formatDeadline()`（功能性缺陷修复）**：审批会过期但只显示绝对时间，易漏批。
  现输出剩余量 + tone：<1h/<24h→`urgent`（红加粗）、≤2天→`soon`（琥珀）、更远→`normal`、已过→`expired`
- 统一走 `admin-format.js`（删本地 `formatTime`）；补 approved/rejected/cancelled 状态标签；
  行改 `align-items: start`
- SSR 用 6 组固定时间 fixture 在 `TZ=Asia/Shanghai` 下核对每个 tone 分支；
  门店审核无 `expiresAt` 时截止项整段不渲染
- 红线复查：后台样式表仍 100% admin 锚定 0 泄漏；主 CSS 280.33 kB、主 JS 429.05 kB
  与阶段 3 **逐字节一致**，新增样式全进后台 chunk（33.63→35.12 kB）

### 门禁（最后一次全绿记录，阶段 4 之后）
web **204/204**、worker 50/50、domain 7、database 10、api 21、typecheck（含 worker）、
workflow policy 88、`git diff --check` 干净、构建通过。

---

## 决策记录

- 不在 Actions 故障期间反复重试 CI（同一路径已失败 3 次：等待 / `gh run rerun` / 关闭重开 PR）
- 不绕过 PR CI 直接合并 —— Preview 部署同样需要 runner，会产生「CI 过但 Preview 卡住」的中间态
- 旧断言与重构冲突时，改为**等价断言**而非删除（意图仍有效，仅实现形态变化），共修正 3 条
- EXPLAIN 未确认生效的索引一律不进迁移，宁可少加也不留死重量
- CodeGraph 前后置全程记**豁免**：CodeGraph 在 Termux 本机，不在 workspace 沙箱；
  CSS/Markdown 本即非索引例外，由契约测试、SSR 核对、构建与线上资产断言补偿

---

## 尚未做 / 待用户决定

- Preview 证据文档（docs-only PR）—— 待 Preview 交付后补，参照
  `plan/DIRECTORY-STORE-PREVIEW-EVIDENCE-20260806.md` 格式
- `version-manifest.json` 记 5.8.5 与实际 5.8.3 的对账方式
- 是否批准用 `workflow_dispatch` 手动触发以绕过 webhook 限流
- 桌面适配历史遗留：参考稿 1536×1024 与用户真实窗口不符，需真实 `innerWidth/innerHeight` 或截图重新定标

---

## 环境与踩坑（省去重复摸索）

- Node 22 在 `/workspace/toolchains/node-v22.22.2-linux-arm64/bin`；pnpm 9.15.9；gh 2.45.0 已登录 SAINTTaiYi；
  esbuild 0.25.5 在 `node_modules/.pnpm`
- `pull` 后 `packages/contracts/dist` 是旧产物、缺 `adminCreateUserSchema` 等导出 →
  worker 测试假失败 1 项，**先 `pnpm --filter @bike-ops/contracts build`**
- SSR/esbuild 临时副本必须放在**被测组件同目录**（相对导入才解析得到）；产物要放 `apps/web/` 下
  （`react-dom` 在 `apps/web/node_modules`，不在仓库根）；`@iconoir/*` 是 Vite 别名不是真包，
  需 esbuild 插件解析到桩组件
- 整节 SSR 渲染列表会得到 0 行：数据在 `useEffect` 异步加载，`renderToStaticMarkup` 只出首帧 →
  直接渲染展示单元
- **沙箱时区 UTC**，日锚点必须 `TZ=Asia/Shanghai` 核验，否则「昨天」被算成「今天」
- **沙箱无 curl**，在线核验用 Node fetch，否则得到「命令缺失」假阴性
- 本地 `pnpm build` 被 `check:version` 拦（要求先提交再登记 Preview 指纹）；
  CI/Preview 自己跑 `pnpm version:preview`，`preview-manifest.json` 是 gitignored，本地不该提交；
  验证构建用 `pnpm --filter @bike-ops/web build` 绕过
- git 无 credential helper，推送用一次性 `-c credential.helper='!gh auth git-credential'`，不写全局配置
- 复杂引号/反引号脚本用 quoted heredoc 写文件再 node 执行，`node -e` 会被 shell 吃掉
- `git status --porcelain` 第一列索引态、第二列工作区态，`M ` = 已暂存且工作区干净，勿误判为残留
- 自建临时目录（`.tmp-fix/`、`.tmp-ssr/`）不在 gitignore，用完必须删
- `git stash` 会连带藏起未跟踪的临时目录，导致脚本写入失败 → 取基线改用 `git show HEAD:<path>`，不动工作区
- 安全边界：不在聊天、仓库、日志、GitHub 文档中写入 key/token/密码/私钥/隐私/设备私有路径/
  隐藏账本全文/未公开业务数据/D1 明文备份
