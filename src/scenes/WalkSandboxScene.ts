import Phaser from "phaser";
import {
  SANDBOX,
  findMap,
  type MapData,
  type CollisionRect,
  type EventMarker,
  type EventTrigger,
  type EventChoice,
} from "@/data/walkSandbox";
import type { Direction } from "@/types";
import { preloadAssets, registerAnimations, makeWindow } from "@/systems/AssetLoader";
import { STAGE_1 } from "@/data/stageCatchables";
import { isStageCleared, getCaughtItems } from "@/systems/StageProgress";
import { openTuningPanel } from "@/ui/TuningPanel";

/** テクスチャ／アニメのキー。 */
const SHEET_KEY = "sandbox_character";
const BG_KEY = "sandbox_background";
const walkKey = (dir: Direction): string => `sandbox_walk_${dir}`;

// --- ブラウザ自動保存のキー。マップごとに分けて保存する（マップ id を末尾に付ける）。 ---
const collisionKey = (mapId: string): string => `tsurigee:sandbox:collision:v2:${mapId}`;
const spawnKey = (mapId: string): string => `tsurigee:sandbox:spawn:v2:${mapId}`;
const eventKey = (mapId: string): string => `tsurigee:sandbox:events:v2:${mapId}`;

// --- 旧バージョン（1マップ時代）の保存キー。初回だけ読み込んで引き継ぐ（データを消さないため）。 ---
const OLD_COLLISION_KEY = "tsurigee:sandbox:collision:v1";
const OLD_SPAWN_KEY = "tsurigee:sandbox:spawn:v1";
const OLD_EVENT_KEY = "tsurigee:sandbox:events:v1";

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
  /** いま表示しているマップ（背景・壁・スタート・イベントの入れ物）。 */
  private currentMap!: MapData;

  private player!: Phaser.GameObjects.Sprite;
  private facing: Direction = "down";
  /**
   * キャラの「論理的な足元位置」。当たり判定・イベント判定・マス揃えはすべてここを基準にする
   * （マスの中心に揃う）。キャラの絵は MZ 風に半マスぶん下げて描く（足がマスの底に立つ）。
   * 表示位置との同期は syncSprite() が行う。
   */
  private pos = { x: 0, y: 0 };
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

  // --- イベント配置エディタ用の状態（当たり判定エディタとは排他） ---
  private eventMode = false;
  private markers: EventMarker[] = [];
  private markerGfx!: Phaser.GameObjects.Graphics;
  /** マーカーの番号ラベル（描き直すたびに作り直す）。 */
  private markerLabels: Phaser.GameObjects.Text[] = [];
  private selectedMarkerIndex = -1;
  /** 選択中マーカーを移動中のときのカーソルとの相対位置。 */
  private markerMoveOffset: { dx: number; dy: number } | null = null;

  // --- イベント発動（サンプル：踏む＝自動 / 調べる＝スペースキー） ---
  /** 決定キー（調べる用 / メッセージを閉じる用）。 */
  private spaceKey!: Phaser.Input.Keyboard.Key;
  /** メッセージ表示中か（表示中は移動を止める）。 */
  private messageOpen = false;
  private messageBg?: Phaser.GameObjects.GameObject;
  private messageText?: Phaser.GameObjects.Text;
  /** いま踏んでいる地点（連続発動を防ぐ。離れたら -1 に戻す）。 */
  private lastSteppedMarker = -1;

  // --- 選択肢付きメッセージ（質問＋うん／いいや など） ---
  private choiceOpen = false;
  private choicePrompt = "";
  private choiceList: EventChoice[] = [];
  private choiceIndex = 0;
  private choiceBg?: Phaser.GameObjects.GameObject;
  private choicePromptText?: Phaser.GameObjects.Text;
  private choiceItemTexts: Phaser.GameObjects.Text[] = [];

  // --- 星に名付けた直後の「大きく名前を見せる」演出（閉じたら続けて説明メッセージを出す）。 ---
  private bigNameOpen = false;
  private bigNameNextMessage = "";
  private bigNameBg?: Phaser.GameObjects.GameObject;
  private bigNameText?: Phaser.GameObjects.Text;

  private infoText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;

  constructor() {
    super("WalkSandboxScene");
  }

  preload(): void {
    // 最初に開くマップを決める（以降の読み込みはこのマップを基準にする）。
    this.currentMap = findMap(SANDBOX, SANDBOX.startMapId);

    const c = SANDBOX.character;
    this.load.image(BG_KEY, this.currentMap.background.path);
    this.load.spritesheet(SHEET_KEY, c.path, {
      frameWidth: c.frameWidth,
      frameHeight: c.frameHeight,
    });
    // 登録済みの素材（メッセージ枠など）も読み込む。無ければ仮の見た目になる。
    preloadAssets(this);
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
    registerAnimations(this); // 登録済みの anime 素材があれば再生用に用意
    this.spawnPoint = this.loadSpawn();
    this.spawnPlayer();
    this.setupInput();

    this.rects = this.loadRects();
    this.editorGfx = this.add.graphics().setDepth(50);
    this.redrawRects();

    this.markers = this.loadMarkers();
    this.markerGfx = this.add.graphics().setDepth(60);
    this.drawMarkers();
    this.messageOpen = false;
    this.choiceOpen = false;
    this.lastSteppedMarker = -1;

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
    this.pos = { x: this.spawnPoint.x, y: this.spawnPoint.y };
    this.player = this.add
      .sprite(this.pos.x, this.pos.y + this.footOffsetY(), SHEET_KEY, this.idleFrame("down"))
      // 原点を足元(下中央)にして、座標＝足の位置とする。
      .setOrigin(0.5, 1)
      .setScale(c.displayScale)
      .setDepth(20);
  }

  /**
   * キャラの絵を下げる量（半マス＝24px）。
   * 論理足元(pos)はマスの中心のまま、見た目だけマスの底へ下げて RPGツクールMZ 風に立たせる。
   */
  private footOffsetY(): number {
    return SANDBOX.character.stepTile / 2;
  }

  /** 論理足元位置(pos)に合わせてキャラの絵を配置する（MZ風に半マス下げる）。 */
  private syncSprite(): void {
    this.player.setPosition(this.pos.x, this.pos.y + this.footOffsetY());
  }

  /** いま立っている場所をスタート位置にする（P キー）。 */
  private setStartHere(): void {
    // スタート位置もマス目の中心にそろえる。
    this.spawnPoint = {
      x: this.snapToTileCenter(this.pos.x),
      y: this.snapToTileCenter(this.pos.y),
    };
    this.saveSpawn();
    this.redrawRects();
    this.showToast(`スタート位置を設定しました（x:${this.spawnPoint.x} y:${this.spawnPoint.y}）`);
  }

  private loadSpawn(): { x: number; y: number } {
    let p = { x: this.currentMap.spawn.x, y: this.currentMap.spawn.y };
    try {
      // このマップ専用の保存 → 無ければ旧バージョンの保存 → それも無ければ設定ファイル。
      const raw = localStorage.getItem(spawnKey(this.currentMap.id)) ?? localStorage.getItem(OLD_SPAWN_KEY);
      if (raw) p = JSON.parse(raw) as { x: number; y: number };
    } catch {
      /* 壊れていたら無視 */
    }
    // スタート位置もマス目の中心にそろえる（壁・イベント・歩く位置を同じマス目に合わせる）。
    return { x: this.snapToTileCenter(p.x), y: this.snapToTileCenter(p.y) };
  }

  private saveSpawn(): void {
    try {
      localStorage.setItem(spawnKey(this.currentMap.id), JSON.stringify(this.spawnPoint));
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

    // C: 当たり判定エディタ切替 / V: イベント配置エディタ切替（両者は排他）。
    // E･X･Delete はいま開いているエディタに応じて動作を切り替える。
    // Phaser が同じ keydown を二重発火することがあるので、once() ガードで1回だけ実行する。
    kb.on("keydown-C", () => this.runOnce("toggle", () => this.toggleEditing()));
    kb.on("keydown-V", () => this.runOnce("toggleEvent", () => this.toggleEventMode()));
    kb.on("keydown-T", () => this.eventMode && this.runOnce("trigger", () => this.cycleTrigger()));
    kb.on("keydown-E", () => this.runOnce("export", () => this.onExportKey()));
    kb.on("keydown-X", () => this.runOnce("del", () => this.onDeleteKey()));
    kb.on("keydown-DELETE", () => this.runOnce("del", () => this.onDeleteKey()));
    kb.on("keydown-BACKSPACE", () => this.runOnce("del", () => this.onDeleteKey()));
    kb.on("keydown-R", () =>
      this.runOnce("reset", () => {
        if (this.editing) this.resetRects();
        else if (this.eventMode) this.resetMarkers();
      }),
    );
    // P: いま立っている場所をスタート位置にする。
    kb.on("keydown-P", () => this.runOnce("spawn", () => this.setStartHere()));
    // H: 当たり判定の赤四角の表示／非表示を切り替える（本番の見た目を確認する）。
    kb.on("keydown-H", () => this.runOnce("show", () => this.toggleShowRects()));
    // G: 釣りの調整パネル（確率・秒数・メーターを手で変える）。
    kb.on("keydown-G", () => this.runOnce("tuning", () => openTuningPanel(this)));

    // スペース：調べるイベントの発動／メッセージを閉じる。
    this.spaceKey = kb.addKey(K.SPACE);

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

    // 選択肢表示中は止める。上下で選び、スペースで決定。
    if (this.choiceOpen) {
      this.player.anims.stop();
      this.player.setFrame(this.idleFrame(this.facing));
      const n = this.choiceList.length;
      if (n > 0) {
        if (this.anyJustDown(this.keys.up)) {
          this.choiceIndex = (this.choiceIndex - 1 + n) % n;
          this.drawChoice();
        }
        if (this.anyJustDown(this.keys.down)) {
          this.choiceIndex = (this.choiceIndex + 1) % n;
          this.drawChoice();
        }
        if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) this.confirmChoice();
      }
      return;
    }

    // 大きな名前表示中は止める。スペースで閉じて、続きの説明メッセージへ。
    if (this.bigNameOpen) {
      this.player.anims.stop();
      this.player.setFrame(this.idleFrame(this.facing));
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) this.closeBigNameReveal();
      return;
    }

    // メッセージ表示中は止める。スペースで閉じる。
    if (this.messageOpen) {
      this.player.anims.stop();
      this.player.setFrame(this.idleFrame(this.facing));
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) this.closeMessage();
      return;
    }

    if (this.editing || this.eventMode) {
      // エディタ中は移動を止め、立ち止まり表示にする。
      this.player.anims.stop();
      this.player.setFrame(this.idleFrame(this.facing));
      return;
    }
    this.updateStepping(realDelta);

    // 踏むイベント：地点に乗ったら自動発動。調べるイベント：スペースで発動。
    this.checkStepEvents();
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey)) this.checkExamineEvents();
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
        this.pos.x = Phaser.Math.Linear(this.stepFrom.x, this.stepTo.x, t);
        this.pos.y = Phaser.Math.Linear(this.stepFrom.y, this.stepTo.y, t);
        this.syncSprite();
        this.player.anims.play(walkKey(this.facing), true);
        return;
      }
      // 1歩ぶん到着：きっちりマスに合わせ、使い切れずに余った時間を次の歩へ繰り越す。
      this.pos.x = this.stepTo.x;
      this.pos.y = this.stepTo.y;
      this.syncSprite();
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
    const tx = this.pos.x + dx * tile;
    const ty = this.pos.y + dy * tile;
    if (this.collides(tx, ty)) {
      // 壁にぶつかる：進まず、その場で向きだけ変える。
      this.player.anims.stop();
      this.player.setFrame(this.idleFrame(this.facing));
      return false;
    }

    this.stepFrom = { x: this.pos.x, y: this.pos.y };
    this.stepTo = { x: tx, y: ty };
    this.stepElapsed = 0;
    this.stepTotal = SANDBOX.character.stepMs;
    this.stepping = true;
    this.player.anims.play(walkKey(this.facing), true);
    return true;
  }

  /** 足元の当たり判定の四角（中央下＝(cx,cy)）。 */
  private playerBox(cx: number, cy: number): Phaser.Geom.Rectangle {
    // ツクールMZと同じ「足元の1マス」単位の判定。中心(cx,cy)を覆う 1マス四方。
    // 隣のマスと辺が接しても通り抜けられるよう、ほんの少し内側に縮める。
    const t = SANDBOX.character.stepTile;
    const inset = 2;
    const s = t - inset * 2;
    return new Phaser.Geom.Rectangle(cx - s / 2, cy - s / 2, s, s);
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
    // 当たり判定エディタとイベント配置エディタは同時に使わない。
    if (this.editing && this.eventMode) {
      this.eventMode = false;
      this.drawMarkers();
    }
    this.selectedIndex = -1;
    this.dragStart = null;
    this.moveOffset = null;
    this.redrawRects();
    this.updateInfoText();
    this.showToast(this.editing ? "当たり判定エディタ ON" : "当たり判定エディタ OFF（移動できます）");
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
    if (this.eventMode) {
      this.onMarkerPointerDown(pointer.worldX, pointer.worldY);
      return;
    }
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
    if (this.eventMode) {
      if (this.markerMoveOffset && this.selectedMarkerIndex >= 0) {
        // ドラッグ中も、カーソルがあるマスの中心に揃えて動かす（マス単位で配置）。
        const m = this.markers[this.selectedMarkerIndex];
        m.x = this.snapToTileCenter(pointer.worldX);
        m.y = this.snapToTileCenter(pointer.worldY);
        this.drawMarkers();
      }
      return;
    }
    if (!this.editing) return;
    this.pointerNow = { x: pointer.worldX, y: pointer.worldY };
    if (this.moveOffset && this.selectedIndex >= 0) {
      // 移動もマス単位：左上をマスの境目に揃える。
      const r = this.rects[this.selectedIndex];
      r.x = this.tileEdge(this.pointerNow.x - this.moveOffset.dx, "round");
      r.y = this.tileEdge(this.pointerNow.y - this.moveOffset.dy, "round");
    }
    if (this.dragStart || this.moveOffset) this.redrawRects();
  }

  private onPointerUp(): void {
    if (this.eventMode) {
      if (this.markerMoveOffset) {
        this.markerMoveOffset = null;
        this.saveMarkers();
        this.drawMarkers();
        this.updateInfoText();
      }
      return;
    }
    if (!this.editing) return;
    if (this.dragStart) {
      // ドラッグ範囲をマス目にそろえた四角にする（クリックだけなら1マス）。
      const rect = this.tileRect(this.dragStart.x, this.dragStart.y, this.pointerNow.x, this.pointerNow.y);
      this.rects.push(rect);
      this.selectedIndex = this.rects.length - 1;
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
    this.rects = this.currentMap.collisionRects.map((r) => ({ ...r }));
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

    // 編集中はマス目（グリッド）を薄く描く（画面の端から48ドット刻み）。
    if (this.editing) {
      const t = SANDBOX.character.stepTile;
      const w = SANDBOX.viewWidth;
      const h = SANDBOX.viewHeight;
      g.lineStyle(1, 0xffffff, 0.18);
      for (let x = 0; x <= w; x += t) g.lineBetween(x, 0, x, h);
      for (let y = 0; y <= h; y += t) g.lineBetween(0, y, w, y);
    }

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

    // 新規ドラッグ中のプレビュー（マス目にそろえた形で見せる）。
    if (this.editing && this.dragStart) {
      const r = this.tileRect(this.dragStart.x, this.dragStart.y, this.pointerNow.x, this.pointerNow.y);
      g.lineStyle(2, 0x40c040, 1);
      g.fillStyle(0x40c040, 0.2);
      g.fillRect(r.x, r.y, r.width, r.height);
      g.strokeRect(r.x, r.y, r.width, r.height);
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
      // このマップ専用の保存 → 無ければ旧バージョンの保存 → それも無ければ設定ファイル。
      const raw = localStorage.getItem(collisionKey(this.currentMap.id)) ?? localStorage.getItem(OLD_COLLISION_KEY);
      if (raw) return JSON.parse(raw) as CollisionRect[];
    } catch {
      /* 壊れていたら無視 */
    }
    return this.currentMap.collisionRects.map((r) => ({ ...r }));
  }

  private saveRects(): void {
    try {
      localStorage.setItem(collisionKey(this.currentMap.id), JSON.stringify(this.rects));
    } catch {
      /* 保存できなくても致命的ではない */
    }
  }

  // ---------------------------------------------------------------------------
  //  イベント配置エディタ（点でクリックして地点を置く）
  // ---------------------------------------------------------------------------

  /** E キー：いま開いているエディタに応じて書き出す。 */
  private onExportKey(): void {
    if (this.editing) this.exportRects();
    else if (this.eventMode) this.exportMarkers();
  }

  /** X / Delete キー：いま開いているエディタに応じて選択中を削除する。 */
  private onDeleteKey(): void {
    if (this.editing) this.deleteSelected();
    else if (this.eventMode) this.deleteSelectedMarker();
  }

  private toggleEventMode(): void {
    this.eventMode = !this.eventMode;
    // 当たり判定エディタとイベント配置エディタは同時に使わない。
    if (this.eventMode && this.editing) {
      this.editing = false;
      this.redrawRects();
    }
    this.selectedMarkerIndex = -1;
    this.markerMoveOffset = null;
    this.drawMarkers();
    this.updateInfoText();
    this.showToast(
      this.eventMode ? "イベント配置モード ON" : "イベント配置モード OFF（移動できます）",
    );
  }

  /** 地点の上なら選択して移動、何も無ければその場所に新しい地点を置く。 */
  private onMarkerPointerDown(x: number, y: number): void {
    const hit = this.findMarkerAt(x, y);
    if (hit >= 0) {
      this.selectedMarkerIndex = hit;
      const m = this.markers[hit];
      this.markerMoveOffset = { dx: x - m.x, dy: y - m.y };
    } else {
      // 新規地点。クリックしたマスの中心に揃えて置く。きっかけの初期値は「調べる」。
      const sx = this.snapToTileCenter(x);
      const sy = this.snapToTileCenter(y);
      this.markers.push({ x: sx, y: sy, trigger: "examine" });
      this.selectedMarkerIndex = this.markers.length - 1;
      this.markerMoveOffset = { dx: 0, dy: 0 };
      this.saveMarkers();
    }
    this.drawMarkers();
    this.updateInfoText();
  }

  /** 指定座標の近く（半径16px）にある地点のインデックス（上にあるものを優先）。 */
  private findMarkerAt(x: number, y: number): number {
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      if (Phaser.Math.Distance.Between(x, y, m.x, m.y) <= 16) return i;
    }
    return -1;
  }

  /**
   * 値をマス目の中心（24, 72, 120, …）に揃える。
   * 画面(0,0)を基準にした「絶対マス目」なので、壁・イベント・歩く位置が全部そろう。
   */
  private snapToTileCenter(value: number): number {
    const t = SANDBOX.character.stepTile;
    const half = t / 2;
    return Math.round((value - half) / t) * t + half;
  }

  /**
   * 値を「マスの境目（0, 48, 96, …）」に揃える。floor=切り下げ / ceil=切り上げ / round=最寄り。
   * 当たり判定の四角の端をマス目にそろえるのに使う。
   */
  private tileEdge(value: number, mode: "floor" | "ceil" | "round"): number {
    const t = SANDBOX.character.stepTile;
    const k = value / t;
    const n = mode === "floor" ? Math.floor(k) : mode === "ceil" ? Math.ceil(k) : Math.round(k);
    return n * t;
  }

  /** ドラッグした2点を囲む「マス目にそろった四角」を作る（最低1マス）。 */
  private tileRect(ax: number, ay: number, bx: number, by: number): CollisionRect {
    const t = SANDBOX.character.stepTile;
    const x = this.tileEdge(Math.min(ax, bx), "floor");
    let right = this.tileEdge(Math.max(ax, bx), "ceil");
    if (right - x < t) right = x + t;
    const y = this.tileEdge(Math.min(ay, by), "floor");
    let bottom = this.tileEdge(Math.max(ay, by), "ceil");
    if (bottom - y < t) bottom = y + t;
    return { x, y, width: right - x, height: bottom - y };
  }

  /** 選択中の地点のきっかけを 調べる⇄踏む で切り替える（T キー）。 */
  private cycleTrigger(): void {
    if (this.selectedMarkerIndex < 0) {
      this.showToast("先に地点をクリックして選んでください");
      return;
    }
    const m = this.markers[this.selectedMarkerIndex];
    m.trigger = m.trigger === "examine" ? "step" : "examine";
    this.saveMarkers();
    this.drawMarkers();
    this.updateInfoText();
    this.showToast(`${this.selectedMarkerIndex + 1}番のきっかけ: ${this.triggerLabel(m.trigger)}`);
  }

  private triggerLabel(t: EventTrigger): string {
    return t === "examine" ? "調べる" : "踏む";
  }

  /** 番号を丸数字に（①〜⑳、それ以上は (21) のように）。 */
  private circledNumber(n: number): string {
    const circled = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";
    return n >= 1 && n <= circled.length ? circled[n - 1] : `(${n})`;
  }

  private deleteSelectedMarker(): void {
    if (this.selectedMarkerIndex < 0) return;
    this.markers.splice(this.selectedMarkerIndex, 1);
    this.selectedMarkerIndex = -1;
    this.markerMoveOffset = null;
    this.saveMarkers();
    this.drawMarkers();
    this.updateInfoText();
    this.showToast("地点を削除しました");
  }

  private exportMarkers(): void {
    if (this.markers.length === 0) {
      this.showToast("まだ地点がありません");
      return;
    }
    const lines = this.markers.map(
      (m, i) =>
        `    { x: ${m.x}, y: ${m.y}, trigger: "${m.trigger}" }, // ${this.circledNumber(i + 1)} ${this.triggerLabel(m.trigger)}`,
    );
    const snippet = `  eventMarkers: [\n${lines.join("\n")}\n  ],`;
    // eslint-disable-next-line no-console
    console.log(
      "[サンドボックス] イベント地点。walkSandbox.ts の eventMarkers に貼り付け、各番号の内容を私に伝えてください:\n" +
        snippet,
    );
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

  private drawMarkers(): void {
    const g = this.markerGfx;
    g.clear();
    // 番号ラベルは作り直す。
    this.markerLabels.forEach((t) => t.destroy());
    this.markerLabels = [];

    // イベント配置モード中だけ表示する（本番の見た目には出さない）。
    if (!this.eventMode) return;

    const t = SANDBOX.character.stepTile;
    const w = SANDBOX.viewWidth;
    const h = SANDBOX.viewHeight;

    // --- マス目（グリッド）を薄く描く（画面の端から48ドット刻み）。 ---
    const half = t / 2;
    g.lineStyle(1, 0xffffff, 0.18);
    for (let x = 0; x <= w; x += t) g.lineBetween(x, 0, x, h);
    for (let y = 0; y <= h; y += t) g.lineBetween(0, y, w, y);

    // --- 各イベントを「マス（48×48）」として描く。番号は中央。 ---
    this.markers.forEach((m, i) => {
      const selected = i === this.selectedMarkerIndex;
      // 調べる=黄 / 踏む=水色。
      const color = m.trigger === "examine" ? 0xffd24a : 0x40c0ff;
      g.fillStyle(color, 0.35);
      g.fillRect(m.x - half, m.y - half, t, t);
      g.lineStyle(selected ? 4 : 2, selected ? 0xffffff : 0x000000, 0.9);
      g.strokeRect(m.x - half, m.y - half, t, t);

      const label = this.add
        .text(m.x, m.y, String(i + 1), {
          fontFamily: '"Hiragino Maru Gothic ProN", sans-serif',
          fontSize: "20px",
          color: "#1a1a1a",
          fontStyle: "bold",
        })
        .setOrigin(0.5)
        .setDepth(61);
      this.markerLabels.push(label);
    });
  }

  private loadMarkers(): EventMarker[] {
    try {
      // このマップ専用の保存 → 無ければ旧バージョンの保存 → それも無ければ設定ファイル。
      const raw = localStorage.getItem(eventKey(this.currentMap.id)) ?? localStorage.getItem(OLD_EVENT_KEY);
      if (raw) return this.mergeSavedMarkersWithConfig(JSON.parse(raw) as EventMarker[]);
    } catch {
      /* 壊れていたら無視 */
    }
    return this.cloneConfigMarkers();
  }

  /**
   * 保存された地点（位置・きっかけ＝ゲーム内のVキーエディタで置いた内容）に、
   * 設定ファイル側の中身（kind/message/prompt/choices）を重ねる。
   * これらの中身はゲーム内エディタでは編集できず、私（Claude）が設定ファイルに書く部分なので、
   * 位置だけ先に保存されたあとで中身を追加・変更しても、次回起動時に自動で反映されるようにする
   * （番号＝配列の並び順で対応付け）。
   */
  private mergeSavedMarkersWithConfig(saved: EventMarker[]): EventMarker[] {
    const configMarkers = this.currentMap.eventMarkers;
    return saved.map((m, i) => {
      const cfg = configMarkers[i];
      if (!cfg) return m;
      return {
        x: m.x,
        y: m.y,
        trigger: m.trigger,
        kind: cfg.kind,
        message: cfg.message,
        prompt: cfg.prompt,
        choices: cfg.choices ? (JSON.parse(JSON.stringify(cfg.choices)) as EventChoice[]) : undefined,
      };
    });
  }

  /** 設定ファイルの「このマップ」のイベント地点を丸ごと複製する（choices 配列まで深くコピー）。 */
  private cloneConfigMarkers(): EventMarker[] {
    return this.currentMap.eventMarkers.map((m) => JSON.parse(JSON.stringify(m)) as EventMarker);
  }

  /** 設定ファイルの内容に戻す（質問・選択肢などの本実装を反映するときに使う）。 */
  private resetMarkers(): void {
    this.markers = this.cloneConfigMarkers();
    this.selectedMarkerIndex = -1;
    this.markerMoveOffset = null;
    this.saveMarkers();
    this.drawMarkers();
    this.updateInfoText();
    this.showToast("設定ファイルの内容に戻しました");
  }

  private saveMarkers(): void {
    try {
      localStorage.setItem(eventKey(this.currentMap.id), JSON.stringify(this.markers));
    } catch {
      /* 保存できなくても致命的ではない */
    }
  }

  // ---------------------------------------------------------------------------
  //  イベント発動（サンプル：踏む＝自動 / 調べる＝スペースキー）
  // ---------------------------------------------------------------------------

  /** 足元が「踏む」地点に乗ったら発動。乗り続けている間は再発動しない。 */
  private checkStepEvents(): void {
    let on = -1;
    this.markers.forEach((m, i) => {
      if (m.trigger !== "step") return;
      if (Phaser.Math.Distance.Between(this.pos.x, this.pos.y, m.x, m.y) <= 24) on = i;
    });
    if (on >= 0 && on !== this.lastSteppedMarker) {
      this.lastSteppedMarker = on;
      this.fireEvent(on);
    } else if (on < 0) {
      // どの地点からも離れた：次に乗ったときまた発動できるようにする。
      this.lastSteppedMarker = -1;
    }
  }

  /** 正面（または足元の近く）の「調べる」地点を発動する。 */
  private checkExamineEvents(): void {
    const reach = SANDBOX.character.stepTile; // 正面1マスぶん
    const fx =
      this.pos.x + (this.facing === "left" ? -reach : this.facing === "right" ? reach : 0);
    const fy =
      this.pos.y + (this.facing === "up" ? -reach : this.facing === "down" ? reach : 0);
    let best = -1;
    let bestDist = Infinity;
    this.markers.forEach((m, i) => {
      if (m.trigger !== "examine") return;
      // 正面の点か足元か、近い方で判定（多少アバウトでも拾えるように）。
      const d = Math.min(
        Phaser.Math.Distance.Between(fx, fy, m.x, m.y),
        Phaser.Math.Distance.Between(this.pos.x, this.pos.y, m.x, m.y),
      );
      if (d <= 40 && d < bestDist) {
        best = i;
        bestDist = d;
      }
    });
    if (best >= 0) this.fireEvent(best);
  }

  /** 地点の中身を表示する。kind があれば専用処理、choices があれば選択肢、message があればそれ、無ければ仮文。 */
  private fireEvent(index: number): void {
    const m = this.markers[index];
    if (m.kind === "rocket") {
      this.fireRocketEvent(m);
      return;
    }
    if (m.choices && m.choices.length > 0) {
      this.openChoice(m);
      return;
    }
    const num = this.circledNumber(index + 1);
    const text =
      m.message ??
      `${num} のイベント（${this.triggerLabel(m.trigger)}）が発動しました。\n` +
        "（ここに出す内容は、あなたが教えてくれた中身に差し替えます）";
    this.openMessage(text);
  }

  /**
   * ロケットを調べたときの反応。いつでも図鑑を見られる。
   * ステージ1の探索が終わっていれば「名前をつけて出発する」も選べる。
   */
  private fireRocketEvent(m: EventMarker): void {
    const cleared = isStageCleared(STAGE_1.id);
    const choices: EventChoice[] = [{ label: "図鑑を見る", action: "viewEncyclopedia" }];
    if (cleared) {
      choices.push({ label: "この星に名前をつけて出発する", action: "nameStarAndDepart" });
    }
    choices.push({ label: "やめておく" });

    this.openChoice({
      ...m,
      prompt: cleared ? "ロケットだ。どうする？" : "ロケットだ。この星のものを、まだ全部は見つけていないようだ。どうする？",
      choices,
    });
  }

  /** 発見済みは名前とフレーバー、未発見は？？？にした図鑑のテキストを組み立てる。 */
  private buildEncyclopediaText(): string {
    const caughtIds = getCaughtItems(STAGE_1.id);
    const lines = STAGE_1.items
      .slice()
      .sort((a, b) => a.encyclopediaNumber - b.encyclopediaNumber)
      .map((item) =>
        caughtIds.has(item.id) ? `${item.encyclopediaNumber}. ${item.name}\n　　${item.description}` : `${item.encyclopediaNumber}. ？？？`,
      );
    return `${STAGE_1.locationLabel} の図鑑（${caughtIds.size} / ${STAGE_1.items.length}）\n\n${lines.join("\n\n")}`;
  }

  private anyJustDown(keys: Phaser.Input.Keyboard.Key[]): boolean {
    let hit = false;
    // 全キーを評価して JustDown を消費する（途中で打ち切らない）。
    for (const k of keys) if (Phaser.Input.Keyboard.JustDown(k)) hit = true;
    return hit;
  }

  private openChoice(m: EventMarker): void {
    this.choiceOpen = true;
    this.choicePrompt = m.prompt ?? "";
    this.choiceList = m.choices ?? [];
    this.choiceIndex = 0;
    this.player.anims.stop();
    this.player.setFrame(this.idleFrame(this.facing));
    this.drawChoice();
    this.showToast("↑↓で選んで スペースで決定");
  }

  private drawChoice(): void {
    this.choiceBg?.destroy();
    this.choicePromptText?.destroy();
    this.choiceItemTexts.forEach((t) => t.destroy());
    this.choiceItemTexts = [];

    const w = SANDBOX.viewWidth;
    const h = SANDBOX.viewHeight;
    const boxH = 200;
    const top = h - boxH - 24;
    this.choiceBg = makeWindow(this, w / 2, top + boxH / 2, w - 80, boxH)
      .setScrollFactor(0)
      .setDepth(200);
    this.choicePromptText = this.add
      .text(60, top + 22, this.choicePrompt, {
        fontFamily: '"Hiragino Maru Gothic ProN", sans-serif',
        fontSize: "26px",
        color: "#ffffff",
      })
      .setScrollFactor(0)
      .setDepth(201);
    this.choiceList.forEach((c, i) => {
      const selected = i === this.choiceIndex;
      const t = this.add
        .text(96, top + 78 + i * 40, `${selected ? "▶ " : "　"}${c.label}`, {
          fontFamily: '"Hiragino Maru Gothic ProN", sans-serif',
          fontSize: "24px",
          color: selected ? "#ffd24a" : "#ffffff",
        })
        .setScrollFactor(0)
        .setDepth(201);
      this.choiceItemTexts.push(t);
    });
  }

  private confirmChoice(): void {
    const choice = this.choiceList[this.choiceIndex];
    this.closeChoice();
    if (choice?.action === "startFishing") {
      this.scene.start("SandboxFishingScene");
      return;
    }
    if (choice?.action === "viewEncyclopedia") {
      this.openEncyclopediaMessage(this.buildEncyclopediaText());
      return;
    }
    if (choice?.action === "nameStarAndDepart") {
      // 星の名前は自由形式で入力してもらう（まずはブラウザ標準の入力ダイアログで実装。
      // ゲーム内蔵の入力欄にしたくなったら、この中身だけ差し替えればよい）。
      const input = window.prompt(`${STAGE_1.locationLabel} に、どんな名前をつけますか？`, "")?.trim();
      if (input) {
        this.openBigNameReveal(
          input,
          `${STAGE_1.locationLabel} に「${input}」と名付けた。\n\n` + "（つぎの星へ出発する演出は、まだこれからです）",
        );
      } else {
        this.openMessage("名前をつけるのをやめた。");
      }
      return;
    }
    if (choice?.reply) this.openMessage(choice.reply);
  }

  private closeChoice(): void {
    this.choiceOpen = false;
    this.choiceBg?.destroy();
    this.choicePromptText?.destroy();
    this.choiceItemTexts.forEach((t) => t.destroy());
    this.choiceBg = undefined;
    this.choicePromptText = undefined;
    this.choiceItemTexts = [];
  }

  /**
   * 名付けた直後に、その名前だけを画面いっぱいに大きく見せる演出。
   * スペースキーで閉じると、続けて nextMessage を通常のメッセージ枠で表示する。
   */
  private openBigNameReveal(name: string, nextMessage: string): void {
    this.bigNameOpen = true;
    this.bigNameNextMessage = nextMessage;
    this.player.anims.stop();
    this.player.setFrame(this.idleFrame(this.facing));

    const w = SANDBOX.viewWidth;
    const h = SANDBOX.viewHeight;
    this.bigNameBg = this.add
      .rectangle(w / 2, h / 2, w, h, 0x000000, 0.75)
      .setScrollFactor(0)
      .setDepth(300);
    this.bigNameText = this.add
      .text(w / 2, h / 2, name, {
        fontFamily: '"Hiragino Maru Gothic ProN", sans-serif',
        fontSize: "88px",
        fontStyle: "bold",
        color: "#ffd24a",
        align: "center",
        wordWrap: { width: w - 160 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(301);
    this.showToast("スペースキーで次へ");
  }

  private closeBigNameReveal(): void {
    this.bigNameOpen = false;
    this.bigNameBg?.destroy();
    this.bigNameText?.destroy();
    this.bigNameBg = undefined;
    this.bigNameText = undefined;
    const next = this.bigNameNextMessage;
    this.bigNameNextMessage = "";
    this.openMessage(next);
  }

  private openMessage(text: string): void {
    this.messageOpen = true;
    this.player.anims.stop();
    this.player.setFrame(this.idleFrame(this.facing));

    const w = SANDBOX.viewWidth;
    const h = SANDBOX.viewHeight;
    const boxH = 160;
    const top = h - boxH - 24;
    this.messageBg = makeWindow(this, w / 2, top + boxH / 2, w - 80, boxH)
      .setScrollFactor(0)
      .setDepth(200);
    this.messageText = this.add
      .text(60, top + 22, text, {
        fontFamily: '"Hiragino Maru Gothic ProN", sans-serif',
        fontSize: "24px",
        color: "#ffffff",
        wordWrap: { width: w - 140 },
        lineSpacing: 6,
      })
      .setScrollFactor(0)
      .setDepth(201);
    this.showToast("スペースキーで閉じる");
  }

  /** 図鑑のように長い文章向けの大きなメッセージ枠（枠・フィールドは openMessage と共通）。 */
  private openEncyclopediaMessage(text: string): void {
    this.messageOpen = true;
    this.player.anims.stop();
    this.player.setFrame(this.idleFrame(this.facing));

    const w = SANDBOX.viewWidth;
    const h = SANDBOX.viewHeight;
    const boxH = h - 120;
    const top = 60;
    this.messageBg = makeWindow(this, w / 2, top + boxH / 2, w - 160, boxH)
      .setScrollFactor(0)
      .setDepth(200);
    this.messageText = this.add
      .text(100, top + 30, text, {
        fontFamily: '"Hiragino Maru Gothic ProN", sans-serif',
        fontSize: "20px",
        color: "#ffffff",
        wordWrap: { width: w - 260 },
        lineSpacing: 8,
      })
      .setScrollFactor(0)
      .setDepth(201);
    this.showToast("スペースキーで閉じる");
  }

  private closeMessage(): void {
    this.messageOpen = false;
    this.messageBg?.destroy();
    this.messageText?.destroy();
    this.messageBg = undefined;
    this.messageText = undefined;
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
    // 本番表示中（どのエディタも開かず当たり判定を隠している）は、説明文も隠して本番の見た目にする。
    this.infoText.setVisible(this.editing || this.eventMode || this.showRects);

    if (this.eventMode) {
      const sel =
        this.selectedMarkerIndex >= 0 ? `（選択中: ${this.selectedMarkerIndex + 1}番）` : "";
      this.infoText.setText(
        [
          `【イベント配置モード】 地点の数: ${this.markers.length} ${sel}`,
          "クリック: そのマスにイベントを置く（マス目に揃う・①②③…と番号）",
          "地点をドラッグ: マス単位で動かす",
          "T: 選んだ地点のきっかけを切替（調べる⇄踏む / 黄=調べる・水色=踏む）",
          "X または Delete: 選択中の地点を削除",
          "R: 設定ファイルの内容に戻す（私が入れた中身を反映）",
          "E: 番号・座標・きっかけをコピー（私に渡す）",
          "V: イベント配置モードを終了して歩く",
        ].join("\n"),
      );
    } else if (this.editing) {
      this.infoText.setText(
        [
          "【当たり判定エディタ】 壁の数: " + this.rects.length,
          "ドラッグ: マス目で壁を描く（クリックで1マス）  /  壁をドラッグ: マス単位で移動",
          "X または Delete: 選択中を削除  /  R: 設定ファイルの内容に戻す",
          "E: 設定ファイルに貼れる形でコピー（スタート位置も含む）",
          "C: 編集モードを終了して歩く",
        ].join("\n"),
      );
    } else {
      this.infoText.setText(
        [
          `マップ: ${this.currentMap.name}`,
          "WASD / 矢印キー: 移動  /  スペース: 目の前を調べる",
          "P: いまいる場所をスタート位置にする",
          "C: 当たり判定エディタを開く  /  V: イベント配置エディタを開く",
          "G: 釣り調整パネルを開く（確率・秒数・メーター）",
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
