# 部署指南 / Deployment Guide

本文档介绍如何将 Workshop Daily Ops 部署到 Cloudflare Workers + D1。

---

## 前置要求

1. **Cloudflare 账号**（免费套餐即可）
2. **Node.js 22+** 和 **pnpm 9.15.9**
3. **Wrangler CLI**：`npm install -g wrangler@latest`

---

## 第一步：创建 Cloudflare D1 数据库

```bash
# 登录 Cloudflare
wrangler login

# 创建 D1 数据库
wrangler d1 create workshop-ops-db

# 输出示例：
# ✅ Successfully created DB 'workshop-ops-db' in region APAC
# 
# [[d1_databases]]
# binding = "DB"
# database_name = "workshop-ops-db"
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**记下 `database_id`，下一步会用到。**

---

## 第二步：配置 Worker

### 2.1 复制并编辑 `wrangler.jsonc`

```bash
cp wrangler.jsonc wrangler.deploy.jsonc
```

编辑 `wrangler.deploy.jsonc`，修改以下字段：

```jsonc
{
  "name": "workshop-ops",  // 你的 Worker 名称
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "workshop-ops-db",
      "database_id": "<你的 database_id>"  // 替换为第一步获得的 ID
    }
  ],
  "vars": {
    "APP_ENV": "production",
    "CORS_ALLOWED_ORIGINS": "https://workshop-ops.<your-subdomain>.workers.dev"
  }
}
```

### 2.2 设置 Worker 密钥

以下密钥**必须通过 `wrangler secret put` 设置，永远不要提交到代码库**：

```bash
# 会话密钥（至少 32 字节随机字符串）
wrangler secret put SESSION_SECRET

# CSRF 密钥（至少 32 字节随机字符串）
wrangler secret put CSRF_SECRET

# 密码 pepper（至少 32 字节随机字符串）
wrangler secret put PASSWORD_PEPPER

# 联系方式加密密钥（32 字节 base64url 编码）
# 生成方法：node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
wrangler secret put CONTACT_ENCRYPTION_KEY

# 平台管理员初始化令牌哈希（SHA-256）
# 生成方法：printf '%s' '<your-setup-token>' | sha256sum
wrangler secret put PLATFORM_ADMIN_SETUP_TOKEN_HASH

# （可选）邮箱验证码功能
wrangler secret put REGISTRATION_SECRET
wrangler secret put RESEND_API_KEY
wrangler secret put RESEND_FROM
```

**安全建议：**
- 使用强随机密钥生成器（如 `openssl rand -base64 32`）
- 每个环境（开发/预发/生产）使用不同的密钥
- 定期轮换密钥

---

## 第三步：运行数据库迁移

```bash
# 应用所有迁移到远程 D1 数据库
wrangler d1 migrations apply workshop-ops-db --remote --config wrangler.deploy.jsonc

# 输出示例：
# Migrations to be applied:
# ┌────┬─────────────────────────────────────────┐
# │ id │ name                                    │
# ├────┼─────────────────────────────────────────┤
# │  1 │ 0001_initial_sqlite.sql                 │
# │  2 │ 0002_work_item_ticket_numbers.sql       │
# │ ...│ ...                                     │
# └────┴─────────────────────────────────────────┘
# ✅ Successfully applied 10 migrations.
```

---

## 第四步：构建并部署

```bash
# 生成构建元数据
pnpm generate:build-metadata

# 运行测试和类型检查
pnpm test && pnpm typecheck

# 构建前端和 Worker
pnpm build

# 生成压缩的 Worker bundle
pnpm build:worker-bundle
cp dist/worker/index.min.js dist/worker/index.js

# 部署到 Cloudflare
wrangler deploy --config wrangler.deploy.jsonc
```

**输出示例：**

```
Total Upload: 277.57 KiB / gzip: 61.85 KiB
Uploaded workshop-ops (x.xx sec)
Published workshop-ops (x.xx sec)
  https://workshop-ops.<your-subdomain>.workers.dev
```

---

## 第五步：验证部署

```bash
# 检查健康端点
curl https://workshop-ops.<your-subdomain>.workers.dev/health/live
# 应返回: {"status":"ok","version":"5.9.2",...}

curl https://workshop-ops.<your-subdomain>.workers.dev/health/ready
# 应返回: {"status":"ready",...}

# 打开浏览器访问
open https://workshop-ops.<your-subdomain>.workers.dev
```

---

## 第六步：初始化平台管理员

1. 生成一次性初始化链接：

```bash
# 你的初始化令牌（与 PLATFORM_ADMIN_SETUP_TOKEN_HASH 对应）
SETUP_TOKEN="your-secure-token"

echo "https://workshop-ops.<your-subdomain>.workers.dev/#platform-admin=$SETUP_TOKEN"
```

2. **在隐私窗口中打开该链接**，完成平台管理员账号创建
3. **立即删除 `PLATFORM_ADMIN_SETUP_TOKEN_HASH` 密钥**：

```bash
wrangler secret delete PLATFORM_ADMIN_SETUP_TOKEN_HASH
```

---

## 自定义域名（可选）

如果你有自己的域名（如 `workshop.example.com`）：

```bash
# 在 Cloudflare Dashboard 中添加域名
# Workers & Pages → workshop-ops → Settings → Triggers → Add Custom Domain

