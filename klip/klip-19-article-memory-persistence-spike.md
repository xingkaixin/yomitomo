# KLIP-19: Article 与 Reading Memory 持久化生命周期 spike

Status: **no-go**（不新建 deep 生命周期 module），2026-07-28
Scope: RD-946 调查，不含生产重构

## 调查对象

同一 SQLite connection 以两种 implementation 表示跨 seam 传播：Drizzle `StoreDatabase`
与 Reading Memory 的 raw `ReadingMemorySqliteExecutor`。问题是这两种表示与事务不变量
是否已泄漏到调用方，从而值得建立一个 deep 生命周期 module。

## 事实

### 类型转换

生产代码中 `as unknown as ReadingMemorySqliteExecutor` 共 5 处：

- `apps/desktop/src/main/reading-memory/reading-memory-store.ts:515`（默认 executor）
- `apps/desktop/src/main/store/store-reading-memory-lifecycle.ts:23`
- `apps/desktop/src/main/articles/article-row-writes.ts:29`
- `apps/desktop/src/main/articles/article-annotation-memory.ts:40`
- `apps/desktop/src/main/articles/article-annotation-upsert.ts:153`

其中后四处都是同一个表达式：`getSqliteExecutor()` 的返回值转成 Memory 的 executor 类型。
即只有一条真实规则（“raw handle 就是 Memory executor”），被复制了 5 次。

### 事务 owner

| 写路径 | 事务 owner | Memory 镜像 | 失败语义 |
| --- | --- | --- | --- |
| `saveArticleRows` | `database.transaction`（`article-row-writes.ts:110`） | 事务**外** `trySyncArticleAnnotationMemoryEntries` | Article 与 soft-delete 一起回滚；镜像失败被吞，Article 保留 |
| `deleteArticleRowsWithMemoryLifecycle` | `withReadingMemoryTransaction`（`article-repository-lifecycle.ts:14`） | 事务内 | 全部回滚 |
| `deleteAnnotationRowsWithMemoryLifecycle` | `withReadingMemoryTransaction` | 事务内 | 全部回滚 |
| `deleteCommentRowsWithMemoryLifecycle` | `withReadingMemoryTransaction` | 事务内 | 全部回滚 |
| `upsertAnnotationRows` / `upsertCommentRows` | `database.transaction` | 事务**外** `syncAnnotationMemoryEntries` | 同 `saveArticleRows` |

两种事务 owner 并存：Drizzle 的 `database.transaction` 与 Memory 的
`withReadingMemoryTransaction`（内部 `BEGIN IMMEDIATE`，`reading-memory-store.ts:899`）。
删除路径统一走后者，写入路径统一走前者。

### 已固化的行为

`article-repository-lifecycle.test.ts` 新增 characterization tests：

- Article 写入失败时，annotation 行与 memory soft-delete 一起回滚。
- 只有 memory 镜像失败时，Article 保存**不**回滚，镜像缺失且错误被吞。
- annotation 删除失败时，memory soft-delete 一起回滚。

第二条是本次调查最重要的发现：Article 与 Memory 并非原子，这是刻意的降级
（`trySyncArticleAnnotationMemoryEntries` 捕获并 warn），而不是一个可以被
新 module 顺手“修好”的实现细节。

## 决策标准比对

RD-946 要求四条同时满足才进入 implementation：

1. **删除候选 module 会让规则散回三个以上调用位置** — 不满足。删除路径的事务规则
   已经集中在 `article-repository-lifecycle.ts` 一个文件里；写入路径的规则集中在
   `article-row-writes.ts`。散落的只有类型转换，不是不变量。
2. **外部 interface 更窄** — 不满足。调用方现在传的就是一个 executor；换成生命周期
   module 后仍要传同一个 connection，只是换个名字。
3. **能删除生产 `as unknown`** — 部分可行，但不需要新 module：把
   `getSqliteExecutor()` 的返回类型直接声明为兼容 Memory executor 的结构类型，即可
   一次性去掉 4 处重复转换。这是一个独立的小改动。
4. **不违反 KLIP-15** — 新建 repository/unit-of-work 抽象正是 KLIP-15 反对的形状。

四条中两条明确不满足，第三条有更小的替代方案。

## 结论

**No-go**：不建立 deep Article/Memory 生命周期 module。现有 seam 的问题不是深度不足，
而是一条类型事实被复制了 5 次。后续只需要一个小改动（收敛 executor 类型来源），
不需要新的持久化抽象。

Article 与 Memory 的非原子镜像是产品决策而非结构缺陷；若将来要改成原子，
应作为独立 issue 讨论其失败语义，而不是打包进一次重构。
