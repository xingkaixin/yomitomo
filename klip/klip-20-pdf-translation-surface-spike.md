# KLIP-20: PDF 双语翻译 surface spike

Status: **conditional go**（限定单栏文本型 PDF；overlay 未验证），2026-07-28
Scope: RD-947 调查，不含 feature 实现

## 背景

RD-926 已把 Web 与 EPUB 的翻译请求、进度、失败恢复、删除和 UI 收敛到共享会话，
并留出 `TranslationSurfaceAdapter` seam（`use-source-bilingual-translation.tsx:14`）。
风险不在会话，而在 PDF 文本层能否提供可重复的 block identity 与可靠的阅读顺序。

## 已验证（有测试支撑）

`pdfium-translation-blocks.ts` + 其测试用 PDFium 交给我们的文本层形态覆盖五类 fixture：

| fixture | 结论 |
| --- | --- |
| 单栏正文 | 空行分块稳定，顺序与阅读顺序一致 |
| 标题 + 列表 | 标题独立成块；列表项被合并为一块（无空行分隔） |
| 跨页段落 | **不**重新拼接：文本层没有任何信号表明两段属于同一段落 |
| 无文本页 | 不产生 block，不占用序号 |
| 双栏 | 块内混合两栏内容，顺序取决于 PDFium 输出 |

Block ID 为 `pdf-p{page}-b{index}-{hash(text)}`，因此：

- 同一 PDF 重开产生完全相同的 ID（已测）。
- 某页文本变化只让该页 ID 变化，其他页 translation 仍有效（已测）。
- 从 ID 可反解页码，失败 block 可定位重试（已测）。

## 未验证（本次无法覆盖）

- translated overlay 是否跟随 zoom、resize 与 page virtualization。这需要真实渲染，
  不能由文本层推断。
- 大文档（100/500 页）的 block extraction 与 overlay 成本。
- 扫描件（无文本层）在 UI 上的提示方式。

## 决策

**Conditional go**：共享会话可以复用，PDF adapter 只需提供 `extractBlocks` /
`applyTranslation` / `scrollToBlock` 三个 implementation，不复制状态机。

进入 feature implementation 前必须满足：

1. 第一版能力范围显式限定为**单栏文本型 PDF**。双栏与跨页段落是已知限制，
   UI 应说明，不用启发式伪装成功。
2. overlay 必须在真实文档上验证 zoom / resize / virtualization，未通过则不发布。
3. 无文本层的扫描件给出明确提示，不进入翻译流程。

不满足第 1、2 条时不进入实现；本 KLIP 的 no-go 条件与 go 条件同等有效。

## 产物

- `apps/desktop/src/renderer/src/source/pdfium/pdfium-translation-blocks.ts`
  与其测试：spike 产物，feature issue 直接消费，不再重新推导 block identity。
