# Yomitomo 版本发布指南

本文记录从上一版本 tag 到对外发布的一整套文档与产物同步流程。文件名按惯例写作 `release-guide.md`

## 范围与原则

- **版本区间**：以 `git tag vX.Y.Z` 为界，用 `git log vPREV..HEAD --oneline --no-merges` 核对变更，避免只写 milestone 中途草稿而漏掉后续迭代。
- **用户向 vs 工程向**：根目录 `CHANGELOG*.md` 与官网 changelog 面向用户；工程条目可写进 CHANGELOG 的 Engineering，不必全部塞进更新弹窗 JSON。
- **双语**：中文默认路径与 `en/` 英文路径成对维护（文档、changelog、release-notes JSON）。
- **发布日**：各处的「发布日期 / Released」与计划打 tag 的日期一致（例如与 `HEAD` 提交日或约定发布日对齐）。

## 发布前检查（代码）

从仓库根目录：

```bash
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
```

桌面端 native 边界（升级 Electron / `better-sqlite3` 后必跑）：

```bash
pnpm --filter @yomitomo/desktop native:verify
```

确认 `apps/desktop/package.json` 的 `version` 与目标版本一致。

## 发布前检查（Download Worker）

Download Worker 是官网下载入口和自动更新 feed 的代理层，入口域名为
`https://download.yomitomo.app`。每次发布前都应把它作为独立链路检查；如果本轮修改了
`apps/download/**`、`apps/download/wrangler.jsonc`、根目录部署脚本或下载/更新 asset
命名规则，在公开发布前部署 Worker：

```bash
pnpm --filter @yomitomo/download test
pnpm --filter @yomitomo/download typecheck
pnpm deploy:download
```

如果本轮没有改动 Worker 代码或配置，可以跳过部署，但发布后 smoke check 仍必须执行。

## 发布前：图片资源（按需）

每次发布前快速过一遍视觉是否仍代表当前产品，**不必每版都换图**，但若本版改了阅读器、设置、主题或品牌呈现，建议同步截图或插画。

### 应用更新弹窗封面

路径：`apps/desktop/src/renderer/src/assets/update/`

| 文件 | 用途 |
| --- | --- |
| `updater-cover-lighter.webp` | 亮色 / 浅色主题下「发现新版本」「更新说明」弹窗头图 |
| `updater-cover-darker.webp` | 暗色 / 黄昏靛蓝等深色主题下的同一弹窗头图 |

引用位置：`apps/desktop/src/renderer/src/shell/app-update-dialog.tsx`（随主题切换 lighter / darker）。替换后本地打开更新弹窗或跑相关测试（如 `app-update-dialog.test.tsx`）确认比例与裁切正常。

**何时更新**：更新弹窗版式大改、阅读器/设置视觉翻新、新主题默认图需要体现本版卖点时。

### 官网与 README 示意图（可选）

与帮助文档、README 中 `<picture>` / `![...](apps/web/public/assets/...)` 一致的资源通常在 `apps/web/public/assets/`（如 `read.webp`、`webpage.webp`、`epub.webp`）及 `apps/web/public/assets/carousel/`（落地页轮播）。若 UI 与文档描述不一致，在发布前重截并保留多宽度 `*-1600.webp` / `*-2400.webp` 源图，避免文档仍展示旧界面。

## 文档与资源清单

按新版本 `X.Y.Z` 逐项更新（将 `0.7.0` / `v0-7-0` 替换为实际版本）。

