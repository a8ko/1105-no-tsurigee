import { StageRarity } from "@/data/stageCatchables";
import { getTuning } from "@/systems/TuningStore";

/**
 * ステージ制のレア度ごとの釣りパラメータ。
 * レア度が高いほど：フッキングの猶予が短く、メーターの必要成功数が多く、
 * 食いつきのフェイント（ピクン）回数が増え、メーターが速くなる。
 *
 * 実際の数値は調整パネル（ゲーム中の G キー）で変えられる。初期値は
 * [`fishingTuning.ts`](fishingTuning.ts) にあり、ここでは「いま使う値」を読むだけ。
 * 触った手ざわりをもとに決めた値は tuning-log.md に履歴として残す。
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

export function getStageDifficultyConfig(rarity: StageRarity): StageDifficultyConfig {
  const r = getTuning().rarities[rarity];
  return {
    hookWindowMs: r.hookWindowMs,
    requiredSuccesses: r.requiredSuccesses,
    allowGood: r.allowGood,
    pikunCountRange: [Math.min(r.pikunMin, r.pikunMax), Math.max(r.pikunMin, r.pikunMax)],
    meterFillMs: r.meterFillMs,
  };
}

/** rarity のひとつ簡単なレア度。普通(COMMON)より下は無いので null。 */
function getNextEasierRarity(rarity: StageRarity): StageRarity | null {
  return rarity > StageRarity.COMMON ? ((rarity - 1) as StageRarity) : null;
}

/**
 * 同じレア度に何度も失敗しているとき、食いつきの猶予とメーターの速さだけを少しずつ緩める。
 * 必要成功回数・Good可否・ピクン回数は変えない（「何度も粘る歯ごたえ」は残す）。
 * 最初の failThreshold 回までは今まで通りの厳しさのまま。それを超えたら、
 * 1回失敗するごとに1段階ずつ緩む。どれだけ失敗しても、ひとつ下のレア度より
 * 必ず厳しい状態を保つ（際限なく簡単にはならない）。
 *
 * 緩和の効き方（何回目から・どれだけ・どこまで）は調整パネルの「救済」タブで変えられる。
 */
export function getRelievedConfig(rarity: StageRarity, failCount: number): StageDifficultyConfig {
  const base = getStageDifficultyConfig(rarity);
  const relief = getTuning().relief;
  const steps = Math.max(failCount - relief.failThreshold, 0);
  if (steps <= 0) return base;

  const easier = getNextEasierRarity(rarity);
  const easierCfg = easier === null ? null : getStageDifficultyConfig(easier);
  const hookWindowCeiling = easierCfg ? easierCfg.hookWindowMs - relief.hookWindowMarginMs : Infinity;
  const meterFillCeiling = easierCfg ? easierCfg.meterFillMs - relief.meterFillMarginMs : Infinity;

  // Math.max(base, …) は保険。調整パネルでレア度どうしの大小を逆転させても、
  // 「緩和したのに元より厳しくなる」ことだけは起きないようにする。
  return {
    ...base,
    hookWindowMs: Math.max(
      base.hookWindowMs,
      Math.min(base.hookWindowMs + steps * relief.hookWindowPerStepMs, hookWindowCeiling),
    ),
    meterFillMs: Math.max(
      base.meterFillMs,
      Math.min(base.meterFillMs + steps * relief.meterFillPerStepMs, meterFillCeiling),
    ),
  };
}
