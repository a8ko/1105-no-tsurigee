import { GAME_WIDTH, GAME_HEIGHT, SceneKeys, Palette, TextColor } from "@/config/constants";
import { getMap, START_MAP_ID } from "@/data/maps";
import { SaveManager } from "@/systems/SaveManager";
import { gameState } from "@/systems/GameState";
import { VerticalMenu } from "@/ui/VerticalMenu";
import { makeText } from "@/ui/uiHelpers";
import { GameScene } from "@/scenes/GameScene";

/**
 * タイトル画面。メニュー：はじめる / 続きから / データ削除。
 * 上下移動・Space 決定。データ削除時は確認ダイアログを表示する。
 */
export class TitleScene extends GameScene {
  constructor() {
    super(SceneKeys.Title);
  }

  create(): void {
    this.setupInput();

    // 背景
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, Palette.water);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 36, GAME_WIDTH, 72, Palette.waterDeep, 0.5);

    // タイトル
    makeText(this, GAME_WIDTH / 2, 44, "ベランダ釣り日和", {
      fontSize: "20px",
      color: TextColor.normal,
      align: "center",
    }).setOrigin(0.5);
    makeText(this, GAME_WIDTH / 2, 68, "～ おうちで気軽に釣り ～", {
      fontSize: "10px",
      color: TextColor.dim,
      align: "center",
    }).setOrigin(0.5);

    void this.runMenu();
  }

  private async runMenu(): Promise<void> {
    // ループ：項目を選び、必要なら処理してメニューへ戻る
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const hasSave = SaveManager.exists();
      const items = ["はじめる", "続きから", "データ削除"];
      const menu = new VerticalMenu(this, items, {
        x: GAME_WIDTH / 2 - 44,
        y: 96,
        minWidth: 88,
      });
      const choice = await this.withModal(menu, () => menu.prompt());

      if (choice === 0) {
        this.startNewGame();
        return;
      }
      if (choice === 1) {
        if (await this.continueGame(hasSave)) {
          return;
        }
        continue;
      }
      if (choice === 2) {
        await this.deleteFlow(hasSave);
        continue;
      }
    }
  }

  private startNewGame(): void {
    gameState.init(SaveManager.createNew());
    gameState.persist();
    this.scene.start(getMap(START_MAP_ID).sceneKey);
  }

  private async continueGame(hasSave: boolean): Promise<boolean> {
    const save = hasSave ? SaveManager.load() : null;
    if (!save) {
      await this.message("セーブデータがありません。");
      return false;
    }
    gameState.init(save);
    this.scene.start(getMap(save.currentMap).sceneKey);
    return true;
  }

  private async deleteFlow(hasSave: boolean): Promise<void> {
    if (!hasSave) {
      await this.message("削除するセーブデータがありません。");
      return;
    }
    const yn = await this.confirm("セーブデータを削除しますか？");
    if (yn === 0) {
      SaveManager.clear();
      await this.message("セーブデータを削除しました。");
    }
  }

  override update(): void {
    this.updateModal();
  }
}
