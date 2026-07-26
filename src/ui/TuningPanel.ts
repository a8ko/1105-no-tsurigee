import type Phaser from "phaser";
import { STAGE_1, STAGE_RARITY_LABELS, StageRarity } from "@/data/stageCatchables";
import { RARITY_ORDER, perfectBandRatio } from "@/data/fishingTuning";
import {
  getTuning,
  getTunedStageItems,
  isTuningModified,
  resetTuning,
  tuningToJson,
  updateTuning,
} from "@/systems/TuningStore";
import { buildMeterBands } from "@/systems/meter/meterBands";
import { simulateStage, type SimulationResult } from "@/systems/tuningSimulator";
import { TUNING_PANEL_CSS } from "@/ui/tuningPanelStyles";
import {
  createButton,
  createCheckRow,
  createSection,
  createSelectRow,
  createSliderRow,
  el,
  toCssColor,
} from "@/ui/tuningControls";

/**
 * 釣りの数値を手で調整するパネル（ゲーム中に G キーで開く）。
 *
 * 開いている間はゲームを一時停止し、キーボードもゲームへ渡さない（数値を打てるように）。
 * 変えた値はその場でブラウザに保存され、パネルを閉じたあとの次のキャストから効く。
 * 気に入った値が決まったら「設定をコピー」で JSON を書き出して、
 * fishingTuning.ts の初期値として正式採用する。
 */

type TabId = "rarity" | "pacing" | "meter" | "probability" | "relief";

const TABS: readonly { id: TabId; label: string }[] = [
  { id: "rarity", label: "レア度ごと" },
  { id: "pacing", label: "テンポ" },
  { id: "meter", label: "メーター" },
  { id: "probability", label: "確率" },
  { id: "relief", label: "救済" },
];

/** 試し引きを1回押したときに繰り返す探索の回数。 */
const SIMULATION_RUNS = 300;

class TuningPanel {
  private root: HTMLDivElement | null = null;
  private body: HTMLDivElement | null = null;
  private tabButtons = new Map<TabId, HTMLButtonElement>();
  private activeTab: TabId = "rarity";
  private activeRarity: StageRarity = StageRarity.COMMON;
  private simulation: SimulationResult | null = null;

