import Phaser from "phaser";
import { SANDBOX } from "@/data/walkSandbox";
import { Depth, Palette, TextColor, FontFamily } from "@/config/constants";
import { getStageDifficultyConfig, getRelievedConfig } from "@/data/stageDifficulty";
import { STAGE_1, POST_CATCH_CHOICES, type StageRarity } from "@/data/stageCatchables";
import { rollForStage, isLegendaryUnlocked } from "@/systems/StageCatalog";
import { InputManager } from "@/core/InputManager";
import { SandboxGaugeMeterGame } from "@/systems/meter/SandboxGaugeMeterGame";
import type { StageDifficultyConfig } from "@/data/stageDifficulty";
import type { StageCatchable, PostCatchChoice } from "@/data/stageCatchables";
import { markStageCleared, markItemCaught } from "@/systems/StageProgress";

type Phase = "watch" | "hookWindow" | "waitingForHold" | "hit" | "transition" | "catchSequence" | "stageClear" | "ended";

const FLOAT_BASE = { x: SANDBOX.viewWidth / 2 + 260, y: 320 };
const ROD_TIP = { x: SANDBOX.viewWidth / 2 + 40, y: 260 };
const PLAYER_POS = { x: SANDBOX.viewWidth / 2 - 120, y: 420 };

/** フッキング成功後、メーターを始めるのに必要な「長押し」の継続時間 (ms)。 */
const HOLD_TO_START_METER_MS = 300;

/**
 * ステージ1（ファミレスのポール看板の上）の釣りシーン。試作版（1280×720）。
 *
 * 状態遷移は旧 FishingScene（320×180）の流れをベースに、フッキングとメーター開始を分離：
 * 投入 →（間）→ ピクン → フッキング（1回押すだけの判定）→ 長押し待ち（既定時間ぶん
 * 押し続けるとメーター開始）→ メーター(必要成功数ぶん) → 釣果。
 * 旧実装との違いは、5種を釣り終えるまで同じシーン内で繰り返し、
 * 一度釣った種は StageCatalog（重複なし抽選）で候補から外れる点。
 * 全種釣り終えると探索完了になり、サンドボックス（ベランダ）へ戻る。
 *
 * 見た目は仮素材（四角・テキストのみ）。演出・効果音・「星に名前をつける」演出は次の段階で追加する。
 */
export class SandboxFishingScene extends Phaser.Scene {
  private inputMgr!: InputManager;
  private meter!: SandboxGaugeMeterGame;

  private phase: Phase = "watch";
  private target: StageCatchable | null = null;
  private cfg: StageDifficultyConfig = getStageDifficultyConfig(STAGE_1.items[0].rarity);
  private successCount = 0;
  private caught = new Set<string>();
  /** このステージで釣りを試みた（抽選を行った）回数。粘るほど救済されるピティ計算に使う。 */
  private castCount = 0;
  /** 大トリ（最高レア度）がロック解除されて以降のキャスト回数。大トリ専用の救済に使う。 */
  private legendaryUnlockedCastCount = 0;
  /** レア度ごとの失敗回数（早合わせ・フッキング失敗・メーターMiss）。粘るほど難易度が緩む救済に使う。 */
  private failCountByRarity = new Map<StageRarity, number>();
  /** 「長押しでメーター開始」待ちの間、押し始めた時刻 (this.time.now)。押していなければ null。 */
  private holdSince: number | null = null;

  private playerRect!: Phaser.GameObjects.Rectangle;
  private floatSprite!: Phaser.GameObjects.Rectangle;
  private lineGfx!: Phaser.GameObjects.Graphics;
  private promptText!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private catchText!: Phaser.GameObjects.Text;

