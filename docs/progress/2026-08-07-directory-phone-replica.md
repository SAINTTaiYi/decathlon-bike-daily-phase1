# 2026-08-07 · 后台目录手机形态复刻 + 图标特异度修复 · Preview 已验收

Preview 已由用户验收通过。**Production `workshop.skin` 全程未部署、未触碰**，仍在
`5.8.3 / 3ec28a321b1f1f02a28a0e4d94abb1be1432065b / env=staging`（三轮绕缓存核验一致）。

上 Production 卡在两个待决事项（见文末），未获明确答复前不得部署。

## 身份

集成分支 `feature/cloudflare-workers-d1` = **`bfc5196e2056f956f7dff238db46f5fc61503664`**
（= 已部署 Preview 的 SHA）。

| 步骤 | PR | 合并 SHA | 时间 (UTC) |
| --- | --- | --- | --- |
| 参考稿复刻 | #182 (`c424f11`) | `60cd19f4c628a1c173716c0f02a3f7dcdbc028ad` | 11:41:04Z |
| 图标特异度修复 | #183 (`347809d`) | `bfc5196e2056f956f7dff238db46f5fc61503664` | 12:03:04Z |

`bfc5196` 与 `347809d` 的树 `git diff --stat` 为空——前者就是把后者合进 `60cd19f` 的合并点。

Preview 部署：run `31175088838`（`60cd19f`）、run `31176618036`（`bfc5196`），均 success，
`seed_preview_data=false`。Preview 三轮核验 `5.8.3 / bfc5196e2056… / env=preview`。

CI：run `31174340691`（`c424f11`）、run `31176377681`（`347809d`），均 success。
步骤数 18/7、verify 89s/84s、日志实体 125252/125216 字节且魔数 `PK`、
五套件 domain 7 / database 10 / web 220 / api 21 / worker 58 全 `fail 0`、`not ok` 0 次。

**红线**：主 CSS `index-Bhb7_Q2B.css` 在本地与 CI 始终同哈希 280.33 kB，
证明所有规则落在后台 chunk、未泄漏全局；后台 chunk 41.12 → 41.35 kB。
线上产物逐字节核验：抓 `PlatformAdminConsole-Cv6VIHn7.css`（41350 字节，200），
复合选择器出现 4 次、SVG 钉尺寸 1 次、命中区 44px 2 次。

契约 40 → 45 条（`comm` 比对确认无一条被删）。

## 参考稿定标（反解，而非猜栅格值）

用户 18:44 上传的 `ff20874f….png` / `e8e384ce….png` **sha 完全相同**（1050102 字节 853×1844），
是用生图模型基于线上截图重绘的目标稿，不是线上现状。

用已知 CSS 值反解缩放比：`.admin-region` 手机端 `padding-left: 12px` 对上稿中卡片左边缘 26px
→ 2.17，与 853/390 = 2.187 交叉验证吻合 → 参考稿 = **390px 视口 @2.187×**。
逐项回算全部落在整数 CSS 值上，这才是它可复刻的依据：
行高 44 / 图标框 28 / 状态标签高 20 / 圆点 6 / 成员强调条 2 / 门店卡 46 / 卡间距 10 / 缩进步长 20。

色板无需改动：绿标签底实测 `rgb(232,238,231)`，与现有 `rgb(23 97 60 / .1)`
叠在 `#fffdf8` 上算出的 `rgb(233,237,229)` 同源。

树连接线实测**只有一条竖干**（28.5px），小区/城市各自并无竖干；竖干**止于最后一支的分叉点**
（终点 730.7 对最后门店卡中心 731.3，差 0.6px）。参考稿自身的小区/城市横支是断的短桩
（生图抖动），已按门店行的完整横支统一实现。

## 用户实机定标（后续手机端改动的基准）

物理分辨率 **1280×2772**（用户口述 2772×1280，宽高说反）。截图 `d9338d81….jpg`
为 baseline JPEG 原生未缩放（SOF0，Y 分量 2×2 子采样）。

沙箱无 PIL / numpy / 任何 JPEG 库，故自写 **DC-only 解码器**：只解每个 8×8 块的直流系数，
13920 个 MCU 全解，得 160×348 亮度网格，精度 ±8 物理像素。

| 锚点 | 已知 CSS | 实测物理 | 反推 DPR |
| --- | --- | --- | --- |
| 树行心间距（跨 2 个间隔） | 44px | 144 | 3.273 |
| `.admin-header` | 72px | 232 | 3.222 |
| `.admin-header-exit` | 48×44px | ~144–160 × ~136–152 | 3.0–3.33 |

