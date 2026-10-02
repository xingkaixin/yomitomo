# 批注卡片优化实验与落地方案

2026-10-02。实验分支：`feat/annotation-card-experiments`。
基线提交：`2adc2474c66dd9c3c660cf763ca75eff738bedb8`。
实现提交：`17640835`。

建议落地这份分支中的三项改动：隔离卡片内容渲染、按批次复用日期格式化器、稳定高亮节点身份。
实验已经修改实现；没有引入虚拟列表、全局日期缓存、定时器或新依赖。
1,000 条批注仍有首次打开长任务，这份方案不承诺消除所有卡顿。

## 范围与实验方法

桌面端 Electron 44.5.0 / Chromium 152.0.7977.130、React 19.3、TypeScript；
macOS arm64、Apple M1 Pro。构建使用 pnpm / electron-vite，测试使用 Vitest / Playwright。
检查批注卡片、轨道、高亮渲染、时间格式化和阅读器标签数据的更新路径。

沿用[已有观测脚本和定义](./annotation-card-performance.md)，在同一天重新运行基线。
每个变体分别构建，使用隔离测试书库，100 / 500 / 1,000 条批注各测三轮。
每条批注包含一条想法，引用完整英文段落，创建时间设为一天前。视口 1,500 × 860，
正文宽 600 px，字号 20 px。每轮打开文章、连续滚动 20 次、通过工具栏把字号增加到 21 px。
测量期间不并行运行构建或其他测试。没有读取用户的真实书库。

`readyMs` 包含 Playwright 操作及自动等待，不是纯渲染时间。Script / Layout / 长任务
覆盖操作及之后至少 500 ms 的观察窗口。滚动固定等待动画帧，小数据组的操作耗时有约
0.67 秒的等待下限；脚本减少不一定让该数字同比下降。帧间隔不等于屏幕实际 FPS。
样本量只支持中位数对比，不据此估计 P95。CPU profile 独立采集，不混入基准结果。

## 变体对比

下表是 1,000 条批注的三轮中位数，单位 ms。

| 变体 | 打开 | 滚动 20 次 | 调整字号 | 结论 |
| --- | ---: | ---: | ---: | --- |
| 同日基线 | 2602.6 | 5241.3 | 1940.4 | 存在明显脚本开销 |
| A：单独缓存日期 formatter，每次验证系统时区 | 2534.7 | 5160.1 | 1935.3 | 收益不足，撤销 |
| B：卡片整体 memo，稳定上游 props | 2306.4 | 970.3 | 2186.2 | 滚动改善，字号未改善 |
| C：轻量外层 + 内容 memo + 批次 formatter | 1702.3 | 1176.4 | 1999.7 | 首次打开进一步改善，字号仍慢 |
| D：C + 稳定永久高亮的 React key | 1665.4 | 1066.4 | 842.7 | 作为落地方案 |

A 为了及时识别系统时区变化，逐次调用 `Intl.DateTimeFormat().resolvedOptions()`。
这项检查本身仍创建格式化器，抵消了缓存收益。没有留下模块缓存和失效机制。
B 仍将位置样式传入被 memo 的整体卡片；C 将位置、堆叠和动画留在外层，
时间字符串也由外层计算，避免相对时间或完整日期因 memo 延迟更新。
B 与 C 的滚动差异也包含这项正确性成本；本轮不以单项最快数字拼出虚假的组合结果。

## 收敛后独立复测

在清理实现和通过回归后，最终构建再次独立测量三轮。下面只使用这组复测的中位数，
不与前面的 D 组拼接或选取较快样本。两组 D 的 1,000 条结果方向一致。

| 批注数 | 操作 | 基线 ms | 最终复测 ms | 耗时下降 |
| ---: | --- | ---: | ---: | ---: |
| 100 | 打开 | 428.7 | 340.4 | 20.6% |
| 100 | 滚动 20 次 | 671.0 | 657.4 | 2.0% |
| 100 | 调整字号 | 443.5 | 375.2 | 15.4% |
| 500 | 打开 | 1613.7 | 900.7 | 44.2% |
| 500 | 滚动 20 次 | 2933.3 | 670.1 | 77.2% |
| 500 | 调整字号 | 1004.5 | 499.9 | 50.2% |
| 1,000 | 打开 | 2602.6 | 1631.5 | 37.3% |
| 1,000 | 滚动 20 次 | 5241.3 | 1118.0 | 78.7% |
| 1,000 | 调整字号 | 1940.4 | 854.5 | 56.0% |

