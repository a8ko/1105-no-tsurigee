# 釣りバランス調整ログ

ゲーム性（釣りのテンポ・難易度・操作フィール等）に関わる調整の履歴。
**変更するたびに、フィードバック内容と「変更前 → 変更後」の値を追記すること**
（運用ルールは [`CLAUDE.md`](../CLAUDE.md) / [`AGENT.md`](../AGENT.md) を参照）。

数値の主な定義場所:

- 釣りのテンポ（間・ピクン・早合わせ）: `src/scenes/FishingScene.ts`
- メーター（速度・判定ゾーン）: `src/systems/meter/GaugeMeterGame.ts`
- 難易度（hookWindowMs / requiredSuccesses / allowGood）: `src/data/difficulty.ts`（SPEC 準拠・原則変更しない）

---

## take1 — 初期実装（2026-05-30）

最初に組んだ状態。基準点として記録。

| 項目 | 値 |
| --- | --- |
| 仕掛け投入〜最初のアタリの「間」 | なし（最初のイベントまで 700–1700ms のみ） |
| ピクン回数 | 0–3 回（ランダム） |
| ピクン間隔／沈み込みまでの間 | 一律 700–1700ms |
| 待機・ピクン中に Space | 無反応（Q のみ有効） |
| フッキング → メーター開始 | 一度 Space を離して押し直しが必要（新規押下エッジで開始） |
| メーター速度 `FILL_MS` | 1000ms（0→満タン） |
| メーター判定ゾーン | miss `[0,.18)` / good `[.18,.4)` / perfect `[.4,.6)` / good `[.6,.82)` / miss `[.82,1]` |
| hookWindowMs（難易度別） | EASY 600 / NORMAL 500 / HARD 350 / LEGEND 250（SPEC） |

**所感（フィードバック）**: 釣りのペースが全体的に速すぎる。アタリが急に来る、
ピクンで思わず押すと不利が無い、メーターが速くシビア。

---

## take2 — テンポとフィールの調整（2026-05-30）

### フィードバック
- 仕掛けを投げてから最初のピクンまで、数秒のランダムな「間」が欲しい。
- ピクン（待機）中に Space を押してしまったら失敗にしたい。
- 沈み込みで Space を押したら、その押し込み判定のまま次（メーター）へ continue してほしい。
- メーターの good / perfect ゾーンをもっと広げ、動きをゆっくりに。
- 総括して釣りのペースが速すぎるので遅くする。

### 変更内容（take1 → take2）

| 項目 | take1 | take2 |
| --- | --- | --- |
| 仕掛け投入〜最初のアタリの「間」 | なし | **2500–5000ms のランダム**を追加 |
| ピクン間隔 | 700–1700ms | **1000–2200ms**（ゆったり） |
| 最後のピクン → 沈み込み | （上記に含む） | **700–1500ms** の溜めを追加 |
| 待機・ピクン中に Space | 無反応 | **早合わせ失敗**（「あわてた！ にげられた…」→ 仕切り直し） |
| フッキング → メーター開始 | 押し直しが必要 | **押し込みを継続**（Space を押しっぱなしなら即ゲージ開始 = `heldConfirm` で開始） |
| メーター速度 `FILL_MS` | 1000ms | **2000ms**（半分の速さ） |
| メーター判定ゾーン | perfect `[.4,.6)` / good 合計 .44 / miss 合計 .36 | **perfect `[.33,.67)`** / good `[.13,.33)`+`[.67,.87)` / miss `[0,.13)`+`[.87,1]`（perfect・good を拡大、miss を縮小） |
| hookWindowMs | （SPEC） | 変更なし（SPEC 準拠を維持） |

### 該当コミット箇所
- `src/scenes/FishingScene.ts`: `startCast` / `runPikun`（間とピクン間隔）、`onEarlyStrike`（早合わせ失敗）、`update` の watch で Space を拾う
- `src/systems/meter/GaugeMeterGame.ts`: `FILL_MS`、`BANDS`、開始判定を `heldConfirm` に変更

