# Changelog

## 0.5.0 - 2026-05-26

### 新功能

- 桌面端新增 PDF 导入和阅读链路，支持本地 PDF 入库、目录、选区、批注视觉统一、助手 dock 和 PDF 重点共读。(#122, #123, #124, #125, #130, #131, #133, #134)
- 微信读书集成新增笔记同步、阅读统计和 API key 设置说明，方便把微信读书沉淀接入 Yomitomo 的本地阅读库。(#139, #140, #159)
- 阅读体验补齐键盘翻页、内置阅读字体和设置自动保存状态反馈，让 EPUB、PDF 和设置页的日常操作更稳定可感知。(#141, #145, #153)
- 桌面端文章更新链路改为 typed IPC 和局部 article patch，减少全量 store 替换对阅读状态、设置草稿和多窗口同步的干扰。(#117, #118, #119, #120, #121)

### 性能

- 优化桌面端启动、统计页加载和二级模块预加载，并减少导入流程中的全量 store 读取。(#112, #113, #137, #142)
- 为 EPUB 上下文和索引范围查询建立索引，降低长书章节定位、上下文检索和批注生成的重复扫描成本。(#143, #161)
- 减少阅读器批注扫描和滚动时的布局工作，并补充 PDF 打开性能追踪，方便定位大文档加载瓶颈。(#115, #138, #144)

### 修复

- 修复 PDF 选区、目录行为、批注流和 PDF 想法展开对齐问题。(#130, #136, #162)
- 修复阅读器正文字号继承、外部链接打开、动画布局成本、中等宽度批注布局和助手菜单裁切问题。(#110, #114, #116, #146, #160)
- 修复桌面端资料页保存后弹窗关闭、文件导入对话框回归风险，并补充相关测试覆盖。(#109, #155)

### 工程

- 拆分桌面端 article summary records、store 持久化、article settings、main IPC 注册、文件导入对话框、PDFium reader utils 和 source reader session 边界，降低主进程与阅读器耦合。(#135, #147, #148, #149, #150, #151, #154, #156)
- 拆分 shared 类型导出和 reader-ui 模块边界，并集中 agent annotation actions，减少跨包导入面和重复动作逻辑。(#152, #157, #158)
- 清理 PDF.js 依赖、函数作用域告警，补充 reader interaction flow、agent theater data flow 和桌面 store patch 规则文档。(#127, #128, #129, #132)
- 新增开发资源隔离、release proxy worker、官网文档/changelog 页面和 animated logo 实验，完善发布与官网基础设施。(#107, #108, #111, #126)

### Changelog Detail

- #162 fix(desktop): align PDF thought expansion @xingkaixin
- #161 perf(core): optimize EPUB index range lookup @xingkaixin
- #160 fix(reader-ui): prevent assistant menu clipping @xingkaixin
- #159 feat(weread): add API key setup docs @xingkaixin
- #158 refactor(reader-ui): organize module boundaries @xingkaixin
- #157 Centralize agent annotation actions @xingkaixin
- #156 refactor(desktop): centralize source agent actions @xingkaixin
- #155 test(desktop): cover file import dialog regressions @xingkaixin
- #154 refactor(desktop): split store article settings @xingkaixin
- #153 feat(desktop): add bundled reader fonts @xingkaixin
- #152 refactor(shared): split type exports by domain @xingkaixin
- #151 refactor(desktop): split store persistence @xingkaixin
- #150 refactor(desktop): split main ipc registration @xingkaixin
- #149 refactor(desktop): share source reader session @xingkaixin
- #148 refactor(desktop): extract PDFium reader utils @xingkaixin
- #147 refactor(desktop): abstract file import dialog @xingkaixin
- #146 fix(reader): adjust medium annotation layout @xingkaixin
- #145 feat(settings): add autosave status feedback @xingkaixin
- #144 perf(reader-ui): reduce annotation scans @xingkaixin
- #143 perf(core): index EPUB context lookups @xingkaixin
- #142 perf(desktop): avoid full store reads during import @xingkaixin
- #141 feat(reader): add arrow key page turns @xingkaixin
- #140 feat(weread): add reading stats @xingkaixin
- #139 feat(weread): add note sync @xingkaixin
- #138 Improve PDF open performance tracing @xingkaixin
- #137 Preload secondary desktop modules @xingkaixin
- #136 Fix PDF selection and TOC behavior @xingkaixin
- #135 Refactor article summary records @xingkaixin
- #134 Unify PDF reader annotation visuals @xingkaixin
- #133 feat(pdf): add focus co-reading @xingkaixin
- #132 docs: add agent theater data flow @xingkaixin
- #131 feat(pdf): show agent dock for assistant notes @xingkaixin
- #130 Align PDFium annotation flow @xingkaixin
- #129 chore(desktop): remove pdfjs dependency @xingkaixin
- #128 chore(desktop): clear function scoping warnings @xingkaixin
- #127 Add reader interaction flow docs @xingkaixin
- #126 Add animated logo experiment @xingkaixin
- #125 Migrate PDF reader to EmbedPDF @xingkaixin
- #124 feat(pdf): add outline toc and improve selection @xingkaixin
- #123 feat(desktop): add PDF reader MVP @xingkaixin
- #122 feat(desktop): add PDF import scaffold @xingkaixin
- #121 docs: document desktop store patch rules @xingkaixin
- #120 feat(desktop): unify article patch application @xingkaixin
- #119 feat(desktop): return import patches @xingkaixin
- #118 feat(desktop): return article save patch @xingkaixin
- #117 feat(desktop): add typed IPC contract map @xingkaixin
- #116 fix(desktop): open reader links externally @xingkaixin
- #115 perf(reader): reduce annotation scroll work @xingkaixin
- #114 fix(reader): reduce layout-heavy reader animations @xingkaixin
- #113 feat(desktop): optimize stats page loading @xingkaixin
- #112 Optimize desktop startup performance @xingkaixin
- #111 feat(web): add docs and changelog pages @xingkaixin
- #110 fix(reader): inherit EPUB body font size @xingkaixin
- #109 fix(desktop): close profile dialog after save @xingkaixin
- #108 feat(desktop): isolate development resources @xingkaixin
- #107 feat(download): add release proxy worker @xingkaixin

## 0.4.0 - 2026-05-21

### 新功能

- 桌面端新增应用更新流程，并把关于页、引导页和官网下载入口连到 GitHub Release 产物。(#51, #100, #101)
- 新增产品官网 `apps/web`，提供 Yomitomo landing page、macOS / Windows 下载链接、SEO 元信息、sitemap、robots 和社交预览图。(#94, #100, #101)
- 设置页新增数据管理能力，可查看数据目录、日志和数据库文件，备份/还原 SQLite 数据库，并在数据库版本不兼容时给出明确提示。(#93, #95, #96)
- Provider 设置改为安全保存 API key，支持显式查看已保存 key、拉取模型列表、配置任务路由，并简化模型设置表单。(#52, #97, #98, #99)
- 阅读器想法和讨论体验升级，支持选区 `@助手` 路由、审阅助手评论、批注讨论卡、悬浮目录、双侧笔记栏和待处理助手状态。(#78, #85, #90, #91, #102, #104)

### 调整

- 移除读后输出流程，让产品重心收敛到原文锚点、想法线程、评论讨论和助手共读。(#76)
- 阅读库拆分网页文章和 EPUB 电子书入口，优化首页布局、返回来源、资料卡片和 EPUB 导入记录体积。(#54, #86, #87, #88)
- 阅读器布局和交互进一步打磨，包括源阅读器布局、批注连接线、想法计数、共读控制、头像 hover 和想法输入器交互。(#77, #83, #84, #89, #103, #105)

### 性能

- EPUB 阅读复用 DOM 文本索引，减少翻页、页面更新和批注渲染的重复计算。(#74, #79, #80)
- 优化批注热路径、运行时 import 热点和阅读库 article payload 加载，降低大书和大库场景下的启动与交互成本。(#81, #82, #92)

### 修复

- 修复 EPUB 批注渲染、翻页速度、页面位置恢复、页面更新和堆叠批注连接线稳定性问题。(#72, #73, #74, #75, #79)
- 修复 Provider 删除 API key 后名称保留、开发数据库迁移历史保留、数据库兼容错误展示和目标批注归属保持问题。(#71, #93, #95, #103)
- 修复阅读库返回后来源丢失、助手待处理态不可见、想法输入器交互细节和共读控制状态问题。(#84, #88, #104, #105)

### 工程

- 拆分 main app state、source bookcase、设置面板、reader 组件、批注评论输入器、助手批注队列、agent runtime、provider settings 和 EPUB runtime 边界，降低核心 UI 与运行时代码复杂度。(#53, #55, #56, #58, #60, #61, #63, #65, #66, #68, #69, #70)
- 抽取阅读卡片工作流状态、source agent 请求管线和代码健康热点边界，并补充运行时性能热点审计文档。(#57, #62, #64, #67, #82)

### Changelog Detail

- #105 fix(reader): polish thought composer interactions @xingkaixin
- #104 fix(reader): show pending assistant state @xingkaixin
- #103 fix(reader): preserve target annotation ownership @xingkaixin
- #102 feat(reader): route selection mentions @xingkaixin
- #101 Add social preview assets and desktop links @xingkaixin
- #100 Update web landing page downloads and SEO @xingkaixin
- #99 fix(provider): simplify model settings @xingkaixin
- #98 [codex] Reveal stored provider API keys @xingkaixin
- #97 Improve model routing settings UI @xingkaixin
- #96 feat(desktop): add data management settings @xingkaixin
- #95 fix(desktop): preserve dev DB migration @xingkaixin
- #94 feat(web): add product landing page @xingkaixin
- #93 fix(desktop): show database compatibility errors @xingkaixin
- #92 fix(library): lazy-load article payloads @xingkaixin
- #91 [codex] Add review assistant comments @xingkaixin
- #90 feat(reader): float toc and balance note rails @xingkaixin
- #89 fix(desktop): refine profile avatar hover state @xingkaixin
- #88 fix: preserve library source on return @xingkaixin
- #87 fix(desktop): shrink EPUB import records @xingkaixin
- #86 fix(desktop): adjust library home layout @xingkaixin
- #85 feat(reader): update annotation discussion cards @xingkaixin
- #84 Fix reader thought counts and co-reading controls @xingkaixin
- #83 Fix reader library UI polish @xingkaixin
- #82 perf: optimize runtime import hotspots @xingkaixin
- #81 perf: optimize annotation hot paths @xingkaixin
- #80 perf: reuse EPUB DOM text index @xingkaixin
- #79 fix: stabilize ebook page updates @xingkaixin
- #78 feat: refine annotation thought threads @xingkaixin
- #77 fix(reader): align source reader layout @xingkaixin
- #76 feat: remove reading output flows @xingkaixin
- #75 fix(desktop): restore ebook page position @xingkaixin
- #74 fix(desktop): speed up ebook page turns @xingkaixin
- #73 fix(reader): align stacked annotation connector @xingkaixin
- #72 fix: stabilize EPUB annotation rendering @xingkaixin
- #71 fix(desktop): preserve provider name on key removal @xingkaixin
- #70 refactor(desktop): split ebook runtime boundary @xingkaixin
- #69 refactor(ai): split agent runtime boundary @xingkaixin
- #68 refactor: split provider settings boundary @xingkaixin
- #67 refactor: split code health boundaries @xingkaixin
- #66 refactor: split source bookcase runtime state @xingkaixin
- #65 refactor(desktop): split main app state @xingkaixin
- #64 refactor: split code health hotspots @xingkaixin
- #63 refactor(reader-ui): split agent annotation queue @xingkaixin
- #62 refactor: extract source agent request pipeline @xingkaixin
- #61 refactor(reader-ui): split reader app view shell @xingkaixin
- #60 refactor: split reading library home @xingkaixin
- #59 fix(desktop): guard stale reading card results @xingkaixin
- #58 refactor(reader-ui): split annotation comment composer @xingkaixin
- #57 refactor: extract reading card workflow state @xingkaixin
- #56 refactor(settings): split settings panels @xingkaixin
- #55 refactor(reader-ui): split reader components @xingkaixin
- #54 feat(desktop): split source bookcase readers @xingkaixin
- #53 refactor: split code health hotspots @xingkaixin
- #52 fix(desktop): store provider API keys securely @xingkaixin
- #51 feat(desktop): add app update flow @xingkaixin

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

Yomitomo 的首个版本，提供本地优先的 AI 伴读体验。桌面端负责导入文章、保存阅读数据、管理 LLM provider 和阅读助手，并提供阅读、批注和统计工作流。

### 核心功能

- 文章阅读器：支持导入文章、阅读视图、目录、字号、内容宽度和批注侧栏。
- 高亮与批注：支持选中文本创建高亮、添加批注类型、继续评论和维护讨论线程。
- AI 伴读助手：支持配置阅读助手，让助手围绕原文、选区和讨论生成批注或回复。
- 主动精读：支持选择一个或多个助手，对文章章节进行编排式精读和批注。
- 阅读库：支持保存文章正文、原文链接、批注、评论和阅读状态。
- 阅读统计：支持按文章、批注和讨论沉淀本地阅读趋势。
- 本地优先：阅读数据、provider 和助手配置保存在用户本机。

### 桌面端

- 基于 Electron 构建，提供阅读库、设置、助手、供应商、统计和日志视图。
- 使用 SQLite 保存文章、批注、评论、provider 和助手。
- 支持配置 OpenAI-compatible、OpenAI Responses、Anthropic 和 Gemini 等 LLM provider。
- 支持创建和管理阅读助手、审核助手，并关联指定 provider 与模型。
- 支持在桌面端集中回看和管理阅读资料。
- 支持通过审核助手检查事实归因、证据链和覆盖度。
