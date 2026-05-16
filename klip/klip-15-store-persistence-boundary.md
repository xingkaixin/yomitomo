---
Author: "Codex"
Updated: 2026-05-16
Status: Deferred
Origin: 2026-05-16 code health review（Store persistence 拆分价值评估）
---

# klip-15-store-persistence-boundary

## 背景

- `apps/desktop/src/main/store.ts` 和 `store-normalizers.ts` 在指标中靠前。
- 但这两个文件处在 persistence boundary：SQLite row、credential store、legacy migration、normalization 和 domain record 的转换集中在这里并不天然错误。
- 纯粹为了降低行数而拆，会增加跨文件跳转和隐式耦合，尤其是 provider API key 与 legacy SQLite 字段之间的迁移路径。

## 结论

当前不建议立即拆。

拆分触发条件应该是：

- 要改 provider / agent 持久化 schema。
- 要新增 article / reading-card / ebook 字段并修改 normalizer。
- 要调整 credential store / legacy API key 迁移。
- `store.test.ts` 覆盖明显不足，导致修改 persistence 时风险升高。

在这些条件出现之前，保留集中 persistence boundary 的价值大于拆文件收益。

## 可接受的小改动

如果未来碰到相关功能，可以先做这些低风险步骤：

- 为 `saveProvider` 和 `saveAgent` 补更具体的 unit tests。
- 把 record construction 抽成纯函数，如 `buildProviderRecord`、`buildAgentRecord`。
- 按实体拆 normalizer：settings、article/ebook、reading-card、provider/agent。

## 非目标

- 不为了指标拆 `store.ts`。
- 不引入 repository class 或 ORM abstraction。
- 不改变 SQLite schema。
- 不改 credential store 行为。

## 风险

- `saveProvider` 同时处理 preset fallback、model input mode、keyring ref 和 legacy key，拆错会直接影响用户 API key。
- normalizer 是系统边界，过早拆分可能让字段默认值分散到多个文件。

## 验收标准（如果未来执行）

- 每个被抽出的纯函数都有针对 provider/agent/settings/article 的测试。
- `pnpm --filter @yomitomo/desktop test -- store` 通过。
- `pnpm --filter @yomitomo/desktop typecheck`、`lint`、`format:check` 通过。
