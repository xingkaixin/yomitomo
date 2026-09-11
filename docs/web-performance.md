# 官网资源加载与缓存

## Cloudflare Pages 缓存

`apps/web/public/_headers` 随 Astro 构建复制到发布目录，仅为 `/_astro/*` 设置 `Cache-Control: public, max-age=31536000, immutable`。该目录存放 Astro 构建生成的带内容哈希的 CSS、JavaScript 和字体；内容变化时 URL 随之变化，浏览器可以长期复用未变化的文件，减少回访时的重新验证和下载。

HTML、`/assets/*` 下固定名称的截图与背景、版本信息继续使用 Pages 默认缓存策略。不要将固定 URL 的文件放入 `/_astro/`，也不要将长期缓存规则扩展到全站，否则发布后浏览器可能继续使用旧内容。

Pages 已提供 CDN 和分层缓存，无需另加 Worker、R2 或全站 Cache Everything 规则。配置依据见 [Pages 缓存说明](https://developers.cloudflare.com/pages/configuration/serving-pages/)和[自定义浏览器缓存](https://developers.cloudflare.com/pages/configuration/headers/#configure-custom-browser-cache-behavior)。

验证时运行官网生产构建，确认发布目录包含 `_headers`，再使用 `wrangler pages dev apps/web/dist` 检查 CSS、JavaScript 和字体的响应头。首页、文档页、固定路径图片和版本信息不应出现 `immutable`。生产部署后重复检查；使用已有 Cloudflare Web Analytics 按地区、设备和页面比较回访体验，不将本机请求耗时当作真实用户首屏指标。

## Cloudflare 连接恢复

`yomitomo.app` 的免费 0-RTT 连接恢复已于 2026-09-11 在 Cloudflare 控制台启用。该设置属于域名配置，不由 Pages 部署管理；位置为 Speed → Settings → Protocol Optimization → 0-RTT Connection Resumption，可在同处关闭。

0-RTT 仅减少支持该能力的客户端再次连接时的等待，不改善首次连接。Cloudflare 支持 GET、HEAD 和 OPTIONS 的 0-RTT，不支持 POST；桌面遥测使用 POST。域名下的下载服务使用 GET/HEAD，并按请求记录下载事件，因此下载事件数仍是请求次数，不应作为去重下载人数。能力与免费范围见 [0-RTT 官方说明](https://developers.cloudflare.com/speed/optimization/protocol/0-rtt-connection-resumption/)。

## 字体

保留现有 Source Serif 4、JetBrains Mono、Noto Serif SC 和 Noto Sans SC，不改变字形、字重和字体回退顺序。原始 WOFF2 文件保存在 `apps/web/public/assets/fonts`，同时保留原有许可证。

`apps/web/scripts/prepare-web-fonts.mjs` 在 Astro 配置加载时扫描官网源码与 Markdown 内容，通过 `subset-font` 生成仅包含网站用字的字体。额外保留通用标点，覆盖 Markdown 智能引号等渲染时生成的字符。生成结果写入 Astro 临时目录，不加入 Git；Vite 从 CSS 引用这些文件，为生产资源添加内容哈希。字体工具只在构建端运行，不增加客户端 JavaScript。

正常执行 `pnpm --filter @yomitomo/web dev` 或 `pnpm --filter @yomitomo/web build` 即可生成字体，不需要额外命令。开发期间添加此前没有使用过的字符后，重启开发服务；每次生产构建都会重新扫描完整内容。保留 `font-display: swap`，字体加载失败或未覆盖的字符仍使用系统回退字体。

本次精简将两份 Noto 字体从 9,884,916 字节降至 644,872 字节，减少约 93.5%。这是全站共用字集，访问其他文章可以复用缓存。没有按当前单篇页面硬编码字符，也不再预加载旧的完整字体。

## 图片

首页只预加载首屏装饰背景，并设置高请求优先级。伴读区、页脚与内容页页边背景不预加载。

产品截图通过 `srcset` 提供 640、960、1280、1600 等宽度，浏览器按显示宽度与像素密度选择。手机首页截图的 `sizes` 包含现有 165% 裁切显示比例；文档截图声明固有宽高，并将首张图片设为高优先级。保留大尺寸原图，供高像素密度屏幕使用。

角色卡片使用 192、320、384 像素头像；阅读演示里的小头像单独使用 96 像素资源，避免提前下载并缓存卡片的大图。更新原始产品图或头像时，应同步生成对应尺寸的 WebP，使用与本次一致的编码参数：

```bash
cwebp -quiet -q 82 -m 6 -resize WIDTH 0 SOURCE -o OUTPUT
```

正方形头像把高度 `0` 改为与宽度相同的值。资源引用位于首页组件、演示数据与三语文档中；修改尺寸后应检查真实显示比例，避免只针对某个审计视口优化。

## 验证

使用生产构建和 Lighthouse 13.4.1，中文首页、文档、博客列表、文章页分别测试移动端与桌面端。移动端首页重复三次；另使用 DevTools 请求级限速核对模拟 LCP，避免把模拟模型的估计当作实际等待时间。完整 HTML 与 JSON 报告保留在本次任务的本地审计目录。

另外检查三语页面的字体与版式，并对 124 个构建页面的可见文本进行字体覆盖核对：原字体支持的字符在子集中仍然存在，字符宽度与边距保持一致。官网构建、现有测试、lint 和格式检查共同验证改动。
