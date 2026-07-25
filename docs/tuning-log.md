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

---

## take13 — キャラの当たり判定をRPGツクールMZ仕様（足元1マス）に（2026-06-02）

対象: 歩行サンドボックス（`src/scenes/WalkSandboxScene.ts` / `src/data/walkSandbox.ts`）。

### フィードバック
- 歩行グラフィックのキャラの当たり判定も、RPGツクールMZと同じ仕様（足元の1マス＝1タイル単位の通行判定）にしたい。
- あわせて壁・イベント・歩行・スタート位置を、画面基準の48ドットのマス目にそろえる方針。

### 変更内容（take12 → take13）

| 項目 | 変更前 | 変更後 |
| --- | --- | --- |
| 当たり判定の形 | 足元に 70×36 の四角（中央下基準） | **足元の1マス 48×48**（マス中心基準・各辺2pxだけ内側） |
| 判定サイズ指定 | `hitboxWidth: 70` / `hitboxHeight: 36` | **撤去**（1マス＝`stepTile` から算出） |
| 判定の基準 | 自由なピクセル | 画面基準の48マス目に整列（隣マスと辺が接しても通行可） |
| スタート位置 | 任意座標 | マス中心へ正規化（`snapToTileCenter`） |

### 該当コード箇所
- `src/scenes/WalkSandboxScene.ts`: `playerBox()` を「中心(cx,cy)を覆う 1マス四方（inset 2px）」に変更。
- `src/data/walkSandbox.ts`: `CharacterConfig` と `SANDBOX.character` から `hitboxWidth` / `hitboxHeight` を削除。
- 関連（同セッション）: マス目スナップ用ヘルパー `snapToTileCenter` / `tileEdge` / `tileRect` を追加し、壁・イベント・移動・スタート位置を画面基準48マス目に統一。

### 検証
- `npm run typecheck`: パス
- `node scripts/smoke-sandbox.mjs`: 7/7 PASS・console errors 0
- 計測: 1歩でΔx=48（マス整列）、開始位置 x=648（マス中心へ正規化）を確認

---

## take14 — キャラの立ち位置をMZ風に（足元をマスの底へ）（2026-06-02）

対象: 歩行サンドボックス（`src/scenes/WalkSandboxScene.ts`）。

### フィードバック
- 「今いる地点をスタート位置にする」でキャラがマス目の半分くらいの位置から立っているように見えて気になる。
- RPGツクールMZと同じく、キャラがマスの上にちょこんと立つ見た目にしたい。

### 原因
- take13 で当たり判定・スタート位置を「足元＝マスの中心」に揃えたため、キャラの足が
  マスのど真ん中に来ていた（当たり判定自体は正しい）。MZは足元をマスの底に置くので半マスぶんずれて見えていた。

### 変更内容（take13 → take14）

| 項目 | 変更前 | 変更後 |
| --- | --- | --- |
| キャラ絵の立ち位置 | 足元＝マスの中心（座標そのまま描画） | **足元の絵だけ半マス（24px）下げ、マスの底に立たせる** |
| 論理足元位置 | スプライト座標と一体（`player.x/y`） | **`pos`（論理位置）と表示を分離**。判定はすべて `pos` 基準 |
| 当たり判定・イベント判定・マス揃え | マス中心基準 | **変更なし**（`pos` を基準に従来どおり） |

### 該当コード箇所
- `src/scenes/WalkSandboxScene.ts`:
  - 論理足元 `pos` を導入。`footOffsetY()`（= `stepTile/2` = 24px）と `syncSprite()`（`pos.y + offset` に描画）を追加。
  - `spawnPlayer` / `updateStepping` / `tryStartStep` / `setStartHere` / `checkStepEvents` / `checkExamineEvents` の座標参照を `player.x/y` → `pos.x/y` に統一。

### 検証
- `npm run typecheck`: パス
- `node scripts/smoke-sandbox.mjs`: 7/7 PASS・console errors 0（本体 `smoke.mjs` も 15/15 PASS）

---

## take15 — 新方向の釣り試作：ステージ制＋重複なし抽選（2026-07-14）

対象は歩行サンドボックス方向の釣り（新規 `SandboxFishingScene`）。旧320×180の釣り
（`FishingScene.ts` / `Catalog.ts` / `catchables.ts`）はいっさい変更していない。

### フィードバック
- 「1ステージ全5種、1種1回釣れたらもう出ない」仕様がゲーム性として成立するか相談。
- 会話の中で「ロケットで星に着陸→探索完了→名付け→次の星へ。同じ星には二度と戻らない」という
  仕様が判明。この前提だと、ふつうの運まかせ抽選（重複ありの重み付け）のままでは
  「レアが出ないまま詰む」リスクがあるため、**重複なし抽選が仕様として必須**という整理をした。
- ステージ1は「ファミレスのポール看板の上」（主人公が勝手にそう呼んでいるだけで、文字通りの惑星ではない）。
  食べ物テーマの5種：目玉焼き／イカ大根／飲食店営業許可証／ハム／かなしい手紙（アップルパイの手紙）。
- 「とりあえずこのステージ1を試作してみたい」との依頼を受け、試作として実装。

### 変更内容

| 項目 | 変更前（既存 `Catalog.ts`） | 変更後（新規、ステージ1のみ） |
| --- | --- | --- |
| 抽選方式 | 重み付け・**重複あり**（`Catalog.roll()`、毎回全14種から抽選） | 重み付け・**重複なし**（`StageCatalog.rollFromRemaining()`、既に釣った種を候補から除外。全種釣ると null＝探索完了） |
| 重みの式 | `(最大レア度+1-rarity)^2` | 同じ式を流用（候補を「残っている種」だけに絞って適用） |
| 収集物データ | `catchables.ts`（魚14種、rarity 1–5） | `stageCatchables.ts`（ステージ1、食べ物5種、rarity 1–3） |
| このステージのレア度・難易度割り当て | （該当なし・新規） | 目玉焼き／イカ大根／飲食店営業許可証＝rarity1・EASY、ハム＝rarity2・NORMAL、かなしい手紙＝rarity3・HARD |
| メーター・状態遷移のロジック | `GaugeMeterGame` / `FishingScene`（320×180基準） | `SandboxGaugeMeterGame` / `SandboxFishingScene`（1280×720基準）に作り直し。**ロジックは同一**、座標・サイズのみ新解像度用 |
| ステージ完了時の演出 | （該当なし） | 「探索を終えた！」の仮メッセージ（「星に名前をつける」演出は次の段階） |

### 難易度割り当ての理由（判断メモ）
- ステージ1は初めて釣りに触れる場面なので、いきなりLEGEND級（8回成功・250ms猶予）にはせず、
  「締めの1匹」は一段階手前のHARD（4回成功・350ms猶予・Good不可）にとどめた。
