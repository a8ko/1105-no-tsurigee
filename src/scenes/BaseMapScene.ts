import Phaser from "phaser";
import { GAME_WIDTH, GAME_HEIGHT, Depth, Palette, PlayerConfig } from "@/config/constants";
import { getMap } from "@/data/maps";
import { gameState } from "@/systems/GameState";
import { playerTextureKey } from "@/scenes/BootScene";
import { makeText, makePanel } from "@/ui/uiHelpers";
import { GameScene } from "@/scenes/GameScene";
import { SceneKeys } from "@/config/constants";
import type {
  MapDefinition,
  InteractableData,
  Direction,
  EntryPoint,
  Rect,
} from "@/types";
import type {
  MapSceneData,
  EncyclopediaSceneData,
  FishingSceneData,
} from "@/scenes/sceneData";

/**
 * 見下ろしマップの共通シーン。
 *
 * - 4 方向移動（WASD / 矢印）と壁・家具・マップ境界の AABB 衝突
 * - 正面のインタラクト対象を Space で調べる
 * - E で図鑑を開く（オーバーレイ）
 *
 * マップ固有の情報は MapDefinition（データ駆動）として与えられ、
 * 窓・釣りポイントなどの挙動は kind に応じて共通処理する。
 */
export abstract class BaseMapScene extends GameScene {
  protected def!: MapDefinition;
  protected player!: Phaser.GameObjects.Sprite;
  private facing: Direction = "down";
  /** インタラクト処理中（重複起動防止）。 */
  private busy = false;

  constructor(
    sceneKey: string,
    protected readonly mapId: string,
  ) {
    super(sceneKey);
  }

  create(data?: MapSceneData): void {
    this.def = getMap(this.mapId);
    this.busy = false;
    this.setupInput();

    this.renderFloor();
    this.renderWalls();
    this.decorate();
    this.renderInteractables();
    this.spawnPlayer(data);
    this.renderHud();
  }

  /** サブクラスがテーマ装飾を追加するフック（床と壁の間に描く想定）。 */
  protected decorate(): void {
    /* 既定では何もしない */
  }

