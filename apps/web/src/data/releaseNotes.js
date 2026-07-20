export const APP_VERSION = "5.7.0"

export const currentRelease = {
  version: APP_VERSION,
  date: "2026.07.21",
  title: "修复维修撤回后再次完成的一致性",
  summary: "修复非店修完成、撤回后再次完成时的状态与操作记录不一致问题。",
  changes: [
    "撤回完整恢复关联明细并清除不再属于快照的待取数据。",
    "二次完成维修原子替换待取明细，避免状态已变更但操作历史缺失。"
  ]
}
