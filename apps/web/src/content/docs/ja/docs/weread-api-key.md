---
title: WeRead API キーの取得
description: Web ブラウザまたはスマホアプリから公式 WeRead Skill 認証情報を発行し、Yomitomo で安全に連携・接続テストを行います。
---

WeRead（微信読書）のノート同期は、公式の WeRead Skill API を利用しています。専用の API キーを発行し、Yomitomo の「設定 > データソース > 微信読書」に登録することで、ローカルへの安全な増量同期が可能になります。

## 取得方法 1：Web ブラウザから取得

1. PC ブラウザで <a href="https://weread.qq.com/r/weread-skills" target="_blank" rel="noopener noreferrer">WeRead Skill 公式管理ページ</a>を開きます。
2. 画面中央の「快速配置（クイック設定）」をクリックします。
3. QR コード等をスキャンして WeRead アカウントにログインします。
4. 「获取 API Key（API キーの取得）」エリアで新規作成するか、既存のキーをコピーします。
5. Yomitomo に戻り、「設定 > データソース > 微信読書」にキーを貼り付けて「保存」をクリックします。

<picture>
  <img
    src="/assets/weread-api-key-web-quick-config.webp"
    alt="WeRead Skill 公式サイトのクイック設定画面"
    loading="eager"
    decoding="async"
  />
</picture>

<picture>
  <img
    src="/assets/weread-api-key-web-created.webp"
    alt="WeRead Skill 公式サイトで API キーが発行された状態"
    loading="lazy"
    decoding="async"
  />
</picture>

## 取得方法 2：スマホアプリから取得

1. スマホで「微信読書（WeRead）」アプリを開き、ログイン状態を確認します。
2. 画面右下の「我（マイページ）」タブをタップします。
3. 画面右上のメニュー/歯車アイコンをタップして設定画面を開きます。
4. 設定一覧をスクロールし、「微信読書 Skill」をタップします。
5. ページ内の「获取 API Key」項目までスクロールします。
6. API キーを生成またはコピーします。
7. Yomitomo に戻り、「設定 > データソース > 微信読書」にキーを貼り付けて「保存」します。

<picture>
  <img
    src="/assets/weread-api-key-app-me-tab.webp"
    alt="WeRead アプリのマイページ画面"
    loading="lazy"
    decoding="async"
  />
</picture>

<picture>
  <img
    src="/assets/weread-api-key-app-skill-entry.webp"
    alt="WeRead アプリ設定内の Skill メニュー項目"
    loading="lazy"
    decoding="async"
  />
</picture>

<picture>
  <img
    src="/assets/weread-api-key-app-created.webp"
    alt="WeRead アプリで API キーが発行された画面"
    loading="lazy"
    decoding="async"
  />
</picture>

## 接続テストと同期の実行

「設定 > データソース > 微信読書」で API キーを保存後、「接続テスト」をクリックして正常に疎通できることを確認します。成功後、ライブラリ画面の「WeRead を同期」をクリックすれば、書籍、ハイライト、思考メモがローカルライブラリへ即座に取り込まれます。
