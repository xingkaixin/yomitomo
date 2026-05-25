---
title: 设置、模型与数据
description: 配置 Provider、任务路由、快捷键、本地数据和应用更新。
---

设置页负责产品边界上的配置：外部模型供应商、用户输入习惯、本地数据和应用更新。

## 模型供应商

Yomitomo 支持预设供应商和 OpenAI 兼容自定义供应商。添加供应商时需要填写名称、Base URL、API Key、模型和推理力度。

预设供应商包括：

- OpenAI
- Anthropic
- Google Gemini
- DeepSeek
- MiniMax
- 阿里云百炼
- Moonshot
- 智谱
- 火山引擎
- 小米 MiMo

API Key 会保存在系统 keyring 中，SQLite 只保留 provider 配置和 key 引用。

## 微信读书

微信读书同步需要单独配置微信读书 API KEY。获取方式见「[获取微信读书 API KEY](/docs/weread-api-key/)」。

## 任务路由

配置供应商后，需要为不同任务指定模型：

| 任务 | 用途 |
| --- | --- |
| 阅读理解助手 | 阅读器批注生成和 `@` 提及回复 |
| 深度审阅助手 | 证据、逻辑和表达复核 |

## 快捷键

消息发送可以选择 `Enter` 直接发送，或 `Cmd/Ctrl+Enter` 发送。阅读器选区操作支持自定义复制和批注快捷键，按键必须是单个字母，且不能重复。

## 数据管理

数据管理提供查看数据目录、日志和数据库文件的入口，也支持备份和还原 SQLite 数据库。

## 应用更新

Yomitomo 支持 macOS 和 Windows 更新流程。应用会在启动时检查新版本，也可以在「设置 > 关于」中手动检查更新。
