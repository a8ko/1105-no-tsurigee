# ベランダ釣り日和

RPGツクール風の見下ろし視点で進行する、ブラウザ向けの釣りゲームです。
部屋からベランダに出て釣りをし、釣れた収集物を図鑑に集めます。

- 技術スタック: **TypeScript (strict) + Phaser 3 + Vite**
- 内部解像度: **320 × 180**（ブラウザでは整数倍に拡大表示）
- 素材は初期実装ではプレースホルダー（コード生成の単色スプライト）。同じ `imageKey` で
  実素材をロードすれば差し替え可能です。

機能ドキュメント（実装済み・検討中・TODO）は [`docs/README.md`](docs/README.md) を参照してください。

> ⚠️ このREADMEは **旧 320×180 プロトタイプ** の説明です。現在は **1280×720 への作り直し**を進めており、
> いま動く新方向は歩行サンドボックス（`npm run dev` 後 `http://localhost:5173/sandbox.html`）です。
> 最新の機能一覧・全体像は [`docs/README.md`](docs/README.md) と [`docs/TODO.md`](docs/TODO.md) を参照。

## セットアップ

```bash
npm install      # 依存関係のインストール
npm run dev      # 開発サーバ起動（http://localhost:5173/）
```

その他のスクリプト:

```bash
npm run build      # 型チェック + 本番ビルド（dist/）
npm run typecheck  # 型チェックのみ
npm run preview    # ビルド結果をプレビュー
```

## 操作

| 操作             | キー                |
| ---------------- | ------------------- |
| 移動             | WASD または 矢印キー |
| 決定             | Space               |
| 戻る / キャンセル | Q                   |
| 図鑑を開く        | E                   |

- マウス操作はありません（入力はキーボードのみ）。
- 釣りモード中は **待機中のみ Q で中断**できます。
- 図鑑ではグリッドを移動して Space で詳細、E で並び替え（図鑑番号 / 名前 / レア度）、Q で戻る。

## 遊び方

1. タイトルで「はじめる」。部屋からスタート。
2. 部屋の窓（右）を調べてベランダへ。
3. ベランダの「釣りポイント」を調べて釣り開始。
4. 浮きが沈んだ瞬間に Space でフッキング。
5. メーターを Space で押し続け、緑（Perfect）で離す。必要回数成功で釣り上げ。
6. 釣果は図鑑に登録され、LocalStorage に自動保存されます。

## プロジェクト構成

```
src/
  main.ts                  Phaser 起動・整数倍スケーリング
  config/constants.ts      解像度・配色・深度・キー・各種定数
  types/index.ts           共有型（Catchable / Difficulty / SaveData など）
  data/
    catchables.ts          収集物データテーブル（ここに足すだけで増える）
    difficulty.ts          難易度ごとのパラメータ
    maps.ts                マップ定義（データ駆動）
  core/InputManager.ts     キーボード入力の抽象化（イベント駆動のエッジ検出）
  systems/
    SaveManager.ts         LocalStorage セーブ
    GameState.ts           実行中の状態（発見済み・現在地）と自動保存
    Catalog.ts             収集物の検索・抽選（レア度で重み付け）
    Encyclopedia.ts        図鑑のソートロジック
    meter/
      MeterGame.ts         メーターゲームのインターフェース（仕様準拠）
      GaugeMeterGame.ts    初期実装（押し続け→離して判定）
      createMeterGame.ts   差し替えポイント（ファクトリ）
  ui/
    uiHelpers.ts           パネル・テキスト生成と UI 部品の共通型
    VerticalMenu.ts        縦メニュー
    DialogBox.ts           メッセージ／選択ダイアログ
    CatchableDetailView.ts 収集物の詳細表示（釣果・図鑑で共用）
  scenes/
    BootScene.ts           プレースホルダー素材の生成
    GameScene.ts           モーダル制御の共通基底
    TitleScene.ts          タイトル
    BaseMapScene.ts        マップ共通（移動・衝突・インタラクト・図鑑起動）
    RoomScene.ts           部屋
    BalconyScene.ts        ベランダ
    FishingScene.ts        釣り（状態機械）
    CatchResultScene.ts    釣果画面
    EncyclopediaScene.ts   図鑑
    sceneData.ts           シーン間で受け渡すデータ型
```

## 拡張方法

データ駆動設計により、多くの追加はデータの追記だけで完結します。

- **収集物を追加**: `src/data/catchables.ts` に 1 行追加するだけ。ロジック変更不要。
  プレースホルダーのアイコンは `imageKey` から自動生成されます。
- **マップを追加**: `src/data/maps.ts` にマップ定義を足し、`BaseMapScene` を継承した
  薄いシーンを作って `main.ts` に登録します。
- **素材を差し替え**: `BootScene` の生成をやめ、`preload` で同じ `imageKey` /
  テクスチャキーの画像をロードすれば、コードを変えずに見た目を差し替えられます。
- **メーターゲームを差し替え**: `MeterGame` インターフェースを実装した別クラスを作り、
  `src/systems/meter/createMeterGame.ts` の返り値を差し替えるだけ。釣りシステム本体は変更不要です。

## セーブデータ

LocalStorage キー `tsurigee:save:v1` に以下を保存します（仕様準拠）。

```ts
interface SaveData {
  discoveredItems: string[]; // 発見済み収集物のID
  currentMap: string;        // 現在のマップID
  playerX: number;
  playerY: number;
}
```

保存タイミング: 収集物獲得時 / 図鑑更新時 / 釣り終了時 / マップ移動時。
タイトルの「データ削除」で消去できます。

## 開発用スクリプト

- `scripts/smoke.mjs` … システム Chrome を使った実機スモークテスト
  （タイトル→部屋→ベランダ→釣り→釣果→図鑑を実キー操作で駆動し、
  コンソールエラーとスクリーンショットを収集）。`node scripts/smoke.mjs` で実行
  （事前に `npm run dev` が必要）。
