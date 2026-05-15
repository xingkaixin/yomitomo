---
Author: "Codex"
Updated: 2026-05-16
Status: Draft
---

# klip-4-settings-panels-split

## 背景

- `apps/desktop/src/renderer/src/app-settings-panels.tsx` 仍有约 2000 行，是 desktop renderer 的主要大文件之一。
- 文件同时承载设置导航、通用设置、快捷键设置、用户资料弹窗、模型供应商管理、任务路由、助手库、ProviderForm、AgentForm 和一组配置列表 / 输入控件。
- 设置域的变化通常集中在模型、助手、快捷键三个方向，继续共享一个大文件会增加不相关功能的 review 成本。

## 现状

- `ProviderSettings` 在 `apps/desktop/src/renderer/src/app-settings-panels.tsx:800`，内部含响应式 provider editor dialog、provider list、task route 和测试状态。
- `AgentSettings` 在 `apps/desktop/src/renderer/src/app-settings-panels.tsx:1259`，负责助手列表、筛选和启用状态。
- `ProviderForm` 在 `apps/desktop/src/renderer/src/app-settings-panels.tsx:1495`，负责 provider preset、API type、baseUrl、model list 获取、API key、reasoning effort。
- `AgentForm` 在 `apps/desktop/src/renderer/src/app-settings-panels.tsx:1798`，负责助手 profile、启用状态、颜色和批注密度。
- Provider/Agent 相关 assets map、文案 map 和 form helpers 都定义在同一文件顶部。

## 目标

- 将设置面板按设置域拆成独立文件。
- 保持 `main.tsx` 现有 import API 可兼容，必要时由 `app-settings-panels.tsx` re-export。
- 把 provider model list 获取逻辑与纯 UI 表单边界分开，降低 `ProviderForm` 圈复杂度。
- 保持样式类名和用户交互不变。

## 非目标

- 不重做设置页信息架构。
- 不改变 provider / agent 持久化字段。
- 不迁移 CSS。
- 不引入表单库或 schema validation 库。

## 发现与方案

### P1（模块边界）

#### 1. Provider 设置把列表、弹窗、路由和表单混在一个文件

- 位置：
  - `apps/desktop/src/renderer/src/app-settings-panels.tsx:800`
  - `apps/desktop/src/renderer/src/app-settings-panels.tsx:1030`
  - `apps/desktop/src/renderer/src/app-settings-panels.tsx:1146`
  - `apps/desktop/src/renderer/src/app-settings-panels.tsx:1495`
- 现象 / 风险：
  - `ProviderSettings` 管响应式布局和 dialog。
  - `ProviderEditorContent` 管 editor 外壳。
  - `TaskProviderRoutes` 管任务 provider route。
  - `ProviderForm` 管 provider 字段和模型列表获取。
  - 四类职责共享一个文件，任何 provider form 改动都会触碰完整设置面板上下文。
- 建议方案：
  - 新增 `app-settings-provider-panel.tsx`，移动 `ProviderSettings`、`ProviderEditorContent`、`TaskProviderRoutes`、`ProviderForm` 和 provider logo map。
  - 抽 `useProviderModelOptions(draft, onChange)`，承接 `fetchModels` 的 loading/error/notice 状态。
  - `app-settings-panels.tsx` 保留 re-export，降低调用侧改动。
- 验收标准：
  - [ ] Provider 相关组件不再定义在 `app-settings-panels.tsx`。
  - [ ] `ProviderForm` 文件内没有与 Agent 设置相关的 imports。
  - [ ] 模型获取成功、失败、无 API Key fallback 路径有测试覆盖。

#### 2. Agent 列表与 Agent 表单应按助手域独立

- 位置：
  - `apps/desktop/src/renderer/src/app-settings-panels.tsx:1259`
  - `apps/desktop/src/renderer/src/app-settings-panels.tsx:1336`
  - `apps/desktop/src/renderer/src/app-settings-panels.tsx:1798`
- 现象 / 风险：
  - Agent 列表使用 profile cover assets、presence line 文案、filter tabs。
  - Agent 表单使用 personality、颜色、密度和状态控制。
  - 这两块都只依赖 `app-settings.ts` 的 agent types/options，不需要与 Provider form 共享文件。
- 建议方案：
  - 新增 `app-settings-agent-panel.tsx`，移动 `AgentSettings`、`AgentProfileListCard`、`AgentFilterTabs`、`AgentForm`、颜色预览和头像编辑。
  - 如果 assets map 太长，单独放 `app-settings-agent-assets.ts`。
- 验收标准：
  - [ ] Agent 相关组件不再定义在 `app-settings-panels.tsx`。
  - [ ] Agent panel 文件只 import agent/profile 相关 assets。
  - [ ] `app-settings-panels.test.tsx` 中 Agent 场景继续通过。

### P2（基础 shell）

#### 3. `app-settings-panels.tsx` 应只保留导航和通用 section shell

- 位置：
  - `apps/desktop/src/renderer/src/app-settings-panels.tsx:281`
  - `apps/desktop/src/renderer/src/app-settings-panels.tsx:307`
  - `apps/desktop/src/renderer/src/app-settings-panels.tsx:357`
  - `apps/desktop/src/renderer/src/app-settings-panels.tsx:434`
- 现象 / 风险：
  - 当前文件既是设置 shell，又是所有设置域实现。
  - shell 修改与具体设置域修改无法隔离。
- 建议方案：
  - `app-settings-panels.tsx` 保留 `SettingsNavButton`、`SettingsSectionShell`、`GeneralSettings`、`ShortcutSettings`、`DataManagementSettings` 等较轻面板。
  - Provider 和 Agent 域通过 re-export 暴露。
- 验收标准：
  - [ ] `app-settings-panels.tsx` 控制在 600 行以内。
  - [ ] `main.tsx` 的 import 不需要一次性大改。

## 建议落地顺序

1. 先拆 Provider 域，因为 `ProviderForm` 圈复杂度和异步路径最高。
2. 再拆 Agent 域，并保留现有测试。
3. 最后清理 `app-settings-panels.tsx` 的 re-export 和 imports。

## 验收标准

- [ ] `pnpm --filter @yomitomo/desktop test -- app-settings-panels` 通过。
- [ ] `pnpm --filter @yomitomo/desktop typecheck` 通过。
- [ ] `pnpm --filter @yomitomo/desktop lint` 通过。
- [ ] 设置页 Provider、Agent、Shortcut 基本交互手测无行为变化。
