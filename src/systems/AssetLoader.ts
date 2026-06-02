import Phaser from "phaser";
import { ASSETS, ASSET_MAP, type AssetDef } from "@/data/assets";

/**
 * ===========================================================================
 *  素材（画像・アニメ・動画）の読み込みと差し込みヘルパー
 * ===========================================================================
 *
 *  src/data/assets.ts に登録した素材を、種類に応じて Phaser に読み込ませ、
 *  ゲームから簡単に差し込めるようにする土台です。
 *
 *  使い方（シーン側）:
 *    preload() で  preloadAssets(this)
 *    create()  で  registerAnimations(this)
 *    あとは     makeWindow(this, ...) などのヘルパーで差し込む
 *
 *  ファイルが無くてもエラーで止まらない（仮の見た目になる）方針です。
 *  設計の全体像は docs/features/assets.md を参照。
 * ===========================================================================
 */

/** anime 素材から作るアニメーションの key を id から決める（衝突しないよう接頭辞を付ける）。 */
export function animKey(id: string): string {
  return `asset-anim-${id}`;
}

/**
 * 登録済みの全素材を読み込みキューに積む。各シーンの preload() で呼ぶ。
 * 見つからないファイルはスキップ（後段のヘルパーが仮の見た目に切り替える）。
 */
export function preloadAssets(scene: Phaser.Scene): void {
  for (const def of ASSETS) {
    switch (def.kind) {
      case "image":
        scene.load.image(def.id, def.path);
        break;
      case "anime":
        scene.load.spritesheet(def.id, def.path, {
          frameWidth: def.frameWidth ?? 1,
          frameHeight: def.frameHeight ?? 1,
        });
        break;
      case "video":
        scene.load.video(def.id, def.path);
        break;
    }
  }
}

/**
 * 読み込めた anime 素材に対して、ループ再生用のアニメーションを用意する。
 * 各シーンの create() で 1 回呼ぶ。
 */
export function registerAnimations(scene: Phaser.Scene): void {
  for (const def of ASSETS) {
    if (def.kind !== "anime") continue;
    if (!scene.textures.exists(def.id)) continue; // ファイルが無いものは飛ばす
    const key = animKey(def.id);
    if (scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(def.id, {}),
      frameRate: def.fps ?? 8,
      repeat: -1,
    });
  }
}

/** image 素材が実際に読み込めているか（仮表示に切り替えるべきかの判定に使う）。 */
export function hasImage(scene: Phaser.Scene, id: string): boolean {
  return scene.textures.exists(id);
}

/** メッセージ枠などの窓の生成結果（ナインスライス or 従来の四角）。 */
export type WindowObject = Phaser.GameObjects.NineSlice | Phaser.GameObjects.Rectangle;

export interface WindowOptions {
  /** 使う枠素材の id（既定: "window_default"）。 */
  id?: string;
  /** 枠が無いとき（従来四角）の塗り色。 */
  fallbackFill?: number;
  /** 枠が無いときの塗り透明度。 */
  fallbackAlpha?: number;
  /** 枠が無いときの枠線の色。 */
  fallbackBorder?: number;
  /** 枠が無いときの枠線の太さ。 */
  fallbackBorderWidth?: number;
}

/**
 * メッセージ枠などの「窓」を作る。
 * 登録された枠素材（nineSlice 付き image）が読み込めていればその絵を、
 * 無ければ今まで通りの四角を返す。どちらも setScrollFactor / setDepth を続けて呼べる。
 *
 * @param cx 中心 X / @param cy 中心 Y / @param w 横幅 / @param h 高さ
 */
export function makeWindow(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  w: number,
  h: number,
  opts: WindowOptions = {},
): WindowObject {
  const id = opts.id ?? "window_default";
  const def: AssetDef | undefined = ASSET_MAP.get(id);

  if (def?.kind === "image" && def.nineSlice && scene.textures.exists(id)) {
    const m = def.nineSlice;
    return scene.add.nineslice(cx, cy, id, undefined, w, h, m.left, m.right, m.top, m.bottom);
  }

  // フォールバック：従来の半透明の四角。
  return scene.add
    .rectangle(cx, cy, w, h, opts.fallbackFill ?? 0x10182c, opts.fallbackAlpha ?? 0.92)
    .setStrokeStyle(opts.fallbackBorderWidth ?? 3, opts.fallbackBorder ?? 0xffffff, 0.9);
}
