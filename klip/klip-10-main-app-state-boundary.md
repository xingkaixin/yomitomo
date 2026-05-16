---
Author: "Codex"
Updated: 2026-05-16
Status: Draft
Origin: 2026-05-16 codebase review（主应用状态聚合拆分）
---

# klip-10-main-app-state-boundary

## 背景

- `apps/desktop/src/renderer/src/main.tsx` 当前约 650 行，`App` 组件同时承担应用 shell、导航、onboarding、store 同步、阅读库写入、设置草稿、provider 表单、用户资料弹窗和助手开关。
- 该文件不是单纯行数偏大，而是把多个生命周期不同的状态放在一个组件闭包内：全局 `DesktopStore`、设置草稿、provider 草稿、保存状态、onboarding 状态、文章更新队列和 UI shell 展开状态。
- `main.tsx` 目前是 renderer 的入口文件，任何设置页、阅读库或 onboarding 改动都容易触碰同一个高复杂度组件。
- 本 KLIP 的目标是明确主应用状态边界，避免后续直接在 `App` 中继续堆状态和 IPC 写入逻辑。

## 现状

- `App` 定义在 `apps/desktop/src/renderer/src/main.tsx:69`，组件开头集中声明二十多个 `useState` / `useRef`，覆盖 `store`、`activeSetting`、`userDraft`、`settingsDraft`、`providerDraft`、多个 `SaveState`、`storeLoaded`、`pendingOpenArticleId`、`onboardingForced` 和 `articleUpdateQueueRef`。
- store 初始化与外部更新订阅位于 `apps/desktop/src/renderer/src/main.tsx:96` 到 `apps/desktop/src/renderer/src/main.tsx:115`，同一 effect 同时调用 `refreshStore`、同步 user/settings draft 和设置 loaded 状态。
- 阅读库写入逻辑位于 `apps/desktop/src/renderer/src/main.tsx:219` 到 `apps/desktop/src/renderer/src/main.tsx:286`，包含 `saveArticle`、`updateArticle`、`saveArticleReadingProgress`、乐观更新和串行队列。
- 设置保存逻辑位于 `apps/desktop/src/renderer/src/main.tsx:328` 到 `apps/desktop/src/renderer/src/main.tsx:420`，`saveProfileDraft`、`saveGeneralSettingsDraft`、`saveShortcutSettingsDraft`、`saveProviderDraft`、`saveProviderRoutes` 共享相似的保存状态切换模式。
- 顶层 JSX 位于 `apps/desktop/src/renderer/src/main.tsx:458` 起，负责 sidebar、daily quote、阅读库、统计页、设置页、助手页和 profile dialog 的拼装。

## 目标

- 把 `App` 收敛为应用 shell + 页面路由拼装，不再直接持有所有设置草稿和文章写入流程。
- 抽出 `useDesktopStore` 或同等 hook，统一 `getState`、`onStoreUpdated`、`applyStore` 和 `storeRef` 同步。
- 抽出阅读库写入 hook，承接 `saveArticle`、`updateArticle`、`saveArticleReadingProgress` 和 `articleUpdateQueueRef`。
- 抽出设置草稿 hook，承接 user/settings/provider draft、`SaveState` 和保存回写逻辑。
- 保持现有 UI 行为、IPC contract 和 `ReadingLibrary` / settings panels 的 props 语义不变。

## 非目标

- 不重做应用导航或设置页视觉。
- 不迁移到全局状态库。
- 不改变 `window.yomitomoDesktop` preload API。
- 不改变 `ReadingLibrary`、`ProviderSettings`、`AgentSettings` 的 public props，除非后续实现阶段证明局部 props 合并能显著降低复杂度。
- 不把 `apps/desktop/src/main/store.ts` 的持久化逻辑纳入本 KLIP。

## 发现与方案

### P1（应用状态边界）

#### 1. Store 同步、draft 同步和 loaded 状态混在入口组件中

- 位置：
  - `apps/desktop/src/renderer/src/main.tsx:70`
  - `apps/desktop/src/renderer/src/main.tsx:96`
  - `apps/desktop/src/renderer/src/main.tsx:177`
- 现象 / 风险：
  - `setStore`、`setUserDraft`、`setSettingsDraft` 在 `refreshStore`、`onStoreUpdated`、`applyStore` 和多个 save handler 中重复出现。
  - 后续新增 store 字段时，容易只同步 `store` 而忘记同步对应 draft。
