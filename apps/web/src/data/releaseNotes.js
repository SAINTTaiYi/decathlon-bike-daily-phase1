export const APP_VERSION = "6.7.5"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.09.08",
  title: "门店数据边界与自助接入",
  summary: "门店数据边界铁律落地：BI/Shiphub/Cube 全链只认本店提交的账号，白名单与部署级账密废除；快照按归属门店门控",
  changes: [
    "门店提交本店 ShipHub 账密后自动派生三链路身份（Shiphub 同步、BI 销量/周报、KPI 自动填写）",
    "BI 快照卡只对数据归属门店渲染，其它门店只看本店动态数据（fail-closed）",
    "BI 同步白名单机制废除：无本店凭据的门店绝不拉取（含部署凭据配置齐全时）",
    "门店数据函数凭据必传（类型层面杜绝静默回退部署级共享凭据）",
    "修复移动端注册门店下拉透明穿模（菜单绝对定位实底+全局主题泄漏收窄）",
    "边界回归测试 6 例 + CI 自动化（新接入 API 三件套断言门槛）"
  ]
}
