import { SceneKeys, Depth } from "@/config/constants";
import { BaseMapScene } from "@/scenes/BaseMapScene";

/** 部屋。ゲーム開始地点。窓を調べるとベランダへ。 */
export class RoomScene extends BaseMapScene {
  constructor() {
    super(SceneKeys.Room, "room");
  }

  protected override decorate(): void {
    // ラグ（雰囲気づけ）
    this.add.rectangle(150, 112, 120, 68, 0x35513a, 0.45).setDepth(Depth.floor + 1);
  }
}
