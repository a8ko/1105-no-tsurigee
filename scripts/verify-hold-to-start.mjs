// フッキングは1回押すだけの判定、その後スペース長押しでメーター開始、の実機検証。
import { chromium } from "playwright";

const URL = "http://localhost:5173/sandbox.html";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tapKey = async (page, key, holdMs = 50) => {
  await page.keyboard.down(key);
  await sleep(holdMs);
  await page.keyboard.up(key);
};
const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

async function enterFishing(page) {
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !!window.__SANDBOX__, null, { timeout: 8000 });
  await page.click("canvas").catch(() => {});
  await sleep(150);
  await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("WalkSandboxScene");
    s.pos.x = 563; s.pos.y = 599;
  });
  await sleep(200);
  await tapKey(page, "Space");
  await sleep(250);
  // 対象をmedamayaki（COMMON, hookWindowMs=600・requiredSuccesses=1）に固定する。
  // 新実装はレア度で猶予・必要成功数が変わるため、固定しないと短い猶予や複数成功が
  // 必要なアイテムに当たり、このテストの前提（1回のタップ・1回のメーター操作）が崩れる。
  await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("SandboxFishingScene");
    s.caught = new Set(["ikadaikon", "eigyo_kyokasho", "ham", "kanashii_tegami"]);
    s["updateStageProgressLabel"]();
    let tries = 0;
    while (s.target?.id !== "medamayaki" && tries < 300) {
      s["castCount"] = 0;
      s["startCast"]();
      tries++;
    }
  });
}

const getPhase = (page) => page.evaluate(() => window.__SANDBOX__.scene.getScene("SandboxFishingScene").phase);

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });

  // --- テストA：フッキングは一瞬のタップだけで成功し、離しても waitingForHold のままメーターは始まらない ---
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await enterFishing(page);

    await page.waitForFunction(() => window.__SANDBOX__.scene.getScene("SandboxFishingScene").phase === "hookWindow", null, { timeout: 20000, polling: 50 });
    // ごく短いタップだけでフッキング成功させる（長押ししない）。
    await tapKey(page, "Space", 20);
    await sleep(150);
    const afterTap = await getPhase(page);
    record("A: a short tap succeeds the hook (not ignored)", afterTap === "waitingForHold", `phase=${afterTap}`);

    // タップ後に離しているので、待っても勝手にメーターへは進まないはず。
    await sleep(600);
    const stillWaiting = await getPhase(page);
    record("A: without holding, stays in waitingForHold (meter does not auto-start)", stillWaiting === "waitingForHold", `phase=${stillWaiting}`);
    console.log("A errors:", errors);
    await page.close();
  }

  // --- テストB：長押し(300ms以上)するとメーターが始まる ---
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await enterFishing(page);

    await page.waitForFunction(() => window.__SANDBOX__.scene.getScene("SandboxFishingScene").phase === "hookWindow", null, { timeout: 20000, polling: 50 });
    try {
      await page.keyboard.down("Space");
      await sleep(150);
      const midHold = await getPhase(page);
      record("B: 150ms into hold, still waitingForHold (threshold not yet reached)", midHold === "waitingForHold", `phase=${midHold}`);

      await sleep(250); // 合計400ms保持（閾値300msを超える）
      const afterThreshold = await getPhase(page);
      record("B: past the 300ms threshold, meter has started (phase=hit)", afterThreshold === "hit", `phase=${afterThreshold}`);

      await page.waitForFunction(() => {
        const s = window.__SANDBOX__.scene.getScene("SandboxFishingScene");
        return s.meter && s.meter["value"] >= 0.48;
      }, null, { timeout: 3000, polling: 10 }).catch(() => {});
      await page.keyboard.up("Space");
    } finally {
      await page.keyboard.up("Space").catch(() => {});
    }
    await sleep(300);
    const caughtOrDone = await page.evaluate(() => {
      const s = window.__SANDBOX__.scene.getScene("SandboxFishingScene");
      return { phase: s.phase, caughtSize: s.caught.size };
    });
    record("B: eventually reaches a normal post-hit phase", ["transition", "catchSequence", "watch"].includes(caughtOrDone.phase), JSON.stringify(caughtOrDone));
    console.log("B errors:", errors);
    await page.close();
  }

  await browser.close();
  console.log("\n================ SUMMARY ================");
  const passed = results.filter((r) => r.ok).length;
  console.log(`${passed}/${results.length} checks passed`);
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}

main().catch((e) => { console.error("CRASHED:", e); process.exit(2); });
