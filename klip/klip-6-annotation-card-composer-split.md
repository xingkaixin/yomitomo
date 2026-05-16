---
Author: "Codex"
Updated: 2026-05-16
Status: Complete
Origin: klip-3-reader-components-split（AnnotationCard 内部评论输入器拆分）
---

# klip-6-annotation-card-composer-split

## 背景

- `klip-3-reader-components-split.md` 已把 `packages/reader-ui/src/reader-components.tsx` 收敛为兼容 barrel，并将 `AnnotationCard` 移到 `packages/reader-ui/src/reader-annotation-card.tsx`。
- 审查发现 `AnnotationCard` 仍同时持有评论 thread 展示、评论输入 draft、@ mention 查询、键盘选择、agent tray 和删除长按 timer。
- 其中评论输入器有明确边界：它只需要候选助手、推荐助手、发送快捷键和提交回调，不需要知道批注卡片布局、thread 展示或删除逻辑。
- 当前测试覆盖 `reader-mention-utils.ts` 的纯函数，以及 `AnnotationCard` 的折叠展示路径；但没有覆盖评论输入器里的 @ mention 菜单、Tab 插入和发送快捷键。

## 目标

- 从 `AnnotationCard` 中抽出评论输入器组件，隔离 draft / caret / mention menu / agent tray / 发送快捷键状态。
- 保持 `AnnotationCard` 对外 props 和 `reader-components.tsx` 兼容导出不变。
- 给评论输入器增加独立 Vitest + React Testing Library 测试，覆盖 @ mention 筛选、键盘插入和发送快捷键。
- 不改变现有 DOM className、可见文案和评论提交内容。

## 非目标

- 不重做批注卡片视觉设计。
- 不改变 `onAddComment`、`onDelete`、`messageSendShortcut` 等公共行为。
- 不拆出评论 thread 展示组件，除非评论输入器拆分后仍然存在真实耦合。
- 不新增表单库、状态管理库或新的输入校验。

## 发现与方案

### P1（组件职责）

#### 1. 评论输入器状态仍由 `AnnotationCard` 顶层持有

- 位置：
  - `packages/reader-ui/src/reader-annotation-card.tsx` 的 `AnnotationCard`
  - `packages/reader-ui/src/reader-annotation-card.tsx` 的 `handleKeyDown`、`insertAgent`、`closeAgentTrayOnBlur`
- 现象 / 风险：
  - 评论输入器行为和批注卡片布局混在一起，导致单测只能通过完整 `AnnotationCard` 进入。
  - @ mention 键盘路径是用户输入边界，应直接测试，而不是依赖大型组件 smoke path。
  - 后续如果修改评论输入体验，会再次触碰删除长按、评论 thread 和 primary comment 展示上下文。
- 建议方案：
  - 新增 `reader-annotation-comment-composer.tsx`，移动 draft、caret、mention menu、agent tray 和发送快捷键逻辑。
  - `AnnotationCard` 继续负责展开/收起、thread 展示、删除长按和 `onAddComment(annotation.id, content)` 适配。
  - 通过 `focusRequestKey` 让 `replyRequestKey` 触发输入框聚焦，避免父组件直接持有 textarea ref。
- 验收标准：
  - [x] `AnnotationCard` 不再直接持有评论 draft、caret index、mention menu 和 agent tray 状态。
  - [x] 评论输入器可以独立测试 @ mention 筛选和键盘行为。
  - [x] 删除长按 timer 仍留在 `AnnotationCard`，卸载 cleanup 不变。

## 建议落地顺序

1. 新增 `AnnotationCommentComposer` 并把输入器 JSX 与相关状态移动进去。
2. 在 `AnnotationCard` 中用 `AnnotationCommentComposer` 替换原输入器区块。
3. 新增 `reader-annotation-comment-composer.test.tsx` 覆盖 mention 筛选、Tab 插入、Enter 发送。
4. 运行 `pnpm --filter @yomitomo/reader-ui test -- reader-annotation-comment-composer reader-components`、`typecheck`、`lint`、`format:check`。

## 验收标准

- [x] `pnpm --filter @yomitomo/reader-ui test -- reader-annotation-comment-composer reader-components` 通过。
- [x] `pnpm --filter @yomitomo/reader-ui typecheck` 通过。
- [x] `pnpm --filter @yomitomo/reader-ui lint` 通过。
- [x] `pnpm --filter @yomitomo/reader-ui format:check` 通过。
