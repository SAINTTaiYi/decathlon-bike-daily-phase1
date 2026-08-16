# Shiphub 数据接入设计（待交接 / 待收货 / 待发货）

> 版本：v1.2 | 日期：2026-08-16 | 状态：设计基线（待评审）
> 关联：`SAINTTaiYi/decathlon-bike-daily-phase1`（workshop.skin）
> 数据源：Shiphub（`shiphub-asia-cn.decathlon.com.cn`）｜账号 CHU13｜门店 南宁五象店（NANNI1299 / partyNumber `0070129901299`）

---

## 1. 背景与目标

Workshop Daily Ops 需要把迪卡侬 Shiphub 的三类门店订单数据自动同步进网站：

| 类别 | 含义 | workshop 对应 |
|---|---|---|
| **hand**（待交接） | C&C 自提订单，顾客到店取货 | 待取模块「自提订单」来源 |
| **receive**（待收货） | 快递/仓配到店的待收货订单 | 新「待收货」视图 |
| **ship**（待发货） | 待发出给顾客/承运商的订单 | 新「待发货」视图 |

约束：
- **只读**：仅拉取数据，不反向写 Shiphub（取车/收货/发货确认在 workshop 本地闭环）
- **令牌不进浏览器**：OAuth2 令牌只存在于 Worker 侧（Cloudflare Secret / D1）
- **API 调用最小化**：与用户数、页面打开次数解耦，控制在常数级
- **同步集中在营业时段**，请求量保持最小化

## 2. 决策基线（已确认）

| 项 | 决策 |
|---|---|
| 后台同步频率 | **5 分钟**（营业时段 09:00-21:00，±30s 随机偏移） |
| 部署形态 | **全托管**（Cloudflare Worker cron，无需本地机器） |
| 同步范围 | hand / receive / ship 三类 |
| 事件驱动 | 店员打开待取页 / 刷新 Dashboard / 确认操作时触发（限频 ≥2~3 分钟） |

## 3. 上游接口清单（Shiphub API）

公共参数：`location_num=0070129901299`；分页 `page_num` / `page_size`；请求头 `Authorization: Bearer <access_token>`。

| 类别 | count（门控） | list | detail（商品明细） |
|---|---|---|---|
| hand | `/shiphub_web/stores/orders/count/to_hand_count` | `/shiphub_web/stores/orders/hand/list` | `/shiphub_web/stores/orders/hand/detail` |
| receive | `/shiphub_web/stores/orders/count/to_receive_count` | `/shiphub_web/stores/orders/receive/list` | `/shiphub_web/stores/orders/receive/detail` |
| ship | `/shiphub_web/stores/orders/count/to_ship_count` | `/shiphub_web/stores/orders/ship/list` | 商品明细用 `/shiphub_web/stores/orders/pick/detail`（发货视图本身不含明细） |

认证：OAuth2 authorization_code + refresh_token（PingFederate `idpdecathlon.decathlon.com.cn`），token 交换走 HTTP Basic（client_id:client_secret）。

## 4. 架构：Pull-Once-Serve-Many

```
┌─────────────────┐   cron */5 9-21 * * *（+偏移）   ┌──────────────────────┐
│  workshop.skin   │ ─────────────────────────────► │ Cloudflare Worker    │
│  React 前端       │        零 Shiphub 调用          │  Hono + D1           │
└────────┬────────┘                                  └──────────┬───────────┘
         │ 只读 D1（毫秒级）                                    │ ① refresh_token 续期（免登录）
         ▼                                                     │ ② 每类别 count（1 个最轻请求）
┌─────────────────┐   ←── 写缓存 ───  ③ count 变化才拉 list     │ ④ 只对新 ship_group_id 拉 detail
│  D1 (SQLite)     │                    ⑤ 消失的单标记 resolved  │
└─────────────────┘                                            ▼
                                                    Shiphub API（PingFederate OAuth2）
```

核心原则：**浏览器永不直连 Shiphub；令牌只在 Worker 侧；前端永远读本地缓存。**

## 5. 同步引擎（每类别状态机）

```
每轮 / 每类别（hand, receive, ship 并行执行）：
  ① GET <category>_count                        （1 个请求）
       │
       ├── count == 上次 → 本轮跳过该类别（仅 1 个请求）
       │
       └── count 变化 → GET <category>/list      （1 次）
              │
              ├── 新 ship_group_id → GET <category>/detail（1 单 1 次）
              ├── 已有且未变 → 只更新 last_seen_at（零请求）
              └── 列表消失 → status = resolved（保留历史）
```

- **事件触发**：待取页打开 / 刷新 / 确认操作时调用同一同步函数，D1 互斥锁保证同一时刻只有一个同步在跑，且距上次同步 <2 分钟则跳过（返回缓存年龄）。
- **幂等**：`INSERT ... ON CONFLICT DO UPDATE`；全量替换语义由 `first_seen_at` / `last_seen_at` 承载。

## 6. 令牌生命周期（免登录）

```
引导（仅一次，必须在门店网络执行）：
  账号密码 → POST /as/token.oauth2（authorization_code）→ refresh_token → 存 D1
运行期（永不登录）：
  每次同步前检查 access_token 过期时间
  剩 <10 分钟 → POST /as/token.oauth2（grant_type=refresh_token）→ 换新 access_token
  refresh_token 失效 → sync_state 标记错误 + 人工重新引导（门店网络）
```