### 検証
- `tsc` 通過 / 実機スモーク（Chrome）15/15・コンソールエラー0。

---

## take3 — 歩行サンドボックスの移動方式（2026-05-31）

対象は釣りではなく、新規の**歩行キャラ・サンドボックス**（`sandbox.html` / 1280×720）。
定義場所: `src/data/walkSandbox.ts`（数値）、`src/scenes/WalkSandboxScene.ts`（挙動）。

### フィードバック
- 歩行グラフィックがある程度まとまって動いてほしい。自由移動で「ちょこっとだけ」動けるのが不自然。
- RPGツクールMZのように1歩ずつ決まった距離だけ動いて止まる感触にしたい（48pxちょうどでなくてよい）。
- 斜め移動はあり（斜めの絵が無い間は左右の絵で代用）。
- 表示は原寸にしたい。

### 変更内容

| 項目 | 変更前 | 変更後 |
| --- | --- | --- |
| 移動方式 | 自由移動（毎フレーム連続移動） | **マス目ステップ移動**（1歩＝決まった距離進んでグリッドで停止、押しっぱなしで連続歩行） |
| 速度設定 | `speed: 240`（px/秒） | 廃止。**`stepTile: 64`（1歩の距離）＋ `stepMs: 180`（1歩の時間）** に置換 |
| 斜め移動 | 可（速度正規化） | 可。斜めは `stepMs × √2` で時間を延ばし速さ一定。向きは左右を優先（斜めは左右の絵で代用） |
| 壁衝突 | 移動量を軸ごとに制限 | 進行先マスが壁なら進まず、その場で向きだけ変える |
| 表示倍率 `displayScale` | 0.6 → 0.85 を経て | **1.0（原寸384px）** |

### 該当コード箇所
- `src/data/walkSandbox.ts`: `character.stepTile` / `character.stepMs` / `character.displayScale`
- `src/scenes/WalkSandboxScene.ts`: `updateStepping` / `tryStartStep`（ステップ移動の状態機械）
- 併せて、Phaser の keydown 二重発火対策として編集キーを `runOnce`（120msガード）経由に変更

### 検証
- `npm run typecheck`: パス
- `node scripts/smoke-sandbox.mjs`: 7/7 PASS・console errors 0
- 数値確認: 右タップ→Δx=64（1歩でグリッド停止）／右下タップ→斜め移動（Δx≈Δy）を確認

---

## take4 — 歩き出しの即時アニメ切替（2026-05-31）

対象: 歩行サンドボックス（`src/data/walkSandbox.ts`）。

### フィードバック
- 移動ボタンを押したら、すぐにアニメを切り替えないと不自然。
- 歩くアニメの全体スピード（fps）はこのままでよい。

### 原因
歩行コマ順が `[1,0,1,2]`（先頭＝真ん中の立ちポーズ）で、止まっている時の絵（idleColumn=1）と同じ。
そのためアニメは即始まっていても、見た目が変わるのはアニメが次コマへ進む約167ms後（fps6）に見えていた。

### 変更内容（take3 → take4）

| 項目 | 変更前 | 変更後 |
| --- | --- | --- |
| 歩行コマ順 `directions[*].frames` | `[1,0,1,2]` | **`[0,1,2,1]`**（踏み出しコマ0から開始） |
| `fps` | 6 | 変更なし（6のまま） |
| `idleColumn` | 1 | 変更なし（1のまま） |

### 効果
立ち絵(コマ1)と異なる踏み出しコマ(0)から再生が始まるため、押下から約32ms（2フレーム）で
足が動く絵に切り替わる＝体感ほぼ即時。

### 検証
- `npm run typecheck`: パス
- `node scripts/smoke-sandbox.mjs`: 7/7 PASS・console errors 0
- 数値確認: 押下後 idle(コマ1) → 約32ms でコマ0(踏み出し) へ切替を確認

