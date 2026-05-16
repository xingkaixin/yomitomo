---
Author: "Codex"
Updated: 2026-05-16
Status: Complete
Origin: 2026-05-16 codebase review（助手批注播放队列拆分）
---

# klip-9-agent-annotation-playback-queue

## 背景

- `packages/reader-ui/src/use-agent-annotation-queue.ts` 约 553 行，是 Web 阅读器助手批注播放的核心 hook。
- 当前 hook 同时管理队列调度、轮转公平性、虚拟阅读 timer、虚拟光标、AgentReadingDock、DOM anchor 定位、theater highlight、保存 fallback 和 active annotation 切换。
- 其中 `processAgentAnnotationQueue` 位于 `packages/reader-ui/src/use-agent-annotation-queue.ts:346`，`playAgentAnnotation` 位于 `packages/reader-ui/src/use-agent-annotation-queue.ts:393`，两者把 queue scheduling 和 DOM playback 放在同一个闭包里。
- 该模块承担用户可感知的动画节奏，不能做大范围重写；应该先拆职责边界，再逐步补测试。

## 现状

- 队列数据结构：
  - `agentAnnotationQueuesRef`、`agentQueueOrderRef`、`lastPlayedAgentRef`、`agentAnimationRunningRef` 位于 `packages/reader-ui/src/use-agent-annotation-queue.ts:94` 到 `packages/reader-ui/src/use-agent-annotation-queue.ts:98`。
  - `enqueueAgentAnnotation`、`nextQueuedAgentKey`、`cleanupAgentQueue` 位于 `packages/reader-ui/src/use-agent-annotation-queue.ts:119` 到 `packages/reader-ui/src/use-agent-annotation-queue.ts:168`。
- 虚拟阅读状态：
  - `VirtualReadingSession` 类型位于 `packages/reader-ui/src/use-agent-annotation-queue.ts:16` 到 `packages/reader-ui/src/use-agent-annotation-queue.ts:28`。
  - `startVirtualReading`、`tickVirtualReading`、`finishVirtualReading` 位于 `packages/reader-ui/src/use-agent-annotation-queue.ts:186` 到 `packages/reader-ui/src/use-agent-annotation-queue.ts:315`。
- 播放流程：
  - `processAgentAnnotationQueue` 负责轮转、暂停阅读 session、调用播放、失败 fallback、peer wait 和最终 cleanup，位置在 `packages/reader-ui/src/use-agent-annotation-queue.ts:346` 到 `packages/reader-ui/src/use-agent-annotation-queue.ts:390`。
  - `playAgentAnnotation` 负责 DOM anchor resolve、range 建立、可见性判断、virtual cursor、theater highlight、保存批注和 active id，位置在 `packages/reader-ui/src/use-agent-annotation-queue.ts:393` 到 `packages/reader-ui/src/use-agent-annotation-queue.ts:518`。

## 目标

- 把队列调度、虚拟阅读、DOM 播放拆成可理解的模块。
- 保持 `useAgentAnnotationQueue` 对外返回值不变，避免影响 `app-source-bookcase-web.tsx`。
- 给队列调度和虚拟阅读偏移计算补纯函数测试。
- 保持动画时序、日志事件名和 fallback 保存行为不变。

## 非目标

- 不重做助手批注动画视觉。
- 不改变 `AgentReadingDock` 的 API。
- 不改变 `resolveTextAnchor`、`rangeFromOffsets`、`rangeHighlightBoxes` 等底层定位算法。
- 不把 EPUB 播放队列合并进这个 hook；EPUB 有 Foliate/iframe 差异，应由 `klip-8` 的 runtime adapter 保持隔离。

## 发现与方案

### P1（状态边界）

#### 1. 队列调度逻辑和 DOM 播放逻辑耦合

- 位置：
  - `packages/reader-ui/src/use-agent-annotation-queue.ts:119`
  - `packages/reader-ui/src/use-agent-annotation-queue.ts:149`
  - `packages/reader-ui/src/use-agent-annotation-queue.ts:346`
- 现象 / 风险：
  - round-robin、公平性、peer wait 和 cleanup 规则只能通过完整 hook 间接验证。
  - 播放 DOM 失败时的 fallback 保存和队列 cleanup 混在一起，未来修改动画容易影响调度规则。
