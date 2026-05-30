import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, Depth, TextColor } from "@/config/constants";
import type { InputManager } from "@/core/InputManager";
import { makeText, makePanel, type UiComponent } from "@/ui/uiHelpers";
import { VerticalMenu } from "@/ui/VerticalMenu";

/**
 * 画面下部のメッセージ＆選択ダイアログ。
 *
 * - showMessage: メッセージを表示し、Space で次へ進む。
 * - showChoice: メッセージと選択肢（例: はい / いいえ）を表示し、選んだインデックスを返す。
 *
 * 1 つの DialogBox は同時に 1 つの表示のみを扱う。表示中は毎フレーム update を呼ぶこと。
 */
export class DialogBox implements UiComponent {
  private container?: Phaser.GameObjects.Container;
  private menu?: VerticalMenu;
  private waitingMessage = false;
  private resolveMessage: (() => void) | null = null;

  constructor(private readonly scene: Phaser.Scene) {}

  /** メッセージを表示。Space で解決する。 */
  showMessage(text: string): Promise<void> {
    this.clearVisuals();
    const panelH = 46;
    const centerY = GAME_HEIGHT - panelH / 2 - 6;
    const width = GAME_WIDTH - 16;

    const c = this.scene.add.container(0, 0).setDepth(Depth.modal);
    c.add(makePanel(this.scene, GAME_WIDTH / 2, centerY, width, panelH));
    c.add(
      makeText(this.scene, 14, centerY - panelH / 2 + 7, text, {
        wordWrapWidth: width - 16,
      }),
    );
    const hint = makeText(this.scene, 0, 0, "▼ Space", { color: TextColor.dim, fontSize: "9px" });
    hint.setPosition(GAME_WIDTH - 12 - hint.width, centerY + panelH / 2 - 12);
    c.add(hint);
    this.container = c;

    this.waitingMessage = true;
    return new Promise<void>((resolve) => {
      this.resolveMessage = resolve;
    });
  }

  /** メッセージ＋選択肢を表示。選んだインデックス（キャンセルは -1）を返す。 */
  showChoice(text: string, options: readonly string[]): Promise<number> {
    this.clearVisuals();
    const panelH = 46;
    const centerY = GAME_HEIGHT - panelH / 2 - 6;
    const msgWidth = GAME_WIDTH - 16 - 70; // 右側に選択肢ぶんの余白

    const c = this.scene.add.container(0, 0).setDepth(Depth.modal);
    c.add(makePanel(this.scene, 8 + msgWidth / 2, centerY, msgWidth, panelH));
    c.add(
      makeText(this.scene, 14, centerY - panelH / 2 + 7, text, {
        wordWrapWidth: msgWidth - 16,
      }),
    );
    this.container = c;

    // 選択肢メニューは右上寄りに表示
    const menu = new VerticalMenu(this.scene, options, {
      x: 8 + msgWidth + 6,
      y: centerY - panelH / 2,
      cancelable: true,
      minWidth: 52,
    });
    this.menu = menu;
    return menu.prompt();
  }

  update(input: InputManager): void {
    if (this.menu) {
      this.menu.update(input);
      return;
    }
    if (this.waitingMessage && input.justConfirm()) {
      this.waitingMessage = false;
      const fn = this.resolveMessage;
      this.resolveMessage = null;
      fn?.();
    }
  }

  private clearVisuals(): void {
    this.menu?.destroy();
    this.menu = undefined;
    this.container?.destroy(true);
    this.container = undefined;
    this.waitingMessage = false;
    this.resolveMessage = null;
  }

  destroy(): void {
    this.clearVisuals();
  }
}
