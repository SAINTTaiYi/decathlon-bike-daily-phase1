# 2026-08-11 · 自助密码修改 · 已部署 Preview 待验收

状态：实现、全量验证、PR #193 合并与 Preview 部署均已完成；机器验收通过，等待真实账号人工验收。Production 未部署，正式版本仍为 V5.9.2。

## 当前身份

| 项 | 值 |
| --- | --- |
| 分支 | 功能分支 `feat/self-service-password-change-20260811`；证据分支 `docs/self-service-password-preview-evidence-20260811` |
| 基线 | `e608e17` (`chore(release): prepare formal release V5.9.2`) |
| PR | [#193](https://github.com/SAINTTaiYi/decathlon-bike-daily-phase1/pull/193) 已合并 |
| 功能提交 | `32e1406`；认证竞态修复代码头 `f7080f4a754f6da7c5ec97163b73a4747938d4f8` |
| 集成 / Preview SHA | `2cf33d9a087a0c40b817d56cd2b96e6cf3760895` |
| Preview | `https://bike-ops-preview.geeklightonefish.workers.dev` |
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
- 最终 docs-only CI run `31503086504` 的 `verify` / `secrets` 也均为 success，随后 PR #193 普通合并。GitHub 返回 `merged=true`，并由 `git fetch` 独立观察集成分支 `e608e17..2cf33d9`，PR 头为 merge commit 第二父提交。

## Preview 部署证据

- 部署 run `31503624851`（head `2cf33d9a087a…`）完成 success，`seed_preview_data=false`，第 17 步 seed 明确 skipped，既有 Preview 验收数据未覆盖。
- 部署日志 ZIP 118,189 字节且魔数为 `PK`；D1 输出 `No migrations to apply!`，说明本次为纯代码发布、数据库零迁移。
- 上传 `278.92 KiB / gzip 62.20 KiB`，Worker Startup Time 13 ms，Worker Version ID `7d3b4340-bf82-4aa9-af4a-e28845f7114e`；身份在工作流第 6 次探测收敛，日志 `##[error]` 为 0。
- 三轮绕缓存独立核验 Preview 的 live / ready / meta 均为 HTTP 200，身份一致：`5.9.2 / 2cf33d9a087a… / environment=preview`。
- 同期三轮核验 Production `workshop.skin` 仍为 `5.9.2 / e608e17b79d… / environment=staging`，未部署、未触碰。
- Preview 线上产物为 `index-cBGufafr.js`、`index-BItFUlDh.css`、`PlatformAdminConsole-12oJ0wFO.js`；“修改密码”、账号安全标题、成功提示、并发冲突提示和后台入口无障碍标签均在实际部署产物中命中。

`pnpm build` 根门禁在本地未发布工作树上曾被既有 Preview 账本阻断；CI 与 Preview 工作流都会先运行 `pnpm version:preview`，本次两条远端门禁均已成功完成。正式版本号没有变化。

默认 Node 18 会被仓库 `engines.node >=20 <25` 拦截，不能作为 Worker 验证结果；后续 Node/pnpm 命令均显式使用 Node 22。

## CodeGraph 覆盖例外

当前沙箱没有可执行的 CodeGraph 入口；仓库 `code/*.json` 快照指向历史提交 `4c4dffb`，不能作为当前代码事实。已做手动前置调用链审计：

`MenuDialog` / `PlatformAdminConsole` -> `App` -> `useAuth` -> `api/auth` -> `authRoutes` -> `users` / `auth_sessions` / `audit_events`。

CSS 是 CodeGraph 非索引对象：`apps/web/src/styles/admin-console.css` 与 `apps/web/src/styles/workshop-system.css` 的新规则受前端契约、forced-colors 覆盖和 Web build 验证。后置调用链审计与前置链路一致，并确认 `PASSWORD_CHANGE_CONFLICT` 会在前端清掉失效会话并传递到登录页。

## Preview 人工验收

1. 普通用户：从“日报菜单”打开“修改密码”，验证错误当前密码、密码复用、两次输入不一致和成功提示。
2. 会话撤销：另一设备先登录；本设备改密成功后仍保持登录，另一设备刷新应回到登录页，旧密码不能再登录，新密码可以登录。
3. 首次登录账号：管理员重置出临时密码后登录，必须先完成强制改密才能进入工作台。
4. 平台管理员：从 `#admin` 顶部钥匙入口打开同一对话框，检查桌面和手机布局。

Production 不在本轮操作范围内；只有 Preview 验收通过并再次获得用户明确授权后，才能安排正式发布。
