# 官网背景素材

官网沿用暖白底色与朱红强调色，以纸张和光影区分区域。内容、字体、区块顺序和既有交互保持不变。

## 位置与维护

素材位于 `apps/web/public/assets/backgrounds`，由内置 image_gen 生成，再使用 cwebp 以质量 82 编码。四张 WebP 合计 31,358 字节；原始 PNG 不参与页面加载。

| 文件 | 位置 | 构图约束 |
| --- | --- | --- |
| reading-focus.webp | 首页首屏 | 形体靠右，标题与按钮区域留白 |
| reading-companions.webp | 首页伴读区 | 薄纸轻微交叠，姓名与角色文字优先 |
| reading-margins.webp | 内容页页边 | 正文与侧栏保持暖白，仅大屏页边有装饰 |
| reading-footer.webp | 共用页脚 | 右下收拢页边与小段朱红，链接区保持清楚 |

首页与页脚的图层由 `apps/web/src/styles/landing.css` 管理，使用不可交互的伪元素和静态蒙版。手机减弱装饰，没有新增动画或客户端状态。

内容页由 `apps/web/src/styles/starlight.css` 管理，替换原来的方格背景，正文有独立的暖白底色。页边图只在宽屏加载，并在固定范围内淡出，不随文章长度拉伸或平铺。

`apps/web/src/components/starlight/PageFrame.astro` 复用 Starlight 页面框架，并把共用页脚放到正文栏外，避免用视口宽度和负边距跨越侧栏。`apps/web/src/components/starlight/Footer.astro` 有意不输出正文栏内的第二个页脚。

更换素材时应在中、英、日三种语言下检查桌面、手机、长文、短页和侧栏展开；背景不得侵占内容宽度。所有图像都是装饰，失效时仍有底色和完整内容。不通过调整文字透明度来补救背景对比过强。

## 生成提示词

以下是各张图片生成时使用的完整提示词。尺寸描述表达构图意图；最终尺寸以素材文件为准。

### reading-focus.webp（首页首屏）

```text
Use case: stylized-concept.
Generate ONE production decorative background for the hero of Yomitomo, an editorial AI reading companion website. A wide horizontal image, ideally 2304 by 768, 3:1.
Art direction: close-up abstract sculptural book pages in soft daylight, smooth ivory paper, fine tactile detail but no grain, noise, speckles or parchment. Contemporary, understated, intellectual. Palette dominated by warm off-white #fcfbf7, only very light warm-gray shadows. One tiny restrained vermilion #b23223 pencil-like accent may appear at the extreme right, never in the middle.
Layout is crucial: existing large black heading spans x=15%-72%, y=15%-56%; subtitle and red button span x=15%-65%, y=62%-90%. ALL of this region must remain perfectly quiet uniformly illuminated warm off-white, no page edges, creases, marks or shadows crossing it. Keep the LEFT 74% of the artwork almost blank. On the RIGHTMOST 26%, thin layered ivory page edges gently fan and converge toward a point at x=94%, y=68%, flowing in from the top-right and bottom-right. Shadows clearly reveal real paper volume at the edge, fading softly toward the center. Refined photographic material, not a flat gradient. Slightly more sculptural than a document background, but not heavy.
The entire upper and lower image boundaries fade to plain #fcfbf7, so this panel can meet other warm-white website sections. Keep material inside right edge band. No text, typography, logo, UI, people, desk, bookshelves, whole book, stationery still life, glowing blobs, plastic, crystals or watermark. No green, pink wash, beige/yellow cast, or sepia. A background image only, not a website screenshot.
```

### reading-companions.webp（六位伴读）

