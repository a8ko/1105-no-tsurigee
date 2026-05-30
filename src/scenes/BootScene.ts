import Phaser from "phaser";
import { SceneKeys, Palette } from "@/config/constants";
import { CATCHABLES } from "@/data/catchables";
import type { Direction } from "@/types";

/** 収集物アイコンのプレースホルダーサイズ。 */
export const ICON_SIZE = 24;
/** 未発見アイコンのテクスチャキー。 */
export const HIDDEN_ICON_KEY = "catch_hidden";
/** プレイヤーのテクスチャキー（向き別）。 */
export const playerTextureKey = (dir: Direction): string => `player_${dir}`;
/** 浮きのテクスチャキー。 */
export const FLOAT_KEY = "float";

/**
 * 起動シーン。仮素材（プレースホルダー）のテクスチャをコード生成してから
 * タイトルへ遷移する。実素材を用意した場合は preload で同じキーをロードすれば
 * 差し替えられる。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SceneKeys.Boot);
  }

  create(): void {
    this.generatePlayerTextures();
    this.generateFloatTexture();
    this.generateCatchableTextures();
    this.scene.start(SceneKeys.Title);
  }

  /** 単色テクスチャ生成ヘルパ。 */
  private rectTexture(
    key: string,
    width: number,
    height: number,
    fill: number,
    border?: number,
    inner?: number,
  ): void {
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(fill, 1);
    g.fillRect(0, 0, width, height);
    if (inner !== undefined) {
      g.fillStyle(inner, 1);
      g.fillRect(3, 3, width - 6, height - 6);
    }
    if (border !== undefined) {
      g.lineStyle(1, border, 1);
      g.strokeRect(0.5, 0.5, width - 1, height - 1);
    }
    g.generateTexture(key, width, height);
    g.destroy();
  }

  /** 向き別プレイヤー（単色矩形＋向きを示す顔マーカー）。 */
  private generatePlayerTextures(): void {
    const w = 12;
    const h = 14;
    const dirs: Direction[] = ["up", "down", "left", "right"];
    for (const dir of dirs) {
      const g = this.make.graphics({ x: 0, y: 0 }, false);
      // 影
      g.fillStyle(0x000000, 0.25);
      g.fillEllipse(w / 2, h - 1, w, 4);
      // 体
      g.fillStyle(Palette.player, 1);
      g.fillRect(1, 1, w - 2, h - 2);
      g.lineStyle(1, 0x223a55, 1);
      g.strokeRect(0.5, 0.5, w - 1, h - 1);
      // 顔（向き表示）
      g.fillStyle(Palette.playerFace, 1);
      const fw = 4;
      switch (dir) {
        case "up":
          g.fillRect(w / 2 - fw / 2, 1, fw, 3);
          break;
        case "down":
          g.fillRect(w / 2 - fw / 2, h - 4, fw, 3);
          break;
        case "left":
          g.fillRect(1, h / 2 - fw / 2, 3, fw);
          break;
        case "right":
          g.fillRect(w - 4, h / 2 - fw / 2, 3, fw);
          break;
      }
      g.generateTexture(playerTextureKey(dir), w, h);
      g.destroy();
    }
  }

  /** 浮き（赤い玉に白い頭）。 */
  private generateFloatTexture(): void {
    const size = 8;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(Palette.float, 1);
    g.fillCircle(size / 2, size / 2, size / 2);
    g.fillStyle(Palette.floatTop, 1);
    g.fillRect(size / 2 - 1.5, 1, 3, 3);
    g.generateTexture(FLOAT_KEY, size, size);
    g.destroy();
  }

  /** 収集物アイコン（図鑑番号から色相を決めた単色アイコン）と未発見アイコン。 */
  private generateCatchableTextures(): void {
    for (const c of CATCHABLES) {
      const hue = ((c.encyclopediaNumber * 47) % 360) / 360;
      const base = Phaser.Display.Color.HSLToColor(hue, 0.55, 0.55).color;
      const inner = Phaser.Display.Color.HSLToColor(hue, 0.6, 0.72).color;
      this.rectTexture(c.imageKey, ICON_SIZE, ICON_SIZE, base, 0x10131c, inner);
    }
    // 未発見アイコン（暗いグレー。"?" はシーン側で重ねて描画する）
    this.rectTexture(HIDDEN_ICON_KEY, ICON_SIZE, ICON_SIZE, Palette.hidden, 0x10131c);
  }
}
