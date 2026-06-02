/**
 * ===========================================================================
 *  素材（画像・アニメ・動画）の登録ファイル
 * ===========================================================================
 *
 *  ここはあなた（人間）が手で編集する場所です。エンジニアでなくても大丈夫。
 *
 *  ■ 流れは3ステップだけ
 *     1) 描いた素材を public/assets/ の決まったフォルダに置く
 *          windows/ … メッセージ枠など「伸び縮みする枠」の絵
 *          images/  … 一枚絵（立ち絵・看板・アイコン・背景）
 *          anime/   … コマを並べたPNG（パラパラアニメ）
 *          video/   … mp4 / webm 動画
 *     2) 下の ASSETS に1行 追加する（あだ名・種類・置き場所）
 *     3) ゲームから「あだ名（id）」で呼び出す
 *
 *  ■ ファイルがまだ無いとき
 *     エラーで止まらず、今まで通りの見た目（仮の四角など）になります。
 *     本物を置けば、リロードするだけで自動で切り替わります。
 *
 *  ■ GIF を渡したいとき
 *     Phaser は GIF をそのままだと動かせません（最初の1コマで止まる）。
 *     GIFはそのまま渡してください。こちらで「コマPNG(anime)」か「webm(video)」に
 *     変換してから、ここに登録します。
 *
 *  設計の全体像は docs/features/assets.md を参照。
 * ===========================================================================
 */

/** 素材の種類。image＝一枚絵 / anime＝パラパラアニメ / video＝動画。 */
export type AssetKind = "image" | "anime" | "video";

/** メッセージ枠などで「角を崩さず辺と中だけ伸ばす」ためののりしろ（ピクセル）。 */
export interface NineSliceMargins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** 1つの素材の登録内容。 */
export interface AssetDef {
  /** ゲームから呼ぶときの「あだ名」（英数字）。 */
  id: string;
  /** 種類。 */
  kind: AssetKind;
  /** public フォルダを基準にしたファイル位置。例: "assets/images/cat.png" */
  path: string;

  // ▼ kind:"anime" のときだけ使う（1コマのサイズと速さ）
  /** アニメの1コマの横幅（ピクセル）。 */
  frameWidth?: number;
  /** アニメの1コマの高さ（ピクセル）。 */
  frameHeight?: number;
  /** 1秒あたりのコマ数（大きいほど速い）。 */
  fps?: number;

  // ▼ kind:"image" でメッセージ枠などに使うときだけ
  /** ナインスライスののりしろ。指定すると「枠」として伸び縮みできるようになる。 */
  nineSlice?: NineSliceMargins;
}

/**
 * ★ 登録した素材の一覧。ここに1行ずつ足していきます。
 *
 *   例の書き方:
 *     一枚絵   { id: "sign_fishing", kind: "image", path: "assets/images/sign_fishing.png" }
 *     アニメ   { id: "cat_idle", kind: "anime", path: "assets/anime/cat.png",
 *                frameWidth: 96, frameHeight: 96, fps: 8 }
 *     動画     { id: "opening", kind: "video", path: "assets/video/opening.webm" }
 */
export const ASSETS: AssetDef[] = [
  // メッセージ枠のデフォルト。
  //   public/assets/windows/default.png に枠の絵を置くと、セリフ窓がその絵になります。
  //   まだ置いていなければ、今まで通りの四角い窓が出ます（エラーにはなりません）。
  //   nineSlice の数値＝「角として固定する余白」。絵を見てこちらで調整します。
  {
    id: "window_default",
    kind: "image",
    path: "assets/windows/default.png",
    nineSlice: { left: 24, right: 24, top: 24, bottom: 24 },
  },
];

/** id から素材定義を引くための表（プログラムが使う）。 */
export const ASSET_MAP: ReadonlyMap<string, AssetDef> = new Map(ASSETS.map((a) => [a.id, a]));
