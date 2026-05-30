import { Catalog } from "@/systems/Catalog";
import type { Catchable } from "@/types";

/** 図鑑のソート種別。 */
export type SortMode = "number" | "name" | "rarity";

export const SORT_MODES: readonly SortMode[] = ["number", "name", "rarity"];

export const SORT_LABELS: Record<SortMode, string> = {
  number: "図鑑番号順",
  name: "名前順",
  rarity: "レア度順",
};

/**
 * 図鑑のソートロジック（表示用）。
 * - 図鑑番号順
 * - 名前順
 * - レア度順（レア度降順 / 同レア度内は図鑑番号順）
 *
 * 名前順では、未発見物は実名（隠し名）で並べると「???」表示と矛盾するため、
 * isDiscovered が与えられた場合は発見済みを名前順で先に、未発見を図鑑番号順で後ろに並べる。
 */
export function sortCatchables(mode: SortMode, isDiscovered?: (c: Catchable) => boolean): Catchable[] {
  const list = [...Catalog.all()];
  switch (mode) {
    case "number":
      list.sort((a, b) => a.encyclopediaNumber - b.encyclopediaNumber);
      break;
    case "name":
      list.sort((a, b) => {
        if (isDiscovered) {
          const da = isDiscovered(a);
          const db = isDiscovered(b);
          if (da !== db) return da ? -1 : 1; // 発見済みを先に
          if (!da) return a.encyclopediaNumber - b.encyclopediaNumber; // 未発見同士は番号順
        }
        // 日本語名のロケール比較。同名は図鑑番号順。
        return a.name.localeCompare(b.name, "ja") || a.encyclopediaNumber - b.encyclopediaNumber;
      });
      break;
    case "rarity":
      // レア度降順、同レア度内は図鑑番号昇順
      list.sort((a, b) => b.rarity - a.rarity || a.encyclopediaNumber - b.encyclopediaNumber);
      break;
  }
  return list;
}

/** 次のソート種別を返す（トグル用）。 */
export function nextSortMode(mode: SortMode): SortMode {
  const idx = SORT_MODES.indexOf(mode);
  return SORT_MODES[(idx + 1) % SORT_MODES.length];
}
