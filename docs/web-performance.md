# 官网资源加载与缓存

## 部署

开发与部署使用 mise 全局安装并已登录的 `cf`，不在项目中安装 cf。根目录执行 `pnpm deploy:cf` 构建官网并发布到 Worker `yomitomo`，绑定 `yomitomo.app` 和 `www.yomitomo.app`。

`cloudflare.config.ts` 保存 Worker 配置；`wrangler.config.ts` 仅保存 cf 委托构建所需的静态资源目录和类型生成选项。当前 cf 仍依赖 Wrangler 完成这类项目的构建，因此保留 Wrangler 构建依赖。静态 Astro 的自动构建尚不生成 cf Build Output，部署脚本先执行 `cf-wrangler build` 打包已构建的 `dist`，再通过 `cf deploy --prebuilt` 上传，避免 cf 再次运行 Astro 丢失 sitemap alias。配置直接导出对象，不依赖全局包的模块解析路径。下载与遥测分别通过 `pnpm deploy:download`、`pnpm deploy:telemetry` 发布。

首次从 Pages 切换时，先部署并验证 Worker 的 workers.dev 地址，再解除 Pages 的两个自定义域名，将域名交给 Worker。原 Pages 部署暂留作回退；后续发布只使用 cf。关闭原 Pages 的 Web Analytics 注入，官网仅保留 Umami；下载和桌面遥测的 Analytics Engine 数据集保持原样。

## 官网规范地址

官网统一使用 `https://yomitomo.app`。Cloudflare Single Redirects 中的「官网 HTTP 和 WWW 统一到 HTTPS 根域名」规则返回 301，将 HTTP 根域名及 HTTP/HTTPS 的 `www` 域名直接跳转到规范地址，保留路径和查询参数。

匹配表达式为 `(http.host eq "www.yomitomo.app") or (http.host eq "yomitomo.app" and not ssl)`，目标表达式为 `concat("https://yomitomo.app", http.request.uri.path)`，开启 `preserve_query_string`。仅匹配官网两个 hostname，不包含下载和遥测等其他子域名。

