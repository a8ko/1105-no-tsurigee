import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, Palette } from "@/config/constants";
import { BootScene } from "@/scenes/BootScene";
import { TitleScene } from "@/scenes/TitleScene";
import { RoomScene } from "@/scenes/RoomScene";
import { BalconyScene } from "@/scenes/BalconyScene";
import { FishingScene } from "@/scenes/FishingScene";
import { CatchResultScene } from "@/scenes/CatchResultScene";
import { EncyclopediaScene } from "@/scenes/EncyclopediaScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: Palette.bg,
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [
    BootScene,
    TitleScene,
    RoomScene,
    BalconyScene,
    FishingScene,
    CatchResultScene,
    EncyclopediaScene,
  ],
};

const game = new Phaser.Game(config);

// デバッグ・自動テスト用にゲームインスタンスを公開する（実害なし）。
(window as unknown as { __GAME__?: Phaser.Game }).__GAME__ = game;

/** ウィンドウに収まる最大の整数倍率で拡大表示する（内部解像度 320×180 を維持）。 */
function applyIntegerZoom(): void {
  const zoom = Math.max(
    1,
    Math.floor(Math.min(window.innerWidth / GAME_WIDTH, window.innerHeight / GAME_HEIGHT)),
  );
  game.scale.setZoom(zoom);
}

game.events.once(Phaser.Core.Events.READY, applyIntegerZoom);
window.addEventListener("resize", applyIntegerZoom);
