// Shared presentation timing. Rules and replay settlement remain synchronous.
export const COMBAT_TIMING = Object.freeze({
  prepare: 0.5, attackSpacing: 0.23, travel: 0.2,
  repairSpacing: 0.22, particles: 1.1, repairDuration: 1.05,
  terminal: 1.2, collapse: 2,
});
export function terminalDelaySeconds(event) {
  const t = COMBAT_TIMING;
  const attacks = event?.rawDamage ? Math.max(1, event.claimed?.length || 0) : 0;
  // Impacts run on their own render-clock timelines. Leave two frames of headroom.
  return Math.max(t.terminal, attacks
    ? t.prepare + (attacks - 1) * t.attackSpacing + t.travel + 0.12
    : 0);
}
export function combatHoldMs(event, terminal = false, reduced = false) {
  if (reduced) return 100;
  const t = COMBAT_TIMING;
  const attacks = event.rawDamage ? Math.max(1, event.claimed?.length || 0) : 0;
  const repairs = Math.min(6, event.healing || 0);
  return Math.ceil(1000 * Math.max(
    t.prepare + 0.2,
    attacks ? t.prepare + (attacks - 1) * t.attackSpacing + t.travel + t.particles : 0,
    repairs ? t.prepare + (repairs - 1) * t.repairSpacing + t.particles : 0,
    terminal ? terminalDelaySeconds(event) + t.collapse : 0,
  ));
}
