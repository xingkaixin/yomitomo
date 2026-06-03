# PR Title Requirements

Regular PRs should be written in English, including the title, section content, and reviewer notes.
Use Chinese only when the PR specifically targets Chinese copy, localization, or project-local issue notes.

请使用 Conventional Commits 格式：

```text
<type>(<scope>): <description>
```

示例：

```text
feat(reader): add pdf annotation support
fix(sync): resolve duplicate note issue
refactor(agent): simplify tool execution flow
docs: update deployment guide
```

允许的 type：

* feat
* fix
* refactor
* perf
* docs
* test
* chore
* ci
* build

说明：

* 使用小写英文
* description 使用祈使句
* 不要以句号结尾
* 标题长度建议不超过 72 个字符

---

## Why

为什么需要这次修改？

<!-- 描述背景、问题或需求 -->

---

## What Changed

本次修改内容：

*
*
*

---

## Impact

影响范围：

* [ ] Reader
* [ ] Annotation
* [ ] AI Chat
* [ ] Memory
* [ ] Sync
* [ ] Search
* [ ] Settings
* [ ] API
* [ ] Infrastructure

---

## Notes for Reviewer

请重点关注：

*
*
*
