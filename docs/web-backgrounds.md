# 官网背景素材

首页以 Logo 的朱红和暗红铺底，兔子和产品窗口是主视觉，不使用背景图。内容页保留暖白底色，只在大屏页边加一层纸张光影。

## 位置与维护

素材位于 `apps/web/public/assets/backgrounds/reading-margins.webp`，由内置 image_gen 生成，再使用 cwebp 以质量 82 编码，大小 3,992 字节；原始 PNG 不参与页面加载。

图层由 `apps/web/src/styles/starlight.css` 管理，正文有独立的暖白底色。页边图只在宽屏加载，并在固定范围内淡出，不随文章长度拉伸或平铺。正文与侧栏保持暖白，背景不使用动画或客户端状态。

更换素材时应在中、英、日三种语言下检查桌面、长文和短页；背景不得侵占内容宽度。图像只是装饰，失效时仍有底色和完整内容。不通过调整文字透明度来补救背景对比过强。

## 生成提示词

以下是生成时使用的完整提示词。尺寸描述表达构图意图；最终尺寸以素材文件为准。

### reading-margins.webp（博客、文章、文档与更新日志的页边）

```text
Use case: stylized-concept. ONE production decorative background for the outer margins of long-form articles and documentation on Yomitomo, a reading website. Wide horizontal image, approximately 3:2, ideally 1920x1280.
Critical composition: CENTRAL 88% of image must be plain, evenly illuminated warm off-white #fcfbf7. This includes all text and sidebar areas. ONLY the extreme outer 6% on each side contains barely visible abstract page-edge shadows, and only near the upper third. A tiny curling edge of a very large smooth ivory sheet enters from the far upper-right border, fading entirely before x=94%; a diffuse much weaker sliver at the extreme left. Large scale, nearly flat, almost no texture. The bottom half fades completely to uniform warm off-white. Top edge also plain warm off-white to meet the site's navigation.
Material: smooth real fine paper under diffuse natural daylight. Warm light-gray shadows extremely subtle, quiet enough for a reference manual. No visible grain, spots or repeated texture. This must be substantially more restrained than a marketing hero. Keep all high contrast and recognizable folds OUT of the central 88%.
No text, UI, icons, logos, people, books, pencils, bookmarks, red marks, grids, ruled lines, fabric, wrinkles, parchment or watercolor. No sepia, green, blue, pink or yellow cast. Only #fcfbf7 and very pale warm gray. Do not create a white card outline or central rectangle. One continuous unobtrusive light background.
```
