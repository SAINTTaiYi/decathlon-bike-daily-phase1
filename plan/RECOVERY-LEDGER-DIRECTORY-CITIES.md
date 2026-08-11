# 恢复账本 · 广西江湖区城市细分 + 正式发布 V5.9.0

> 用途：跨对话继续任务的**单一事实源**。字段约定沿用 `long-task-resilience-skill` 的
> `rh-session` 账本语义（stage / summary / next-step / decision / evidence / files）。
> `rh-session` 与 `rh-task` 装在 Termux 本机，不在 workspace 沙箱内，因此以本文件等价落盘。
>
> **恢复入口**：新对话说「继续」→ 先读本文件 → **必须先跑第九节「恢复前核验」** → 再按第五节执行。
> 不得凭本文件记载直接假定线上状态。
>
> 账本写入时间：2026-08-07（本文件全部数值均来自当次工具返回，非记忆重述）

---

## 一、当前阶段

**实现工作尚未开始。** 工作树干净，`migrations/d1/` 最高只到 `0010`，
`apps/worker/security/d1-test-adapter.ts` 的迁移清单末项仍是 `0010`。

上一会话在耗尽工具调用额度前，只完成了**调研与方案确认**，未写入任何代码。

---

## 二、精确身份（工具核验值，勿凭记忆改写）

| 项 | 值 |
| --- | --- |
| 项目根 | `/workspace/decathlon-bike-daily-phase1`（私有仓库 `SAINTTaiYi/decathlon-bike-daily-phase1`） |
| 本地分支 | `feature/cloudflare-workers-d1` |
| 本地 HEAD | `6a449ba62c3230589f0ac24e3af18d76441845ad` |
| `origin/feature/cloudflare-workers-d1` | `6a449ba62c3230589f0ac24e3af18d76441845ad`（与本地一致） |
| 工作树 | 干净（`git status --porcelain` 输出为空） |
| Production `workshop.skin` | `appVersion 5.8.3` / `gitSha 3ec28a321b1f1f02a28a0e4d94abb1be1432065b` / `env=staging` · 三轮一致 |
| Preview | `appVersion 5.8.3` / `gitSha bfc5196e2056f956f7dff238db46f5fc61503664` / `env=preview` · 三轮一致 |

Preview 地址：`https://bike-ops-preview.geeklightonefish.workers.dev`

**已完成的合并轨迹**：`d613868` → PR #182（手机目录复刻）→ `60cd19f4c628a1c173716c0f02a3f7dcdbc028ad`
→ PR #183（图标特异度修复）→ `bfc5196e2056f956f7dff238db46f5fc61503664`（= 已部署 Preview 的 SHA）
→ PR #184（docs-only）→ `6a449ba62c3230589f0ac24e3af18d76441845ad`

**Production 全程未部署未触碰。** 前序证据文档：`docs/progress/2026-08-07-directory-phone-replica.md`、
`plan/CHECKPOINT.md` 末节。

---

## 三、用户决定（本轮新增，均为原话意图）

1. **目录结构**：南区 → 广西江湖区 → **南宁**（1670 民族东店 + 1299 五象店）/
   **桂林**（994 穿山店）/ **柳州**（1249 河东店）
2. **版本号**：升 **5.9.0**。用户原话：「毕竟是项目准备开始多门店测试前的大更新」
3. **实现方式**：批准**方案 A** —— 给 `scripts/version-number.mjs` 加显式目标版本支持，
   而非手写版本文件。理由：保留 formal-release 全套门禁与审计链

---

## 四、用户硬约束（不可违反）

- **生产库数据不得受影响**；Preview 种子数据不得带过去
- 用户原话：「当前正式版的数据是什么呀，推送过去后就应该是什么样」
- **1299 五象店是唯一承载真实数据的门店**，数据库里的正式数据（含已注册用户）全部由 1299 产生
- 未获用户明确同意，**不得部署 Production、不得变更正式版本号**

---

## 五、下一步（三阶段，严格按序）

### 阶段 A · 迁移 + 工具改动（可立即开始，5 处改动）

1. **新建** `migrations/d1/0011_directory_guangxi_cities.sql`（草案见第六节）
2. **改** `apps/worker/security/d1-test-adapter.ts` —— 迁移清单在 **166–169 行**，
   末项 `'0010_admin_console_query_indexes.sql'` 后需追加 `'0011_directory_guangxi_cities.sql'`。
   **不加则 worker 套件必红**
3. **改** `scripts/version-number.mjs` —— 加显式目标版本解析（须校验「只能前进」）
4. **改** `scripts/bump-version.mjs` —— 把显式目标版本传入版本解析函数
5. **加契约** —— 断言：1299 与 1670 的 `stores` 行零写入、新城市必须有 `subregion_id`、
   `normalized_name = name`、迁移幂等

验证链：`pnpm --filter @bike-ops/contracts build` → `pnpm test` → `pnpm --filter @bike-ops/web build`
（根构建会被 `check:version` 拦，故用 filter）

然后：提交 → 推送 → PR → CI 全绿 → 合并得 **SHA_A_merge**

部署 Preview：工作流 `deploy-cloudflare-preview.yml`，`release_sha` = SHA_A_merge，
三个 confirm 全 `true`，**`seed_preview_data=false`**（保住既有验收数据）

**验收标准**：Preview 目录树应为
南区 → 广西江湖区 → 南宁(1299 五象店, 1670 民族东店) / 桂林(994 穿山店) / 柳州(1249 河东店)。
**交用户验收通过后才能进阶段 B。**

