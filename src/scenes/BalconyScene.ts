import { SceneKeys, Depth, Palette, GAME_WIDTH, GAME_HEIGHT } from "@/config/constants";
import { BaseMapScene } from "@/scenes/BaseMapScene";

/** ベランダ。窓を調べると部屋へ。釣りポイントを調べると釣りモードへ。 */
export class BalconyScene extends BaseMapScene {
  constructor() {
    super(SceneKeys.Balcony, "balcony");
  }

  protected override decorate(): void {
    // 右側の海（壁ブロックの上に水色を重ねて海らしく見せる）
    const oceanX = 232;
    const oceanW = GAME_WIDTH - oceanX;
    this.add
      .rectangle(oceanX + oceanW / 2, GAME_HEIGHT / 2, oceanW, GAME_HEIGHT, Palette.water)
      .setDepth(Depth.walls + 1);
    // 奥（上側）を少し暗くして奥行きを出す
    this.add
      .rectangle(oceanX + oceanW / 2, 30, oceanW, 60, Palette.waterDeep, 0.45)
      .setDepth(Depth.walls + 2);
  }
}
