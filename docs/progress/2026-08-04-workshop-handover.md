# Workshop 项目进度与助手记忆摘要

> 更新时间：2026-08-04（Asia/Shanghai）  
> 仓库：`SAINTTaiYi/decathlon-bike-daily-phase1`  
> 分支：`feature/cloudflare-workers-d1`  
> 写入目的：为后续对话提供一份简明、可追溯的项目交接事实源。内容已脱敏，不包含 API key、密码、Token、私有对话正文或设备私有绝对路径。

## 1. 当前项目状态

- 项目：Workshop / Bike Operations，线上业务站为 `workshop.skin`。
- 当前分支最新已知提交：`78fd03526071ee3b35ab3f1688f2ad36cc4977fe`。
- 最新提交主题：`feat(handover): reuse pickup cards with simple form`。
- 当前版本身份：`V5.7.9`，登记文件显示 351 个文件。
- 当前工作树在本地检查时干净。
- Production 仍保持 V5.7.9；本轮只写入文档，没有触碰 Production 或 Production D1。

## 2. 已完成的重要里程碑

1. V5.7.9 已正式发布到 `workshop.skin`，并完成线上健康端点、版本身份、安全响应头、HTTPS 跳转和 D1 数据完整性核验。
2. 页面代码与 Preview 已按用户决定恢复到 PR #99 的视觉/代码基线；恢复采用可审计普通回退，没有 reset 或强推。
3. 六大模块已取消整屏 Story Scroll / 页面切换效果，改为正常纵向文档流：`总览 → 待取 → 其它 → 维修 → 二手 → 销售`。底部导航只负责原生定位滚动。
4. 待取卡片第二轮修正已完成：展开卡片使用不透明实色亮黄 `#ffc31a`，展开/收起改为基于实际 `scrollHeight` 的高度动画，并配合 `ResizeObserver`、`transitionend` 和 reduced-motion。
5. 最近一次交接功能已进入当前分支：复用待取卡片和简单表单模式，并同步增加/调整相应测试与进度文档。

## 3. 当前验收与下一步

- 当前重点是继续验收最新待取卡片交接流程：卡片复用、简单表单、保存后状态更新、移动端触摸/键盘可用性，以及错误状态。
- Preview 验收必须由用户在真实登录态完成；Preview 通过不等于 Production 发布。
- 下一步顺序：
  1. 在 Preview 完成真实交互验收；
  2. 记录失败现象和复现步骤，必要时只修复被确认的问题；
  3. 运行测试、类型检查、构建、工作流策略和 secrets 门禁；
  4. 更新本目录进度文档与检查点；
  5. 用户明确同意后，才整理更新公告、变更正式版本号并安排 Production 候选。

## 4. 视觉与产品事实源

- 根目录 `DESIGN.md` 是唯一视觉事实源。
- 主要设计约束：暖奶白 `#f7f5ef`、暖白业务卡 `#fffdf8`、黑色结构、安全橙与既有信号黄、8px 主模块圆角。
- 使用自托管 Noto Sans SC Variable 与 Barlow Condensed Ops；移动优先，遵守 WCAG 2.1 AA、44px 触摸目标、forced-colors 和 reduced-motion。
- 不恢复已被用户否决的 Obsidian Assembly、沉浸式全幅页面切换或旧 Story Scroll 修补路线。

## 5. 已记录的工程与发布证据

- V5.7.9 历史门禁：174 项测试、typecheck、工作流策略、完整构建、冻结离线安装、双版本门禁均通过。
- 已记录的线上 Preview 纵向文档流部署候选：`75181be5480dd8bdf1f5bb0874dfdee5325e13fd`；对应实际部署 SHA：`43196392db01a023bac5f0518c2cd33a9bd73438`。
- 已记录的待取卡片第二轮候选：`5c77b1943d408b6f1a176f23eaf6d05a7c0f4816`；对应实际部署 SHA：`03373217a94025728bb8aea61da20bef7b6e24b3`。
- 以上 SHA 是历史证据，不代表当前最新分支提交或自动触发 Production 发布；每次发布仍须以精确合并 SHA、CI、Preview 和线上核验为准。

## 6. 助手长期记忆摘要（已脱敏）

### 工作方式

- 用户偏好直接、简洁、可执行的推进；不希望把简单任务拆成无关的复杂流程。
- 长任务要有明确阶段、检查点、已完成范围、证据、阻塞原因和下一步；恢复时先核验现状，不能重复不可逆副作用。
- 用户要求每次项目改动都经过 CodeGraph 前置分析和后置验证；Markdown、CSS、字体等不被 CodeGraph 索引的文件必须明确记录覆盖例外。
- Preview 仅用于验收。没有用户明确同意，不得隐式部署 Production 或增加正式版本号。

### 前端与 AI 建站原则

- 不从零生成模板化网站；先读取高质量开源项目作为结构参考，再用自己的品牌、内容和素材重构，禁止照搬。
- 设计输入应同时考虑开源骨架、交互动效、字体与排版；动效按反馈、内容进入、滚动叙事和品牌记忆点分层，通常只保留一到两个强记忆点。
- 优先考虑性能、可访问性、reduced-motion、中英混排、字体 fallback、真实素材合规、自托管、压缩、来源、许可证、用途和校验记录。

### Workshop 专项记忆

- `DESIGN.md` 是视觉唯一事实源；当前基线是 PR #99 恢复后的正常纵向文档流。
- 旧 Story Scroll、六模块整屏交接、被用户否决的两轮 Obsidian Assembly/沉浸式全幅方案都不能作为开发基线。
- 待取卡片首轮淡黄色和 grid-track 动画验收失败；第二轮已改成实色亮黄和实测像素高度动画，后续以真实触控体验为准。
- Production 与 Production D1 的历史运维标签和既有栈不能随意重命名或另建第二套。

### 长任务与本机工程环境

- 已部署 crash-safe 的长任务与跨对话恢复机制：任务需先持久化，再后台执行；支持心跳、日志、重接管、检查点和 reconcile。
- 本机 Termux 没有 `apply_patch`、`perl`、`rg`；可靠编辑方式是 quoted heredoc + Node 精确替换，小步验证并检查 `git status` / `git diff --check`。
- CodeGraph 可通过其已安装的 Node 入口直接调用；不能因为 shell wrapper 不在 PATH 就判断未安装。
- Android 无线调试和 Chrome DevTools MCP 需要先验证当前连接、前台页面、单一端口转发和代理绕过；浏览器验收不可用时必须如实报告，不得静默改用用户浏览器或无障碍。

### Headroom 与服务稳定性

- 当前助手使用本机 loopback-only 的 Headroom 代理和本地 MCP；服务、缓存、恢复巡检和开机恢复均已配置。
- 上游切换和服务重启已有独立核验记录；不得在文档中写入 API key、认证头、密码或私有日志正文。
- Headroom 的作用是压缩长上下文并保留恢复事实源；大段原始输出应先压缩，身份、SHA、部署、迁移和安全结果等精确事实必须保留原值。

## 7. 安全与记录边界

本文件只保留项目交接所需的事实。以下内容明确不写入 GitHub：API key、Token、密码、SSH 私钥、个人隐私、设备私有路径、隐藏会话账本全文、用户未公开的业务数据、D1 明文备份和第三方凭据。需要恢复这些内容时，使用本机私有账本和受控凭据，不从 GitHub 文档反推。

---

**恢复入口：** 先读取本文件，再读取 `DESIGN.md`、最近的 `docs/progress/` 文档和当前分支 Git 状态；以当前精确代码/CI/Preview 证据覆盖历史摘要，不把历史 SHA 当作当前 HEAD。