| 1,000 条批注 | Script 基线 → 最终 ms | 最长任务基线 → 最终 ms | 最终最大帧间隔 ms |
| --- | ---: | ---: | ---: |
| 打开 | 1418.2 → 521.1 | 995 → 685 | 783.4 |
| 滚动 20 次 | 4849.2 → 455.0 | 317 → 61 | 50.1 |
| 调整字号 | 1171.7 → 126.4 | 685 → 208 | 300.2 |

最长任务与最大帧间隔均为每轮最大值再取三轮中位数。打开和字号调整仍会产生长任务；
这支持先落地当前优化，也说明不能宣称已经达到所有操作无卡顿。

## 最终方案及行为约束

### 1. 让位置变化只更新卡片外层

位置：`packages/reader-ui/src/annotations/reader-annotation-card.tsx:110`、
`packages/reader-ui/src/shell/reader-surface-view.tsx:275`、
`apps/desktop/src/renderer/src/source/bookcase/use-source-reader-workspace.ts:51`。

原先阅读器滚动和布局更新会重复执行每张卡片的菜单、tooltip、人物和想法摘要组件。
`pendingAgents` 的默认新数组、随父级变化的回调和每次生成的 labels 会使简单 memo 失效。

现在 `AnnotationCard` 保留 section、位置、堆叠、动画和高度测量；私有的
`AnnotationCardContent` 用 React 默认浅比较，仅在内容相关 props 变化时更新。
没有自定义“忽略回调”的比较函数。卡片操作通过稳定函数调用 ref 中的业务回调，
ref 在 layout effect 中随提交更新，避免访问旧文章或旧设置。标签对象按实际界面语言复用，缺省助手数组使用稳定空值。
时间字符串在外层每次渲染时计算；跨过相对时间分桶后仍会刷新。没有增加逐卡定时器。

设 n 为卡片数，k 为内容发生变化的卡片数，C 为每张卡片内容渲染成本。
原先高频更新约为 O(n × C)；现在仍有 O(n) 的外层遍历，加 O(k × C) 的内容更新。
首次挂载依旧 O(n × C)，这里没有减少挂载数量。React 组件边界不会增加 DOM 元素。

风险为中等：依赖调用方以新对象提交内容变更，必须验证最新操作回调、想法数量、助手状态、
语言、时间显示和蒸馏切换。本轮保留了原有轨道高度与动画逻辑。

### 2. 每次阅读器渲染只建立一个日期格式化器

位置：`packages/reader-ui/src/reader-date-utils.ts:21`、
`packages/reader-ui/src/shell/reader-surface-view.tsx:275`。

原先每张卡片完整时间提示都创建 `Intl.DateTimeFormat`。
现在同一轮卡片渲染共用一个实例，普通 `formatTime` 调用仍支持原有两参数接口。
相对时间标签与完整时间字符串交给 memo 内容组件，日期结果变化也能触发更新。

格式化器构造次数从每轮 O(n) 变为 O(1)，日期格式化本身仍为 O(n)。
实例只随当前渲染传递，不跨阅读器渲染缓存时区；下一次父级渲染会读取当前系统时区。
没有新增“静止页面每分钟自动更新时间”的行为。

风险较低：保持中文、英文、日文和非法日期的原行为，验证时区变化时的新批次结果。
没有使用“当前 UTC offset 相同即视为同一时区”的判断，因为历史时间的规则可能不同。

### 3. 高亮 key 不再使用全文行号

位置：`packages/reader-ui/src/shell/reader-surface-view.tsx:289`。

核心 `buildHighlightSegments` 的 id 含全文行号。字号变化让每段引文从四行变五行，
后续行号大面积变化，React 原先据此删除重建高亮 button。
在 C 的独立字号 profile 中，`removeChild` 自身采样约 1,321 ms，是主要热点。

现在仅在展示层按“有序批注 ID 组合 + 该组合的片段序号”建立 React key。
JSON 编码 ID 组合避免分隔符碰撞；保持原顺序，以保留重叠高亮的首选点击目标。
核心 segment id、几何计算、颜色、重叠归属、动画延迟映射都保留。
复用节点后仍更新它的全部坐标、标签与点击回调。新增行只新增相应节点，
不再因为前面的引文多一行而连带替换后续批注的所有节点。

这一步增加 O(s) 的遍历与 key 数据，s 为高亮片段数；精确字符串处理还与组合内 ID 总长度有关。
几何算法复杂度不变。主要收益是把该次重排的大量卸载/挂载转成属性更新。
高亮不承载输入状态，key 不代表某个字符的永久身份；重叠归属改变时允许相应节点替换。