三者收敛 → **CSS 视口 ≈ 390–391px，DPR ≈ 3.27–3.28**。
与参考稿同宽，几何 1:1 映射，**无需窄屏断点**；原先担心的 365.7px（DPR 3.5）档不成立。

同一张截图（19:46 = 11:46Z，早于 12:08Z 的修复部署）也用于**实测验证坏态诊断**：
图标框 144 物理 = 44 CSS、框心间距 144 物理 = 44 CSS、"小点"仅占单格 → ≤2.4 CSS。
三项与推算一致。

## 五处结构改动（#182）

1. 琥珀圆点取代 `+/−` 作层级标记
2. 单竖干 + 横支的树连接线
3. 门店恢复独立圆角卡
4. 成员恢复独立卡 + 2px 琥珀左强调条
5. 门店卡操作移到首行右侧、次行只留成员数；层级缩进改为「子级圆点对齐父级名称起点」

**三处有意偏离参考稿**（均因参考稿是对含缺陷线上态的重绘）：

- 成员卡「移除」并回角色行。参考稿里它独占一行居中，成因是三列网格容纳六个子元素时
  第六个溢出到第四行第一列、而该列是 `1fr` 故文字居中——生图把 bug 当设计复制了。
  改四列后成员卡 118px → 约 93px。**要照搬把四列改回三列即可复现。**
- 图标框保持 28px 视觉尺寸，命中区 `::after` 扩到 44px（间距 6.4 → 14px），
  门店卡因此比参考稿高约 6px。参考稿的 28px 框 + 6.4px 间距低于 44px 触摸目标。
- 横支按完整实现（见上）。

## 本轮最重要的教训：CSS 特异度失效，且契约对其完全隐形（#183）

用户报「按钮全是一个框框加一个小点」。

根因：`admin-console.css` 802 行 `.admin-directory-actions button { padding: 0 12px }`
特异度 **(0,1,1)**，压过我写的裸类 `.admin-directory-icon-action { padding: 0 }` **(0,1,0)**。
`border-box` 下 28 − 2(边框) − 24(内边距) = **内容宽 2px**，再撞 `base.css` 的
`img, svg { max-width: 100% }`，17px 图标被等比压成 2×2 垂直居中 = 「框里一个点」。
同时 1656 行 `min-height: 44px` (0,1,1) 压过 `height: 28px`，框成 44 高 × 28 宽竖长矩形。

**上一轮 `42936cc` 没坏，是因为写的 `width: 44px` → 内容宽 44 − 2 − 24 = 18px ≥ 17px，
靠 2px 余量侥幸成立，不是正确写法。** 同理被压掉的还有 `border-radius`（802 行 6px）
与 `flex-basis: 88px`（1846 行）。

修法：选择器提到 **(0,2,1)** 复合形式 `.admin-directory-actions button.admin-directory-icon-action`，
并显式钉死 SVG（`flex: 0 0 17px` + width/height/max-width），不再依赖内容宽余量。

**契约盲区（CI 全绿却放行 bug 的真正原因）**：45 条契约用文本子串匹配，
`.admin-directory-icon-action {` 是 `button.admin-directory-icon-action {` 的子串，
所以换选择器后正则照样通过——**契约只验声明"写没写"，不验"是否胜出"**。
已把特异度锁进门禁，并做**反向验证**：临时改回裸类，第 36 条契约确实变红（`not ok 36`），
恢复后 45/45 全绿。

**后续凡在此文件写手机覆盖，必须先查块外是否存在同元素同属性的 (0,1,1) 及以上选择器。**

## Production 就绪性核查（实测，非推断）

### 种子数据隔离：结构性隔离，不靠约定

| | database_name | database_id |
| --- | --- | --- |
| Production `workshop.skin` | `bike-ops-staging` | `91e78387-9b24-4126-a5a1-27f9c1792975` |
| Preview | `bike-ops-preview` | `e40af8eb-6340-4b9e-8484-20247323fd84` |

两库物理隔离。种子步骤只存在于 Preview 工作流，命令硬编码
`wrangler d1 execute bike-ops-preview --config wrangler.preview.jsonc`，且挂 `if: inputs.seed_preview_data`。
**生产工作流 `deploy-cloudflare-staging.yml` 内无任何 seed 字样。**
故 Preview 的 华东/上海/静安店 等种子无路径进入生产库。

### 生产库现状（只读查询）

`d1_migrations` 止于 `0007`；无 `subregions` 表；`stores` 无 `pending_review`；`cities` 无 `subregion_id`。
→ 0008 / 0009 / 0010 三个迁移都会执行。

组织结构：大区 `南区`（1）→ 城市 `广西`（1）→ 门店 5（`1249 河东店`、`1299 五象店`、
`1670 民族东店`、`994 穿山店`，另有 `STAGING01 Staging Store` 且 `city_id` 为 NULL）。