- 重複なし抽選＋この重み付けにより、序盤はEASYの3種が出やすく、終盤ほど残りが減って
  かなしい手紙（レア枠）に偏っていく——「後半、締めの1匹だけ本気になる」という狙い通りの構成。

### 該当コード箇所
- `src/data/stageCatchables.ts`（新規）: ステージ1のデータ・レア度・難易度
- `src/systems/StageCatalog.ts`（新規）: `rollFromRemaining`（重複なし抽選）
- `src/systems/meter/SandboxGaugeMeterGame.ts`（新規）: 新解像度向けメーター
- `src/scenes/SandboxFishingScene.ts`（新規）: 状態遷移・ステージ進行
- `src/data/walkSandbox.ts` / `src/scenes/WalkSandboxScene.ts` / `src/sandboxMain.ts`: 釣りポイントの
  「うん。」選択から起動する導線（`EventChoice.action: "startFishing"`）を追加

### 検証
- `npm run typecheck`: パス
- 実機検証（Playwright, `scripts/verify-stage1-fishing.mjs`）: 11/11 PASS・console errors 0
  - 釣りポイントに乗る→「つりする？」→「うん。」→ 新シーンに切り替わる
  - 待機中の早合わせが失敗になる（プローブ）
  - 本物の入力で2匹釣る（EASY・NORMALの両方を実際に成功させて確認、進捗表示が増える）
  - 釣った種が重複しない（`caught` セットで確認）
  - 5種類釣り終えると探索完了メッセージが出て、スペースでベランダに戻れる
- 検証中に見つかった注意点（アプリ側の不具合ではなく検証環境の癖）を
  `.claude/skills/verify/SKILL.md` に記録（Playwright の `keyboard.press("Space")` が
  この環境ではPhaser側に拾われないことがある、など）。

---

## take16 — 釣果演出（HIT→シルエット→正体→選択肢）を追加（2026-07-14）

対象は `SandboxFishingScene`。take15 の続き、同日中の追加。

### フィードバック
- 「釣れる時はタイミングゲーム、釣れたらHIT表記、その後シルエットか水の波紋、
  バトルの選択肢のような表記、目玉焼きならではの選択肢」という具体案が出た。
- 選択肢は結果を変えず雰囲気だけにする方針（Claude提案・了承）。
- 目玉焼きの選択肢の中身はいったんClaudeが試作用に考えたものを使うことになった
  （担当者が今後、言い回し・数を自由に差し替える前提）。
- 「手触りを確認したい」ため、まず目玉焼き1種類分だけ実装。

### 変更内容

| 項目 | 変更前 | 変更後 |
| --- | --- | --- |
| 釣れた直後の演出 | 一言フラッシュ表示のみ（`○○を つかまえた！`） | **選択肢を持つ種のみ**：HIT表記（拡大アニメ）→シルエットが浮かび上がる→名前とフレーバー表示→バトルコマンド風の選択肢（↑↓で選ぶ・結果は変わらない一言が返る） |
| 対象 | 全種共通 | **目玉焼きのみ**（`POST_CATCH_CHOICES` に選択肢が無い種は従来どおりの一言フラッシュのまま） |
| 演出中の仮素材の扱い | （該当なし） | 竿・浮き・プレイヤーの仮素材を演出中は非表示にし、次のキャストで出し直す |

### 該当コード箇所
- `src/data/stageCatchables.ts`: `PostCatchChoice` 型・`POST_CATCH_CHOICES`（目玉焼き4択の中身）
- `src/scenes/SandboxFishingScene.ts`: `runCatchSequence` / `showPostCatchChoices`（新規）、
  `onCaught`（選択肢の有無で分岐）、`startCast`（演出用に隠した仮素材を出し直す）

### 検証
- `npm run typecheck`: パス
- 実機検証（Playwright, `scripts/verify-catch-sequence.mjs`）: 10/10 PASS・console errors 0
  - 目玉焼きを釣った直後にHIT表記→シルエット→名前とフレーバー→選択肢の順で表示されることを確認
  - ↑↓で選択が動くこと、選ぶとその選択肢の一言が表示されることを確認
  - 演出後、正しく次の遷移（今回はステージクリア）へ進むことを確認
  - スクリーンショットで、演出中に仮素材が重なって見づらくなっていた点を発見し修正済み

---

## take17 — 際どい選択肢→ミニゲーム→成功で選択肢に戻る／失敗で逃げられる（2026-07-14）

対象は `SandboxFishingScene`。take16 の続き、同日中の追加。

### フィードバック
- 「選択肢を間違えると、何かゲームが始まるという表記の後に釣りっぽいミニゲームを挟んで、
  成功したらもう一度選択肢に戻れる。失敗したら『逃げられた』を出したい」との要望。

### 変更内容

| 項目 | 変更前（take16） | 変更後 |
| --- | --- | --- |
| 選択肢の性質 | 全選択肢とも結果は変わらない（雰囲気だけ） | 選択肢に **`risky`** フラグを追加。risky な選択肢を選ぶと reply の後に警告文
  →ミニゲーム（既存のメーターを1回だけ流用）が挟まる |
| ミニゲーム成功時 | （該当なし） | 「なんとか抱きかかえた。」と表示し、**また選択肢メニューに戻る**（ループ） |
| ミニゲーム失敗時 | （該当なし） | 「にげられた…」と表示。**この釣果は無かったことになる**（`caught` に追加されず）。次のキャストへ |
| 釣果の確定タイミング | 選択肢を出す前（`onCaught` の時点）で `caught` に追加 | risky な選択肢が絡む種は、**選択肢ループを安全に抜けるまで `caught` に追加しない**（`finalizeCatch` に分離） |
| 目玉焼きの4択のうち | 全て安全 | 「白身をひとくちつまむ」だけ risky（元々「こら」と声がする一言だったので、
  そのまま取り返されそうになる、という流れに繋げた） |

### 該当コード箇所
- `src/data/stageCatchables.ts`: `PostCatchChoice` に `risky` / `riskyWarning` を追加。
  「白身をひとくちつまむ」に設定
- `src/scenes/SandboxFishingScene.ts`: `runCatchSequence`（選択肢ループ化・risky分岐）、
  `finalizeCatch`（新規・釣果確定を選択肢ループの外に分離）

### 検証
- `npm run typecheck`: パス
- 実機検証（Playwright, `scripts/verify-risky-choice.mjs`）: 8項目中7 PASS（残り1件は
  検証スクリプト側が警告テキスト消滅後にチェックしていただけの誤検知で、手動確認で表示自体は
  正常と確認済み）
  - 際どい選択肢→警告→ミニゲーム成功→選択肢メニューに戻る→安全な選択肢で確定、を確認
  - 選択中はまだ `caught` に加算されないことを確認
  - 際どい選択肢→警告→ミニゲーム失敗→「にげられた…」→`caught` に加算されず次のキャストへ、を確認

---

