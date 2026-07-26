import { StageRarity, STAGE_1 } from "@/data/stageCatchables";

/**
 * ===========================================================================
 *  釣りの手ざわりを決める数値を、ぜんぶ1か所に集めたファイル
 * ===========================================================================
 *
 *  ここに書いてあるのが「初期値」です。ゲーム中に G キーで開く調整パネルで
 *  値を変えると、その値はブラウザに保存され、初期値より優先して使われます。
 *
 *  パネルの「初期値に戻す」を押すと、このファイルの値に戻ります。
 *  調整して気に入った値が決まったら、パネルの「設定をコピー」で書き出して、
 *  ここの初期値として書き込む（＝正式採用する）流れです。
 * ===========================================================================
 */

/** レア度ごとの、釣りの難しさ。 */
export interface RarityTuning {
  /** 「スペース！」が出てから押すまでの猶予 (ms)。短いほどシビア。 */
  hookWindowMs: number;
  /** メーターを何回成功させれば釣り上げられるか。 */
  requiredSuccesses: number;
  /** 黄色（Good）でも成功として数えるか。false なら緑（Perfect）だけ。 */
  allowGood: boolean;
  /** 食いつく前のフェイント（ピクン）の最小回数。 */
  pikunMin: number;
  /** 同・最大回数。 */
  pikunMax: number;
  /** メーターが 0 から満タンになるまでの時間 (ms)。短いほど速くシビア。 */
  meterFillMs: number;
}

/** レア度によらず共通の「間（ま）」。単位はすべて ms。 */
export interface PacingTuning {
  /** 糸を垂らしてから最初の反応が来るまでの待ち時間の下限。 */
  firstDelayMinMs: number;
  /** 同・上限。 */
  firstDelayMaxMs: number;
  /** ピクンとピクンの間隔の下限。 */
  pikunIntervalMinMs: number;
  /** 同・上限。 */
  pikunIntervalMaxMs: number;
  /** 最後のピクンから、本当に食いつく（浮きが沈む）までの下限。 */
  sinkDelayMinMs: number;
  /** 同・上限。 */
  sinkDelayMaxMs: number;
  /** フッキング成功後、メーターが始まるまでスペースを押し続ける時間。 */
  holdToStartMeterMs: number;
}

/**
 * メーターのゾーンの形。バーの左右は対称で、外側から
 * 赤（miss）→ 黄（good）→ 緑（perfect）→ 黄 → 赤 の順に並ぶ。
 * 値はバー全体を 1 としたときの割合。
 */
export interface MeterTuning {
  /** 両端の赤（miss）の幅。 */
  missEdgeRatio: number;
  /** 赤の内側にある黄（good）の幅。 */
  goodBandRatio: number;
}

/** どのアイテムが出やすいかの決め方。 */
export interface ProbabilityTuning {
  /**
   * 出やすさ（重み）の計算に使う指数。
   * 重み ＝ (このステージの最大レア度 + 1 − そのアイテムのレア度) の「指数」乗。
   * 大きいほどレアなものが極端に出にくくなる。1 ならレア度の差がなだらか。
   */
  rarityExponent: number;
  /** 粘る（1回投げる）ごとに、まだ見つけていないアイテムの重みに足す救済値。 */
  pityStep: number;
  /** 上の救済の頭打ち回数（これ以上投げても救済は増えない）。 */
  pityCap: number;
  /** 大トリ（最高レア度）が解禁されてから、1回投げるごとに大トリの重みへ足す救済値。 */
  legendaryPityStep: number;
  /** 同・頭打ち回数。 */
  legendaryPityCap: number;
}

/** 同じレア度に何度も失敗したときに、少しずつ易しくする仕組み。 */
export interface ReliefTuning {
  /** この回数までの失敗は緩和なし。これを超えた分だけ緩み始める。 */
  failThreshold: number;
  /** 1段階ゆるむごとに、フッキング猶予を伸ばす量 (ms)。 */
  hookWindowPerStepMs: number;
  /** 1段階ゆるむごとに、メーターを遅くする量 (ms)。 */
  meterFillPerStepMs: number;
  /** どれだけ緩めても、1つ下のレア度よりこれだけは厳しいままにする猶予の差 (ms)。 */
  hookWindowMarginMs: number;
  /** 同・メーター速度の差 (ms)。 */
  meterFillMarginMs: number;
}

/** アイテム1つぶんの設定（レア度と、一度きり枠かどうか）。 */
export interface ItemTuning {
  rarity: StageRarity;
  /** true なら一度釣ったらそのステージでは二度と出ない。 */
  uniqueCatch: boolean;
}

