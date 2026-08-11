# Workshop Daily Ops

一个为自行车门店设计的日常交接管理系统。移动端优先，帮助门店员工记录销售、维修、待取车辆和交接事项，提供闭店确认流程和业务趋势查看。

[English](#english) | [中文](#中文)

---

## 中文

### 为什么做这个？

门店日常交接的三个痛点：

- **纸质记录容易丢失、字迹潦草**
- **待取车辆经常遗漏通知**
- **闭店时需要翻查多份记录**

Workshop 提供移动优先的交互界面，让交接变得清晰、可追溯。

### 核心功能

- ✅ **日常业务记录**：销售、维修、待取车辆、交接事项
- ✅ **闭店确认流程**：逐模块确认，自动提醒待取车
- ✅ **七天业务趋势**：一屏看清本店业务变化
- ✅ **移动端优先**：44px 触摸目标，WCAG 2.1 AA 可访问性
- ✅ **自助密码管理**：首次强制改密，登录失败指数退避
- ✅ **审计日志**：完整操作历史，支持安全撤回

### 技术栈

- **前端**：React 18 + Vite 5
- **后端**：Cloudflare Workers (Edge Runtime)
- **数据库**：Cloudflare D1 (SQLite)
- **部署**：Cloudflare Pages (静态资源) + Workers (API)
- **测试**：Node.js `node:test` 模块（372 测试用例）

### 在线演示

🔗 **[workshop.skin](https://workshop.skin)**

（如需试用账号，请通过 Issues 联系项目维护者）

### 项目状态

- **当前版本**：V5.9.2
- **测试覆盖**：Domain 7 / Database 10 / Web 262 / API 21 / Worker 67
- **生产运行**：已在真实门店稳定运行
- **架构**：Cloudflare Workers + D1（从旧 Supabase/EdgeOne 架构迁移而来）

### 本地开发

#### 环境要求

- Node.js 22+ (见 `.nvmrc`)
- pnpm 9.15.9
- Cloudflare 账号（用于 D1 数据库）

#### 快速开始

```bash
# 克隆仓库
git clone https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1.git
cd decathlon-bike-daily-phase1

# 安装依赖
corepack enable
corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的配置

# 运行开发服务器
pnpm dev:web    # Web 界面: http://127.0.0.1:5173
pnpm dev:worker # Worker API (需要先配置 wrangler)
```

#### 测试与构建

```bash
# 运行所有测试
pnpm test

# 类型检查
pnpm typecheck

# 构建生产版本
pnpm build
```

### 部署到 Cloudflare

详细部署文档见 [DEPLOYMENT.md](./DEPLOYMENT.md)。

**快速摘要：**

1. 创建 Cloudflare D1 数据库
2. 配置 Worker 密钥（SESSION_SECRET, CSRF_SECRET 等）
3. 运行数据库迁移：`wrangler d1 migrations apply <database>`
4. 部署：`wrangler deploy`

### 安全注意事项

- ✅ PBKDF2-HMAC-SHA-256 密码哈希（100,000 iterations）
- ✅ HttpOnly Session Cookies
- ✅ CSRF 保护
- ✅ 登录失败指数退避（最高 8 秒）
- ✅ Idempotency-Key 防重复提交
- ✅ 联系方式 AES-256-GCM 加密
- ✅ 审计日志完整记录所有操作

**重要：**
- 永远不要提交 `.env` 文件
- 所有密钥必须通过 `wrangler secret put` 设置
- 生产环境必须启用 `COOKIE_SECURE=true`

### 设计理念

项目遵循 **移动优先、高对比度、暖色工作台** 的设计基准：

- **配色**：暖奶白背景 (`#f7f5ef`) + 黑色结构 (`#0c0e0c`) + 信号黄强调 (`#ffc31a`)
- **字体**：Noto Sans SC Variable（中文）+ Barlow Condensed（操作英文）
- **布局**：移动端 320-430px 无横滚，桌面端 1024px+ 工作台模式
- **可访问性**：WCAG 2.1 AA，44px 触摸目标，键盘导航，forced-colors 支持

完整设计规范见 [DESIGN.md](./DESIGN.md)。

### 项目结构

```
apps/
  web/          # Vite/React 前端
  worker/       # Cloudflare Workers 后端
packages/
  domain/       # 共享业务逻辑
  contracts/    # Zod 契约定义
migrations/
  d1/           # D1 数据库迁移脚本
tests/          # 测试套件
.github/
  workflows/    # CI/CD 配置
```

### 功能模块

#### 1. 日常销售与闭店

- 记录当日车辆销售、安全检查、有效评价、二手车交易
- 保存销售数据后即可闭店
- 闭店后锁定写操作，但可查看历史

#### 2. 维修管理

- 维修类型：质保、付费、免费、门店产品维修
- 状态跟踪：维修中、等待配件、已开单、维修完成
- 维修完成后自动转入待取队列（门店产品维修除外）
- 联系方式加密存储

#### 3. 待取车辆

- 来源：自提订单（天猫/京东/小程序）、维修车辆、顾客暂存
- 取货码验证（仅用于当次请求，不落库）
- 通知状态管理（等待确认/已通知）
- 确认取车后自动清理

#### 4. 二手车管理

- 待上架 → 维修完毕 → 已上架在册 → 已售出
- 完整生命周期跟踪

#### 5. 其它交接事项

- 自由文本记录
- 完成后自动清理

#### 6. 审计与撤回

- 每个操作生成审计记录
- 支持安全撤回（最近一次可逆操作）
- 按日期、模块、操作者筛选

### 用户角色

- **operator**：查看数据，执行日常操作
- **manager**：包含 operator 权限 + 闭店/重开 + 数据导入
- **admin**：包含 manager 权限 + 审批调店申请
- **platform_admin**：维护门店目录，审批所有角色提权（仅限初始化时创建）

### 贡献指南

欢迎提交 Issue 和 Pull Request！

**提交 PR 前请确保：**

1. 所有测试通过：`pnpm test`
2. 类型检查通过：`pnpm typecheck`
3. 代码符合项目设计规范（见 `DESIGN.md`）
4. 提交信息清晰（推荐使用 Conventional Commits）

### 路线图

- [ ] 多语言支持（当前仅支持简体中文）
- [ ] 导出报表功能
- [ ] 桌面端原生应用（Tauri）
- [ ] 移动端 PWA 离线支持增强
- [ ] 更多数据可视化图表

### 许可证

[MIT License](./LICENSE)

### 致谢

- Cloudflare Workers/D1 提供边缘计算与数据库
- React 生态提供前端框架
- Iconoir 提供图标库

---

## English

### Why This Project?

Three pain points in daily bike shop handover:

- **Paper records get lost, handwriting is unclear**
- **Pending pickups are often forgotten**
- **Closing requires checking multiple sources**

Workshop provides a mobile-first interface to make handovers clear and traceable.

### Core Features

- ✅ **Daily Operations**: Sales, repairs, pending pickups, handover items
- ✅ **Closing Workflow**: Module-by-module confirmation with pickup reminders
- ✅ **7-Day Trends**: Business overview at a glance
- ✅ **Mobile-First**: 44px touch targets, WCAG 2.1 AA accessibility
- ✅ **Self-Service Password**: Forced password change on first login, exponential backoff
- ✅ **Audit Logs**: Complete operation history with safe undo

### Tech Stack

- **Frontend**: React 18 + Vite 5
- **Backend**: Cloudflare Workers (Edge Runtime)
- **Database**: Cloudflare D1 (SQLite)
- **Deployment**: Cloudflare Pages (static) + Workers (API)
- **Testing**: Node.js `node:test` (372 test cases)

### Live Demo

🔗 **[workshop.skin](https://workshop.skin)**

(Contact maintainers via Issues for demo accounts)

### Project Status

- **Version**: V5.9.2
- **Test Coverage**: Domain 7 / Database 10 / Web 262 / API 21 / Worker 67
- **Production**: Running stably in real stores
- **Architecture**: Cloudflare Workers + D1 (migrated from Supabase/EdgeOne)

### Local Development

See Chinese section above for detailed setup instructions.

Quick start:

```bash
git clone https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1.git
cd decathlon-bike-daily-phase1
corepack enable && corepack prepare pnpm@9.15.9 --activate
pnpm install --frozen-lockfile
cp .env.example .env  # Configure your environment
pnpm dev:web
```

### License

[MIT License](./LICENSE)

