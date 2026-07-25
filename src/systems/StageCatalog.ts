import type { StageCatchable } from "@/data/stageCatchables";

/** 1キャストごとに、まだ見つけていない種（大トリ以外）の重みへ加える救済値。 */
const PITY_STEP = 2;
/** 上の救済の頭打ち（この回数ぶんより多くは積み増さない）。 */
const PITY_CAP = 20;

/** 大トリがロック解除されてからのキャスト1回ごとに、大トリの重みへ加える救済値。 */
const LEGENDARY_PITY_STEP = 2;
/** 上の救済の頭打ち。 */
const LEGENDARY_PITY_CAP = 20;

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
 * 重みの式は旧 Catalog.roll() と同じ `(最大レア度+1-rarity)^2`
 * （レア度が高いほど二次関数的に出にくい）。
 * まだ見つけていない種（大トリ以外）も、キャスト回数（粘った回数）に応じて
 * 重みを底上げする＝粘るほど出やすくなる緩やかな救済（同じく上限つき）。
 *
 * 全種 uniqueCatch で埋まっている等、候補が尽きた場合は null を返す（保険）。
 */
export function rollForStage(
  items: readonly StageCatchable[],
  caught: ReadonlySet<string>,
  castCount: number,
  legendaryUnlockedCastCount: number,
  rng: () => number = Math.random,
): StageCatchable | null {
  const overallMaxRarity = items.reduce((m, c) => Math.max(m, c.rarity), 1);
  const legendaryUnlocked = isLegendaryUnlocked(items, caught);

  const candidates = items.filter((c) => {
    if (c.uniqueCatch && caught.has(c.id)) return false;
    if (c.rarity === overallMaxRarity && !legendaryUnlocked) return false; // 大トリはロック解除まで絶対に出さない
    return true;
  });
  if (candidates.length === 0) return null;

  const maxRarity = candidates.reduce((m, c) => Math.max(m, c.rarity), 1);
  const pity = Math.min(castCount, PITY_CAP) * PITY_STEP;
  const legendaryPity = Math.min(legendaryUnlockedCastCount, LEGENDARY_PITY_CAP) * LEGENDARY_PITY_STEP;
  const weights = candidates.map((c) => {
    const base = maxRarity + 1 - c.rarity;
    const w = base * base;
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