/** 釣りの調整値ぜんぶ。 */
export interface FishingTuning {
  rarities: Record<StageRarity, RarityTuning>;
  pacing: PacingTuning;
  meter: MeterTuning;
  probability: ProbabilityTuning;
  relief: ReliefTuning;
  /** アイテムID → そのアイテムの設定。 */
  items: Record<string, ItemTuning>;
}

/** 初期値のアイテム設定は、ステージ定義（stageCatchables.ts）から作る。 */
function buildDefaultItems(): Record<string, ItemTuning> {
  const out: Record<string, ItemTuning> = {};
  for (const item of STAGE_1.items) {
    out[item.id] = { rarity: item.rarity, uniqueCatch: item.uniqueCatch === true };
  }
  return out;
}

/** 初期値。調整パネルの「初期値に戻す」はここへ戻る。 */
export const DEFAULT_FISHING_TUNING: FishingTuning = {
  rarities: {
    [StageRarity.COMMON]: {
      hookWindowMs: 600,
      requiredSuccesses: 1,
      allowGood: true,
      pikunMin: 0,
      pikunMax: 2,
      meterFillMs: 2000,
    },
    [StageRarity.UNCOMMON]: {
      hookWindowMs: 520,
      requiredSuccesses: 2,
      allowGood: true,
      pikunMin: 1,
      pikunMax: 3,
      meterFillMs: 1750,
    },
    [StageRarity.RARE]: {
      hookWindowMs: 420,
      requiredSuccesses: 3,
      allowGood: true,
      pikunMin: 2,
      pikunMax: 4,
      meterFillMs: 1500,
    },
    [StageRarity.SUPER_RARE]: {
      hookWindowMs: 320,
      requiredSuccesses: 5,
      allowGood: false,
      pikunMin: 3,
      pikunMax: 5,
      meterFillMs: 1250,
    },
    [StageRarity.LEGENDARY]: {
      hookWindowMs: 220,
      requiredSuccesses: 8,
      allowGood: false,
      pikunMin: 4,
      pikunMax: 6,
      meterFillMs: 1000,
    },
  },
  pacing: {
    firstDelayMinMs: 2500,
    firstDelayMaxMs: 5000,
    pikunIntervalMinMs: 1000,
    pikunIntervalMaxMs: 2200,
    sinkDelayMinMs: 700,
    sinkDelayMaxMs: 1500,
    holdToStartMeterMs: 300,
  },
  meter: {
    missEdgeRatio: 0.13,
    goodBandRatio: 0.2,
  },
  probability: {
    rarityExponent: 2,
    pityStep: 2,
    pityCap: 20,
    legendaryPityStep: 2,
    legendaryPityCap: 20,
  },
  relief: {
    failThreshold: 3,
    hookWindowPerStepMs: 4,
    meterFillPerStepMs: 8,
    hookWindowMarginMs: 4,
    meterFillMarginMs: 10,
  },
  items: buildDefaultItems(),
};

/** 調整値の複製（画面で編集する前に、初期値を壊さないようコピーして使う）。 */
export function cloneTuning(t: FishingTuning): FishingTuning {
  return {
    rarities: {
      [StageRarity.COMMON]: { ...t.rarities[StageRarity.COMMON] },
      [StageRarity.UNCOMMON]: { ...t.rarities[StageRarity.UNCOMMON] },
      [StageRarity.RARE]: { ...t.rarities[StageRarity.RARE] },
      [StageRarity.SUPER_RARE]: { ...t.rarities[StageRarity.SUPER_RARE] },
      [StageRarity.LEGENDARY]: { ...t.rarities[StageRarity.LEGENDARY] },
    },
    pacing: { ...t.pacing },
    meter: { ...t.meter },
    probability: { ...t.probability },
    relief: { ...t.relief },
    items: Object.fromEntries(Object.entries(t.items).map(([id, v]) => [id, { ...v }])),
  };
}

/** メーターのゾーン割合から、緑（perfect）の幅を求める。 */
export function perfectBandRatio(meter: MeterTuning): number {
  return Math.max(0, 1 - 2 * (meter.missEdgeRatio + meter.goodBandRatio));
}

/** レア度の一覧（表示順＝易しい順）。 */
export const RARITY_ORDER: readonly StageRarity[] = [
  StageRarity.COMMON,
  StageRarity.UNCOMMON,
  StageRarity.RARE,
  StageRarity.SUPER_RARE,
  StageRarity.LEGENDARY,
];
