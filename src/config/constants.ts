/** ゲーム全体で使う定数。 */

/** 内部解像度（仕様書: 320 × 180、ブラウザでは整数倍拡大）。 */
export const GAME_WIDTH = 320;
export const GAME_HEIGHT = 180;

/** シーンキー（文字列の散在を防ぐため一元管理）。 */
export const SceneKeys = {
  Boot: "BootScene",
  Title: "TitleScene",
  Room: "RoomScene",
  Balcony: "BalconyScene",
  Fishing: "FishingScene",
  CatchResult: "CatchResultScene",
  Encyclopedia: "EncyclopediaScene",
} as const;

/** 描画の重なり順。 */
export const Depth = {
  floor: 0,
  walls: 10,
  interactable: 15,
  player: 20,
  fx: 30,
  ui: 100,
  uiText: 110,
  modal: 200,
  modalText: 210,
} as const;

/** 配色（プレースホルダー）。 */
export const Palette = {
  bg: 0x10131c,
  player: 0x4a90d9,
  playerFace: 0xffffff,
  float: 0xe24a4a,
  floatTop: 0xffffff,
  water: 0x1c4f7c,
  waterDeep: 0x143a5c,
  window: 0x8fd0e6,
  fishingSpot: 0x2e9bd6,
  panelBg: 0x0c1018,
  panelBorder: 0xf4f4f4,
  panelBorderDim: 0x6a7180,
  cursor: 0xffd24a,
  good: 0xe0c020,
  perfect: 0x40c040,
  miss: 0xc03030,
  hidden: 0x2a2f3a,
} as const;

/** テキスト色（CSS 文字列）。 */
export const TextColor = {
  normal: "#ffffff",
  dim: "#9aa3b2",
  accent: "#ffd24a",
  bad: "#ff8a8a",
  good: "#9be39b",
} as const;

/** プレイヤーの当たり判定サイズと移動速度。 */
export const PlayerConfig = {
  width: 12,
  height: 14,
  speed: 70, // px / 秒
  /** インタラクト判定で「正面」を伸ばす距離。 */
  interactReach: 8,
} as const;

/** UI のフォント設定（日本語はシステムフォントにフォールバック）。 */
export const FontFamily =
  '"DotGothic16", "Hiragino Maru Gothic ProN", "MS Gothic", monospace, sans-serif';

/** LocalStorage のセーブキー。 */
export const SAVE_KEY = "tsurigee:save:v1";
