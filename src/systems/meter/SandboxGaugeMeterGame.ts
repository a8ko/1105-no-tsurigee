import Phaser from "phaser";
import { SANDBOX } from "@/data/walkSandbox";
import { Depth, Palette, TextColor, FontFamily } from "@/config/constants";
import { buildMeterBands } from "@/systems/meter/meterBands";
import { getTuning } from "@/systems/TuningStore";
import { StageRarity } from "@/data/stageCatchables";
import type { MeterBand } from "@/systems/meter/meterBands";
import type { InputManager } from "@/core/InputManager";
import type { MeterGame, MeterResult } from "./MeterGame";

/**
 * 歩行サンドボックス方向（1280×720）向けのメーターゲーム。
 *
 * ロジックは旧 GaugeMeterGame（320×180）と同じ。サイズ・座標だけ新解像度に合わせて
 * 作り直している（旧ゲームの `GAME_WIDTH`/`GAME_HEIGHT` に依存させないための別ファイル）。
 * ゾーン（緑/黄/赤）の幅は調整パネル（G キー）の設定を、始めるたびに読み直す。
 */
export class SandboxGaugeMeterGame implements MeterGame {
  /** 今回の実行で使うゾーン。start() のたびに調整パネルの値から作り直す。 */
  private bands: readonly MeterBand[] = buildMeterBands();

  /** 今回の実行で使うゲージ速度 (ms)。レア度が高いほど短く（速く）呼び出し側から指定する。 */
  private fillMs = 2000;

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

  /**
   * @param fillMs ゲージが満タンになるまでの時間 (ms)。レア度ごとの設定から呼び出し側が渡す。
   *               省略したときは、いちばん易しいレア度（普通）の速さを使う。
   */
  start(fillMs?: number): Promise<MeterResult> {
    this.fillMs = fillMs ?? getTuning().rarities[StageRarity.COMMON].meterFillMs;
    this.bands = buildMeterBands();
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

    for (const band of this.bands) {
      const zx = this.barX + band.from * this.barWidth;
      const zw = (band.to - band.from) * this.barWidth;
      if (zw <= 0) continue; // 幅ゼロに設定されたゾーンは描かない
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
    for (const band of this.bands) {
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
