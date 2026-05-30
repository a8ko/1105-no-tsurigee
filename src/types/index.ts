/**
 * ゲーム全体で共有する型定義。
 *
 * 収集物・難易度・セーブデータは仕様書 (docs/SPEC.md) のインターフェースに準拠する。
 * データ駆動設計のため、ロジックはこれらの型のみに依存し、
 * 個別の収集物やマップを追加してもロジック側の変更が不要になるようにする。
 */

/** 難易度。値の順序がレア度の傾向（EASY→LEGEND）と対応する。 */
export enum Difficulty {
  EASY,
  NORMAL,
  HARD,
  LEGEND,
}

/** 難易度ごとの釣りパラメータ。 */
export interface DifficultyConfig {
  /** フッキング成功判定の猶予時間 (ms)。 */
  hookWindowMs: number;
  /** ヒットフェーズで必要な成功回数。 */
  requiredSuccesses: number;
  /** Good 判定を成功として扱うか。 */
  allowGood: boolean;
}

/**
 * 釣り上げられる収集物。魚以外（ゴミ・お宝など）も含むため "Catchable" とする。
 * すべてデータテーブル (src/data/catchables.ts) で管理する。
 */
export interface Catchable {
  /** 一意なID。セーブデータの discoveredItems に保存される。 */
  id: string;
  /** 図鑑番号（表示・ソート用）。 */
  encyclopediaNumber: number;

  name: string;
  description: string;

  /** レア度（数値が大きいほど稀）。 */
  rarity: number;

  /** この収集物を釣るときの難易度。 */
  difficulty: Difficulty;

  /** 表示に使うテクスチャキー（プレースホルダー／差し替え用）。 */
  imageKey: string;
}

/** LocalStorage に保存するセーブデータ。 */
export interface SaveData {
  /** 発見済み収集物のID一覧。 */
  discoveredItems: string[];

  /** 現在のマップID。 */
  currentMap: string;

  playerX: number;
  playerY: number;
}

/** 4方向。 */
export type Direction = "up" | "down" | "left" | "right";

/** 矩形（衝突・トリガー判定用）。マップ座標系のピクセル単位。 */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** マップへの到着位置（移動先で出現する場所と向き）。 */
export interface EntryPoint {
  x: number;
  y: number;
  facing: Direction;
}

/**
 * マップ上のインタラクト対象の種別。
 * - door: 別マップへ移動する窓/扉（target が必須）
 * - fishingSpot: 釣りポイント
 */
export type InteractableKind = "door" | "fishingSpot";

/** マップ上のインタラクト対象の定義（データ駆動）。 */
export interface InteractableData {
  id: string;
  kind: InteractableKind;
  /** 当たり判定矩形（プレイヤーが隣接したかの判定に使う）。 */
  rect: Rect;
  /** 調べたときの確認メッセージ（例: "ベランダに出る？"）。 */
  prompt?: string;
  /** door のとき：遷移先マップIDと到着位置。これによりマップ接続がデータ駆動になる。 */
  target?: { mapId: string; entry: EntryPoint };
  /** 任意：プレースホルダー描画色。 */
  color?: number;
  /** 任意：マップ上に表示するラベル（例: "釣りポイント"）。 */
  label?: string;
}

/** マップ定義（データ駆動。追加が容易なように 1 つの構造で表現する）。 */
export interface MapDefinition {
  id: string;
  /** 対応する Phaser シーンキー。 */
  sceneKey: string;
  /** マップの表示名。 */
  displayName: string;

  /** マップサイズ（ピクセル）。内部解像度に合わせる。 */
  width: number;
  height: number;

  /** 床のプレースホルダー色。 */
  floorColor: number;

  /** 衝突する壁・家具などの矩形。 */
  walls: Rect[];

  /** インタラクト対象。 */
  interactables: InteractableData[];

  /** 新規開始時のプレイヤー初期位置と向き。 */
  spawn: { x: number; y: number; facing: Direction };
}

/** 釣りの結果（CatchResultScene へ渡すデータ）。 */
export interface CatchResult {
  outcome: "caught" | "failed";
  /** outcome === "caught" のとき有効。 */
  catchableId?: string;
  /** 初取得かどうか（caught のとき有効）。 */
  isNew?: boolean;
}