## take18 — 釣果演出の文章をスペース待ちに（自動で消えないように）（2026-07-14）

対象は `SandboxFishingScene`。take16/17 の続き、同日中の追加。

### フィードバック
- 「文章の表記の時間が短いので、スペースを押さないと文が消えないようにして欲しい」との要望。

### 変更内容

| 項目 | 変更前 | 変更後 |
| --- | --- | --- |
| 正体（名前＋フレーバー）表示 | 1400ms で自動的に次へ | **スペースを押すまで消えない**（「スペースで続ける」の案内つき） |
| 選択肢を選んだ後の一言（reply） | 1300ms で自動的に次へ | 同上 |
| 際どい選択肢の警告文 | 1000ms で自動的に次へ | 同上 |
| ミニゲームの結果表示（成功／逃げられた） | 900〜1000ms で自動的に次へ | 同上 |
| 選択肢を持たない種の「○○を つかまえた！」 | 1200ms で自動的に次へ | 同上（統一のため、こちらもスペース待ちに変更） |
| 対象外（意図的に変更していない） | — | ピクン・早合わせ失敗・フッキング失敗・メーターMiss失敗の一言は、
  旧プロトから引き継いだ釣りのコアループのテンポ（take1/take2で調整済み）のため、
  今回は自動フラッシュのまま変更していない |

### 該当コード箇所
- `src/scenes/SandboxFishingScene.ts`: `waitForConfirm`（新規）・`showMessageAndWait`（新規）、
  `runCatchSequence`（各所を `wait(ms)` → `waitForConfirm`/`showMessageAndWait` に置換）、
  `onCaught` → `runSimpleCatchMessage`（選択肢なしの種も同様にスペース待ち化）

### 検証
- `npm run typecheck`: パス
- 実機検証（Playwright, `scripts/verify-text-wait.mjs`）: 5/5 PASS
  - 正体・返事のテキストが、旧タイムアウト（1400ms/1300ms）を過ぎても消えないことを確認
  - スペースを押すとその場で進むことを確認
- 既存の検証スクリプト（`verify-stage1-fishing.mjs` / `verify-catch-sequence.mjs` /
  `verify-risky-choice.mjs`）も本仕様変更に合わせて更新し、全て再PASSを確認
- 検証中に見つけた小さな注意点（アプリの不具合ではない）：メッセージを閉じる操作の直後に
  別のメーターが始まる場面で、閉じるためのキー保持が長すぎるとメーターの開始判定に
  紛れ込む。`.claude/skills/verify/SKILL.md` に追記済み

---

## take19 — フッキングとメーター開始を分離（1回押す→長押しでメーター開始）（2026-07-14）

対象は `SandboxFishingScene`。

### フィードバック
- 「釣りのタイミングゲームはスペース長押しじゃなくてスペースを押すだけの判定にして、
  その後にスペース長押しにしたらメーターのゲームが始まる仕様にしたい」との要望。
- 背景：従来はフッキング成功時にスペースを押しっぱなしにしていると、そのままメーターの
  計測が始まる「引き継ぎ」仕様だった（意図した設計だが、フッキングの判定自体も
  「押しっぱなし前提」であるかのように感じられていた）。フッキングは元々1回押すだけで
  成立する判定だったが、メーター開始への引き継ぎと連続していたため、2つのアクションが
  一体的に感じられていた。

### 変更内容

| 項目 | 変更前 | 変更後 |
| --- | --- | --- |
| フッキング成功の判定 | 1回押す（エッジ）で成功。変更なし | **変更なし**（引き続き1回押すだけで成功） |
| フッキング成功後の遷移 | 成功した瞬間そのままメーター開始（押しっぱなしなら即計測開始） | **新フェーズ `waitingForHold` を追加**。フッキング成功後は
  いったん待ち状態になり、**既定300ms以上スペースを押し続けて初めてメーターが始まる** |
| 長押し未達のときの扱い | （該当なし） | 押すのをやめると継続時間はリセット。何度でもやり直せる（この待ち時間自体に制限時間は無し） |
| プロンプト表示 | フッキング成功時に「スペース！」を消すだけ | フッキング成功時に「長押し！」表示に切り替え、長押し完了で消す |

### 該当コード箇所
- `src/scenes/SandboxFishingScene.ts`:
  - `Phase` に `"waitingForHold"` を追加
  - `HOLD_TO_START_METER_MS = 300`（新規定数。長押しの必要時間）
  - `onHookSuccess`：即メーター開始 → `waitingForHold` へ遷移するだけに変更
  - `updateWaitingForHold`（新規）：長押しの継続時間を計測し、閾値に達したら `runHit()` を開始
  - `update()` に `case "waitingForHold"` を追加

### 検証
- `npm run typecheck`: パス
- 実機検証（Playwright, `scripts/verify-hold-to-start.mjs`）: 5/5 PASS
  - 一瞬のタップだけでフッキングが成功し（`waitingForHold`へ）、離したままだとメーターが
    始まらないことを確認
  - 300ms未満の保持ではまだ始まらず、300ms超で確実にメーター（`hit`）へ移行することを確認
- 既存の検証スクリプト（`verify-stage1-fishing.mjs` / `verify-catch-sequence.mjs` /
  `verify-risky-choice.mjs` / `verify-text-wait.mjs`）も本仕様変更後の待ち時間に合わせて
  更新し、全34項目再PASSを確認（HARD＝4回成功の種でも正しく動作することを確認）

---

## take20 — レア度5段階＋重複あり抽選＋レア度連動の難易度＋ロケットでの名付けフロー（2026-07-15）

対象は `SandboxFishingScene` 一式とステージ1データ。take15〜19（ステージ1試作）の続き。

### フィードバック
- 釣りの判定は「食いつき判定＋メーターのタイミングゲームのみ」にしたいという相談から開始。
  現状の実装（ピクン→フッキング→長押し→メーター）が既にこの形に近いことを確認しつつ、
  釣れた後の演出（HIT表記・選択肢・逃げるミニゲーム）は今回とくに変更の要望が無かったため現状維持。
- アイテムは「基本重複する」仕様にしたいとの要望。レア度は5段階
  （目玉焼き＝普通、イカ大根＝ちょっとレア、飲食店営業許可証＝レア、
  かなしい手紙＝凄いレア＋一度釣ったらもう釣れない、ハム＝伝説）。
- レア度が高いほど、食いつきのフェイント（ピクン）回数が増え、メーターが速くなってほしい。
- 星めぐりは「1つの星で5種類集め終えたら次の星へ」の大枠を維持しつつ、
  「完了すると自動でロケットに戻る」のではなく「探索を終えたメッセージだけ表示し、
  プレイヤーがロケットを調べたときに『名前をつけて出発しますか？』が出る」形にしたい。
- 出現率の低いアイテム（凄いレア以上）が運悪くなかなか出ない問題には、
  「粘れば出やすくなる程度の緩やかな救済」で対応する方針にした（確定保証ではない）。

