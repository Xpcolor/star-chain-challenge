/**
 * View-only contract between a match snapshot and the battle presentation.
 * Future PvP can reuse these shapes. This file is not a server or a rule change.
 */

export type BattleActor = 0 | 1;
export type RendererStatus = 'loading' | 'ready' | 'fallback';
export type ShipVisualStatus = 'loading' | 'ready' | 'fallback';
export type BattleOutcome = 'player' | 'enemy' | 'draw' | null;

export interface ShipCatalogEntry {
  id: string;
  name: string;
  model: string;
  fallback: string;
  /** Display length in the shared framing. Player is 6.2; fleet spans 4.6–6.2. */
  length: number;
}

/** One committed settlement. Visuals may play it once. It does not deal damage. */
export interface SettledActionEvent {
  epoch: number;
  seq: number;
  actor: BattleActor;
  damage: number;
  healing: number;
  /** Shield absorption on this settlement. */
  blocked: number;
  rawDamage?: number;
  /** Claimed attack-goal ids. Length drives shot count via combatCue. */
  claimed?: string[];
  chain?: 0 | 1 | 2 | null;
}

export interface BattleVisualState {
  match: number;
  /** Opponent ladder index, 0..15. */
  level: number;
  hp: [number, number];
  phase: string;
  initiative: 0 | 1 | null;
  shields: [number, number];
  reducedMotion: boolean;
  outcome: BattleOutcome;
  event: SettledActionEvent | null;
}

export interface DomRectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ShipAnchorRects {
  stage: DomRectLike;
  player: DomRectLike | null;
  enemy: DomRectLike | null;
}

export interface RendererStatusDetail {
  status: RendererStatus;
  ships: {player: ShipVisualStatus; enemy: ShipVisualStatus};
}

export interface BattleSceneOptions {
  readRects?: () => ShipAnchorRects | null;
  onStatus?: (detail: RendererStatusDetail) => void;
}

/** Public API returned by `createBattleScene`. */
export interface BattleScene {
  attach(host: HTMLElement): void;
  sync(state: BattleVisualState): void;
  /** `combatCue` result, or a raw settlement that the scene will pass through `combatCue`. */
  play(action: object): void;
  reset(): void;
  setReducedMotion(reduced: boolean): void;
  pause(): void;
  resume(): void;
  destroy(): void;
  status(): RendererStatus;
  shipStatus(): {player: ShipVisualStatus; enemy: ShipVisualStatus};
}

/** Public API returned by `createBattleView`. */
export interface BattleView {
  sync(state: BattleVisualState): void;
  reset(match: number): void;
  pause(): void;
  resume(): void;
  destroy(): void;
  status(): RendererStatus;
  shipStatus(): {player: ShipVisualStatus; enemy: ShipVisualStatus};
}
