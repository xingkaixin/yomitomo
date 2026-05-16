---
Author: "Codex"
Updated: 2026-05-16
Status: Complete
Origin: 2026-05-16 code health review（Provider Settings 价值驱动拆分）
---

# klip-12-provider-settings-boundary

## 背景

- `apps/desktop/src/renderer/src/app-settings-provider-panel.tsx` 当前约 870 行。
- 指标本身不是拆分理由；真正的问题是 provider 设置页同时承载 provider 列表、provider 表单、模型列表拉取、自定义模型编辑、API key 状态、路由提示和 provider 测试状态。
- 这些区域的变更原因不同：模型拉取可能因 provider API 变化调整，表单字段可能随 provider schema 演进，列表/路由只关心选择和默认配置。
- 该模块有现成测试覆盖 settings 行为，拆分风险可控，且比 EPUB runtime 和 persistence 层低。

## 目标

- 让 provider 设置页从“列表 + 表单 + 模型拉取 + key 状态”单体组件，收敛为 page shell + 明确子组件 / hook。
- 降低 `ProviderForm`、`fetchModels` 和自定义模型编辑的局部复杂度。
- 保持 `ProviderSettings` 对外 props 和现有 UI 行为不变。

## 非目标

- 不重做设置页视觉。
- 不改变 provider persistence 结构。
- 不改变 `window.yomitomoDesktop` preload API。
- 不引入全局状态库或表单库。

## 拆分价值判断

这里值得拆，不是因为 870 行，而是因为它有多个真实 owner：

- provider 列表：选择、删除、新建。
- provider 表单：字段草稿、dirty 状态、保存。
- 模型拉取：异步状态、provider-specific API 结果、错误展示。
- 模型编辑：list/custom 两种输入模式。
- API key：已有密钥、移除密钥、新密钥输入。

这些职责会被不同需求触碰。分离后，新增 provider preset 或调整模型拉取时，不需要重新理解整个设置页。

## 建议方案

### 1. 抽 `ProviderList`

- 位置：当前 `app-settings-provider-panel.tsx` 列表区域。
- 输入：providers、selectedProviderId、route usage、onSelect、onCreate、onDelete。
- 价值：把 provider 选择和删除确认从表单状态里拿出去。

### 2. 抽 `ProviderForm`

- 现有 `ProviderForm` 已是函数组件，但仍在同一大文件中。
- 可以移动到 `app-settings-provider-form.tsx`。
- 保持 props 显式，不引入巨型 view model。

### 3. 抽 `useProviderModelFetch`

- 位置：`fetchModels` 附近。
- 输入：draft、test callback / list models callback。
- 输出：loading/error 状态和 `fetchModels`。
- 价值：模型拉取失败、空结果、custom/list 模式切换可以独立测试。

### 4. 抽 `ProviderModelFields`

- 承接 `modelInputMode`、`modelName`、`modelNames`、自定义模型编辑。
- 价值：这是最容易持续增长的 UI 区域，独立后不会继续推高主表单复杂度。

## 风险

- 表单 props 较多，容易为了拆分制造“全量 view model”参数。
- API key 状态和 `removeApiKey` 语义不能被子组件误清理。
- 模型拉取依赖当前草稿值，抽 hook 时要避免 stale draft。

## 验收标准

- `app-settings-provider-panel.tsx` 收敛到 page shell 和 provider selection 编排。
- `ProviderForm` 移出后仍不直接写 store，只通过现有 callbacks 工作。
- 模型拉取状态由独立 hook 管理。
- `pnpm --filter @yomitomo/desktop test -- app-settings app-settings-panels` 通过。
- `pnpm --filter @yomitomo/desktop typecheck`、`lint`、`format:check` 通过。
