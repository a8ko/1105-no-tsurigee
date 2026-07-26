#!/usr/bin/env bash
#
# deploy.sh
#
# 今ローカルにある変更を保存(コミット)してGitHubに送り、
# GitHub Pages (https://a8ko.github.io/1105-no-tsurigee/) を最新の状態にする。
# 実際の公開作業は push 後に GitHub Actions (.github/workflows/deploy.yml) が
# 自動で行う。反映まで1〜3分ほどかかる。
#
# 使い方:
#   npm run deploy
#
set -euo pipefail

cd "$(dirname "$0")/.."

echo "変更を確認しています..."
git status --short

if [ -z "$(git status --porcelain)" ]; then
  echo "変更はありません。デプロイをスキップします。"
  exit 0
fi

echo ""
echo "型チェック中..."
npm run typecheck

git add -A
MESSAGE="deploy: $(date '+%Y-%m-%d %H:%M') 時点を公開"
git commit -m "$MESSAGE"
git push origin main

echo ""
echo "GitHubに送りました(${MESSAGE})"
echo "1〜3分後に反映されます:"
echo "https://a8ko.github.io/1105-no-tsurigee/sandbox"
