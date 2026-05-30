// 実機スモークテスト：システムChromeを使い、タイトル→部屋→ベランダ→釣り→釣果→図鑑を
// 実際のキー操作で駆動し、コンソールエラーとスクリーンショットを収集する。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = "http://localhost:5173/";
const SHOTS = "/tmp/shots";
mkdirSync(SHOTS, { recursive: true });

const errors = [];
const logs = [];
const results = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });

  page.on("console", (m) => {
    const t = m.type();
    logs.push(`[${t}] ${m.text()}`);
    if (t === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));

  await page.goto(URL, { waitUntil: "networkidle" });

  // ゲームインスタンスとアクティブシーンの取得ヘルパ
  const activeScenes = () =>
    page.evaluate(() => {
      const g = window.__GAME__;
      if (!g) return null;
      return g.scene.getScenes(true).map((s) => s.scene.key);
    });
  const sceneProp = (key, prop) =>
    page.evaluate(
      ([k, p]) => {
        const g = window.__GAME__;
        const s = g?.scene.getScene(k);
        return s ? s[p] : null;
      },
      [key, prop],
    );
  const setPlayer = (key, x, y) =>
    page.evaluate(
      ([k, x, y]) => {
        const s = window.__GAME__?.scene.getScene(k);
        if (s && s.player) s.player.setPosition(x, y);
      },
      [key, x, y],
    );

  async function waitScene(key, timeout = 6000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const a = await activeScenes();
      if (a && a.includes(key)) return true;
      await sleep(60);
    }
    return false;
  }

  function record(name, ok, detail = "") {
    results.push({ name, ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  }

  // --- 1. ブート & タイトル ---
  const booted = await page.waitForFunction(() => !!window.__GAME__, null, { timeout: 8000 }).then(() => true).catch(() => false);
  record("boot: __GAME__ present", booted);
  const titleOk = await waitScene("TitleScene");
  record("scene: TitleScene active", titleOk);
  await page.screenshot({ path: `${SHOTS}/01-title.png` });

  // フォーカス確保（キーイベントを window に届ける）
  await page.click("canvas").catch(() => {});

  // --- 2. はじめる → 部屋 ---
  await page.keyboard.press("Space");
  const roomOk = await waitScene("RoomScene");
  record("title: はじめる → RoomScene", roomOk);
  await page.screenshot({ path: `${SHOTS}/02-room.png` });

  const save1 = await page.evaluate(() => localStorage.getItem("tsurigee:save:v1"));
  record("save: created on new game", !!save1, save1 || "");

  // --- 3. 移動チェック ---
  const x0 = await sceneProp("RoomScene", "player").then(() => page.evaluate(() => window.__GAME__.scene.getScene("RoomScene").player.x));
  await page.keyboard.down("ArrowLeft");
  await sleep(500);
  await page.keyboard.up("ArrowLeft");
  const x1 = await page.evaluate(() => window.__GAME__.scene.getScene("RoomScene").player.x);
  record("move: player x changed by input", Math.abs(x1 - x0) > 1, `x0=${x0.toFixed(1)} x1=${x1.toFixed(1)}`);

  // --- 4. 窓 → ベランダ（実インタラクト） ---
  await setPlayer("RoomScene", 300, 90);
  await page.keyboard.down("ArrowRight");
  await sleep(140);
  await page.keyboard.up("ArrowRight");
  await sleep(80);
  await page.keyboard.press("Space"); // 窓を調べる → 「ベランダに出る？」
  await sleep(250);
  await page.screenshot({ path: `${SHOTS}/03-room-dialog.png` });
  await page.keyboard.press("Space"); // はい（既定で選択）
  const balconyOk = await waitScene("BalconyScene");
  record("interact: 窓 → BalconyScene", balconyOk);
  await page.screenshot({ path: `${SHOTS}/04-balcony.png` });

  const save2 = await page.evaluate(() => JSON.parse(localStorage.getItem("tsurigee:save:v1") || "{}"));
  record("save: currentMap=balcony on map move", save2.currentMap === "balcony", JSON.stringify(save2));

  // --- 5. 釣りポイント → 釣り ---
  if (balconyOk) {
    await setPlayer("BalconyScene", 200, 90);
    await page.keyboard.down("ArrowRight");
    await sleep(140);
    await page.keyboard.up("ArrowRight");
    await sleep(80);
    await page.keyboard.press("Space"); // 釣りを始めますか？
    await sleep(250);
    await page.keyboard.press("Space"); // はい
    const fishingOk = await waitScene("FishingScene");
    record("interact: 釣りポイント → FishingScene", fishingOk);
    await sleep(300);
    await page.screenshot({ path: `${SHOTS}/05-fishing.png` });

    if (fishingOk) {
      // --- 6. 釣りループ：フッキング → メーター ---
      // 最初のアタリまで数秒の間があるため、ループ窓は長め。
      let hooked = false;
      const start = Date.now();
      while (Date.now() - start < 30000) {
        const phase = await sceneProp("FishingScene", "phase");
        const act = await activeScenes();
        if (!act || !act.includes("FishingScene")) break; // 結果画面へ遷移
        if (phase === "hookWindow") {
          await page.keyboard.press("Space"); // フッキング
          hooked = true;
        } else if (phase === "hit") {
          // メーター：FILL_MS=2000 なので約1000ms 押すと中央(Perfect)付近で離せる
          await page.keyboard.down("Space");
          await sleep(1000);
          await page.keyboard.up("Space");
          await sleep(140);
        }
        await sleep(30);
      }
      record("fishing: hooked at least once", hooked);
      await page.screenshot({ path: `${SHOTS}/06-fishing-mid.png` });

      const resultOk = await waitScene("CatchResultScene", 4000);
      record("fishing → CatchResultScene", resultOk);
      await sleep(300);
      await page.screenshot({ path: `${SHOTS}/07-result.png` });

      if (resultOk) {
        // メッセージ/詳細を Space で送り、「釣りを続けますか？」が出たら「いいえ」を選ぶ。
        // 選択肢メニューは DialogBox.showChoice のとき activeModal.menu が存在することで判定する。
        const choiceActive = () =>
          page.evaluate(() => {
            const s = window.__GAME__.scene.getScene("CatchResultScene");
            const m = s && s.activeModal;
            return !!(m && m.menu);
          });

        // 1回目の Space でメッセージを送ると詳細（新規）or 選択肢が出る
        await page.keyboard.press("Space");
        await sleep(350);
        await page.screenshot({ path: `${SHOTS}/08-result-detail.png` });

        let routed = false;
        for (let i = 0; i < 8 && !routed; i++) {
          if (await choiceActive()) {
            await page.keyboard.press("ArrowDown"); // いいえ
            await sleep(120);
            await page.keyboard.press("Space");
            routed = true;
          } else {
            await page.keyboard.press("Space");
            await sleep(300);
          }
        }
        const backOk = await waitScene("BalconyScene", 4000);
        record("result: いいえ → back to BalconyScene", backOk);
        await page.screenshot({ path: `${SHOTS}/09-back-balcony.png` });
      }
    }
  }

  // --- 7. 図鑑 ---
  const cur = await activeScenes();
  const mapScene = cur && cur.includes("BalconyScene") ? "BalconyScene" : cur && cur.includes("RoomScene") ? "RoomScene" : null;
  if (mapScene) {
    await page.keyboard.press("KeyE");
    const encOk = await waitScene("EncyclopediaScene", 4000);
    record("map: E → EncyclopediaScene", encOk);
    await sleep(200);
    await page.screenshot({ path: `${SHOTS}/10-encyclopedia.png` });
    if (encOk) {
      await page.keyboard.press("KeyE"); // ソート切替
      await sleep(150);
      const sort = await sceneProp("EncyclopediaScene", "sortMode");
      record("encyclopedia: E cycles sort", sort && sort !== "number", `sort=${sort}`);
      await page.screenshot({ path: `${SHOTS}/11-enc-sorted.png` });
      await page.keyboard.press("Space"); // 詳細
      await sleep(200);
      const mode = await sceneProp("EncyclopediaScene", "mode");
      record("encyclopedia: Space → detail", mode === "detail", `mode=${mode}`);
      await page.screenshot({ path: `${SHOTS}/12-enc-detail.png` });
      await page.keyboard.press("KeyQ"); // 詳細 → グリッド
      await sleep(150);
      await page.keyboard.press("KeyQ"); // グリッド → マップへ戻る
      const closed = await waitScene(mapScene, 4000);
      record("encyclopedia: Q → back to map", closed);
    }
  } else {
    record("map: reached a map scene for encyclopedia test", false, `active=${JSON.stringify(cur)}`);
  }

  await browser.close();

  // --- サマリ ---
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
