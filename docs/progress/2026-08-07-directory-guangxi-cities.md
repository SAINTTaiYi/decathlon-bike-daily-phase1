# 2026-08-07 · 广西拆分为南宁/桂林/柳州 + 显式发布版本号 · 阶段 A 已交付待验收

三阶段计划的**阶段 A（零代码风险层）**已实现并通过 CI。阶段 B（升 V5.9.0）与
阶段 C（上 Production）都还没动，等用户验收 Preview 后再逐级推进。

**Production `workshop.skin` 全程未部署、未触碰。**

## 身份

| 项 | 值 |
| --- | --- |
| 特性分支 | `feat/directory-guangxi-cities-set-version-20260807` |
| 提交 | `62fadc86d66539931e59ba2b7af5e5efd99e1683` |
| PR | #186 |
| base（集成分支合并前） | `40a975c815a9add7933dc963b8166fe137cb3be7` |
| CI run | `31187219277` · success |

CI 真伪判据（不只看 conclusion）：`verify` 步骤 18 / 88s、`secrets` 步骤 7 / 11s，
日志实体 127333 字节且魔数为 `PK`，日志内五套件计数 `7, 15, 225, 21, 58`、
`# fail` 全 0、`not ok` 0 行。与本地逐项一致。

## 改动（6 文件，+66/−9 加两个新文件）

| 文件 | 性质 |
| --- | --- |
| `migrations/d1/0011_directory_guangxi_cities.sql` | 新增 3773 字节 |
| `apps/worker/security/d1-test-adapter.ts` | 迁移清单追加 0011（0010 补尾逗号） |
| `packages/database/test/directory-cities.test.mjs` | 新增 8731 字节 · 5 条契约 |
| `scripts/version-number.mjs` | 新增 `resolveReleaseVersion()` |
| `scripts/bump-version.mjs` | 改用 `resolveReleaseVersion(version, values['set-version'])` |
| `tests/version-number.test.mjs` | 追加 5 条契约 |

## 0011 迁移：五条语句，三个风险点全部落地

目标目录形态：`南区 → 广西江湖区 → 南宁(1670, 1299) / 桂林(994) / 柳州(1249)`。

1. 广西 **原地改名**为南宁（`id` 不变）→ 已经指向它的 1670 与 **1299 零写入**。
   带 `NOT EXISTS` 守卫，防撞 `UNIQUE (region_id, normalized_name)`。
2. 插入桂林（`50000000-…0001`，sort 20）。`region_id`/`subregion_id` 都从南宁行
   **继承**，不硬编码 —— 0009 的 subregion id 是 `ROW_NUMBER()` 生成的，
   Preview 与 Production 的取值不一定相同。
3. 插入柳州（`50000000-…0002`，sort 30），规则同上。
4. 994 → 桂林：字面量目标 id + `EXISTS` 守卫。
5. 1249 → 柳州：同上。

三个待解风险点的处理：

- **NULL 守卫**：门店 UPDATE 一律用字面量 city id 加 `EXISTS`，不用裸子查询 ——
  子查询返回 NULL 会把 `stores.city_id` 抹平、门店从目录静默消失。
  新城市插入额外要求 `base.subregion_id IS NOT NULL`，因为 `governance.ts`
  用 INNER JOIN 接 subregions，`subregion_id` 为 NULL 的城市根本不会被渲染。
- **`ON CONFLICT` 多列语法**：完全绕开。改用 `INSERT … SELECT … WHERE NOT EXISTS`，
  不依赖任何未在 D1 实测过的冲突目标语法。
- **`sort_order`**：南宁沿用既有 10，桂林 20，柳州 30。

全文无 `DELETE`、无 `DROP`、无 `ALTER`，与既有 10 个迁移一致地不使用显式事务。

## 验证

**`node:sqlite` 真实执行演练**：0001–0010 建基线（11 个迁移全部可应用，含 0007），
应用 0011 后 32 项断言全通过。`node:sqlite` 是仓库既有测试引擎
（`packages/database/test/d1-migration-execution.test.mjs` 早已在用），CI 的 Node 22
本来就跑得通，不需要降级兜底。

**5 条 CI 契约**（`packages/database/test/directory-cities.test.mjs`）：
改名后 1670/1299 零写入（哨兵 `updated_at` 不被覆盖）、目录树等于
`南区 → 广西江湖区 → 南宁(2)/桂林(1)/柳州(1)`、994/1249 落到正确城市、
新城市必有 `subregion_id` 且 `normalized_name = name`、连跑三次完全幂等、
外键与 `integrity_check` 干净，外加文本契约钉死"不含破坏性语句、从不点名 1299"。

**反向验证**：对 0011 做三个突变，A（改名换成删+插）触发 2 条、B（删 EXISTS 守卫）
触发 1 条、C（`subregion_id` 置 NULL）触发 2 条；恢复后 sha256 与突变前一致。
突变 B 只触发文本契约而没触发执行断言，符合预期 —— EXISTS 守卫只在"城市不存在"
的失败路径上改变行为，正常路径删掉它行为不变，所以只能靠文本契约钉住。

对 `resolveReleaseVersion` 同样做三个突变，分别触发 3/1/2 条，恢复后 sha256 一致。

**其它门禁**：`pnpm typecheck` 0 错；`pnpm check:workflows` 88 条策略；
`pnpm version:preview` 记录 public V5.8.3 不变 / 431 文件；`pnpm build`（根，含
`check:version`）退出 0；`pnpm --filter @bike-ops/web build` 后主 CSS 仍为
`index-Bhb7_Q2B.css` **280.33 kB**，红线未破。

## `--set-version`：为什么必须有

`nextInterfaceVersion('5.8.3')` 得 **5.8.4**，而 V5.8.4 与 V5.8.5 都是已在 Production
出现过又被回滚、被用户否决的版本号。自然递增会把它们重新用一遍，导致同一版本号
指代两份不同的线上代码。

`resolveReleaseVersion(current, explicit)` 在不传 `--set-version` 时行为与原来逐字节
等价；传入时校验三段式格式并**强制严格单调递增**，杜绝降级或重复发布同一版本号。
影响面仅限 `bump-version.mjs` —— `stamp-version.mjs` 只消费 `APP_VERSION`，不重算。

## ⚠️ 阶段 B 的排序约束（本轮新发现）

`scripts/bump-version.mjs:19` 断言 `--preview-to` 必须等于**运行那一刻的 HEAD**，
而 `sourceFingerprint()` 的 roots **含 `docs`、不含 `plan`**。

两者合起来意味着：**阶段 A 合并与阶段 B 提交之间不能有任何其它合并**，包括
docs-only 的进度文档 PR。所以本文档随阶段 A 同一个 PR 一起进，不再单独开 PR。
`plan/` 下的恢复账本不在指纹内，可以随后单独提交。

## 下一步

1. 合并 PR #186 → 得 `SHA_A_merge`。
2. 部署 Preview（`deploy-cloudflare-preview.yml`，三个 confirm 全 true，
   **`seed_preview_data=false`**）。Preview D1 现在的结构是
   `南区 → 广西江湖区 → 广西` 挂全部 4 家店，与 0009 之后的 Production **完全相同**，
   是 0011 的真实排练场。
3. 交用户验收目录树。
4. 验收后才进入阶段 B（`--set-version 5.9.0`），阶段 C 需用户再次明确同意。