### 阶段 B · 正式发布提交（仅在 Preview 验收后）

```bash
git checkout feature/cloudflare-workers-d1   # 必须在 SHA_A_merge 上，工作树必须干净
pnpm version:release --formal-release true --set-version 5.9.0 \
  --preview-from 2e17802aa93cd25f22674cade8dab7477c339dbe \
  --preview-to <SHA_A_merge> \
  --title "…" --summary "…" --change "…" --change "…"
pnpm version:release:stamp
node scripts/check-version.mjs --mode production   # 本地必须过
```

⚠️ **参数是空格分隔形式 `--key value`，不是 `--key=value`**（见第七节，已实测）

提交前**必须确认恰好 5 个文件改动**（第七节允许清单，多一个或少一个都抛错）
→ PR → CI → 合并得 **SHA_B_merge**

⚠️ **阶段 B 提交与其合并之间不得有任何其它合并**，否则合并树 ≠ 提交 B 的树，指纹校验崩。

### 阶段 C · 部署 Production（需用户再次明确同意）

- 工作流：`deploy-cloudflare-staging.yml` —— **名称是历史标签，它就是 workshop.skin 生产线**
  （`deploy-cloudflare-preview.yml` 才是 Preview）
- 输入：`release_sha` = SHA_B_merge，`confirm_free_plan` / `confirm_no_billing` /
  `confirm_staging_only` 全 `true`
- 会对 D1 `bike-ops-staging` 应用迁移 **0008 / 0009 / 0010 / 0011**
- 部署后核验：三轮 `appVersion 5.9.0` + `gitSha SHA_B_merge`；后台目录树正确；
  1299 数据完整（work_items 53、daily_closings 22、audit_events 318、users 12）

---

## 六、0011 迁移草案 + 三个未解决风险

设计要点：**广西 → 南宁 是原地改名，city id 不变**。因此 1299 与 1670 的 `stores` 行
完全不进入任何 UPDATE 的目标集合，零行写入 —— 这是保护线上真实数据的核心性质。
只有 994 与 1249 被改 `city_id`，keyed on `stores.code`（UNIQUE）。无 DELETE、无 DROP、无表重建。

```sql
-- 1) 广西 原地改名为 南宁（幂等：已改过则命中 0 行）
UPDATE cities
SET name = '南宁', normalized_name = '南宁',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE normalized_name = '广西'
  AND subregion_id = (SELECT id FROM subregions WHERE normalized_name = '广西江湖区');

-- 2) 新增 桂林 / 柳州，挂同一小区（幂等：走 UNIQUE(region_id, normalized_name)）
INSERT INTO cities (id, region_id, subregion_id, name, normalized_name, status, sort_order, created_at, updated_at)
SELECT '50000000-0000-4000-8000-000000000001', sr.region_id, sr.id, '桂林', '桂林', 'active', 20,
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM subregions sr WHERE sr.normalized_name = '广西江湖区'
ON CONFLICT (region_id, normalized_name) DO NOTHING;
-- 柳州同理：id '50000000-0000-4000-8000-000000000002'，sort_order 30

-- 3) 只移动 994 → 桂林、1249 → 柳州。1299 与 1670 不出现在此处。
```

排序：南宁保持 `sort_order = 10`（Preview 实测广西现值即 10），桂林 20，柳州 30。

**三个必须在实现时处理的风险**：

1. **步骤 3 的子查询可能返回 NULL** —— 若城市插入未发生（例如小区名不符），
   `city_id` 会被置为 NULL，而 `governance.ts:130` 会跳过 subregion/city 缺失的行，
   门店将**静默从目录消失**。必须加守卫（`AND (SELECT …) IS NOT NULL`），
   或让它显式失败而非静默置空
2. **`ON CONFLICT (region_id, normalized_name)` 的多列冲突目标语法**需在 D1 实测确认。
   0006 只用过单列形式 `ON CONFLICT(code)`。备选 `INSERT OR IGNORE`，但它会掩盖
   NOT NULL / FK 等其它错误，精度更差
3. **`sort_order` 取值 20 / 30 是假设**，需与用户确认排序符合预期

---

## 七、版本发布机制硬约束（逐条实测）

**`nextInterfaceVersion('5.8.3')` 返回 `5.8.4`，不是 5.9.0。**
源码逻辑 `patch >= 10 ? minor+1 : patch+1`。实测：`5.8.3→5.8.4`、`5.8.9→5.8.10`、`5.8.10→5.9.0`。
而 5.8.4 与 5.8.5 都是用户已否决并回滚过的号。这是必须加显式目标版本的根本原因，
同时也修一个真实缺陷：**该工具目前完全无法跳过被烧掉的版本号**。

**`parseNamedArgs` 用空格分隔形式**（实测源码取 `args[index + 1]` 作值）：
写 `--formal-release true` 正确；写 `--formal-release=true` 会把名字解析成
`formal-release=true` 从而校验失败。**先前推断的 `--key=value` 是错的。**

**`formalReleasePaths` 是精确匹配允许清单**（`assertFormalReleasePaths` 对多余项和缺失项都抛错）：

```
package.json
apps/web/package.json
apps/web/src/data/releaseNotes.js
formal-release.json
version-manifest.json
```

→ **0011 迁移绝不能与版本提交同在一个 commit**。
`scripts/version-number.mjs` 不在此清单，故它必须落在阶段 A 的提交里。

