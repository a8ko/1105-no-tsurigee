/**
 * ステージの探索進捗（探索完了したか・どの種を発見済みか）を localStorage に保存する。
 *
 * 釣り中（SandboxFishingScene）とロケットを調べる場面（WalkSandboxScene）は別シーンで、
 * シーンをまたぐとメモリ上の状態（caught 等）は消えてしまう。図鑑をロケット側から
 * 表示するには発見済み一覧が必要なため、ここへ永続化しておく。
 */
const clearedKey = (stageId: string): string => `tsurigee:sandbox:stage:${stageId}:cleared`;
const caughtKey = (stageId: string): string => `tsurigee:sandbox:stage:${stageId}:caught`;

export function markStageCleared(stageId: string): void {
  try {
    localStorage.setItem(clearedKey(stageId), "1");
  } catch {
    // localStorage が使えない環境（プライベートブラウジング等）でも、ゲーム自体は続行できるよう握りつぶす。
  }
}

export function isStageCleared(stageId: string): boolean {
  try {
    return localStorage.getItem(clearedKey(stageId)) === "1";
  } catch {
    return false;
  }
}

/** そのステージで発見済みのアイテムIDを1つ記録する（重複して呼んでも問題ない）。 */
export function markItemCaught(stageId: string, itemId: string): void {
  try {
    const current = getCaughtItems(stageId);
    if (current.has(itemId)) return;
    current.add(itemId);
    localStorage.setItem(caughtKey(stageId), JSON.stringify([...current]));
  } catch {
    // localStorage が使えない環境でも、ゲーム自体は続行できるよう握りつぶす。
  }
}

/** そのステージで発見済みのアイテムID一覧を取得する（保存が無ければ空集合）。 */
export function getCaughtItems(stageId: string): Set<string> {
  try {
    const raw = localStorage.getItem(caughtKey(stageId));
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((v): v is string => typeof v === "string")) : new Set();
  } catch {
    return new Set();
  }
}
