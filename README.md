# Workshop Daily Ops

自行车门店日常交接与闭店管理系统。移动端优先，用于记录销售、维修、待取车辆和交接事项，并提供闭店核对、业务趋势、门店治理和审计能力。

[English](#english) | [中文](#中文)

---

## 中文

### 核心功能

- 日常销售、安全检查、评价与二手车数据记录
- 维修、待取车辆、二手车和其它交接的跨日台账
- 闭店前逐模块确认与逐台车辆盘点
- 七天业务趋势与平台管理后台
- 自助注册、首次改密、自助改密与登录失败退避
- 完整审计历史、乐观锁、幂等提交和安全撤回
- 移动端 320-430px 无横向滚动，44px 触摸目标

### 技术栈

- **前端**：React 18 + Vite 5
- **运行时**：Cloudflare Workers + Workers Static Assets
- **API**：Hono
- **数据库**：Cloudflare D1 (SQLite)
- **测试**：Node.js `node:test`

### 在线环境

[workshop.skin](https://workshop.skin) 当前运行 `V5.9.2`，环境标识为 **Staging**。独立 Production Worker 和 Production D1 尚未创建。

### 项目状态

- 当前版本：`V5.9.2`
- 当前 D1 schema：`0011_directory_guangxi_cities`
- 本地验证：Domain 7 / Database 15 / Web 260 / API 21 / Worker 68，共 371 条测试
- Preview 与 Staging 使用独立 Worker 和 D1
- Production 发布工作流已迁移到 Cloudflare，但仍受 Staging 验收、独立资源、加密备份和恢复演练门禁约束
- 当前 Cloudflare 运行时不提供附件存储；附件 API 返回 `410 MEDIA_DISABLED`

### 本地开发

要求：Node.js 22+、pnpm 9.15.9。

```bash
git clone https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1.git
cd decathlon-bike-daily-phase1
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev:web
```

本地运行 Worker：

```bash
pnpm build:web
wrangler dev
```

### 验证

```bash
pnpm check:workflows
pnpm version:preview
pnpm test
pnpm typecheck
pnpm build
```

`version:preview` 只登记当前源码指纹，不修改公开版本号。

### 部署

- 运行环境与防回归手册：[docs/OPERATIONAL-SAFETY-RUNBOOK.md](./docs/OPERATIONAL-SAFETY-RUNBOOK.md)
- 通用 Cloudflare 部署说明：[DEPLOYMENT.md](./DEPLOYMENT.md)
- GitHub 发布治理：[AUTOMATED-DEPLOYMENT.md](./AUTOMATED-DEPLOYMENT.md)
- Staging 配置：[docs/STAGING-ACCOUNT-SETUP.md](./docs/STAGING-ACCOUNT-SETUP.md)
- Production 准备：[docs/PRODUCTION-BOOTSTRAP.md](./docs/PRODUCTION-BOOTSTRAP.md)

发布顺序固定为：源码身份校验、冻结依赖安装、测试/类型检查/构建、D1 迁移、Worker 与静态资源部署、线上版本/SHA/环境/readiness 验证。

### 安全边界

- PBKDF2-HMAC-SHA-256 密码哈希与服务端 pepper
- HttpOnly Session Cookie 与 CSRF 防护
- 登录失败指数退避
- Idempotency-Key 防重复提交
- 联系方式 AES-256-GCM 加密
- 完整操作审计与门店级权限边界
- Secret 只能通过 Cloudflare/GitHub Environment 配置，不得进入仓库
- Production 必须使用独立于 Preview/Staging 的全部 Secret

### 项目结构

```text
apps/
  web/       React/Vite 前端
  worker/    Cloudflare Worker/Hono API
  api/       旧 Fastify/Supabase 兼容实现
packages/
  contracts/ 共享契约
  domain/    共享业务规则
  database/  兼容数据库工具与测试
migrations/
  d1/        当前 D1 前向迁移
```

### 主要业务模块

1. **销售与闭店**：保存当日销售数据后满足闭店门槛；闭店前核对待取、维修与其它交接。
2. **维修**：质保、付费、免费、门店产品维修；完成后按规则进入待取。
3. **待取**：自提订单、维修车辆、顾客暂存、二手车四种来源；确认取车后进入清理流程。
4. **二手车**：待上架、维修完成、在册、售出与待取衔接。
5. **其它交接**：自由文本事项，真实完成后清理。
6. **审计与撤回**：按日期、模块、操作者筛选，并仅允许撤回最近一次安全可恢复事件。
7. **平台治理**：门店目录、用户、角色提权、调店审批和平台审计。

### 路线图

- [ ] 独立 Production Worker/D1 与恢复演练
- [ ] 把 `workshop.skin` 从 Staging 切换到已验收的 Production
- [ ] 在 Cloudflare 架构下重新设计附件存储
- [ ] 多语言支持
- [ ] 报表导出增强
- [ ] PWA 离线支持增强

### 许可证

[MIT License](./LICENSE)

---

## English

Workshop Daily Ops is a mobile-first bike-shop handover and closing system. It tracks daily sales, repairs, pickups, resale bikes, and handover items with server-side rules, audit history, store governance, and closing safeguards.

### Stack

- React 18 + Vite 5
- Cloudflare Workers + Workers Static Assets
- Hono API
- Cloudflare D1
- Node.js `node:test`

### Status

- Version: `V5.9.2`
- Schema: `0011_directory_guangxi_cities`
- Verified locally: 371 tests, typecheck, and production build
- [workshop.skin](https://workshop.skin) currently reports `APP_ENV=staging`
- Preview and Staging are isolated
- Production resources have not been created
- Attachments are disabled in the active Cloudflare runtime

See the Chinese section and the linked deployment runbooks for setup, validation, and release gates.
