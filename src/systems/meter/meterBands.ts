import { Palette } from "@/config/constants";
import { getTuning } from "@/systems/TuningStore";
import type { MeterTuning } from "@/data/fishingTuning";
import type { MeterResult } from "./MeterGame";

/** メーターのゾーン（ゲージ値の区間と判定）。from・to はバー全体を 1 としたときの位置。 */
export interface MeterBand {
  from: number;
  to: number;
  result: MeterResult;
  color: number;
}

/**
 * ゾーンの割合設定から、実際のゾーン一覧を作る。
 * 並びは外側から 赤（miss）→ 黄（good）→ 緑（perfect）→ 黄 → 赤 の左右対称。
 * 割合が大きすぎて緑がマイナスになるような設定は、ここで安全な範囲へ丸める。
 *
 * ゲーム本体（SandboxGaugeMeterGame）と調整パネルのプレビューが、
 * 同じ見た目・同じ判定になるよう、計算はこの1か所にまとめている。
 */
export function buildMeterBands(meter: MeterTuning = getTuning().meter): readonly MeterBand[] {
  const miss = clamp(meter.missEdgeRatio, 0, 0.5);
  const good = clamp(meter.goodBandRatio, 0, 0.5 - miss);
  const goodEnd = miss + good;

  return [
    { from: 0, to: miss, result: "miss", color: Palette.miss },
    { from: miss, to: goodEnd, result: "good", color: Palette.good },
    { from: goodEnd, to: 1 - goodEnd, result: "perfect", color: Palette.perfect },
    { from: 1 - goodEnd, to: 1 - miss, result: "good", color: Palette.good },
    { from: 1 - miss, to: 1, result: "miss", color: Palette.miss },
  ];
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}
