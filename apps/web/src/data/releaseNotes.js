export const APP_VERSION = "5.9.10"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.08.18",
  title: "Shiphub 数据整合",
  summary: "Workshop 现已支持从 Shiphub 只读同步待取自提、待收货和待发货订单，采用单门店 SSO 授权模式，Preview 环境使用合成 fixture 测试，生产环境默认关闭需手动启用。",
  changes: [
    "后端：新增 D1 schema 0015_shiphub_sync，实现 OAuth2/PKCE 连接、token 加密存储、租约控制的定时同步引擎和完整对账逻辑",
    "前端：待取车辆增加 Shiphub 自提分段，其它交接增加待收货/待发货标签，设置中心增加 Shiphub 连接管理卡片",
    "安全：refresh token 信封加密落库，access token 不持久化，密码只在 IdP 页面提交不经过 Workshop，所有日志和响应脱敏",
    "UI：订单卡片显示真实订单编号、顾客手机、车辆信息和 SKU，修复合成 fixture 数据字段映射",
    "门控：Preview 固定使用 fixture 模式零真实调用，staging/production 默认 SHIPHUB_ENABLED=false 需配置后手动启用"
  ]
}
