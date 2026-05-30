import { SceneKeys, GAME_WIDTH, GAME_HEIGHT, Palette } from "@/config/constants";
import type { MapDefinition } from "@/types";

/**
 * マップ定義テーブル（データ駆動）。
 *
 * 新しいマップを追加する場合はここにエントリを足し、対応するシーンを
 * BaseMapScene を継承して作る（または汎用シーンに sceneKey を渡す）だけでよい。
 */

const ROOM: MapDefinition = {
  id: "room",
  sceneKey: SceneKeys.Room,
  displayName: "へや",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  floorColor: 0x6b4f3a, // 木の床
  walls: [
    // 外周
    { x: 0, y: 0, width: GAME_WIDTH, height: 12 },
    { x: 0, y: GAME_HEIGHT - 12, width: GAME_WIDTH, height: 12 },
    { x: 0, y: 0, width: 8, height: GAME_HEIGHT },
    { x: GAME_WIDTH - 8, y: 0, width: 8, height: GAME_HEIGHT },
    // 家具（雰囲気づけ・衝突あり）
    { x: 20, y: 118, width: 74, height: 44 }, // ベッド
    { x: 120, y: 16, width: 64, height: 26 }, // 机
    { x: 22, y: 14, width: 64, height: 16 }, // 棚
    { x: 210, y: 120, width: 50, height: 30 }, // テーブル
  ],
  interactables: [
    {
      id: "room-window",
      kind: "door",
      rect: { x: GAME_WIDTH - 12, y: 64, width: 12, height: 52 },
      prompt: "ベランダに出る？",
      // 移動先（ベランダ側の窓のそば）。接続はデータで完結する。
      target: { mapId: "balcony", entry: { x: 26, y: 90, facing: "right" } },
      color: Palette.window,
    },
  ],
  spawn: { x: 160, y: 96, facing: "right" },
};

const BALCONY: MapDefinition = {
  id: "balcony",
  sceneKey: SceneKeys.Balcony,
  displayName: "ベランダ",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  floorColor: 0x8a8f99, // コンクリート
  walls: [
    // 外周
    { x: 0, y: 0, width: GAME_WIDTH, height: 12 },
    { x: 0, y: GAME_HEIGHT - 12, width: GAME_WIDTH, height: 12 },
    { x: 0, y: 0, width: 6, height: GAME_HEIGHT },
    // 右側は海。手すり〜海をまとめて通行不可にする
    { x: 232, y: 0, width: GAME_WIDTH - 232, height: GAME_HEIGHT },
  ],
  interactables: [
    {
      id: "balcony-window",
      kind: "door",
      rect: { x: 0, y: 64, width: 12, height: 52 },
      prompt: "部屋に戻る？",
      // 移動先（部屋側の窓のそば）。
      target: { mapId: "room", entry: { x: GAME_WIDTH - 26, y: 90, facing: "left" } },
      color: Palette.window,
    },
    {
      id: "balcony-fishing-spot",
      kind: "fishingSpot",
      rect: { x: 210, y: 70, width: 20, height: 34 },
      prompt: "釣りを始めますか？",
      color: Palette.fishingSpot,
      label: "釣りポイント",
    },
  ],
  spawn: { x: 60, y: 90, facing: "right" },
};

const MAP_LIST: readonly MapDefinition[] = [ROOM, BALCONY];

const MAP_INDEX: Record<string, MapDefinition> = Object.fromEntries(
  MAP_LIST.map((m) => [m.id, m]),
);

/** マップIDからマップ定義を取得する。 */
export function getMap(id: string): MapDefinition {
  const map = MAP_INDEX[id];
  if (!map) {
    throw new Error(`Unknown map id: ${id}`);
  }
  return map;
}

/** 新規開始時のマップID。 */
export const START_MAP_ID = ROOM.id;