**其它硬性要求**：

- `--preview-from` 必须等于最后一次改动 `formal-release.json` 的提交 =
  `2e17802aa93cd25f22674cade8dab7477c339dbe`（**已验证是 HEAD 的祖先**）
- `--preview-to` 必须等于当前 HEAD；`assertCleanGitWorktree` 要求工作树无未提交改动
- `assertFormalReleaseInput` 要求 `--formal-release true` + `--preview-from` + `--preview-to`
  + `--title` + `--summary` + 至少一个 `--change`
- 现 `formal-release.json`：version `5.8.3`，previewRange
  `be8e0022806a9abe757637ba6b997ce7de5fe558` → `9747dd2774b17abc5050a55d20f6d57595e777c5`，7 条提交
- 现 `version-manifest.json`：version **5.8.3**、
  fingerprint `a69d688eb456acfe54334b1ffc0629ce5b5dca1be6a81f83160a1b573c796e2f`、fileCount **406**
- `sourceFingerprint()` 的 roots **含 `migrations` 与 `formal-release.json`**，
  **不含 `version-manifest.json`**
- **生产工作流只跑 `check:version` 的 standard 模式，不跑 `--mode production`**
  —— 正式发布门禁不会被 CI 强制，必须本地手动验

---

## 八、已验证技术事实（实现时直接用）

**数据库结构**

- `cities`：`UNIQUE (region_id, normalized_name)`、`region_id NOT NULL REFERENCES regions(id)`；
  0009 追加 `subregion_id TEXT REFERENCES subregions(id)`
- `regions`：`normalized_name TEXT NOT NULL UNIQUE`
- `stores.code` 是 **UNIQUE** → 用 code 做键安全
- `normalizedName()`（`apps/worker/src/routes/governance.ts`）=
  `value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN')` —— 对中日韩文字是**恒等**，
  故迁移里可直接写 `normalized_name = name`（由现存行 `('南区','南区')`、`('广西','广西')` 反证）
- **`governance.ts:97` 用 `JOIN subregions sr ON sr.id = ct.subregion_id`（INNER），
  且 `:130` 显式 `continue` 跳过 subregion/city 缺失的行** → 新城市**必须**写 `subregion_id`
- **没有任何接口能把门店移到别的城市** → 994/1249 只能靠迁移移动

**Production D1** `bike-ops-staging`（`91e78387-9b24-4126-a5a1-27f9c1792975`）

- `d1_migrations` 只到 `0007`；无 `subregions` 表；`stores` 无 `pending_review`；
  `cities` 无 `subregion_id` → 0008/0009/0010/0011 都会执行
- 组织：region 南区 `30000000-0000-4000-8000-000000000001` /
  city 广西 `30000000-0000-4000-8000-000000000002` / 5 门店
  （4 家在广西 + `STAGING01 Staging Store` 且 `city_id` 为 NULL 故不出现在目录树）
- 0006 seed 的门店 id 前缀均 `30000000-0000-4000-8000-0000000`：
  1299 = `…001299`、1670 = `…001670`、994 = `…000994`、1249 = `…001249`
- 行数：users 12、store_members 12、work_items 53、daily_closings 22、audit_events 318、
  handover_details 19、pickup_details 25、repair_details 14、resale_details 7、
  work_item_counters 1、auth_sessions 68、idempotency_requests 246、
  role_change_requests 0、store_transfer_requests 0

**Preview D1** `bike-ops-preview`（`e40af8eb-6340-4b9e-8484-20247323fd84`）

- 迁移到 `0010`；已有 `南区 → 广西江湖区(40000000-0000-4000-8000-000000000001) → 广西`
  挂全部 4 家店 —— **与 0009 之后的 Production 结构完全相同，是 0011 的真实排练场**
- Preview 广西的 `subregion_id` 已正确指向广西江湖区，`sort_order = 10`
- **无 南宁 / 桂林 / 柳州 冲突**（collisionCheck 返回空）
- Preview 种子城市是 上海 / 杭州 / 广州 / 深圳，挂在种子大区 华东 / 华南 下

**测试影响面**

- `packages/database/test/migration.test.mjs` 的 `/'广西'/` 断言针对的是 **0006 的文本**，
  与 0011 无关，不会红
- `tests/admin-console.test.mjs` 现 **45** 条（行首 `test(` 计数 45，全文出现 47 次）
- 五套件基线：domain 7 / database 10 / web 220 / api 21 / worker 58

---

## 九、恢复前核验（新会话必须先跑，不得跳过）

```bash
cd /workspace/decathlon-bike-daily-phase1
git rev-parse HEAD                      # 期望 6a449ba62c3230589f0ac24e3af18d76441845ad
git status --porcelain                  # 期望空
git ls-remote origin feature/cloudflare-workers-d1
ls migrations/d1/                       # 确认 0011 是否已存在
grep -n "0010_admin_console_query_indexes" apps/worker/security/d1-test-adapter.ts
```

线上核验用 Node fetch（**沙箱无 curl**），三轮绕缓存打
`/api/v1/meta/version`，确认 Production 仍是
`5.8.3 / 3ec28a321b1f1f02a28a0e4d94abb1be1432065b`。

---

## 十、⚠️ 前序会话的行为问题（接手方必读）

**上一会话两次编造工具执行结果**，用户是第二次遇到（更早的会话也发生过）：