### 変更内容

#### レア度・難易度パラメータ（5段階、旧 `Difficulty` 4段階とは別の新しい仕組み）

| アイテム | 変更前（rarity/difficulty） | 変更後（レア度 / hookWindowMs・成功数・pikun範囲・meterFillMs） |
| --- | --- | --- |
| 目玉焼き | rarity1・EASY | 普通(1) / 600ms・1回・pikun0-2・meter2000ms |
| イカ大根 | rarity1・EASY | ちょっとレア(2) / 520ms・2回・pikun1-3・meter1750ms |
| 飲食店営業許可証 | rarity1・EASY | レア(3) / 420ms・3回・pikun2-4・meter1500ms |
| かなしい手紙 | rarity3・HARD | 凄いレア(4)＋一度きり / 320ms・5回・pikun3-5・meter1250ms |
| ハム | rarity2・NORMAL | 伝説(5) / 220ms・8回・pikun4-6・meter1000ms |

ハムが「伝説」、かなしい手紙が「凄いレア」に入れ替わった点が旧試作（take15）からの逆転（意図的な変更）。
数値は叩き台の初期値。実際に触った手ざわりをもとに今後さらに調整する前提。

#### 抽選方式（`StageCatalog.ts`）

| 項目 | 変更前 | 変更後 |
| --- | --- | --- |
| 基本方式 | 重複なし（既出は候補から除外、`rollFromRemaining`） | **重複あり**（既出も候補に残り続ける、`rollForStage`） |
| 例外 | なし | `uniqueCatch: true` の種（かなしい手紙）だけ、一度釣ったら候補から除外 |
| 救済 | なし | まだ見つけていない種の重みに `min(castCount, 20) × 2` を加算。粘る（キャストを重ねる）ほど緩やかに出やすくなる（確定保証ではない、上限あり） |

#### ピクン回数・メーター速度・抽選タイミング（`SandboxFishingScene.ts`）

| 項目 | 変更前 | 変更後 |
| --- | --- | --- |
| ピクン回数 | 全種共通、0〜3回のランダム | レア度ごとの範囲（表参照）からランダム |
| メーター速度（旧`FILL_MS`） | 全種共通、2000ms固定 | レア度ごとに2000ms〜1000msで可変（`SandboxGaugeMeterGame.start(fillMs)`） |
| 抽選のタイミング | `beginBite()`（ピクン演出の後） | **`startCast()`（ピクン演出の前）に前倒し**。フェイント回数をレア度で決めるには、ピクンが始まる前に何が食いつくか確定させる必要があるため |

#### 星めぐりフロー（探索完了→名付け）

| 項目 | 変更前 | 変更後 |
| --- | --- | --- |
| 探索完了時の表示 | 「探索を終えた！（ここで名前をつける演出が入ります）スペースでベランダに戻る」 | 「ものをすべて釣った。探索を終えた！スペースでベランダに戻る」（名付けへの言及を削除） |
| 名付けのきっかけ | 未実装 | ベランダに置いた**ロケット**（調べる）を調べたときのみ発動。探索未完了なら素っ気ない一言、完了済みなら「この星に名前をつけて出発しますか？」の選択肢 |
| 探索完了状態の保持 | シーン内メモリのみ（離れると消える） | `localStorage`（`tsurigee:sandbox:stage:{stageId}:cleared`）に保存し、釣りシーンとベランダのシーンをまたいでも判定できるようにした |

### 該当コード箇所
- `src/data/stageCatchables.ts`: `StageRarity` enum・`STAGE_RARITY_LABELS`・`StageCatchable` 型（新規）、
  `STAGE_1` を新レア度体系に組み替え
- `src/data/stageDifficulty.ts`（新規）: `StageDifficultyConfig`・`STAGE_DIFFICULTY_CONFIGS`
  （レア度ごとの hookWindowMs / requiredSuccesses / allowGood / pikunCountRange / meterFillMs）
- `src/systems/StageCatalog.ts`: `rollFromRemaining` → `rollForStage`
  （重複あり＋uniqueCatch＋緩やかな救済）に書き換え
- `src/systems/meter/SandboxGaugeMeterGame.ts`: `FILL_MS` 固定値 → `start(fillMs)` 引数で可変に
- `src/scenes/SandboxFishingScene.ts`: `startCast()` で先に抽選するよう順序変更、
  `beginBite()` から抽選ロジックを除去、`onStageClear()` のメッセージ調整、
  `markStageCleared` 呼び出しを追加
- `src/systems/StageProgress.ts`（新規）: `markStageCleared` / `isStageCleared`（localStorage永続化）
- `src/data/walkSandbox.ts`: `EventMarker.kind`（`"rocket"`）・`EventChoice.action` に
  `"nameStarAndDepart"` を追加、ロケットのイベントマーカーを仮配置（座標は今後Vキーエディタで調整可）
- `src/scenes/WalkSandboxScene.ts`: `fireEvent()` に `kind === "rocket"` の分岐、
  `fireRocketEvent()`（新規）、`confirmChoice()` に `nameStarAndDepart` の処理を追加

### 検証
- `npm run typecheck`: パス
- `node scripts/smoke.mjs`（旧320×180、本変更の対象外・回帰確認用）: 15/15 PASS・console errors 0
- `node scripts/smoke-sandbox.mjs`（歩行・当たり判定エディタ）: 7/7 PASS・console errors 0
- `node scripts/verify-stage1-fishing.mjs`: 11/11 PASS・console errors 0
  （ハムが伝説になり必要成功数8回で釣れることも実機で確認）
- 実機検証（Playwright, `scripts/verify-rarity-rocket.mjs` 新規）: 18/18 PASS・console errors 0
  - レア度5種すべてで難易度パラメータ（猶予・成功数・メーター速度・pikun範囲）が期待どおり対応
  - レア度が上がるほど単調に厳しくなることを確認
  - 発見済みの種（medamayaki）が重複してまた選ばれることを確認（50回中出現）
  - 一度きりの種（かなしい手紙）は発見後150回抽選しても二度と選ばれないことを確認
  - 緩やかな救済：castCount=0のときham出現率6.7%→castCount=20のとき47.7%と明確に上昇
  - ロケット：探索未完了は素っ気ないメッセージのみ、完了後は名付けの選択肢が出ることを確認
  - 探索完了フラグがlocalStorageに保存され、シーンをまたいでも判定できることを確認
- 既存の検証スクリプト（`verify-catch-sequence.mjs` / `verify-risky-choice.mjs` /
  `verify-text-wait.mjs` / `verify-hold-to-start.mjs`）は、「残り4種をcaught済みにすれば
  対象を絞り込める」という**旧・重複なし抽選前提のテクニック**が通用しなくなったため、
  「target が狙った種になるまで `startCast()` を撃ち直す」方式に更新（実際の新しい抽選
  ロジックのまま、望む結果が出るまでリトライする）。全て再PASSを確認
  （`verify-hold-to-start.mjs` は対象未固定のままだと、レア度によって必要成功数が
  1〜8回に変わったことでテストの前提＝1回のメーター操作で終わる、が崩れてハングしていた
  ため、対象固定が必須だった）

