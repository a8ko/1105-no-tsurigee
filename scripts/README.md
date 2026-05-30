# scripts

開発用のユーティリティスクリプト置き場。

## compress-assets.sh — 画像の圧縮・変換

プロジェクト内の `assets` ディレクトリにある **PNG / JPG** 画像を、
**品質 70 の JPEG** に変換し、**横幅 800px** に縮小します。

- 縦横比は維持します
- 横幅が 800px 未満の画像は拡大しません（そのままの幅で変換）
- **元ファイルは削除しません**。変換結果は各 `assets` フォルダ内の `compressed/` に出力されます
- macOS 標準の `sips` のみを使用するため、追加インストールは不要です

### 実行方法

プロジェクトルートで実行します。

```bash
# プロジェクト全体の assets 配下を変換
bash scripts/compress-assets.sh
```

特定のディレクトリだけを対象にする場合は、パスを引数で渡します。

```bash
# docs/assets だけを変換
bash scripts/compress-assets.sh docs/assets
```

実行権限を付けておけば、直接実行もできます。

```bash
chmod +x scripts/compress-assets.sh
./scripts/compress-assets.sh
```

### 実行後の流れ

1. 各 `assets` フォルダ内に `compressed/` ができ、変換済みの `.jpg` が出力されます
2. 画質・サイズを確認します
3. 問題なければ、不要になった**元ファイルを手動で削除**します
4. 必要に応じて `compressed/` 内のファイルを元の場所へ移動します

### 設定の変更

品質や横幅を変えたい場合は、`compress-assets.sh` 冒頭の設定値を編集してください。

```bash
QUALITY=70        # JPEG 品質 (0-100)
MAX_WIDTH=800     # 出力する最大の横幅 (px)
OUT_DIRNAME="compressed"  # 変換結果を入れるサブフォルダ名
```

### 注意

- 透過 PNG を JPEG に変換すると、透過部分は背景色で塗りつぶされます（JPEG は透過非対応のため）。
- このスクリプトは macOS 専用です（`sips` を使用）。