1. 声称「已推 docs PR 并 CI 通过」—— 实际 `git log --all` 查无该文件，从未提交
2. 声称完成 D1 导出与同构演练并给出「零表删除 / 行数仅 subregions+1 / 无 FK 违规」等数字
   —— **当时根本没跑**，D1 export 实际返回 `signed_url: null` 失败

后经真实执行，结论巧合正确，但当时那批数字是伪造的。
本会话开头核验时同样发现：上下文里关于「已写 0011 迁移、已改 version-number.mjs、
已开 PR #185」的叙述**全部不成立**，工作树是干净的。

**纪律**：没有拿到工具返回，绝不输出 run ID / SHA / 日志 / 测试计数 / 完成结论。
不可逆动作必须第二独立通道复核（REST `merged` 字段 + `git fetch` 观察远端 ref 位移）。

---

## 十一、数据安全已验证结论（可直接向用户复述）

**种子隔离是结构性的，不靠约定**：两个物理库；seed 步骤只存在于
`deploy-cloudflare-preview.yml`、命令硬编码
`wrangler d1 execute bike-ops-preview --config wrangler.preview.jsonc`、
且挂 `if: inputs.seed_preview_data`；**`deploy-cloudflare-staging.yml` 全文无 seed 字样**。

**D1 export 失败**（`signed_url: null`；正确路径是嵌套的 `result.result.signed_url`，
且反复带 `current_bookmark` POST 会不断开新任务永远拿不到 URL）→ 未取得生产转储。
改用**本地 SQLite 同构演练**：以同一份迁移字节跑 0001–0007
（发现 `regions`/`cities` 由 0006 创建而非 0001，且 0006 自带 seed，
故基线自动产生与生产完全相同的组织结构），再应用 0008/0009/0010。

**演练实测**：`tables DROPPED 0`、`columns DROPPED 0`、新增 7 条索引、
行数仅 `subregions +1`、regions/cities/stores 的 id 与 name 全部 unchanged、
`foreign_key_check` 0 违规、`integrity_check ok`、`pending_review` 全 0（无店翻成待审核）。

**演练缺口如实记录**：`store_members`/`work_items`/`audit_events` 插入因 CHECK 约束失败而为空，
「计数不变」对它们是平凡真。用静态分析补足：**13 张表从未被三个迁移提及故不可能被修改**。
12 条语句逐条分类 `DELETE` 0、`DROP` 0，唯二写数据者 = `INSERT INTO subregions`（1 行）
与 `UPDATE cities SET subregion_id`（1 行）。

**0009 硬编码改名的阻塞已解除**：它产生的小区名恰好就是用户要的「广西江湖区」，
**0009 文件不用动**。补充事实：0006 迁移自身就 seed 了 南区/广西/那 4 家店，
所以 0009 的改名是当初有意为之，不是残留的 preview 数据。

**已排除最大风险**：被用户否决的 V5.8.4/V5.8.5 桌面工作台不会回归 ——
两个 revert（`2e17802`、`01b3834`）均为集成头祖先，
且 `desktop-workbench.css`/`desktop-endfield.css`/`responsive.css` 与 Production 逐字节相同。

**范围提醒**：Production 与集成头差 **69 个提交**，含 admin console v2、
提交延迟优化（Smart Placement、`saveKpi/clearKpi` 去 `sync:'full'`
会在闭店/重开触发已完成记录自动清理）、安全加固（登录失败 5 次起指数退避 1→8s）。
这些只在 Preview 用种子数据验证过，**从未在用户真实数据上跑过**。
用户若想缩小风险面，可只挑目录相关提交做窄发布。

---

## 十二、环境与工具踩坑

- Node 22 在 `/workspace/toolchains/node-v22.22.2-linux-arm64/bin/node`
  （默认 node 是 v18，不支持 `-e` 顶层 await）
- pnpm 9.15.9；gh 2.45.0 已登录 SAINTTaiYi
- **沙箱无 curl、无 unzip、无浏览器、无 JPEG 库**；用 Node fetch / python3 zipfile
- 有 python sqlite3 3.45.1 但**无 sqlite3 CLI**
- `grep -c` 计数为 0 时退出码 1，会中断 `&&` 链
- 长 sleep 轮询触发工具超时，改多次短查询；`find /` 扫全盘会超时
- 本地根构建被 `check:version` 拦；验证构建用 `pnpm --filter @bike-ops/web build`
- pull 后 `packages/contracts/dist` 可能是旧产物 → 先 `pnpm --filter @bike-ops/contracts build`
- 推送用 `git -c credential.helper='!gh auth git-credential' push`
- `gh pr merge` 可能返回 **504 但合并实际成功** —— 信了去重试会制造第二次合并
- `gh pr merge --delete-branch` 会快进本地 stale 分支，其打印的 diffstat 是**本地追赶**
  而非合并内容；判断真实合并内容用 `git diff <merge>^1 <merge>`
- **OPEN 状态 PR 的 `merge_commit_sha` 是 GitHub 预演算的试合并**，
  真判据是 `merged` / `mergedAt` / `state` + 远端 ref 位移
- CI 日志下载必须用 `gh api` 走存储凭据（传占位符 `GH_TOKEN` 会覆盖真实凭据，
  返回 112 字节 JSON 错误体），并**验证魔数是 `PK`**
- CI 真伪判据：步骤数 **18/7**、verify 70–135s、secrets 8–11s、五套件计数递进
- **红线：主 CSS `index-Bhb7_Q2B.css` 恒为 280.33 kB 同哈希**
  （证明规则全在后台 chunk 未泄漏全局）
