#!/usr/bin/env bash
#
# compress-videos.sh
#
# 指定フォルダ（既定: ~/Downloads）直下にある .mov ファイルを
# H.264 / AAC の .mp4 に再エンコードして圧縮する。
#
#   - 出力は元ファイルと同じフォルダに「同名 .mp4」で書き出す
#   - 元ファイル(.mov)は削除しない（消すかどうかは目視確認のうえ手動で）
#   - 同名 .mp4 が既にある場合はスキップ（FORCE=1 で上書き）
#   - サブフォルダは見ない（"同じフォルダ内" の .mov だけが対象）
#   - 追加ツールとして ffmpeg が必要（未導入なら導入方法を案内する）
#
# 使い方:
#   bash scripts/compress-videos.sh                 # ~/Downloads の .mov を処理
#   bash scripts/compress-videos.sh ~/Movies        # 指定フォルダを処理
#   CRF=20 bash scripts/compress-videos.sh          # もっと高画質（サイズ大）に
#   CRF=28 bash scripts/compress-videos.sh          # もっと低画質（サイズ小）に
#   FORCE=1 bash scripts/compress-videos.sh         # 既存 .mp4 を上書きして再変換
#   DELETE_ORIGINAL=1 bash scripts/compress-videos.sh   # 成功した .mov を変換後に削除
#
set -euo pipefail

# ---- 設定（環境変数で上書き可）---------------------------------------
CRF="${CRF:-23}"          # 画質。小さいほど高画質・大サイズ（18-28 が実用域）
PRESET="${PRESET:-medium}" # 圧縮にかける手間。slow ほど高圧縮・低速
AUDIO_BITRATE="${AUDIO_BITRATE:-128k}"  # 音声ビットレート
FORCE="${FORCE:-0}"            # 1 で既存 .mp4 を上書き
DELETE_ORIGINAL="${DELETE_ORIGINAL:-0}" # 1 で変換成功した .mov を削除
# ----------------------------------------------------------------------

# ffmpeg の存在確認（未導入なら導入方法を案内して終了）
if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "エラー: 'ffmpeg' が見つかりません。" >&2
  if command -v brew >/dev/null 2>&1; then
    echo "  Homebrew で導入できます:  brew install ffmpeg" >&2
  else
    echo "  https://ffmpeg.org/download.html から導入してください。" >&2
  fi
  exit 1
fi

# 対象フォルダ。引数があればそれを、なければ ~/Downloads を使う。
DIR="${1:-$HOME/Downloads}"

if [ ! -d "$DIR" ]; then
  echo "エラー: フォルダ '$DIR' が存在しません。" >&2
  exit 1
fi

total=0
converted=0
skipped=0
failed=0
before_total=0
after_total=0

# 対象フォルダ「直下」の .mov を列挙（大文字 .MOV も対象 / 再帰しない）
while IFS= read -r -d '' src; do
  total=$((total + 1))

  dir="$(dirname "$src")"
  base="$(basename "$src")"
  name="${base%.*}"
  out="$dir/$name.mp4"

  # 既に同名 .mp4 がある場合は既定でスキップ
  if [ -e "$out" ] && [ "$FORCE" != "1" ]; then
    echo "  - スキップ: $base （$name.mp4 が既にあります。上書きするなら FORCE=1）"
    skipped=$((skipped + 1))
    continue
  fi

  echo "  ▶ 変換中: $base"

  # H.264(yuv420p) + AAC、Web 再生向けに faststart。
  # 失敗しても全体は止めずに次へ進む（set -e 対策で if で受ける）。
  if ffmpeg -hide_banner -loglevel error -y \
       -i "$src" \
       -map 0 -map -0:d -map -0:s \
       -c:v libx264 -crf "$CRF" -preset "$PRESET" -pix_fmt yuv420p \
       -c:a aac -b:a "$AUDIO_BITRATE" \
       -movflags +faststart \
       "$out"; then

    before_bytes="$(stat -f%z "$src" 2>/dev/null || echo 0)"
    after_bytes="$(stat -f%z "$out" 2>/dev/null || echo 0)"
    before_total=$((before_total + before_bytes))
    after_total=$((after_total + after_bytes))

    before_h="$(du -h "$src" | cut -f1)"
    after_h="$(du -h "$out" | cut -f1)"

    # 削減率（before が 0 なら計算しない）
    if [ "$before_bytes" -gt 0 ]; then
      pct=$(( (before_bytes - after_bytes) * 100 / before_bytes ))
      echo "  ✓ $base ($before_h) -> $name.mp4 ($after_h)  ${pct}% 削減"
    else
      echo "  ✓ $base -> $name.mp4 ($after_h)"
    fi
    converted=$((converted + 1))

    # 変換に成功したら元 .mov を削除（任意）
    if [ "$DELETE_ORIGINAL" = "1" ]; then
      rm -f "$src"
      echo "    （元ファイル $base を削除しました）"
    fi
  else
    echo "  ✗ 変換失敗: $base" >&2
    rm -f "$out"  # 中途半端な出力を残さない
    failed=$((failed + 1))
  fi
done < <(
  find "$DIR" -maxdepth 1 -type f -iname '*.mov' -print0 | sort -z
)

echo ""
if [ "$total" -eq 0 ]; then
  echo "対象フォルダ '$DIR' に .mov ファイルが見つかりませんでした。"
else
  echo "完了: 変換 $converted 件 / スキップ $skipped 件 / 失敗 $failed 件（対象 $total 件）"
  if [ "$before_total" -gt 0 ] && [ "$converted" -gt 0 ]; then
    saved_pct=$(( (before_total - after_total) * 100 / before_total ))
    # MiB 表示（小数1桁）
    before_mb=$(awk "BEGIN{printf \"%.1f\", $before_total/1048576}")
    after_mb=$(awk "BEGIN{printf \"%.1f\", $after_total/1048576}")
    echo "合計サイズ: ${before_mb} MiB -> ${after_mb} MiB（${saved_pct}% 削減）"
  fi
  if [ "$DELETE_ORIGINAL" != "1" ]; then
    echo "元の .mov は残しています。内容を確認のうえ不要なら手動で削除してください。"
  fi
fi

# 1 件でも失敗があれば異常終了（呼び出し側で検知できるように）
[ "$failed" -eq 0 ]
