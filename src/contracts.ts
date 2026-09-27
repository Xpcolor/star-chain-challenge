export type Actor = 0 | 1;
export type Phase =
  "loadout" | "opening" | "sector" | "boon" | "action" | "refill" | "over";
export interface Card {
  id: string;
  type: "N" | "W" | "A" | "J" | "D" | "B";
  value?: number;
}
export interface Goal {
  id: string;
  kind: "E" | "P" | "L";
  name: string;
  text: string;
  damage: number;
  values?: number[];
}
export interface Repair {
  id: string;
  name: string;
  text: string;
  healing: number;
  progress: number;
  target: number;
  metric: string;
}
export interface RepairSteps {
  ops: number[];
  chains: number[];
  goalChains: number[];
  goalKinds: ("E" | "P" | "L")[];
}
export interface Choice {
  id: string;
  name: string;
  text: string;
  limit?: number;
}
export interface Settlement {
  epoch: number;
  seq: number;
  actor: Actor;
  damage: number;
  rawDamage: number;
  healing: number;
  blocked: number;
  claimed: string[];
  chain: number | null;
  hpBefore?: number[];
}
export interface BattleState {
  match: number;
  level: number;
  hp: number[];
  phase: Phase;
  initiative: Actor | null;
  shields: number[];
  reducedMotion: boolean;
  outcome: "player" | "enemy" | "draw" | null;
  event: Settlement | null;
}
export interface GameView {
  arrival_pending: boolean;
  initial_hp: number;
  rules_version: string;
  phase: Phase;
  current_player: "human" | "robot" | null;
  sector: Choice | null;
  sector_options: Choice[];
  module_options: Choice[];
  modules: (string | null)[];
  module_progress: {
    uses: number;
    lastAttackChain: number | null;
    circuit: number[];
  }[];
  round: number;
  first: Actor | null;
  board: number[];
  hp: number[];
  shields: number[];
  hand: Card[];
  robot_hand: Card[];
  market: Card[];
  goals: Goal[];
  repairs: Repair[][];
  challenge_progress: Record<string, RepairSteps>[];
  selection: {
    chain: number | null;
    ids: string[];
    ops: number[];
    wild: number;
    calibrate: boolean;
    warpTo: number | null;
    port: number | null;
    market: number | null;
  };
  rest_mode: boolean;
  animation: boolean;
  calibrates: number[];
  calibrate_offer: { after: number; delta: number } | null;
  automatic_goal_claims: string[];
  automatic_repair_rewards: string[];
  automatic_damage: number;
  automatic_healing: number;
  opponent: string;
  opponent_level: number;
  selected_opponent_level: number;
  unlocked_opponents: number;
  status: string;
  winner: Actor | "draw" | null;
  initiative: { stage: string; rolls: number[][]; shieldAllowance: number };
  record_id: string;
}
export interface ViewSnapshot {
  protocol: 1;
  matchId: string;
  revision: number;
  game: GameView;
  ui: {
    humanAction: boolean;
    humanRefill: boolean;
    selected: string[];
    restGoal: string | null;
    restCount: number;
    deckCount: number;
    formula: string;
    landing: { chain: number; after: number } | null;
    error: string | null;
    opening: string;
    operations: string;
    orders: string;
    tactics: string;
    sector: string;
    calibrate: string;
    history: string;
    recordStatus: string;
    sound: boolean;
  };
  battle: BattleState;
}
export type ActionName =
  | "module"
  | "roll"
  | "sector"
  | "boon"
  | "card"
  | "chain"
  | "op"
  | "wild"
  | "warp-to"
  | "dock-to"
  | "barter-market"
  | "transfer"
  | "pin-module"
  | "calibrate"
  | "play"
  | "rest"
  | "cancel-rest"
  | "confirm-rest"
  | "goal"
  | "supply"
  | "draw"
  | "restart"
  | "retry"
  | "level"
  | "help"
  | "records"
  | "sound"
  | "result"
  | "next"
  | "confirm-new"
  | "close-modal"
  | "accept-support"
  | "decline-support";
export interface Command {
  protocol: 1;
  id: string;
  matchId: string;
  action: ActionName;
  data?: Record<string, string | number>;
}
export interface Receipt {
  id: string;
  revision: number;
  ok: boolean;
  error?: string;
}
/** Transport boundary: a remote client can replace LocalMatchClient without changing UI/renderer. */
export interface MatchClient {
  getSnapshot(): ViewSnapshot | null;
  subscribe(listener: () => void): () => void;
  dispatch(command: Command): Promise<Receipt>;
  dispose(): void;
}
export interface AudioBus {
  enabled: boolean;
  volume: number;
  unlock(): Promise<boolean>;
  play(id: string, pan?: number, power?: number): Promise<boolean>;
  setEnabled(value: boolean): void;
  setVolume(value: number): void;
  stop(): void;
  dispose(): void;
}
export interface ScenePort {
  sync(state: BattleState): void;
  reset(match: number): void;
  destroy(): void;
}
export interface ControllerBridge {
  motionReduced?(): boolean;
  render(value: Omit<ViewSnapshot, "protocol" | "revision" | "matchId">): void;
  audio: AudioBus;
  battleView: ScenePort;
  modal(html: string): void;
  ready(
    action: (name: string, data?: Record<string, string | number>) => void,
    dispose: () => void,
  ): void;
}
declare global {
  interface Window {
    starChainBridge?: ControllerBridge;
    starChainClient?: MatchClient;
    starChainRecords?: unknown;
  }
}
