import Phaser from "phaser";
import { Depth, TextColor } from "@/config/constants";
import type { InputManager } from "@/core/InputManager";
import { makeText, makePanel, type UiComponent } from "@/ui/uiHelpers";

export interface VerticalMenuOptions {
  /** パネル左上の座標。 */
  x: number;
  y: number;
  /** Q キーでキャンセル可能か（true のとき -1 を返す）。 */
  cancelable?: boolean;
  /** 初期選択インデックス。 */
  initialIndex?: number;
  /** 最小パネル幅。 */
  minWidth?: number;
}

/**
 * 縦並びの選択メニュー（キーボード操作）。
 * タイトル画面のメニューやダイアログの選択肢に使う汎用部品。
 */
export class VerticalMenu implements UiComponent {
  private static readonly PAD = 6;
  private static readonly LINE_H = 14;
  private static readonly CURSOR_W = 10;

  private readonly container: Phaser.GameObjects.Container;
  private readonly texts: Phaser.GameObjects.Text[] = [];
  private readonly cursor: Phaser.GameObjects.Text;
  private selected: number;
  private open = false;
  private resolveFn: ((index: number) => void) | null = null;

  constructor(
    scene: Phaser.Scene,
    private readonly items: readonly string[],
    private readonly opts: VerticalMenuOptions,
  ) {
    this.selected = opts.initialIndex ?? 0;

    const { x, y } = opts;
    const pad = VerticalMenu.PAD;
    const lineH = VerticalMenu.LINE_H;

    this.container = scene.add.container(0, 0).setDepth(Depth.modal);

    // 先にテキストを作って最大幅を測る
    this.items.forEach((label, i) => {
      const t = makeText(scene, x + pad + VerticalMenu.CURSOR_W, y + pad + i * lineH, label);
      this.texts.push(t);
    });
    const maxTextW = this.texts.reduce((m, t) => Math.max(m, t.width), 0);
    const width = Math.max(
      opts.minWidth ?? 0,
      maxTextW + VerticalMenu.CURSOR_W + pad * 2,
    );
    const height = pad * 2 + this.items.length * lineH;

    const panel = makePanel(scene, x + width / 2, y + height / 2, width, height);
    this.container.add(panel);
    this.texts.forEach((t) => this.container.add(t));

    this.cursor = makeText(scene, x + pad, y + pad, "▶", { color: TextColor.accent });
    this.container.add(this.cursor);

    this.refresh();
  }

  /** メニューを開いて選択結果を待つ。確定でインデックス、キャンセルで -1。 */
  prompt(): Promise<number> {
    this.open = true;
    return new Promise<number>((resolve) => {
      this.resolveFn = resolve;
    });
  }

  update(input: InputManager): void {
    if (!this.open) return;
    const n = this.items.length;

    if (input.justUp()) {
      this.selected = (this.selected - 1 + n) % n;
      this.refresh();
    } else if (input.justDown()) {
      this.selected = (this.selected + 1) % n;
      this.refresh();
    }

    if (input.justConfirm()) {
      this.resolve(this.selected);
    } else if (this.opts.cancelable && input.justCancel()) {
      this.resolve(-1);
    }
  }

  private resolve(index: number): void {
    if (!this.open) return;
    this.open = false;
    const fn = this.resolveFn;
    this.resolveFn = null;
    fn?.(index);
  }

  private refresh(): void {
    const lineH = VerticalMenu.LINE_H;
    const baseY = this.opts.y + VerticalMenu.PAD;
    this.cursor.setY(baseY + this.selected * lineH);
    this.texts.forEach((t, i) => {
      t.setColor(i === this.selected ? TextColor.accent : TextColor.normal);
    });
  }

  destroy(): void {
    this.open = false;
    this.container.destroy(true);
  }
}