---

## take21 — 目玉焼きの選択肢演出を削除／星の名前を自由形式入力に（2026-07-15）

対象は `SandboxFishingScene`・`WalkSandboxScene`。take20の続き、同日中の追加。

### フィードバック
- 「目玉焼きの選択肢はなしにします。イカ大根などと同様の仕様で大丈夫」との要望。
  take16/17で試作した目玉焼き限定のHIT演出→選択肢→際どい選択肢のミニゲームは、
  他の4種と同じシンプルな「○○を つかまえた！」の一言演出に統一する。
- 「名前をつけるのは自由形式にします」との要望。take20でロケットの名付けを実装した際は
  仮の固定メッセージのみだったが、実際に文字を打って名前をつけられるようにする。

### 変更内容

| 項目 | 変更前 | 変更後 |
| --- | --- | --- |
| 目玉焼きの釣果演出 | `POST_CATCH_CHOICES.medamayaki` に4択（うち1つrisky）あり。HIT→シルエット→正体→選択肢の専用フロー | `POST_CATCH_CHOICES` を空に。他4種と同じ「○○を つかまえた！」のシンプルな一言演出（スペースで続ける）に統一 |
| 選択肢システム自体 | （該当なし） | コード（`PostCatchChoice` 型・`runCatchSequence`・risky分岐等）はそのまま残す。今後また特定の種に選択肢を付けたくなったら `POST_CATCH_CHOICES` にデータを1件足すだけで復活する |
| 星の名前入力 | 固定メッセージ「（星）に名前をつけた。（つぎの星へ出発する演出は、まだこれからです）」のみ | `window.prompt()` でその場で自由に文字を打って入力。空欄・キャンセル時は「名前をつけるのをやめた。」と表示 |

### 該当コード箇所
- `src/data/stageCatchables.ts`: `POST_CATCH_CHOICES` を空オブジェクトに変更
- `src/scenes/WalkSandboxScene.ts`: `confirmChoice()` の `nameStarAndDepart` 分岐で
  `window.prompt()` を呼び、入力値をメッセージに反映するよう変更

### 検証
- `npm run typecheck`: パス
- `node scripts/smoke-sandbox.mjs`: 7/7 PASS・console errors 0
- `node scripts/verify-stage1-fishing.mjs`: 11/11 PASS・console errors 0
- 実機検証（Playwright, `scripts/verify-rarity-rocket.mjs`）: 18/18 PASS・console errors 0
  - `window.prompt()` にダイアログハンドラーで固定の名前を入力させ、
    釣り上げ後のメッセージに入力した名前がそのまま反映されることを確認
- `node scripts/verify-hold-to-start.mjs`: 5/5 PASS・console errors 0
  （対象固定していたmedamayakiが選択肢なしのシンプルな演出に変わったことによる影響なし）
- 目玉焼きの選択肢演出（HIT→シルエット→選択肢／risky）を前提にしていた
  `scripts/verify-catch-sequence.mjs` / `scripts/verify-risky-choice.mjs` /
  `scripts/verify-text-wait.mjs` の3本は、検証対象のデータが無くなったため削除
  （選択肢システム自体のコードは残っているので、将来また使うときは新しい検証を作る）

---

## take22 — ハムの基本パラメータ緩和／失敗するほど少しずつ緩む救済を追加（2026-07-16）

対象は `stageDifficulty.ts`・`SandboxFishingScene`。take20/21の続き。

### フィードバック
- 「ハムが難しすぎる」との報告。原因を分析したところ、伝説（ハム）の食いつきの猶予
  220msは、人間の視覚刺激への平均反応時間（約200〜250ms）とほぼ同じか、それ以下の
  水準だった。これは旧プロトの最上位難易度（LEGEND=250ms）よりもさらに短く、加えて
  8回連続成功・メーター速度1000ms（倍速）という他の要素も重なり、複合的に
  「反射神経の限界に近い、極めてシビアな挑戦」になってしまっていた。
- 対策として、①基本の猶予・メーター速度そのものを現実的な水準に緩和、②それでも
  運や実力が伴わず失敗が続く場合の救済として「5回失敗するごとに、少しずつ難易度が
  下がる」仕組みを追加することにした。
- 救済の下限について「かなしい手紙（凄いレア）よりは難しくありたい」という要望。
  何度失敗しても、ハムは凄いレアより厳しい状態を保つよう設計した。

### 変更内容

#### 伝説（ハム）の基本パラメータ

| 項目 | 変更前（take20） | 変更後（基本値） |
| --- | --- | --- |
| 食いつきの猶予（hookWindowMs） | 220ms | **300ms** |
| メーターの速さ（meterFillMs） | 1000ms | **1200ms** |
| 必要成功回数・Good可否・ピクン範囲 | 8回・不可・4-6回 | 変更なし（回数の粘りごたえは残す） |

#### 失敗するほど緩む救済（`getRelievedConfig`、新規）

| 項目 | 内容 |
| --- | --- |
| 対象 | 同じレア度への挑戦に失敗（早合わせ・フッキング失敗・メーターMiss）した回数をレア度ごとに記録 |
| 緩和の刻み | **5回失敗するごとに1段階**、猶予+4ms・メーター+10ms |
| 緩和する項目 | 食いつきの猶予・メーターの速さのみ。必要成功回数・Good可否・ピクン範囲は変えない |
| 下限（歯止め） | ひとつ下のレア度の値より必ず厳しい状態を保つ（マージン：猶予4ms・メーター10ms）。ハムの場合、何度失敗しても猶予は316ms・メーターは1240msを超えて緩まない（凄いレア＝かなしい手紙の320ms・1250msより常に厳しいまま） |
| リセット | しない。ステージ内で挑戦を重ねるほど蓄積され続ける（釣れても引き継がれる） |

### 該当コード箇所
- `src/data/stageDifficulty.ts`: `STAGE_DIFFICULTY_CONFIGS[LEGENDARY]` の数値変更、
  `getRelievedConfig`（新規）・`getNextEasierRarity`（新規）
- `src/scenes/SandboxFishingScene.ts`: `failCountByRarity`（新規フィールド）、
  `recordFailure()`（新規、早合わせ・フッキング失敗・メーターMissの3箇所＋riskyミニゲーム
  失敗時に呼ぶ）、`startCast()` で `getStageDifficultyConfig` から `getRelievedConfig` に変更

### 検証
- `npm run typecheck`: パス
- `node scripts/smoke-sandbox.mjs`: 7/7 PASS・console errors 0
- `node scripts/verify-stage1-fishing.mjs`: 11/11 PASS・console errors 0
  （target=ham required=8 のケースも実際の入力で問題なく釣れることを確認）
