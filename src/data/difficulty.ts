import { Difficulty, type DifficultyConfig } from "@/types";

/**
 * 難易度ごとのパラメータ（仕様書準拠）。
 * 収集物の difficulty からこのテーブルを引いて釣りの挙動を決める。
 */
export const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
  [Difficulty.EASY]: { hookWindowMs: 600, requiredSuccesses: 1, allowGood: true },
  [Difficulty.NORMAL]: { hookWindowMs: 500, requiredSuccesses: 2, allowGood: true },
  [Difficulty.HARD]: { hookWindowMs: 350, requiredSuccesses: 4, allowGood: false },
  [Difficulty.LEGEND]: { hookWindowMs: 250, requiredSuccesses: 8, allowGood: false },
};

export function getDifficultyConfig(difficulty: Difficulty): DifficultyConfig {
  return DIFFICULTY_CONFIGS[difficulty];
}

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  [Difficulty.EASY]: "EASY",
  [Difficulty.NORMAL]: "NORMAL",
  [Difficulty.HARD]: "HARD",
  [Difficulty.LEGEND]: "LEGEND",
};

export function getDifficultyLabel(difficulty: Difficulty): string {
  return DIFFICULTY_LABELS[difficulty];
}
