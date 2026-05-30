import { SaveManager } from "@/systems/SaveManager";
import type { SaveData } from "@/types";

/**
 * 実行中のゲーム状態（現在のセーブデータ）を保持するシングルトン。
 *
 * Phaser のシーンは遷移のたびに再生成されるため、シーンをまたいで共有したい状態は
 * モジュールシングルトンとして保持する。状態変更は本クラス経由で行い、
 * 仕様で定められたタイミング（収集物獲得・図鑑更新・釣り終了・マップ移動）で自動保存する。
 */
class GameStateManager {
  private data: SaveData | null = null;
  private discovered = new Set<string>();

  /** セーブデータをロードして状態を初期化する。 */
  init(data: SaveData): void {
    this.data = { ...data, discoveredItems: [...data.discoveredItems] };
    this.discovered = new Set(data.discoveredItems);
  }

  /** 初期化済みか。 */
  isInitialized(): boolean {
    return this.data !== null;
  }

  private require(): SaveData {
    if (!this.data) {
      throw new Error("GameState が初期化されていません。");
    }
    return this.data;
  }

  getSave(): SaveData {
    return this.require();
  }

  get currentMap(): string {
    return this.require().currentMap;
  }

  isDiscovered(id: string): boolean {
    return this.discovered.has(id);
  }

  discoveredCount(): number {
    return this.discovered.size;
  }

  /**
   * 収集物を発見済みにする。新規発見なら true を返す。
   * （収集物獲得時・図鑑更新時の保存を兼ねる）
   */
  discover(id: string): boolean {
    const data = this.require();
    if (this.discovered.has(id)) {
      return false;
    }
    this.discovered.add(id);
    data.discoveredItems.push(id);
    this.persist();
    return true;
  }

  /** プレイヤーの現在マップ・位置を更新して保存する（マップ移動時・釣り終了時）。 */
  setLocation(mapId: string, x: number, y: number): void {
    const data = this.require();
    data.currentMap = mapId;
    data.playerX = x;
    data.playerY = y;
    this.persist();
  }

  /** 明示的に保存する。 */
  persist(): void {
    SaveManager.save(this.require());
  }
}

/** ゲーム状態シングルトン。 */
export const gameState = new GameStateManager();