风险较低：回归检查节点复用、位置更新、最新点击目标和重叠高亮归属。
D 的独立字号 profile 中没有采到 `removeChild` 样本；这不表示整个产品永远没有 DOM 删除。
profile 内的 Playwright 可访问性查询约 230 ms，不能归因为产品渲染热点。

## 验证与边界

- `mise run check` 通过：lint、约定门禁、Effect / 文档路径 / UI primitive 检查、格式、
  TypeScript、全部 workspace 单元测试、构建及两项 Electron smoke。reader-ui 190 项通过；
  desktop 2,358 项通过、2 项既有跳过。没有新增 lint 警告，仓库原有警告仍存在。
- 43 项聚焦测试通过，覆盖位置更新时内容复用、相对时间推进、想法与助手状态更新、
  最新删除/定位/讨论回调、三语日期与时区、高亮节点复用和重叠点击。
  既有发布/撤回蒸馏双面动画与轨道高度测试也通过。
- 真实 Electron GUI 共 6 项通过：文本、EPUB、PDF 三种批注入口，以及三种阅读器的窗口缩放。
  EPUB/PDF 在缩放后点击卡片定位、打开讨论、保存想法，并确认卡片数量摘要刷新；
  文本通过设置界面切到日语后重新打开，卡片标签正确。
- 查看 1,000 条批注的真实窗口截图，卡片分组、对齐、引文和高亮均保持原有布局。
  本轮没有改变 CSS 或增加实际 DOM 层级。

GUI 初版准备步骤曾直接调用保存 IPC，未走同窗口的 renderer 状态应用流程，因而不适合验证
界面更新；最终改为真实讨论/设置界面。最终 EPUB/PDF 用例验证首次打开讨论与保存后刷新，
不包含同一讨论窗口关闭后立即重开的生命周期验证：这项额外的自动化检查超时，
原因尚未确认，也未计入通过项。窗口创建与关闭的产品代码不在本次改动范围。

1,000 条批注打开后仍挂载 1,000 张卡片、4,000 个高亮片段、约 36,200 个 DOM 元素；
字号变化后高亮变为 5,000 个。当前方案改善重复工作，没有解决大型文档的全部挂载成本。

建议先采用三项已验证改动。若后续真实文档仍在首次打开、快速滚动或内存占用上超过产品可接受范围，
再单独验证可见区域挂载。届时必须保留卡片高度缓存，对活动卡片、打开菜单和退出动画保留挂载，
为跳转到未挂载批注建立定位流程，并分别验证 EPUB 翻页与 PDF 缩放。
目前没有测量证明需要承担这套新生命周期成本，因此本分支不引入虚拟化。

性能结论仅适用于本机、英文长文本、单条想法和固定视口；EPUB/PDF 的功能回归不等于它们的
高批注密度性能测试。其他设备、系统、语言、复杂讨论和持续 AI 更新还需要各自的数据。

## 复现与产物

从仓库根目录执行，保持测试窗口可见，不并行运行其他负载：

```bash
pnpm --filter @yomitomo/desktop build
YOMITOMO_E2E_ARTIFACTS_DIR=/tmp/annotation-measurement pnpm --filter @yomitomo/desktop exec vitest run --config e2e/performance/vitest.config.ts e2e/performance/annotation-cards.test.ts
YOMITOMO_ANNOTATION_PROFILE=1 YOMITOMO_E2E_ARTIFACTS_DIR=/tmp/annotation-scroll-profile pnpm --filter @yomitomo/desktop exec vitest run --config e2e/performance/vitest.config.ts e2e/performance/annotation-cards.test.ts
YOMITOMO_ANNOTATION_PROFILE=font YOMITOMO_E2E_ARTIFACTS_DIR=/tmp/annotation-font-profile pnpm --filter @yomitomo/desktop exec vitest run --config e2e/performance/vitest.config.ts e2e/performance/annotation-cards.test.ts
```

基线可在独立 checkout 的上述基线提交重跑普通测量命令。字体 profile 模式是本分支新增能力。
观测脚本不设置硬件相关的速度断言，不进入默认测试命令。

本机原始结果位于 `apps/desktop/e2e/ui/artifacts/annotation-experiments/`：
`baseline`、`formatter`、`memo`、`combined`、`stable-highlights` 各目录有完整逐轮 JSON 与截图；
`font-profile`、`stable-font-profile` 保存字号 CPU profile；`final` 保存代码收敛后的独立复测。
这些大文件保持 Git 忽略，报告保留关键数据和复现方法。
