---
title: "Zotero × AI 論文精読ワークフロー：PDF注釈とローカルAI連携ガイド"
description: Zoteroで管理する論文PDFをローカルAI（Ollama・APIキー）と精読する方法。無料オープンソース読書アプリYomitomoへの取り込み、段落ごとのAI対話、Markdown書き戻し手順を解説。
lastUpdated: 2026-11-27
---

Zoteroで管理している論文PDFをYomitomoに手動で取り込み、原文に注釈を付けてAIと対話できます。文献情報と正式な引用はZoteroで管理し続けます。**Zoteroアカウントの直接接続や、ハイライト・メモの自動同期はありません。**

Yomitomoプロジェクトがv0.18.2の機能と設定に基づいてまとめたガイドです。

## この組み合わせでできること

| 作業 | 使うツール | 受け渡し方法 |
| --- | --- | --- |
| 文献情報・引用の管理 | Zotero | Zoteroのライブラリをそのまま利用 |
| PDFの精読・注釈・AI対話 | Yomitomo | ローカルのPDFファイルを手動で取り込み |
| 論点ごとのまとめ（蒸留） | Yomitomo | 1つのハイライトの対話から「この考えをまとめる」で整理し、必要に応じてレビュー担当アシスタントに点検を依頼 |
| 執筆用のメモと引用 | Zoteroや執筆ツール | 「Markdown (.md) をエクスポート」または「Markdownをコピー」で持ち出し。正式な引用は原本とZoteroで確認 |

Zoteroだけで読書が完結している場合、すべての文献を移す必要はありません。段落ごとのAI対話を試したい論文を1本選んで始められます。

## 1. ZoteroからPDFファイルを用意する

Zoteroのライブラリで対象文献を展開し、PDF添付ファイルを右クリックして「ファイルを表示（Show File）」を開きます。クラウドにだけ存在する場合は先にダウンロードしてください。ここで渡すのはPDF原本です。Zotero内の注釈やメモがYomitomoの注釈に変換されるわけではありません。

Zotero側のPDFと注釈については[公式のPDFリーダーガイド](https://www.zotero.org/support/pdf_reader)を参照してください。

## 2. Yomitomoへ取り込む

ライブラリの「+」からPDF文書の追加を選び、Zoteroのフォルダから確認したPDFファイルを選択またはドラッグします。開いた文書で文章を選択できることを確認してください。画像だけのスキャンPDFにはOCR機能がないため、別途OCRが必要です。

<figure>
  <img src="/assets/en-import-pdf-1280.webp" alt="YomitomoのPDF追加ダイアログ（英語UIの例）。文献管理ツールから用意したローカルPDFを選択する" width="1280" height="851" loading="lazy" decoding="async" />
  <figcaption>PDF原本を手動で取り込みます。Zoteroとの自動同期画面ではありません。</figcaption>
</figure>

取り込んだPDFはYomitomoのデータ領域にも保存されるため、元の保存場所とは別にディスク容量を使います。[ライブラリとインポート](/ja/docs/library/)で対応範囲を確認できます。

## 3. 論点ごとに読む

結論、実験条件、限界を述べた段落などを選び、`A` でハイライトと考えを作成します。対話欄の `@` からアシスタント（`@黒沢 蓮` や `@森 海斗` など）を選び、次のような質問を試します。

- この結論が成立する条件は何か。
- 比較実験で固定されている変数は何か。
- 著者が明示した限界と、自分が推測した限界を分けられるか。

<figure>
  <img src="/assets/en-reader-1280.webp" alt="Yomitomoの読書ビュー（英語UIの例）。原文ハイライトと注釈・AI対話カードが並んで表示される" width="1280" height="818" loading="lazy" decoding="async" />
  <figcaption>原文の位置に結び付いた注釈と対話。後から開いても前後の文脈へ戻れます。</figcaption>
</figure>

英語論文の単段テキストPDFであれば、ページ単位の二言語対訳も併用できます。AIには設定したモデルを使います。リモートモデルなら関連する本文や対話が接続先へ送られます。設定方法は[設定、モデル、データ管理](/ja/docs/settings/)を参照してください。

## 4. 読後のメモをZoteroに戻す

重要な論点はディスカッション画面の「この考えをまとめる」から整理し、必要に応じて右側のレビューパネルでレビュー担当アシスタントに論理や根拠を点検してもらいます。

読後は次の手順でZotero側へ戻します。

1. リーダーツールバーから論文全体のハイライト・考え・対話・公開済みまとめを「Markdown (.md) をエクスポート」または「Markdownをコピー」します（まとめ画面から個別のまとめだけ出力することも可能）。
2. Zoteroで該当文献を選び、子メモを追加してMarkdownの内容を貼り付けます。
3. 論文執筆時のBibTeX出力やWord・LaTeXへの引用挿入は、そのままZoteroで行います。文献タイトルとページ番号も原本で確認してください。

Yomitomoの原文アンカーや注釈座標はZotero側へ自動同期されません。また、LaTeX・BibTeX出力や注釈付きPDFの書き戻しには対応していないため、引用情報や参考文献リストの生成は引き続きZotero側で行います。

## よくある質問 (FAQ)

### Q1: Zoteroの標準PDFリーダーではなくYomitomoを併用する理由は？

Zoteroのリーダーは文献管理と一体で素早くハイライトを引くのに向いています。Yomitomoは精読する中核論文に絞り、原文に固定した複数ターンのAI対話、1論点ごとのまとめ（蒸留）とレビュー担当アシスタントによる差分点検、単段PDFの二言語対訳、複数論文を横断するローカル読書メモリー（ライブラリに質問・関連を探す）を加えられます。

### Q2: Yomitomoのハイライトや注釈はZoteroや元のPDFに自動同期されますか？

自動同期されません。注釈・対話・まとめはYomitomoのローカルSQLiteに保存され、元のPDFファイルは改変されません。Zoteroへ戻す際は、内蔵の「Markdown (.md) をエクスポート」または「Markdownをコピー」を使い、Zoteroの該当文献の子メモへ貼り付けます。

### Q3: BibTeXや引用管理はどう使い分けますか？

文献の収集、DOI管理、BibTeX出力、WordやLaTeXへの引用挿入はすべてZotero側で行います。YomitomoはBibTeX・LaTeX出力に対応していないため、役割を分けることでZoteroの書誌データをきれいに保てます。

### Q4: PDFを取り込むとストレージを二重に消費しますか？

はい。Yomitomoは元のZoteroフォルダを書き換えないよう、アプリのデータ領域にPDFのコピーを保存します。Zotero全体を一括移行するのではなく、精読したい中核論文だけを取り込む運用をおすすめします。

## 試してから使い分ける

<a href="/ja/#download" data-umami-event="download_section_click" data-umami-event-language="ja" data-umami-event-placement="guide">Yomitomoをダウンロードして、論文1本で試す</a>。

- [PDFに注釈を付けてAIと読む：Yomitomoの使い方](/ja/blog/scenarios/pdf-annotation/)
- [OllamaローカルAI読書ガイド：無料でPDF・EPUBをオフライン精読](/ja/blog/scenarios/local-ai-reading-with-ollama/)
- [リーダー、注釈、ディスカッション](/ja/docs/reader/)
