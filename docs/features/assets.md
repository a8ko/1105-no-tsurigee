# 素材システム（画像・アニメ・動画）

> ステータス: 🟡 登録・読み込みの土台＋メッセージ枠の差し替え（段階1）まで実装 ／ [← 目次へ](../README.md)

## これは何？

あなたが描いた**オリジナルの絵・アニメ・動画**を、メッセージ枠・立ち絵・看板・演出として
ゲームに差し込めるようにする仕組みです。やることは2つだけ。

1. 決まったフォルダ（`public/assets/…`）に素材を置く
2. 設定ファイル `src/data/assets.ts` に「名前」と「種類」を1行書く

同じ名前のファイルで上書きすれば、**リロードするだけで差し替わります**。

## 実装済み

### 素材の3種類

| 種類 | キーワード | 何に使う | 読み込み |
| --- | --- | --- | --- |
| 一枚絵 | `image` | 枠・立ち絵・看板・アイコン・背景 | `load.image` |
| アニメ | `anime` | パラパラ動く絵（コマを並べたPNG） | `load.spritesheet`＋再生アニメ自動生成 |
| 動画 | `video` | オープニング・動く背景・派手な演出 | `load.video`（再生制御は今後） |

### 置き場所と登録

```
public/assets/
├─ windows/   メッセージ枠など「伸び縮みする枠」の絵
├─ images/    一枚絵
├─ anime/     コマを並べたPNG
└─ video/     mp4 / webm
```

`src/data/assets.ts` に1行ずつ登録（`AssetDef` 型）：

```ts
{ id, kind: "image" | "anime" | "video", path,
  frameWidth?, frameHeight?, fps?,        // アニメ用
  nineSlice?: { left, right, top, bottom } } // 枠用ののりしろ
```

- `id` … ゲームから呼ぶときのあだ名（英数字）
- `path` … `public/` を基準にしたファイル位置
- `ASSET_MAP` で `id → 素材` を引けるようにしている

### 読み込みの土台（`src/systems/AssetLoader.ts`）

- `preloadAssets(scene)` … `ASSETS` を読み込み。**ファイルが無くてもスキップ**（止まらない）
- `registerAnimations(scene)` … `anime` の再生用アニメを自動生成（キー `asset-anim-{id}`）
- `makeWindow(scene, …)` … **ナインスライス枠**を作る。素材が無ければ従来の半透明四角に自動で戻る

### メッセージ枠の差し替え（段階1・実装済み）

- お手本の枠 `public/assets/windows/default.png`（96×96）を登録済み（`window_default`、のりしろ各24px）。
- 歩行サンドボックスのメッセージ枠・選択肢枠を、この枠でナインスライス表示。
- **自分の枠にする方法**：`public/assets/windows/default.png` を自分の絵で**同じ名前で上書き**してリロード。

> **GIF を渡したいとき**：Phaser は GIF をそのままだと動かせません。GIFで渡してOK。
> こちらでコマPNG（anime）か webm（video）に変換して組み込みます。

## 検討したい

- **のりしろ（nineSlice）の決め方**：今は default.png で各24px（=25%）。新しい枠絵に合わせて何pxを「角」にするか、絵を見て調整。基準をどこまで文書化するか。
- **動画の再生制御**：読み込みまでは実装済みだが、再生/停止/全画面か一部かの「差し込み口」は未設計（段階4で決める）。
- **登録し忘れの扱い**：未登録IDを呼んだときの警告など、デバッグ支援が要るか。
- **既存 `public/background.png` / `character.png` の整理**：いずれ `assets/` 配下へ寄せるか（急がない）。

## 今後のTODO

- [x] 段階1：素材登録＋読み込み＋メッセージ枠の差し替え（ナインスライス）
- [ ] 段階2：イベント中の一枚絵差し込み（立ち絵・看板・カットイン）→ [イベント](events.md) / [ダイアログ・UI](dialog-ui.md)
- [ ] 段階3：マップ上に絵・アニメを配置（エディタ連携）→ [マップ管理](maps.md)
- [ ] 段階4：動画／カットイン演出（再生制御の設計含む）
- [ ] アニメ素材（spritesheet）を実際に置いて再生確認
- [ ] GIF→変換の運用を定着（変換手順のメモ化）

## 関連ファイル

- `src/data/assets.ts` … 素材の登録（あなたが1行ずつ足す場所）
- `src/systems/AssetLoader.ts` … 読み込み・アニメ生成・枠生成の土台
- `src/scenes/WalkSandboxScene.ts` … 枠の差し込み先（メッセージ・選択肢）
- `public/assets/windows/default.png` … お手本の枠（差し替え対象）
