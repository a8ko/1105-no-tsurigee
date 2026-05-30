/**
 * メーターゲームのインターフェース（仕様書準拠）。
 *
 * 釣りシステムからは完全に分離されており、FishingScene はこのインターフェースと
 * createMeterGame ファクトリにのみ依存する。別方式のミニゲームに差し替える場合は
 * MeterGame を実装したクラスを作り、createMeterGame の返り値を差し替えるだけでよい。
 */
export type MeterResult = "perfect" | "good" | "miss";

export interface MeterGame {
  /**
   * メーターゲームを 1 回実行し、結果を解決する。
   * 実装は自身の表示・入力・後始末をすべて内部で完結させる。
   */
  start(): Promise<MeterResult>;
}