  private hookTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super("SandboxFishingScene");
  }

  create(): void {
    this.inputMgr = new InputManager(this);
    this.meter = new SandboxGaugeMeterGame(this, this.inputMgr);
    this.phase = "watch";
    this.successCount = 0;
    this.target = null;
    this.caught = new Set();
    this.castCount = 0;
    this.legendaryUnlockedCastCount = 0;
    this.failCountByRarity = new Map();

    this.renderBackground();
    this.renderHud();
    this.startCast();
  }

  // --- 描画 ---

  private renderBackground(): void {
    this.add
      .rectangle(SANDBOX.viewWidth / 2, SANDBOX.viewHeight / 2, SANDBOX.viewWidth, SANDBOX.viewHeight, 0x2b3550)
      .setDepth(Depth.floor);
    this.add
      .text(SANDBOX.viewWidth / 2, 60, STAGE_1.locationLabel, {
        fontFamily: FontFamily,
        fontSize: "28px",
        color: TextColor.accent,
      })
      .setOrigin(0.5)
      .setDepth(Depth.uiText);

    this.playerRect = this.add.rectangle(PLAYER_POS.x, PLAYER_POS.y, 60, 90, Palette.player).setDepth(Depth.player);

    this.lineGfx = this.add.graphics().setDepth(Depth.fx);
    this.floatSprite = this.add.rectangle(FLOAT_BASE.x, FLOAT_BASE.y, 18, 18, Palette.float).setDepth(Depth.fx);
    this.drawLines();

    this.promptText = this.add
      .text(0, 0, "スペース！", { fontFamily: FontFamily, fontSize: "22px", color: TextColor.accent })
      .setDepth(Depth.uiText)
      .setVisible(false);

    this.catchText = this.add
      .text(SANDBOX.viewWidth / 2, SANDBOX.viewHeight / 2, "", {
        fontFamily: FontFamily,
        fontSize: "26px",
        color: TextColor.normal,
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(Depth.modalText)
      .setVisible(false);
  }

  private renderHud(): void {
    this.add
      .text(24, 20, "Q: 釣りをやめる", { fontFamily: FontFamily, fontSize: "18px", color: TextColor.dim })
      .setDepth(Depth.uiText);
    this.progressText = this.add
      .text(SANDBOX.viewWidth - 24, 20, "", { fontFamily: FontFamily, fontSize: "18px", color: TextColor.normal })
      .setOrigin(1, 0)
      .setDepth(Depth.uiText);
    this.updateStageProgressLabel();
  }

  private updateStageProgressLabel(): void {
    this.progressText.setText(`探索 ${this.caught.size} / ${STAGE_1.items.length}`);
  }

  private drawLines(): void {
    this.lineGfx.clear();
    this.lineGfx.lineStyle(3, 0x8a5a2b, 1);
    this.lineGfx.lineBetween(PLAYER_POS.x + 20, PLAYER_POS.y - 30, ROD_TIP.x, ROD_TIP.y);
    this.lineGfx.lineStyle(2, 0xffffff, 0.9);
    this.lineGfx.lineBetween(ROD_TIP.x, ROD_TIP.y, this.floatSprite.x, this.floatSprite.y);
  }

  // --- 浮き監視フェーズ ---

  /** 今の対象への挑戦が失敗した（早合わせ・フッキング失敗・メーターMiss）ことを記録する。 */
  private recordFailure(): void {
    if (!this.target) return;
    const rarity = this.target.rarity;
    this.failCountByRarity.set(rarity, (this.failCountByRarity.get(rarity) ?? 0) + 1);
  }

  private startCast(): void {
    this.phase = "watch";
    // 釣果演出（HIT→シルエット→選択肢）の間だけ隠していた仮素材を出し直す。
    this.playerRect.setVisible(true);
    this.floatSprite.setVisible(true);
    this.lineGfx.setVisible(true);
    this.resetFloat();

    // 何が食いつくかは、ピクン演出の前にここで先に決める
    // （レア度に応じてフェイント回数・メーター速度を変えるため、演出より前に確定させておく必要がある）。
    this.castCount += 1;
    // 大トリ専用の救済は「大トリがロック解除されてから」のキャスト数だけを数える
    // （他の種を集めるのに手間取った人ほど有利/不利になってしまわないようにするため）。
    if (isLegendaryUnlocked(STAGE_1.items, this.caught)) {
      this.legendaryUnlockedCastCount += 1;
    }
    const next = rollForStage(STAGE_1.items, this.caught, this.castCount, this.legendaryUnlockedCastCount);
    if (!next) {
      // 保険：本来は釣った時点で stageClear へ遷移済みのはず。
      this.onStageClear();
      return;
    }
    this.target = next;
    const failCount = this.failCountByRarity.get(next.rarity) ?? 0;
    this.cfg = getRelievedConfig(next.rarity, failCount);

    const [pikunMin, pikunMax] = this.cfg.pikunCountRange;
    const pikunCount = Phaser.Math.Between(pikunMin, pikunMax);
    const firstDelay = Phaser.Math.Between(2500, 5000);
    this.time.delayedCall(firstDelay, () => this.runPikun(pikunCount));
  }

  private runPikun(remaining: number): void {
    if (this.phase !== "watch") return;
    if (remaining > 0) {
      this.doPikun();
      const interval = Phaser.Math.Between(1000, 2200);
      this.time.delayedCall(interval, () => this.runPikun(remaining - 1));
    } else {
      const sinkDelay = Phaser.Math.Between(700, 1500);
      this.time.delayedCall(sinkDelay, () => {
        if (this.phase === "watch") this.beginBite();
      });
    }
  }

  private onEarlyStrike(): void {
    if (this.phase !== "watch") return;
    this.phase = "transition";
    this.recordFailure();
    this.tweens.killTweensOf(this.floatSprite);
    this.flash("あわてた！ にげられた…", TextColor.bad, this.floatSprite.x, this.floatSprite.y - 24);
    this.time.delayedCall(800, () => {
      if (this.phase === "transition") this.startCast();
    });
  }

  private doPikun(): void {
    this.flash("ピクン", TextColor.accent, this.floatSprite.x + 20, this.floatSprite.y - 20);
    this.tweens.add({
      targets: this.floatSprite,
      y: FLOAT_BASE.y - 5,
      duration: 90,
      yoyo: true,
      onUpdate: () => this.drawLines(),
    });
  }

  private beginBite(): void {
    // target・cfg は startCast() の時点で確定済み（フェイント回数をレア度で決めるため先出しした）。
    this.phase = "hookWindow";

    this.promptText
      .setText("スペース！")
      .setPosition(this.floatSprite.x + 16, this.floatSprite.y - 26)
      .setVisible(true);
    this.tweens.add({
      targets: this.floatSprite,
      y: FLOAT_BASE.y + 10,
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

  /** フッキング（1回押すだけの判定）に成功したら、いったん「長押し待ち」に入る。 */
  private onHookSuccess(): void {
    if (this.phase !== "hookWindow") return;
    this.hookTimer?.remove(false);
    this.tweens.killTweensOf(this.floatSprite);
    this.floatSprite.setAlpha(1);
    this.drawLines();
    this.phase = "waitingForHold";
    this.holdSince = null;
    this.promptText
      .setText("長押し！")
      .setPosition(this.floatSprite.x + 16, this.floatSprite.y - 26)
      .setVisible(true);
  }

  private onHookTimeout(): void {
    if (this.phase !== "hookWindow") return;
    this.phase = "transition";
    this.recordFailure();
    this.flash("にげられた…", TextColor.bad, this.floatSprite.x, this.floatSprite.y - 24);
    this.time.delayedCall(800, () => {
      if (this.phase === "transition") this.startCast();
    });
  }

  /**
   * 「長押し待ち」フェーズの毎フレーム処理。
   * スペースを離すと長押しの継続がリセットされ、既定時間ぶん押し続けるとメーターが始まる。
   */
  private updateWaitingForHold(): void {
    if (!this.inputMgr.heldConfirm()) {
      this.holdSince = null;
      return;
    }
    if (this.holdSince === null) {
      this.holdSince = this.time.now;
      return;
    }
    if (this.time.now - this.holdSince >= HOLD_TO_START_METER_MS) {
      this.holdSince = null;
      this.promptText.setVisible(false);
      void this.runHit();
    }
  }

  // --- ヒットフェーズ ---

  private async runHit(): Promise<void> {
    this.phase = "hit";
    this.successCount = 0;
    const required = this.cfg.requiredSuccesses;

    while (this.successCount < required) {
      const result = await this.meter.start(this.cfg.meterFillMs);
      if (this.phase !== "hit") return;

      if (result === "miss") {
        this.phase = "transition";
        this.recordFailure();
        this.flash("にがしてしまった…", TextColor.bad, SANDBOX.viewWidth / 2, SANDBOX.viewHeight / 2 - 40);
        this.time.delayedCall(900, () => {
          if (this.phase === "transition") this.startCast();
        });
        return;
      }
      if (result === "perfect" || (result === "good" && this.cfg.allowGood)) {
        this.successCount += 1;
      }
    }

    this.onCaught();
  }

  private onCaught(): void {
    const target = this.target;
    if (!target) {
      this.startCast();
      return;
    }
    const choices = POST_CATCH_CHOICES[target.id];
    if (choices && choices.length > 0) {
      void this.runCatchSequence(target, choices);
      return;
    }
    void this.runSimpleCatchMessage(target);
  }

  /** 選択肢を持たない種の釣果表示（スペースで続ける）。 */
  private async runSimpleCatchMessage(target: StageCatchable): Promise<void> {
    this.phase = "transition";
    this.caught.add(target.id);
    markItemCaught(STAGE_1.id, target.id);
    this.updateStageProgressLabel();
    const isStageClear = this.caught.size >= STAGE_1.items.length;

    await this.showMessageAndWait(
      `${target.name} を つかまえた！`,
      TextColor.good,
      SANDBOX.viewWidth / 2,
      SANDBOX.viewHeight / 2 - 40,
    );

    if (isStageClear) {
      this.onStageClear();
    } else if (this.phase === "transition") {
      this.startCast();
    }
  }

  /** 選択肢ループを抜けて実際に釣果として確定する（進捗・ステージクリア判定込み）。 */
  private finalizeCatch(target: StageCatchable): void {
    this.caught.add(target.id);
    markItemCaught(STAGE_1.id, target.id);
    this.updateStageProgressLabel();
    if (this.caught.size >= STAGE_1.items.length) {
      this.onStageClear();
    } else {
      this.startCast();
    }
  }

  // --- 釣果演出（HIT→シルエット→正体→選択肢。試作は目玉焼きのみ） ---

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, () => resolve()));
  }

  /** 次にスペースが押されるまで待つ（文章をきちんと読んでもらうため、時間では自動送りしない）。 */
  private waitForConfirm(): Promise<void> {
    return new Promise((resolve) => {
      const handler = () => {
        if (this.inputMgr.justConfirm()) {
          this.events.off(Phaser.Scenes.Events.UPDATE, handler, this);
          resolve();
        }
      };
      this.events.on(Phaser.Scenes.Events.UPDATE, handler, this);
    });
  }

  /** メッセージを表示し、「スペースで続ける」の合図とともにスペース待ちしてから片付ける。 */
  private async showMessageAndWait(text: string, color: string, x: number, y: number): Promise<void> {
    const msg = this.add
      .text(x, y, text, { fontFamily: FontFamily, fontSize: "24px", color, align: "center" })
      .setOrigin(0.5)
      .setDepth(Depth.uiText);
    const hint = this.add
      .text(x, y + 40, "（スペースで続ける）", { fontFamily: FontFamily, fontSize: "14px", color: TextColor.dim })
      .setOrigin(0.5)
      .setDepth(Depth.uiText);
    await this.waitForConfirm();
    msg.destroy();
    hint.destroy();
  }

  private async runCatchSequence(target: StageCatchable, choices: readonly PostCatchChoice[]): Promise<void> {
    this.phase = "catchSequence";
    const cx = SANDBOX.viewWidth / 2;
    const cy = SANDBOX.viewHeight / 2;

    // 演出の間は仮素材（竿・浮き・プレイヤー）を隠し、演出だけ見せる。
    this.playerRect.setVisible(false);
    this.floatSprite.setVisible(false);
    this.lineGfx.setVisible(false);

    // 1) HIT!
    const hitText = this.add
      .text(cx, cy - 60, "HIT!", { fontFamily: FontFamily, fontSize: "64px", color: TextColor.accent, fontStyle: "bold" })
      .setOrigin(0.5)
      .setDepth(Depth.modalText)
      .setScale(0);
    await new Promise<void>((resolve) => {
      this.tweens.add({ targets: hitText, scale: 1, duration: 260, ease: "Back.Out", onComplete: () => resolve() });
    });
    await this.wait(500);
    hitText.destroy();

    // 2) シルエットが浮かび上がる
    const silhouette = this.add.rectangle(cx, cy + 120, 70, 70, 0x000000, 0.75).setDepth(Depth.fx);
    await new Promise<void>((resolve) => {
      this.tweens.add({ targets: silhouette, y: cy - 40, duration: 700, ease: "Sine.Out", onComplete: () => resolve() });
    });
    await this.wait(300);
    silhouette.destroy();

    // 3) 正体〜選択肢ループ。際どい選択肢を選ぶとミニゲームが挟まり、
    //    成功すればまた選択肢に戻り、失敗すると逃げられて釣果が無くなる。
    // 文章はすべてスペースを押すまで消えない（読み終わるまで自動で進めない）。
    while (true) {
      this.catchText.setText(`${target.name}\n\n${target.description}`).setPosition(cx, cy - 60).setVisible(true);
      const revealHint = this.add
        .text(cx, cy + 40, "（スペースで続ける）", { fontFamily: FontFamily, fontSize: "14px", color: TextColor.dim })
        .setOrigin(0.5)
        .setDepth(Depth.modalText);
      await this.waitForConfirm();
      this.catchText.setVisible(false);
      revealHint.destroy();

      const chosen = await this.showPostCatchChoices(choices, cy);
      await this.showMessageAndWait(chosen.reply, TextColor.normal, cx, cy + 10);

      if (!chosen.risky) {
        this.finalizeCatch(target);
        return;
      }

      await this.showMessageAndWait(chosen.riskyWarning ?? "何かが起きようとしている…！", TextColor.bad, cx, cy + 10);

      const result = await this.meter.start(this.cfg.meterFillMs);
      if (this.phase !== "catchSequence") return; // シーンが切り替わっていた場合の保険

      if (result === "miss") {
        this.recordFailure();
        await this.showMessageAndWait("にげられた…", TextColor.bad, cx, cy + 10);
        this.startCast();
        return;
      }

      await this.showMessageAndWait("なんとか抱きかかえた。", TextColor.good, cx, cy + 10);
      // ループの先頭に戻り、もう一度選択肢を出す。
    }
  }

  private showPostCatchChoices(choices: readonly PostCatchChoice[], cy: number): Promise<PostCatchChoice> {
    return new Promise((resolve) => {
      const cx = SANDBOX.viewWidth / 2;
      let index = 0;

      const promptText = this.add
        .text(cx, cy + 40, "どうする？", { fontFamily: FontFamily, fontSize: "20px", color: TextColor.dim })
        .setOrigin(0.5)
        .setDepth(Depth.modalText);
      const itemTexts = choices.map((_c, i) =>
        this.add
          .text(cx, cy + 80 + i * 36, "", { fontFamily: FontFamily, fontSize: "20px", color: TextColor.normal })
          .setOrigin(0.5)
          .setDepth(Depth.modalText),
      );

      const redraw = () => {
        choices.forEach((c, i) => {
          const selected = i === index;
          itemTexts[i].setText(`${selected ? "▶ " : "　"}${c.label}`).setColor(selected ? TextColor.accent : TextColor.normal);
        });
      };
      redraw();

      const handler = () => {
        if (this.inputMgr.justUp()) {
          index = (index - 1 + choices.length) % choices.length;
          redraw();
        } else if (this.inputMgr.justDown()) {
          index = (index + 1) % choices.length;
          redraw();
        } else if (this.inputMgr.justConfirm()) {
          this.events.off(Phaser.Scenes.Events.UPDATE, handler, this);
          promptText.destroy();
          itemTexts.forEach((t) => t.destroy());
          resolve(choices[index]);
        }
      };
      this.events.on(Phaser.Scenes.Events.UPDATE, handler, this);
    });
  }

  // --- ステージ完了・終了 ---

  private onStageClear(): void {
    this.phase = "stageClear";
    // 仮素材（竿・浮き・プレイヤー）を隠し、締めのメッセージだけ見せる。
    this.playerRect.setVisible(false);
    this.floatSprite.setVisible(false);
    this.lineGfx.setVisible(false);
    this.promptText.setVisible(false);
    // 「この星に名前をつける」演出はここでは行わない。ベランダに戻ってロケットを調べたときに出す。
    markStageCleared(STAGE_1.id);
    this.catchText
      .setText(
        `${STAGE_1.locationLabel} の ものを すべて釣った。\n` +
          "この星の探索を終えた！\n\n" +
          "スペースでベランダに戻る",
      )
      .setVisible(true);
  }

  private quitFishing(): void {
    if (this.phase !== "watch") return;
    this.phase = "ended";
    this.scene.start("WalkSandboxScene");
  }

  // --- 共通 ---

  private flash(text: string, color: string, x: number, y: number): void {
    const t = this.add
      .text(x, y, text, { fontFamily: FontFamily, fontSize: "24px", color })
      .setOrigin(0.5)
      .setDepth(Depth.uiText);
    this.tweens.add({
      targets: t,
      y: y - 16,
      alpha: 0,
      duration: 800,
      onComplete: () => t.destroy(),
    });
  }

  override update(): void {
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
      case "waitingForHold":
        this.updateWaitingForHold();
        break;
      case "stageClear":
        if (this.inputMgr.justConfirm()) {
          this.scene.start("WalkSandboxScene");
        }
        break;
      case "hit":
      case "transition":
      case "catchSequence":
      case "ended":
        break;
    }
  }
}
