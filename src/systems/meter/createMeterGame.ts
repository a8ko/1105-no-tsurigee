import Phaser from "phaser";
import type { InputManager } from "@/core/InputManager";
import type { MeterGame } from "./MeterGame";
import { GaugeMeterGame } from "./GaugeMeterGame";

/**
 * メーターゲームのファクトリ（差し替えポイント）。
 *
 * 別方式のメーターゲームに切り替えたい場合は、ここで返すクラスを差し替えるだけでよい。
 * FishingScene はこの関数と MeterGame インターフェースにしか依存しない。
 */
export function createMeterGame(scene: Phaser.Scene, input: InputManager): MeterGame {
  return new GaugeMeterGame(scene, input);
}
