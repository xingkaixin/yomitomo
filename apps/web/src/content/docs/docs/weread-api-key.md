---
title: 微信读书 API Key 怎么获取？官方入口与配置教程
description: 从微信读书 Skill 官方网页或手机 App 获取 API Key，在 Yomitomo 中同步划线和想法。附图文步骤、找不到入口和连接失败的排查方法。
lastUpdated: 2026-10-03
---

微信读书 API Key 在官方「微信读书 Skill」页面创建。登录账号后，找到「获取 API Key」，创建并复制到 Yomitomo 的「设置 > 数据来源 > 微信读书」。它用于同步书籍信息、划线和想法，不是 AI 模型的 API Key。

本文由 Yomitomo 项目维护，根据 v0.16.2 的配置与官方入口整理。界面名称可能随微信读书版本调整。

## 方式一：网页端获取

1. 在电脑浏览器中打开 <a href="https://weread.qq.com/r/weread-skills" target="_blank" rel="noopener noreferrer">微信读书 Skill 官方管理页</a>。
2. 点击页面中央的「快速配置」按钮。
3. 扫码登录微信读书账号。
4. 在「获取 API Key」区域点击生成；若此前已生成过，直接点击「复制」即可。
5. 回到 Yomitomo，进入「设置 > 数据来源 > 微信读书」，粘贴密钥并点击「保存」。

<picture>
  <img
    src="/assets/weread-api-key-web-quick-config.webp"
    alt="微信读书 Skill 网页初始状态，页面中显示快速配置按钮和登录微信读书获取 API Key 的入口"
    loading="eager"
    decoding="async"
  />
</picture>

<picture>
  <img
    src="/assets/weread-api-key-web-created.webp"
    alt="微信读书 Skill 网页中 API Key 已创建，右侧卡片显示复制 Key 和重置 Key 按钮"
    loading="lazy"
    decoding="async"
  />
</picture>

## 方式二：手机 App 获取

1. 打开手机端「微信读书」App 并确认已登录。
2. 点击底部导航栏右下角的「我」。
3. 点击页面右上角的齿轮或功能菜单图标。
4. 在设置列表中向下滑动，找到并点击「微信读书 Skill」。
5. 进入页面后滑至「获取 API Key」卡片。
6. 点击创建或直接复制已存在的 API Key。
7. 回到 Yomitomo，在「设置 > 数据来源 > 微信读书」中完成粘贴与保存。

<picture>
  <img
    src="/assets/weread-api-key-app-me-tab.webp"
    alt="微信读书 App 的我页面，底部我 tab 处于选中状态，右上角显示功能菜单入口"
    loading="lazy"
    decoding="async"
  />
</picture>

<picture>
  <img
    src="/assets/weread-api-key-app-skill-entry.webp"
    alt="微信读书 App 设置页中显示微信读书 Skill 入口"
    loading="lazy"
    decoding="async"
  />
</picture>

<picture>
  <img
    src="/assets/weread-api-key-app-created.webp"
    alt="微信读书 App 的微信读书 Skill 页面中 API Key 已创建，页面显示复制 Key 和重置 Key 按钮"
    loading="lazy"
    decoding="async"
  />
</picture>

## 验证与测试连接

在 Yomitomo 的「设置 > 数据来源 > 微信读书」粘贴 API Key 并保存后，点击下方的「测试连接」。若提示连接成功，即可前往阅读库点击「同步微信读书」，将书架书籍、划线高亮与思考笔记无缝带入本地空间。

## 找不到入口或连接失败

| 问题 | 建议检查 |
| --- | --- |
| App 中没有「微信读书 Skill」 | 先使用本文的官方网页入口，并检查 App 是否有更新。入口和可用范围以官方页面为准。 |
| 保存后提示授权失败 | 确认复制完整，没有多余空格；如果重置过 Key，需要重新保存新值。 |
| 连接成功但没有预期笔记 | 确认生成 Key 的微信账号，并在微信读书内检查原始划线和想法。 |
| 超时或被限流 | 检查能否打开官方页面，稍后再试。不要连续重复同步。 |

API Key 属于账号凭据，请勿放进公开截图或问题反馈。Yomitomo 使用官方接口，但不能保证接口长期可用或账号永远不会受到限制。

## 获取 Key 后可以做什么？

参照[微信读书笔记同步指南](/blog/scenarios/weread-migration/)检查同步结果和备份范围。

<a href="/#download" data-umami-event="download_section_click" data-umami-event-language="zh-CN" data-umami-event-placement="guide">下载 Yomitomo，把微信读书划线和想法保存到本地</a>。
