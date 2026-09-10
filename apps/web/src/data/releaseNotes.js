export const APP_VERSION = "6.7.7"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.09.10",
  title: "Shiphub 同步偶发停摆修复（上游超时护栏）",
  summary: "修复 Shiphub 同步偶发静默停摆：token 刷新与程序化登录的上游调用没有超时，上游不响应时整个同步被挂起且不留失败记录；现为全部上游调用加超时护栏，挂死转为可重试的明确失败",
  changes: [
    "排查定位：Shiphub 同步出现 3 段静默停摆（最长 2 小时 34 分），期间无成功也无失败，只在同步记录里留下 48 条悬挂状态",
    "根因：同步链路的 token 刷新与程序化登录 fetch 没有任何超时，上游静默不响应时整个同步周期被无限期挂起，进程回收后无失败记录、无告警",
    "修复：所有上游调用统一加超时护栏——Shiphub token 刷新与登录、BI/Cube 登录与数据拉取、告警与验证码邮件全部纳入",
    "超时转为明确错误码（OAUTH_TOKEN_TIMEOUT / LOGIN_PAGE_TIMEOUT / PERFECO_TIMEOUT 等），交给既有的失败计数、下轮重试与自愈逻辑接管：最坏情况从静默停摆 2.5 小时降为一次可控失败",
    "新增 10 例回归测试（真实挂起服务的行为断言 + 每个 fetch 与超时信号一一配对的结构护栏），注入旧写法实测 3 条断言变红",
    "全套 800 例零失败（worker 242 / web 510 / api 21 / database 20 / domain 7）"
  ]
}
