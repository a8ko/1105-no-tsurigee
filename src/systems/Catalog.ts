import { CATCHABLES } from "@/data/catchables";
import type { Catchable } from "@/types";

/**
 * 収集物カタログ。データテーブル (CATCHABLES) への問い合わせと抽選を担う。
 * 収集物を追加してもここを変更する必要はない（データ駆動）。
 */
class CatalogService {
  private readonly byId: Map<string, Catchable>;

  constructor(private readonly items: readonly Catchable[]) {
    if (items.length === 0) {
      throw new Error("Catalog: 収集物データテーブルが空です。");
    }
    this.byId = new Map(items.map((c) => [c.id, c]));
  }

  all(): readonly Catchable[] {
    return this.items;
  }

  getById(id: string): Catchable | undefined {
    return this.byId.get(id);
  }

  /**
   * 釣果を 1 つ抽選する。レア度が高いほど出にくい重み付け。
   * 乱数は Phaser の乱数 API を使い、テスト容易性のため引数で差し替え可能にする。
   */
  roll(rng: () => number = Math.random): Catchable {
    // weight = (maxRarity + 1 - rarity)^2  → レア度が高いほど指数的に出にくい
    const maxRarity = this.items.reduce((m, c) => Math.max(m, c.rarity), 1);
    const weights = this.items.map((c) => {
      const w = maxRarity + 1 - c.rarity;
      return w * w;
    });
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng() * total;
    for (let i = 0; i < this.items.length; i++) {
      r -= weights[i];
      if (r < 0) {
        return this.items[i];
      }
    }
    // 数値誤差のフォールバック
    return this.items[this.items.length - 1];
  }
}

export const Catalog = new CatalogService(CATCHABLES);