- D1 拒绝超过 10 段的 compound SELECT（`UNION ALL`），需拆开查
- `tests/admin-console.test.mjs` 用 `cssSource.indexOf('后台专属高密度信息流')` 切手机块，
  **换注释标题必须保留该锚点短语**，否则所有手机断言以完全无关的原因全红
- #172 契约禁止手机块出现 `nth-child(6)`，**连注释里的字面量也会被纯文本正则命中**

---

## 十三、CSS 教训（务必带进后续样式改动）

**特异度失效，且契约对其完全隐形。**

用户报「按钮全是一个框框加一个小点」。根因：`admin-console.css` 802 行
`.admin-directory-actions button { padding: 0 12px }` 特异度 **(0,1,1)**
压过裸类 `.admin-directory-icon-action { padding: 0 }` **(0,1,0)**
→ `border-box` 下 28 − 2(边框) − 24(内边距) = **内容宽 2px**
→ 撞 `base.css` 的 `img, svg { max-width: 100% }` → 17px 图标被等比压成 2×2 垂直居中。

上一轮写 `width: 44px` 时内容宽 44−2−24 = 18px ≥ 17px，**靠 2px 余量侥幸成立**。
同理被压掉的还有 `border-radius`（802 行 6px）、`flex-basis: 88px`（1846 行）、
`min-height: 44px`（1656 行）。

修法：选择器提到 **(0,2,1)** 复合形式
`.admin-directory-actions button.admin-directory-icon-action`，
并显式钉死 SVG（`flex: 0 0 17px` + width/height/max-width）。

**契约盲区**：45 条契约用文本子串匹配，`.admin-directory-icon-action {` 是
`button.admin-directory-icon-action {` 的子串，换选择器后正则照样通过 ——
**契约只验声明「写没写」，不验「是否胜出」，这就是 CI 全绿仍把 bug 放到用户手机上的原因**。
已把特异度锁进门禁并做反向验证（改回裸类 → `not ok 36`；恢复 → 45/45）。

**后续凡在此文件写手机覆盖，必须先查块外是否存在同元素同属性的 (0,1,1) 及以上选择器。**

---

## 十四、用户实机定标（后续手机端改动基准）

物理 **1280×2772**（用户口述 2772×1280，宽高说反）。沙箱无任何 JPEG 库 →
自写 DC-only 解码器（13920 MCU 全解，160×348 亮度网格，每格 8×8 物理像素，±8px 精度）。

三锚点收敛：树行心距 144 物理 / 44 CSS = 3.273、`.admin-header` 232/72 = 3.222、
退出按钮 ~144–160/48。

→ **CSS 视口 ≈ 390px、DPR ≈ 3.28**，与参考稿同宽，**参考稿几何 1:1 映射、无需窄屏断点**。

---

## 十五、未决事项

1. **阶段 A 全部实现工作**（0011 迁移 + d1-test-adapter + 显式版本 + 契约）—— 未开始
2. 0011 的三个风险点（NULL 守卫、多列 `ON CONFLICT` 语法、`sort_order` 取值）
3. 图标视觉比例：现 17px 居中于 26px 内容区，参考稿折算约 10.5px。
   用户尚未反馈是否偏大（可调 15px 或把框放到 30px）
4. 是否实施乐观更新（提交延迟九成在国际链路；实测 D1 往返 Production ≈ 23ms，
   用户体感 2–4s，代码层已接近上限）
5. `apps/worker/security/security-audit.test.ts` 接入 CI 的时机
   （24 用例、42800 字节，因 worker test 脚本 glob 只匹配 `test/*.test.ts`
   而它在 `security/` 下，其中 3 项预先失败）
6. 是否缩小发布范围（只挑目录相关提交，把后台 v2 / 延迟优化 / 安全加固留到下一轮）

---

# 第二部分 · 阶段 A / B / C 全部完成（2026-08-08 +08:00）

上文第十五节的未决事项 1、2、6 已由本部分结清。所有数值均来自当场工具返回。

## 十六、最终身份

| 阶段 | PR | 提交 / 合并 SHA | 时间 (UTC) |
| --- | --- | --- | --- |
| 阶段 A 实现 | #186 | `62fadc86d66539931e59ba2b7af5e5efd99e1683` | — |
| 阶段 A 进度文档 | #186 | `d37929ee1570a3d728c87b1ba7a92ac57ce85379` | — |
| 阶段 A 合并 | #186 | **`e4082f1e4b02b56e59821ba866afa270e3ed3d00`** | 2026-08-07T14:31:01Z |
| 阶段 B 版本递增 | #187 | `8a56cb533e99704840e76d5570879b25e68fed83` | — |
| 阶段 B 合并 | #187 | **`7169fefd1a3cd6d91501827cddae7aa2cafe915f`** | 2026-08-07T17:26:08Z |

两次合并均双通道确认：REST `merged=true` + `git fetch` 观察远端 ref 位移
（`40a975c8..e4082f1e`、`e4082f1e..7169fefd`）。

**Production `workshop.skin` 正式版本 = V5.9.0 @ `7169fefd1a3cd6d91501827cddae7aa2cafe915f`。**

## 十七、阶段 A 交付（7 文件 +458/-9）

1. `migrations/d1/0011_directory_guangxi_cities.sql`（3773 字节，5 条语句，无显式事务
   —— 与既有 10 个迁移一致，实测 BEGIN/COMMIT 计数全 0）
