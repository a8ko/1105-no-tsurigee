import Phaser from "phaser";
import { SANDBOX, type CollisionRect } from "@/data/walkSandbox";
import type { Direction } from "@/types";

/** テクスチャ／アニメのキー。 */
const SHEET_KEY = "sandbox_character";
const BG_KEY = "sandbox_background";
const walkKey = (dir: Direction): string => `sandbox_walk_${dir}`;

/** 編集した当たり判定をブラウザに自動保存するキー。 */
const STORAGE_KEY = "tsurigee:sandbox:collision:v1";
/** スタート位置をブラウザに自動保存するキー。 */
const SPAWN_KEY = "tsurigee:sandbox:spawn:v1";

const DIRS: Direction[] = ["down", "left", "right", "up"];

/**
 * 歩行キャラ・サンドボックス（1280×720）。
 *
 * - 手描き背景＋RPGツクールMZの歩行キャラを表示し、WASD/矢印で歩き回る。
 * - 画像が無い間は仮素材を自動生成する（本物を public/assets/ に置けば差し替わる）。
 * - C キーで当たり判定エディタ：マウスで壁の四角を描く／消す／動かす。
 *
 * 既存の釣りゲーム（320×180）とは完全に独立しており、sandbox.html から起動する。
 */
export class WalkSandboxScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private facing: Direction = "down";
  /** スタート位置（最初に立つ場所）。P キーで現在地に設定できる。 */
  private spawnPoint = { x: 0, y: 0 };

  // --- マス目ステップ移動の状態（1歩=48ドットでマスに揃って止まる） ---
  private stepping = false;
  private stepFrom = { x: 0, y: 0 };
  private stepTo = { x: 0, y: 0 };
  private stepElapsed = 0;
  private stepTotal = 0;
  /** 前フレームの実時刻（performance.now / ミリ秒）。実時間ベースで速さを一定に保つため。 */
  private lastFrameMs = 0;

  private keys!: {
    up: Phaser.Input.Keyboard.Key[];
    down: Phaser.Input.Keyboard.Key[];
    left: Phaser.Input.Keyboard.Key[];
    right: Phaser.Input.Keyboard.Key[];
  };

  /** 操作キーの最終実行時刻（ms）。Phaser の keydown 二重発火を無視するため。 */
  private lastAction: Record<string, number> = {};

  /** ロードに失敗したか（→ 仮素材を生成する）。 */
  private sheetMissing = false;
  private bgMissing = false;

  // --- 当たり判定エディタ用の状態 ---
  private editing = false;
  /** 当たり判定の赤い四角を画面に表示するか（H キーで切替）。本番の見た目を確認するため。 */
  private showRects = true;
  private rects: CollisionRect[] = [];
  private editorGfx!: Phaser.GameObjects.Graphics;
  private selectedIndex = -1;
  /** 新規ドラッグ中の始点（編集モード）。 */
  private dragStart: { x: number; y: number } | null = null;
  /** 既存の四角を移動中のときのカーソルとの相対位置。 */
  private moveOffset: { dx: number; dy: number } | null = null;
  private pointerNow: { x: number; y: number } = { x: 0, y: 0 };

  private infoText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;

  constructor() {
    super("WalkSandboxScene");
  }

  preload(): void {
    const c = SANDBOX.character;
    this.load.image(BG_KEY, SANDBOX.background.path);
    this.load.spritesheet(SHEET_KEY, c.path, {
      frameWidth: c.frameWidth,
      frameHeight: c.frameHeight,
    });
    // ファイルが無い場合は loaderror が飛ぶ。仮素材に切り替えるためフラグを立てる。
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      if (file.key === BG_KEY) this.bgMissing = true;
      if (file.key === SHEET_KEY) this.sheetMissing = true;
    });
  }

  create(): void {
    if (this.bgMissing || !this.textures.exists(BG_KEY)) {
      this.generatePlaceholderBackground();
    }
    if (this.sheetMissing || !this.textures.exists(SHEET_KEY)) {
      this.generatePlaceholderSheet();
    }

    // 背景は画面サイズ（1280×720）ぴったりに表示する（多少サイズが違っても合わせる）。
    this.add
      .image(0, 0, BG_KEY)
      .setOrigin(0, 0)
      .setDisplaySize(SANDBOX.viewWidth, SANDBOX.viewHeight)
      .setDepth(0);

    this.createAnimations();
    this.spawnPoint = this.loadSpawn();
    this.spawnPlayer();
    this.setupInput();

    this.rects = this.loadRects();
    this.editorGfx = this.add.graphics().setDepth(50);
    this.redrawRects();

    this.createHud();
  }

  // ---------------------------------------------------------------------------
  //  アニメーション・プレイヤー
  // ---------------------------------------------------------------------------

  private createAnimations(): void {
    const c = SANDBOX.character;
    for (const dir of DIRS) {
      const key = walkKey(dir);
      if (this.anims.exists(key)) this.anims.remove(key);
      const cfg = c.directions[dir];
      const frames = cfg.frames.map((col) => ({
        key: SHEET_KEY,
        frame: cfg.row * c.columns + col,
      }));
      this.anims.create({ key, frames, frameRate: c.fps, repeat: -1 });
    }
  }

  /** 立ち止まりフレーム（その向きの idle 列）。 */
  private idleFrame(dir: Direction): number {
    const c = SANDBOX.character;
    return c.directions[dir].row * c.columns + c.idleColumn;
  }

  private spawnPlayer(): void {
    const c = SANDBOX.character;
    this.player = this.add
      .sprite(this.spawnPoint.x, this.spawnPoint.y, SHEET_KEY, this.idleFrame("down"))
      // 原点を足元(下中央)にして、座標＝足の位置とする。
      .setOrigin(0.5, 1)
      .setScale(c.displayScale)
      .setDepth(20);
  }

  /** いま立っている場所をスタート位置にする（P キー）。 */
  private setStartHere(): void {
    this.spawnPoint = { x: Math.round(this.player.x), y: Math.round(this.player.y) };
    this.saveSpawn();
    this.redrawRects();
    this.showToast(`スタート位置を設定しました（x:${this.spawnPoint.x} y:${this.spawnPoint.y}）`);
  }

  private loadSpawn(): { x: number; y: number } {
    try {
      const raw = localStorage.getItem(SPAWN_KEY);
      if (raw) return JSON.parse(raw) as { x: number; y: number };
    } catch {
      /* 壊れていたら無視 */
    }
    return { x: SANDBOX.spawn.x, y: SANDBOX.spawn.y };
  }

  private saveSpawn(): void {
    try {
      localStorage.setItem(SPAWN_KEY, JSON.stringify(this.spawnPoint));
    } catch {
      /* 保存できなくても致命的ではない */
    }
  }

  private setupInput(): void {
    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = {
      up: [kb.addKey(K.W), kb.addKey(K.UP)],
      down: [kb.addKey(K.S), kb.addKey(K.DOWN)],
      left: [kb.addKey(K.A), kb.addKey(K.LEFT)],
      right: [kb.addKey(K.D), kb.addKey(K.RIGHT)],
    };

    // C: 編集モード切替 / E: 書き出し / X･Delete: 選択中を削除 / R: リセット
    // Phaser が同じ keydown を二重発火することがあるので、once() ガードで1回だけ実行する。
    kb.on("keydown-C", () => this.runOnce("toggle", () => this.toggleEditing()));
    kb.on("keydown-E", () => this.editing && this.runOnce("export", () => this.exportRects()));
    kb.on("keydown-X", () => this.editing && this.runOnce("del", () => this.deleteSelected()));
    kb.on("keydown-DELETE", () => this.editing && this.runOnce("del", () => this.deleteSelected()));
    kb.on("keydown-BACKSPACE", () => this.editing && this.runOnce("del", () => this.deleteSelected()));
    kb.on("keydown-R", () => this.editing && this.runOnce("reset", () => this.resetRects()));
    // P: いま立っている場所をスタート位置にする。
    kb.on("keydown-P", () => this.runOnce("spawn", () => this.setStartHere()));
    // H: 当たり判定の赤四角の表示／非表示を切り替える（本番の見た目を確認する）。
    kb.on("keydown-H", () => this.runOnce("show", () => this.toggleShowRects()));

    this.input.on(Phaser.Input.Events.POINTER_DOWN, this.onPointerDown, this);
    this.input.on(Phaser.Input.Events.POINTER_MOVE, this.onPointerMove, this);
    this.input.on(Phaser.Input.Events.POINTER_UP, this.onPointerUp, this);
  }

  // ---------------------------------------------------------------------------
  //  毎フレーム更新（移動・アニメ）
  // ---------------------------------------------------------------------------

  override update(_time: number, _delta: number): void {
    // Phaser の delta は実際の画面更新間隔とズレることがある（フレームレート変動時に
    // 速さが変わって見える原因）。代わりに実時刻(performance.now)から実経過を測り、
    // 実時間ベースで一定速度にする。
    const now = performance.now();
    const realDelta = this.lastFrameMs ? now - this.lastFrameMs : 0;
    this.lastFrameMs = now;

    if (this.editing) {
      // 編集中は移動を止め、立ち止まり表示にする。
      this.player.anims.stop();
      this.player.setFrame(this.idleFrame(this.facing));
      return;
    }
    this.updateStepping(realDelta);
  }

  /**
   * 同名アクションが直前（120ms以内）に実行されていたら無視して、fn を1回だけ実行する。
   * Phaser が同じ keydown を二重発火しても、二重実行を防ぐ。
   */
  private runOnce(name: string, fn: () => void): void {
    const now = this.time.now;
    if (now - (this.lastAction[name] ?? -1e9) < 120) return;
    this.lastAction[name] = now;
    fn();
  }

  private held(keys: Phaser.Input.Keyboard.Key[]): boolean {
    return keys.some((k) => k.isDown);
  }

  /**
   * マス目ステップ移動（RPGツクール風）。
   * 1歩＝48ドットだけ進んでマスにピタッと揃って止まる。キーを押し続けると連続で歩く。
   *
   * 速さを完全に一定に保つため、このフレームの実経過時間(delta)を歩に充て、
   * 1歩ぶんを使い切ったら「余った時間」を次の歩へ繰り越して同じフレーム内で続行する。
   * こうすると、歩き出しの最初の1フレームも即動き出し、毎歩の時間ロス（端数の切り捨て）も無くなる。
   */
  private updateStepping(delta: number): void {
    let remaining = delta;
    // 大きすぎる delta（タブ復帰直後など）で歩きすぎないよう、安全側に上限を設ける。
    if (remaining > 250) remaining = 250;

    while (remaining > 0) {
      // 歩いていなければ、次の1歩を始められるか判定する。始められなければ終了。
      if (!this.stepping && !this.tryStartStep()) return;

      this.stepElapsed += remaining;
      if (this.stepElapsed < this.stepTotal) {
        // まだ1歩の途中：割合で位置を補間する（速さは一定）。
        const t = this.stepElapsed / this.stepTotal;
        this.player.x = Phaser.Math.Linear(this.stepFrom.x, this.stepTo.x, t);
        this.player.y = Phaser.Math.Linear(this.stepFrom.y, this.stepTo.y, t);
        this.player.anims.play(walkKey(this.facing), true);
        return;
      }
      // 1歩ぶん到着：きっちりマスに合わせ、使い切れずに余った時間を次の歩へ繰り越す。
      this.player.x = this.stepTo.x;
      this.player.y = this.stepTo.y;
      remaining = this.stepElapsed - this.stepTotal;
      this.stepping = false;
    }
  }

  /** 次の1歩を開始する。歩き出せたら true、止まり（入力なし／壁）なら false。 */
  private tryStartStep(): boolean {
    let dx = 0;
    let dy = 0;
    if (this.held(this.keys.left)) dx -= 1;
    if (this.held(this.keys.right)) dx += 1;
    if (this.held(this.keys.up)) dy -= 1;
    if (this.held(this.keys.down)) dy += 1;

    if (dx === 0 && dy === 0) {
      this.player.anims.stop();
      this.player.setFrame(this.idleFrame(this.facing));
      return false;
    }

    // 斜め移動はしない：左右と上下が同時に押されたら左右を優先し、上下は無視する。
    if (dx !== 0) dy = 0;

    // 向き：左右が入っていれば左右、なければ上下。
    if (dx !== 0) this.facing = dx < 0 ? "left" : "right";
    else this.facing = dy < 0 ? "up" : "down";

    const tile = SANDBOX.character.stepTile;
    const tx = this.player.x + dx * tile;
    const ty = this.player.y + dy * tile;
    if (this.collides(tx, ty)) {
      // 壁にぶつかる：進まず、その場で向きだけ変える。
      this.player.anims.stop();
      this.player.setFrame(this.idleFrame(this.facing));
      return false;
    }

    this.stepFrom = { x: this.player.x, y: this.player.y };
    this.stepTo = { x: tx, y: ty };
    this.stepElapsed = 0;
    this.stepTotal = SANDBOX.character.stepMs;
    this.stepping = true;
    this.player.anims.play(walkKey(this.facing), true);
    return true;
  }

  /** 足元の当たり判定の四角（中央下＝(cx,cy)）。 */
  private playerBox(cx: number, cy: number): Phaser.Geom.Rectangle {
    const w = SANDBOX.character.hitboxWidth;
    const h = SANDBOX.character.hitboxHeight;
    return new Phaser.Geom.Rectangle(cx - w / 2, cy - h, w, h);
  }

  private collides(cx: number, cy: number): boolean {
    const box = this.playerBox(cx, cy);
    if (box.x < 0 || box.y < 0 || box.right > SANDBOX.viewWidth || box.bottom > SANDBOX.viewHeight) {
      return true;
    }
    for (const r of this.rects) {
      if (Phaser.Geom.Rectangle.Overlaps(box, new Phaser.Geom.Rectangle(r.x, r.y, r.width, r.height))) {
        return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  //  当たり判定エディタ
  // ---------------------------------------------------------------------------

  private toggleEditing(): void {
    this.editing = !this.editing;
    this.selectedIndex = -1;
    this.dragStart = null;
    this.moveOffset = null;
    this.redrawRects();
    this.updateInfoText();
    this.showToast(this.editing ? "編集モード ON" : "編集モード OFF（移動できます）");
  }

  /** 当たり判定の赤四角の表示／非表示を切り替える（本番の見た目チェック用）。 */
  private toggleShowRects(): void {
    this.showRects = !this.showRects;
    this.redrawRects();
    this.updateInfoText();
    this.showToast(
      this.showRects ? "当たり判定を表示" : "当たり判定を非表示（本番の見た目）",
    );
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.editing) return;
    const x = pointer.worldX;
    const y = pointer.worldY;
    // 既存の四角の上なら「選択して移動」、何も無ければ「新規ドラッグ」。
    const hit = this.findRectAt(x, y);
    if (hit >= 0) {
      this.selectedIndex = hit;
      const r = this.rects[hit];
      this.moveOffset = { dx: x - r.x, dy: y - r.y };
      this.dragStart = null;
    } else {
      this.selectedIndex = -1;
      this.moveOffset = null;
      this.dragStart = { x, y };
    }
    this.pointerNow = { x, y };
    this.redrawRects();
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.editing) return;
    this.pointerNow = { x: pointer.worldX, y: pointer.worldY };
    if (this.moveOffset && this.selectedIndex >= 0) {
      const r = this.rects[this.selectedIndex];
      r.x = Math.round(this.pointerNow.x - this.moveOffset.dx);
      r.y = Math.round(this.pointerNow.y - this.moveOffset.dy);
    }
    if (this.dragStart || this.moveOffset) this.redrawRects();
  }

  private onPointerUp(): void {
    if (!this.editing) return;
    if (this.dragStart) {
      const a = this.dragStart;
      const b = this.pointerNow;
      const x = Math.round(Math.min(a.x, b.x));
      const y = Math.round(Math.min(a.y, b.y));
      const width = Math.round(Math.abs(b.x - a.x));
      const height = Math.round(Math.abs(b.y - a.y));
      // 小さすぎるドラッグ（誤クリック）は無視。
      if (width >= 8 && height >= 8) {
        this.rects.push({ x, y, width, height });
        this.selectedIndex = this.rects.length - 1;
      }
    }
    this.dragStart = null;
    this.moveOffset = null;
    this.saveRects();
    this.redrawRects();
    this.updateInfoText();
  }

  /** 指定座標を含む四角のインデックス（上にあるものを優先）。 */
  private findRectAt(x: number, y: number): number {
    for (let i = this.rects.length - 1; i >= 0; i--) {
      const r = this.rects[i];
      if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) return i;
    }
    return -1;
  }

  private deleteSelected(): void {
    if (!this.editing || this.selectedIndex < 0) return;
    this.rects.splice(this.selectedIndex, 1);
    this.selectedIndex = -1;
    this.saveRects();
    this.redrawRects();
    this.updateInfoText();
    this.showToast("四角を削除しました");
  }

  private resetRects(): void {
    if (!this.editing) return;
    this.rects = SANDBOX.collisionRects.map((r) => ({ ...r }));
    this.selectedIndex = -1;
    this.saveRects();
    this.redrawRects();
    this.updateInfoText();
    this.showToast("設定ファイルの内容に戻しました");
  }

  private exportRects(): void {
    if (!this.editing) return;
    const lines = this.rects.map(
      (r) => `    { x: ${r.x}, y: ${r.y}, width: ${r.width}, height: ${r.height} },`,
    );
    const spawnLine = `  spawn: { x: ${this.spawnPoint.x}, y: ${this.spawnPoint.y} },`;
    const snippet = `${spawnLine}\n  collisionRects: [\n${lines.join("\n")}\n  ],`;
    // eslint-disable-next-line no-console
    console.log("[サンドボックス] walkSandbox.ts の spawn と collisionRects に貼り付けてください:\n" + snippet);
    const clip = navigator.clipboard;
    if (clip && typeof clip.writeText === "function") {
      void clip.writeText(snippet).then(
        () => this.showToast("コピーしました（コンソールにも出力）"),
        () => this.showToast("コンソールに出力しました"),
      );
    } else {
      this.showToast("コンソールに出力しました");
    }
  }

  private redrawRects(): void {
    const g = this.editorGfx;
    g.clear();

    // 編集中は必ず表示（描けないと困る）。それ以外は H キーの設定に従う。
    // 非表示のときは何も描かないので、本番と同じ見た目になる（当たり判定の効きは残る）。
    if (this.editing || this.showRects) {
      this.rects.forEach((r, i) => {
        const selected = i === this.selectedIndex;
        g.fillStyle(selected ? 0xffd24a : 0xe24a4a, this.editing ? 0.28 : 0.18);
        g.fillRect(r.x, r.y, r.width, r.height);
        g.lineStyle(2, selected ? 0xffd24a : 0xe24a4a, this.editing ? 0.95 : 0.5);
        g.strokeRect(r.x, r.y, r.width, r.height);
      });
    }

    // 新規ドラッグ中のプレビュー。
    if (this.editing && this.dragStart) {
      const a = this.dragStart;
      const b = this.pointerNow;
      g.lineStyle(2, 0x40c040, 1);
      g.fillStyle(0x40c040, 0.2);
      const x = Math.min(a.x, b.x);
      const y = Math.min(a.y, b.y);
      g.fillRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
      g.strokeRect(x, y, Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    }

    // 編集モード中はスタート位置（足元）に印を出す。
    if (this.editing) {
      const sx = this.spawnPoint.x;
      const sy = this.spawnPoint.y;
      g.fillStyle(0x40c0ff, 0.9);
      g.fillCircle(sx, sy, 7);
      g.lineStyle(2, 0xffffff, 0.9);
      g.strokeCircle(sx, sy, 7);
      g.lineBetween(sx, sy - 7, sx, sy - 28);
      g.fillTriangle(sx, sy - 28, sx, sy - 18, sx + 16, sy - 23);
    }
  }

  // --- 当たり判定の保存・読み込み（ブラウザのlocalStorage） ---

  private loadRects(): CollisionRect[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as CollisionRect[];
    } catch {
      /* 壊れていたら無視 */
    }
    return SANDBOX.collisionRects.map((r) => ({ ...r }));
  }

  private saveRects(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.rects));
    } catch {
      /* 保存できなくても致命的ではない */
    }
  }

  // ---------------------------------------------------------------------------
  //  画面の説明表示
  // ---------------------------------------------------------------------------

  private createHud(): void {
    this.infoText = this.add
      .text(16, 12, "", {
        fontFamily: '"Hiragino Maru Gothic ProN", sans-serif',
        fontSize: "18px",
        color: "#ffffff",
        backgroundColor: "rgba(0,0,0,0.55)",
        padding: { x: 10, y: 8 },
      })
      .setScrollFactor(0)
      .setDepth(100);
    this.updateInfoText();

    this.toastText = this.add
      .text(SANDBOX.viewWidth / 2, 36, "", {
        fontFamily: '"Hiragino Maru Gothic ProN", sans-serif',
        fontSize: "20px",
        color: "#ffd24a",
        backgroundColor: "rgba(0,0,0,0.7)",
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(110)
      .setAlpha(0);
  }

  private updateInfoText(): void {
    // 本番表示中（非編集モードで当たり判定を隠している）は、説明文も隠して本番の見た目にする。
    this.infoText.setVisible(this.editing || this.showRects);

    if (this.editing) {
      this.infoText.setText(
        [
          "【当たり判定エディタ】 四角の数: " + this.rects.length,
          "ドラッグ: 新しい四角を描く  /  四角をドラッグ: 移動",
          "X または Delete: 選択中を削除  /  R: 設定ファイルの内容に戻す",
          "E: 設定ファイルに貼れる形でコピー（スタート位置も含む）",
          "C: 編集モードを終了して歩く",
        ].join("\n"),
      );
    } else {
      this.infoText.setText(
        [
          "WASD / 矢印キー: 移動",
          "P: いまいる場所をスタート位置にする",
          "C: 当たり判定エディタを開く",
          `H: 当たり判定の表示／非表示（いま: ${this.showRects ? "表示" : "非表示=本番"}）`,
        ].join("\n"),
      );
    }
  }

  private showToast(msg: string): void {
    this.toastText.setText(msg).setAlpha(1);
    this.tweens.killTweensOf(this.toastText);
    this.tweens.add({
      targets: this.toastText,
      alpha: 0,
      delay: 1400,
      duration: 600,
    });
  }

  // ---------------------------------------------------------------------------
  //  仮素材の自動生成（本物の画像が無いとき）
  // ---------------------------------------------------------------------------

  /** 仮の背景（市松模様＋グリッド）。手描き背景を置けば差し替わる。 */
  private generatePlaceholderBackground(): void {
    const w = SANDBOX.viewWidth;
    const h = SANDBOX.viewHeight;
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const tile = 80;
    for (let y = 0; y < h; y += tile) {
      for (let x = 0; x < w; x += tile) {
        const even = ((x / tile) + (y / tile)) % 2 === 0;
        g.fillStyle(even ? 0x2b3550 : 0x232c44, 1);
        g.fillRect(x, y, tile, tile);
      }
    }
    g.lineStyle(1, 0x000000, 0.15);
    for (let x = 0; x <= w; x += tile) g.lineBetween(x, 0, x, h);
    for (let y = 0; y <= h; y += tile) g.lineBetween(0, y, w, y);
    g.generateTexture(BG_KEY, w, h);
    g.destroy();
  }

  /**
   * 仮の歩行キャラ（3列×4行）。本物のシートを置けば差し替わる。
   * 列で足の位置を変え、行（向き）で顔の位置を変えて、アニメと向きが分かるようにする。
   */
  private generatePlaceholderSheet(): void {
    const c = SANDBOX.character;
    const fw = c.frameWidth;
    const fh = c.frameHeight;
    const cols = c.columns;
    const rows = c.rows;
    const g = this.make.graphics({ x: 0, y: 0 }, false);

    for (let row = 0; row < rows; row++) {
      const dir = DIRS[row] ?? "down";
      for (let col = 0; col < cols; col++) {
        const ox = col * fw;
        const oy = row * fh;
        const cx = ox + fw / 2;

        // 影
        g.fillStyle(0x000000, 0.2);
        g.fillEllipse(cx, oy + fh - fh * 0.12, fw * 0.5, fh * 0.1);

        // 体
        g.fillStyle(0x4a90d9, 1);
        g.fillRoundedRect(ox + fw * 0.3, oy + fh * 0.35, fw * 0.4, fh * 0.4, 12);

        // 頭
        g.fillStyle(0xf4c89a, 1);
        g.fillCircle(cx, oy + fh * 0.3, fw * 0.16);

        // 顔の向き（小さな目印）
        g.fillStyle(0x223a55, 1);
        const eye = fw * 0.05;
        const ey = oy + fh * 0.28;
        switch (dir) {
          case "down":
            g.fillCircle(cx - fw * 0.06, ey, eye);
            g.fillCircle(cx + fw * 0.06, ey, eye);
            break;
          case "up":
            g.fillRect(cx - fw * 0.1, oy + fh * 0.18, fw * 0.2, eye);
            break;
          case "left":
            g.fillCircle(cx - fw * 0.08, ey, eye);
            break;
          case "right":
            g.fillCircle(cx + fw * 0.08, ey, eye);
            break;
        }

        // 脚（列で位置を変えて歩いて見せる）
        g.fillStyle(0x2c3e60, 1);
        const legY = oy + fh * 0.74;
        const legW = fw * 0.1;
        const legH = fh * 0.16;
        const swing = (col - 1) * fw * 0.08; // 0,1,2 → -,0,+
        g.fillRect(cx - fw * 0.15 - swing, legY, legW, legH);
        g.fillRect(cx + fw * 0.05 + swing, legY, legW, legH);
      }
    }

    g.generateTexture(SHEET_KEY, fw * cols, fh * rows);
    g.destroy();

    // 生成した1枚絵を、コマ番号でアクセスできるよう切り分ける。
    const tex = this.textures.get(SHEET_KEY);
    let i = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        tex.add(i, 0, col * fw, row * fh, fw, fh);
        i++;
      }
    }
  }
}
