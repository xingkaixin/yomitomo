---
title: 阅读库与导入
description: 管理网页文章、EPUB/AZW3/MOBI 电子书、PDF 与文本文档，了解 Yomitomo 的本地存储机制。
---

阅读库是管理所有阅读材料的核心入口。网页文章、电子书（EPUB/AZW3/MOBI）、PDF 文档、Markdown/文本、微信读书笔记和阅读合集会分类归集，方便按材料类型开启对应的阅读流。你可以在设置中自定义首页展示的内容来源；删除材料有二次确认保护，导入或删除成功时会有 顶部通知与可选的音效反馈。

## 阅读合集

合集用于将主题、项目或特定书单相关的材料组织在一起，方便集中阅读与回溯。合集不会复制原始文件，仅建立轻量的归属索引。

### 新建合集

1. 在阅读库点击右上角的「+」图标。
2. 选择「新建合集」。
3. 输入合集名称（例如「分布式系统设计」）。

创建后会自动进入该合集页面。后续可随时在合集卡片菜单中点击「编辑合集名称」进行重命名。

### 向合集添加内容

合集支持收录网页文章、电子书、PDF、纯文本和微信读书书籍。提供两种添加方式：

- **合集内挑选**：在合集页面点击「添加到此合集」，从弹窗中勾选库内已有材料。支持按类型筛选和关键词搜索，可逐个点击「+」添加，或直接拖拽至右侧「待加入」列表。
- **拖拽归档**：在书架上，将材料封面拖到目标合集木箱即可归入。

在合集内打开某篇材料的卡片菜单，选择「从合集中移除」即可移出。这仅解除归属关系，不会删除阅读库内的原始材料。

### 合集封面与置顶

阅读库以书架展示材料，封面下方显示阅读进度、标题和批注数量。合集以木箱展示成员封面并标注收录数量；空合集显示空木箱。你可以将常用的合集或重要材料「置顶」，它们会固定在阅读库最前端。

### 删除合集

删除合集仅移除合集本身及其索引关系，合集内收录的文章、书籍与 PDF 仍会完好保留在阅读库中。

## 导入网页文章

1. 在阅读库点击右上角「+」。
2. 选择「添加网页文章」。
3. 粘贴以 `http://` 或 `https://` 开头的文章链接。
4. 等待 Yomitomo 智能提取标题、作者、正文及插图。

对于依赖客户端动态渲染的页面，Yomitomo 会调用内置无头环境解析后再提取主体内容。单篇 HTML 响应超过 5MB 时会自动跳过。

<picture>
  <source
    srcset="/assets/cn-import-web-640.webp 640w, /assets/cn-import-web-960.webp 960w, /assets/cn-import-web-1280.webp 1280w, /assets/cn-import-web-1600.webp 1600w, /assets/cn-import-web.webp 2360w"
    sizes="(max-width: 760px) calc(100vw - 32px), 640px"
  />
  <img src="/assets/cn-import-web.webp" alt="Yomitomo 导入网页文章" loading="lazy" width="2360" height="1568" decoding="async" />
</picture>

## 导入电子书

1. 在阅读库点击右上角「+」。
2. 选择「电子书文件」。
3. 选取或直接拖入本地 `.epub`、`.azw3` 或 `.mobi` 文件。

Yomitomo 会完整解析书籍封面、多级目录、章节层级与样式结构。电子书支持批量导入（单次最多 10 本，单本上限 80MB）。暂不支持受 DRM 加密保护或解压体积过大的特殊文件。

<picture>
  <source
    srcset="/assets/cn-import-ebook-640.webp 640w, /assets/cn-import-ebook-960.webp 960w, /assets/cn-import-ebook-1280.webp 1280w, /assets/cn-import-ebook-1600.webp 1600w, /assets/cn-import-ebook.webp 2360w"
    sizes="(max-width: 760px) calc(100vw - 32px), 640px"
  />
  <img src="/assets/cn-import-ebook.webp" alt="Yomitomo 导入电子书" loading="lazy" width="2360" height="1568" decoding="async" />
</picture>

## 导入 PDF

1. 在阅读库点击右上角「+」。
2. 选择「PDF 文档」。
3. 选取或拖入本地 `.pdf` 文件。

PDF 支持批量导入（单次最多 10 份，单份上限 120MB）。导入完成后，卡片会直观显示总页数、文件名与基础元数据。若导入重复文件，系统会提示已有记录并支持一键直接打开。

<picture>
  <source
    srcset="/assets/cn-import-pdf-640.webp 640w, /assets/cn-import-pdf-960.webp 960w, /assets/cn-import-pdf-1280.webp 1280w, /assets/cn-import-pdf-1600.webp 1600w, /assets/cn-import-pdf.webp 2360w"
    sizes="(max-width: 760px) calc(100vw - 32px), 640px"
  />
  <img src="/assets/cn-import-pdf.webp" alt="Yomitomo 导入 PDF" loading="lazy" width="2360" height="1568" decoding="async" />
</picture>

## 导入纯文本与 Markdown

1. 在阅读库点击右上角「+」。
2. 选择「文本文件」。
3. 选择「粘贴文本」直接录入，或选择「上传文件」导入本地 `.txt` / `.md` 文档（支持多选）。

文本导入提供预览确认机制：系统会自动识别编码并提取文档标题（Markdown 优先读取 YAML Front Matter 或首级标题，纯文本提取文件名或首行）。导入时可手动确认或修改标题与作者信息。

Markdown 的 YAML Front Matter 会格式化为文首元数据栏；文本内容经过安全净化处理，远程图片默认不主动请求。文本材料拥有专属稿纸质感封面，与其他材料一样支持分类筛选与合集归档。

## 筛选与搜索

点击搜索框左侧的「全部」可多选合集、网页、电子书、PDF、文本或微信读书。已选类型显示为可移除标签。搜索支持标题、作者、来源和合集名称。

当前筛选条件、搜索词与打开的合集会在切换页面后保留。常用材料和合集可以置顶，其余内容按加入时间排列；底部可翻页并调整每页数量。

## 本地存储与离线图片

所有阅读数据均安全保存在桌面端本地数据目录中。开启「本地保存图片」后，导入网页文章时会自动将正文配图下载至本地，避免源站失效导致图片无法显示。