```text
Use case: stylized-concept. ONE production website section background for Yomitomo's six reading companions. Wide horizontal 3:1, ideally 2304x768. Background only, no website UI.
Same family as ivory sculptural book pages photographed in very soft daylight. Smooth warm off-white #fcfbf7 paper with LIGHT WARM-GRAY shadows; no green or cool blue tint, no colored accent. Almost invisible fine material, not grainy or parchment.
Art direction: different perspectives gently overlapping, conveyed by three enormous nearly translucent tracing-paper planes with softly curved edges, entering from the FAR LEFT and FAR RIGHT outer edges. The center 80% of the canvas must be tranquil, almost uniformly warm off-white, because six colorful portrait images and their small names will sit here. Keep top-left clean for a black heading. At the lower outer corners, gently overlapping sheet edges create perceptible but exceptionally shallow shadows. No sharp diagonal reaches the central content zone. Natural translucent paper, not glass, plastic, glowing color or waves of fabric. A little more warm-gray depth at the outer margins than the hero, while maintaining clarity. Upper and lower boundaries fade into #fcfbf7 so the section has no hard photographic rectangle edge.
No people, faces, readable text, book, desk, icons, logo, symbols, watermark or UI. No circles, balloons or floating cards. No visible paper fibers, wrinkled or stained paper, sepia or beige cast. Delicate, contemporary editorial, flat background with quiet physical depth.
```

### reading-margins.webp（博客、文章、文档与更新日志的页边）

```text
Use case: stylized-concept. ONE production decorative background for the outer margins of long-form articles and documentation on Yomitomo, a reading website. Wide horizontal image, approximately 3:2, ideally 1920x1280.
Critical composition: CENTRAL 88% of image must be plain, evenly illuminated warm off-white #fcfbf7. This includes all text and sidebar areas. ONLY the extreme outer 6% on each side contains barely visible abstract page-edge shadows, and only near the upper third. A tiny curling edge of a very large smooth ivory sheet enters from the far upper-right border, fading entirely before x=94%; a diffuse much weaker sliver at the extreme left. Large scale, nearly flat, almost no texture. The bottom half fades completely to uniform warm off-white. Top edge also plain warm off-white to meet the site's navigation.
Material: smooth real fine paper under diffuse natural daylight. Warm light-gray shadows extremely subtle, quiet enough for a reference manual. No visible grain, spots or repeated texture. This must be substantially more restrained than a marketing hero. Keep all high contrast and recognizable folds OUT of the central 88%.
No text, UI, icons, logos, people, books, pencils, bookmarks, red marks, grids, ruled lines, fabric, wrinkles, parchment or watercolor. No sepia, green, blue, pink or yellow cast. Only #fcfbf7 and very pale warm gray. Do not create a white card outline or central rectangle. One continuous unobtrusive light background.
```

### reading-footer.webp（全站页脚）

```text
Use case: stylized-concept. ONE finished decorative background for the shared FOOTER of Yomitomo, an editorial reading website. Create the widest horizontal panorama you can, ideally 3072x768, or 3:1. Background only.
Composition must work in a shallow footer, not a tall illustration. 88% of the artwork is clean smooth warm off-white #fcfbf7. The ENTIRE LEFT 80% must be almost uniform, without paper edges or shadows, because the brand, links and copyright appear there and along the top. ONLY the far RIGHT and BOTTOM RIGHT corner contains a few very shallow horizontal book-page edges gently curling upward, like the end of a neatly gathered reading notebook. Keep these forms inside the last 18% on the right and the bottom 15% of the canvas. Soft light-gray shadows, low contrast, fine smooth ivory paper with no visible grain. A tiny sliver of vermilion #b23223 bookmark is partly hidden at the extreme lower-right edge, very small. No large terracotta color area. All upper boundary and all left boundary must match #fcfbf7 and be plain.
Art direction: continuation and keeping what you read. Quiet physical paper depth, sophisticated modern editorial close-up, diffuse daylight. Avoid a centered subject, concentric fan, or diagonal fold crossing the text area. No image border. No text, logo, watermark, people, actual book, desk, shelves, UI, symbols, plastic, glass, dark area, beige cast, sepia, green, pink or blue. This image will be cropped shallowly at the bottom, so keep any detail EXTREMELY FAR RIGHT to protect footer links and small copyright.
```