| 用途 | 路径 | 说明 |
| --- | --- | --- |
| 仓库 changelog（英） | `CHANGELOG.md` | 新增 `## X.Y.Z - YYYY-MM-DD` 节；旧版本保留 |
| 仓库 changelog（中） | `CHANGELOG_zh.md` | 与英文结构对应 |
| 项目 README | `README.md`, `README_zh.md` | 核心能力等与当前产品一致即可，不必复述整份 changelog |
| 官网 changelog 索引 | `apps/web/src/content/docs/changelogs/index.md` | 摘要 + 发布日期 |
| 官网 changelog 索引（英） | `apps/web/src/content/docs/en/changelogs/index.md` | 同上 |
| 官网 changelog 详情 | `apps/web/src/content/docs/changelogs/v0-X-Y-Z.md` | 可从根 CHANGELOG 精简 |
| 官网 changelog 详情（英） | `apps/web/src/content/docs/en/changelogs/v0-X-Y-Z.md` | 同上 |
| 帮助文档（中） | `apps/web/src/content/docs/docs/*.md` | 按功能变更按需改 `index`、`reader`、`settings`、`library`、`stats-and-faq` 等 |
| 帮助文档（英） | `apps/web/src/content/docs/en/docs/*.md` | 与中文页面对齐 |
| 更新弹窗（打包进应用） | `apps/desktop/resources/release-notes/zh-CN/X.Y.Z.json` | 短亮点，，`audience`: `reader` / `settings` |
| 更新弹窗（打包进应用） | `apps/desktop/resources/release-notes/en/X.Y.Z.json` | 同上 |
| 更新弹窗（官网 CDN） | `apps/web/public/release-notes/zh-CN/X.Y.Z.json` | **与 desktop resources 内容保持一致** |
| 更新弹窗（官网 CDN） | `apps/web/public/release-notes/en/X.Y.Z.json` | 同上 |

### release-notes JSON 约定

- 顶层：`version`、`highlights[]`。
- 每条 highlight：`type`（`new` | `changed` | `fixed` | `deprecated`）、`title`、`description`、`audience`。
- 条数建议 4–6 条，面向「更新前 / 更新后」弹窗，不要粘贴完整 CHANGELOG。
- 把功能翻译成「这跟我有关」，落到一个具体的人身上（场景、情绪、身份），公式是帮助谁、在什么时候、解决什么问题。
- 桌面端读取逻辑见 `apps/desktop/src/main/app/release-notes.ts`：
  - **更新前**：`remote` → `https://yomitomo.app/release-notes/{locale}/{version}.json`
  - **更新后**：`local` → `apps/desktop/resources/release-notes/...`
  - 开发环境 remote 失败时会回退 local，便于调试弹窗。

同步 public 与 resources（示例）：

```bash
cp apps/desktop/resources/release-notes/zh-CN/X.Y.Z.json apps/web/public/release-notes/zh-CN/X.Y.Z.json
cp apps/desktop/resources/release-notes/en/X.Y.Z.json apps/web/public/release-notes/en/X.Y.Z.json
```

## 发布后：Download Worker Smoke Check

GitHub Release 产物上传完成后、对外公告前，替换 `X.Y.Z` 并检查以下 URL。目标是确认官网下载入口、electron-updater manifest、`/updates` 前缀代理和 blockmap 代理都能访问真实 release asset。

```bash
curl -I https://download.yomitomo.app/releases/download/vX.Y.Z/Yomitomo-X.Y.Z-mac-arm64.dmg
curl -I https://download.yomitomo.app/latest-mac.yml
curl -I https://download.yomitomo.app/updates/latest-mac.yml
curl -I https://download.yomitomo.app/updates/releases/download/vX.Y.Z/Yomitomo-X.Y.Z-mac-arm64.zip.blockmap
```

预期：安装包和 blockmap 返回 `200` 或 GitHub 跟随后的成功响应；manifest 内容来自 latest release
的 `latest-mac.yml`，且 `/latest-mac.yml` 与 `/updates/latest-mac.yml` 指向同一上游 manifest。

## 撰写 CHANGELOG 的步骤

1. `git log vPREV..HEAD --oneline --no-merges` 通读提交主题，按 **Features / Performance / Fixes / Engineering**（中文：新功能 / 性能 / 修复 / 工程）归类。
2. 与已有 milestone 草稿对比，**补写** tag 之后新增的 PR（例如翻译、音效、安全、CI 签名等）。
3. 条目末尾保留 `(#PR)` 便于追溯。
4. 将精简版同步到 Starlight changelog 页面；索引页只保留 3–4 条 bullet。
