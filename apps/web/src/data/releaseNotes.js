export const APP_VERSION = "6.7.6"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.09.09",
  title: "Shiphub 自愈停摆与 KPI 自动填数失效修复",
  summary: "修复 Shiphub 自愈冷却与 Cube 令牌刷新共用同一时间列互相顶掉，导致令牌失效后停摆 40-45 分钟、KPI 自动填数与 5 分钟自动拉取连带失效；同时确立后端更新的版本号后缀规则",
  changes: [
    "根因：自愈冷却判定读 shiphub_connections.updated_at，而 Cube 令牌每小时刷新、手动同步失败也写同一列，把冷却反复推迟；令牌一死整段停摆 40-45 分钟",
    "新增迁移 0028 与专用列 heal_last_attempted_at，自愈冷却与 updated_at 彻底解耦：常规重试 5 分钟、失败退避 30 分钟，停摆缩短到 5-10 分钟",
    "手动同步遇 refresh token 4xx 时内联程序化重登并立即重试本轮，不再干等自愈冷却；Cube 令牌刷新与失败不再改写 updated_at",
    "KPI 自动填数静默失效补上留痕：Cube 登录失败输出错误日志，不再零痕迹返回不可用",
    "新增 apps/worker/test/shiphub-heal-cooldown.test.ts 4 例行为测试；全套 747 例零失败，D1 迁移与 schema 断言同步到 0028",
    "发布规则补充后端后缀版本：纯后端更新用 pnpm version:backend 递增 6.7.6-1 形式的部署身份，公开版本与前端刷新公告保持不变"
  ]
}
