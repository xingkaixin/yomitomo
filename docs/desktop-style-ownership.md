# Desktop renderer style ownership

本文档定义桌面端 renderer 样式的归属边界。目标是让新增或迁移样式能直接落到拥有最终语义的位置，不再通过后置覆盖层修补。

## 入口

`apps/desktop/src/renderer/src/styles.css` 是唯一的全局 CSS 入口，只负责 import 顺序：

- Tailwind 与基础字体、base 样式先加载。
- `styles/shell.css`、`styles/settings.css`、`styles/library.css`、`styles/source-*.css` 承载各功能区域样式。
- 最后一个 import 依赖加载顺序：`styles/popup-motion.css` 持有全局 popup/dropdown 的动效变量和开合状态，排在所有模块之后。

不要把具体组件规则直接写进入口文件。新增全局 import 时，应先判断它是否属于已有功能模块；只有确实跨模块且需要固定加载顺序时，才在入口新增 import。

## 功能模块

`apps/desktop/src/renderer/src/styles/` 下的模块拥有对应 UI 区域的最终样式：

- `shell.css` 及 `styles/shell/*`：应用外壳、侧栏、导航、profile 入口、平台 titlebar、锁屏状态与主题开关。
- `settings.css` 及 `styles/settings/*`：设置页 panel、provider、agent、表单、统计、日志等设置域样式。
- `library.css` 及 `styles/library/*`：资料库首页、搜索过滤、卡片、书架、封面、空状态和 notebook 相关样式；`reader-transition.css` 是书架与阅读器之间开合过渡层的样式，过渡的时间线在 `reading-library/reader-open-transition.ts`。
- `annotation-discussion.css` 及其 partial：批注讨论窗口和 composer。
- `distillation-library.css`：沉淀库列表与来源上下文，以及阅读记忆各视图共用的阅读证据卡片外观。
- `source-reader-shared.css`、`source-reader.css`、`source-ebook.css`、`source-pdf.css`：source reader 容器、EPUB/PDF 阅读器桥接与阅读状态。

如果某个 class 的语义属于一个区域，最终声明应放在该区域模块内。响应式规则放在所属模块自己的 media 块里，不建跨模块的响应式集合文件。

## Tailwind 使用

Tailwind 用于局部、一次性的布局和间距。以下情况应进入 CSS partial：

- 可复用的状态或 variant。
- hover、focus、open、disabled 等交互组合。
- 动效、弹层、复杂响应式规则。
- 需要 AppTheme CSS variables 保持主题一致的 surface、文字、边框、阴影、强调色。

不要为绕过归属判断而把大量 Tailwind class 堆进业务组件。

## 颜色

- UI 颜色只来自 AppTheme（`--app-*`）和 ReaderTheme（`--app-reader-*`）变量，分别由 `theme/app-theme.ts` 和 `packages/reader-ui/src/reader-theme.ts` 生成。浅色和深色主题输出同一组变量。
- 半透明色使用透明度阶梯变量 `--<name>-a<百分比>`，例如 `--app-ink-a8`、`--app-reader-primary-a24`。需要新的档位时在生成函数里加，不在样式里写 `color-mix`。
- 需要两色混合的固定值在主题生成时计算（`mixColors`），不在 CSS 里混合。
- `color-mix` 只用于运行时才确定的颜色：助手色、书封色、@提及色、批注色、`currentColor`。
- `reader-bilingual-translation-styles.ts` 也注入 EPUB iframe，那里只有 `--reader-*` 纸张变量，因此保留 `color-mix`，不得引用 `--app-*`。
- 不随主题变化的物体颜色留在所属模块：书封材质、统计页印章、图片上的遮罩和文字。

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
5. 它是否确实跨模块并依赖后置加载顺序？才在入口末尾新增 import，并在本文档写明顺序原因。

如果答不出样式属于哪个区域，先确定归属，再写样式。
