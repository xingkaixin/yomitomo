---
title: 获取微信读书 API KEY
description: 通过网页端或微信读书 App 创建官方 Skill 凭据，并在 Yomitomo 中完成安全绑定与同步测试。
---

微信读书数据同步基于官方 WeRead Skill API。只需获取专属 API Key，并粘贴至 Yomitomo 的「设置 > 数据来源 > 微信读书」即可开启单向增量同步。

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
