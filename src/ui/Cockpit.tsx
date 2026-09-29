import {
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  useState,
  useEffect,
  type CSSProperties,
} from "react";
import { gsap } from "gsap";
import { create } from "zustand";
import type {
  Card,
  MatchClient,
  ViewSnapshot,
  Repair,
  RepairSteps,
} from "../contracts";
import { FLEET } from "../../dist/fleet.mjs";
import { ROBOTS } from "../../dist/engine.mjs";
import { Markup } from "./markup";
import { RELEASE } from "../../dist/version.mjs";
export const usePreferences = create<{
  reduced: boolean;
  inspect: boolean;
  sideLight: boolean;
  toggleLight: () => void;
  toggleMotion: () => void;
  toggleInspect: () => void;
}>((set) => ({
  reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
  inspect: false,
  sideLight: false,
  toggleLight: () => set((s) => ({ sideLight: !s.sideLight })),
  toggleMotion: () => set((s) => ({ reduced: !s.reduced })),
  toggleInspect: () => set((s) => ({ inspect: !s.inspect })),
}));
export function Odometer({ value }: { value: number }) {
  const last = useRef(value),
    tracks = useRef<(HTMLSpanElement | null)[]>([]);
  const digits = String(value).split("");
  useLayoutEffect(() => {
    const before = String(last.current)
      .padStart(digits.length, "0")
      .slice(-digits.length);
    const increasing = value >= last.current;
    last.current = value;
    const tweens = digits.map((d, i) => {
      const track = tracks.current[i];
      if (!track) return null;
      const from = 10 + Number(before[i] || 0),
        n = Number(d),
        old = Number(before[i] || 0),
        to =
          10 +
          n +
          (increasing && n < old ? 10 : !increasing && n > old ? -10 : 0);
      return gsap.fromTo(
        track,
        // A new strip at digit 5 starts exactly halfway down its 30 rows.
        // Keep GSAP from interpreting that offset as an extra -50% transform.
        { yPercent: 0, y: `${-from}em` },
        {
          y: `${-to}em`,
          duration: usePreferences.getState().reduced ? 0 : 0.55,
          delay: i * 0.035,
          ease: "power3.out",
        },
      );
    });
    return () => tweens.forEach((t) => t?.kill());
  }, [value]);
  return (
    <span className="odometer" aria-label={String(value)}>
      {digits.map((d, i) => (
        <span
          className="number-reel"
          aria-hidden="true"
          key={digits.length + "-" + i}
        >
          <span
            className="number-strip"
            ref={(e) => {
              tracks.current[i] = e;
            }}
            style={{ transform: `translateY(${-10 - Number(d)}em)` }}
          >
            {Array.from({ length: 30 }, (_, n) => (
              <span key={n}>{n % 10}</span>
            ))}
          </span>
        </span>
      ))}
    </span>
  );
}
function ShipHealthBar({
  hp,
  maxHp,
  shield,
  side,
}: {
  hp: number;
  maxHp: number;
  shield: number;
  side: "hero" | "enemy";
}) {
  const percent = Math.min(100, Math.max(0, (hp / maxHp) * 100));
  const lastHp = useRef(hp);
  const [ghostWidth, setGhostWidth] = useState(percent);

  useEffect(() => {
    if (hp < lastHp.current) {
      const timer = setTimeout(() => {
        setGhostWidth(percent);
        lastHp.current = hp;
      }, 400);
      return () => clearTimeout(timer);
    } else {
      lastHp.current = hp;
      setGhostWidth(percent);
    }
  }, [hp, percent]);

  return (
    <div className={`ship-health-bar health-${side}`} aria-hidden="true">
      <div className="bar-track">
        <div className="bar-ghost" style={{ width: `${ghostWidth}%` }} />
        <div className="bar-fill" style={{ width: `${percent}%` }} />
      </div>
      {shield > 0 && (
        <span className="bar-shield" title={`防护盾: ${shield}`}>
          <i className="shield-icon" />
          <b>{shield}</b>
        </span>
      )}
    </div>
  );
}
function CardFace({
  card,
  action,
  index,
  selected = false,
  disabled = false,
  order,
}: {
  card: Card;
  action: string;
  index?: number;
  selected?: boolean;
  disabled?: boolean;
  order?: number;
}) {
  const label = card.type === "N" ? String(card.value) : card.type;
  const name =
    card.type === "N"
      ? null
      : { W: "星云", A: "加速", J: "跃迁", D: "定轨", B: "调拨" }[card.type];
  return (
    <button
      className={`card ${name ? `special-card card-${card.type.toLowerCase()}` : ""} ${selected ? "selected" : ""}`}
      data-action={action}
      data-id={card.id}
      data-index={index}
      data-focus={`${action}-${card.id}`}
      aria-label={`${action === "opponent-card" ? "对手" : action === "supply" ? "补牌" : "手牌"} ${name ? `${name} ${label}` : label}`}
      aria-pressed={selected}
      disabled={disabled}
    >
      <small>{label}</small>
      <span className="card-symbol">{label}</span>
      {name && <span className="card-name">{name}</span>}
      {action === "card" && index !== undefined && (
        <kbd className="card-keycap" aria-hidden="true">
          {index + 1}
        </kbd>
      )}
      {order && (
        <span className="card-order" aria-label={`第 ${order} 步`}>
          {order}
        </span>
      )}
    </button>
  );
}
function RepairHints({
  repair,
  progress,
  actor,
}: {
  repair: Repair;
  progress: RepairSteps | undefined;
  actor: number;
}) {
  const { metric } = repair;
  if (!["ops", "chains", "goalChains", "goalKinds"].includes(metric))
    return null;
  const entries =
    metric === "ops"
      ? [1, -1]
          .filter((value) => progress?.ops.includes(value))
          .map((value) => ({
            label: value === 1 ? "+" : "−",
            name: value === 1 ? "加法" : "减法",
            tone: "op",
          }))
      : metric === "goalKinds"
        ? (["E", "P", "L"] as const)
            .filter((value) => progress?.goalKinds.includes(value))
            .map((value) => ({
              label: { E: "区", P: "精", L: "联" }[value],
              name: { E: "区域", P: "精准", L: "联动" }[value],
              tone: "kind",
            }))
        : [0, 1, 2]
            .filter((value) =>
              progress?.[
                metric === "chains" ? "chains" : "goalChains"
              ].includes(value),
            )
            .map((value) => ({
              label: ["蓝", "紫", "橙"][value],
              name: ["蓝星链", "紫星链", "橙星链"][value],
              tone: String(value),
            }));
  const label =
    metric === "goalChains" || metric === "goalKinds" ? "已攻" : "已用";
  return (
    <div
      className="repair-details"
      role="group"
      aria-label={`${actor ? "对手" : "你"}本任务${label} ${entries.map((item) => item.name).join("、") || "暂无"}`}
    >
      <span className="repair-details-label">{label}</span>
      {entries.length ? (
        entries.map((item) => (
          <span
            className={`repair-detail repair-hint-${item.tone}`}
            key={item.name}
            title={item.name}
          >
            {item.label}
          </span>
        ))
      ) : (
        <span className="repair-detail-empty">暂无</span>
      )}
    </div>
  );
}
function Rails({ snapshot: s }: { snapshot: ViewSnapshot }) {
  const g = s.game,
    selectedChain = s.ui.humanAction && !g.rest_mode ? g.selection.chain : null,
    marks = new Set(g.goals.flatMap((x) => x.values || []));
  return (
    <section className="rails" id="track-region" aria-label="三条星链">
      <div className="sector">
        <Markup html={s.ui.sector} />
      </div>
      <div id="rail-list">
        {g.board.map((value, i) => (
          <button
            className={
              "rail rail-button " + (selectedChain === i ? "active" : "")
            }
            style={
              {
                "--rail-color": ["#80e5ff", "#c899ff", "#ffb584"][i],
              } as CSSProperties
            }
            data-action="chain"
            data-index={i}
            disabled={!s.ui.humanAction || g.rest_mode}
            key={i}
            aria-label={`${["蓝", "紫", "橙"][i]}星链，当前 ${value}`}
            aria-pressed={selectedChain === i}
          >
            <b>
              {["蓝", "紫", "橙"][i]}星链
              <kbd className="keycap-hint" aria-hidden="true">
                {["Q", "W", "E"][i]}
              </kbd>
            </b>
            <span className="track">
              {Array.from({ length: 21 }, (_, n) => (
                <span
                  className={
                    "tick " +
                    (n % 5 === 0 ? "major-tick " : "minor-tick ") +
                    (marks.has(n) ? "target " : "")
                  }
                  style={{ left: `${n * 5}%` }}
                  key={n}
                >
                  <span className="rail-label">{n}</span>
                </span>
              ))}
              <i
                className="cursor position-star"
                style={{ left: `${value * 5}%` }}
              />
              {selectedChain === i && s.ui.landing?.chain === i && (
                <i
                  className="landing-marker"
                  style={{ left: `${s.ui.landing.after * 5}%` }}
                  role="img"
                  aria-label={`预计落点 ${s.ui.landing.after}`}
                  data-landing={s.ui.landing.after}
                />
              )}
              {selectedChain === i &&
                s.ui.landing?.chain === i &&
                value !== s.ui.landing.after && (
                  <svg
                    className="jump-arc-svg"
                    viewBox="0 0 100 24"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                  >
                    <path
                      d={`M ${value * 5} 20 Q ${(value + s.ui.landing.after) * 2.5} ${Math.max(
                        2,
                        18 - Math.min(16, Math.abs(value - s.ui.landing.after) * 2),
                      )} ${s.ui.landing.after * 5} 20`}
                      className="jump-arc-path"
                    />
                  </svg>
                )}
              {selectedChain === i &&
                g.calibrate_offer &&
                g.calibrate_offer.after !== s.ui.landing?.after && (
                  <i
                    className="calibrate-target-cue"
                    style={{ left: `${g.calibrate_offer.after * 5}%` }}
                    role="img"
                    aria-label={`可校准落点 ${g.calibrate_offer.after}`}
                  />
                )}
              {selectedChain === i && s.ui.formula && (
                <span className="rail-preview">{s.ui.formula}</span>
              )}
            </span>
            <span className="rail-current">
              {selectedChain === i ? "已选 · " : ""}当前 {value}
            </span>
          </button>
        ))}
      </div>
      <div className="rail-controls">
        <Markup html={s.ui.calibrate} />
        <Markup html={s.ui.operations} />
      </div>
    </section>
  );
}
export function Cockpit({ client }: { client: MatchClient }) {
  const s = useSyncExternalStore(client.subscribe, client.getSnapshot),
    prefs = usePreferences();
  if (!s) return <div className="loading">正在建立星链连接…</div>;
  const g = s.game,
    selected = s.ui.selected;
  const hasA =
      !g.rest_mode &&
      selected.some((id) => g.hand.find((c) => c.id === id)?.type === "A"),
    hasB =
      !g.rest_mode &&
      selected.some((id) => g.hand.find((c) => c.id === id)?.type === "B"),
    numericOrder = selected.filter(
      (id) => g.hand.find((c) => c.id === id)?.type === "N",
    );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const active = document.activeElement;
      if (
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.closest("dialog[open]"))
      ) {
        return;
      }
      const modal = document.getElementById("modal") as HTMLDialogElement | null;
      if (modal && modal.open) {
        if (e.key === "Escape") {
          modal.close();
          e.preventDefault();
        }
        return;
      }

      const key = e.key;
      // 1 ~ 6: Select hand cards
      if (key >= "1" && key <= "6") {
        const index = parseInt(key, 10) - 1;
        const cardButtons = document.querySelectorAll<HTMLButtonElement>(
          "#cards button.card[data-action='card']",
        );
        if (cardButtons[index] && !cardButtons[index].disabled) {
          cardButtons[index].click();
          e.preventDefault();
        }
        return;
      }

      // Q, W, E: Select blue, purple, orange rails
      if (key === "q" || key === "Q") {
        document
          .querySelector<HTMLButtonElement>(
            '[data-action="chain"][data-index="0"]',
          )
          ?.click();
        e.preventDefault();
        return;
      }
      if (key === "w" || key === "W") {
        document
          .querySelector<HTMLButtonElement>(
            '[data-action="chain"][data-index="1"]',
          )
          ?.click();
        e.preventDefault();
        return;
      }
      if (key === "e" || key === "E") {
        document
          .querySelector<HTMLButtonElement>(
            '[data-action="chain"][data-index="2"]',
          )
          ?.click();
        e.preventDefault();
        return;
      }

      // + / = : Addition
      if (key === "+" || key === "=") {
        document
          .querySelector<HTMLButtonElement>(
            '[data-action="op"][data-value="1"]:not(:disabled)',
          )
          ?.click();
        e.preventDefault();
        return;
      }
      // - : Subtraction
      if (key === "-") {
        document
          .querySelector<HTMLButtonElement>(
            '[data-action="op"][data-value="-1"]:not(:disabled)',
          )
          ?.click();
        e.preventDefault();
        return;
      }

      // C : Calibrate
      if (key === "c" || key === "C") {
        document
          .querySelector<HTMLButtonElement>(
            '[data-action="calibrate"]:not(:disabled)',
          )
          ?.click();
        e.preventDefault();
        return;
      }

      // R : Rest or Draw
      if (key === "r" || key === "R") {
        const restBtn = document.querySelector<HTMLButtonElement>(
          '[data-action="rest"]:not(:disabled)',
        );
        const drawBtn = document.querySelector<HTMLButtonElement>(
          '[data-action="draw"]:not(:disabled)',
        );
        if (restBtn) {
          restBtn.click();
          e.preventDefault();
        } else if (drawBtn) {
          drawBtn.click();
          e.preventDefault();
        }
        return;
      }

      // Space or Enter: Play / Roll / Confirm Rest / Draw
      if (key === " " || key === "Enter") {
        const playBtn = document.querySelector<HTMLButtonElement>(
          '[data-action="play"]:not(:disabled)',
        );
        const rollBtn = document.querySelector<HTMLButtonElement>(
          '[data-action="roll"]:not(:disabled)',
        );
        const confirmRestBtn = document.querySelector<HTMLButtonElement>(
          '[data-action="confirm-rest"]:not(:disabled)',
        );
        const drawBtn = document.querySelector<HTMLButtonElement>(
          '[data-action="draw"]:not(:disabled)',
        );
        if (playBtn) {
          playBtn.click();
          e.preventDefault();
        } else if (rollBtn) {
          rollBtn.click();
          e.preventDefault();
        } else if (confirmRestBtn) {
          confirmRestBtn.click();
          e.preventDefault();
        } else if (drawBtn) {
          drawBtn.click();
          e.preventDefault();
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <main
        className={`cockpit ${g.goals.length === 4 ? "advanced-rules" : ""}`}
      >
        <header className="masthead">
          <div className="brand">
            <h1>
              星链对战{" "}
              <small className="release-label">V{RELEASE.version}</small>
            </h1>
          </div>
          <nav>
            <button data-action="records">记录与难度</button>
            <button data-action="help">玩法说明</button>
            <button
              data-action="sound"
              aria-pressed={s.ui.sound}
              title="音乐与音效 · Relaxing Ambient Music — Clavier-Music"
            >
              音效：{s.ui.sound ? "开" : "关"}
            </button>
            <button onClick={prefs.toggleMotion} aria-pressed={prefs.reduced}>
              {prefs.reduced ? "完整动效" : "减弱动效"}
            </button>
            <button data-action="restart">重新开局</button>
          </nav>
        </header>
        <section className="opponent-hand" aria-label="对手手牌">
          <span>对手手牌</span>
          <div className="cards mini-cards">
            {g.robot_hand.map((card) => (
              <CardFace
                card={card}
                action="opponent-card"
                disabled
                key={card.id}
              />
            ))}
          </div>
        </section>
        <aside
          className="instrument targets"
          data-electric="cyan"
          data-pulse={g.automatic_goal_claims.length ? "1" : "0"}
        >
          <header>
            <h2>攻击目标</h2>
            <span>共享 {g.goals.length} 项</span>
          </header>
          <div className="entries">
            {[...g.goals]
              .sort((a, b) => a.damage - b.damage)
              .map((goal, i) => (
                <article
                  key={goal.id}
                  data-electric-cell="cyan"
                  data-pulse={
                    g.automatic_goal_claims.includes(goal.id) ? "1" : "0"
                  }
                  className={
                    g.automatic_goal_claims.includes(goal.id)
                      ? "achievable"
                      : ""
                  }
                >
                  <span
                    className={
                      "eyebrow " +
                      { E: "cyan", P: "orange", L: "purple" }[goal.kind]
                    }
                  >
                    <i
                      className={`goal-kind-icon icon-${goal.kind.toLowerCase()}`}
                      aria-hidden="true"
                    />
                    {String(i + 1).padStart(2, "0")} /{" "}
                    {{ E: "区域", P: "精准", L: "联动" }[goal.kind]}
                  </span>
                  <div className="target-title">
                    <h3>{goal.name}</h3>
                    <b className="inline-damage">伤害 {goal.damage}</b>
                  </div>
                  <p>{goal.text}</p>
                  <div className="metric" hidden={g.goals.length === 4}>
                    伤害 <strong>{goal.damage}</strong>
                    <span className="rule-line" />
                  </div>
                  {g.rest_mode && (
                    <button
                      data-action="goal"
                      data-id={goal.id}
                      aria-pressed={s.ui.restGoal === goal.id}
                    >
                      {s.ui.restGoal === goal.id ? "已选替换" : "休整时替换"}
                    </button>
                  )}
                </article>
              ))}
          </div>
          <footer>
            预计攻击{" "}
            <strong>
              <Odometer value={g.automatic_damage} />
            </strong>
            <small>确认后触发全部达成项</small>
          </footer>
        </aside>
        <section className="battle" aria-label="飞船对战">
          <div className="battle-top">
            <Markup html={s.ui.tactics} />
            <strong
              className="round-counter"
              aria-label={`第 ${g.round} 轮，共 12 轮`}
            >
              <span>第</span>
              <span className="round-number">
                {g.round}
                <span className="round-divider">/</span>12
              </span>
              <span>轮</span>
            </strong>
          </div>
          <div className="ship-anchor hero" id="hero-anchor" />
          <div className="ship-anchor enemy" id="enemy-anchor" />
          <div className="ship-caption hero-caption">
            <span>你{g.first === 0 ? " · 先手" : ""}</span>
            <strong>
              <Odometer value={g.hp[0]} />
            </strong>
            <ShipHealthBar
              hp={g.hp[0]}
              maxHp={g.initial_hp || 18}
              shield={g.shields[0] || 0}
              side="hero"
            />
            <small>生命{g.shields[0] ? ` · 盾 ${g.shields[0]}` : ""}</small>
          </div>
          <div className="ship-caption enemy-caption">
            <span>
              {g.opponent}
              {g.first === 1 ? " · 先手" : ""}
            </span>
            <strong>
              <Odometer value={g.hp[1]} />
            </strong>
            <ShipHealthBar
              hp={g.hp[1]}
              maxHp={g.initial_hp || 18}
              shield={g.shields[1] || 0}
              side="enemy"
            />
            <small>生命{g.shields[1] ? ` · 盾 ${g.shields[1]}` : ""}</small>
          </div>
          {prefs.inspect && (
            <div className="inspect-controls">
              <button onClick={prefs.toggleInspect}>返回战斗视角</button>
              <button onClick={prefs.toggleLight}>
                {prefs.sideLight ? "关闭侧光" : "开启侧光"}
              </button>
            </div>
          )}
          <div id="combat-notice" role="status">
            {g.status}
          </div>
          {s.ui.opening && !prefs.inspect && (
            <div className="opening-overlay">
              <Markup html={s.ui.opening} />
            </div>
          )}
        </section>
        <aside
          className="instrument repairs"
          data-electric="violet"
          data-pulse={g.automatic_repair_rewards.length ? "1" : "0"}
        >
          <header>
            <h2>维修补给</h2>
            <span>共享 {g.repairs[0].length} 项</span>
          </header>
          <div className="entries">
            {g.repairs[0].map((repair, i) => (
              <article
                key={repair.id}
                data-electric-cell="violet"
                data-pulse={
                  g.automatic_repair_rewards.includes(repair.id) ? "1" : "0"
                }
                data-challenge={repair.id}
                className={
                  g.automatic_repair_rewards.includes(repair.id)
                    ? "achievable"
                    : ""
                }
              >
                <div className="repair-title">
                  <h3>{repair.name}</h3>
                  <b>
                    +{repair.healing} <small>生命</small>
                  </b>
                </div>
                <p>{repair.text}</p>
                <div className="progress-pair">
                  {[0, 1].map((actor) => (
                    <div key={actor}>
                      <div className="progress-label">
                        {actor ? "对手" : "你"}{" "}
                        <b>
                          {g.repairs[actor][i].progress}/{repair.target}
                        </b>
                      </div>
                      <progress
                        max={repair.target}
                        value={g.repairs[actor][i].progress}
                      />
                      <RepairHints
                        repair={repair}
                        progress={g.challenge_progress[actor]?.[repair.id]}
                        actor={actor}
                      />
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
          <footer>
            <small>
              完成几项，补充几项
              <br />
              新任务从下一次出牌开始计数
            </small>
          </footer>
        </aside>
        <Rails snapshot={s} />
        <section
          className="command-deck"
          data-electric="cyan"
          data-pulse={selected.length ? "1" : "0"}
        >
          <div className="hand">
            <header>
              <h2>你的手牌</h2>
              <span>{g.hand.length}/6 张</span>
            </header>
            <div className="cards" id="cards">
              {g.hand.map((card, idx) => (
                <CardFace
                  card={card}
                  action="card"
                  index={idx}
                  selected={selected.includes(card.id)}
                  order={
                    hasA && numericOrder.includes(card.id)
                      ? numericOrder.indexOf(card.id) + 1
                      : undefined
                  }
                  disabled={!s.ui.humanAction}
                  key={card.id}
                />
              ))}
            </div>
            <p>
              已选{g.rest_mode ? "弃牌" : "牌"}{" "}
              <b>
                {selected
                  .map((id) => {
                    const c = g.hand.find((c) => c.id === id)!;
                    return c.type === "N" ? c.value : c.type;
                  })
                  .join(" · ") || "—"}
              </b>
              <span>
                {hasA
                  ? "按 1 → 2 顺序运算"
                  : g.goals.length === 4
                    ? "W 星云 · A 加速 · J 跃迁 · D 定轨 · B 调拨"
                    : "W 星云 · A 加速 · J 跃迁"}
              </span>
            </p>
          </div>
          <div className="refill" id="supply-region">
            <header>
              <h2>补牌区</h2>
              <span>
                {s.ui.humanRefill
                  ? `还需 ${6 - g.hand.length} 张`
                  : "出牌后补满 6 张"}
              </span>
            </header>
            <div className="cards mini-cards">
              {g.market.map((card, index) => (
                <CardFace
                  card={card}
                  action={hasB ? "barter-market" : "supply"}
                  index={index}
                  disabled={!(s.ui.humanRefill || (hasB && s.ui.humanAction))}
                  selected={hasB && g.selection.market === index}
                  key={card.id}
                />
              ))}
            </div>
            <button
              className="rest"
              data-action="draw"
              disabled={!s.ui.humanRefill}
            >
              随机抽 1 张 <small>牌堆 {s.ui.deckCount}</small>
            </button>
          </div>
          <div className="orders">
            <Markup html={s.ui.orders} />
          </div>
        </section>
      </main>
      <section className="below-deck">
        <div className="fleet-heading">
          <h2>选择对手</h2>
          <span>十六级星舰 · 按实际难度解锁</span>
          <button
            onClick={() => {
              prefs.toggleInspect();
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            {prefs.inspect ? "返回战斗视角" : "近看飞船"}
          </button>
          <button onClick={prefs.toggleLight} aria-pressed={prefs.sideLight}>
            {prefs.sideLight ? "关闭我方侧光" : "我方侧面受光"}
          </button>
          <a href="/asset-library.html">视听资产库</a>
        </div>
        <div className="levels">
          {ROBOTS.map((r, i) => (
            <button
              key={i}
              className={g.selected_opponent_level === i + 1 ? "active" : ""}
              data-action="level"
              data-level={i}
              disabled={i >= g.unlocked_opponents}
            >
              <img src={FLEET[i].portrait} alt="" loading="lazy" />
              <b>
                {i + 1} · {r.name}
              </b>
              <small>
                {i >= g.unlocked_opponents ? "未解锁" : FLEET[i].name}
              </small>
            </button>
          ))}
        </div>
        <details>
          <summary>航行记录</summary>
          <pre>{s.ui.history || "还没有航行记录。"}</pre>
        </details>
        <p>{s.ui.recordStatus}</p>
        <p className="render-info">
          <span id="renderer-status">加载立体战场…</span>
          <span id="render-stats" />
        </p>
      </section>
    </>
  );
}