- `node scripts/verify-hold-to-start.mjs`: 5/5 PASS・console errors 0
- 実機検証（Playwright, `scripts/verify-rarity-rocket.mjs`）: 21/21 PASS・console errors 0
  - ハムの基本値が300ms/1200msに変わったことを確認
  - 失敗回数0〜4では緩和なし、5回で1段階目（304ms/1210ms）が適用されることを確認
  - 100回失敗させても316ms/1240ms で頭打ちになり、凄いレア（320ms/1250ms）より
    常に厳しい状態を保つことを確認
  - 検証中、テストのリトライループ自体に「前回の抽選結果が残ったままだと2回目以降
    ループが1度も回らない」というテスト側のバグを発見し修正（実装側の不具合ではない）

---

## take23 — ハムの基本難易度をtake20の値に戻し、救済は基準値の上にかぶせる形に（2026-07-16）

対象は `stageDifficulty.ts`。take22の続き、翌日の追加。

### フィードバック
- 実際に遊んでみたら1発目でハムが釣れた、という報告をきっかけに、take22の対応が
  ズレていたことが判明。「出現の確率」も「ハムに挑戦して5回失敗するまでの間の難しさ」も
  **元の（take20の）難易度のままでよく**、変えてほしかったのは「5回失敗するごとに、
  そこから少しずつ緩和されていく」救済の部分だけだった。take22では基本値自体
  （220ms→300ms・1000ms→1200ms）まで緩めてしまっていたのが誤り。
- 「悲しい手紙より難しい」という下限の考え方はそのままでよい。

### 変更内容

| 項目 | take22（誤り） | take23（修正） |
| --- | --- | --- |
| ハムの基本の猶予・メーター速度（0〜4回失敗） | 300ms／1200ms に緩和 | **220ms／1000ms（take20の値）に戻す** |
| 5回ごとの緩和幅・下限の考え方（`getRelievedConfig`） | 変更なし | 変更なし（1段階＝猶予+4ms・メーター+10ms、下限は凄いレアより厳しい状態を保つ） |

基準値が下がったぶん、緩和が頭打ち（猶予316ms・メーター1240ms、凄いレアの一歩手前）に
達するまでの失敗回数が増えた：20回失敗（4段階）→ **120回失敗（24段階）**。
「1回挑戦して5回失敗するまでは元の厳しさのまま、そこから粘るほどじわじわ緩む」という
体感になる。もし120回が多すぎる／少なすぎると感じたら、緩和幅（現在+4ms・+10ms/5回）を
次回さらに調整する。

### 該当コード箇所
- `src/data/stageDifficulty.ts`: `STAGE_DIFFICULTY_CONFIGS[LEGENDARY]` の数値のみ変更
  （`getRelievedConfig` 自体はtake22のまま手を加えていない）

### 検証
- `npm run typecheck`: パス
- `node scripts/smoke-sandbox.mjs`: 7/7 PASS・console errors 0
- `node scripts/verify-stage1-fishing.mjs`: 11/11 PASS・console errors 0
- `node scripts/verify-hold-to-start.mjs`: 5/5 PASS・console errors 0
- 実機検証（Playwright, `scripts/verify-rarity-rocket.mjs`）: 22/22 PASS・console errors 0
  - 0〜4回失敗では基準値（220ms/1000ms）のまま変化しないことを確認
  - 5回失敗で最初の緩和（224ms/1010ms）が適用されることを確認
  - 100回失敗（20段階）時点ではまだ天井前（300ms/1200ms）であることを確認
  - 200回失敗（40段階）で天井（316ms/1240ms）に達し、凄いレア（320ms/1250ms）より
    常に厳しい状態を保つことを確認

---

## take24 — ハムの緩和を「5回目までは変化なし、6回目から1回ごと」に変更／ロケットに図鑑閲覧を追加（2026-07-16）

対象は `stageDifficulty.ts`・`SandboxFishingScene`・`WalkSandboxScene`。take23の続き、同日中の追加。

### フィードバック
- 「ハムの5回目までの失敗は今まで通りの難易度で、5回目以降から1回失敗するごとに
  少しずつ難易度が下がる設定に変更したい」との要望。take22/23の「5回ごとにまとめて
  1段階」（階段状）ではなく、「5回目までは踊り場、6回目からは1回ごとに1段ずつ」という
  形に変えたい、ということだった。
- 「ベランダのマップの中に仮でロケットの場所を作ってもらって、そこに行くと図鑑が
  見れたり、前に話した全てアイテムを回収し終えた後に星に名前をつけたりできる場所に
  したい」との要望。ロケットを「探索完了後だけの名付け場所」から「いつでも図鑑を
  見られて、完了後は名付けもできる場所」に広げる。

### 変更内容

#### ハムの緩和ロジック（`getRelievedConfig`）

| 項目 | 変更前（take22/23） | 変更後 |
| --- | --- | --- |
| 緩和が始まるタイミング | 5回失敗するごとに1段階（階段状：5,10,15…） | **5回目までは緩和なし。6回目の失敗から、1回失敗するごとに1段階** |
| 1段階あたりの緩和幅 | 猶予+4ms・メーター+10ms | **猶予+1ms・メーター+2ms**（1回ごとに効くペースに合わせて縮小。天井に達するまでの総失敗回数が変わりすぎないようにするため） |
| 天井（下限）の考え方 | 変更なし | 変更なし（ひとつ下のレア度＝凄いレアより必ず厳しい状態を保つ） |

天井（猶予316ms・メーター1240ms）に達するのは、猶予は101回目・メーターは125回目の
失敗時点（旧方式の120回失敗とほぼ同水準を維持）。「1回挑戦→5回失敗するまでは今まで
通りの厳しさ→6回目からは失敗するたびに気持ち楽になっていく」という体感になる。

#### ロケットに図鑑閲覧を追加

| 項目 | 変更前 | 変更後 |
| --- | --- | --- |
| ロケットの選択肢（探索未完了） | 選択肢なし、素っ気ない一言のみ | **「図鑑を見る」「やめておく」の2択** |
| ロケットの選択肢（探索完了後） | 「名前をつけて出発する」「まだここにいる」の2択 | **「図鑑を見る」「この星に名前をつけて出発する」「やめておく」の3択** |
| 図鑑の中身 | （未実装） | `STAGE_1.items` を番号順に列挙。発見済みは名前＋フレーバー、未発見は「？？？」。進み具合（n/5）も表示 |
| 発見済みアイテムの記録 | シーン内メモリのみ（`caught`）。シーンを離れると消える | `localStorage` にも保存（`markItemCaught`/`getCaughtItems`）。釣った瞬間に記録し、ロケット側（別シーン）からも読めるようにした |

