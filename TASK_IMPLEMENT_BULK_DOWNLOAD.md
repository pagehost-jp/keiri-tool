# 現場作業員（ Claude Code ）への作業指示書

## 🎯 目的（MISSION）
`keiri-tool` に「**全データ＆領収書画像をZIPで一括ダウンロードする機能**」を実装せよ。
これにより、社長が「ボタン1つ」でクラウドとブラウザに散らばった生データを物理的に抽出し、HQ（01_HQ-System）へ丸投げできる完全な納品用パッケージを作成できるようにする。

---

## 🛠 実装の要件定義

既存のデータは LocalStorage（メタデータ） と Firebase Storage（画像本体） に分散している。
これらを1つの `.zip` ファイルにパッケージングしてダウンロードさせる機能を構築すること。

### 1. 外部ライブラリの導入
`index.html` の `<head>` または `<body>` 末尾に、ZIP生成とファイル保存のための以下のCDNを追加せよ。
- **JSZip**: `https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js`
- **FileSaver.js**: `https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js`

### 2. UIの追加（ダウンロードボタン）
`index.html` の「データ管理・バックアップ」ボタン群の近く（「Excelエクスポート」の隣など）に、目立つ新しいボタンを追加せよ。
- ボタン名：「**全データ一括ダウンロード（画像を含むZIP）**」
- id: `btnBulkDownload`
- クリックイベントで `app.js` の新関数 `downloadAllDataAsZip()` を発火させること。

### 3. ロジックの実装（app.js）
`app.js` に新しい非同期関数 `downloadAllDataAsZip()` を実装せよ。

**【処理フロー】**
1. **ロード開始**: 「ZIPファイルを生成中です。画像が多いと時間がかかります...」等のローディング表示（またはコンソール/アラート通知）を出す。
2. **JSZipの初期化**: `const zip = new JSZip();` を実行。
3. **JSONデータのアタッチ**: `localStorage.getItem(STORAGE_KEY)` で取得した取引データ（または既存の `transactions` 配列）を `transactions.json` という名前でZIPの直下に追加する。
4. **画像データの並列ダウンロードとアタッチ**:
   - 取引データの中をループし、`imageUrl` が存在するもの（Firebase Storageへのリンク）を特定。
   - `fetch(t.imageUrl)` で画像のBlob（バイナリ）データを取得する。
   - ZIP内に `receipts/` フォルダを作り、その中に `t.id + ".jpg"`（例: `1764751263191.jpg`）という名前で画像を格納する。
   - ※注意: CORSエラーを避けるため、必要な場合はfetchのモード等に気をつけること。Firebase Storageは通常CORS設定が必要だが、既存の設定で問題なく表示できているならそのままfetch可能か確認せよ。
5. **ZIPの生成と保存**:
   - `zip.generateAsync({type:"blob"})` を実行しZIPデータを生成。
   - `saveAs(content, "keiri_full_backup_" + new Date().toISOString().split('T')[0] + ".zip")` を実行し、ユーザーの端末へダウンロードさせる。
6. **完了通知**: ダウンロード完了後、「完了しました」とアラートを出す。

---

## ⚠️ Claude Codeへの注意事項（Must）
1. **既存機能の破壊厳禁**: 既存のFirestore・Storage連携、画像圧縮、OCR機能、Excel書き出し機能には一切触れないこと。
2. **セキュリティルールの遵守**: データベースの構造自体は変更しない。あくまで「読み取り（Read）」と「パッケージング」のみの機能追加とする。
3. 当指示書を読み込み次第、即座に実装を開始し、コードの書き換えが完了したら報告せよ。