- 建议方案：
  - 新增 `app-desktop-store-state.ts`，导出 `useDesktopStoreState`。
  - hook 返回 `store`、`storeLoaded`、`refreshStore`、`applyStore`、`storeRef`。
  - draft 初始化不在这个 hook 内做，避免 store hook 认识 settings panel 细节。
- 验收标准：
  - [ ] `main.tsx` 不直接调用 `window.yomitomoDesktop.getState()`。
  - [ ] `onStoreUpdated` 订阅只存在于 store hook。
  - [ ] `storeRef.current` 与 `store` 同步有测试或 hook smoke test 覆盖。

#### 2. 文章写入队列属于阅读库边界，不属于 app shell

- 位置：
  - `apps/desktop/src/renderer/src/main.tsx:219`
  - `apps/desktop/src/renderer/src/main.tsx:232`
  - `apps/desktop/src/renderer/src/main.tsx:249`
- 现象 / 风险：
  - `updateArticle` 与 `saveArticleReadingProgress` 都依赖 `articleUpdateQueueRef` 串行化写入。
  - 这条规则对阅读库正确性重要，但目前埋在 `App` 中，后续改 sidebar 或 settings 也必须加载这段心智。
- 建议方案：
  - 新增 `app-article-store-actions.ts` 或 `use-app-article-actions.ts`。
  - hook 接收 `storeRef`、`setStore`、`desktop`，返回 `deleteArticle`、`saveArticle`、`updateArticle`、`saveArticleReadingProgress`、`importArticleUrl`、`importEbookFile`。
  - `readFileArrayBuffer` 可随 EPUB import action 移入同一模块。
- 验收标准：
  - [ ] 文章写入队列只由阅读库 action hook 持有。
  - [ ] `ReadingLibrary` 接收的保存/导入 props 名称和行为不变。
  - [ ] 现有 `app-reading-library` 与 `app-source-bookcase` 测试继续通过。

#### 3. 设置草稿和保存状态可以按设置域拆 hook

- 位置：
  - `apps/desktop/src/renderer/src/main.tsx:74`
  - `apps/desktop/src/renderer/src/main.tsx:328`
  - `apps/desktop/src/renderer/src/main.tsx:375`
  - `apps/desktop/src/renderer/src/main.tsx:397`
- 现象 / 风险：
  - profile/general/shortcut/provider/routes 保存流程都包含 `saving -> saved -> idle`，但错误状态和副作用散在主组件中。
  - `providerDraft`、`selectedProviderId`、`testState` 与 provider panel 强相关，不应由 app shell 直接维护。
- 建议方案：
  - 新增 `use-settings-drafts.ts`，按 user/settings/provider 三块返回 draft、dirty flags、save handlers 和 save states。
  - 先保持 `ProviderSettings` props 不变，只把生成这些 props 的逻辑移出 `App`。
- 验收标准：
  - [ ] `main.tsx` 不直接持有 `profileSaveState`、`providerSaveState`、`routeSaveState` 等保存状态。
  - [ ] provider 新建、选择、删除、测试路径仍由现有 settings tests 覆盖。
  - [ ] shortcut 冲突判断仍使用 `selectionActionShortcutsConflict`。

## 建议落地顺序

1. 先抽 `useDesktopStoreState`，只移动 store 加载、订阅、apply 和 `storeRef` 同步。
2. 再抽阅读库 action hook，保留 `ReadingLibrary` props 不变。
3. 再抽 settings draft hook，先不调整 settings panel 组件结构。
4. 最后把 sidebar/header/profile dialog 这类纯 JSX shell 抽成小组件，前提是前 3 步已经让 `App` 足够薄。

## 验收标准

- [ ] `apps/desktop/src/renderer/src/main.tsx` 控制在 350 行以内。
- [ ] `App` 只负责 shell layout、顶层页面切换和 hook 组装。
- [ ] `pnpm --filter @yomitomo/desktop test -- app-settings app-reading-library app-source-bookcase` 通过。
- [ ] `pnpm --filter @yomitomo/desktop typecheck` 通过。
- [ ] `pnpm --filter @yomitomo/desktop lint` 通过。
- [ ] `pnpm test`、`pnpm build` 在最终 PR 中通过。

## 关键参考位置

- `apps/desktop/src/renderer/src/main.tsx`
- `apps/desktop/src/renderer/src/app-settings.ts`
- `apps/desktop/src/renderer/src/app-settings-panels.tsx`
- `apps/desktop/src/renderer/src/app-reading-library.tsx`
- `apps/desktop/src/renderer/src/app-reading-library-home.tsx`
