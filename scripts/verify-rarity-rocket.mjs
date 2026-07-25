// 今回の仕様変更（レア度5段階・重複あり抽選・一度きりフラグ・緩やかな救済・ロケットイベント）の実機検証。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = "http://localhost:5173/sandbox.html";
const SHOTS = "/private/tmp/claude-501/-Users-uemura-Projects-1105-no-tsurigee/e8b30dfc-df3d-4140-aba8-cabb073f1911/scratchpad/shots";
mkdirSync(SHOTS, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];
const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
};

const STAGE_ID = "stage1_familyrestaurant_sign";
const CLEARED_KEY = `tsurigee:sandbox:stage:${STAGE_ID}:cleared`;
const ALL_IDS = ["medamayaki", "ikadaikon", "eigyo_kyokasho", "kanashii_tegami", "ham"];

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
  // 星の名前入力は window.prompt()。放っておくとPlaywrightが自動キャンセルしてしまうため、
  // 常に決まった名前で確定させる。
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "prompt") {
      await dialog.accept("てすとぼし");
    } else {
      await dialog.dismiss();
    }
  });

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  const booted = await page
    .waitForFunction(() => !!window.__SANDBOX__, null, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  record("boot: __SANDBOX__ present", booted);
  await page.click("canvas").catch(() => {});
  await sleep(150);

  // SandboxFishingScene に直接入る（イベント経由の導線は verify-stage1-fishing.mjs で別途確認済み）。
  await page.evaluate(() => window.__SANDBOX__.scene.start("SandboxFishingScene"));
  await sleep(200);

  // --- 1) レア度ごとの難易度パラメータ（フェイント回数・メーター速度・必要成功数・猶予）が食い違いなく反映されているか ---
  // ham（大トリ）は他4種が発見済みでないと出現しないので、他4種を先に発見済みにしてから見る。
  // ただし kanashii_tegami は uniqueCatch（発見済みにすると自分自身が候補から消える）なので、
  // 「kanashii_tegami以外の3種を発見済み」→「4種全部発見済み」の2段階に分けて確認する。
  const EXPECTED = {
    medamayaki: { rarity: 1, requiredSuccesses: 1, hookWindowMs: 600, meterFillMs: 2000, pikunCountRange: [0, 2] },
    ikadaikon: { rarity: 2, requiredSuccesses: 2, hookWindowMs: 520, meterFillMs: 1750, pikunCountRange: [1, 3] },
    eigyo_kyokasho: { rarity: 3, requiredSuccesses: 3, hookWindowMs: 420, meterFillMs: 1500, pikunCountRange: [2, 4] },
    kanashii_tegami: { rarity: 4, requiredSuccesses: 5, hookWindowMs: 320, meterFillMs: 1250, pikunCountRange: [3, 5] },
    ham: { rarity: 5, requiredSuccesses: 8, hookWindowMs: 220, meterFillMs: 1000, pikunCountRange: [4, 6] },
  };

  const rarityParams = await page.evaluate((allIds) => {
    const s = window.__SANDBOX__.scene.getScene("SandboxFishingScene");
    const seen = {};

    function rollMany(caughtIds, castCount, legendaryUnlockedCastCount, trials) {
      s.caught = new Set(caughtIds);
      for (let i = 0; i < trials; i++) {
        s["castCount"] = castCount;
        s["legendaryUnlockedCastCount"] = legendaryUnlockedCastCount;
        s["startCast"]();
        const id = s.target?.id;
        if (id && !seen[id]) {
          seen[id] = {
            rarity: s.target.rarity,
            requiredSuccesses: s.cfg.requiredSuccesses,
            hookWindowMs: s.cfg.hookWindowMs,
            meterFillMs: s.cfg.meterFillMs,
            pikunCountRange: s.cfg.pikunCountRange,
          };
        }
      }
    }

    // フェーズA: medamayaki/ikadaikon/eigyo_kyokashoのみ発見済みにして、
    // kanashii_tegami（まだ候補に残る）と他3種を確認する（castCountを大きめにしてpityも効かせる）。
    rollMany(["medamayaki", "ikadaikon", "eigyo_kyokasho"], 10, 0, 300);
    // フェーズB: kanashii_tegamiも含めて4種発見済みにし、大トリ(ham)を確認する。
    // 今は低確率スタート＋粘るほど上昇の仕様なので、legendaryUnlockedCastCountを大きめにして十分出やすくしておく。
    rollMany(allIds.filter((id) => id !== "ham"), 0, 20, 300);

    return seen;
  }, ALL_IDS);

  for (const id of ALL_IDS) {
    const got = rarityParams[id];
    const exp = EXPECTED[id];
    const ok =
      !!got &&
      got.rarity === exp.rarity &&
      got.requiredSuccesses === exp.requiredSuccesses &&
      got.hookWindowMs === exp.hookWindowMs &&
      got.meterFillMs === exp.meterFillMs &&
      got.pikunCountRange[0] === exp.pikunCountRange[0] &&
      got.pikunCountRange[1] === exp.pikunCountRange[1];
    record(`rarity param: ${id} matches expected config`, ok, JSON.stringify({ got, exp }));
  }

  // レア度が上がるほど：必要成功数が増え、猶予・メーター速度が短くなり、フェイント回数の上限が増える、という単調性を確認。
  const orderedByRarity = ALL_IDS.slice().sort((a, b) => EXPECTED[a].rarity - EXPECTED[b].rarity);
  let monotonic = true;
  for (let i = 1; i < orderedByRarity.length; i++) {
    const prev = EXPECTED[orderedByRarity[i - 1]];
    const cur = EXPECTED[orderedByRarity[i]];
    if (
      !(
        cur.requiredSuccesses >= prev.requiredSuccesses &&
        cur.hookWindowMs <= prev.hookWindowMs &&
        cur.meterFillMs <= prev.meterFillMs &&
        cur.pikunCountRange[1] >= prev.pikunCountRange[1]
      )
    ) {
      monotonic = false;
    }
  }
  record(
    "rarity param: higher rarity is monotonically harder (successes↑ / hookWindow↓ / meterFillMs↓ / pikun max↑)",
    monotonic,
    JSON.stringify(orderedByRarity.map((id) => ({ id, ...EXPECTED[id] }))),
  );

  // --- 1a) 大トリ(ham)は、他4種を発見し終えるまで絶対に候補に入らないか ---
  const lastOneCheck = await page.evaluate((allIds) => {
    const s = window.__SANDBOX__.scene.getScene("SandboxFishingScene");
    const others = allIds.filter((id) => id !== "ham");

    // 他4種のうち1種だけまだ未発見（3種のみ発見済み）の状態では、hamは絶対に出ないはず。
    // legendaryUnlockedCastCountをフルに乗せても関係ないことも確認する（ロック自体は救済で崩れない）。
    s.caught = new Set(others.slice(0, 3));
    let sawHamWhileOthersIncomplete = false;
    for (let i = 0; i < 200; i++) {
      s["castCount"] = 20;
      s["legendaryUnlockedCastCount"] = 20;
      s["startCast"]();
      if (s.target?.id === "ham") sawHamWhileOthersIncomplete = true;
    }
    return { sawHamWhileOthersIncomplete };
  }, ALL_IDS);
  record(
    "last-one: ham never appears while any of the other 4 are still undiscovered (200 rolls)",
    lastOneCheck.sawHamWhileOthersIncomplete === false,
    JSON.stringify(lastOneCheck),
  );

  // --- 1a-2) 大トリロック解除直後は低確率スタート、粘る(legendaryUnlockedCastCount大)ほど出やすくなるが100%にはならない ---
  const legendaryRateCheck = await page.evaluate((allIds) => {
    const s = window.__SANDBOX__.scene.getScene("SandboxFishingScene");
    const others = allIds.filter((id) => id !== "ham");

    function hamRate(legendaryUnlockedCastCountValue, trials) {
      let hamCount = 0;
      for (let i = 0; i < trials; i++) {
        s.caught = new Set(others); // ham以外は発見済み＝ロック解除された状態
        s["castCount"] = 0;
        s["legendaryUnlockedCastCount"] = legendaryUnlockedCastCountValue;
        s["startCast"]();
        if (s.target?.id === "ham") hamCount++;
      }
      return hamCount / trials;
    }

    return { justUnlocked: hamRate(1, 300), grinded: hamRate(20, 300) };
  }, ALL_IDS);
  record(
    "last-one: ham starts at a low rate right after unlocking (not a guaranteed catch)",
    legendaryRateCheck.justUnlocked < 0.15,
    JSON.stringify(legendaryRateCheck),
  );
  record(
    "last-one: grinding after unlock raises ham's rate substantially",
    legendaryRateCheck.grinded > legendaryRateCheck.justUnlocked * 3,
    JSON.stringify(legendaryRateCheck),
  );
  record(
    "last-one: ham is never a hard 100% even at max grind (other 4 remain valid candidates)",
    legendaryRateCheck.grinded < 1,
    JSON.stringify(legendaryRateCheck),
  );

  // --- 1b) 失敗するほど緩和されるか（ハム＝伝説=rarity5）。凄いレア（rarity4）より厳しい状態を保つはず ---
  const reliefByFail = await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("SandboxFishingScene");
    s.caught = new Set(["medamayaki", "ikadaikon", "eigyo_kyokasho", "kanashii_tegami"]); // ham以外は発見済みにして絞り込む
    const LEGENDARY = 5;

    function cfgAtFailCount(failCount) {
      s.failCountByRarity = new Map([[LEGENDARY, failCount]]);
      s.target = null; // 前回呼び出しの結果が残っているとループ条件が最初から満たされてしまうためクリアする
      let tries = 0;
      while (s.target?.id !== "ham" && tries < 300) {
        s["castCount"] = 0;
        s["startCast"]();
        tries++;
      }
      return { hookWindowMs: s.cfg.hookWindowMs, meterFillMs: s.cfg.meterFillMs, targetFound: s.target?.id === "ham" };
    }

    return {
      at0: cfgAtFailCount(0),
      at3: cfgAtFailCount(3),
      at4: cfgAtFailCount(4),
      at27: cfgAtFailCount(27),
      at33: cfgAtFailCount(33),
      at200: cfgAtFailCount(200),
    };
  });
  record(
    "relief: failures 0-3 = no relief yet (still base take20 values, 220ms/1000ms)",
    reliefByFail.at0.targetFound &&
      reliefByFail.at0.hookWindowMs === 220 &&
      reliefByFail.at0.meterFillMs === 1000 &&
      reliefByFail.at3.hookWindowMs === 220 &&
      reliefByFail.at3.meterFillMs === 1000,
    JSON.stringify(reliefByFail),
  );
  record(
    "relief: 4th failure = first relief step applied (one step per failure from here)",
    reliefByFail.at4.hookWindowMs === 224 && reliefByFail.at4.meterFillMs === 1008,
    JSON.stringify(reliefByFail.at4),
  );
  record(
    "relief: 27 failures (24 steps) = hookWindow hits its ceiling, meterFill still short",
    reliefByFail.at27.hookWindowMs === 316 && reliefByFail.at27.meterFillMs === 1192,
    JSON.stringify(reliefByFail.at27),
  );
  record(
    "relief: 33 failures hits the ceiling on both, still strictly harder than kanashii_tegami (super_rare)",
    reliefByFail.at33.hookWindowMs === 316 &&
      reliefByFail.at33.meterFillMs === 1240 &&
      reliefByFail.at33.hookWindowMs < 320 &&
      reliefByFail.at33.meterFillMs < 1250,
    JSON.stringify({ at33: reliefByFail.at33, superRare: { hookWindowMs: 320, meterFillMs: 1250 } }),
  );
  record(
    "relief: 200 failures still at the ceiling (no further relief beyond it)",
    reliefByFail.at200.hookWindowMs === 316 && reliefByFail.at200.meterFillMs === 1240,
    JSON.stringify(reliefByFail.at200),
  );

  // --- 2) 基本は重複あり：発見済み(medamayaki)がまた候補に出るか ---
  const dupCheck = await page.evaluate((allIds) => {
    const s = window.__SANDBOX__.scene.getScene("SandboxFishingScene");
    s.caught = new Set(["medamayaki"]);
    s["castCount"] = 0;
    let sawAgain = false;
    for (let i = 0; i < 50; i++) {
      s["startCast"]();
      if (s.target?.id === "medamayaki") sawAgain = true;
    }
    return { sawAgain };
  }, ALL_IDS);
  record("duplicate: already-caught medamayaki can be picked again within 50 rolls", dupCheck.sawAgain === true, JSON.stringify(dupCheck));

  // --- 3) 一度きり(uniqueCatch)：発見済みのkanashii_tegamiは二度と出ないか ---
  const uniqueCheck = await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("SandboxFishingScene");
    s.caught = new Set(["kanashii_tegami"]);
    s["castCount"] = 0;
    let sawAgain = false;
    for (let i = 0; i < 150; i++) {
      s["startCast"]();
      if (s.target?.id === "kanashii_tegami") sawAgain = true;
    }
    return { sawAgain };
  });
  record("uniqueCatch: already-caught kanashii_tegami never picked again within 150 rolls", uniqueCheck.sawAgain === false, JSON.stringify(uniqueCheck));

  // --- 4) 緩やかな救済：粘る(castCount大)ほど、まだ見つけていないレアの出現率が上がるか ---
  // hamは大トリ専用ルールがあるため使えない（他4種発見済みだと候補がhamだけになり常に100%になってしまう）。
  // 大トリではない中で一番レアな kanashii_tegami（凄いレア）で検証する。他3種のみ発見済みにしておき、
  // hamはまだ候補に入らない状態（他4種の1つ=kanashii_tegami が未発見のため）を保つ。
  const pityCheck = await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("SandboxFishingScene");
    const others = ["medamayaki", "ikadaikon", "eigyo_kyokasho"];
    function targetRate(castCountValue, trials) {
      let count = 0;
      for (let i = 0; i < trials; i++) {
        s.caught = new Set(others);
        s["castCount"] = castCountValue;
        s["startCast"]();
        if (s.target?.id === "kanashii_tegami") count++;
      }
      return count / trials;
    }
    return { lowPity: targetRate(0, 300), highPity: targetRate(20, 300) };
  });
  record(
    "pity: kanashii_tegami (super_rare, not the last-one) appears clearly more often at high castCount than at castCount=0",
    pityCheck.highPity > pityCheck.lowPity * 2,
    JSON.stringify(pityCheck),
  );

  // シーンを状態注入で弄り倒したので、リロードしてクリーンな状態に戻す。
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForFunction(() => !!window.__SANDBOX__, null, { timeout: 8000 }).catch(() => {});
  await page.click("canvas").catch(() => {});
  await sleep(150);

  // --- 5) ロケット（探索未完了）：図鑑とやめるの2択のみ（名付けは選べない） ---
  const rocketBefore = await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("WalkSandboxScene");
    const idx = s.markers.findIndex((m) => m.kind === "rocket");
    s["fireEvent"](idx);
    return {
      markerFound: idx >= 0,
      choiceOpen: s.choiceOpen,
      labels: s.choiceList?.map((c) => c.label),
      actions: s.choiceList?.map((c) => c.action ?? null),
    };
  });
  record("rocket: marker exists on veranda map", rocketBefore.markerFound === true, JSON.stringify(rocketBefore));
  record(
    "rocket: before stage clear offers encyclopedia but not naming",
    rocketBefore.choiceOpen === true &&
      rocketBefore.actions?.includes("viewEncyclopedia") &&
      !rocketBefore.actions?.includes("nameStarAndDepart"),
    JSON.stringify(rocketBefore),
  );
  await page.screenshot({ path: `${SHOTS}/rocket-01-before-clear.png` });

  // --- 5b) 図鑑：発見済み(目玉焼き・かなしい手紙のみ事前にマーク)は名前+説明、未発見は？？？ ---
  await page.evaluate(
    (key) => localStorage.setItem(key, JSON.stringify(["medamayaki", "kanashii_tegami"])),
    `tsurigee:sandbox:stage:${STAGE_ID}:caught`,
  );
  // 選択肢の先頭（index 0）は「図鑑を見る」のはず。改めてロケットを調べ直して選ぶ。
  await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("WalkSandboxScene");
    const idx = s.markers.findIndex((m) => m.kind === "rocket");
    s["fireEvent"](idx);
  });
  await page.keyboard.down("Space");
  await sleep(50);
  await page.keyboard.up("Space");
  await sleep(150);
  const encyclopedia = await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("WalkSandboxScene");
    return { messageOpen: s.messageOpen, text: s.messageText?.text ?? null };
  });
  const encText = encyclopedia.text ?? "";
  record(
    "encyclopedia: shows discovered items with name + flavor",
    encText.includes("目玉焼き") && encText.includes("サニーサイドアップ") && encText.includes("かなしい手紙") && encText.includes("アップルパイ"),
    encText,
  );
  record(
    "encyclopedia: hides undiscovered items behind ？？？",
    (encText.match(/？？？/g) ?? []).length === 3, // 5種中2種発見済みなので、残り3種が？？？
    encText,
  );
  record("encyclopedia: progress count shown as 2/5", encText.includes("2 / 5"), encText);
  await page.screenshot({ path: `${SHOTS}/rocket-01b-encyclopedia.png` });

  // 図鑑を閉じておく
  await page.keyboard.down("Space");
  await sleep(50);
  await page.keyboard.up("Space");
  await sleep(150);

  // --- 6) 探索完了の永続化：localStorage 経由でフラグが立つか ---
  const beforeMark = await page.evaluate((key) => localStorage.getItem(key), CLEARED_KEY);
  record("persistence: cleared flag absent before stage clear", beforeMark === null, `value=${beforeMark}`);

  await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("WalkSandboxScene");
    // markStageCleared はモジュール内関数なので、SandboxFishingScene 側の実際の呼び出しを模して
    // localStorage を直接操作せず、onStageClear の呼び出しで確認する。
    void s;
  });
  await page.evaluate(() => window.__SANDBOX__.scene.start("SandboxFishingScene"));
  await sleep(200);
  await page.evaluate(
    ({ allIds, key }) => {
      const s = window.__SANDBOX__.scene.getScene("SandboxFishingScene");
      for (const id of allIds) s.caught.add(id);
      s["updateStageProgressLabel"]();
      // markItemCaught はモジュール内関数で直接呼べないため、実際の永続化を模して localStorage に書く。
      localStorage.setItem(key, JSON.stringify(allIds));
      s["onStageClear"]();
    },
    { allIds: ALL_IDS, key: `tsurigee:sandbox:stage:${STAGE_ID}:caught` },
  );
  await sleep(150);

  const afterMark = await page.evaluate((key) => localStorage.getItem(key), CLEARED_KEY);
  record("persistence: cleared flag set to '1' after onStageClear()", afterMark === "1", `value=${afterMark}`);
  await page.screenshot({ path: `${SHOTS}/rocket-02-stage-clear-message.png` });

  // ベランダへ戻る
  await page.keyboard.down("Space");
  await sleep(50);
  await page.keyboard.up("Space");
  await sleep(300);
  const backOnSandbox = await page.evaluate(() => window.__SANDBOX__.scene.isActive("WalkSandboxScene"));
  record("persistence: space returns to WalkSandboxScene after clear", backOnSandbox === true, `active=${backOnSandbox}`);

  // --- 7) ロケット（探索完了後）：図鑑・名付け・やめるの3択になるか ---
  const rocketAfter = await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("WalkSandboxScene");
    const idx = s.markers.findIndex((m) => m.kind === "rocket");
    s["fireEvent"](idx);
    return {
      choiceOpen: s.choiceOpen,
      prompt: s.choicePrompt,
      labels: s.choiceList?.map((c) => c.label),
      actions: s.choiceList?.map((c) => c.action ?? null),
    };
  });
  record(
    "rocket: after stage clear offers encyclopedia AND naming",
    rocketAfter.choiceOpen === true &&
      rocketAfter.actions?.includes("viewEncyclopedia") &&
      rocketAfter.actions?.includes("nameStarAndDepart"),
    JSON.stringify(rocketAfter),
  );
  await page.screenshot({ path: `${SHOTS}/rocket-03-after-clear-choice.png` });

  // 「名前をつけて出発する」まで下矢印で移動して選ぶ（並び順に依存しないようにする）。
  const nameIndex = rocketAfter.actions?.indexOf("nameStarAndDepart") ?? -1;
  record("rocket: nameStarAndDepart choice is present in the list", nameIndex >= 0, `nameIndex=${nameIndex}`);
  for (let i = 0; i < nameIndex; i++) {
    await page.keyboard.down("ArrowDown");
    await sleep(30);
    await page.keyboard.up("ArrowDown");
    await sleep(80);
  }
  await page.keyboard.down("Space");
  await sleep(50);
  await page.keyboard.up("Space");
  await sleep(200);
  const departResult = await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("WalkSandboxScene");
    return { messageOpen: s.messageOpen, text: s.messageText?.text ?? null };
  });
  record(
    "rocket: choosing nameStarAndDepart prompts for a free-form name and shows it back",
    departResult.messageOpen === true && (departResult.text ?? "").includes("てすとぼし") && (departResult.text ?? "").includes("名付けた"),
    JSON.stringify(departResult),
  );
  await page.screenshot({ path: `${SHOTS}/rocket-04-named.png` });

  await browser.close();

  console.log("\n================ SUMMARY ================");
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
