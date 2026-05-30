import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, Depth, Palette, TextColor } from "@/config/constants";
import { HIDDEN_ICON_KEY } from "@/scenes/BootScene";
import { makeText, makePanel } from "@/ui/uiHelpers";
import type { Catchable } from "@/types";

/** レア度表示（★を rarity 個、最大 5 個。? は未発見）。 */
function rarityText(discovered: boolean, rarity: number): string {
  if (!discovered) return "レア度: ?";
  const max = 5;
  const filled = "★".repeat(Math.min(rarity, max));
  const empty = "☆".repeat(Math.max(0, max - rarity));
  return `レア度: ${filled}${empty}`;
}

/**
 * 収集物の詳細表示（イラスト・名前・レア度・説明）を 1 つのコンテナとして生成する。
 * 釣果画面（初取得）と図鑑詳細で共用する。未発見の場合は ??? 表示にする。
 */
export function renderCatchableDetail(
  scene: Phaser.Scene,
  catchable: Catchable,
  discovered: boolean,
  hint?: string,
): Phaser.GameObjects.Container {
  const c = scene.add.container(0, 0).setDepth(Depth.modal);

  // 背後の表示（図鑑グリッドや釣果背景）を隠す全画面バックドロップ
  c.add(scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, Palette.bg, 0.96));

  const panelW = 256;
  const panelH = 132;
  const cx = GAME_WIDTH / 2;
  const cy = GAME_HEIGHT / 2 - 6;
  c.add(makePanel(scene, cx, cy, panelW, panelH));

  const left = cx - panelW / 2;
  const top = cy - panelH / 2;

  // イラスト（左）
  const iconKey = discovered ? catchable.imageKey : HIDDEN_ICON_KEY;
  const icon = scene.add
    .sprite(left + 50, cy, iconKey)
    .setScale(3)
    .setDepth(Depth.modalText);
  c.add(icon);
  if (!discovered) {
    const q = makeText(scene, left + 50, cy, "?", { fontSize: "32px", color: TextColor.dim })
      .setOrigin(0.5)
      .setDepth(Depth.modalText);
    c.add(q);
  }

  // 図鑑番号
  c.add(
    makeText(scene, left + 50, cy + 44, `No.${catchable.encyclopediaNumber}`, {
      fontSize: "9px",
      color: TextColor.dim,
      align: "center",
    }).setOrigin(0.5),
  );

  // 右側テキスト
  const textX = left + 104;
  c.add(
    makeText(scene, textX, top + 16, discovered ? catchable.name : "???", {
      fontSize: "14px",
    }),
  );
  c.add(
    makeText(scene, textX, top + 40, rarityText(discovered, catchable.rarity), {
      fontSize: "11px",
      color: TextColor.accent,
    }),
  );
  c.add(
    makeText(scene, textX, top + 60, discovered ? catchable.description : "まだ見つかっていない", {
      fontSize: "10px",
      color: TextColor.dim,
      wordWrapWidth: panelW - (textX - left) - 16,
    }),
  );

  if (hint) {
    c.add(
      makeText(scene, cx, top + panelH - 12, hint, {
        fontSize: "9px",
        color: TextColor.dim,
        align: "center",
      }).setOrigin(0.5),
    );
  }

  return c;
}
