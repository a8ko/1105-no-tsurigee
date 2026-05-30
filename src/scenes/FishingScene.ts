import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, SceneKeys, Depth, Palette, TextColor } from "@/config/constants";
import { getDifficultyConfig } from "@/data/difficulty";
import { Difficulty } from "@/types";
import { Catalog } from "@/systems/Catalog";
import { gameState } from "@/systems/GameState";
import { getMap } from "@/data/maps";
import { createMeterGame } from "@/systems/meter/createMeterGame";
import { FLOAT_KEY, playerTextureKey } from "@/scenes/BootScene";
import { makeText, makePanel } from "@/ui/uiHelpers";
import { GameScene } from "@/scenes/GameScene";
import type { MeterGame } from "@/systems/meter/MeterGame";
import type { Catchable, DifficultyConfig } from "@/types";
import type {
  FishingSceneData,
  ReturnInfo,
  CatchResultSceneData,
} from "@/scenes/sceneData";

type Phase = "watch" | "hookWindow" | "hit" | "transition" | "ended";

const PLAYER_POS = { x: 46, y: 126 };
const ROD_TIP = { x: 88, y: 82 };
const FLOAT_BASE = { x: 210, y: 104 };

/**
 * 釣りモード。
 *
 * 浮き監視（ピクン 0〜3 回 → 沈む）→ フッキング（沈んだ瞬間に Space、猶予は難易度依存）
 * → ヒットフェーズ（メーターゲームを必要回数成功）の状態機械。
 * メーターゲームは createMeterGame ファクトリ経由で取得し、本シーンとは分離されている。
 */
export class FishingScene extends GameScene {
  private returnInfo!: ReturnInfo;
  private phase: Phase = "watch";

  private target: Catchable | null = null;
  private cfg: DifficultyConfig = getDifficultyConfig(Difficulty.EASY);
  private successCount = 0;

  private meter!: MeterGame;
  private floatSprite!: Phaser.GameObjects.Sprite;
  private lineGfx!: Phaser.GameObjects.Graphics;
  private promptText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;

