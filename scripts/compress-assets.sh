#!/usr/bin/env bash
#
# compress-assets.sh
#
# プロジェクト内の "assets" ディレクトリにある PNG / JPG 画像を
# 品質 70 の JPEG に変換し、横幅を 800px に縮小する。
#
#   - 縦横比は維持する
#   - 横幅が 800px 未満の画像は拡大しない（そのままの幅で変換）
#   - 元ファイルは削除しない（変換結果は assets/compressed/ に出力）
#   - macOS 標準の `sips` のみを使用（追加インストール不要）
#
# 使い方:
#   bash scripts/compress-assets.sh            # プロジェクト全体の assets を処理
#   bash scripts/compress-assets.sh docs/assets  # 特定のディレクトリだけ処理
#
set -euo pipefail

# ---- 設定 -------------------------------------------------------------
QUALITY=70        # JPEG 品質 (0-100)
MAX_WIDTH=800     # 出力する最大の横幅 (px)
OUT_DIRNAME="compressed"  # 変換結果を入れるサブフォルダ名
# ----------------------------------------------------------------------

# sips の存在確認（macOS 以外では使えない）
if ! command -v sips >/dev/null 2>&1; then
  echo "エラー: 'sips' が見つかりません。このスクリプトは macOS 専用です。" >&2
  exit 1
fi

# 探索対象のルート。引数があればそれを、なければカレントディレクトリを使う。
ROOT="${1:-.}"

if [ ! -e "$ROOT" ]; then
  echo "エラー: '$ROOT' が存在しません。" >&2
  exit 1
fi

total=0
converted=0

# 対象画像を列挙する。
#   - assets ディレクトリ配下のみ
#   - 出力先 (compressed/) は除外して二重変換を防ぐ
#   - node_modules は除外
while IFS= read -r -d '' src; do
  total=$((total + 1))

  src_dir="$(dirname "$src")"
  out_dir="$src_dir/$OUT_DIRNAME"
  mkdir -p "$out_dir"

  # 拡張子を .jpg に統一した出力ファイル名
  base="$(basename "$src")"
  name="${base%.*}"
  out="$out_dir/$name.jpg"

  # 元画像の横幅を取得
  width="$(sips -g pixelWidth "$src" | awk '/pixelWidth/ {print $2}')"

  # 横幅が MAX_WIDTH を超える場合だけリサイズする（拡大はしない）
  if [ -n "$width" ] && [ "$width" -gt "$MAX_WIDTH" ]; then
    sips -s format jpeg -s formatOptions "$QUALITY" \
         --resampleWidth "$MAX_WIDTH" \
         "$src" --out "$out" >/dev/null
    resize_note="-> 幅 ${MAX_WIDTH}px に縮小"
  else
    sips -s format jpeg -s formatOptions "$QUALITY" \
         "$src" --out "$out" >/dev/null
    resize_note="(幅 ${width}px のまま)"
  fi

  before="$(du -h "$src"  | cut -f1)"
  after="$(du -h "$out"  | cut -f1)"
  echo "  ✓ $src ($before) -> $out ($after) $resize_note"
  converted=$((converted + 1))
done < <(
  find "$ROOT" \
    -type d \( -name node_modules -o -name "$OUT_DIRNAME" \) -prune -o \
    -type f -path '*/assets/*' \
    \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' \) \
    -print0
)

echo ""
if [ "$total" -eq 0 ]; then
  echo "assets 内に変換対象の画像が見つかりませんでした。"
else
  echo "完了: $converted / $total 件を変換しました。"
  echo "変換結果は各 assets フォルダ内の '$OUT_DIRNAME/' に出力されています。"
  echo "内容を確認したうえで、不要になった元ファイルは手動で削除してください。"
fi