---

## take5 — 歩幅をRPGツクールMZと同じ48ドットに（2026-05-31）

対象: 歩行サンドボックス（`src/data/walkSandbox.ts`）。

### フィードバック
- 歩幅を RPGツクールMZ と同じにしてほしい。1コマ＝48ドット。

### 変更内容（take3 → take5）

| 項目 | 変更前 | 変更後 |
| --- | --- | --- |
| `stepTile`（1歩の距離） | 64 | **48**（MZの1タイル=48ドット） |
| `stepMs`（1歩の時間） | 180 | 変更なし |

### 検証
- `npm run typecheck`: パス
- `node scripts/smoke-sandbox.mjs`: 7/7 PASS・console errors 0
- 数値確認: 右1タップでΔx=48（1歩=48ドット）を確認

---

## take6 — 歩く速さを完全に一定に（2026-05-31）

対象: 歩行サンドボックス（`src/scenes/WalkSandboxScene.ts`）。

### フィードバック
- 「歩き始めはゆっくりで、途中から速く歩く」ように感じる。速さを一定にしたい。

### 原因
ステップ移動の時間処理に2つのロスがあり、歩のリズムが不均一だった。
1. 歩き出しの最初の1フレームは1歩の準備のみで位置を動かさず、出だしに一瞬の“ため”が出ていた。
2. 1歩が終わった瞬間、使い切れず余った時間（端数）を捨てており、毎歩わずかにカクついていた。
この積み重ねで「出だしゆっくり→慣れると速い」と体感していた。

### 変更内容（take5 → take6）

| 項目 | 変更前 | 変更後 |
| --- | --- | --- |
| 経過時間の扱い | 1歩完了時に余り時間を破棄（`stepElapsed=0`リセット） | **余り時間を次の歩へ繰り越し**、同一フレーム内で続行 |
| 歩き出し初動 | 開始フレームは移動なし（準備のみ） | **開始フレームから即補間移動** |
| `tryStartStep` | `void`（idle/壁で早期return） | **`boolean`**（歩き出せたか返す。繰り越しループの継続判定に使用） |
| delta上限 | なし | タブ復帰直後の暴走防止に **250msで上限**クランプ |
| `stepMs` / `stepTile` | 180 / 48 | 変更なし（速さ自体は据え置き） |

### 効果
位置が累積経過時間の連続関数になり、どの瞬間も速さ `stepTile/stepMs` で一定。
出だしの“ため”と毎歩の端数ロスが消え、歩き出しから等速で進む。

### 該当コード箇所
- `src/scenes/WalkSandboxScene.ts`: `updateStepping`（繰り越しループ化）／`tryStartStep`（boolean返却に変更）

### 検証
- `npm run typecheck`: パス
- `node scripts/smoke-sandbox.mjs`: 7/7 PASS・console errors 0

---

## take7 — マス刻みをやめて完全な等速移動に（2026-05-31）

対象: 歩行サンドボックス（`src/scenes/WalkSandboxScene.ts`）。

### フィードバック
- take6（時間ロスの解消）でもまだ「途中で速度が変わる」と感じる。ずっと一定の速度にしたい。

### 原因
RPGツクール風の「1マスずつ進んで目標マスへ吸い付く」ステップ方式そのものが原因。
速さの計算が一定でも、マスの切れ目で区切られる感覚が残り、「速度が変わる」と体感していた。

### 変更内容（take6 → take7）

| 項目 | 変更前 | 変更後 |
| --- | --- | --- |
| 移動方式 | マス目ステップ（1歩=48pxへ補間して着地） | **等速移動**（押している間、毎フレーム `速さ×delta` だけ滑らかに前進） |
| 速さ | 1歩48px/180ms | 同等（`stepTile/stepMs` を px/ms として連続適用。実速度は不変） |
| 斜め移動 | 距離に応じ時間延長で等速化 | 入力ベクトルを正規化して等速化（`Math.hypot`） |
| 壁の扱い | ぶつかる歩を丸ごと中止 | **壁ずり**（軸ごと判定し、ぶつかる方向だけ止めて壁沿いに進める） |
| 暴走防止 | 250msクランプ | 1フレーム最大1タイル（48px）に距離をクランプ |
| グリッド吸着 | あり（マスに整列） | なし（自由位置で滑らかに移動） |

