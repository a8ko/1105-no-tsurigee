import { Difficulty, type Catchable } from "@/types";

/**
 * 収集物データテーブル。
 *
 * ここに 1 行追加するだけで新しい収集物が釣れるようになる（ロジック変更不要）。
 * imageKey は BootScene でプレースホルダーテクスチャが自動生成される。
 * 実素材を用意した場合は同じ imageKey でロードすれば差し替えられる。
 */
export const CATCHABLES: readonly Catchable[] = [
  {
    id: "aji",
    encyclopediaNumber: 1,
    name: "アジ",
    description: "どこでもよく釣れる青魚。塩焼きにすると香ばしい。",
    rarity: 1,
    difficulty: Difficulty.EASY,
    imageKey: "catch_aji",
  },
  {
    id: "iwashi",
    encyclopediaNumber: 2,
    name: "イワシ",
    description: "群れで泳ぐ小魚。手のひらサイズだが侮れない引き。",
    rarity: 1,
    difficulty: Difficulty.EASY,
    imageKey: "catch_iwashi",
  },
  {
    id: "furugutsu",
    encyclopediaNumber: 3,
    name: "ふるい長靴",
    description: "誰かが落とした長靴。魚ではないが立派な釣果である。",
    rarity: 1,
    difficulty: Difficulty.EASY,
    imageKey: "catch_furugutsu",
  },
  {
    id: "akikan",
    encyclopediaNumber: 4,
    name: "あき缶",
    description: "潮にもまれてつるつるになった空き缶。持ち帰って捨てよう。",
    rarity: 1,
    difficulty: Difficulty.EASY,
    imageKey: "catch_akikan",
  },
  {
    id: "saba",
    encyclopediaNumber: 5,
    name: "サバ",
    description: "脂ののった回遊魚。鮮度が落ちるのが早い。",
    rarity: 2,
    difficulty: Difficulty.NORMAL,
    imageKey: "catch_saba",
  },
  {
    id: "kurage",
    encyclopediaNumber: 6,
    name: "クラゲ",
    description: "ふわふわ漂う海の住人。触ると少しピリッとする。",
    rarity: 2,
    difficulty: Difficulty.NORMAL,
    imageKey: "catch_kurage",
  },
  {
    id: "lure",
    encyclopediaNumber: 7,
    name: "なくしたルアー",
    description: "前の釣り人が根がかりさせたルアー。まだ使えそうだ。",
    rarity: 2,
    difficulty: Difficulty.NORMAL,
    imageKey: "catch_lure",
  },
  {
    id: "tai",
    encyclopediaNumber: 8,
    name: "タイ",
    description: "めでたい高級魚。鮮やかな桜色が美しい。",
    rarity: 3,
    difficulty: Difficulty.NORMAL,
    imageKey: "catch_tai",
  },
  {
    id: "suzuki",
    encyclopediaNumber: 9,
    name: "スズキ",
    description: "成長で名前が変わる出世魚。力強い引きを見せる。",
    rarity: 3,
    difficulty: Difficulty.HARD,
    imageKey: "catch_suzuki",
  },
  {
    id: "hirame",
    encyclopediaNumber: 10,
    name: "ヒラメ",
    description: "砂地にひそむ平たい魚。両目が体の片側に寄っている。",
    rarity: 4,
    difficulty: Difficulty.HARD,
    imageKey: "catch_hirame",
  },
  {
    id: "tako",
    encyclopediaNumber: 11,
    name: "タコ",
    description: "八本足の知恵者。吸盤でがっちり抵抗してくる。",
    rarity: 4,
    difficulty: Difficulty.HARD,
    imageKey: "catch_tako",
  },
  {
    id: "maguro",
    encyclopediaNumber: 12,
    name: "マグロ",
    description: "海を駆ける巨大魚。ベランダから釣れたら大事件だ。",
    rarity: 5,
    difficulty: Difficulty.LEGEND,
    imageKey: "catch_maguro",
  },
  {
    id: "takarabako",
    encyclopediaNumber: 13,
    name: "宝箱",
    description: "海底に沈んでいた古い宝箱。中身はまだ開けていない。",
    rarity: 5,
    difficulty: Difficulty.LEGEND,
    imageKey: "catch_takarabako",
  },
  {
    id: "ningyo",
    encyclopediaNumber: 14,
    name: "人魚",
    description: "伝説の海の住人。釣り上げた者には幸運が訪れるという。",
    rarity: 5,
    difficulty: Difficulty.LEGEND,
    imageKey: "catch_ningyo",
  },
];

/** 図鑑の総数。 */
export const CATCHABLE_COUNT = CATCHABLES.length;
