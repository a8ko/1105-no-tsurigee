import {
  DEFAULT_FISHING_TUNING,
  RARITY_ORDER,
  cloneTuning,
  type FishingTuning,
  type ItemTuning,
  type MeterTuning,
  type PacingTuning,
  type ProbabilityTuning,
  type RarityTuning,
  type ReliefTuning,
} from "@/data/fishingTuning";
import { StageRarity, type Stage, type StageCatchable } from "@/data/stageCatchables";

/**
 * 釣りの調整値の保管庫。
 *
 * ゲーム中の調整パネル（G キー）で変えた値をブラウザ（localStorage）に覚えておき、
 * ゲーム側からは常に getTuning() で「いま使うべき値」を読む。
 * 保存が無い・壊れているときは、fishingTuning.ts の初期値をそのまま使う。
 */
const STORAGE_KEY = "tsurigee:sandbox:fishingTuning:v1";

type Listener = (tuning: FishingTuning) => void;

const listeners = new Set<Listener>();
let current: FishingTuning = loadFromStorage();

/** いま使う調整値（読み取り専用のつもりで扱う。変えるときは updateTuning を使う）。 */
export function getTuning(): FishingTuning {
  return current;
}

/** 調整値を書き換えて保存する。書き換えは渡した関数の中で行う。 */
export function updateTuning(mutate: (draft: FishingTuning) => void): void {
  const draft = cloneTuning(current);
  mutate(draft);
  current = draft;
  saveToStorage(current);
  notify();
}

/** 調整値をまるごと差し替えて保存する。 */
export function setTuning(next: FishingTuning): void {
  current = cloneTuning(next);
  saveToStorage(current);
  notify();
}

/** 初期値（fishingTuning.ts）に戻し、ブラウザの保存も消す。 */
export function resetTuning(): void {
  current = cloneTuning(DEFAULT_FISHING_TUNING);
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 保存できない環境でも、メモリ上の値は戻っているのでゲームは続けられる。
  }
  notify();
}

/** 調整値が変わったときに呼ばれる関数を登録する。戻り値を呼ぶと解除。 */
export function subscribeTuning(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** いまの調整値を、そのまま貼り付けられる JSON 文字列にする。 */
export function tuningToJson(): string {
  return JSON.stringify(current, null, 2);
}

/** 初期値と違う項目があるか（パネルに「変更あり」を出すため）。 */
export function isTuningModified(): boolean {
  return JSON.stringify(current) !== JSON.stringify(DEFAULT_FISHING_TUNING);
}

/**
 * 調整パネルでのレア度・一度きり枠の変更を反映したアイテム一覧を返す。
 * ステージ定義（stageCatchables.ts）そのものは書き換えず、読むときに重ねる。
 */
export function getTunedStageItems(stage: Stage): readonly StageCatchable[] {
  const items = current.items;
  return stage.items.map((item) => {
    const override = items[item.id];
    if (!override) return item;
    return { ...item, rarity: override.rarity, uniqueCatch: override.uniqueCatch };
  });
}

function notify(): void {
  for (const fn of listeners) fn(current);
}

function saveToStorage(tuning: FishingTuning): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tuning));
  } catch {
    // プライベートブラウジング等で保存できなくても、そのセッション中は調整を続けられる。
  }
}

function loadFromStorage(): FishingTuning {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneTuning(DEFAULT_FISHING_TUNING);
    return mergeWithDefaults(JSON.parse(raw));
  } catch {
    return cloneTuning(DEFAULT_FISHING_TUNING);
  }
}

// --- 保存された値の取り込み（欠けている・壊れている項目は初期値で埋める） ---

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function mergeWithDefaults(saved: unknown): FishingTuning {
  const s = asRecord(saved);
  const d = DEFAULT_FISHING_TUNING;

  const savedRarities = asRecord(s.rarities);
  const rarities = {} as Record<StageRarity, RarityTuning>;
  for (const rarity of RARITY_ORDER) {
    rarities[rarity] = mergeRarity(savedRarities[String(rarity)], d.rarities[rarity]);
  }

  return {
    rarities,
    pacing: mergePacing(s.pacing, d.pacing),
    meter: mergeMeter(s.meter, d.meter),
    probability: mergeProbability(s.probability, d.probability),
    relief: mergeRelief(s.relief, d.relief),
    items: mergeItems(s.items, d.items),
  };
}