図鑑の文章量が多いため、通常のメッセージ枠（高さ160px）とは別に、大きめの専用枠
（`openEncyclopediaMessage`、画面ほぼ全体）を新設した。

### 該当コード箇所
- `src/data/stageDifficulty.ts`: `FAIL_RELIEF_STEP_SIZE` を廃止し `FAIL_RELIEF_THRESHOLD`
  （5）に変更、`getRelievedConfig` の `steps` 計算を `Math.floor(failCount/5)` から
  `Math.max(failCount-5, 0)` に変更、緩和幅の定数を縮小（+4/+10 → +1/+2）
- `src/systems/StageProgress.ts`: `markItemCaught`・`getCaughtItems`（新規、発見済み
  アイテムの永続化）
- `src/scenes/SandboxFishingScene.ts`: `runSimpleCatchMessage`・`finalizeCatch` で
  `markItemCaught` を呼ぶよう変更
- `src/data/walkSandbox.ts`: `EventChoice.action` に `"viewEncyclopedia"` を追加
- `src/scenes/WalkSandboxScene.ts`: `fireRocketEvent`（選択肢を組み立てる形に拡張）、
  `buildEncyclopediaText`・`openEncyclopediaMessage`（新規）、`confirmChoice` に
  `viewEncyclopedia` の分岐を追加

### 検証
- `npm run typecheck`: パス
- `node scripts/smoke-sandbox.mjs`: 7/7 PASS・console errors 0
- `node scripts/verify-stage1-fishing.mjs`: 11/11 PASS・console errors 0
- `node scripts/verify-hold-to-start.mjs`: 5/5 PASS・console errors 0
- 実機検証（Playwright, `scripts/verify-rarity-rocket.mjs`）: 25/25 PASS・console errors 0
  - 失敗0〜5回では緩和なし、6回目で最初の緩和（221ms/1002ms）が入ることを確認
  - 100回失敗時点（315ms/1190ms）はまだ天井前、200回失敗で天井（316ms/1240ms）に
    達し、凄いレアより厳しい状態を保つことを確認
  - ロケットが探索未完了でも「図鑑を見る／やめておく」の2択を出すことを確認
  - 目玉焼き・かなしい手紙だけ発見済みにした状態で図鑑を開き、その2種は名前＋
    フレーバー、残り3種は「？？？」、進み具合「2 / 5」が正しく表示されることを確認
  - 探索完了後は「図鑑を見る／名前をつけて出発する／やめておく」の3択になり、
    名付けまで問題なく進めることを確認

---

## take25 — ハムは他4種を発見し終えるまで出現しない「大トリ」ルールを追加／ロケットの位置を確定（2026-07-16）

対象は `StageCatalog.ts`・`walkSandbox.ts`。take24の続き、同日中の追加。

### フィードバック
- 「ハムが悲しい手紙より前に出てきてすぐ釣れてしまいました。ハム以外のアイテムが
  全て出て、そこからハムがHITして5回失敗したら難易度が変わる仕様にしてください」
  との報告・要望。これまでの抽選は「毎回全種類から重み付き」だったため、運が良ければ
  ハムが序盤にあっさり出てしまうことがあった。「他を集め終えた最後にハムが待っている」
  という体験を確実にするには、抽選方式そのものに手を入れる必要があった。
- 「イベント２を作ったのでそこをロケットの位置としてください」との依頼。`x:936, y:600`
  （`trigger: "examine"`）が実際の座標として共有された。

### 変更内容

#### 抽選ルール（`StageCatalog.rollForStage`）：大トリの特別扱い

| 項目 | 変更前 | 変更後 |
| --- | --- | --- |
| 大トリ（そのステージで最もレアな種＝ハム）の扱い | 他の種と同列。毎回全種類から通常の重み付き抽選 | **他4種を1種でも発見していない間は候補にすら入らない**。**他4種を全部発見し終えたら、それ以外（他4種）は候補から外れ、大トリだけが残る**（＝次のキャストで必ず大トリになる） |
| 難易度緩和のトリガー | 変更なし（take24のまま） | 変更なし：大トリに挑戦して5回失敗するまでは今まで通り、6回目の失敗から1回ごとに少しずつ緩む |

これにより「ハム以外の4種をすべて釣り終えるまでハムは出ない → 出た瞬間から確実にハムが
対象になる（HIT） → そこから先は今まで通りの`getRelievedConfig`の救済が効く」という、
ユーザーの言葉どおりの流れになる。

#### ロケットの位置

`walkSandbox.ts` の `veranda` マップ、イベント②の座標を仮の値（950, 250）から
ユーザーがゲーム内エディタで配置した実際の値（`x: 936, y: 600`）に更新。

### 該当コード箇所
- `src/systems/StageCatalog.ts`: `rollForStage` に「大トリ」判定（`overallMaxRarity` /
  `othersAllCaught`）を追加し、候補の絞り込みロジックを変更
- `src/data/walkSandbox.ts`: `veranda.eventMarkers［1］`（ロケット）の座標を更新

### 検証
- `npm run typecheck`: パス
- `node scripts/smoke-sandbox.mjs`: 7/7 PASS・console errors 0
- `node scripts/verify-stage1-fishing.mjs`: 11/11 PASS・console errors 0
  （実際に2匹釣る過程でハムが選ばれなくなったことを確認）
- `node scripts/verify-hold-to-start.mjs`: 5/5 PASS・console errors 0
- 実機検証（Playwright, `scripts/verify-rarity-rocket.mjs`）: 27/27 PASS・console errors 0
  - 他4種のうち1種でも未発見なら、200回抽選してもハムは一度も選ばれないことを確認
  - 他4種を全部発見済みにした直後の1回のキャストで、必ずハムが選ばれることを確認
  - 大トリ以外のレア度（かなしい手紙）については、従来どおり粘るほど出やすくなる
    緩やかな救済が効いていることを確認（ハムでは検証できなくなったため対象を変更）
  - レア度ごとの難易度パラメータの確認は、`kanashii_tegami`が`uniqueCatch`のため
    「発見済みにすると自分自身が候補から消える」という制約があり、2段階
    （他3種のみ発見済み→4種全部発見済み）に分けて確認する形に検証方法を調整

---

## take26 — 大トリ(ハム)は確実な100%ではなく低確率スタート＋専用救済に変更（2026-07-16）

対象は `StageCatalog.ts`・`SandboxFishingScene`。take25の続き、同日中の追加。

### フィードバック
- 「この確率に低確率のハムが加わって、出ないと確率が上がっていくシステムはどう
  思うか」という相談から始まり、「なかなか釣れないストレスがあると思うので、確率を
  少しづつ上げていくのはどう思うか」との案が出た。相談の中で「他4種を1匹でも
  釣り残している間にハムが出てしまう可能性を許容するか」を確認したところ、
  「ハムを先に絶対に釣れて欲しくない」と明言。take25の「他4種発見で確定100%」は
  そのままでは狙い通りではなく、「他4種を発見するまでは絶対0%」は維持しつつ、
  「発見した後は確定100%ではなく、低い確率から始まり粘るほど上がっていく」という
  形にしてほしい、という要望と判断した。

