# Desktop Renderer Style Ownership

本文档定义桌面端 renderer 样式的归属边界。目标是让新增或迁移样式能直接落到拥有最终语义的位置，避免再通过后置 legacy 覆盖层修补。

## 入口

`apps/desktop/src/renderer/src/styles.css` 是唯一的全局 CSS 入口，只负责 import 顺序：

- Tailwind 与基础字体、base 样式先加载。
- `styles/shell.css`、`styles/settings.css`、`styles/library.css`、`styles/source-*.css` 承载各功能区域样式。
- `styles/theme-overrides.css` 只保留有明确原因的例外层。

不要把具体组件规则直接写进入口文件。新增全局 import 时，应先判断它是否属于已有功能模块；只有确实跨模块且需要固定加载顺序时，才扩展入口拓扑。

## 功能模块

`apps/desktop/src/renderer/src/styles/` 下的模块拥有对应 UI 区域的最终样式：

- `shell.css`：应用外壳、侧栏、导航、profile 入口等 shell 结构。
- `settings.css` 及 `styles/settings/*`：设置页 panel、provider、agent、表单、统计、日志等设置域样式。
- `library.css` 及 `styles/library/*`：资料库首页、搜索过滤、卡片、书架、封面、空状态和 notebook 相关样式。
- `annotation-discussion.css` 及其 partial：批注讨论窗口和 composer。
- `source-reader-shared.css`、`source-reader.css`、`source-ebook.css`、`source-pdf.css`：source reader 容器、EPUB/PDF 阅读器桥接与阅读状态。

如果某个 class 的语义属于一个区域，最终声明应放在该区域模块内，而不是先写在模块里再由 `theme-overrides/legacy-*` 覆盖。

## Tailwind 使用

Tailwind 用于局部、一次性的布局和间距。以下情况应进入 CSS partial：

- 可复用的状态或 variant。
- hover、focus、open、disabled 等交互组合。
- 动效、弹层、复杂响应式规则。
- 需要 AppTheme CSS variables 保持主题一致的 surface、文字、边框、阴影、强调色。

不要为绕过归属判断而把大量 Tailwind class 堆进业务组件。

## Theme Overrides 例外层

`apps/desktop/src/renderer/src/styles/theme-overrides/` 不是新样式的默认归宿。它只允许保留这些有明确原因的例外：

- 全局 popup/dropdown 行为和变量。
- 平台 titlebar、masthead、lock screen 等跨 shell 状态锁定。
- 尚未拆分完成的大型模块文件。
- 跨 source reader、library、settings 的响应式集合。
- 已记录但等待独立 issue 迁移的小型补丁。

不得新增 `legacy-*` 文件。迁移 legacy 规则时，应把选择器拆回实际拥有语义的目标模块；跨模块 grouped selector 需要拆开，不要原样搬入单个 partial。

## Reader UI 边界

`packages/reader-ui` 的 TS 样式导出服务 reader-ui 自身，不能依赖 desktop renderer、Electron 或 desktop-only theme helper。

desktop 对嵌入式 reader 的桥接样式应留在 source reader 模块内，并用作用域约束：

- `.source-reader-shell`
- `.source-ebook-reader-shell`
- `.source-pdf-reader-shell`

不要把 desktop-only reader 适配规则写回 `packages/reader-ui`。

## 新增样式判断

新增样式前按顺序判断：

1. 这是单个组件的一次性布局吗？优先用局部 Tailwind。
2. 它属于 shell、settings、library、annotation discussion 或 source reader 的某个区域吗？放入对应 CSS partial。
3. 它是否会被多个同域组件复用？放入该域已有 partial，必要时按现有结构新增同域 partial。
4. 它是否是 reader-ui 自身能力？放在 `packages/reader-ui`，不要引用 desktop 边界。
5. 它是否确实跨模块并依赖后置加载顺序？才考虑 `theme-overrides/`，并在文件名和内容中表达具体原因。

若无法回答归属问题，先补清语义边界，再写样式。
