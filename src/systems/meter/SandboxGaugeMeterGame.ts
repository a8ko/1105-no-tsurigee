import Phaser from "phaser";
import { SANDBOX } from "@/data/walkSandbox";
import { Depth, Palette, TextColor, FontFamily } from "@/config/constants";
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
 * 歩行サンドボックス方向（1280×720）向けのメーターゲーム。
 *
 * ロジックは旧 GaugeMeterGame（320×180）と同じ。サイズ・座標だけ新解像度に合わせて
 * 作り直している（旧ゲームの `GAME_WIDTH`/`GAME_HEIGHT` に依存させないための別ファイル）。
 */
export class SandboxGaugeMeterGame implements MeterGame {
  private static readonly BANDS: readonly Band[] = [
    { from: 0.0, to: 0.13, result: "miss", color: Palette.miss },
    { from: 0.13, to: 0.33, result: "good", color: Palette.good },
    { from: 0.33, to: 0.67, result: "perfect", color: Palette.perfect },
    { from: 0.67, to: 0.87, result: "good", color: Palette.good },
    { from: 0.87, to: 1.0, result: "miss", color: Palette.miss },
  ];

  /** ゲージが 0→1 に到達するまでの既定時間 (ms)。start() に渡さなければこれを使う（旧実装と同じ 2000ms）。 */
  private static readonly DEFAULT_FILL_MS = 2000;

  /** 今回の実行で使うゲージ速度 (ms)。レア度が高いほど短く（速く）呼び出し側から指定できる。 */
  private fillMs = SandboxGaugeMeterGame.DEFAULT_FILL_MS;

  private readonly barWidth = 480;
  private readonly barHeight = 28;
  private readonly barX: number;
  private readonly barY: number;

  private container?: Phaser.GameObjects.Container;
  private cursor?: Phaser.GameObjects.Rectangle;
  private fillBar?: Phaser.GameObjects.Rectangle;
  private hintText?: Phaser.GameObjects.Text;

  private value = 0;
  private started = false;
  private finished = false;
  private resolveFn: ((r: MeterResult) => void) | null = null;
  private updateHandler?: (time: number, delta: number) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly input: InputManager,
  ) {
    this.barX = SANDBOX.viewWidth / 2 - this.barWidth / 2;
    this.barY = SANDBOX.viewHeight - 90;
  }

  /** @param fillMs ゲージが満タンになるまでの時間 (ms)。省略時は既定の 2000ms。 */
  start(fillMs: number = SandboxGaugeMeterGame.DEFAULT_FILL_MS): Promise<MeterResult> {
    this.fillMs = fillMs;
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

    const panel = this.scene.add
      .rectangle(
        SANDBOX.viewWidth / 2,
        this.barY + this.barHeight / 2,
        this.barWidth + 40,
        this.barHeight + 56,
        Palette.panelBg,
        0.92,
      )
      .setStrokeStyle(2, Palette.panelBorder);
    c.add(panel);

    for (const band of SandboxGaugeMeterGame.BANDS) {
      const zx = this.barX + band.from * this.barWidth;
      const zw = (band.to - band.from) * this.barWidth;
      const zone = this.scene.add
        .rectangle(zx, this.barY, zw, this.barHeight, band.color, 0.85)
        .setOrigin(0, 0.5);
      c.add(zone);
    }

    const frame = this.scene.add
      .rectangle(this.barX, this.barY, this.barWidth, this.barHeight, 0x000000, 0)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, Palette.panelBorder);
    c.add(frame);

    this.fillBar = this.scene.add
      .rectangle(this.barX, this.barY, 0, this.barHeight, 0xffffff, 0.35)
      .setOrigin(0, 0.5);
    c.add(this.fillBar);

    this.cursor = this.scene.add
      .rectangle(this.barX, this.barY, 3, this.barHeight + 10, Palette.cursor)
      .setOrigin(0.5, 0.5);
    c.add(this.cursor);

    this.hintText = this.scene.add
      .text(SANDBOX.viewWidth / 2, this.barY - this.barHeight / 2 - 24, "スペースを押し続けて、緑で離す！", {
        fontFamily: FontFamily,
        fontSize: "20px",
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
      if (this.input.heldConfirm()) {
        this.started = true;
      } else {
        return;
      }
    }

    if (this.input.heldConfirm()) {
      this.value += delta / this.fillMs;
      if (this.value >= 1) {
        this.value = 1;
        this.render();
        this.finish("miss");
        return;
      }
    } else {
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
    for (const band of SandboxGaugeMeterGame.BANDS) {
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
