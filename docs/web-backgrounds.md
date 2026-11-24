# 官网背景素材

首页首屏与底部下载/页脚采用成套朱红版画风格插画作为背景，通过响应式 `<picture>` 优先提供 AVIF 并回退到 WebP，同时保留纯朱红底色作为加载前和失效时的兜底。内容页保留暖白底色，只在大屏页边加一层纸张光影。

## 位置与维护

### 首页背景（`HeroSection.astro`、`DownloadSection.astro`）

素材位于 `apps/web/public/assets/backgrounds/`，原始生成 PNG（1664×936，精确 16:9）不入库、不参与页面加载，仅提交压缩后的响应式 AVIF 与 WebP：

| 文件 | 尺寸 | 格式与体积 | 用途 |
| --- | --- | --- | --- |
| `home-hero.avif` / `home-hero-960.avif` | 1600×900 / 960×540 | AVIF（42 KB / 14 KB） | 首屏背景，高优先级加载 |
| `home-hero.webp` / `home-hero-960.webp` | 1600×900 / 960×540 | WebP（50 KB / 17 KB） | 首屏 WebP 回退 |
| `home-footer.avif` / `home-footer-960.avif` | 1600×900 / 960×540 | AVIF（43 KB / 16 KB） | 底部下载与页脚一体背景，`loading="lazy"` |
| `home-footer.webp` / `home-footer-960.webp` | 1600×900 / 960×540 | WebP（68 KB / 26 KB） | 底部下载与页脚 WebP 回退 |

编码命令：

```bash
# WebP（开启 sharp_yuv 避免高饱和朱红边缘色度渗色）
cwebp -quiet -q 78 -m 6 -sharp_yuv -resize 1600 0 SOURCE.png -o OUT.webp
cwebp -quiet -q 76 -m 6 -sharp_yuv -resize 960 0 SOURCE.png -o OUT-960.webp

# AVIF（ImageMagick + libheif）
magick SOURCE.png -strip -filter Lanczos -resize 1600x900! -quality 54 -define heic:speed=4 OUT.avif
magick SOURCE.png -strip -filter Lanczos -resize 960x540! -quality 52 -define heic:speed=4 OUT-960.avif
```

图层由 `apps/web/src/styles/home.css` 管理：首屏背景底部向 `--page`（`#fcfbf7`）柔和渐隐，产品窗口滚动吸顶时首屏天空自然滚出；底部下载与页脚共用同一张画卷，文案严格落在左侧干净天海区域，确保右侧悬崖藏书廊与上方月亮不被遮挡。

### 内容页页边（`starlight.css`）

素材位于 `apps/web/public/assets/backgrounds/reading-margins.webp`，由内置 image_gen 生成，再使用 `cwebp` 以质量 82 编码，大小 3,992 字节；原始 PNG 不参与页面加载。

图层由 `apps/web/src/styles/starlight.css` 管理，正文有独立的暖白底色。页边图只在宽屏加载，并在固定范围内淡出，不随文章长度拉伸或平铺。正文与侧栏保持暖白，背景不使用动画或客户端状态。

更换素材时应在中、英、日三种语言下检查桌面、窄屏、长文和短页；背景不得侵占内容宽度。图像只是装饰，失效时仍有底色和完整内容。不通过调整文字透明度来补救背景对比过强。

## 生成提示词

以下是生成时使用的完整提示词。尺寸描述表达构图意图；最终尺寸以素材文件为准。

### home-hero.avif / home-hero.webp（首页首屏）

```text
16:9 widescreen editorial printmaking / gouache illustration matching Yomitomo's vermilion brand palette (#df2f19). Upper-left 62% is a clean, calm, unobstructed vermilion sky with subtle fine lithograph grain for high-contrast cream serif typography. A small luminous warm cream full moon (#fff2d8) sits cleanly in the upper-right-center sky around x=67%, y=28%. Along the lower right third, sculpted dark espresso-charcoal cliff rock and quiet architectural stone steps rise gently toward the right edge, while softly layered distant terracotta-maroon hills stretch across the lower-left horizon and soften into warm mist at the bottom 12%. Full-bleed, no text, no UI, no logos, no animals.
```

### home-footer.avif / home-footer.webp（首页下载区与页脚）

```text
16:9 widescreen companion print by the same artist, sharing the exact same vermilion sky (#df2f19), espresso-charcoal etching shadow (#221110), warm cream moonlight (#fff2d8), and fine lithograph grain. The entire left 52% is calm, unobstructed vermilion sky above a tranquil vermilion sea with fine dark-red horizontal water ripples in the bottom 25%, keeping all headline and footer column zones clear. A small luminous warm cream full moon sits in the open sky gap around x=60%, y=21%. On the far right third, a dramatic dark weathered stone cliffside classical library colonnade terrace juts out over the calm red sea, with tall bookshelves faintly visible inside the colonnade shadow and a small solitary reader silhouette holding an open book by the balustrade looking out over the water. Full-bleed, no text, no UI, no logos.
```

### reading-margins.webp（博客、文章、文档与更新日志的页边）

```text
Use case: stylized-concept. ONE production decorative background for the outer margins of long-form articles and documentation on Yomitomo, a reading website. Wide horizontal image, approximately 3:2, ideally 1920x1280.
Critical composition: CENTRAL 88% of image must be plain, evenly illuminated warm off-white #fcfbf7. This includes all text and sidebar areas. ONLY the extreme outer 6% on each side contains barely visible abstract page-edge shadows, and only near the upper third. A tiny curling edge of a very large smooth ivory sheet enters from the far upper-right border, fading entirely before x=94%; a diffuse much weaker sliver at the extreme left. Large scale, nearly flat, almost no texture. The bottom half fades completely to uniform warm off-white. Top edge also plain warm off-white to meet the site's navigation.
Material: smooth real fine paper under diffuse natural daylight. Warm light-gray shadows extremely subtle, quiet enough for a reference manual. No visible grain, spots or repeated texture. This must be substantially more restrained than a marketing hero. Keep all high contrast and recognizable folds OUT of the central 88%.
No text, UI, icons, logos, people, books, pencils, bookmarks, red marks, grids, ruled lines, fabric, wrinkles, parchment or watercolor. No sepia, green, blue, pink or yellow cast. Only #fcfbf7 and very pale warm gray. Do not create a white card outline or central rectangle. One continuous unobtrusive light background.
```
