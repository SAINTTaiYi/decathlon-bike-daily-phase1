# 门店目录与自助注册 — 实施检查点

**记录时间：** 2026-07-26 02:38 +08:00  
**工作分支：** `feat/store-directory-self-registration`  
**开始基线：** `8c03ac9b6dc1637e21a4afb8f7e27c15f1fe1072`  
**公开版本：** V5.7.8（Preview-only 变更不递增版本）  
**部署状态：** 未部署；仅允许后续 Preview 人工验收，Staging/Production 未授权。

## 完成范围

- 受控全国目录、`@decathlon.com` OTP 自助注册、CHU13 platform-admin、角色提权、目标门店 admin 调店审批。
- D1/Supabase 前向迁移与旧成员关系收敛，含既有门店代码的稳定 id 保留。
- Worker 路由、原子状态机与条件化审计；Web 注册、初始化与治理界面；配置、CI 与事实源同步。

## 质量证据

| 门禁 | 结果 |
| --- | --- |
| CodeGraph 前置 | 168 files / 1,868 nodes / 5,683 edges |
| CodeGraph 后置 | 176 files / 2,031 nodes / 6,237 edges |
| D1 顺序迁移演练 | 通过：`0001` → `0006`，含多门店历史和既有 `1299` 代码 |
| 数据库 tests | 通过 |
| Worker tests | 通过 |
| 全量 `pnpm test` | 通过 |
| 全量 `pnpm typecheck` | 通过 |
| 工作流策略 | 88 policies 通过 |
| `git diff --check` | 通过 |

## 安全边界

- 无 Resend API key，未写入仓库、日志或环境；不发送真实 OTP。
- `work2die.asia` 已验证为发送域；真实 key 仅在 Preview 即将部署时创建并作为 Preview Worker secret 配置。
- 不执行 Staging 或 Production 迁移/部署。

## 恢复队列

1. 提交功能实现并登记 Preview source fingerprint；
2. 完整 build + Worker bundle + secret scan；
3. PR、GitHub CI、正常合并；
4. 仅在既有授权下部署 Preview，随后由用户人工验收注册、CHU13 提权、目标门店审批调店和审计。
