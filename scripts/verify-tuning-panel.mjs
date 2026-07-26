// 釣り調整パネル(TuningPanel) の実機検証。
// G キーで開く／タブが動く／値がブラウザに保存される／閉じるとゲームが再開する／
// 変えた値が次のキャストに効く、までを実際の操作で確かめる。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = "http://localhost:5173/sandbox.html";
const SHOTS =
  "/private/tmp/claude-501/-Users-uemura-Projects-1105-no-tsurigee/597b1fc8-0d44-485f-ace6-233f96b28408/scratchpad/shots";
mkdirSync(SHOTS, { recursive: true });

const STORAGE_KEY = "tsurigee:sandbox:fishingTuning:v1";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tapSpace = async (page) => {
  await page.keyboard.down("Space");
  await sleep(50);
  await page.keyboard.up("Space");
};

const errors = [];
const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

/** スライダーを動かす（実際のユーザー操作と同じ input イベントを起こす）。 */
const dragSlider = (page, index, value) =>
  page.evaluate(
    ({ index, value }) => {
      const range = document.querySelectorAll(".tp-range")[index];
      range.value = String(value);
      range.dispatchEvent(new Event("input", { bubbles: true }));
    },
    { index, value },
  );

const readSaved = (page, key) =>
  page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, STORAGE_KEY);

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on("dialog", (d) => d.accept()); // 「初期値に戻す」の確認ダイアログ

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY);
  await page.reload({ waitUntil: "networkidle" });

  const booted = await page
    .waitForFunction(() => !!window.__SANDBOX__, null, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  record("boot: __SANDBOX__ present", booted);
  await page.click("canvas").catch(() => {});
  await sleep(150);

  // --- 1) G キーで開く / ゲームが止まる ---
  await page.keyboard.press("KeyG");
  await sleep(200);
  const opened = await page.evaluate(() => ({
    panel: !!document.querySelector(".tp-root"),
    paused: window.__SANDBOX__.scene.isPaused("WalkSandboxScene"),
    keyboardEnabled: window.__SANDBOX__.scene.getScene("WalkSandboxScene").input.keyboard.enabled,
    tabs: document.querySelectorAll(".tp-tab").length,
  }));
  record(
    "open: G opens panel, pauses scene, disables game keys",
    opened.panel === true && opened.paused === true && opened.keyboardEnabled === false && opened.tabs === 5,
    JSON.stringify(opened),
  );
  await page.screenshot({ path: `${SHOTS}/tuning-01-open.png` });

  // --- 2) レア度のサブタブ + スライダーで値が保存される ---
  await dragSlider(page, 0, 900); // 「普通」のフッキング猶予
  await sleep(120);
  let saved = await readSaved(page);
  record(
    "edit: slider writes to localStorage",
    saved?.rarities?.["1"]?.hookWindowMs === 900,
    `hookWindowMs(普通)=${saved?.rarities?.["1"]?.hookWindowMs}`,
  );

  await page.locator(".tp-subtab", { hasText: "伝説" }).click();
  await sleep(150);
  await dragSlider(page, 0, 400); // 「伝説」のフッキング猶予
  await sleep(120);
  saved = await readSaved(page);
  record(
    "edit: rarity subtab switches which rarity is edited",
    saved?.rarities?.["5"]?.hookWindowMs === 400 && saved?.rarities?.["1"]?.hookWindowMs === 900,
    `伝説=${saved?.rarities?.["5"]?.hookWindowMs} / 普通=${saved?.rarities?.["1"]?.hookWindowMs}`,
  );

  // --- 3) 各タブが開ける ---
  for (const label of ["テンポ", "メーター", "確率", "救済"]) {
    await page.locator(".tp-tab", { hasText: label }).click();
    await sleep(150);
    const rows = await page.evaluate(() => document.querySelectorAll(".tp-body .tp-row").length);
    record(`tab: ${label} renders controls`, rows > 0, `rows=${rows}`);
  }

  // --- 4) メーターのゾーン: スライダーでプレビューが変わる ---
  await page.locator(".tp-tab", { hasText: "メーター" }).click();
  await sleep(150);
  const beforeZones = await page.evaluate(() =>
    [...document.querySelectorAll(".tp-meter-zone")].map((z) => z.style.width),
  );
  await dragSlider(page, 0, 25); // 赤の幅 25%
  await sleep(150);
  const afterZones = await page.evaluate(() => ({
    widths: [...document.querySelectorAll(".tp-meter-zone")].map((z) => z.style.width),
    legend: document.querySelector(".tp-meter-legend")?.textContent ?? "",
  }));
  saved = await readSaved(page);
  record(
    "meter: zone slider updates preview and saves ratio",
    afterZones.widths[0] === "25%" &&
      JSON.stringify(beforeZones) !== JSON.stringify(afterZones.widths) &&
      saved?.meter?.missEdgeRatio === 0.25,
    `${JSON.stringify(afterZones)} / saved=${saved?.meter?.missEdgeRatio}`,
  );
  await page.screenshot({ path: `${SHOTS}/tuning-02-meter.png` });

  // --- 5) 確率タブ: 試し引きが結果を出す ---
  await page.locator(".tp-tab", { hasText: "確率" }).click();
  await sleep(150);
  await page.locator(".tp-button", { hasText: "回ぶん試す" }).click();
  await sleep(1200);
  const sim = await page.evaluate(() => ({
    summary: document.querySelector(".tp-summary")?.textContent ?? "",
    rows: document.querySelectorAll(".tp-table tr").length,
  }));
  record(
    "probability: simulation produces a summary and per-item rows",
    /平均 [\d.]+ 回投げる/.test(sim.summary) && sim.rows === 6, // 見出し + アイテム5種
    JSON.stringify(sim),
  );
  await page.screenshot({ path: `${SHOTS}/tuning-03-simulation.png` });

  // --- 6) Esc で閉じる / ゲームが再開する ---
  await page.keyboard.press("Escape");
  await sleep(250);
  const closed = await page.evaluate(() => ({
    panel: !!document.querySelector(".tp-root"),
    paused: window.__SANDBOX__.scene.isPaused("WalkSandboxScene"),
    keyboardEnabled: window.__SANDBOX__.scene.getScene("WalkSandboxScene").input.keyboard.enabled,
  }));
  record(
    "close: Esc closes panel, resumes scene, re-enables game keys",
    closed.panel === false && closed.paused === false && closed.keyboardEnabled === true,
    JSON.stringify(closed),
  );

  // --- 7) リロードしても保存が残る ---
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => !!window.__SANDBOX__, null, { timeout: 8000 });
  await page.click("canvas").catch(() => {});
  await page.keyboard.press("KeyG");
  await sleep(250);
  const restored = await page.evaluate(() => ({
    num: document.querySelector(".tp-num")?.value ?? null,
    modified: document.querySelector(".tp-note")?.textContent ?? "",
  }));
  record(
    "persist: reload restores edited value into the panel",
    restored.num === "900" && restored.modified.includes("初期値から変更されています"),
    JSON.stringify(restored),
  );
  await page.keyboard.press("Escape");
  await sleep(200);

  // --- 8) 釣りシーンでも開ける / 変えた値が次のキャストに効く ---
  await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("WalkSandboxScene");
    s.pos.x = 563;
    s.pos.y = 599;
  });
  await sleep(250);
  await tapSpace(page); // 「つりする？」→「うん。」
  await sleep(350);
  const inFishing = await page.evaluate(() => window.__SANDBOX__.scene.isActive("SandboxFishingScene"));
  record("fishing: entered SandboxFishingScene", inFishing === true);

  await page.keyboard.press("KeyG");
  await sleep(250);
  const openedInFishing = await page.evaluate(() => ({
    panel: !!document.querySelector(".tp-root"),
    paused: window.__SANDBOX__.scene.isPaused("SandboxFishingScene"),
  }));
  record(
    "fishing: G opens panel and pauses the fishing scene",
    openedInFishing.panel === true && openedInFishing.paused === true,
    JSON.stringify(openedInFishing),
  );
  await page.screenshot({ path: `${SHOTS}/tuning-04-in-fishing.png` });

  // 全レア度のフッキング猶予を同じ値にして、次のキャストで必ずその値になるようにする。
  for (const label of ["普通", "ちょっとレア", "レア", "凄いレア", "伝説"]) {
    await page.locator(".tp-subtab", { hasText: new RegExp(`^${label}$`) }).click();
    await sleep(120);
    await dragSlider(page, 0, 1230);
    await sleep(80);
  }
  await page.keyboard.press("Escape");
  await sleep(250);

  // 次のキャストを起こして、そのときの難易度設定を読む。
  await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("SandboxFishingScene");
    s["startCast"]();
  });
  await sleep(300);
  const applied = await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("SandboxFishingScene");
    return { hookWindowMs: s.cfg?.hookWindowMs ?? null, targetId: s.target?.id ?? null };
  });
  record(
    "apply: edited hook window is used by the next cast",
    applied.hookWindowMs === 1230,
    JSON.stringify(applied),
  );

  // --- 9) 初期値に戻す ---
  await page.keyboard.press("KeyG");
  await sleep(250);
  await page.locator(".tp-button", { hasText: "初期値に戻す" }).click();
  await sleep(300);
  // 直前の操作で選んでいたレア度（伝説）のまま描き直されるので、「普通」に戻して初期値を確かめる。
  await page.locator(".tp-subtab", { hasText: /^普通$/ }).click();
  await sleep(150);
  const afterReset = await page.evaluate(
    (key) => ({
      storage: localStorage.getItem(key),
      num: document.querySelector(".tp-num")?.value ?? null,
      note: document.querySelector(".tp-note")?.textContent ?? "",
    }),
    STORAGE_KEY,
  );
  record(
    "reset: restores defaults and clears the saved data",
    afterReset.storage === null && afterReset.num === "600" && afterReset.note === "",
    JSON.stringify(afterReset),
  );
  await page.keyboard.press("Escape");
  await sleep(200);

  record("console: no errors", errors.length === 0, errors.join(" | "));

  await page.screenshot({ path: `${SHOTS}/tuning-05-final.png` });
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
