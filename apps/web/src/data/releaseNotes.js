export const APP_VERSION = "6.6.5"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.09.05",
  title: "页头磨砂裁剪与页头焦点环移除",
  summary: "修复桌面导航首项被页头磨砂背板遮挡且点击被吞；页头填充+模糊改为 mask 裁到真实占位，左栏事件放行 rail；移除页头图标按钮焦点环。",
  changes: [
    "修复：桌面导航「总览」不再被页头磨砂背板遮挡（根因：rail 在内容层堆叠上下文内叠不过导航层；填充+模糊搬进 ::before 并 mask 裁到页头真实占位）",
    "修复：导航层 hit-test 不再吞掉 rail 首按钮点击（pointer-events 分层放行）",
    "移除页头图标按钮（菜单/搜索/铃铛）的焦点环白框；移动端页头保留黄环",
    "新增回归断言：mask 占位、hit-test 放行、焦点环排除，注入事故写法实测变红"
  ]
}
