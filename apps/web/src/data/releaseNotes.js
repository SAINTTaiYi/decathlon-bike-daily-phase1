export const APP_VERSION = "5.5.9"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.19",
  title: "暂存/自提联系方式对齐维修结构",
  summary: "顾客暂存与自提改为与维修车辆相同的联系方式二级菜单（手机号/会员号）；可不填，卡片空值显示「无」。",
  changes: [
    "待取表单联系方式改为与维修车辆相同的 fieldset：联系标识类型 + 手机号/会员号。",
    "联系方式可不填；卡片空值显示「无」。",
    "前后端校验同步允许空联系方式，会员号以「会员号：」前缀写入 meta。"
  ]
}