function mergeRarity(saved: unknown, d: RarityTuning): RarityTuning {
  const s = asRecord(saved);
  return {
    hookWindowMs: num(s.hookWindowMs, d.hookWindowMs),
    requiredSuccesses: num(s.requiredSuccesses, d.requiredSuccesses),
    allowGood: bool(s.allowGood, d.allowGood),
    pikunMin: num(s.pikunMin, d.pikunMin),
    pikunMax: num(s.pikunMax, d.pikunMax),
    meterFillMs: num(s.meterFillMs, d.meterFillMs),
  };
}

function mergePacing(saved: unknown, d: PacingTuning): PacingTuning {
  const s = asRecord(saved);
  return {
    firstDelayMinMs: num(s.firstDelayMinMs, d.firstDelayMinMs),
    firstDelayMaxMs: num(s.firstDelayMaxMs, d.firstDelayMaxMs),
    pikunIntervalMinMs: num(s.pikunIntervalMinMs, d.pikunIntervalMinMs),
    pikunIntervalMaxMs: num(s.pikunIntervalMaxMs, d.pikunIntervalMaxMs),
    sinkDelayMinMs: num(s.sinkDelayMinMs, d.sinkDelayMinMs),
    sinkDelayMaxMs: num(s.sinkDelayMaxMs, d.sinkDelayMaxMs),
    holdToStartMeterMs: num(s.holdToStartMeterMs, d.holdToStartMeterMs),
  };
}

function mergeMeter(saved: unknown, d: MeterTuning): MeterTuning {
  const s = asRecord(saved);
  return {
    missEdgeRatio: num(s.missEdgeRatio, d.missEdgeRatio),
    goodBandRatio: num(s.goodBandRatio, d.goodBandRatio),
  };
}

function mergeProbability(saved: unknown, d: ProbabilityTuning): ProbabilityTuning {
  const s = asRecord(saved);
  return {
    rarityExponent: num(s.rarityExponent, d.rarityExponent),
    pityStep: num(s.pityStep, d.pityStep),
    pityCap: num(s.pityCap, d.pityCap),
    legendaryPityStep: num(s.legendaryPityStep, d.legendaryPityStep),
    legendaryPityCap: num(s.legendaryPityCap, d.legendaryPityCap),
  };
}

function mergeRelief(saved: unknown, d: ReliefTuning): ReliefTuning {
  const s = asRecord(saved);
  return {
    failThreshold: num(s.failThreshold, d.failThreshold),
    hookWindowPerStepMs: num(s.hookWindowPerStepMs, d.hookWindowPerStepMs),
    meterFillPerStepMs: num(s.meterFillPerStepMs, d.meterFillPerStepMs),
    hookWindowMarginMs: num(s.hookWindowMarginMs, d.hookWindowMarginMs),
    meterFillMarginMs: num(s.meterFillMarginMs, d.meterFillMarginMs),
  };
}

/**
 * アイテム設定のマージ。キーは初期値（＝いま存在するアイテム）を基準にする。
 * 設定ファイルからアイテムが消えたら、保存に残っていても捨てる。
 */
function mergeItems(saved: unknown, d: Record<string, ItemTuning>): Record<string, ItemTuning> {
  const s = asRecord(saved);
  const out: Record<string, ItemTuning> = {};
  for (const [id, def] of Object.entries(d)) {
    const item = asRecord(s[id]);
    const rarity = num(item.rarity, def.rarity);
    out[id] = {
      rarity: RARITY_ORDER.includes(rarity as StageRarity) ? (rarity as StageRarity) : def.rarity,
      uniqueCatch: bool(item.uniqueCatch, def.uniqueCatch),
    };
  }
  return out;
}