### 該当コード箇所
- `src/scenes/WalkSandboxScene.ts`: `updateStepping`/`tryStartStep` を削除し `updateMovement` に置換。ステップ状態変数（`stepping`/`stepFrom`/`stepTo`/`stepElapsed`/`stepTotal`）も撤去。

### 補足
- `stepTile` / `stepMs` は引き続き速さの調整つまみとして機能（1歩相当の距離・時間＝実質の歩行速度）。
- マスへの整列は無くなったため、必要になれば別途グリッド吸着を再導入する。

### 検証
- `npm run typecheck`: パス
- `node scripts/smoke-sandbox.mjs`: 7/7 PASS・console errors 0

---

## take8 — 速さを実時間ベースに固定（フレームレート変動対策）（2026-05-31）

対象: 歩行サンドボックス（`src/scenes/WalkSandboxScene.ts`）。

### フィードバック
- take7（等速移動化）後も「歩いているうちに早くなる」。一定にしたい。

### 原因（実機計測で特定）
右キー押しっぱなしで0.1秒ごとにx座標を計測したところ、ヘッドレスでは速さは一定だが
理論値の**ちょうど半分**だった。これは Phaser が `update` に渡す `delta`（経過時間）が
実際の画面更新間隔とズレていることを示す。フレームレートが歩き始め直後に上がっていく
（読み込み直後のカクつき→安定、ProMotion 60→120Hz 等）と、delta がそれに追従しきれず
実時間あたりの移動量が増える＝「だんだん速くなる」体感になっていた。

### 変更内容（take7 → take8）

| 項目 | 変更前 | 変更後 |
| --- | --- | --- |
| 移動量の時間基準 | Phaser の `delta`（スムージングで実時間とズレうる） | **`performance.now()` の実経過時間**（壁時計） |
| `update()` | `updateMovement(delta)` | 実時刻差 `realDelta` を算出して `updateMovement(realDelta)` |
| 追加状態 | なし | `lastFrameMs`（前フレームの実時刻を保持） |
| 速さ・操作・壁ずり | take7 のまま | 変更なし |

### 計測結果（修正後）
- 100msあたりの移動: 26.6〜26.8px でほぼ一定（理論値 `stepTile/stepMs`=48/180≒267px/秒 と一致）。
- 修正前に出ていた「半分の速さ」も解消。

### 該当コード箇所
- `src/scenes/WalkSandboxScene.ts`: `update`（`performance.now()` で実経過を算出）／`lastFrameMs`（新規フィールド）

### 検証
- `npm run typecheck`: パス
- `node scripts/smoke-sandbox.mjs`: 7/7 PASS・console errors 0
- 速度計測スクリプト（一時）で各区間の移動量が一定であることを確認

---

## take9 — 歩行速度を少しゆっくりに（2026-05-31）

対象: 歩行サンドボックス（`src/data/walkSandbox.ts`）。

### フィードバック
- もう少しゆっくりの速度で歩かせたい。

### 変更内容（take8 → take9）

| 項目 | 変更前 | 変更後 |
| --- | --- | --- |
| `stepMs`（1歩=48pxにかける時間） | 180（約267px/秒） | **240（約200px/秒・約25%ゆっくり）** |
| `stepTile` | 48 | 変更なし |

### 該当コード箇所
- `src/data/walkSandbox.ts`: `character.stepMs`

### 検証
- `npm run typecheck`: パス
- `node scripts/smoke-sandbox.mjs`: 7/7 PASS・console errors 0

---

## take10 — 歩行速度をさらにゆっくりに（2026-05-31）