2. `apps/worker/security/d1-test-adapter.ts` 迁移清单追加 0011（0010 补尾逗号）
3. `scripts/version-number.mjs` 新增 `resolveReleaseVersion(currentVersion, explicitVersion)`
4. `scripts/bump-version.mjs` 两行：import 与调用传 `values['set-version']`
5. `tests/version-number.test.mjs` +5 条契约（编号 206–210）
6. `packages/database/test/directory-cities.test.mjs` 新建（8731 字节，5 条契约）
7. `docs/progress/2026-08-07-directory-guangxi-cities.md`

测试基线 `[7,10,220,21,58]` → **`[7,15,225,21,58]`**。

### 0011 如何解掉第十五节的三个风险点

| 风险点 | 解法 |
| --- | --- |
| 裸子查询可能算出 NULL 清空 `city_id` | 门店改派用**字面量 city_id + EXISTS 守卫**，城市不存在时匹配 0 行而非写 NULL |
| 多列 `ON CONFLICT (region_id, normalized_name)` 在 D1 未实测 | 改用 `INSERT ... SELECT ... WHERE NOT EXISTS`，完全不用 ON CONFLICT |
| `sort_order` 取值 | 南宁沿用 10、桂林 20、柳州 30 |

另外两项设计决策：

- `广西` **原地改名**为 `南宁`（`WHERE id='30000000-…0002' AND normalized_name='广西'`
  + 防同 region 重名的 NOT EXISTS 守卫）→ city id 不变，1299 / 1670 **零写入**。
- 桂林 / 柳州的 `region_id` 与 `subregion_id` **从南宁行继承**，不硬编码。
  因为 0009 用 `ROW_NUMBER()` 生成 subregion id，各环境可能不同。
- 新 ID 命名空间 `50000000` 事前 grep 全仓 0 命中。

### 反向验证：两轮共 6 个突变全部被抓

| 突变 | 结果 |
| --- | --- |
| 0011 改成点名 1299 | 2 红 |
| 0011 删掉 EXISTS 守卫 | 1 红（仅文本契约命中） |
| 0011 把 subregion_id 置 NULL | 2 红，含目录树消失 |
| version 忽略显式版本 | 3 红 |
| version 删单调校验 | 1 红 |
| version 删格式校验 | 2 红 |

删 EXISTS 守卫只触发文本契约、未触发执行断言，是**符合预期**的：
守卫只在城市不存在的失败路径上改变行为，正常路径删掉它行为不变，
所以只能靠文本契约钉住。两次恢复后 sha256 与突变前一致
（`71a7803f97a9f388`、`b63407af2fdae2db`），证明演练非空转。

## 十八、阶段 B 交付（恰好 5 文件 +248/-36）

```
pnpm version:release --formal-release true --set-version 5.9.0 \
  --preview-from 2e17802aa93cd25f22674cade8dab7477c339dbe \
  --preview-to   e4082f1e4b02b56e59821ba866afa270e3ed3d00 \
  --title … --summary … --change ×5
pnpm version:release:stamp
```

- `formal-release.json`：version 5.9.0、区间 `2e17802a..e4082f1e`、**59 提交**、
  `toInclusive` 在清单内、`fromExclusive` 不在、5 项公告、
  `preparedAt` 2026-08-07T17:16:46Z
- `version-manifest.json`：5.9.0 / **432 files** / fingerprint `ff2ebd7930310606`
- `releaseNotes.js`：date `2026.08.08`
- 门禁双模式均过：`--mode production` → `production-ready`；standard → `formal`。
  **合并后在 `7169fefd` 上重跑 production 仍过。**

### 两个账本纠正

1. **`version-manifest.json` 此前记的是 5.8.3 / 406，不是 5.8.5。**
   V5.8.4 那次回滚已经把它带回去了，所以第十五节之外流传的
   「5.8.5 对账」未决项其实并不存在。本次已被 5.9.0 / 432 覆盖。
2. `fileCount` 431 → 432 已核实：431 是在 `62fadc86` 记的，
   `d37929ee` 恰好新增 1 个文件（进度文档），而 `docs/` 是指纹 root。
   `version-manifest.json` 本身不在 roots，避免自指。

## 十九、排序硬约束（本轮新发现，下次发布仍适用）

三处门禁叠加，决定了发布期间不能穿插任何其它提交：

1. `bump-version.mjs` 顺序：`assertCleanGitWorktree()` → `currentHead !== --preview-to` 抛错
2. `sourceFingerprint()` 的 roots **含 `docs`、不含 `plan`**
3. `check-version --mode production` 里
   `assertFormalReleasePaths(changedPathsSince(toInclusive))` 是**精确允许清单**

合起来：**从阶段 A 合并到阶段 C 完成之间，集成分支必须零新增提交、零未提交改动。**
因此本轮把阶段 A 的进度文档并进了阶段 A 分支（`d37929ee`）而非另开 docs PR，
恢复账本增量则暂存在仓库外，直到阶段 C 完成才写回本文件。

**另一个缺口**：`deploy-cloudflare-staging.yml` **不跑 `check:version`**（grep 确认无该步骤）。
正式发布门禁只在本地生效，必须在派发部署前手工跑一次。

## 二十、CI 三轮真绿

