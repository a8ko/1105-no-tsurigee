/**
 * ステージ制のレア度（5段階）。数値が大きいほど珍しい。
 * 旧プロトの Difficulty（EASY〜LEGEND の4段階）とは別物。
 * このステージ制では「レア度＝難易度」を1対1にするため、レア度の値がそのまま
 * 難易度パラメータ（stageDifficulty.ts）を引くキーになる。
 */
export enum StageRarity {
  COMMON = 1, // 普通
  UNCOMMON = 2, // ちょっとレア
  RARE = 3, // レア
  SUPER_RARE = 4, // 凄いレア
  LEGENDARY = 5, // 伝説
}

/** レア度の日本語ラベル（表示用）。 */
export const STAGE_RARITY_LABELS: Readonly<Record<StageRarity, string>> = {
  [StageRarity.COMMON]: "普通",
  [StageRarity.UNCOMMON]: "ちょっとレア",
  [StageRarity.RARE]: "レア",
  [StageRarity.SUPER_RARE]: "凄いレア",
  [StageRarity.LEGENDARY]: "伝説",
};

/**
 * ステージ制の収集物（旧プロトの Catchable とは別の型）。
 * difficulty は持たず、rarity から stageDifficulty.ts のテーブルを引いて難易度を決める。
 */
export interface StageCatchable {
  id: string;
  encyclopediaNumber: number;
  name: string;
  description: string;
  rarity: StageRarity;
  imageKey: string;
  /**
   * true なら「一度きり」の激レア枠：一度釣ったら、そのステージではもう二度と出ない。
   * 省略時（false 相当）は基本どおり何度でも釣れてよい（重複あり）。
   */
  uniqueCatch?: boolean;
}

/**
 * 1つのステージ（＝主人公が「星」と呼んでいる場所）。
 * 全種を最低1回ずつ釣って図鑑を埋めると、そのステージの探索完了になる
 * （※重複ありの抽選なので、埋まるまでの間は同じ種が何度も釣れてよい）。
 */
export interface Stage {
  id: string;
  /** 主人公が勝手にそう呼んでいるだけの場所の名前（惑星ではない）。 */
  locationLabel: string;
  items: readonly StageCatchable[];
}

/** 釣れた直後に出す、バトルコマンド風の選択肢の1つ。 */
export interface PostCatchChoice {
  /** 選択肢の文（例:「しょうゆを一周させる」）。 */
  label: string;
  /** 選んだ直後に出す一言。 */
  reply: string;
  /**
   * true なら「際どい」選択肢。reply の後に一悶着（釣りっぽいミニゲーム）が入り、
   * 成功すればまた選択肢に戻れるが、失敗すると逃げられて釣果が無くなる。
   * 省略時は false（結果が変わらない、雰囲気だけの選択肢）。
   */
  risky?: boolean;
  /** risky のとき、ミニゲームの前に出す一言。省略時は既定の文言を使う。 */
  riskyWarning?: string;
}

/**
 * ステージ1：ファミレスのポール看板の上。
 * 緩いテーマ＝食べ物まわり。かなしい手紙だけ切なさの質が違う「締めの1匹」に配置。
 */
export const STAGE_1: Stage = {
  id: "stage1_familyrestaurant_sign",
  locationLabel: "ファミレスのポール看板の上",
  items: [
    {
      id: "medamayaki",
      encyclopediaNumber: 1,
      name: "目玉焼き",
      description: "サニーサイドアップと呼ばれるほうがうれしいようだ",
      rarity: StageRarity.COMMON,
      imageKey: "catch_medamayaki",
    },
    {
      id: "ikadaikon",
      encyclopediaNumber: 2,
      name: "イカ大根",
      description: "砂糖大さじ2・醤油大さじ1・みりん大さじ1",
      rarity: StageRarity.UNCOMMON,
      imageKey: "catch_ikadaikon",
    },
    {
      id: "eigyo_kyokasho",
      encyclopediaNumber: 3,
      name: "飲食店営業許可証",
      description: "これがあれば、おいしいたらこパスタを出す喫茶店を開くことさえもできるだろう！",
      rarity: StageRarity.RARE,
      imageKey: "catch_eigyo_kyokasho",
    },
    {
      id: "kanashii_tegami",
      encyclopediaNumber: 4,
      name: "かなしい手紙",
      description: "あなたの焼いたアップルパイが好きでした。さようなら",
      rarity: StageRarity.SUPER_RARE,
      imageKey: "catch_kanashii_tegami",
      uniqueCatch: true,
    },
    {
      id: "ham",
      encyclopediaNumber: 5,
      name: "ハム",
      description: "いつも冷蔵庫の底の部分で忘れ去られている",
      rarity: StageRarity.LEGENDARY,
      imageKey: "catch_ham",
    },
  ],
};

/**
 * 釣れた直後に出す、収集物ごとの選択肢（バトルコマンド風）。
 * 今は全種とも無し（一言だけのシンプルな捕獲演出に統一）。
 * ここに1つ増やすだけで、その種の釣果に選択肢が付く仕組み自体は残してある。
 */
export const POST_CATCH_CHOICES: Readonly<Record<string, readonly PostCatchChoice[]>> = {};
