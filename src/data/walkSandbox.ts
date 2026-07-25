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
 *
 *  ■ マップについて（NEW）
 *     このゲームは「マップ」という箱を複数持てます。1つのマップは
 *     「背景・壁・スタート位置・イベント」をひとまとめにした箱です。
 *     箱を増やすとマップが増えます（下の maps を参照）。
 * ===========================================================================
 */

/** 当たり判定（壁）の四角。位置(x,y)＝左上角、width＝横幅、height＝高さ。単位はピクセル。 */
export interface CollisionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** イベントのきっかけ（起動条件）。examine＝調べる(決定ボタン) / step＝踏む(乗ると自動)。 */
export type EventTrigger = "examine" | "step";

/** 選択肢の1つ（例:「うん。」）。 */
export interface EventChoice {
  /** 画面に出す選択肢の文（例:「うん。」「いいや。」）。 */
  label: string;
  /** 選んだあとに出すメッセージ（任意。未設定なら何も出さず閉じる）。 */
  reply?: string;
  /** 選んだときに、返事の代わりに特別な動作を起こす（例: 釣りシーンへ切り替える）。 */
  action?: "startFishing" | "nameStarAndDepart" | "viewEncyclopedia";
}

/** マップ上に置く1つのイベント地点。番号①②③…は配列の並び順で決まる。 */
export interface EventMarker {
  /** 地点の中心位置（ピクセル）。 */
  x: number;
  y: number;
  /** きっかけ。"examine"＝調べると発動 / "step"＝踏むと発動。 */
  trigger: EventTrigger;
  /**
   * 発動時に表示するメッセージ（任意）。
   * 未設定で choices も無ければ「①のイベント（調べる）が発動しました」という確認用の仮文を出す。
   */
  message?: string;
  /** 選択肢を出すときの質問文（例:「つりする？」）。choices と一緒に使う。 */
  prompt?: string;
  /** 選択肢の一覧（設定すると prompt とセットで「質問＋選択肢」を出す）。 */
  choices?: EventChoice[];
  /**
   * 特別な振る舞いをする地点の種別（省略時は上の message/choices だけの通常イベント）。
   * "rocket"＝探索が終わっているかどうかで反応を出し分けるロケット（中身は WalkSandboxScene 側で分岐）。
   */
  kind?: "rocket";
}

/** 1つの向きの設定：その向きに使う「行」と、歩行で再生する「列」の順番。 */
export interface DirectionFrames {
  /** スプライトシートの何行目か（0始まり）。 */
  row: number;
  /** 歩行アニメで順番に表示する列番号（0始まり）の並び。 */
  frames: number[];
}

/** 歩行キャラの設定（全マップ共通：同じキャラで歩く）。 */
export interface CharacterConfig {
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
}

/**
 * 1枚のマップ（背景・壁・スタート位置・イベントを1つにまとめた箱）。
 * RPGツクールMZの「マップ」に相当します。
 */
export interface MapData {
  /** マップを区別する名前（英数字。プログラムが使う。例: "veranda"）。 */
  id: string;
  /** 画面に出すマップ名（日本語OK。例:「ベランダ」）。 */
  name: string;
  /** 背景画像のパス（public フォルダ基準）。 */
  background: { path: string };
  /** 当たり判定（壁）の四角の一覧。 */
  collisionRects: CollisionRect[];
  /** イベント地点の一覧（ゲーム内で V キーのエディタを開いて置く）。 */
  eventMarkers: EventMarker[];
  /** キャラの最初の立ち位置。 */
  spawn: { x: number; y: number };
}

/** プロジェクト全体（複数マップ＋全マップ共通の設定）。 */
export interface ProjectData {
  /** 画面サイズ（全マップ共通）。 */
  viewWidth: number;
  viewHeight: number;
  /** 歩行キャラの設定（全マップ共通）。 */
  character: CharacterConfig;
  /** マップの一覧。ここに箱を増やすとマップが増える。 */
  maps: MapData[];
  /** 最初に開くマップの id。 */
  startMapId: string;
}

export const SANDBOX: ProjectData = {
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
  },

  /** ★ 最初に開くマップの id（下の maps の中から選ぶ）。 */
  startMapId: "veranda",

  /**
   * ★ マップの一覧。
   *    マップ＝「背景・壁・スタート位置・イベント」を1つにまとめた箱です。
   *    箱（{ ... }）を増やすとマップが増えます。
   *    （マップを選んで切り替える機能は、今後の段階で追加します）
   *
   *    各マップの中で:
   *    ・collisionRects … ゲーム内で C キーの当たり判定エディタで作る
   *    ・eventMarkers   … ゲーム内で V キーのイベント配置エディタで置く
   *    描いた内容はブラウザにも自動保存され、リロードしても消えません。
   */
  maps: [
    {
      id: "veranda",
      name: "ベランダ",
      background: {
        /** ★ 手描き背景画像のパス。置いた画像のファイル名に合わせて変えてください。 */
        path: "background.png",
      },
      collisionRects: [],
      eventMarkers: [
        {
          // ① 釣りポイント（踏むと「つりする？」と聞かれる）
          x: 563,
          y: 599,
          trigger: "step",
          prompt: "つりする？",
          choices: [
            { label: "うん。", action: "startFishing" },
            { label: "いいや。" },
          ],
        },
        {
          // ② ロケット（調べると発動）。図鑑を見られ、探索完了後は名前をつけて出発できます。
          x: 936,
          y: 600,
          trigger: "examine",
          kind: "rocket",
        },
      ],
      /** キャラの最初の立ち位置（画面の中央あたり）。 */
      spawn: { x: 640, y: 520 },
    },
  ],
};

/** id からマップを探す。見つからなければ最初のマップを返す（保険）。 */
export function findMap(project: ProjectData, id: string): MapData {
  return project.maps.find((m) => m.id === id) ?? project.maps[0];
}
