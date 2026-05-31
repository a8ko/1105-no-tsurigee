import type { Direction } from "@/types";

/**
 * ===========================================================================
 *  歩行キャラ・サンドボックスの設定ファイル
 * ===========================================================================
 *
 *  ここはあなた（人間）が手で編集する場所です。エンジニアでなくても大丈夫。
 *
 *  ■ 画像の置き方
 *     画像は  public/assets/  フォルダに置いてください。
 *     パスは「public フォルダの中」を基準に書きます。
 *       例) public/assets/character.png  →  "assets/character.png"
 *     ファイルを同じ名前で上書きすれば、ブラウザを更新するだけで差し替わります。
 *
 *  ■ 画像がまだ無いとき
 *     仮のキャラ・背景を自動で表示します。本物を置けば自動で切り替わります。
 *
 *  ■ 数値を変えたら
 *     ブラウザを更新（リロード）すると反映されます。
 * ===========================================================================
 */

/** 当たり判定（壁）の四角。位置(x,y)＝左上角、width＝横幅、height＝高さ。単位はピクセル。 */
export interface CollisionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 1つの向きの設定：その向きに使う「行」と、歩行で再生する「列」の順番。 */
export interface DirectionFrames {
  /** スプライトシートの何行目か（0始まり）。 */
  row: number;
  /** 歩行アニメで順番に表示する列番号（0始まり）の並び。 */
  frames: number[];
}

export interface SandboxConfig {
  viewWidth: number;
  viewHeight: number;
  character: {
    path: string;
    frameWidth: number;
    frameHeight: number;
    columns: number;
    rows: number;
    directions: Record<Direction, DirectionFrames>;
    idleColumn: number;
    fps: number;
    displayScale: number;
    stepTile: number;
    stepMs: number;
    hitboxWidth: number;
    hitboxHeight: number;
  };
  background: {
    path: string;
  };
  collisionRects: CollisionRect[];
  spawn: { x: number; y: number };
}

export const SANDBOX: SandboxConfig = {
  /** 画面サイズ（前のゲームに合わせて 1280×720）。 */
  viewWidth: 1280,
  viewHeight: 720,

  character: {
    /** ★ 歩行キャラ画像のパス。置いた画像のファイル名に合わせて変えてください。 */
    path: "character.png",

    /**
     * ★ 1コマ（1枚の絵）のサイズ。
     *    RPGツクールMZの「$付き・1キャラだけ」のシートで全体が 1152×1536 なら、
     *    横3列・縦4行なので 1コマ = 384 × 384 です。
     *    もし複数キャラが並んだ 1152×1536 のシートなら 1コマ = 96 × 192 になります。
     *    （置いた画像を見てもらえれば、こちらで正しい数値をお伝えします）
     */
    frameWidth: 384,
    frameHeight: 384,

    /** ★ シート全体が何列・何行あるか。MZの1キャラは 横3列 × 縦4行。 */
    columns: 3,
    rows: 4,

    /**
     * ★ どの「行」がどの向きか＋歩行で使う「列」の順番。
     *    RPGツクールMZの標準: 0行目=下, 1行目=左, 2行目=右, 3行目=上。
     *    frames は再生する列の順番です。MZは1方向3コマ(列0,1,2)しかないので、
     *    [1,0,1,2]（真ん中→左→真ん中→右）と往復させて少し滑らかに見せています。
     *    あとでコマ数の多い絵を用意したら、列数を増やして frames を書き換えればOK。
     */
    directions: {
      down: { row: 0, frames: [0, 1, 2, 1] },
      left: { row: 1, frames: [0, 1, 2, 1] },
      right: { row: 2, frames: [0, 1, 2, 1] },
      up: { row: 3, frames: [0, 1, 2, 1] },
    },

    /** 立ち止まっているときに表示する列（MZは真ん中＝1）。 */
    idleColumn: 1,

    /** 歩行アニメの速さ（1秒あたりのコマ数）。大きいほどパタパタ速い。 */
    fps: 6,

    /** 画面に表示する拡大率（1.0＝原寸384px）。大きくしたいときはこの数値を上げる。 */
    displayScale: 1.0,

    /** ★ 1歩で進む距離（ピクセル）。RPGツクールMZと同じ 1コマ=48ドット。大きいほど大股。 */
    stepTile: 48,
    /** ★ 1歩にかける時間（ミリ秒）。小さいほどキビキビ速く歩く（大きいほどゆっくり）。 */
    stepMs: 320,

    /** 足元の当たり判定の大きさ（キャラの足元に置く四角）。 */
    hitboxWidth: 70,
    hitboxHeight: 36,
  },

  background: {
    /** ★ 手描き背景画像のパス。置いた画像のファイル名に合わせて変えてください。 */
    path: "background.png",
  },

  /**
   * ★ 当たり判定（壁）の四角の一覧。
   *    ゲーム内で C キーを押すと編集モードになり、マウスで四角を描けます。
   *    E キーで「ここに貼れる形」でコピーされるので、その内容をこの [] の中に貼ると保存されます。
   *    （描いた内容はブラウザにも自動保存され、リロードしても消えません）
   */
  collisionRects: [],

  /** キャラの最初の立ち位置（画面の中央あたり）。 */
  spawn: { x: 640, y: 520 },
};
