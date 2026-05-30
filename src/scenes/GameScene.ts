import Phaser from "phaser";
import { InputManager } from "@/core/InputManager";
import { DialogBox } from "@/ui/DialogBox";
import type { UiComponent } from "@/ui/uiHelpers";

/**
 * UI モーダル（ダイアログ・メニュー）を扱うシーンの共通基底。
 *
 * 同時にアクティブなモーダルは 1 つだけとし、アクティブな間は毎フレーム
 * そのモーダルにだけ入力を渡す（入力の二重消費を防ぐ）。
 */
export abstract class GameScene extends Phaser.Scene {
  protected inputMgr!: InputManager;
  protected activeModal: UiComponent | null = null;

  /** create() の最初で呼ぶ。キーボード入力を初期化する。 */
  protected setupInput(): void {
    this.inputMgr = new InputManager(this);
  }

  /** モーダルがアクティブなら入力を委譲して true を返す。update 冒頭で使う。 */
  protected updateModal(): boolean {
    if (this.activeModal) {
      this.activeModal.update(this.inputMgr);
      return true;
    }
    return false;
  }

  /** モーダルをアクティブにして実行し、終了後に破棄する。 */
  protected async withModal<T>(modal: UiComponent, run: () => Promise<T>): Promise<T> {
    this.activeModal = modal;
    try {
      return await run();
    } finally {
      if (this.activeModal === modal) {
        this.activeModal = null;
      }
      modal.destroy();
    }
  }

  /** はい/いいえ等の選択。選んだインデックス（キャンセルは -1）を返す。 */
  protected confirm(text: string, options: readonly string[] = ["はい", "いいえ"]): Promise<number> {
    const dialog = new DialogBox(this);
    return this.withModal(dialog, () => dialog.showChoice(text, options));
  }

  /** メッセージ表示。Space で解決。 */
  protected message(text: string): Promise<void> {
    const dialog = new DialogBox(this);
    return this.withModal(dialog, () => dialog.showMessage(text));
  }

  /** 任意の表示の上で「Space で次へ」を待つ（図鑑詳細など）。 */
  protected pressConfirm(): Promise<void> {
    let resolveFn: () => void = () => {};
    const p = new Promise<void>((r) => {
      resolveFn = r;
    });
    let done = false;
    const comp: UiComponent = {
      update: (input) => {
        if (!done && input.justConfirm()) {
          done = true;
          resolveFn();
        }
      },
      destroy: () => {},
    };
    return this.withModal(comp, () => p);
  }
}