# 或使用 wrangler
wrangler deploy --config wrangler.deploy.jsonc --route "workshop.example.com/*"
```

**记得更新 `CORS_ALLOWED_ORIGINS` 密钥：**

```bash
wrangler secret put CORS_ALLOWED_ORIGINS
# 输入: https://workshop.example.com
```

---

## 环境变量完整清单

| 变量名 | 类型 | 必需 | 说明 |
|--------|------|------|------|
| `SESSION_SECRET` | Secret | ✅ | 会话令牌 HMAC 密钥，至少 32 字节 |
| `CSRF_SECRET` | Secret | ✅ | CSRF 令牌 HMAC 密钥，至少 32 字节 |
| `PASSWORD_PEPPER` | Secret | ✅ | 密码哈希 pepper，至少 32 字节 |
| `CONTACT_ENCRYPTION_KEY` | Secret | ✅ | 联系方式 AES-256-GCM 密钥，32 字节 base64url |
| `PLATFORM_ADMIN_SETUP_TOKEN_HASH` | Secret | 仅初始化 | 平台管理员初始化令牌的 SHA-256 哈希 |
| `REGISTRATION_SECRET` | Secret | 可选 | 邮箱验证码签名密钥，至少 32 字节 |
| `RESEND_API_KEY` | Secret | 可选 | Resend API 密钥（用于发送邮箱验证码） |
| `RESEND_FROM` | Secret | 可选 | 发件人邮箱（如 `Workshop <noreply@example.com>`） |
| `CORS_ALLOWED_ORIGINS` | Var | ✅ | 允许的 CORS 来源，逗号分隔 |
| `APP_ENV` | Var | ✅ | 环境标识：`local`/`staging`/`production` |
| `COOKIE_SECURE` | Var | ✅ | 生产环境必须设为 `"true"` |
| `SESSION_TTL_HOURS` | Var | 可选 | 会话有效期（小时），默认 12 |

---

## 更新部署

```bash
# 拉取最新代码
git pull origin main

# 应用新的数据库迁移（如果有）
wrangler d1 migrations apply workshop-ops-db --remote --config wrangler.deploy.jsonc

# 重新构建并部署
pnpm build && pnpm build:worker-bundle
cp dist/worker/index.min.js dist/worker/index.js
wrangler deploy --config wrangler.deploy.jsonc
```

---

## 监控与日志

### 查看实时日志

```bash
wrangler tail workshop-ops
```

### 查看 D1 数据库

```bash
# 连接到远程数据库
wrangler d1 execute workshop-ops-db --remote --command "SELECT COUNT(*) FROM users"

# 或使用本地开发工具
wrangler d1 execute workshop-ops-db --local --file query.sql
```

### Cloudflare Dashboard

访问 [Cloudflare Dashboard](https://dash.cloudflare.com) → Workers & Pages → workshop-ops：

- **Metrics**：请求量、错误率、延迟
- **Logs**：实时日志流
- **Settings**：环境变量、绑定、触发器

---

## 故障排查

### 问题：部署后 `/health/ready` 返回 500

**可能原因**：D1 数据库未正确绑定或迁移未应用

**解决方法**：

```bash
# 检查 wrangler.deploy.jsonc 中的 database_id 是否正确
wrangler d1 list

# 重新应用迁移
wrangler d1 migrations apply workshop-ops-db --remote --config wrangler.deploy.jsonc
```

---

### 问题：登录时提示 "密钥配置错误"

**可能原因**：Worker 密钥未设置

**解决方法**：

```bash
# 检查密钥是否存在
wrangler secret list

# 重新设置缺失的密钥
wrangler secret put SESSION_SECRET
wrangler secret put CSRF_SECRET
wrangler secret put PASSWORD_PEPPER
```

---

### 问题：CORS 错误

**可能原因**：`CORS_ALLOWED_ORIGINS` 未包含你的域名

**解决方法**：

```bash
# 更新 CORS 配置
wrangler secret put CORS_ALLOWED_ORIGINS
# 输入: https://your-domain.com,https://workshop-ops.xxx.workers.dev
```

---

## 回滚部署

Cloudflare Workers 支持版本管理：

```bash
# 查看部署历史
wrangler deployments list

# 回滚到指定版本
wrangler rollback --message "Rollback due to issue X"
```

---

## 安全清单

部署到生产环境前，请确认：

- [ ] 所有密钥使用强随机生成器创建
- [ ] `COOKIE_SECURE` 设为 `"true"`
- [ ] `CORS_ALLOWED_ORIGINS` 仅包含信任的域名
- [ ] 平台管理员初始化后删除 `PLATFORM_ADMIN_SETUP_TOKEN_HASH`
- [ ] D1 数据库已启用自动备份（付费功能，或手动导出）
- [ ] 设置了 Cloudflare WAF 规则（可选）
- [ ] 启用了 Rate Limiting（免费套餐有限制）

---

## 免费套餐限制

Cloudflare Workers Free Plan：

- ✅ 100,000 请求/天
- ✅ 10ms CPU 时间/请求
- ✅ D1：5GB 存储 + 500 万行读 + 10 万行写/天

**对于小型门店（<50 员工）完全够用。**

如果需要更多配额，升级到 Workers Paid ($5/月起)。

---

## 进一步阅读

- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [D1 数据库文档](https://developers.cloudflare.com/d1/)
- [Wrangler CLI 文档](https://developers.cloudflare.com/workers/wrangler/)
- [项目 GitHub Issues](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/issues)

---

**需要帮助？** 在 [GitHub Issues](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/issues) 提问。