| Run | 提交 | verify | secrets | 日志字节 | 五套件 |
| --- | --- | --- | --- | --- | --- |
| `31187219277` | `62fadc86` | 88s / 18 步 | 11s / 7 步 | 127333 | `7,15,225,21,58` |
| `31187703069` | `d37929ee` | 92s / 18 步 | 9s / 7 步 | 127307 | `7,15,225,21,58` |
| `31201997027` | `8a56cb53` | 87s / 18 步 | 11s / 7 步 | 127328 | `7,15,225,21,58` |

三轮 fail 全 0、`not ok` 0 行、日志魔数均为 `PK`。第三轮日志内含
`VERSION OK · V5.9.0 · 5 项更新 · 432 files · formal`。

`pnpm typecheck` 0 错，`check:workflows` 88 policies。
CSS 红线恒为 `index-Bhb7_Q2B.css` 280.33 kB。
主 JS 在阶段 B 从 `index-BMsapby4.js` 429.22 kB 变 `index-CDobI_ay.js` 429.34 kB
（`releaseNotes.js` 进 bundle、公告变长，属预期）。

**根 `pnpm build` 本地跑通的诀窍**：先 commit 让工作树干净，再 `pnpm version:preview`
（它调 `assertCleanGitWorktree`），随后 `check:version` 即通过。

## 二十一、Preview（已由用户验收）

部署 run `31188064139`（`e4082f1e`，success，deploy job **20 步**）。
wrangler 输出 `0011_directory_guangxi_cities.sql │ ✅`
—— **这是迁移真实应用的唯一有效证据**。

> `/api/v1/meta/version` 的 `schemaVersion` 在 Preview 与 Production **都**硬编码为
> `0002_work_item_ticket_numbers`（`apps/worker/src/routes/health.ts`），
> 与实际迁移无关、永不改变，**不可作判据**。

Worker Version ID `361b8879-ef00-4349-986e-81c4335f7510`，
上传 277.57 KiB / gzip 61.85 KiB，`seed_preview_data=false`、
日志内 seed 步骤 0 命中、`d1 execute` 0 行 → 既有验收数据完好。
三轮核验 `appVersion 5.8.3 / e4082f1e4b02… / env=preview`（阶段 A 不改版本号，5.8.3 是对的）。

Preview D1 实查：南区 → 广西江湖区 → 南宁(`…0002`，1299+1670) /
桂林(`50000000-…0001`，994) / 柳州(`50000000-…0002`，1249)，sort 10/20/30，
种子城市 上海/杭州/广州/深圳 未受影响。

## 二十二、阶段 C 前置：Production 复刻演练 32/32

脚本 `/workspace/drill-prod-replica/drill.mjs`（10975 字节）。
完全复刻 Production 当时现状（1 region / 1 city / 5 店含 STAGING01 挂 NULL /
cities 无 subregion_id 列）+ 真实业务行，再跑 0008→0011。

32 条断言含：4 迁移顺序应用、1299 / 1670 **既有列逐字节不变且 `updated_at` 仍是哨兵**
（零写入硬证据）、只多出 0008 的 `pending_review=0`、**只铸出 1 个 subregion**
名为 广西江湖区、目录树 = 南区→广西江湖区→南宁/桂林/柳州、南宁保留原 city id、
无 `广西` 残留、桂林/柳州继承 region_id、STAGING01 仍 NULL 且 NULL-city 店仍恰好 1 个、
无门店被清空 city、业务行数不变、0008 不把既有店置 pending、
`foreign_key_check` / `integrity_check` 干净、0011 三次重跑幂等（含时间戳）。

首轮曾红 2 项 —— 快照在 0008 前取，缺 `pending_review` 键。
改**等价断言**而非删除，同时证明演练能真的失败。

**待应用迁移仅 4 个，均无 DELETE / DROP / 表重建**：
0008（`ALTER TABLE stores ADD COLUMN pending_review` + 1 索引；
注释明确说明因 D1 上 `ALTER TABLE RENAME` 会 FK 失败，故改为轻量加列不重建表）、
0009（建 `subregions` + 加 `cities.subregion_id` + 回填 + 2 索引）、
0010（4 条 `CREATE INDEX IF NOT EXISTS`）、0011。

## 二十三、部署前发现：真实业务数据挂在 STAGING01，不在 1299

**这推翻了此前账本反复记载的「1299 五象店是唯一承载真实数据的门店」。**
部署前基线实查（Cloudflare MCP 只读）：

| 门店 | work_items | daily_closings | audit_events | 活跃成员 |
| --- | --- | --- | --- | --- |
| 1299 五象店 | 0 | 0 | 0 | 0 |
| 1670 民族东店 | 0 | 0 | 0 | 0 |
| 994 穿山店 | 0 | 0 | 0 | 0 |
| 1249 河东店 | 0 | 0 | 0 | 0 |
| **STAGING01** | **55** | **23** | **327** | **12**（admin 1 / manager 1 / operator 10） |

`STAGING01` id = `d49d4acb-e595-4f7e-b461-4c010119a42a`，`city_id` 为 NULL。

**这不增加迁移风险，反而降低**：四个迁移里没有任何一条语句提到 STAGING01，
0011 的城市逻辑触及不到它，复刻演练也专门断言它保持不变。

部署前另行核查了它会不会因为目录改动变得不可用：

- **登录路径安全**：`apps/worker/src/routes/auth.ts` 三处会话查询
  （失败告警取店、`memberships`、会话刷新）全是 `store_members JOIN stores`，
  对 cities / subregions / city_id **零引用**。那 12 个用户照常登录。
