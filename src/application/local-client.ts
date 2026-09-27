import type {
  Command,
  ControllerBridge,
  MatchClient,
  Receipt,
  ViewSnapshot,
  AudioBus,
  ScenePort,
} from "../contracts";
export class LocalMatchClient implements MatchClient {
  private snapshot: ViewSnapshot | null = null;
  private listeners = new Set<() => void>();
  private receipts = new Map<string, Promise<Receipt>>();
  private action:
    ((name: string, data?: Record<string, string | number>) => void) | null =
    null;
  private stop = () => {};
  private disposed = false;
  private revision = 0;
  constructor(
    audio: AudioBus,
    scene: ScenePort,
    modal: (html: string) => void,
  ) {
    const bridge: ControllerBridge = {
      audio,
      battleView: scene,
      modal,
      render: (value) => {
        if (this.disposed) return;
        this.snapshot = structuredClone({
          ...value,
          protocol: 1 as const,
          revision: ++this.revision,
          matchId: String(value.battle.match),
        });
        this.listeners.forEach((fn) => fn());
      },
      ready: (action, stop) => {
        this.action = action;
        this.stop = stop;
      },
    };
    window.starChainBridge = bridge;
  }
  async start() {
    await import("../../dist/app.mjs");
  }
  getSnapshot = () => this.snapshot;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  dispatch = (command: Command): Promise<Receipt> => {
    const prior = this.receipts.get(command.id);
    if (prior) return prior;
    const result = Promise.resolve()
      .then(() => {
        if (this.disposed || !this.action) throw Error("对局尚未就绪");
        if (command.protocol !== 1) throw Error("对局协议版本不兼容");
        if (command.matchId !== this.snapshot?.matchId)
          throw Error("这条指令属于上一局");
        this.action(command.action, command.data);
        return { id: command.id, revision: this.revision, ok: true };
      })
      .catch((error) => ({
        id: command.id,
        revision: this.revision,
        ok: false,
        error: String(error.message),
      }));
    this.receipts.set(command.id, result);
    if (this.receipts.size > 512)
      this.receipts.delete(this.receipts.keys().next().value!);
    return result;
  };
  dispose() {
    this.disposed = true;
    this.stop();
    this.listeners.clear();
    this.receipts.clear();
    delete window.starChainBridge;
  }
}
