import type { StageCatchable } from "@/data/stageCatchables";
import type { ProbabilityTuning } from "@/data/fishingTuning";
import { getTuning } from "@/systems/TuningStore";

/** 抽選の細かい振る舞いを差し替えるための任意設定。 */
export interface RollOptions {
  /** 乱数。シミュレーション（試し引き）やテストで差し替える。省略時は Math.random。 */
  rng?: () => number;
  /** 出やすさの設定。省略時は調整パネルの現在値を使う。 */
  probability?: ProbabilityTuning;
}

/**
 * そのステージで最もレアな種（＝「大トリ」）が、他の種を全部発見し終えて
 * 候補に加わる状態になっているかどうか。
 */
export function isLegendaryUnlocked(items: readonly StageCatchable[], caught: ReadonlySet<string>): boolean {
  const overallMaxRarity = items.reduce((m, c) => Math.max(m, c.rarity), 1);
  return items.filter((c) => c.rarity < overallMaxRarity).every((c) => caught.has(c.id));
}

/**
 * ステージの収集物を重み付き抽選する。
 *
 * 基本は重複あり（すでに見つけた種も、また釣れてよい）。
 * ただし `uniqueCatch` な種は、一度釣ったら候補から外れる（そのステージでは二度と出ない）。
 *
 * そのステージで最もレアな種（＝「大トリ」。ステージ1ではハム）は特別扱いする：
 * - それ以外の種を1種でも発見し終えていない間は、大トリは候補に**絶対に**入らない
 *   （運まかせで早々に出てしまうことを完全に無くすため）。
 * - それ以外の種を全部発見し終えたら、大トリも低い重みで候補に加わる。ただし他の種も
 *   引き続き重複ありで候補に残るため、その瞬間にすぐ出るとは限らない。
 * - その状態（大トリがロック解除された状態）でキャストを重ねる（粘る）ほど、
 *   大トリの重みだけが専用の救済でじわじわ上がっていく（確定保証ではない、上限つき）。
 *
 * 重みの式は `(最大レア度+1-rarity)^指数`（既定の指数は 2 ＝ レア度が高いほど二次関数的に出にくい）。
 * まだ見つけていない種（大トリ以外）も、キャスト回数（粘った回数）に応じて
 * 重みを底上げする＝粘るほど出やすくなる緩やかな救済（同じく上限つき）。
 * 指数・救済の強さは調整パネル（G キー）の「確率」タブで変えられる。
 *
 * 全種 uniqueCatch で埋まっている等、候補が尽きた場合は null を返す（保険）。
 */
export function rollForStage(
  items: readonly StageCatchable[],
  caught: ReadonlySet<string>,
  castCount: number,
  legendaryUnlockedCastCount: number,
  options: RollOptions = {},
): StageCatchable | null {
  const rng = options.rng ?? Math.random;
  const prob = options.probability ?? getTuning().probability;

  const overallMaxRarity = items.reduce((m, c) => Math.max(m, c.rarity), 1);
  const legendaryUnlocked = isLegendaryUnlocked(items, caught);

  const candidates = items.filter((c) => {
    if (c.uniqueCatch && caught.has(c.id)) return false;
    if (c.rarity === overallMaxRarity && !legendaryUnlocked) return false; // 大トリはロック解除まで絶対に出さない
    return true;
  });
  if (candidates.length === 0) return null;

  const maxRarity = candidates.reduce((m, c) => Math.max(m, c.rarity), 1);
  const pity = Math.min(castCount, prob.pityCap) * prob.pityStep;
  const legendaryPity = Math.min(legendaryUnlockedCastCount, prob.legendaryPityCap) * prob.legendaryPityStep;
  const weights = candidates.map((c) => {
    const base = maxRarity + 1 - c.rarity;
    const w = Math.pow(base, prob.rarityExponent);
    if (caught.has(c.id)) return w;
    return c.rarity === overallMaxRarity ? w + legendaryPity : w + pity;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i];
    if (r < 0) return candidates[i];
  }
  return candidates[candidates.length - 1];
}
