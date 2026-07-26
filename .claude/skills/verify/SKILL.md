---
name: verify
description: このリポジトリ（歩行サンドボックス／釣り試作）を実機（Playwright）で検証するときのビルド・起動・操作の手順
---

# このプロジェクトの検証レシピ

## 起動

```bash
npm run dev   # http://localhost:5173/ 、サンドボックスは /sandbox.html
```

`http://localhost:5173/sandbox.html` で歩行サンドボックス（1280×720）が開く。
`window.__SANDBOX__` が Phaser.Game インスタンス（起動確認に使える）。

## Playwright での駆動

- 参考実装: `scripts/smoke-sandbox.mjs`（歩行・当たり判定エディタ）、`scripts/verify-stage1-fishing.mjs`（ステージ1釣り一式）、`scripts/verify-tuning-panel.mjs`（釣り調整パネル＝DOM の UI）
- 調整パネル（`G` キー）は Phaser ではなく **DOM** で作られているので、`.tp-root` などの CSS セレクタで直接操作・確認できる（スライダーは `value` を入れて `input` イベントを dispatch する）
- `chromium.launch({ channel: "chrome", headless: true })` + `newPage({ viewport: { width: 1280, height: 720 } })`
- シーン取得: `window.__SANDBOX__.scene.getScene("WalkSandboxScene")` / `getScene("SandboxFishingScene")`
- アクティブ判定: `window.__SANDBOX__.scene.isActive("<SceneKey>")`
- TS の `private` フィールド／メソッドも実行時はただのJSプロパティなので、`page.evaluate` から `scene["confirmChoice"]()` のように直接呼べる（デバッグ・状態注入に便利）。

## 既知の落とし穴：`page.keyboard.press("Space")` が拾われないことがある

`press()` は down→up をほぼ同時に送るため、この環境では Phaser の
`Phaser.Input.Keyboard.JustDown()` や `InputManager` のエッジ検出に**拾われないことがある**
（ArrowRight/KeyC 等は `press()`/`down()+up()` どちらでも問題なく動く。Space だけ再現した）。

**対策**: down → 数十ms待つ → up、に分けて送ること。

```js
await page.keyboard.down("Space");
await new Promise((r) => setTimeout(r, 50));
await page.keyboard.up("Space");
```

さらに、Space の `down()` を送った直後に**即座に**状態確認の `evaluate` を呼ぶと、
ブラウザ側のフレーム処理が間に合わずまだ反映前のことがある。down/up の後には
最低 100ms 程度の待ち時間を挟んでから状態を読むこと。

**もう1つの罠**: 上記のタイミング不足で「押した判定」に失敗した場合、`keyboard.up("Space")`
を呼ばないまま次の処理に進むと、Playwright 内部では Space が「押しっぱなし」のままになり、
以降の `down()`/`press()` が無反応になる（既に押されている扱いになるため）。
Space を使う一連の操作は必ず `try/finally` で囲み、失敗経路でも `keyboard.up("Space")` を
呼んで解放すること。

## 歩行サンドボックスのイベント地点を直接踏ませる（歩かせず時短する）

`WalkSandboxScene` の `pos`（論理座標）を直接書き換えて、実際の `checkStepEvents()`
（毎フレーム自動実行）に拾わせるのが手軽（歩行そのものは既存の smoke-sandbox.mjs で別途担保済み）。

```js
await page.evaluate(() => {
  const s = window.__SANDBOX__.scene.getScene("WalkSandboxScene");
  s.pos.x = 563; s.pos.y = 599; // veranda マップの釣りポイント
});
await new Promise((r) => setTimeout(r, 200)); // 次のupdate()で拾われるのを待つ
```

## 釣り（SandboxFishingScene）のメーターを狙って離す

`scene.meter["value"]`（0〜1）を `waitForFunction` で監視し、perfectゾーン `[0.33, 0.67)`
の中央付近（0.48あたり）まで溜まったら `keyboard.up("Space")` で離す。
必要成功回数（`scene.cfg.requiredSuccesses`）ぶん繰り返す必要がある点に注意
（EASY=1回、NORMAL=2回、HARD=4回、LEGEND=8回）。

**フッキング成功→メーター開始の間には「長押し待ち」がある**（既定300ms、
`HOLD_TO_START_METER_MS`）。フッキング成功時に `keyboard.down("Space")` して押しっぱなしに
していれば自動でこの閾値を超えて `hit` フェーズ（メーター開始）へ進むが、
成功直後すぐ（120ms程度）に `phase === "hit"` を期待するチェックは失敗する。
**最低400ms程度は待ってから** `phase` を確認すること。

## 状態注入でのショートカット

全種類を本物の入力で釣るのは時間がかかるため、`scene.caught.add(id)` を直接呼んで
残りを埋め、`scene["onStageClear"]()` を直接呼ぶことで「全種類釣り終えた後」の
UI・遷移だけを素早く検証できる（実プレイのコア部分は最初の1〜2匹を本物の入力で確認すれば十分）。

特定の1種だけを確実に釣らせたいとき（例：目玉焼きの選択肢演出を検証したい）は、
そのステージの残り全種を先に `caught` へ入れておくと、`StageCatalog.rollFromRemaining`
が必然的にその1種を選ぶ（乱数に頼らず決定的にできる）。

## 既知の落とし穴：「メッセージを閉じる」タップの直後に新しいメーターが始まる場面

`SandboxFishingScene` の釣果演出は、文章（正体・返事・警告・結果）がすべて
「スペースで続ける」までは自動で消えない（`waitForConfirm`/`showMessageAndWait`）。
このうち、**警告文を閉じた直後に際どい選択肢のミニゲーム（メーター）が始まる**箇所で、
`down() → 50ms待つ → up()` のような**長めのタップ**で閉じると、閉じるための押下が
まだ「離される前」にメーターの `start()` が同じキー押下を拾ってしまい、
ごく小さい値のまま Miss 扱いになってしまうことがある（成功を検証したいのに毎回失敗する）。

**対策**: このような「閉じた直後に新しいメーターが始まる」遷移だけは、閉じるタップを
ごく短く（例: `holdMs=5`）し、閉じた後に `scene.meter["started"] === false` を
一度確認してから、本番の保持（`down()` → 狙った値まで待つ → `up()`）を始める。

```js
await tapKey(page, "Space", 5); // 短いタップで警告文を閉じる
await page.waitForFunction(() => {
  const s = window.__SANDBOX__.scene.getScene("SandboxFishingScene");
  return s.meter && s.meter["started"] === false;
}, null, { timeout: 1000 }).catch(() => {});
// ここから本番の保持を始める
```

なお、選択肢ループでミニゲームに成功すると「なんとか抱きかかえた。」の後、
**ループの先頭に戻って正体（名前＋フレーバー）がもう一度表示される**（choicesの前に毎回reveal
を出す実装のため）。テストではここでも1回スペースを押す必要がある。