  private hookTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super(SceneKeys.Fishing);
  }

  create(data: FishingSceneData): void {
    this.returnInfo = data.return;
    this.successCount = 0;
    this.target = null;
    this.phase = "watch";
    this.setupInput();
    this.meter = createMeterGame(this, this.inputMgr);

    this.renderBackground();
    this.renderHud();
    this.startCast();
  }

  // --- 描画 ---

  private renderBackground(): void {
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, Palette.water).setDepth(Depth.floor);
    // 奥（水平線側）を暗く
    this.add.rectangle(GAME_WIDTH / 2, 28, GAME_WIDTH, 56, Palette.waterDeep, 0.5).setDepth(Depth.floor);
    // 手前の足場（ベランダの縁）
    this.add.rectangle(0, GAME_HEIGHT - 14, GAME_WIDTH, 28, 0x6b6f78).setOrigin(0, 0).setDepth(Depth.walls);

    // 釣り人
    this.add.sprite(PLAYER_POS.x, PLAYER_POS.y, playerTextureKey("right")).setDepth(Depth.player);

    // 竿＆糸
    this.lineGfx = this.add.graphics().setDepth(Depth.fx);

    // 浮き
    this.floatSprite = this.add.sprite(FLOAT_BASE.x, FLOAT_BASE.y, FLOAT_KEY).setDepth(Depth.fx);
    this.drawLines();

    // フッキング合図
    this.promptText = makeText(this, 0, 0, "Space!", { color: TextColor.accent, fontSize: "12px" })
      .setDepth(Depth.uiText)
      .setVisible(false);
  }

  private renderHud(): void {
    // Q: 釣りをやめる（待機状態のみ有効）
    makePanel(this, 56, 12, 100, 16, { fillAlpha: 0.8 }).setDepth(Depth.ui);
    makeText(this, 10, 6, "Q: 釣りをやめる", { fontSize: "10px" }).setDepth(Depth.uiText);

    // 釣果カウンタ（ヒットフェーズ中のみ表示）
    makePanel(this, GAME_WIDTH - 42, 12, 76, 16, { fillAlpha: 0.8 }).setDepth(Depth.ui);
    this.progressText = makeText(this, GAME_WIDTH - 78, 6, "", { fontSize: "10px" })
      .setDepth(Depth.uiText);
  }

  private drawLines(): void {
    this.lineGfx.clear();
    this.lineGfx.lineStyle(2, 0x8a5a2b, 1);
    this.lineGfx.lineBetween(PLAYER_POS.x + 5, PLAYER_POS.y - 6, ROD_TIP.x, ROD_TIP.y);
    this.lineGfx.lineStyle(1, 0xffffff, 0.9);
    this.lineGfx.lineBetween(ROD_TIP.x, ROD_TIP.y, this.floatSprite.x, this.floatSprite.y);
  }

  // --- 浮き監視フェーズ ---

  private startCast(): void {
    this.phase = "watch";
    this.resetFloat();
    const pikunCount = Phaser.Math.Between(0, 3);
    // 仕掛けを投げてから最初のアタリまで、数秒のランダムな「間」を置く（焦らし）
    const firstDelay = Phaser.Math.Between(2500, 5000);
    this.time.delayedCall(firstDelay, () => this.runPikun(pikunCount));
  }

  private runPikun(remaining: number): void {
    if (this.phase !== "watch") return;
    if (remaining > 0) {
      this.doPikun();
      // ピクンの間隔はゆったりめ
      const interval = Phaser.Math.Between(1000, 2200);
      this.time.delayedCall(interval, () => this.runPikun(remaining - 1));
    } else {
      // 最後のピクンから沈み込みまでも少し溜める
      const sinkDelay = Phaser.Math.Between(700, 1500);
      this.time.delayedCall(sinkDelay, () => {
        if (this.phase === "watch") this.beginBite();
      });
    }
  }

  /** 待機・ピクン中の早合わせ（Space）は失敗。魚に逃げられて仕切り直し。 */
  private onEarlyStrike(): void {
    if (this.phase !== "watch") return;
    this.phase = "transition";
    this.tweens.killTweensOf(this.floatSprite);
    this.flash("あわてた！ にげられた…", TextColor.bad, this.floatSprite.x, this.floatSprite.y - 18);
    this.time.delayedCall(800, () => {
      if (this.phase === "transition") this.startCast();
    });
  }

  private doPikun(): void {
    this.flash("ピクン", TextColor.accent, this.floatSprite.x + 14, this.floatSprite.y - 14);
    this.tweens.add({
      targets: this.floatSprite,
      y: FLOAT_BASE.y - 3,
      duration: 90,
      yoyo: true,
      onUpdate: () => this.drawLines(),
    });
  }

  private beginBite(): void {
    // 食いついた魚（＝釣果）をこの時点で抽選し、その難易度を採用する
    this.target = Catalog.roll();
    this.cfg = getDifficultyConfig(this.target.difficulty);
    this.phase = "hookWindow";

    this.promptText
      .setText("Space!")
      .setPosition(this.floatSprite.x + 10, this.floatSprite.y - 18)
      .setVisible(true);
    this.tweens.add({
      targets: this.floatSprite,
      y: FLOAT_BASE.y + 7,
      alpha: 0.5,
      duration: 120,
      onUpdate: () => this.drawLines(),
    });

    this.hookTimer = this.time.delayedCall(this.cfg.hookWindowMs, () => this.onHookTimeout());
  }

  private resetFloat(): void {
    this.tweens.killTweensOf(this.floatSprite);
    this.floatSprite.setPosition(FLOAT_BASE.x, FLOAT_BASE.y).setAlpha(1);
    this.promptText.setVisible(false);
    this.drawLines();
  }

  // --- フッキング ---

  private onHookSuccess(): void {
    if (this.phase !== "hookWindow") return;
    this.hookTimer?.remove(false);
    // 沈み込み tween を止め、ヒット中は浮きを掛かった状態（沈んだ位置・不透明）で固定する
    this.tweens.killTweensOf(this.floatSprite);
    this.floatSprite.setAlpha(1);
    this.drawLines();
    this.promptText.setVisible(false);
    void this.runHit();
  }

  private onHookTimeout(): void {
    if (this.phase !== "hookWindow") return;
    // 失敗：魚が逃げる → 待機状態へ戻る
    this.phase = "transition";
    this.flash("にげられた…", TextColor.bad, this.floatSprite.x, this.floatSprite.y - 18);
    this.time.delayedCall(800, () => {
      if (this.phase === "transition") this.startCast();
    });
  }

  // --- ヒットフェーズ ---

  private async runHit(): Promise<void> {
    this.phase = "hit";
    const required = this.cfg.requiredSuccesses;

    while (this.successCount < required) {
      this.progressText.setText(`釣果 ${this.successCount} / ${required}`);
      const result = await this.meter.start();
      if (this.phase !== "hit") return; // シーンが終了済み等の保険

      if (result === "miss") {
        this.goToResult({ outcome: "failed" });
        return;
      }
      if (result === "perfect" || (result === "good" && this.cfg.allowGood)) {
        this.successCount += 1;
      }
      // Good 且つ allowGood=false の場合は加算しない（即失敗でもない）
    }

    this.progressText.setText(`釣果 ${required} / ${required}`);
    this.onCaught();
  }

  private onCaught(): void {
    const target = this.target;
    if (!target) {
      this.goToResult({ outcome: "failed" });
      return;
    }
    // 収集物獲得・図鑑登録（discover 内で保存される）
    const isNew = gameState.discover(target.id);
    this.goToResult({ outcome: "caught", catchableId: target.id, isNew });
  }

  // --- 結果・終了 ---

  private goToResult(result: CatchResultSceneData["result"]): void {
    if (this.phase === "ended") return;
    this.phase = "ended";
    const data: CatchResultSceneData = { result, return: this.returnInfo };
    this.scene.start(SceneKeys.CatchResult, data);
  }

  private quitFishing(): void {
    if (this.phase !== "watch") return;
    this.phase = "ended";
    // 釣り終了時の保存
    gameState.setLocation(this.returnInfo.mapId, this.returnInfo.x, this.returnInfo.y);
    this.scene.start(getMap(this.returnInfo.mapId).sceneKey, {
      entry: { x: this.returnInfo.x, y: this.returnInfo.y, facing: this.returnInfo.facing },
    });
  }

  // --- 共通 ---

  /** その場に短く浮かぶフィードバック文字。 */
  private flash(text: string, color: string, x: number, y: number): void {
    const t = makeText(this, x, y, text, { color, fontSize: "11px" })
      .setOrigin(0.5)
      .setDepth(Depth.uiText);
    this.tweens.add({
      targets: t,
      y: y - 10,
      alpha: 0,
      duration: 700,
      onComplete: () => t.destroy(),
    });
  }

  override update(): void {
    if (this.updateModal()) return;
    switch (this.phase) {
      case "watch":
        if (this.inputMgr.justConfirm()) {
          this.onEarlyStrike();
        } else if (this.inputMgr.justCancel()) {
          this.quitFishing();
        }
        break;
      case "hookWindow":
        if (this.inputMgr.justConfirm()) this.onHookSuccess();
        break;
      case "hit":
      case "transition":
      case "ended":
        break;
    }
  }
}
