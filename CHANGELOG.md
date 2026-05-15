# Changelog

## 0.3.0 - 2026-05-15

### 新功能

- 桌面端新增本地 EPUB 导入与阅读，支持导入对话框、封面和章节元数据保存，并通过 Foliate 阅读器打开电子书。(#26, #27, #47)
- EPUB 阅读链路新增结构化书籍索引、paragraph-aware 文本锚点和 segment 级批注任务，让批注、高亮和 AI 落点能稳定绑定章节、段落和片段范围。(#28, #29, #34, #36)
- AI 伴读新增剧透范围控制、阅读上下文打包、选区上下文、thread-first 回复上下文、descriptor 路由和 EPUB 阅读记忆，减少长书场景中的上下文漂移。(#30, #31, #32, #33, #35, #37)
- EPUB 共读新增同章 lexical related passages、评估矩阵和长片段切分，提升章节路由、证据召回和长段落共读的稳定性。(#39, #40, #41)
- 阅读器新增助手阅读 dock、滚动边缘模糊、批注导航快捷键、长批注折叠和助手 dock 动画。(#20, #21, #42, #43, #44)
- 阅读器选区复制和添加批注快捷键支持在设置中自定义，并在网页阅读器和 EPUB 阅读器中复用。(#25)

### 性能

- 新增 EPUB 性能埋点，记录导入、索引、批注生成和阅读器关键步骤耗时。(#45)
- 减少 EPUB 高亮重算，降低翻页、滚动和批注变化时的重复计算成本。(#46)

### 修复

- 修复嵌入式阅读器高度不足、精读助手控件焦点不稳定，以及短文场景下自动批注过多的问题。(#22, #23, #24)
- 修复阅读库排序变化后分组不同步的问题。(#48)
- 修正桌面端第三方许可证声明和生产依赖清单。(#49)

### 工程

- 新增 Turbo `typecheck` 任务，统一调度各 workspace package 的 TypeScript 类型检查。(#38)

### Changelog Detail

- #49 fix(desktop): correct license notices @xingkaixin
- #48 fix(desktop): sync library groups with sort @xingkaixin
- #47 feat(desktop): improve article import dialog @xingkaixin
- #46 Reduce EPUB highlight recalculation @xingkaixin
- #45 feat: add EPUB performance instrumentation @xingkaixin
- #44 feat(reader-ui): collapse long annotation bodies @xingkaixin
- #43 feat(reader): animate annotation agent dock @xingkaixin
- #42 feat: add annotation navigation shortcuts @xingkaixin
- #41 fix(epub): chunk long co-reading segments @xingkaixin
- #40 feat: add EPUB co-reading evaluation matrix @xingkaixin
- #39 feat(epub): add lexical related passages @xingkaixin
- #38 feat: add turbo typescheck task @xingkaixin
- #37 feat: add EPUB reading memory @xingkaixin
- #36 feat: add EPUB segment annotations @xingkaixin
- #35 [codex] Add EPUB thread-first context @xingkaixin
- #34 feat(epub): Add EPUB annotation reader support @xingkaixin
- #33 feat(ai): route epub co-reading by descriptors @xingkaixin
- #32 feat(ai): add epub selection context @xingkaixin
- #31 feat(ai): add reading context packing @xingkaixin
- #30 feat(epub): add spoiler-scoped reading context @xingkaixin
- #29 feat: add paragraph-aware text anchors @xingkaixin
- #28 feat(epub): add structural book index @xingkaixin
- #27 feat(desktop): add foliate epub reader @xingkaixin
- #26 feat: add EPUB import and reader @xingkaixin
- #25 feat: add reader shortcut customization @xingkaixin
- #24 fix(reader-ui): stabilize focus assistant controls @xingkaixin
- #23 fix(ai): cap short article annotations @xingkaixin
- #22 fix(reader): fill embedded reader height @xingkaixin
- #21 feat(reader): add agent reading dock @xingkaixin
- #20 feat(reader): add scroll edge blur @xingkaixin

## 0.2.0 - 2026-05-11

### 新功能

- 桌面端阅读库支持通过 URL 导入网页文章，导入时可持久化正文图片，并补齐阅读器正文的基础排版。(#1)
- 阅读器新增选区复制与快捷键、批注动作/类型图标、右侧批注筛选，让高亮、批注和证据展示更易扫描。(#6, #8, #9)
- 消息发送快捷键支持在设置中配置，并在阅读器发送、取消、提示文案中保持一致。(#5, #11)
- 用户批注支持异步推断批注类型和阅读意图，@ 助手消息可拆分为多助手任务规划。(#13)
- 新增重点共读流程，支持章节卡片、手动分配助手、章节消息和基于文章分析的路由生成。(#14)

### 修复

- 修复用户批注意图和快捷键持久化、快捷键提示归位、批注卡片单击展开，以及 SubmitShortcutKeys 组件排版问题。(#7)
- 修复 Provider 编辑器在紧凑布局中 select 菜单被 dialog overlay 遮挡的问题。(#10)
- 修复助手阅读章节遗漏正文开头内容、受页脚浅层标题影响导致章节规划失真的问题。(#12)
- 修复自动批注标签展示过长和重点共读合入后用户批注评论恢复的问题。(#13, #14)
- 修复 lint/format 任务按根级单任务运行的问题，改为 workspace package 级调度。(#3)

### 文档

- 更新开发代理文档中的 lint/format 流程，并清理 Chrome extension 相关说明、隐私文本、第三方声明和分发资料。(#2, #3)

### 杂项

- 移除 Chrome extension 工作区、运行时、桌面配对桥接和上架资产，产品线收敛到桌面端应用。(#2)
- 新增 GitHub Actions CI，在 PR 和 main 推送中运行 lint、format check、test 和 build，并固定检查时区。(#4)

### Changelog Detail

- #14 Add focus co-reading @xingkaixin
- #13 feat(reader): infer annotation labels @xingkaixin
- #12 fix(reader): include intro in assistant sections @xingkaixin
- #11 feat(shortcuts): refine shortcut settings UI @xingkaixin
- #10 fix(desktop): keep provider selects above dialog @xingkaixin
- #9 feat(reader): add annotation filtering @xingkaixin
- #8 feat(reader): add annotation icons @xingkaixin
- #7 fix(reader): persist annotation intent and shortcuts @xingkaixin
- #6 feat(reader): add selection shortcuts @xingkaixin
- #5 feat: configure message send shortcuts @xingkaixin
- #4 ci: add GitHub Actions checks @xingkaixin
- #3 fix(tooling): run lint and format per package @xingkaixin
- #2 refactor: remove Chrome extension support @xingkaixin
- #1 Add desktop URL article import @xingkaixin

## 0.1.0 - 2026-05-10

Yomitomo 的首个版本，提供本地优先的 AI 伴读体验。桌面端负责导入文章、保存阅读数据、管理 LLM provider 和阅读助手，并提供阅读、批注、统计和读后卡片工作流。

### 核心功能

- 文章阅读器：支持导入文章、阅读视图、目录、字号、内容宽度和批注侧栏。
- 高亮与批注：支持选中文本创建高亮、添加批注类型、继续评论和维护讨论线程。
- AI 伴读助手：支持配置阅读助手，让助手围绕原文、选区和讨论生成批注或回复。
- 主动精读：支持选择一个或多个助手，对文章章节进行编排式精读和批注。
- 阅读库：支持保存文章正文、原文链接、批注、评论和阅读状态。
- 读后卡片：支持基于原文、批注和讨论生成阅读审议、读后笔记和审核结果。
- 阅读统计：支持按文章、批注、讨论和读后卡片沉淀本地阅读趋势。
- 本地优先：阅读数据、provider 和助手配置保存在用户本机。

### 桌面端

- 基于 Electron 构建，提供阅读库、设置、助手、供应商、统计、日志和读后卡片视图。
- 使用 SQLite 保存文章、批注、评论、阅读审议、读后卡片、provider 和助手。
- 支持配置 OpenAI-compatible、OpenAI Responses、Anthropic 和 Gemini 等 LLM provider。
- 支持创建和管理阅读助手、审核助手，并关联指定 provider 与模型。
- 支持在桌面端集中回看和管理阅读资料。
- 支持生成阅读审议报告、AI 读后卡片，并交由审核助手检查事实归因、证据链和覆盖度。
