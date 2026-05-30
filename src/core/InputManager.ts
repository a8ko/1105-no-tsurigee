import Phaser from "phaser";

type EdgeKey = "up" | "down" | "left" | "right" | "confirm" | "cancel" | "enc";

const EDGE_KEYS: readonly EdgeKey[] = ["up", "down", "left", "right", "confirm", "cancel", "enc"];

/**
 * キーボード入力の抽象化（仕様: 入力はキーボードのみ）。
 *
 * - 移動: WASD / 矢印キー
 * - 決定: Space
 * - 戻る/キャンセル: Q
 * - 図鑑: E
 *
 * 「押された瞬間」はキーの down/up イベントでエッジフラグを立て、毎フレーム末
 * （POST_UPDATE）にクリアする方式で検出する。`Phaser.Input.Keyboard.JustDown` は
 * 環境によってフレーム同期がずれて取りこぼすため使わない。`held*` は押下中を返す。
 */
export class InputManager {
  private readonly keys: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
    UP: Phaser.Input.Keyboard.Key;
    DOWN: Phaser.Input.Keyboard.Key;
    LEFT: Phaser.Input.Keyboard.Key;
    RIGHT: Phaser.Input.Keyboard.Key;
    SPACE: Phaser.Input.Keyboard.Key;
    Q: Phaser.Input.Keyboard.Key;
    E: Phaser.Input.Keyboard.Key;
  };

  private edge: Record<EdgeKey, boolean> = {
    up: false,
    down: false,
    left: false,
    right: false,
    confirm: false,
    cancel: false,
    enc: false,
  };

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard;
    if (!kb) {
      throw new Error("Keyboard input plugin is not available.");
    }
    const C = Phaser.Input.Keyboard.KeyCodes;
    const add = (code: number): Phaser.Input.Keyboard.Key => kb.addKey(code, true, false);
    this.keys = {
      W: add(C.W),
      A: add(C.A),
      S: add(C.S),
      D: add(C.D),
      UP: add(C.UP),
      DOWN: add(C.DOWN),
      LEFT: add(C.LEFT),
      RIGHT: add(C.RIGHT),
      SPACE: add(C.SPACE),
      Q: add(C.Q),
      E: add(C.E),
    };

    const mark = (k: EdgeKey) => () => {
      this.edge[k] = true;
    };
    this.keys.W.on("down", mark("up"));
    this.keys.UP.on("down", mark("up"));
    this.keys.S.on("down", mark("down"));
    this.keys.DOWN.on("down", mark("down"));
    this.keys.A.on("down", mark("left"));
    this.keys.LEFT.on("down", mark("left"));
    this.keys.D.on("down", mark("right"));
    this.keys.RIGHT.on("down", mark("right"));
    this.keys.SPACE.on("down", mark("confirm"));
    this.keys.Q.on("down", mark("cancel"));
    this.keys.E.on("down", mark("enc"));

    // フレーム末にエッジをクリア（読み取りは UPDATE / scene.update、どちらも POST_UPDATE より前）
    const clear = () => this.clearEdges();
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, clear);
    // 再開直後に一時停止前の押下エッジが残っていると誤発火するため、再開時にもクリアする
    scene.events.on(Phaser.Scenes.Events.RESUME, clear);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      scene.events.off(Phaser.Scenes.Events.POST_UPDATE, clear);
      scene.events.off(Phaser.Scenes.Events.RESUME, clear);
    });
  }

  private clearEdges(): void {
    for (const k of EDGE_KEYS) {
      this.edge[k] = false;
    }
  }

  // --- 押下中（移動・ゲージ蓄積用） ---
  heldUp(): boolean {
    return this.keys.W.isDown || this.keys.UP.isDown;
  }
  heldDown(): boolean {
    return this.keys.S.isDown || this.keys.DOWN.isDown;
  }
  heldLeft(): boolean {
    return this.keys.A.isDown || this.keys.LEFT.isDown;
  }
  heldRight(): boolean {
    return this.keys.D.isDown || this.keys.RIGHT.isDown;
  }
  heldConfirm(): boolean {
    return this.keys.SPACE.isDown;
  }

  // --- 押された/離された瞬間（メニュー・判定用） ---
  justUp(): boolean {
    return this.edge.up;
  }
  justDown(): boolean {
    return this.edge.down;
  }
  justLeft(): boolean {
    return this.edge.left;
  }
  justRight(): boolean {
    return this.edge.right;
  }
  justConfirm(): boolean {
    return this.edge.confirm;
  }
  justCancel(): boolean {
    return this.edge.cancel;
  }
  justEncyclopedia(): boolean {
    return this.edge.enc;
  }
}