  private scene: Phaser.Scene | null = null;
  private wasPaused = false;
  private keyboardWasEnabled = true;

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
    }
  };

  get isOpen(): boolean {
    return this.root !== null;
  }

  open(scene: Phaser.Scene): void {
    if (this.isOpen) {
      this.close();
      return;
    }
    this.scene = scene;
    this.pauseGame(scene);
    ensureStyles();
    this.build();
    document.addEventListener("keydown", this.onKeyDown);
  }

  close(): void {
    if (!this.isOpen) return;
    document.removeEventListener("keydown", this.onKeyDown);
    this.root?.remove();
    this.root = null;
    this.body = null;
    this.tabButtons.clear();
    this.resumeGame();
  }

  // --- ゲームの一時停止と再開 ---

  private pauseGame(scene: Phaser.Scene): void {
    this.wasPaused = scene.scene.isPaused();
    if (!this.wasPaused) scene.scene.pause();
    const keyboard = scene.input.keyboard;
    if (keyboard) {
      this.keyboardWasEnabled = keyboard.enabled;
      keyboard.enabled = false; // パネルの入力欄に数字を打ってもゲームが反応しないように
    }
  }

  private resumeGame(): void {
    const scene = this.scene;
    this.scene = null;
    if (!scene) return;
    const keyboard = scene.input.keyboard;
    if (keyboard) keyboard.enabled = this.keyboardWasEnabled;
    if (!this.wasPaused) scene.scene.resume();
  }

  // --- 組み立て ---

  private build(): void {
    const root = el("div", "tp-root");

    const header = el("div", "tp-header");
    const titleWrap = el("div");
    titleWrap.appendChild(el("h2", "tp-title", "釣り調整パネル"));
    titleWrap.appendChild(el("p", "tp-subtitle", "変えた値はすぐ保存されます（G キー / Esc で閉じる）"));
    header.appendChild(titleWrap);
    header.appendChild(createButton("閉じる", () => this.close(), "default"));
    header.lastElementChild?.classList.add("tp-button--close");
    root.appendChild(header);

    const tabs = el("div", "tp-tabs");
    for (const tab of TABS) {
      const button = createButton(tab.label, () => this.selectTab(tab.id));
      button.className = "tp-tab";
      this.tabButtons.set(tab.id, button);
      tabs.appendChild(button);
    }
    root.appendChild(tabs);

    this.body = el("div", "tp-body");
    root.appendChild(this.body);

    root.appendChild(this.buildFooter());

    document.body.appendChild(root);
    this.root = root;
    this.selectTab(this.activeTab);
  }

  private buildFooter(): HTMLElement {
    const footer = el("div", "tp-footer");
    footer.appendChild(
      createButton("初期値に戻す", () => {
        if (!window.confirm("調整した内容をすべて捨てて、設定ファイルの初期値に戻します。よろしいですか？")) return;
        resetTuning();
        this.simulation = null;
        this.renderBody();
      }, "danger"),
    );
    const copyButton = createButton("設定をコピー", () => this.copyTuning(copyButton), "primary");
    footer.appendChild(copyButton);
    return footer;
  }

  /** いまの設定を JSON でクリップボードへ。開発者コンソールにも出す（既存エディタと同じ流儀）。 */
  private copyTuning(button: HTMLButtonElement): void {
    const json = tuningToJson();
    // eslint-disable-next-line no-console
    console.log("[調整パネル] いまの釣り設定（fishingTuning.ts の初期値に反映するときはこれを渡してください）:\n" + json);

    const done = (message: string): void => {
      const original = "設定をコピー";
      button.textContent = message;
      window.setTimeout(() => {
        button.textContent = original;
      }, 1600);
    };

    const clip = navigator.clipboard;
    if (clip && typeof clip.writeText === "function") {
      void clip.writeText(json).then(
        () => done("コピーしました"),
        () => done("コンソールに出力"),
      );
    } else {
      done("コンソールに出力");
    }
  }

  private selectTab(tab: TabId): void {
    this.activeTab = tab;
    for (const [id, button] of this.tabButtons) {
      button.classList.toggle("tp-tab--active", id === tab);
    }
    this.renderBody();
  }

  private renderBody(): void {
    const body = this.body;
    if (!body) return;
    body.replaceChildren();
    body.scrollTop = 0;

    switch (this.activeTab) {
      case "rarity":
        this.renderRarityTab(body);
        break;
      case "pacing":
        this.renderPacingTab(body);
        break;
      case "meter":
        this.renderMeterTab(body);
        break;
      case "probability":
        this.renderProbabilityTab(body);
        break;
      case "relief":
        this.renderReliefTab(body);
        break;
    }

    if (isTuningModified()) {
      body.appendChild(el("p", "tp-note", "※ 初期値から変更されています。「初期値に戻す」でいつでも元に戻せます。"));
    }
  }

  // --- タブ1: レア度ごと ---

  private renderRarityTab(body: HTMLElement): void {
    const subtabs = el("div", "tp-subtabs");
    for (const rarity of RARITY_ORDER) {
      const button = createButton(STAGE_RARITY_LABELS[rarity], () => {
        this.activeRarity = rarity;
        this.renderBody();
      });
      button.className = `tp-subtab${rarity === this.activeRarity ? " tp-subtab--active" : ""}`;
      subtabs.appendChild(button);
    }
    body.appendChild(subtabs);

    const rarity = this.activeRarity;
    const cfg = getTuning().rarities[rarity];

    body.appendChild(
      createSection(
        `${STAGE_RARITY_LABELS[rarity]} の難しさ`,
        "レア度ごとに、フッキングの猶予・メーターの速さ・必要な成功回数を決めます。",
      ),
    );

    body.appendChild(
      createSliderRow({
        label: "フッキングの猶予",
        hint: "「スペース！」が出てから押せる時間。短いほどシビア。",
        min: 100,
        max: 1500,
        step: 10,
        unit: "ms",
        value: cfg.hookWindowMs,
        onChange: (v) => updateTuning((t) => void (t.rarities[rarity].hookWindowMs = v)),
      }),
    );

    body.appendChild(
      createSliderRow({
        label: "メーターの速さ",
        hint: "ゲージが端まで届くまでの時間。短いほど速く、止めるのが難しい。",
        min: 300,
        max: 4000,
        step: 50,
        unit: "ms",
        value: cfg.meterFillMs,
        onChange: (v) => updateTuning((t) => void (t.rarities[rarity].meterFillMs = v)),
      }),
    );

    body.appendChild(
      createSliderRow({
        label: "必要な成功回数",
        hint: "メーターを何回成功させれば釣り上げられるか。",
        min: 1,
        max: 15,
        step: 1,
        unit: "回",
        value: cfg.requiredSuccesses,
        onChange: (v) => updateTuning((t) => void (t.rarities[rarity].requiredSuccesses = v)),
      }),
    );

    body.appendChild(
      createCheckRow({
        label: "黄色（Good）でも成功にする",
        hint: "オフにすると、緑（Perfect）で止めたときだけ成功になります。",
        value: cfg.allowGood,
        onChange: (v) => updateTuning((t) => void (t.rarities[rarity].allowGood = v)),
      }),
    );

    body.appendChild(
      createSection("食いつく前のピクン", "本当に食いつく前に、何回フェイントを入れるか（毎回この範囲でランダム）。"),
    );

    body.appendChild(
      createSliderRow({
        label: "ピクンの回数（最小）",
        min: 0,
        max: 10,
        step: 1,
        unit: "回",
        value: cfg.pikunMin,
        onChange: (v) => updateTuning((t) => void (t.rarities[rarity].pikunMin = v)),
      }),
    );

    body.appendChild(
      createSliderRow({
        label: "ピクンの回数（最大）",
        hint: "最小より小さい値にしても、自動で入れ替えて扱います。",
        min: 0,
        max: 10,
        step: 1,
        unit: "回",
        value: cfg.pikunMax,
        onChange: (v) => updateTuning((t) => void (t.rarities[rarity].pikunMax = v)),
      }),
    );
  }

  // --- タブ2: テンポ ---

  private renderPacingTab(body: HTMLElement): void {
    const pacing = getTuning().pacing;

    body.appendChild(
      createSection("糸を垂らしてから最初の反応まで", "毎回この範囲でランダムに決まります。長いほど「待つ」ゲームになります。"),
    );
    body.appendChild(
      createSliderRow({
        label: "待ち時間（最短）",
        min: 0,
        max: 10000,
        step: 100,
        unit: "ms",
        value: pacing.firstDelayMinMs,
        onChange: (v) => updateTuning((t) => void (t.pacing.firstDelayMinMs = v)),
      }),
    );
    body.appendChild(
      createSliderRow({
        label: "待ち時間（最長）",
        min: 0,
        max: 10000,
        step: 100,
        unit: "ms",
        value: pacing.firstDelayMaxMs,
        onChange: (v) => updateTuning((t) => void (t.pacing.firstDelayMaxMs = v)),
      }),
    );

    body.appendChild(createSection("ピクンとピクンの間隔", "フェイントのテンポ。短いと気ぜわしく、長いとじらされます。"));
    body.appendChild(
      createSliderRow({
        label: "間隔（最短）",
        min: 100,
        max: 5000,
        step: 50,
        unit: "ms",
        value: pacing.pikunIntervalMinMs,
        onChange: (v) => updateTuning((t) => void (t.pacing.pikunIntervalMinMs = v)),
      }),
    );
    body.appendChild(
      createSliderRow({
        label: "間隔（最長）",
        min: 100,
        max: 5000,
        step: 50,
        unit: "ms",
        value: pacing.pikunIntervalMaxMs,
        onChange: (v) => updateTuning((t) => void (t.pacing.pikunIntervalMaxMs = v)),
      }),
    );

    body.appendChild(
      createSection("最後のピクンから食いつくまで", "ここが「間」。長いほど不意打ちになり、早合わせを誘います。"),
    );
    body.appendChild(
      createSliderRow({
        label: "間（最短）",
        min: 0,
        max: 4000,
        step: 50,
        unit: "ms",
        value: pacing.sinkDelayMinMs,
        onChange: (v) => updateTuning((t) => void (t.pacing.sinkDelayMinMs = v)),
      }),
    );
    body.appendChild(
      createSliderRow({
        label: "間（最長）",
        min: 0,
        max: 4000,
        step: 50,
        unit: "ms",
        value: pacing.sinkDelayMaxMs,
        onChange: (v) => updateTuning((t) => void (t.pacing.sinkDelayMaxMs = v)),
      }),
    );

    body.appendChild(createSection("メーターが始まるまでの長押し", "フッキング成功後、スペースを押し続ける時間。"));
    body.appendChild(
      createSliderRow({
        label: "長押しの時間",
        hint: "0 にすると、押した瞬間にメーターが始まります。",
        min: 0,
        max: 2000,
        step: 50,
        unit: "ms",
        value: pacing.holdToStartMeterMs,
        onChange: (v) => updateTuning((t) => void (t.pacing.holdToStartMeterMs = v)),
      }),
    );
  }

  // --- タブ3: メーター ---

  private renderMeterTab(body: HTMLElement): void {
    const meter = getTuning().meter;

    body.appendChild(
      createSection("ゾーンの広さ", "バーの左右は対称です。外側から 赤（失敗）→ 黄（Good）→ 緑（Perfect）の順。"),
    );

    const preview = el("div", "tp-meter-preview");
    const legend = el("p", "tp-meter-legend");
    const refreshPreview = (): void => {
      const current = getTuning().meter;
      preview.replaceChildren();
      for (const band of buildMeterBands(current)) {
        const width = (band.to - band.from) * 100;
        if (width <= 0) continue;
        const zone = el("div", "tp-meter-zone", width >= 8 ? `${Math.round(width)}%` : "");
        zone.style.width = `${width}%`;
        zone.style.background = toCssColor(band.color);
        preview.appendChild(zone);
      }
      legend.textContent = `緑（Perfect）の広さ: ${Math.round(perfectBandRatio(current) * 100)}%`;
    };
    body.appendChild(preview);
    body.appendChild(legend);
    refreshPreview();

    body.appendChild(
      createSliderRow({
        label: "両端の赤（失敗）の広さ",
        hint: "行きすぎ・早すぎで失敗になる幅。広いほど難しくなります。",
        min: 0,
        max: 50,
        step: 1,
        unit: "%",
        value: Math.round(meter.missEdgeRatio * 100),
        onChange: (v) => {
          updateTuning((t) => void (t.meter.missEdgeRatio = v / 100));
          refreshPreview();
        },
      }),
    );

    body.appendChild(
      createSliderRow({
        label: "黄（Good）の広さ",
        hint: "赤の内側の幅。レア度によっては黄でも成功になります（レア度ごとタブ）。",
        min: 0,
        max: 50,
        step: 1,
        unit: "%",
        value: Math.round(meter.goodBandRatio * 100),
        onChange: (v) => {
          updateTuning((t) => void (t.meter.goodBandRatio = v / 100));
          refreshPreview();
        },
      }),
    );

    body.appendChild(
      createSection("メーターの速さ・回数について", "速さ・必要な成功回数・黄を成功に含めるかは、レア度ごとに決めます。"),
    );
    const link = el("p", "tp-hint", "「レア度ごと」タブで、レア度を選んでから調整してください。");
    body.appendChild(link);
  }

  // --- タブ4: 確率 ---

  private renderProbabilityTab(body: HTMLElement): void {
    const prob = getTuning().probability;

    body.appendChild(
      createSection("レア度の効き方", "レア度が上がるほど、どれくらい急に出にくくなるか。"),
    );
    body.appendChild(
      createSliderRow({
        label: "レア度の効き方（指数）",
        hint: "1 なら差はなだらか。大きいほどレアなものが極端に出にくくなります。",
        min: 1,
        max: 4,
        step: 0.1,
        value: prob.rarityExponent,
        onChange: (v) => {
          updateTuning((t) => void (t.probability.rarityExponent = v));
          this.clearSimulation();
        },
      }),
    );

    body.appendChild(
      createSection("粘りへの救済", "まだ見つけていないアイテムは、投げるほど少しずつ出やすくなります。"),
    );
    body.appendChild(
      createSliderRow({
        label: "1回投げるごとの加算",
        hint: "0 にすると救済なし（完全に運まかせ）。",
        min: 0,
        max: 20,
        step: 1,
        value: prob.pityStep,
        onChange: (v) => {
          updateTuning((t) => void (t.probability.pityStep = v));
          this.clearSimulation();
        },
      }),
    );
    body.appendChild(
      createSliderRow({
        label: "加算の頭打ち",
        hint: "この回数を超えて投げても、それ以上は出やすくなりません。",
        min: 0,
        max: 100,
        step: 1,
        unit: "回",
        value: prob.pityCap,
        onChange: (v) => {
          updateTuning((t) => void (t.probability.pityCap = v));
          this.clearSimulation();
        },
      }),
    );

    body.appendChild(
      createSection("大トリへの救済", "いちばんレアなものは、他を全部見つけてから初めて候補に入ります。"),
    );
    body.appendChild(
      createSliderRow({
        label: "1回投げるごとの加算",
        min: 0,
        max: 20,
        step: 1,
        value: prob.legendaryPityStep,
        onChange: (v) => {
          updateTuning((t) => void (t.probability.legendaryPityStep = v));
          this.clearSimulation();
        },
      }),
    );
    body.appendChild(
      createSliderRow({
        label: "加算の頭打ち",
        min: 0,
        max: 100,
        step: 1,
        unit: "回",
        value: prob.legendaryPityCap,
        onChange: (v) => {
          updateTuning((t) => void (t.probability.legendaryPityCap = v));
          this.clearSimulation();
        },
      }),
    );

    body.appendChild(createSection("アイテムごとの設定", `${STAGE_1.locationLabel} で釣れるもの。`));
    const items = getTuning().items;
    for (const item of STAGE_1.items) {
      const setting = items[item.id];
      if (!setting) continue;
      body.appendChild(
        createSelectRow({
          label: item.name,
          value: setting.rarity,
          choices: RARITY_ORDER.map((r) => ({ value: r, label: STAGE_RARITY_LABELS[r] })),
          onChange: (v) => {
            updateTuning((t) => void (t.items[item.id].rarity = v));
            this.clearSimulation();
            this.renderBody(); // レア度を変えると並びの意味が変わるので描き直す
          },
        }),
      );
      body.appendChild(
        createCheckRow({
          label: "　一度きり（釣ったらもう出ない）",
          value: setting.uniqueCatch,
          onChange: (v) => {
            updateTuning((t) => void (t.items[item.id].uniqueCatch = v));
            this.clearSimulation();
          },
        }),
      );
    }

    body.appendChild(createSection("試し引き", "いまの設定で全種そろえるのに何回投げることになるかを、実際に抽選して調べます。"));
    const resultArea = el("div");
    body.appendChild(
      createButton(
        `${SIMULATION_RUNS} 回ぶん試す`,
        () => {
          this.simulation = simulateStage(getTunedStageItems(STAGE_1), getTuning().probability, SIMULATION_RUNS);
          this.renderSimulation(resultArea);
        },
        "primary",
      ),
    );
    body.appendChild(resultArea);
    this.renderSimulation(resultArea);
  }

  private clearSimulation(): void {
    this.simulation = null;
  }

  private renderSimulation(area: HTMLElement): void {
    area.replaceChildren();
    const result = this.simulation;
    if (!result) {
      area.appendChild(el("p", "tp-hint", "※ 釣りの腕前（フッキングやメーターの成否）は考えず、投げれば必ず釣れる前提で数えます。"));
      return;
    }

    const summary = el("div", "tp-summary");
    summary.appendChild(
      el("div", undefined, `全種そろうまで 平均 ${result.averageCasts.toFixed(1)} 回投げる`),
    );
    summary.appendChild(
      el("div", "tp-hint", `中央値 ${result.medianCasts} 回 ／ 最短 ${result.minCasts} 回 ／ 最長 ${result.maxCasts} 回`),
    );
    if (result.incompleteRuns > 0) {
      summary.appendChild(
        el("div", "tp-warning", `${result.incompleteRuns} 回は上限まで投げても揃いませんでした（設定が厳しすぎます）`),
      );
    }
    area.appendChild(summary);

    const table = el("table", "tp-table");
    const head = el("tr");
    head.appendChild(el("th", undefined, "アイテム"));
    head.appendChild(el("th", undefined, "平均で釣れた回数"));
    head.appendChild(el("th", undefined, "初めて出るまで"));
    table.appendChild(head);

    for (const item of result.perItem) {
      const row = el("tr");
      row.appendChild(el("td", undefined, `${item.name}（${STAGE_RARITY_LABELS[item.rarity]}）`));
      row.appendChild(el("td", undefined, `${item.averageCatches.toFixed(1)} 回`));
      row.appendChild(
        el("td", undefined, Number.isFinite(item.averageFirstCast) ? `${item.averageFirstCast.toFixed(1)} 回目` : "出ず"),
      );
      table.appendChild(row);
    }
    area.appendChild(table);
  }

  // --- タブ5: 救済 ---

  private renderReliefTab(body: HTMLElement): void {
    const relief = getTuning().relief;

    body.appendChild(
      createSection(
        "失敗が続いたときの緩和",
        "同じレア度に何度も逃げられていると、猶予とメーターだけが少しずつ易しくなります。必要な成功回数・ピクンの回数は変わりません。",
      ),
    );

    body.appendChild(
      createSliderRow({
        label: "何回目の失敗から緩めるか",
        hint: "この回数までは、まったく緩みません。",
        min: 0,
        max: 20,
        step: 1,
        unit: "回",
        value: relief.failThreshold,
        onChange: (v) => updateTuning((t) => void (t.relief.failThreshold = v)),
      }),
    );

    body.appendChild(
      createSliderRow({
        label: "1回ごとに猶予を伸ばす量",
        min: 0,
        max: 50,
        step: 1,
        unit: "ms",
        value: relief.hookWindowPerStepMs,
        onChange: (v) => updateTuning((t) => void (t.relief.hookWindowPerStepMs = v)),
      }),
    );

    body.appendChild(
      createSliderRow({
        label: "1回ごとにメーターを遅くする量",
        min: 0,
        max: 50,
        step: 1,
        unit: "ms",
        value: relief.meterFillPerStepMs,
        onChange: (v) => updateTuning((t) => void (t.relief.meterFillPerStepMs = v)),
      }),
    );

    body.appendChild(
      createSection("緩めすぎない歯止め", "どれだけ失敗しても、1つ下のレア度より必ずこれだけは厳しいままにします。"),
    );

    body.appendChild(
      createSliderRow({
        label: "猶予の差",
        min: 0,
        max: 200,
        step: 1,
        unit: "ms",
        value: relief.hookWindowMarginMs,
        onChange: (v) => updateTuning((t) => void (t.relief.hookWindowMarginMs = v)),
      }),
    );

    body.appendChild(
      createSliderRow({
        label: "メーター速さの差",
        min: 0,
        max: 200,
        step: 1,
        unit: "ms",
        value: relief.meterFillMarginMs,
        onChange: (v) => updateTuning((t) => void (t.relief.meterFillMarginMs = v)),
      }),
    );
  }
}

const STYLE_ID = "tuning-panel-style";

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = el("style");
  style.id = STYLE_ID;
  style.textContent = TUNING_PANEL_CSS;
  document.head.appendChild(style);
}

const panel = new TuningPanel();

/** 調整パネルを開く（開いているときは閉じる）。G キーから呼ぶ。 */
export function openTuningPanel(scene: Phaser.Scene): void {
  panel.open(scene);
}

/** 調整パネルが開いているか（シーン側で他の操作を止めたいとき用）。 */
export function isTuningPanelOpen(): boolean {
  return panel.isOpen;
}
