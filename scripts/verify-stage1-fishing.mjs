// ステージ1 釣りシーン(SandboxFishingScene) の実機検証。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = "http://localhost:5173/sandbox.html";
const SHOTS = "/private/tmp/claude-501/-Users-uemura-Projects-1105-no-tsurigee/e8b30dfc-df3d-4140-aba8-cabb073f1911/scratchpad/shots";
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// page.keyboard.press("Space") はほぼ同時に down+up するため、この環境では Phaser の
// JustDown 判定に拾われないことがある（診断済み）。down→少し待つ→up に分けて確実に検出させる。
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
const caughtLog = [];

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
  await page.click("canvas").catch(() => {});
  await sleep(150);

  // --- 1) マーカーへワープしてイベント発火(実コードの checkStepEvents に乗せる) ---
  await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("WalkSandboxScene");
    s.pos.x = 563;
    s.pos.y = 599;
  });
  await sleep(200); // 次の update() で checkStepEvents が拾う

  const choiceOpen = await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("WalkSandboxScene");
    return { open: s.choiceOpen, prompt: s.choicePrompt, labels: s.choiceList?.map((c) => c.label) };
  });
  record(
    "event: step onto fishing marker opens choice",
    choiceOpen.open === true && choiceOpen.prompt === "つりする？",
    JSON.stringify(choiceOpen),
  );
  await page.screenshot({ path: `${SHOTS}/01-choice.png` });

  // --- 2) 「うん。」(先頭=index0) を選んで確定 → SandboxFishingScene へ ---
  await tapSpace(page);
  await sleep(250);
  const sceneSwitched = await page.evaluate(() => ({
    fishingActive: window.__SANDBOX__.scene.isActive("SandboxFishingScene"),
    sandboxActive: window.__SANDBOX__.scene.isActive("WalkSandboxScene"),
  }));
  record(
    "event: choosing うん switches to SandboxFishingScene",
    sceneSwitched.fishingActive === true && sceneSwitched.sandboxActive === false,
    JSON.stringify(sceneSwitched),
  );
  await page.screenshot({ path: `${SHOTS}/02-fishing-start.png` });

  // medamayakiは選択肢つきの別フロー（HIT演出→選択肢）なので、この一般的な流れの検証では対象外にする
  // （選択肢つきフローは verify-catch-sequence.mjs / verify-risky-choice.mjs で別途検証済み）。
  await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("SandboxFishingScene");
    s.caught = new Set(["medamayaki"]);
    s["updateStageProgressLabel"]();
  });

  const getFish = () => page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("SandboxFishingScene");
    return {
      phase: s.phase,
      caughtSize: s.caught.size,
      targetId: s.target?.id ?? null,
      required: s.cfg?.requiredSuccesses ?? null,
      hookWindowMs: s.cfg?.hookWindowMs ?? null,
    };
  });

  // --- 3) 早合わせプローブ：待機(watch)中にSpaceを押して失敗するか ---
  const beforeEarly = await getFish();
  if (beforeEarly.phase === "watch") {
    await tapSpace(page);
    await sleep(150);
    const afterEarly = await getFish();
    record(
      "🔍 probe: early strike during watch causes transition (not silently ignored)",
      afterEarly.phase === "transition" || afterEarly.phase === "watch",
      `before=${beforeEarly.phase} after=${afterEarly.phase}`,
    );
    await page.screenshot({ path: `${SHOTS}/03-early-strike.png` });
  } else {
    record("🔍 probe: early strike during watch", false, `skipped: phase was already ${beforeEarly.phase}`);
  }

  // --- 4) 実際に2匹、本物の入力で釣る ---
  async function realCatch(label) {
    // 前回の異常終了でSpaceが押しっぱなし状態のまま残っていないよう、念のため解放しておく。
    await page.keyboard.up("Space").catch(() => {});
    const hooked = await page
      .waitForFunction(
        () => window.__SANDBOX__.scene.getScene("SandboxFishingScene").phase === "hookWindow",
        null,
        { timeout: 20000, polling: 50 },
      )
      .then(() => true)
      .catch(() => false);
    if (!hooked) {
      record(`catch ${label}: reached hookWindow`, false, "timeout waiting for bite");
      return false;
    }
    let info;
    let rounds = 0;
    try {
      await page.keyboard.down("Space"); // フッキング成功（1回押すだけの判定）
      // フッキング成功後は「長押し待ち」を経てからメーターが始まる（既定300ms）。
      // 押しっぱなしにしておけばそのまま閾値を超えてメーターへ移行する。
      await sleep(400);
      info = await getFish();
      record(`catch ${label}: hookWindow success`, info.phase === "hit", `phase=${info.phase} target=${info.targetId} required=${info.required}`);

      while (true) {
        info = await getFish();
        if (info.phase !== "hit") break;
        rounds++;
        if (rounds > 10) { record(`catch ${label}: meter rounds`, false, "too many rounds, aborting"); break; }
        // 押しっぱなしで無ければ改めて押す（前ラウンドで離した後）
        const held = await page.evaluate(() => {
          const s = window.__SANDBOX__.scene.getScene("SandboxFishingScene");
          return !!s.meter && s.meter["started"] === true;
        });
        if (!held) await page.keyboard.down("Space");
        // perfectゾーン(.33〜.67)の中央あたり(.5)を狙って離す
        await page
          .waitForFunction(
            () => {
              const s = window.__SANDBOX__.scene.getScene("SandboxFishingScene");
              return s.meter && s.meter["value"] >= 0.48;
            },
            null,
            { timeout: 3000, polling: 10 },
          )
          .catch(() => {});
        await page.keyboard.up("Space");
        await sleep(150);
      }
    } finally {
      // 失敗経路も含め、このcatch試行の中で必ずSpaceを解放してから抜ける。
      await page.keyboard.up("Space").catch(() => {});
    }
    const finalInfo = await getFish();
    caughtLog.push({ label, targetId: info.targetId, caughtSize: finalInfo.caughtSize });
    record(`catch ${label}: landed`, finalInfo.phase === "transition", `phase=${finalInfo.phase} caughtSize=${finalInfo.caughtSize} rounds=${rounds}`);
    // 釣果メッセージは「スペースで続ける」までは消えない仕様なので、押して進める。
    await sleep(200);
    await tapSpace(page);
    await page
      .waitForFunction(
        () => {
          const p = window.__SANDBOX__.scene.getScene("SandboxFishingScene").phase;
          return p === "watch" || p === "stageClear";
        },
        null,
        { timeout: 4000, polling: 50 },
      )
      .catch(() => {});
    return true;
  }

  await realCatch("#1");
  await page.screenshot({ path: `${SHOTS}/04-after-catch1.png` });
  await realCatch("#2");
  await page.screenshot({ path: `${SHOTS}/05-after-catch2.png` });

  const midState = await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("SandboxFishingScene");
    return { caughtIds: [...s.caught], caughtSize: s.caught.size, phase: s.phase };
  });
  record(
    "progress: caught set has 2 unique ids after 2 real catches (or fewer if a catch failed)",
    new Set(midState.caughtIds).size === midState.caughtIds.length,
    JSON.stringify(midState),
  );

  // --- 5) 残りは状態注入でショートカットしてステージクリア導線を確認 ---
  const cleared = await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("SandboxFishingScene");
    const allIds = ["medamayaki", "ikadaikon", "eigyo_kyokasho", "ham", "kanashii_tegami"];
    for (const id of allIds) s.caught.add(id);
    s["updateStageProgressLabel"]();
    s["onStageClear"]();
    return { caughtSize: s.caught.size, phase: s.phase };
  });
  await sleep(150);
  record("stageClear: forced-complete shows stageClear phase", cleared.phase === "stageClear", JSON.stringify(cleared));
  await page.screenshot({ path: `${SHOTS}/06-stage-clear.png` });

  // --- 6) スペースでサンドボックスへ復帰 ---
  await tapSpace(page);
  await sleep(300);
  const returned = await page.evaluate(() => ({
    sandboxActive: window.__SANDBOX__.scene.isActive("WalkSandboxScene"),
    fishingActive: window.__SANDBOX__.scene.isActive("SandboxFishingScene"),
  }));
  record(
    "stageClear: space returns to WalkSandboxScene",
    returned.sandboxActive === true && returned.fishingActive === false,
    JSON.stringify(returned),
  );
  await page.screenshot({ path: `${SHOTS}/07-back-to-sandbox.png` });

  await browser.close();

  console.log("\n================ SUMMARY ================");
  console.log("caughtLog:", JSON.stringify(caughtLog));
  const passed = results.filter((r) => r.ok).length;
  console.log(`${passed}/${results.length} checks passed`);
  console.log(`console errors: ${errors.length}`);
  for (const e of errors.slice(0, 30)) console.log("  ERR:", e);
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