  private renderFloor(): void {
    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, this.def.floorColor)
      .setDepth(Depth.floor);
  }

  private renderWalls(): void {
    for (const w of this.def.walls) {
      this.add
        .rectangle(w.x + w.width / 2, w.y + w.height / 2, w.width, w.height, 0x000000, 0.28)
        .setDepth(Depth.walls);
    }
  }

  private renderInteractables(): void {
    for (const it of this.def.interactables) {
      const { rect } = it;
      const color = it.color ?? Palette.window;
      this.add
        .rectangle(rect.x + rect.width / 2, rect.y + rect.height / 2, rect.width, rect.height, color, 0.9)
        .setStrokeStyle(1, 0xffffff, 0.8)
        .setDepth(Depth.interactable);
      if (it.label) {
        makeText(this, rect.x + rect.width / 2, rect.y - 8, it.label, {
          fontSize: "9px",
          align: "center",
        })
          .setOrigin(0.5)
          .setDepth(Depth.interactable);
      }
    }
  }

  private spawnPlayer(data?: MapSceneData): void {
    let x: number;
    let y: number;
    if (data?.entry) {
      x = data.entry.x;
      y = data.entry.y;
      this.facing = data.entry.facing;
    } else {
      const save = gameState.getSave();
      x = save.playerX;
      y = save.playerY;
      this.facing = this.def.spawn.facing;
    }
    this.player = this.add
      .sprite(x, y, playerTextureKey(this.facing))
      .setDepth(Depth.player);
  }

  private renderHud(): void {
    const panel = makePanel(this, 30, 12, 56, 16, { fillAlpha: 0.8 });
    panel.setDepth(Depth.ui);
    makeText(this, 8, 6, "E: 図鑑", { fontSize: "10px" }).setDepth(Depth.uiText);
  }

  override update(_time: number, delta: number): void {
    if (this.updateModal()) return;
    if (this.busy) return;

    this.handleMovement(delta / 1000);

    if (this.inputMgr.justConfirm()) {
      const target = this.findInteractable();
      if (target) {
        void this.interact(target);
        return;
      }
    }
    if (this.inputMgr.justEncyclopedia()) {
      this.openEncyclopedia();
    }
  }

  private handleMovement(dt: number): void {
    let dx = 0;
    let dy = 0;
    if (this.inputMgr.heldLeft()) dx -= 1;
    if (this.inputMgr.heldRight()) dx += 1;
    if (this.inputMgr.heldUp()) dy -= 1;
    if (this.inputMgr.heldDown()) dy += 1;

    if (dx === 0 && dy === 0) return;

    // 斜め移動の速度を正規化
    if (dx !== 0 && dy !== 0) {
      dx *= Math.SQRT1_2;
      dy *= Math.SQRT1_2;
    }

    const speed = PlayerConfig.speed;
    const nx = this.player.x + dx * speed * dt;
    if (!this.collides(nx, this.player.y)) {
      this.player.x = nx;
    }
    const ny = this.player.y + dy * speed * dt;
    if (!this.collides(this.player.x, ny)) {
      this.player.y = ny;
    }

    this.updateFacing(dx, dy);
  }

  private updateFacing(dx: number, dy: number): void {
    let next: Direction = this.facing;
    if (Math.abs(dx) >= Math.abs(dy) && dx !== 0) {
      next = dx < 0 ? "left" : "right";
    } else if (dy !== 0) {
      next = dy < 0 ? "up" : "down";
    }
    if (next !== this.facing) {
      this.facing = next;
      this.player.setTexture(playerTextureKey(next));
    }
  }

  private playerRect(cx: number, cy: number): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(
      cx - PlayerConfig.width / 2,
      cy - PlayerConfig.height / 2,
      PlayerConfig.width,
      PlayerConfig.height,
    );
  }

  private collides(cx: number, cy: number): boolean {
    const box = this.playerRect(cx, cy);
    // マップ境界
    if (box.x < 0 || box.y < 0 || box.right > GAME_WIDTH || box.bottom > GAME_HEIGHT) {
      return true;
    }
    for (const w of this.def.walls) {
      if (Phaser.Geom.Rectangle.Overlaps(box, this.toGeom(w))) {
        return true;
      }
    }
    return false;
  }

  private toGeom(r: Rect): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(r.x, r.y, r.width, r.height);
  }

  /** 正面方向に判定範囲を伸ばし、重なるインタラクト対象を返す。 */
  private findInteractable(): InteractableData | null {
    const box = this.playerRect(this.player.x, this.player.y);
    const reach = PlayerConfig.interactReach;
    switch (this.facing) {
      case "up":
        box.y -= reach;
        box.height += reach;
        break;
      case "down":
        box.height += reach;
        break;
      case "left":
        box.x -= reach;
        box.width += reach;
        break;
      case "right":
        box.width += reach;
        break;
    }
    for (const it of this.def.interactables) {
      if (Phaser.Geom.Rectangle.Overlaps(box, this.toGeom(it.rect))) {
        return it;
      }
    }
    return null;
  }

  private async interact(target: InteractableData): Promise<void> {
    this.busy = true;
    try {
      switch (target.kind) {
        case "door": {
          if (!target.target) break;
          const yn = await this.confirm(target.prompt ?? "移動する？");
          if (yn === 0) {
            this.goToMap(target.target.mapId, target.target.entry);
            return;
          }
          break;
        }
        case "fishingSpot": {
          const yn = await this.confirm(target.prompt ?? "釣りを始めますか？");
          if (yn === 0) {
            this.startFishing();
            return;
          }
          break;
        }
      }
    } finally {
      this.busy = false;
    }
  }

  private goToMap(mapId: string, entry: EntryPoint): void {
    // マップ移動時の保存
    gameState.setLocation(mapId, entry.x, entry.y);
    this.scene.start(getMap(mapId).sceneKey, { entry } satisfies MapSceneData);
  }

  private startFishing(): void {
    // 釣り中のリロード復帰用に現在地を保存
    gameState.setLocation(this.mapId, this.player.x, this.player.y);
    const data: FishingSceneData = {
      return: { mapId: this.mapId, x: this.player.x, y: this.player.y, facing: this.facing },
    };
    this.scene.start(SceneKeys.Fishing, data);
  }

  private openEncyclopedia(): void {
    const data: EncyclopediaSceneData = { fromScene: this.scene.key };
    this.scene.launch(SceneKeys.Encyclopedia, data);
    this.scene.pause();
  }
}