対象: 歩行サンドボックス（`src/data/walkSandbox.ts`）。

### フィードバック
- もっとゆっくりにして欲しい。

### 変更内容（take9 → take10）

| 項目 | 変更前 | 変更後 |
| --- | --- | --- |
| `stepMs` | 240（約200px/秒） | **320（約150px/秒）** |

### 該当コード箇所
- `src/data/walkSandbox.ts`: `character.stepMs`

### 検証
- `npm run typecheck`: パス
- `node scripts/smoke-sandbox.mjs`: 7/7 PASS・console errors 0

---

## take11 — マス目ステップ移動（1歩=48ドット）に復帰（2026-05-31）

対象: 歩行サンドボックス（`src/scenes/WalkSandboxScene.ts`）。

### フィードバック
- 「1歩＝1コマ48ドット」にしたい。RPGツクール風にマスへ揃えて止まる動きへ戻す。
  （take7 で連続移動に切り替えていたが、グリッド整列を再要望）

### 変更内容（take10 → take11）

| 項目 | 変更前（連続移動） | 変更後（マス目ステップ） |
| --- | --- | --- |
| 移動方式 | 押している間なめらかに連続移動（マス刻みなし） | **1歩=48ドットでマスに揃って停止**（押し続けで連続歩行） |
| タイミング基準 | `performance.now()` の実経過 | **同左（維持）** ＝ take8 の等速修正はそのまま |
| 余り時間の扱い | （連続のため無し） | 次の歩へ繰り越し（毎歩の端数ロスなし・歩き出し即動き出し） |
| 斜め移動 | ベクトル正規化で等速 | 距離に応じ `stepMs×√2` で等速 |
| 壁の扱い | 壁ずり（軸ごと） | ぶつかる歩は中止し向きだけ変更 |
| `stepTile` / `stepMs` | 48 / 320 | 変更なし（48 / 320＝約150px/秒のゆっくり速度を維持） |

### 該当コード箇所
- `src/scenes/WalkSandboxScene.ts`: `updateMovement` を撤去し `updateStepping`／`tryStartStep` を復活。ステップ状態変数（`stepping`/`stepFrom`/`stepTo`/`stepElapsed`/`stepTotal`）も復活。`update` は実時刻ベース（`lastFrameMs`）のまま `updateStepping(realDelta)` を呼ぶ。

### 検証
- `npm run typecheck`: パス
- `node scripts/smoke-sandbox.mjs`: 7/7 PASS・console errors 0
- 計測: 1回タップでΔx=48.00（1歩=48ドット）／押しっぱなしΔx=192.00（48×4＝マスに整列）を確認

---

## take12 — 斜め移動を廃止し上下左右のみに（2026-05-31）

対象: 歩行サンドボックス（`src/scenes/WalkSandboxScene.ts`）。

### フィードバック
- 歩行キャラは斜め移動なしにして、上下左右の移動のみにしたい。

### 変更内容（take11 → take12）

| 項目 | 変更前 | 変更後 |
| --- | --- | --- |
| 斜め移動 | 左右＋上下の同時入力で斜めに1歩進む | **斜めは進まない（左右を優先し、上下入力は無視）** |
| 同時押し時の挙動 | dx・dy 両方を加味して斜め移動 | `dx !== 0` のとき `dy = 0` に落として左右のみ |
| 速度補正 | 斜めは `stepMs × √2` で等速化 | **不要になり撤去**（常に `stepMs` の1段） |
| 向きの絵 | 斜めは左右の絵で代用 | 変更なし（上下左右の4向きのみ） |

### 該当コード箇所
- `src/scenes/WalkSandboxScene.ts`: `tryStartStep()` に「左右優先で上下を無視」する1行を追加。`stepTotal` の √2 補正を削除し `SANDBOX.character.stepMs` のみに。

### 検証
- `npm run typecheck`: パス
- `node scripts/smoke-sandbox.mjs`: 7/7 PASS・console errors 0
