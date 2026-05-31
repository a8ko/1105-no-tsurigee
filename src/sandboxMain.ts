import Phaser from "phaser";
import { SANDBOX } from "@/data/walkSandbox";
import { WalkSandboxScene } from "@/scenes/WalkSandboxScene";

/**
 * 歩行キャラ・サンドボックス専用のゲーム起動ファイル。
 * 既存の釣りゲーム（src/main.ts・320×180）とは別物で、
 * sandbox.html から 1280×720 で起動する。
 */
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game",
  width: SANDBOX.viewWidth,
  height: SANDBOX.viewHeight,
  backgroundColor: "#1b2030",
  pixelArt: false,
  roundPixels: false,
  scale: {
    // ウィンドウに合わせて縦横比を保ったまま拡大縮小する。
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [WalkSandboxScene],
};

const game = new Phaser.Game(config);
(window as unknown as { __SANDBOX__?: Phaser.Game }).__SANDBOX__ = game;
