// 「この星に名前をつけて出発する」→大きな名前表示→説明文、の一連の演出を実機検証する。
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const URL = "http://localhost:5173/sandbox.html";
const SHOTS = "/private/tmp/claude-501/-Users-uemura-Projects-1105-no-tsurigee/ba7350ee-c958-4d10-908a-532d8f513848/scratchpad/shots";
mkdirSync(SHOTS, { recursive: true });

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

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));

  const TEST_NAME = "ラプンツェル";
  page.on("dialog", (dialog) => {
    dialog.accept(TEST_NAME);
  });

  await page.goto(URL, { waitUntil: "networkidle" });
  const booted = await page
    .waitForFunction(() => !!window.__SANDBOX__, null, { timeout: 8000 })
    .then(() => true)
    .catch(() => false);
  record("boot: __SANDBOX__ present", booted);
  await page.click("canvas").catch(() => {});
  await sleep(150);

  // ステージ1をクリア済み扱いにして「名前をつけて出発する」が選べる状態にする。
  await page.evaluate(() => {
    localStorage.setItem("tsurigee:sandbox:stage:stage1_familyrestaurant_sign:cleared", "1");
  });

  // ロケットを調べて選択肢を出す（歩かせず、実処理のfireRocketEventを直接呼ぶ）。
  const opened = await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("WalkSandboxScene");
    const marker = s.markers.find((m) => m.kind === "rocket");
    s["fireRocketEvent"](marker);
    return {
      choiceOpen: s["choiceOpen"],
      labels: s["choiceList"].map((c) => c.label),
    };
  });
  record("choice opened with name option", opened.choiceOpen && opened.labels.includes("この星に名前をつけて出発する"), JSON.stringify(opened.labels));

  // 「この星に名前をつけて出発する」を選んで決定する。
  await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("WalkSandboxScene");
    const idx = s["choiceList"].findIndex((c) => c.action === "nameStarAndDepart");
    s["choiceIndex"] = idx;
    s["confirmChoice"]();
  });
  await sleep(150);

  const afterConfirm = await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("WalkSandboxScene");
    return {
      bigNameOpen: s["bigNameOpen"],
      bigNameText: s["bigNameText"] ? s["bigNameText"].text : null,
      messageOpen: s["messageOpen"],
    };
  });
  record(
    "big name reveal shown with typed name",
    afterConfirm.bigNameOpen === true && afterConfirm.bigNameText === TEST_NAME && afterConfirm.messageOpen === false,
    JSON.stringify(afterConfirm),
  );

  await page.screenshot({ path: `${SHOTS}/big-name-reveal.png` });
  console.log(`screenshot: ${SHOTS}/big-name-reveal.png`);

  // スペースキーで大きな名前表示を閉じると、続けて説明メッセージが出るはず。
  await tapSpace(page);
  await sleep(150);

  const afterSpace = await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("WalkSandboxScene");
    return {
      bigNameOpen: s["bigNameOpen"],
      messageOpen: s["messageOpen"],
      messageText: s["messageText"] ? s["messageText"].text : null,
    };
  });
  record(
    "big name closes into explanation message",
    afterSpace.bigNameOpen === false &&
      afterSpace.messageOpen === true &&
      typeof afterSpace.messageText === "string" &&
      afterSpace.messageText.includes(TEST_NAME) &&
      afterSpace.messageText.includes("ファミレスのポール看板の上"),
    JSON.stringify(afterSpace),
  );

  await page.screenshot({ path: `${SHOTS}/after-explanation-message.png` });
  console.log(`screenshot: ${SHOTS}/after-explanation-message.png`);

  // もう一度スペースで説明メッセージを閉じ、通常状態に戻ることを確認。
  await tapSpace(page);
  await sleep(150);
  const afterClose = await page.evaluate(() => {
    const s = window.__SANDBOX__.scene.getScene("WalkSandboxScene");
    return { bigNameOpen: s["bigNameOpen"], messageOpen: s["messageOpen"], choiceOpen: s["choiceOpen"] };
  });
  record(
    "back to normal state",
    !afterClose.bigNameOpen && !afterClose.messageOpen && !afterClose.choiceOpen,
    JSON.stringify(afterClose),
  );

  record("no console/page errors", errors.length === 0, errors.join(" | "));

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
