import { GAME_WIDTH, GAME_HEIGHT, SceneKeys, Depth, Palette, TextColor } from "@/config/constants";
import { Catalog } from "@/systems/Catalog";
import { gameState } from "@/systems/GameState";
import { getMap } from "@/data/maps";
import { renderCatchableDetail } from "@/ui/CatchableDetailView";
import { makeText } from "@/ui/uiHelpers";
import { GameScene } from "@/scenes/GameScene";
import type { CatchResult } from "@/types";
import type { CatchResultSceneData, ReturnInfo, FishingSceneData } from "@/scenes/sceneData";

/**
 * 釣果画面。
 *
 * - 初取得: 収集物獲得 → 図鑑詳細表示 → Space → 釣りを続けますか？
 * - 既取得: 収集物獲得 → 釣りを続けますか？
 * - 失敗:   逃げられてしまった… → Space → 釣りを続けますか？
 *
 * 図鑑登録（discover）は FishingScene 側で済んでおり、isNew で分岐する。
 */
export class CatchResultScene extends GameScene {
  private result!: CatchResult;
  private returnInfo!: ReturnInfo;

  constructor() {
    super(SceneKeys.CatchResult);
  }

  create(data: CatchResultSceneData): void {
    this.result = data.result;
    this.returnInfo = data.return;
    this.setupInput();

    // 背景
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, Palette.water).setDepth(Depth.floor);
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.35).setDepth(Depth.floor);

    void this.run();
  }

  private async run(): Promise<void> {
    if (this.result.outcome === "caught") {
      await this.showCaught();
    } else {
      await this.message("にげられてしまった…");
    }

    const again = await this.confirm("釣りを続けますか？");
    if (again === 0) {
      const data: FishingSceneData = { return: this.returnInfo };
      this.scene.start(SceneKeys.Fishing, data);
    } else {
      // 釣り終了時の保存
      gameState.setLocation(this.returnInfo.mapId, this.returnInfo.x, this.returnInfo.y);
      this.scene.start(getMap(this.returnInfo.mapId).sceneKey, {
        entry: {
          x: this.returnInfo.x,
          y: this.returnInfo.y,
          facing: this.returnInfo.facing,
        },
      });
    }
  }

  private async showCaught(): Promise<void> {
    const c = this.result.catchableId ? Catalog.getById(this.result.catchableId) : undefined;
    if (!c) {
      // データ不整合の保険
      await this.message("なにかを釣り上げた！");
      return;
    }

    const header = makeText(this, GAME_WIDTH / 2, 20, "つり あげた！", {
      fontSize: "12px",
      color: TextColor.accent,
      align: "center",
    })
      .setOrigin(0.5)
      .setDepth(Depth.uiText);

    await this.message(`${c.name} を 釣り上げた！`);

    if (this.result.isNew) {
      // 図鑑登録 → 図鑑詳細画面表示 → Space で次へ
      header.destroy();
      const detail = renderCatchableDetail(this, c, true, "図鑑に登録した！  Space: つぎへ");
      await this.pressConfirm();
      detail.destroy(true);
    }
  }

  override update(): void {
    this.updateModal();
  }
}
