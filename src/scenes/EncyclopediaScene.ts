import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, SceneKeys, Depth, Palette, TextColor } from "@/config/constants";
import { CATCHABLE_COUNT } from "@/data/catchables";
import { gameState } from "@/systems/GameState";
import {
  sortCatchables,
  nextSortMode,
  SORT_LABELS,
  type SortMode,
} from "@/systems/Encyclopedia";
import { HIDDEN_ICON_KEY } from "@/scenes/BootScene";
import { renderCatchableDetail } from "@/ui/CatchableDetailView";
import { makeText } from "@/ui/uiHelpers";
import { GameScene } from "@/scenes/GameScene";
import type { Catchable } from "@/types";
import type { EncyclopediaSceneData } from "@/scenes/sceneData";

const COLUMNS = 5;
const CELL_W = 60;
const ROW_H = 46;
const MARGIN_X = 10;
const START_Y = 32;

/**
 * 図鑑。グリッド一覧（未発見は ???）・ソート切替（図鑑番号 / 名前 / レア度）・詳細表示。
 * マップシーンからオーバーレイ起動され、Q で元のシーンへ戻る。
 */
export class EncyclopediaScene extends GameScene {
  private fromScene = SceneKeys.Room as string;
  private mode: "grid" | "detail" = "grid";
  private sortMode: SortMode = "number";
  private selected = 0;
  private list: Catchable[] = [];

  private gridContainer?: Phaser.GameObjects.Container;
  private cursor?: Phaser.GameObjects.Rectangle;
  private headerText?: Phaser.GameObjects.Text;
  private detailContainer?: Phaser.GameObjects.Container;

  constructor() {
    super(SceneKeys.Encyclopedia);
  }

  create(data: EncyclopediaSceneData): void {
    this.fromScene = data.fromScene;
    this.mode = "grid";
    this.sortMode = "number";
    this.selected = 0;
    this.setupInput();

    // 背景（後ろのマップを隠す）
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, Palette.bg).setDepth(Depth.floor);

    // ヘッダ
    this.headerText = makeText(this, 10, 8, "", { fontSize: "11px" }).setDepth(Depth.ui);
    // フッタのヒント
    makeText(this, 10, GAME_HEIGHT - 12, "Space: 詳細   Q: もどる   E: 並び替え", {
      fontSize: "9px",
      color: TextColor.dim,
    }).setDepth(Depth.ui);

    this.buildGrid();
  }

  private updateHeader(): void {
    const found = gameState.discoveredCount();
    this.headerText?.setText(
      `ずかん   発見 ${found} / ${CATCHABLE_COUNT}   並び: ${SORT_LABELS[this.sortMode]}`,
    );
  }

  private buildGrid(): void {
    this.gridContainer?.destroy(true);
    this.list = sortCatchables(this.sortMode, (c) => gameState.isDiscovered(c.id));

    // コンテナ内は追加順で重なる（子個別の depth は描画順に効かないため設定しない）
    const container = this.add.container(0, 0).setDepth(Depth.ui);

    this.list.forEach((c, i) => {
      const col = i % COLUMNS;
      const row = Math.floor(i / COLUMNS);
      const cx = MARGIN_X + col * CELL_W + CELL_W / 2;
      const top = START_Y + row * ROW_H;
      const discovered = gameState.isDiscovered(c.id);

      container.add(this.add.sprite(cx, top + 14, discovered ? c.imageKey : HIDDEN_ICON_KEY));
      if (!discovered) {
        container.add(
          makeText(this, cx, top + 14, "?", { fontSize: "16px", color: TextColor.dim }).setOrigin(0.5),
        );
      }

      container.add(
        makeText(this, cx, top + 28, discovered ? c.name : "???", {
          fontSize: "10px",
          align: "center",
        }).setOrigin(0.5, 0),
      );
    });

    this.gridContainer = container;

    // カーソル（選択枠）
    if (!this.cursor) {
      this.cursor = this.add
        .rectangle(0, 0, CELL_W - 6, ROW_H - 4, 0x000000, 0)
        .setStrokeStyle(2, Palette.cursor)
        .setDepth(Depth.uiText);
    }
    this.positionCursor();
    this.updateHeader();
  }

  private positionCursor(): void {
    if (!this.cursor) return;
    const col = this.selected % COLUMNS;
    const row = Math.floor(this.selected / COLUMNS);
    const cx = MARGIN_X + col * CELL_W + CELL_W / 2;
    const cy = START_Y + row * ROW_H + 21;
    this.cursor.setPosition(cx, cy);
  }

  private openDetail(): void {
    const c = this.list[this.selected];
    if (!c) return;
    this.mode = "detail";
    this.gridContainer?.setVisible(false);
    this.cursor?.setVisible(false);
    const discovered = gameState.isDiscovered(c.id);
    this.detailContainer = renderCatchableDetail(this, c, discovered, "Q / Space: もどる");
  }

  private closeDetail(): void {
    this.mode = "grid";
    this.detailContainer?.destroy(true);
    this.detailContainer = undefined;
    this.gridContainer?.setVisible(true);
    this.cursor?.setVisible(true);
  }

  private close(): void {
    this.scene.resume(this.fromScene);
    this.scene.stop();
  }

  override update(): void {
    if (this.mode === "detail") {
      if (this.inputMgr.justConfirm() || this.inputMgr.justCancel()) {
        this.closeDetail();
      }
      return;
    }

    // grid
    const len = this.list.length;
    const col = this.selected % COLUMNS;

    if (this.inputMgr.justLeft() && col > 0) {
      this.selected -= 1;
      this.positionCursor();
    } else if (this.inputMgr.justRight() && col < COLUMNS - 1 && this.selected < len - 1) {
      this.selected += 1;
      this.positionCursor();
    } else if (this.inputMgr.justUp() && this.selected - COLUMNS >= 0) {
      this.selected -= COLUMNS;
      this.positionCursor();
    } else if (this.inputMgr.justDown() && this.selected + COLUMNS < len) {
      this.selected += COLUMNS;
      this.positionCursor();
    }

    if (this.inputMgr.justEncyclopedia()) {
      this.sortMode = nextSortMode(this.sortMode);
      this.buildGrid();
    } else if (this.inputMgr.justConfirm()) {
      this.openDetail();
    } else if (this.inputMgr.justCancel()) {
      this.close();
    }
  }
}
