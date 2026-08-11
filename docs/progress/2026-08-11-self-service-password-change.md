# 2026-08-11 · 自助密码修改 · PR #193 CI 通过待 Preview 决策

状态：实现、全量验证、本地构建、提交、推送、PR 创建与代码头 CI 均已完成；PR 可合并，尚未部署 Preview 或 Production，也未改正式版本号。

## 当前身份

| 项 | 值 |
| --- | --- |
| 分支 | `feat/self-service-password-change-20260811` |
| 基线 | `e608e17` (`chore(release): prepare formal release V5.9.2`) |
| PR | [#193](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/pull/193)；open、mergeable clean |
| 功能提交 | `32e1406`；认证竞态修复并验证的代码头 `f7080f4a754f6da7c5ec97163b73a4747938d4f8` |
| 工作树保留项 | `apps/worker/test/registration-e2e.test.ts` 为用户已有未跟踪本地测试；未修改、未删除，且未纳入功能提交 |

## 已实现范围

- 普通已登录用户可从“日报菜单”进入“修改密码”对话框。
- 平台管理员在 `#admin` 管理后台头部也可直接进入同一对话框。
- 表单校验当前密码、新密码最小/最大长度、禁止复用和确认输入一致性；请求飞行中锁定全部密码字段与操作。
- 首次登录的强制改密页复用相同校验器与重试策略；原先错误的 “Argon2id” 页面表述已改为准确的“单向密码哈希”。
- Worker 改密接口使用严格共享契约、CSRF 和幂等键；幂等记录仅保存带 Pepper 的请求证明，不保存密码明文或普通密码摘要。
- 改密成功时清除历史失败计数与临时锁定，保留当前会话、撤销其它会话并写无敏感内容的账号审计。
- 两个设备竞争改密时，基于旧密码哈希的条件更新只允许一个写入；冲突设备被安全退出并显示使用新密码重新登录的提示。
- 登录完成写入同样绑定已验证的密码哈希：改密若先落库，正在完成的旧密码登录将返回普通 401，不能留下晚到的新会话。
- Worker 测试脚本现在先构建共享 contracts 产物，不依赖被 Git 忽略的本机 `dist` 残留。

## 验证

- Node 22 (`/workspace/toolchains/node-v22.22.2-linux-arm64/bin`) 下，按 Git 已跟踪测试文件执行 CI 等价测试：`[7, 15, 262, 21, 67]`，共 **372/372** 通过，失败 0。
  - 本机 `pnpm test` 会额外加载用户保留、未提交的 18 条注册 E2E，因此本地全量为 `[7, 15, 262, 21, 85]`、**390/390**；该组不冒充 PR/CI 计数。
  - 新增 Worker HTTP/D1 覆盖：当前会话保留、其它会话撤销、旧密码失效、新密码登录、失败计数/锁定清除、无敏感内容审计、错误当前密码/复用/缺失 CSRF/缺失幂等键无副作用、同 key 重试、双设备并发改密，以及改密与已验证旧密码登录的竞争窗口。
- `pnpm typecheck`：通过。
- `pnpm -r --if-present build`：通过；Web 产物为 `index-cBGufafr.js` 442.78 kB（gzip 146.52 kB）、`index-BItFUlDh.css` 284.84 kB（gzip 76.63 kB）。
- `pnpm build:worker-bundle`：通过，生成 395.5 kB 常规和 229.8 kB minified Worker bundle。
- `pnpm check:workflows`：通过，5 个 workflow、88 条策略。
- Gitleaks 8.30.1 只扫描本次 20 个变更文件：0 findings。
- `git diff --check`：通过。
- PR #193 代码头 CI run `31502463869`（head `f7080f4a754f…`）：`verify` 81 秒、`secrets` 10 秒，均 success。日志 ZIP 135,235 字节且魔数为 `PK`；五套件 `[7,15,262,21,67]`、失败 0，新竞态用例按名出现，`##[error]` 为 0。

`pnpm build` 根门禁仍被既有版本账本阻断，错误为“Preview 登记版本 5.9.0 与当前 V5.9.2 不一致”。该命令在本次改动前已不能通过；修复需要在干净工作区执行 Preview 版本登记，属于提交/Preview 流程，未在此变更中擅自处理。

默认 Node 18 会被仓库 `engines.node >=20 <25` 拦截，不能作为 Worker 验证结果；后续 Node/pnpm 命令均显式使用 Node 22。

## CodeGraph 覆盖例外

当前沙箱没有可执行的 CodeGraph 入口；仓库 `code/*.json` 快照指向历史提交 `4c4dffb`，不能作为当前代码事实。已做手动前置调用链审计：

`MenuDialog` / `PlatformAdminConsole` -> `App` -> `useAuth` -> `api/auth` -> `authRoutes` -> `users` / `auth_sessions` / `audit_events`。

CSS 是 CodeGraph 非索引对象：`apps/web/src/styles/admin-console.css` 与 `apps/web/src/styles/workshop-system.css` 的新规则受前端契约、forced-colors 覆盖和 Web build 验证。后置调用链审计与前置链路一致，并确认 `PASSWORD_CHANGE_CONFLICT` 会在前端清掉失效会话并传递到登录页。

## 下一步

1. 审阅本地验收服务中的普通用户、首次登录与平台管理员三条入口。
2. 推送、创建 PR、等待 CI 后再由用户决定是否部署 Preview。
3. Production 不在本次流程内，除非用户另行明确授权。
