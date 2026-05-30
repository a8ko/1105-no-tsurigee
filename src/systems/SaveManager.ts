import { SAVE_KEY } from "@/config/constants";
import { START_MAP_ID, getMap } from "@/data/maps";
import { Catalog } from "@/systems/Catalog";
import type { SaveData } from "@/types";

/**
 * LocalStorage を使ったセーブ管理。
 *
 * 保存タイミング（仕様）：収集物獲得時 / 図鑑更新時 / 釣り終了時 / マップ移動時。
 * 単一のセーブスロットを扱う。
 */
export class SaveManager {
  /** 既存のセーブデータを読み込む。なければ null。 */
  static load(): SaveData | null {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return SaveManager.normalize(parsed);
    } catch (e) {
      console.warn("セーブデータの読み込みに失敗しました。", e);
      return null;
    }
  }

  /** セーブデータが存在するか。 */
  static exists(): boolean {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  }

  /** セーブデータを書き込む。 */
  static save(data: SaveData): void {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn("セーブデータの保存に失敗しました。", e);
    }
  }

  /** セーブデータを削除する。 */
  static clear(): void {
    try {
      window.localStorage.removeItem(SAVE_KEY);
    } catch (e) {
      console.warn("セーブデータの削除に失敗しました。", e);
    }
  }

  /** 新規ゲーム用の初期セーブデータを作る。 */
  static createNew(): SaveData {
    const start = getMap(START_MAP_ID);
    return {
      discoveredItems: [],
      currentMap: START_MAP_ID,
      playerX: start.spawn.x,
      playerY: start.spawn.y,
    };
  }

  /** 壊れた・部分的なデータを安全な形に補正する。 */
  private static normalize(data: Partial<SaveData>): SaveData {
    const fallback = SaveManager.createNew();
    let currentMap = typeof data.currentMap === "string" ? data.currentMap : fallback.currentMap;
    // 未知のマップIDなら開始マップへ
    try {
      getMap(currentMap);
    } catch {
      currentMap = fallback.currentMap;
    }
    return {
      discoveredItems: SaveManager.normalizeDiscovered(data.discoveredItems),
      currentMap,
      playerX: typeof data.playerX === "number" ? data.playerX : fallback.playerX,
      playerY: typeof data.playerY === "number" ? data.playerY : fallback.playerY,
    };
  }

  /** 発見済みIDを「カタログに実在する文字列ID」のみへ正規化し、重複も除去する。 */
  private static normalizeDiscovered(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of raw) {
      if (typeof id === "string" && !seen.has(id) && Catalog.getById(id) !== undefined) {
        seen.add(id);
        out.push(id);
      }
    }
    return out;
  }
}
