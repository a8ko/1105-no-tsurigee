import { rollForStage, isLegendaryUnlocked } from "@/systems/StageCatalog";
import type { ProbabilityTuning } from "@/data/fishingTuning";
import type { StageCatchable, StageRarity } from "@/data/stageCatchables";

/** 1回の探索が終わらないまま打ち切る上限（設定が極端なときの保険）。 */
const MAX_CASTS_PER_RUN = 20000;

/** アイテム1つぶんの試し引き結果。 */
export interface SimulatedItem {
  id: string;
  name: string;
  rarity: StageRarity;
  /** 1回の探索（全種そろうまで）で、平均何回釣れたか。 */
  averageCatches: number;
  /** そのアイテムが初めて出るまでの平均キャスト回数。 */
  averageFirstCast: number;
}

/** 試し引き（シミュレーション）の結果。 */
export interface SimulationResult {
  /** 何回ぶん探索を繰り返したか。 */
  runs: number;
  /** 全種そろうまでのキャスト回数の平均。 */
  averageCasts: number;
  /** 同・中央値（半分の人はこの回数以内で揃う、の目安）。 */
  medianCasts: number;
  minCasts: number;
  maxCasts: number;
  perItem: SimulatedItem[];
  /** 上限まで投げても揃わなかった回数（0 でなければ設定が厳しすぎる）。 */
  incompleteRuns: number;
}

/**
 * いまの確率設定で「全種そろえるのに何回投げることになるか」を、実際に抽選を回して調べる。
 *
 * 釣りの腕前（フッキングやメーターの成否）は考えず、投げれば必ず釣れる前提で数える。
 * ここで見たいのは「出やすさのバランス」だけなので、腕前を混ぜないほうが比べやすい。
 */
export function simulateStage(
  items: readonly StageCatchable[],
  probability: ProbabilityTuning,
  runs = 300,
  rng: () => number = Math.random,
): SimulationResult {
  const totalCatches = new Map<string, number>();
  const firstCastSum = new Map<string, number>();
  const firstCastRuns = new Map<string, number>();
  const castsPerRun: number[] = [];
  let incompleteRuns = 0;

  for (let run = 0; run < runs; run++) {
    const caught = new Set<string>();
    let castCount = 0;
    let legendaryUnlockedCastCount = 0;

    while (caught.size < items.length && castCount < MAX_CASTS_PER_RUN) {
      castCount += 1;
      if (isLegendaryUnlocked(items, caught)) {
        legendaryUnlockedCastCount += 1;
      }
      const picked = rollForStage(items, caught, castCount, legendaryUnlockedCastCount, { rng, probability });
      if (!picked) break; // 候補が尽きた（全部が一度きり枠、など）

      totalCatches.set(picked.id, (totalCatches.get(picked.id) ?? 0) + 1);
      if (!caught.has(picked.id)) {
        firstCastSum.set(picked.id, (firstCastSum.get(picked.id) ?? 0) + castCount);
        firstCastRuns.set(picked.id, (firstCastRuns.get(picked.id) ?? 0) + 1);
        caught.add(picked.id);
      }
    }

    if (caught.size < items.length) incompleteRuns += 1;
    castsPerRun.push(castCount);
  }

  const sorted = [...castsPerRun].sort((a, b) => a - b);
  const perItem: SimulatedItem[] = items.map((item) => {
    const seenRuns = firstCastRuns.get(item.id) ?? 0;
    return {
      id: item.id,
      name: item.name,
      rarity: item.rarity,
      averageCatches: (totalCatches.get(item.id) ?? 0) / Math.max(runs, 1),
      averageFirstCast: seenRuns === 0 ? Infinity : (firstCastSum.get(item.id) ?? 0) / seenRuns,
    };
  });

  return {
    runs,
    averageCasts: sorted.reduce((a, b) => a + b, 0) / Math.max(sorted.length, 1),
    medianCasts: sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length / 2)],
    minCasts: sorted[0] ?? 0,
    maxCasts: sorted[sorted.length - 1] ?? 0,
    perItem,
    incompleteRuns,
  };
}
