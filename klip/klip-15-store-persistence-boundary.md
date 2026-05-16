---
Author: "Codex"
Updated: 2026-05-16
Status: Complete
Origin: 2026-05-16 code health review（Store persistence 拆分价值评估）
---

# klip-15-store-persistence-boundary

## 背景

- `apps/desktop/src/main/store.ts` 和 `store-normalizers.ts` 在指标中靠前。
- 但这两个文件处在 persistence boundary：SQLite row、credential store、legacy migration、normalization 和 domain record 的转换集中在这里并不天然错误。
- 纯粹为了降低行数而拆，会增加跨文件跳转和隐式耦合，尤其是 provider API key 与 legacy SQLite 字段之间的迁移路径。

## 结论

当前不建议拆 `store.ts` / `store-normalizers.ts`。

审查时发现 `apps/desktop/src/main/store.test.ts` 只覆盖 `mergeSettingsForUpsert`，
provider / agent 持久化行为没有测试。这个问题不应该作为拆文件触发条件，因为测试不足
无法证明拆分边界合理；它应该先作为 persistence boundary 的加固项处理。

本次实施范围：

- 不拆 `store.ts` / `store-normalizers.ts`。
- 为 `saveProvider` / `saveAgent` 使用的 key-storage 决策和 record construction 补测试。
- 保持 SQLite schema、credential store 行为和 public store shape 不变。

未来拆分触发条件应该是：

- 要改 provider / agent 持久化 schema。
- 要新增 article / reading-card / ebook 字段并修改 normalizer。
- 要调整 credential store / legacy API key 迁移。

在这些条件出现之前，保留集中 persistence boundary 的价值大于拆文件收益。

## 可接受的小改动

如果未来碰到相关功能，可以继续做这些低风险步骤：

- [x] 为 `saveProvider` 和 `saveAgent` 补更具体的 unit tests。
- [x] 把 record construction 抽成纯函数，如 `buildProviderRecord`、`buildAgentRecord`。
- 按实体拆 normalizer：settings、article/ebook、reading-card、provider/agent。

## 非目标

- 不为了指标拆 `store.ts`。
- 不引入 repository class 或 ORM abstraction。
- 不改变 SQLite schema。
- 不改 credential store 行为。

## 风险

- `saveProvider` 同时处理 preset fallback、model input mode、keyring ref 和 legacy key，拆错会直接影响用户 API key。
- normalizer 是系统边界，过早拆分可能让字段默认值分散到多个文件。

## 验收标准

- `resolveProviderApiKeyStorage` 覆盖新 API key 写入 keyring ref 和 legacy key 保留。
- `buildProviderRecord` 覆盖 public store 不回填明文、`hasApiKey` 和 remove key 后的 provider settings 保留。
- `buildAgentRecord` 覆盖新建 normalize 和 partial update 字段保留。
- `pnpm --filter @yomitomo/desktop test -- store` 通过。
- `pnpm --filter @yomitomo/desktop typecheck`、`lint`、`format:check` 通过。

如果未来继续按实体拆 normalizer，新抽出的边界也需要配套对应实体测试。

## 实施结果

- 从 `saveProvider` 抽出 `resolveProviderApiKeyStorage` 和 `buildProviderRecord`，测试 keyring ref 决策、legacy key 保留、public store 不泄漏 API key，以及 remove key partial update。
- 从 `saveAgent` 抽出 `buildAgentRecord`，测试新建 normalize 和 partial update 保留已有字段。
- 修复 `saveProvider({ id, removeApiKey: true })` 这类局部更新没有保留 `existing.name` 的问题。
