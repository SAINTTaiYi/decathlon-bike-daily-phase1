# 免费且无需外卡的部署架构决策

决策时间：2026-07-15 11:00 +08:00
状态：Accepted intent；实施尚未开始

## 用户约束

- 不再使用腾讯云 CVM/轻量服务器。
- 不接受 Railway 等可能要求海外支付方式或后续产生固定费用的常驻容器。
- 整套 Staging 与后续 Production 必须可在免费额度内运行。
- 开通免费资源不要求外币信用卡；禁止自动升级、按量付费和超额扣费。
- 保留现有多用户、事务、审计、附件与移动端 UI，不退回纯本地存储。

## 选定架构

```text
Browser
  └─ EdgeOne Makers Free
       ├─ Vite/React 静态站点
       └─ Node.js Cloud Functions（同源 /api）
            ├─ Supabase Free PostgreSQL（Supavisor transaction pooler）
            └─ Supabase Free Storage（private bucket + signed URL）

GitHub Free
  ├─ 私有源码仓库
  ├─ CI 测试/构建/Secret 扫描
  └─ EdgeOne Git Integration 自动部署
```

## 平台选择理由

### EdgeOne Makers Free

- 官方当前声明免费版长期提供，$0/月。
- 免费额度：40 个项目、500 次构建/月、Cloud Functions 100 万次/月、Edge Functions 300 万次/月、站点总存储 5 GB。
- Node.js Cloud Functions 支持 npm 生态和 Express/Koa 式框架模式，可承载现有 API 的 Serverless 适配层。
- 静态 Web 与 API 同源，避免跨站 Cookie/CORS 的复杂度。
- 无需购买腾讯云服务器，也没有“小水管”固定带宽服务器。

### Supabase Free

- MCP 已确认当前 Organization 的新项目成本为 0/月。
- 两个免费项目足够隔离 Staging 与 Production。
- 免费额度适合本门店工作台：500 MB PostgreSQL、1 GB Storage、5 GB egress。
- 保留 PostgreSQL 事务、revision 并发控制、审计和现有关系模型。
- 使用 private Storage 替换 Cloudflare R2，继续采用短期签名上传/下载 URL。

### GitHub Free

- 继续作为源码和 CI 平台。
- 私有仓库 Actions 使用免费分钟额度；部署主要交给 EdgeOne Git Integration，减少 Actions 消耗。

## 明确删除的旧架构依赖

- Railway API 容器与 `RAILWAY_*` Secret。
- Cloudflare Pages、Cloudflare R2 与 `CLOUDFLARE_*` / `R2_*` Secret。
- Railway Docker 部署、Railway runtime token、Cloudflare Direct Upload。
- 首次 Bootstrap 中原有 14/15 个 Secret 清单作废，不得再按旧文档配置。

## 实施策略

1. 保留现有 Fastify 业务/API 源码和 PostgreSQL schema，先增加 EdgeOne Node Function Serverless adapter；不重写 UI。
2. 数据库运行时连接改为 serverless-safe：Supavisor transaction pooler、每实例极小连接池、`prepare=false`。
3. R2 storage adapter 替换为 Supabase Storage private bucket adapter；保留 MIME、大小、SHA-256、数量和软删除规则。
4. Web 默认使用同源 `/api/v1/*`，不再依赖独立 Railway API 域名。
5. 新增 `edgeone.json`、Cloud Functions 入口和 EdgeOne 部署说明；用 Git 集成部署 `develop` 到 Staging。
6. CI 保留 tests/typecheck/build/workflow governance/Gitleaks；删除旧 Cloudflare/Railway release 流程后重写对应策略测试。
7. 完成全量本地验证后，才申请/创建 0 元 Supabase Staging Project；创建前向用户再次展示 $0/月并获得确认。
8. Supabase migration、private bucket、EdgeOne Project/环境变量就绪后执行真实 Staging 验收。
9. Production 继续禁止，直到免费 Staging 完整验收并单独获得用户批准。

## 免费方案的真实边界

- Supabase Free 低活跃项目可能在约 7 天后自动暂停；可从 Dashboard 恢复，免费方案不承诺 24×7 SLA。
- Supabase Free 没有托管日备份/PITR；Production 前必须增加免费、加密、可恢复验证过的导出方案，不能把“无备份”包装成已具备灾备。
- Supabase Free 的 500 MB 数据库和 1 GB 文件额度是硬容量预算；接近阈值时必须清理/归档，不自动升级。
- EdgeOne Makers 免费配额和产品条款可能调整；配置不得开启任何付费或按量计费能力。
- 免费 Staging 与 Production 使用两个独立 Supabase Free Project 和两个 EdgeOne Project，不共享 Secret 或业务数据。

## 尚未执行

- 未创建 Supabase Project。
- 未创建 EdgeOne Makers Project。
- 未修改应用运行时代码。
- 未配置任何新 Secret。
- 未部署 Staging；Production 仍禁止。