### 変更内容

| 段階 | take25（確定100%） | take26（低確率スタート＋専用救済） |
| --- | --- | --- |
| 他4種を1匹でも釣り残している間 | 大トリは候補に入らない（確率0%） | 変更なし（確率0%のまま、絶対に出ない） |
| 他4種を全部釣り終えた直後 | 次のキャストで確定100% | 大トリが低い重みで候補に加わる（他4種も重複ありで候補に残る）。実測で約10%程度からスタート |
| その後さらに粘る（キャストを重ねる） | （該当なし、既に確定していたため） | 大トリの重みだけを専用に底上げする救済が効き、実測で約40%程度まで上昇。上限あり、100%には到達しない |

大トリの救済は、ステージ全体のキャスト回数ではなく**「大トリがロック解除されてから
の」キャスト回数だけを専用に数えて**適用する。他4種を集めるのに手間取った人ほど
ロック解除直後の確率が高くなってしまう、といった不公平が起きないようにするため。

### 該当コード箇所
- `src/systems/StageCatalog.ts`: `isLegendaryUnlocked`（新規、エクスポート）、
  `rollForStage` に `legendaryUnlockedCastCount` 引数を追加し、大トリ以外は候補から
  締め出さない形に変更。大トリ専用の救済定数 `LEGENDARY_PITY_STEP` /
  `LEGENDARY_PITY_CAP` を追加
- `src/scenes/SandboxFishingScene.ts`: `legendaryUnlockedCastCount`（新規フィールド）、
  `startCast()` で `isLegendaryUnlocked` を判定してこのカウンタを増やし、
  `rollForStage` に渡すよう変更

### 検証
- `npm run typecheck`: パス
- `node scripts/smoke-sandbox.mjs`: 7/7 PASS・console errors 0
- `node scripts/verify-stage1-fishing.mjs`: 11/11 PASS・console errors 0
- `node scripts/verify-hold-to-start.mjs`: 5/5 PASS・console errors 0
- 実機検証（Playwright, `scripts/verify-rarity-rocket.mjs`）: 29/29 PASS・console errors 0
  - 他4種のうち1種でも未発見なら、救済をフルに乗せても200回中一度もハムが
    出ないことを再確認（0%は変わらず保証されている）
  - ロック解除直後（legendaryUnlockedCastCount=1）はハムの出現率が約10%と
    低いスタートであることを確認
  - 粘った状態（legendaryUnlockedCastCount=20）では約42%まで上昇するが、
    100%には到達しない（他4種も依然として候補に残る）ことを確認

---

## take27 — ハムの「失敗するほど緩む」救済のペースを大幅に早める（2026-07-16）

対象は `stageDifficulty.ts`。take22/23/24の続き。

### フィードバック
- 「ハムのタイミングゲームが難しかったので、もう少し優しくなっていくのを早くしたい」との相談。
- take24時点の救済（`getRelievedConfig`）は「5回目までの失敗は緩和なし、6回目から
  1回ごとに猶予+1ms・メーター+2ms」という設計だったが、これだと目一杯優しくなる
  （下限＝凄いレアの一歩手前に到達する）まで実は**猶予101回目・メーター125回目の
  失敗が必要**で、粘っても「優しくなってきた」とほぼ体感できないペースだった。
- 早め方の方向性として「①緩和が始まるまでの回数を減らす」「②1回ごとに緩む量を
  増やす」の2案を提示したところ、「具体的な数値はおまかせしたい」との回答。
  両方を組み合わせ、下限（かなしい手紙より必ず厳しい状態を保つ、という
  take22時点からの要望）はそのまま維持する方針で数値を決定。

### 変更内容（take24 → take27）

| 項目 | take24 | take27 |
| --- | --- | --- |
| 緩和が始まるまでの失敗回数（`FAIL_RELIEF_THRESHOLD`） | 5回 | **3回** |
| 1段階あたりの猶予の緩和幅（`HOOK_WINDOW_RELIEF_PER_STEP_MS`） | +1ms | **+4ms** |
| 1段階あたりのメーターの緩和幅（`METER_FILL_RELIEF_PER_STEP_MS`） | +2ms | **+8ms** |
| 下限（ひとつ下のレア度＝凄いレアより厳しい状態を保つマージン） | 猶予4ms・メーター10ms | 変更なし |
| 猶予が下限（316ms）に到達するまでの失敗回数 | 101回目 | **27回目** |
| メーターが下限（1240ms）に到達するまでの失敗回数 | 125回目 | **33回目** |

「最初の3回までは今まで通りの厳しさ→4回目から失敗するたびに気持ち楽になっていき、
30回前後粘れば下限（凄いレアの一歩手前）まで緩みきる」という体感になる。

### 該当コード箇所
- `src/data/stageDifficulty.ts`: `FAIL_RELIEF_THRESHOLD`（5→3）、
  `HOOK_WINDOW_RELIEF_PER_STEP_MS`（1→4）、`METER_FILL_RELIEF_PER_STEP_MS`（2→8）
  の定数のみ変更。`getRelievedConfig` のロジック自体は変更なし
- `scripts/verify-rarity-rocket.mjs`: 緩和ロジックの期待値を新しい閾値・幅に
  合わせて更新（`at5`/`at6`/`at100`/`at200` →
  `at3`/`at4`/`at27`/`at33`/`at200`）

### 検証
- `npm run typecheck`: パス
- `node scripts/smoke-sandbox.mjs`: 7/7 PASS・console errors 0
- `node scripts/verify-stage1-fishing.mjs`: 11/11 PASS・console errors 0
- `node scripts/verify-hold-to-start.mjs`: 5/5 PASS・console errors 0
- 実機検証（Playwright, `scripts/verify-rarity-rocket.mjs`）: 緩和ロジック関連の
  4項目は全てPASS
  - 0〜3回失敗では基準値（220ms/1000ms）のまま変化しないことを確認
  - 4回目の失敗で最初の緩和（224ms/1008ms）が適用されることを確認
  - 27回失敗（24段階）で猶予が下限（316ms）に到達、メーターはまだ手前（1192ms）
    であることを確認
  - 33回失敗で両方とも下限（316ms/1240ms）に到達し、凄いレア（320ms/1250ms）
    より常に厳しい状態を保つことを確認
- このスクリプトには今回の変更と無関係な既存の見落としが1件あった
  （「星に名前をつけて出発する」選択後の表示確認が、実装が使っている
  `bigNameOpen` ではなく古い `messageOpen` を見ていたための誤検知。
  `page.evaluate` で直接状態を見て、実際は `bigNameOpen: true` で名前も
  正しく反映されていることを確認済み。今回のタスク範囲外のため未修正・報告のみ）