- client_id / client_secret / 初始账号密码：Cloudflare Secrets（`wrangler secret put`），不进仓库、不进浏览器。
- 目标：**登录动作只发生一次**，之后全部为静默刷新。

## 7. 数据模型（D1 迁移 `0015_shiphub_sync.sql`）

```sql
-- 令牌与全局状态（单行）
CREATE TABLE shiphub_sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  token_expires_at INTEGER,
  updated_at TEXT NOT NULL
);

-- 每类别同步门控
CREATE TABLE shiphub_category_state (
  category TEXT PRIMARY KEY CHECK (category IN ('hand','receive','ship')),
  last_count INTEGER NOT NULL DEFAULT -1,   -- -1 = 从未同步
  last_sync_at TEXT,
  last_error TEXT
);

-- 订单缓存（三类统一表，category 区分）
CREATE TABLE shiphub_order (
  category TEXT NOT NULL CHECK (category IN ('hand','receive','ship')),
  ship_group_id TEXT NOT NULL,
  b2c_order_id TEXT NOT NULL,
  mail_no TEXT,
  order_platform TEXT, order_type TEXT,
  shelves TEXT, carrier_arrive_time TEXT,
  expect_pick_time_start TEXT, expect_pick_time_end TEXT,
  carrier_name TEXT, receipt_logistics_type TEXT,
  order_latest_status INTEGER,
  raw_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | resolved
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  resolved_at TEXT,
  PRIMARY KEY (category, ship_group_id)
);
CREATE INDEX idx_shiphub_order ON shiphub_order(category, status, last_seen_at);

-- 商品明细（SKU / 码数 / 颜色）
CREATE TABLE shiphub_order_item (
  category TEXT NOT NULL,
  ship_group_id TEXT NOT NULL,
  sku_id TEXT NOT NULL,
  sku_name TEXT NOT NULL,
  sku_size TEXT, sku_color TEXT, model_code TEXT,
  purchase_qty INTEGER, store_price TEXT, image_url TEXT,
  PRIMARY KEY (category, ship_group_id, sku_id),
  FOREIGN KEY (category, ship_group_id)
    REFERENCES shiphub_order(category, ship_group_id) ON DELETE CASCADE
);
```

## 8. Worker 落地清单

| 文件 | 内容 |
|---|---|
| `apps/worker/src/lib/shiphub-client.ts` | OAuth2 客户端：refresh_token 续期、Basic 认证、count/list/detail 封装、重试与超时 |
| `apps/worker/src/services/shiphub-sync.ts` | 三类状态机同步引擎 + D1 互斥锁 + 偏移 + 事件入口 |
| `apps/worker/src/routes/shiphub.ts` | `GET /api/v1/shiphub/orders?category=`（读 D1）、`GET .../orders/:category/:shipGroupId`、`POST .../orders/sync`（限频） |
| `apps/worker/src/env.ts` | 追加 `SHIPHUB_LOCATION_NUM / SHIPHUB_CLIENT_ID / SHIPHUB_CLIENT_SECRET / SHIPHUB_REFRESH_TOKEN / SHIPHUB_USERNAME / SHIPHUB_PASSWORD`（均可选，未配置时功能降级禁用） |
| `wrangler.jsonc` | `"triggers": { "crons": ["*/5 9-21 * * *"] }` |

## 9. 前端接入（apps/web）

- 待取模块：「自提订单 (Shiphub)」来源 = hand 类数据（`/api/v1/shiphub/orders?category=hand`）
- 新视图：待收货（receive）、待发货（ship）列表页，展示订单 + 商品明细
- Dashboard：三模块计数 badge 直接读 D1 缓存
- 确认操作（取车/收货/发货完成）：写入 workshop 本地流程 + 标记本地 `resolved`；下次同步若上游已移除则自动对齐

## 10. API 调用量预算（营业 12 小时，5 分钟频率，三模块）

| 类型 | 频率 | 日调用 |
|---|---|---|
| count × 3 类 | 每 5 分钟 = 144 轮 × 3 | ~432 |
| list（仅 count 变化时） | ~10 × 3 | ~30 |
| detail（仅新单） | ~20 × 3 | ~60 |
| token 刷新 | 每 2 小时 | ~6 |
| **合计** | | **~530 次/天** |

> 与用户数、页面打开次数完全解耦；浏览器直连方案（5 店员 × 每 10 分钟刷）可达数千次/天。

## 11. 实施步骤

| 步骤 | 内容 | 交付物 |
|---|---|---|
| 1 | 0015 迁移 + shiphub-client + 同步引擎 + 路由 + 测试 | PR（沿用 371 条测试体系） |
| 2 | 引导脚本（门店网络执行一次换 refresh_token） | 本地脚本，跑完即弃 |
| 3 | 前端三模块接入 + Dashboard badge | PR |
| 4 | Secrets + cron 配置，Staging 验证 | 走现有发布门禁（版本 bump 规则） |

## 12. 未决事项

1. 待收货 / 待发货在 workshop 中挂载方式：独立新视图，还是并入现有「其它交接」模块？（默认：新视图）
2. 取车/收货/发货确认是否需要在 workshop 中人工确认后才标记完成？（默认：确认操作 = 本地 resolved + 上游自动对齐）

---

> 注：链路可见性评估等运营细节保存在本地私有文档，不纳入公开仓库。