- 建议方案：
  - 新增 `reader-agent-annotation-queue.ts`，实现纯队列模型：`enqueue`、`next`、`markPlayed`、`cleanup`、`count`、`hasPeerWork`。
  - `useAgentAnnotationQueue` 持有这个队列模型的 ref，但调度细节不再散落在 hook 内。
- 验收标准：
  - [x] round-robin 顺序有单元测试。
  - [x] 空队列 cleanup 会移除 agent key。
  - [x] peer agent 没有排队批注但仍在虚拟阅读时，仍保留短暂等待策略。

#### 2. 虚拟阅读 session、光标和 dock 状态混在主 hook 中

- 位置：
  - `packages/reader-ui/src/use-agent-annotation-queue.ts:98`
  - `packages/reader-ui/src/use-agent-annotation-queue.ts:186`
  - `packages/reader-ui/src/use-agent-annotation-queue.ts:236`
  - `packages/reader-ui/src/use-agent-annotation-queue.ts:279`
- 现象 / 风险：
  - 虚拟阅读本身有独立状态机：start、tick、pause、done、finish、cleanup。
  - `usesAgentDock`、`activeDockReadingIdsRef`、`dockReadingHadFailureRef` 与光标 timer 混在一起，增加播放流程理解成本。
- 建议方案：
  - 新增 `use-agent-virtual-reading.ts`，承接 session map、timer、virtual cursor 和 dock completion 规则。
  - `normalizedReadingSections`、`currentReadingSection`、`nextReadingOffset` 移到 `reader-agent-virtual-reading.ts` 并导出测试。
  - 主 hook 只调用 `virtualReading.start/pause/resume/finish/cleanup`。
- 验收标准：
  - [x] `useAgentAnnotationQueue` 不直接持有 `virtualReadingSessionsRef`。
  - [x] `nextReadingOffset` 覆盖多 section、section wrap、空 section 三类测试。
  - [x] cleanup 时仍清理所有 timer、cursor 和 dock 状态。

#### 3. `playAgentAnnotation` 同时处理定位、动画和持久化 fallback

- 位置：
  - `packages/reader-ui/src/use-agent-annotation-queue.ts:393`
  - `packages/reader-ui/src/use-agent-annotation-queue.ts:406`
  - `packages/reader-ui/src/use-agent-annotation-queue.ts:423`
  - `packages/reader-ui/src/use-agent-annotation-queue.ts:451`
- 现象 / 风险：
  - DOM surface 缺失、anchor unresolved、range missing、offscreen、visible target 五条路径都在同一个函数里。
  - fallback 保存规则是正确性路径，不应该和具体动画细节纠缠。
- 建议方案：
  - 新增 `reader-agent-annotation-playback.ts`。
  - 提供 `playAgentAnnotationPlayback(annotation, dependencies)`，dependencies 显式传入 refs、保存函数、active setter、cursor updater、theater setter、virtual reading adapter 和 logger。
  - 如果 dependencies 过多，则先只抽纯路径判断：`resolveAgentAnnotationPlaybackTarget`，保留动画在 hook 中，避免为了拆分制造透传式巨函数。
- 验收标准：
  - [x] anchor unresolved 时仍会保存批注并记录 `agent.play.anchor_unresolved`。
  - [x] offscreen 批注仍会展示虚拟光标后保存并激活批注。
  - [x] target mode 完成后仍调用 virtual reading finish。

## 建议落地顺序

1. 先抽纯队列模型 `reader-agent-annotation-queue.ts`，补单元测试。
2. 再抽虚拟阅读纯函数，并把 session/timer/dock 管理移入 `use-agent-virtual-reading.ts`。
3. 最后处理 `playAgentAnnotation`：优先抽路径判断；只有依赖边界清晰时再移动完整播放函数。
4. 每一步都保持 `useAgentAnnotationQueue` 的返回字段不变。

## 验收标准

- [x] `packages/reader-ui/src/use-agent-annotation-queue.ts` 控制在 260 行以内。
- [x] `useAgentAnnotationQueue` public return shape 不变。
- [x] `pnpm --filter @yomitomo/reader-ui test -- reader-agent` 通过。
- [x] `pnpm --filter @yomitomo/reader-ui typecheck` 通过。
- [x] `pnpm --filter @yomitomo/reader-ui lint` 通过。
- [x] `pnpm --filter @yomitomo/desktop typecheck` 通过。
