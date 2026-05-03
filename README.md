<p align="center">
  <img src="assets/yomitomo-logo.png" alt="Yomitomo logo" width="120" />
</p>

# Yomitomo

Yomitomo 是面向深度阅读的本地阅读伙伴，把网页阅读、文本批注、讨论线程和 AI 助手放进同一个阅读现场。它的目标是让用户在阅读时直接留下判断、追问和上下文，并让 AI 助手围绕原文参与批注。

## 产品价值

- 把网页转成更稳定的阅读视图，减少原站页面噪音。
- 让高亮和批注绑定到原文片段，回到同一篇文章时可以继续阅读和讨论。
- 用 threaded annotations 承载阅读过程中的想法、追问和回复。
- 通过桌面端配置 AI provider 和助手身份，让 AI 基于当前文章和选中文本参与对话。
- 数据优先保存在本机：扩展侧使用 `browser.storage.local`，桌面端使用 Electron `userData`。

## 功能简述

### 浏览器扩展

- 点击扩展图标进入或退出阅读器模式。
- 自动抽取网页正文、标题、作者和摘要信息。
- 支持文章目录、阅读字号、内容宽度调节。
- 选中文本后创建高亮和批注。
- 每条批注拥有独立讨论线程，可继续回复。
- 批注锚点使用文本偏移和上下文片段恢复，适配同一文章的再次打开。
- 连接本地桌面端后，可选择 AI 助手进行主动批注。

### 桌面端

- 运行本地 WebSocket 服务：`127.0.0.1:43891`。
- 管理用户身份：昵称、username、头像、批注颜色。
- 管理 LLM provider：类型、base URL、API key、模型名。
- 管理 AI 助手：昵称、username、头像、批注颜色、角色提示词。
- 提供 provider 连通性测试和本地日志路径。

### 共享能力

- `@yomitomo/shared` 提供共享类型、ID 生成、文本哈希、文本锚点创建和解析。
- `@yomitomo/core` 提供跨端业务核心逻辑，包括批注创建、评论更新、@ 提及解析、批注作者信息、阅读统计和阅读卡片生成。
- desktop、extension 通过共享协议传递用户、助手、文章、批注和消息数据。

## 项目结构

```text
apps/desktop      Electron 桌面端
apps/extension    WXT 浏览器扩展
packages/core     跨端业务核心逻辑
packages/shared   共享类型和文本锚定工具
```

## 开发

```bash
pnpm install
pnpm dev
```

常用命令：

```bash
pnpm lint
pnpm test
pnpm build
pnpm format
```

单包运行：

```bash
pnpm --filter @yomitomo/desktop dev
pnpm --filter @yomitomo/extension dev
pnpm --filter @yomitomo/core test
pnpm --filter @yomitomo/shared build
```

## 安装扩展

```bash
pnpm --filter @yomitomo/extension build
```

然后在 Chrome 打开 `chrome://extensions`，启用开发者模式，加载 `apps/extension/dist/chrome-mv3`。

## 桌面端

```bash
pnpm --filter @yomitomo/desktop dev
```

桌面端启动后，扩展会通过 `ws://127.0.0.1:43891` 获取用户和助手配置，并把 AI 批注请求发送到本地服务处理。

## 代码分层

- `packages/shared` 保持为基础层：共享类型、协议类型、ID/哈希、文本锚定。
- `packages/core` 承载跨端业务逻辑：批注、评论、提及、阅读统计、阅读卡片。
- `apps/extension/src/reader-*` 承载扩展阅读器的文章抽取、DOM 范围、高亮、展示组件和工具逻辑。
- `apps/desktop/src/renderer/src/app-*` 承载桌面端 renderer 的设置业务和展示工具。
