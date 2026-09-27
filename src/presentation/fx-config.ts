import { COMBAT_TIMING as TIMING } from "../../dist/combat-timing.mjs";
export const FX = Object.freeze({
  version: 2,
  exposure: 0.95,
  dpr: 1.65,
  maxParticles: 96,
  // A full panel circuit takes 44 seconds: one quarter of the former speed.
  lightning: { length: 0.17, period: 44, boost: 2.5 },
  attack: {
    warmup: TIMING.prepare,
    spacing: TIMING.attackSpacing,
    travel: TIMING.travel,
    hitStop: 0.065,
  },
  repair: { spacing: TIMING.repairSpacing, duration: TIMING.repairDuration },
  terminal: TIMING.terminal,
  arrival: 1.6,
  collapse: TIMING.collapse,
  glass: { side: 0.17, deck: 0.2 },
});
