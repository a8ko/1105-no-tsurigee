import Phaser from "phaser";
import { Palette, TextColor, FontFamily } from "@/config/constants";
import type { InputManager } from "@/core/InputManager";

/** 毎フレーム入力で更新され、いずれ破棄されるUI部品。 */
export interface UiComponent {
  update(input: InputManager): void;
  destroy(): void;
}

export interface TextOptions {
  fontSize?: string;
  color?: string;
  align?: "left" | "center" | "right";
  wordWrapWidth?: number;
}

/** 標準スタイルのテキストを生成する。 */
export function makeText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  opts: TextOptions = {},
): Phaser.GameObjects.Text {
  const style: Phaser.Types.GameObjects.Text.TextStyle = {
    fontFamily: FontFamily,
    fontSize: opts.fontSize ?? "10px",
    color: opts.color ?? TextColor.normal,
    align: opts.align ?? "left",
  };
  if (opts.wordWrapWidth !== undefined) {
    style.wordWrap = { width: opts.wordWrapWidth, useAdvancedWrap: true };
  }
  return scene.add.text(x, y, text, style);
}

export interface PanelOptions {
  fill?: number;
  fillAlpha?: number;
  border?: number;
  borderWidth?: number;
}

/**
 * 矩形パネルを生成する（原点は中心）。
 * 返り値の Rectangle を container に add して使う。
 */
export function makePanel(
  scene: Phaser.Scene,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  opts: PanelOptions = {},
): Phaser.GameObjects.Rectangle {
  const rect = scene.add.rectangle(
    centerX,
    centerY,
    width,
    height,
    opts.fill ?? Palette.panelBg,
    opts.fillAlpha ?? 0.94,
  );
  rect.setStrokeStyle(opts.borderWidth ?? 1, opts.border ?? Palette.panelBorder);
  return rect;
}
