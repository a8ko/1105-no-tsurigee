// 歩行キャラ・サンドボックスの実機スモークテスト。
// 起動 → 移動でキャラ座標が変わる → 編集モード切替 → 当たり判定の追加 をチェックする。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = "http://localhost:5173/sandbox.html";
const SHOTS = "/tmp/shots-sandbox";
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));

  await page.goto(URL, { waitUntil: "networkidle" });
  const booted = await page
    .waitForFunction(() => !!window.__SANDBOX__, null, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  record("boot: __SANDBOX__ present", booted);

  const S = "WalkSandboxScene";
  const prop = (p) =>
    page.evaluate((p) => {
      const s = window.__SANDBOX__.scene.getScene("WalkSandboxScene");
      const v = s ? s[p] : null;
      return typeof v === "object" && v !== null ? JSON.parse(JSON.stringify({ v })).v : v;
    }, p);

  await page.click("canvas").catch(() => {});
  await sleep(200);
  await page.screenshot({ path: `${SHOTS}/01-start.png` });

  // プレイヤーが生成されているか
  const hasPlayer = await page
    .evaluate(() => !!window.__SANDBOX__.scene.getScene("WalkSandboxScene")?.player)
    .catch(() => false);
  record("player sprite exists", hasPlayer);

  // 移動チェック
  const px = () => page.evaluate(() => window.__SANDBOX__.scene.getScene("WalkSandboxScene").player.x);
  const rectCount = () =>
    page.evaluate(() => window.__SANDBOX__.scene.getScene("WalkSandboxScene").rects.length);

  const x0 = await px();
  await page.keyboard.down("ArrowRight");
  await sleep(500);
  await page.keyboard.up("ArrowRight");
  const x1 = await px();
  record("move: x changed by input", Math.abs(x1 - x0) > 1, `x0=${x0.toFixed(1)} x1=${x1.toFixed(1)}`);

  // アニメ向きチェック
  const facing = await prop("facing");
  record("move: facing updated to right", facing === "right", `facing=${facing}`);

  // 編集モード ON
  await page.keyboard.press("KeyC");
  await sleep(100);
  const editing = await prop("editing");
  record("editor: C toggles editing on", editing === true);

  // マウスドラッグで四角を追加
  const before = await rectCount();
  await page.mouse.move(200, 200);
  await page.mouse.down();
  await page.mouse.move(360, 320, { steps: 5 });
  await page.mouse.up();
  await sleep(100);
  const after = await rectCount();
  record("editor: drag adds a collision rect", after === before + 1, `before=${before} after=${after}`);
  await page.screenshot({ path: `${SHOTS}/02-editor.png` });

  // 削除
  await page.keyboard.press("KeyX");
  await sleep(100);
  const afterDel = await rectCount();
  record("editor: X deletes selected rect", afterDel === before, `count=${afterDel}`);
  void S;

  await browser.close();

  console.log("\n================ SUMMARY ================");
  const passed = results.filter((r) => r.ok).length;
  console.log(`${passed}/${results.length} checks passed`);
  console.log(`console errors: ${errors.length}`);
  for (const e of errors.slice(0, 20)) console.log("  ERR:", e);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log("FAILED CHECKS:");
    for (const f of failed) console.log("  -", f.name, f.detail);
  }
  process.exit(errors.length === 0 && failed.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("SMOKE CRASHED:", e);
  process.exit(2);
});
