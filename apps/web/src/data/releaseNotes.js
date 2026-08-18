export const APP_VERSION = "5.10.0"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.08.19",
  title: "Shiphub 真实数据接入",
  summary: "Workshop 已真实接入 Shiphub，只读同步自行车订单到待取自提、待收货和待发货，采用单门店授权模式，凭证走 Cloudflare Secret。Preview 已实战验证通过。",
  changes: [
    "后端：接入真实 Shiphub API（PingFederate SSO + refresh token 轮换 + Basic 认证），按类目过滤只保留自行车订单（universe_id=2 / CYCLING），泳衣内衣等非自行车商品不进入台账",
    "前端：待取车辆 Shiphub 自提分段展示真实订单，卡片大标题=商品名称，渠道标签（小程序/京东/天猫），订单号+顾客手机并排，下单时间，长名称自动换行",
    "安全：凭证走 Cloudflare Secret（client_id/refresh token/加密密钥），refresh token 信封加密落库，access token 不持久化，密码不经过 Workshop 系统",
    "数据：migration 0016 增加渠道字段持久化（order_platform→中文渠道），订单详情保留商品名、颜色尺寸、SKU、图片、顾客手机",
    "门控：Preview 实战测试通过（hand=2 自行车、receive=0、ship=1），refresh token 持续轮换无需反复登录"
  ]
}