行数：users 12、store_members 12、work_items 53、daily_closings 22、audit_events 318、
role_change_requests 0、store_transfer_requests 0、handover_details 19、pickup_details 25、
repair_details 14、resale_details 7、work_item_counters 1、auth_sessions 68、idempotency_requests 246。

### 同构演练（D1 导出失败，改用等价手段）

**D1 export API 返回 `signed_url: null`，未取得生产库转储。** 改为在本地 SQLite
用**同一份迁移字节**应用 0001–0007 重建同构库（迁移文件在 `347809d` 与 `bfc5196` 上
逐字节相同，校验和 `d81cbaa02e1313e6` / `64fc827570af92cb` / `192047874cd0bcf2`），
再应用 0008/0009/0010。

关键发现：**`0006` 迁移自身就 seed 了 `南区` / `广西` / 那 4 家店**，
所以基线无需手工插入即可复现生产组织结构——也说明 0009 里那条改名是**当初有意为之**，
不是残留的 preview 数据。

实测结果：

```
tables added   : ['subregions']        tables DROPPED : []
cities         : +['subregion_id']     DROPPED: []
stores         : +['pending_review']   DROPPED: []
indexes added  : 7                     indexes DROPPED: 0
row count diff : subregions None -> 1  （其余表计数不变）
regions/cities/stores 的 id 与 name  : 全部 unchanged
foreign_key_check violations : 0       integrity_check : ok
stores.pending_review        : 0 -> 5 stores（无店翻成待审核）
```

**演练缺口（如实记录）**：`store_members` / `work_items` / `audit_events` 的插入因 CHECK
约束未攻克而失败，这三张表在演练中为空，故"计数不变"对它们是平凡真，不构成证据。
改用静态分析补足：

- **13 张表从未被三个迁移的文本提及**，因此不可能被修改：`store_members`、`work_items`、
  `daily_closings`、`audit_events`、`handover_details`、`pickup_details`、`repair_details`、
  `resale_details`、`work_item_counters`、`auth_sessions`、`idempotency_requests`、
  `import_jobs`、`app_releases`。
- 12 条语句逐条分类：`DELETE` 0 条、`DROP` 0 条。**唯二写数据的语句**是
  `INSERT INTO subregions` 与 `UPDATE cities SET subregion_id`。
  `regions` / `users` / `role_change_requests` / `store_transfer_requests` 在此仅被读。

### 已排除的最大风险

用户连续否决并已回滚的 V5.8.4 / V5.8.5 桌面工作台**不会回归**：两个 revert
（`2e17802`、`01b3834`）都是集成头的祖先，且 `desktop-workbench.css`、
`desktop-endfield.css`、`responsive.css` 三个文件与 Production `3ec28a3` **逐字节相同**。

### 版本账本（订正先前记录）

`version-manifest.json` 现为 **5.8.3**，与 Production 实际版本一致——
先前记载的「仍记 5.8.5」是错的，`2e17802` 那次 revert 已将其改回。故不存在对账问题，
`check:version` 也不会拦。

但生产工作流在 build 前先跑 `pnpm version:preview` 写 preview 登记，
`check:version` 走 standard 模式因而通过。结果是**部署后 Production 会报
`appVersion 5.8.3` 而 `gitSha` 跳到 `bfc5196`（领先 69 个提交）**，版本号与实际代码脱钩。
脚本里防这件事的是 `--mode production` 分支（要求 `formal-release.json`），生产工作流未用。

## 未决事项（需用户决定，未答复前不得上 Production）

1. **0009 的硬编码改名**。第 16–17 行 `WHEN name = '南区' THEN '广西江湖区'`，
   命中生产库唯一的大区。演练实测结果为 `南区 → 广西江湖区 → 广西 → 4 家店`。
   四层目录需要这个中间层，但**名字是写死在迁移里、非从数据推导，属业务命名决定**。
   Preview 库已应用到 0010，直接改 0009 会让两边永久不一致；建议新增 0011 改名。
2. **版本号**：保持 5.8.3 只换 SHA，还是正式升版（`pnpm version:release` +
   `version:release:stamp` + `formal-release.json`）。
3. 69 个提交的**发布范围**：除目录外还含 admin console v2、提交延迟优化
   （Smart Placement、`saveKpi`/`clearKpi` 去 `sync:'full'` 会在闭店/重开时触发
   已完成记录自动清理）、登录指数退避。这些只在 Preview 用种子数据验证过，
   从未在真实业务数据上跑过。可选择只发目录相关提交以缩小面。
4. `security-audit.test.ts`（24 用例，从未进 CI）接入门禁的时机。
