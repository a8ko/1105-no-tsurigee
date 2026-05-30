import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, Depth, Palette, TextColor, FontFamily } from "@/config/constants";
import type { InputManager } from "@/core/InputManager";
import type { MeterGame, MeterResult } from "./MeterGame";

/** メーターのゾーン（ゲージ値の区間と判定）。 */
interface Band {
  from: number;
  to: number;
  result: MeterResult;
  color: number;
}

/**
 * 初期実装のメーターゲーム。
 *
 * Space を押し続けるとゲージが左から右へ伸び、離した瞬間の位置で判定する。
 * 中央付近が Perfect、その両隣が Good、両端が Miss。伸ばしすぎ（最大到達）も Miss。
 * フッキングの押し込みをそのまま引き継げるよう、start 時点で既に押されていれば即開始する。
 *
 * 表示・入力・後始末をすべて内部で完結させ、MeterResult を Promise で返す。
 */
export class GaugeMeterGame implements MeterGame {
  // Perfect/Good ゾーンを広めにとり、Miss を端の狭い範囲に絞る（やさしめ）。
  private static readonly BANDS: readonly Band[] = [
    { from: 0.0, to: 0.13, result: "miss", color: Palette.miss },
    { from: 0.13, to: 0.33, result: "good", color: Palette.good },
    { from: 0.33, to: 0.67, result: "perfect", color: Palette.perfect },
    { from: 0.67, to: 0.87, result: "good", color: Palette.good },
    { from: 0.87, to: 1.0, result: "miss", color: Palette.miss },
  ];

  /** ゲージが 0→1 に到達するまでの時間 (ms)。大きいほどゆっくり。 */
  private static readonly FILL_MS = 2000;

  private readonly barWidth = 200;
  private readonly barHeight = 14;
  private readonly barX: number;
  private readonly barY: number;

  private container?: Phaser.GameObjects.Container;
  private cursor?: Phaser.GameObjects.Rectangle;
  private fillBar?: Phaser.GameObjects.Rectangle;
  private hintText?: Phaser.GameObjects.Text;

  private value = 0;
  private started = false; // ゲージ蓄積を開始したか
  private finished = false;
  private resolveFn: ((r: MeterResult) => void) | null = null;
  private updateHandler?: (time: number, delta: number) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly input: InputManager,
  ) {
    this.barX = GAME_WIDTH / 2 - this.barWidth / 2;
    this.barY = GAME_HEIGHT - 34;
  }

  start(): Promise<MeterResult> {
    this.value = 0;
    this.started = false;
    this.finished = false;
    this.build();

    return new Promise<MeterResult>((resolve) => {
      this.resolveFn = resolve;
      this.updateHandler = (_t, delta) => this.step(delta);
      this.scene.events.on(Phaser.Scenes.Events.UPDATE, this.updateHandler, this);
    });
  }

  private build(): void {
    const c = this.scene.add.container(0, 0).setDepth(Depth.modal);

    // パネル背景
    const panel = this.scene.add
      .rectangle(GAME_WIDTH / 2, this.barY + this.barHeight / 2, this.barWidth + 24, this.barHeight + 30, Palette.panelBg, 0.92)
      .setStrokeStyle(1, Palette.panelBorder);
    c.add(panel);

    // 各ゾーン
    for (const band of GaugeMeterGame.BANDS) {
      const zx = this.barX + band.from * this.barWidth;
      const zw = (band.to - band.from) * this.barWidth;
      const zone = this.scene.add
        .rectangle(zx, this.barY, zw, this.barHeight, band.color, 0.85)
        .setOrigin(0, 0.5);
      c.add(zone);
    }

    // 外枠
    const frame = this.scene.add
      .rectangle(this.barX, this.barY, this.barWidth, this.barHeight, 0x000000, 0)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1, Palette.panelBorder);
    c.add(frame);

    // 伸びるゲージ（半透明の白）
    this.fillBar = this.scene.add
      .rectangle(this.barX, this.barY, 0, this.barHeight, 0xffffff, 0.35)
      .setOrigin(0, 0.5);
    c.add(this.fillBar);

    // カーソル（現在位置）
    this.cursor = this.scene.add
      .rectangle(this.barX, this.barY, 2, this.barHeight + 6, Palette.cursor)
      .setOrigin(0.5, 0.5);
    c.add(this.cursor);

    // 操作ヒント
    this.hintText = this.scene.add
      .text(GAME_WIDTH / 2, this.barY - this.barHeight / 2 - 12, "Space を押し続けて、緑で離す！", {
        fontFamily: FontFamily,
        fontSize: "10px",
        color: TextColor.normal,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(Depth.modalText);
    c.add(this.hintText);

    this.container = c;
  }

  private step(delta: number): void {
    if (this.finished) return;

    if (!this.started) {
      // Space が押されていればゲージ蓄積を開始する。
      // フッキングで押し込んだ Space をそのまま引き継ぎ、押しっぱなしなら即開始する。
      if (this.input.heldConfirm()) {
        this.started = true;
      } else {
        return;
      }
    }

    if (this.input.heldConfirm()) {
      this.value += delta / GaugeMeterGame.FILL_MS;
      if (this.value >= 1) {
        // 伸ばしすぎ → Miss
        this.value = 1;
        this.render();
        this.finish("miss");
        return;
      }
    } else {
      // 離した → 現在位置で判定
      this.finish(this.judge(this.value));
      return;
    }

    this.render();
  }

  private render(): void {
    const px = this.barX + this.value * this.barWidth;
    this.cursor?.setX(px);
    this.fillBar?.setSize(this.value * this.barWidth, this.barHeight);
  }

  private judge(v: number): MeterResult {
    for (const band of GaugeMeterGame.BANDS) {
      if (v >= band.from && v < band.to) {
        return band.result;
      }
    }
    return "miss";
  }

  private finish(result: MeterResult): void {
    if (this.finished) return;
    this.finished = true;
    if (this.updateHandler) {
      this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.updateHandler, this);
      this.updateHandler = undefined;
    }
    this.container?.destroy(true);
    this.container = undefined;
    const resolve = this.resolveFn;
    this.resolveFn = null;
    resolve?.(result);
  }
}
