import { StageRarity } from "@/data/stageCatchables";

/**
 * ステージ制のレア度ごとの釣りパラメータ（叩き台の初期値）。
 * レア度が高いほど：フッキングの猶予が短く、メーターの必要成功数が多く、
 * 食いつきのフェイント（ピクン）回数が増え、メーターが速くなる。
 * 数値は試作用の仮決め。実際に触った手ざわりをもとに tuning-log.md で調整していく。
 */
export interface StageDifficultyConfig {
  /** フッキング成功判定の猶予時間 (ms)。 */
  hookWindowMs: number;
  /** ヒットフェーズ（メーター）で必要な成功回数。 */
  requiredSuccesses: number;
  /** Good 判定を成功として扱うか。 */
  allowGood: boolean;
  /** 食いつきのフェイント（ピクン）回数の範囲 [最小, 最大]（両端を含む）。 */
  pikunCountRange: readonly [number, number];
  /** メーターが 0→満タンに達するまでの時間 (ms)。小さいほど速く、シビアになる。 */
  meterFillMs: number;
}

export const STAGE_DIFFICULTY_CONFIGS: Readonly<Record<StageRarity, StageDifficultyConfig>> = {
  [StageRarity.COMMON]: {
    hookWindowMs: 600,
    requiredSuccesses: 1,
    allowGood: true,
    pikunCountRange: [0, 2],
    meterFillMs: 2000,
  },
  [StageRarity.UNCOMMON]: {
    hookWindowMs: 520,
    requiredSuccesses: 2,
    allowGood: true,
    pikunCountRange: [1, 3],
    meterFillMs: 1750,
  },
  [StageRarity.RARE]: {
    hookWindowMs: 420,
    requiredSuccesses: 3,
    allowGood: true,
    pikunCountRange: [2, 4],
    meterFillMs: 1500,
  },
  [StageRarity.SUPER_RARE]: {
    hookWindowMs: 320,
    requiredSuccesses: 5,
    allowGood: false,
    pikunCountRange: [3, 5],
    meterFillMs: 1250,
  },
  [StageRarity.LEGENDARY]: {
    hookWindowMs: 220,
    requiredSuccesses: 8,
    allowGood: false,
    pikunCountRange: [4, 6],
    meterFillMs: 1000,
  },
};

export function getStageDifficultyConfig(rarity: StageRarity): StageDifficultyConfig {
  return STAGE_DIFFICULTY_CONFIGS[rarity];
}

/** この回数までの失敗は今まで通り（緩和なし）。これを超えた分だけ緩和が始まる。 */
const FAIL_RELIEF_THRESHOLD = 3;
/** 閾値を超えてからは、1回失敗するごとに1段階緩和する。1段階あたりの緩和幅。 */
const HOOK_WINDOW_RELIEF_PER_STEP_MS = 4;
const METER_FILL_RELIEF_PER_STEP_MS = 8;
/** 緩和しても、1つ下のレア度よりこれだけは厳しい状態を保つ（このマージンより先へは緩めない）。 */
const HOOK_WINDOW_MARGIN_MS = 4;
const METER_FILL_MARGIN_MS = 10;

/** rarity のひとつ簡単なレア度。普通(COMMON)より下は無いので null。 */
function getNextEasierRarity(rarity: StageRarity): StageRarity | null {
  return rarity > StageRarity.COMMON ? ((rarity - 1) as StageRarity) : null;
}

/**
 * 同じレア度に何度も失敗しているとき、食いつきの猶予とメーターの速さだけを少しずつ緩める。
 * 必要成功回数・Good可否・ピクン回数は変えない（「何度も粘る歯ごたえ」は残す）。
 * 最初の FAIL_RELIEF_THRESHOLD 回までは今まで通りの厳しさのまま。それを超えたら、
 * 1回失敗するごとに1段階ずつ緩む。どれだけ失敗しても、ひとつ下のレア度より
 * 必ず厳しい状態を保つ（際限なく簡単にはならない）。
 */
export function getRelievedConfig(rarity: StageRarity, failCount: number): StageDifficultyConfig {
  const base = STAGE_DIFFICULTY_CONFIGS[rarity];
  const steps = Math.max(failCount - FAIL_RELIEF_THRESHOLD, 0);
  if (steps <= 0) return base;

  const easier = getNextEasierRarity(rarity);
  const hookWindowCeiling = easier ? STAGE_DIFFICULTY_CONFIGS[easier].hookWindowMs - HOOK_WINDOW_MARGIN_MS : Infinity;
  const meterFillCeiling = easier ? STAGE_DIFFICULTY_CONFIGS[easier].meterFillMs - METER_FILL_MARGIN_MS : Infinity;

  return {
    ...base,
    hookWindowMs: Math.min(base.hookWindowMs + steps * HOOK_WINDOW_RELIEF_PER_STEP_MS, hookWindowCeiling),
    meterFillMs: Math.min(base.meterFillMs + steps * METER_FILL_RELIEF_PER_STEP_MS, meterFillCeiling),
  };
}