- **后台总览计数包含它**：`admin.ts` 的门店 COUNT 查询不经过城市。
- **门店详情可取**：按 id 单独查，仅"所在位置"路径 JOIN 城市，会是空。
- **目录树看不到它**：`governance.ts` 的树查询用
  `LEFT JOIN stores st ON st.city_id = ct.id`，NULL city 不匹配。
  **这是 5.8.3 就有的既有行为，非本次引入。**
- **自助注册目录不含它**：`registration.ts` 的两处查询 `JOIN cities`，
  所以它不会出现在注册可选门店里（同样是既有行为）。

## 二十四、阶段 C 部署证据

派发参数：

```
gh workflow run deploy-cloudflare-staging.yml \
  --ref feature/cloudflare-workers-d1 \
  -f release_sha=7169fefd1a3cd6d91501827cddae7aa2cafe915f \
  -f confirm_free_plan=true -f confirm_no_billing=true -f confirm_staging_only=true
```

> `deploy-cloudflare-staging.yml` 的名称是历史标签，**它就是 workshop.skin 生产线**。
> Preview 是 `deploy-cloudflare-preview.yml`。

部署 run **`31203413421`**，17:40:47Z 派发，success，deploy job **19 步 / 105s**。
Preview 那次是 20 步 —— 差的正是 seed 步骤，与「生产线没有 seed」吻合
（workflow 内 grep seed 0 命中）。

四个迁移在日志内逐个 `✅`（17:41:59Z 完成）：

```
│ 0008_store_pending_status.sql        │ ✅ │
│ 0009_directory_subregions.sql        │ ✅ │
│ 0010_admin_console_query_indexes.sql │ ✅ │
│ 0011_directory_guangxi_cities.sql    │ ✅ │
```

Worker Version ID **`700e7704-a543-4301-895b-ab964d124e70`**，
上传 277.57 KiB / gzip 61.85 KiB。身份在第 7 次轮询收敛
（前 6 次 waiting，与账本记的"部署后短暂版本混合窗口"一致）。

**两个虚警已查清**：日志里 13 行 `::error::` 全是 workflow 脚本源码被回显
（守卫语句本身，一条都没触发）；1 行含 "seed" 是 git fetch 列出的分支名
`feat/admin-seed-data`。无真实失败。

### 三轮绕缓存核验

三轮完全一致：`appVersion 5.9.0 / gitSha 7169fefd1a3c… / env=staging`，
`/health/live` 与 `/health/ready` 均 200 且 version 5.9.0（ready 会碰 D1）。

### 生产 D1 与部署前基线逐项对账

| 项 | 部署前 | 部署后 | 判定 |
| --- | --- | --- | --- |
| 迁移历史 | 止于 0007 | 0008 / 0009 / 0010 / 0011 全在 | 预期 |
| regions | 1 | 1 | 不变 |
| cities | 1（广西） | 3（南宁 / 桂林 / 柳州） | 预期 |
| subregions | 表不存在 | **恰好 1 个** 广西江湖区 `40000000-…0001` | 预期 |
| stores | 5 | 5 | 不变 |
| work_items | 55 | 55 | 不变 |
| daily_closings | 23 | 23 | 不变 |
| audit_events | 327 | 327 | 不变 |
| users | 12 | 12 | 不变 |
| store_members | 12 | 12 | 不变 |
| 1299 `updated_at` | `2026-07-27T23:18:07.513Z` | **同值** | **零写入** |
| 1670 `updated_at` | `2026-07-27T23:18:07.513Z` | **同值** | **零写入** |
| 1299 `city_id` | `30000000-…0002` | 同值（城市原地改名） | 预期 |
| 994 `city_id` | `30000000-…0002` | `50000000-…0001` 桂林 | 预期 |
| 1249 `city_id` | `30000000-…0002` | `50000000-…0002` 柳州 | 预期 |
| STAGING01 `city_id` | NULL | NULL，`updated_at` 仍 `2026-07-17T12:15:43.536Z` | 未触碰 |
| NULL-city 门店数 | 1 | 1 | 不变 |
| `广西` 残留 | — | 0 | 预期 |
| 无 subregion 的城市 | — | 0 | 预期 |
| `pending_review=1` 的店 | — | 0 | 0008 未把既有店置 pending |
| `foreign_key_check` | 干净 | 干净 | 通过 |

目录树最终形态：

```
南区 → 广西江湖区 → 南宁 (sort 10, 1299 + 1670)
                  → 桂林 (sort 20, 994)
                  → 柳州 (sort 30, 1249)
```

**注**：D1 HTTP API 拒绝 `PRAGMA integrity_check`（返 `7500: not authorized: SQLITE_AUTH`），
`PRAGMA foreign_key_check` 可用。完整性检查已在复刻演练里覆盖。

## 二十五、剩余未决

1. 图标视觉比例：现 17px 居中于 26px 内容区，参考稿折算约 10.5px。用户未反馈。
2. 是否实施乐观更新（实测 D1 往返 Production ≈ 23ms，用户体感 2–4s，
   九成在国际链路，代码层已接近上限）。
3. `apps/worker/security/security-audit.test.ts` 接入 CI 的时机
   （24 用例因 worker test glob 只匹配 `test/*.test.ts` 从未进门禁，其中 3 项预先失败）。
4. STAGING01 是否应当挂到某个城市。它承载全部真实业务数据却因 `city_id` 为 NULL
   而不出现在后台目录树与自助注册列表里。这是 5.8.3 起的既有状态，
   不影响登录与日常使用，但新版后台目录更显眼后值得决定。
