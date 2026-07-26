/**
 * 調整パネルの部品（スライダー・チェックボックス・見出しなど）。
 * ここは「見た目のパーツを作るだけ」の場所で、何を調整するかは TuningPanel.ts が決める。
 */

/** 要素を1つ作るだけの短縮関数。 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface SliderRowOptions {
  label: string;
  /** ラベルの下に出す小さな説明。 */
  hint?: string;
  min: number;
  max: number;
  step: number;
  /** 数値の右に出す単位（"ms" など）。 */
  unit?: string;
  value: number;
  onChange: (value: number) => void;
}

/** スライダー＋数値入力の1行。どちらを動かしても、もう一方に反映される。 */
export function createSliderRow(options: SliderRowOptions): HTMLElement {
  const { label, hint, min, max, step, unit, value, onChange } = options;
  const decimals = decimalsOf(step);

  const row = el("div", "tp-row");
  const head = el("div", "tp-row-head");
  head.appendChild(el("span", "tp-label", label));

  const valueWrap = el("span", "tp-value");
  const numberInput = el("input", "tp-num");
  numberInput.type = "number";
  numberInput.min = String(min);
  numberInput.max = String(max);
  numberInput.step = String(step);
  numberInput.value = format(value, decimals);
  valueWrap.appendChild(numberInput);
  if (unit) valueWrap.appendChild(el("span", "tp-unit", unit));
  head.appendChild(valueWrap);
  row.appendChild(head);

  const range = el("input", "tp-range");
  range.type = "range";
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  range.value = String(value);
  row.appendChild(range);

  if (hint) row.appendChild(el("p", "tp-hint", hint));

  const apply = (raw: number, syncNumber: boolean): void => {
    if (!Number.isFinite(raw)) return;
    const clamped = clamp(raw, min, max);
    range.value = String(clamped);
    if (syncNumber) numberInput.value = format(clamped, decimals);
    onChange(clamped);
  };

  range.addEventListener("input", () => apply(Number(range.value), true));
  // 数値入力は打ち込んでいる途中で勝手に丸めない。入力中は値だけ反映し、
  // 確定（フォーカスを外す・Enter）のときに範囲へ収める。
  numberInput.addEventListener("input", () => {
    const raw = Number(numberInput.value);
    if (numberInput.value !== "" && Number.isFinite(raw)) apply(raw, false);
  });
  numberInput.addEventListener("change", () => apply(Number(numberInput.value), true));

  return row;
}

export interface CheckRowOptions {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

/** チェックボックスの1行。 */
export function createCheckRow(options: CheckRowOptions): HTMLElement {
  const row = el("div", "tp-row");
  const label = el("label", "tp-check");
  const box = el("input");
  box.type = "checkbox";
  box.checked = options.value;
  box.addEventListener("change", () => options.onChange(box.checked));
  label.appendChild(box);
  label.appendChild(el("span", "tp-label", options.label));
  row.appendChild(label);
  if (options.hint) row.appendChild(el("p", "tp-hint", options.hint));
  return row;
}

export interface SelectRowOptions<T extends string | number> {
  label: string;
  hint?: string;
  value: T;
  choices: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

/** プルダウンの1行。 */
export function createSelectRow<T extends string | number>(options: SelectRowOptions<T>): HTMLElement {
  const row = el("div", "tp-row");
  const head = el("div", "tp-row-head");
  head.appendChild(el("span", "tp-label", options.label));

  const select = el("select", "tp-select");
  for (const choice of options.choices) {
    const opt = el("option", undefined, choice.label);
    opt.value = String(choice.value);
    select.appendChild(opt);
  }
  select.value = String(options.value);
  select.addEventListener("change", () => {
    const picked = options.choices.find((c) => String(c.value) === select.value);
    if (picked) options.onChange(picked.value);
  });

  head.appendChild(select);
  row.appendChild(head);
  if (options.hint) row.appendChild(el("p", "tp-hint", options.hint));
  return row;
}

/** セクションの見出し。 */
export function createSection(title: string, hint?: string): HTMLElement {
  const section = el("div", "tp-section");
  section.appendChild(el("h3", "tp-section-title", title));
  if (hint) section.appendChild(el("p", "tp-section-hint", hint));
  return section;
}

/** ボタン。variant で見た目（既定 / 目立たせる / 注意）を切り替える。 */
export function createButton(
  label: string,
  onClick: () => void,
  variant: "default" | "primary" | "danger" = "default",
): HTMLButtonElement {
  const button = el("button", `tp-button tp-button--${variant}`, label);
  button.type = "button";
  button.addEventListener("click", onClick);
  return button;
}

/** 0xrrggbb 形式の色を CSS の #rrggbb に変換する。 */
export function toCssColor(value: number): string {
  return `#${value.toString(16).padStart(6, "0")}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function format(value: number, decimals: number): string {
  return decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
}

/** 刻み幅から、表示に使う小数点以下の桁数を求める（0.05 → 2 桁）。 */
function decimalsOf(step: number): number {
  const text = String(step);
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}