该规则属于域名配置，不由 Workers 部署管理；通过 Cloudflare 控制台 Rules → Redirect Rules 或全局 `cf` 的 Rulesets API 管理。修改时更新现有规则，不重复添加 HTTPS 或 www 跳转，以免形成多次跳转。配置方式见 [Single Redirects API](https://developers.cloudflare.com/rules/url-forwarding/single-redirects/create-api/)。

验证时检查 HTTP 根域名、HTTP www、HTTPS www 的首页及带查询参数的子路径：应一次 301 跳转到 HTTPS 根域名，正式页面正常返回 200，且查询参数保持不变。页面 canonical 与 sitemap 继续使用 HTTPS 根域名。

## Cloudflare Workers 静态资源缓存

`apps/web/public/_headers` 随 Astro 构建复制到发布目录，仅为 `/_astro/*` 设置 `Cache-Control: public, max-age=31536000, immutable`。该目录存放 Astro 构建生成的带内容哈希的 CSS、JavaScript 和字体；内容变化时 URL 随之变化，浏览器可以长期复用未变化的文件，减少回访时的重新验证和下载。

HTML、`/assets/*` 下固定名称的截图与背景、版本信息继续使用 Workers 静态资源默认缓存策略。不要将固定 URL 的文件放入 `/_astro/`，也不要将长期缓存规则扩展到全站，否则发布后浏览器可能继续使用旧内容。

Workers 静态资源由 Cloudflare 缓存，无需另加 R2 或全站 Cache Everything 规则。配置依据见 [Workers 静态资源缓存](https://developers.cloudflare.com/workers/static-assets/binding/#caching)和[响应头配置](https://developers.cloudflare.com/workers/static-assets/headers/)。

验证时运行官网生产构建，确认发布目录包含 `_headers`，再使用 `cd apps/web && pnpm exec cf-wrangler dev` 检查 CSS、JavaScript 和字体的响应头。首页、文档页、固定路径图片和版本信息不应出现 `immutable`。生产部署后重复检查；使用 Umami 按地区、设备和页面查看访问情况，不将本机请求耗时当作真实用户首屏指标。

## Cloudflare 连接恢复

`yomitomo.app` 的免费 0-RTT 连接恢复已于 2026-09-11 在 Cloudflare 控制台启用。该设置属于域名配置，不由 Workers 部署管理；位置为 Speed → Settings → Protocol Optimization → 0-RTT Connection Resumption，可在同处关闭。

0-RTT 仅减少支持该能力的客户端再次连接时的等待，不改善首次连接。Cloudflare 支持 GET、HEAD 和 OPTIONS 的 0-RTT，不支持 POST；桌面遥测使用 POST。域名下的下载服务使用 GET/HEAD，并按请求记录下载事件，因此下载事件数仍是请求次数，不应作为去重下载人数。能力与免费范围见 [0-RTT 官方说明](https://developers.cloudflare.com/speed/optimization/protocol/0-rtt-connection-resumption/)。

## 字体

保留现有 Source Serif 4、JetBrains Mono、Noto Serif SC 和 Noto Sans SC，不改变字形、字重和字体回退顺序。`font-display: swap` 保持不变。原始 WOFF2 文件保存在 `apps/web/font-sources`，不随站点部署，同时保留原有许可证。

构建不处理字体。子集由手动脚本生成，输出提交到 Git：

```bash
pnpm --filter @yomitomo/web fonts
```

命令先构建站点，再用 Chromium 打开 `dist` 的全部页面，按 computed style 和字体回退顺序判断每个字符实际由哪个字体绘制，然后重写 `apps/web/src/fonts` 下的 12 个 WOFF2 和 `web-fonts.css`。首次运行需要 `pnpm --filter @yomitomo/web exec playwright-core install chromium`。

出现以下情况时重新运行并提交结果：

- 文档、博客、更新日志或首页文案出现此前没有的字符。CJK 新字尤其要注意：字体里没有的字符会静默回退到系统字体，标题里能看出字形不一致。
- 修改 `font-family`、`font-weight`、`font-style`，或新增 `font-feature-settings`、`font-variant-*`、`hyphens: auto`。
- 替换 `font-sources` 里的字体。

运行时注意两条警告：斜体文字用到 Source Serif 4，说明需要恢复已移除的 Italic；页面出现脚本不保留的 OpenType 特性，需要先把特性加进脚本。

每个字体拆成两个文件。`.core` 含 ASCII、卷曲引号、破折号、省略号、全站用到的非 CJK 字符和英文页面用到的字符，所以英文页面只下载 `.core`。`.ext` 含其余用到的字符和 Latin-1、Latin Extended-A，放在 `unicode-range` 后面按需下载。`unicode-range` 由生成文件的 cmap 反推，只列出文件真实包含的字符。字距和标点压缩都不跨文件生效，Noto 给假名和 `、。` 配了字距，所以 CJK 标点必须和 CJK 文字一起留在 `.ext`。

Source Serif 4 Bold、Noto Sans SC 和 JetBrains Mono Regular 的 `.core` 是全部页面都用到的文件，由 `apps/web/src/components/FontPreloads.astro` 预加载。其他文件只在部分页面使用，不预加载。

字体裁剪去掉了提示、竖排度量和未使用的 OpenType 特性。`calt`、`clig`、`liga` 只在站点文字经 HarfBuzz 塑形后确实有变化时保留，例如 JetBrains Mono Regular 的 `://`。Source Serif 4 的保留字体名是 `Source`，脚本把嵌入的字体名改为 Yomitomo Serif，CSS 的 `font-family` 名不变。Source Serif 4 Italic 没有绘制过任何字符，只因空的 `<i>` 被下载，已经移除；这些空元素不受影响。

## 图片

首页首屏只有兔子图 `rabbit.webp` 使用高请求优先级。产品窗口是 HTML 和 CSS，除头像外不加载图片；内容页页边背景不预加载。

文档里的产品截图通过 `srcset` 提供 640、960、1280、1600 和 2360 像素宽度，浏览器按显示宽度与像素密度选择，并声明实际宽高。更新截图时同时替换各尺寸资源和三语文档中的宽高；日文文档共用英文截图。结构化数据中的产品截图也引用这组资源。

伴读卡片使用 192、320 像素头像；产品窗口和 bento 里的小头像单独使用 96 像素资源，避免提前下载并缓存卡片的大图。更新原始产品图或头像时，应同步生成对应尺寸的 WebP，编码参数如下：

```bash
cwebp -quiet -q 82 -m 6 -resize WIDTH 0 SOURCE -o OUTPUT
```

正方形头像把高度 `0` 改为与宽度相同的值。资源引用位于首页组件与三语文档中；修改尺寸后应检查真实显示比例，避免只针对某个审计视口优化。

## 验证

使用生产构建和 Lighthouse 13.4.1，中文首页、文档、博客列表、文章页分别测试移动端与桌面端。移动端首页重复三次；另使用 DevTools 请求级限速核对模拟 LCP，避免把模拟模型的估计当作实际等待时间。

另外检查三语页面的字体与版式，并核对全部构建页面可见文本的字体覆盖：原字体支持的字符在子集中仍然存在，字符宽度与边距保持一致。
