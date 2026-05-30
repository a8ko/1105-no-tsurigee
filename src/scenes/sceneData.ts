import type { CatchResult, Direction, EntryPoint } from "@/types";

/** マップシーン起動時のデータ。entry があればそこに出現、なければセーブ位置。 */
export interface MapSceneData {
  entry?: EntryPoint;
}

/** 釣り終了後に戻る場所の情報（Fishing/CatchResult 間で引き回す）。 */
export interface ReturnInfo {
  mapId: string;
  x: number;
  y: number;
  facing: Direction;
}

/** FishingScene 起動時のデータ。 */
export interface FishingSceneData {
  return: ReturnInfo;
}

/** CatchResultScene 起動時のデータ。 */
export interface CatchResultSceneData {
  result: CatchResult;
  return: ReturnInfo;
}

/** EncyclopediaScene 起動時のデータ。 */
export interface EncyclopediaSceneData {
  /** 戻り先のシーンキー（オーバーレイ元）。 */
  fromScene: string;
}
