/** Presentation-only controls. Rules, AI and records never read this module. */
export const VISUAL_THEME = Object.freeze({
  blue:'#7ceaff', purple:'#c8a1ff', heal:'#91ffe0', gold:'#ffe4a0',
  chains:['#70eaff','#c99dff','#ffaf73'],
  dpr:1.5, rocks:22, stars:520, particles:96,
  parallax:{background:10, foreground:26, hud:5},
  timings:{transfer:620, arc:520, impact:580, hitStop:65},
});

// A DOM-safe, one-way presentation bus; no event on this channel changes game state.
export function emitVisual(type, detail, env=globalThis){
  if(typeof env.CustomEvent==='function'&&typeof env.document?.dispatchEvent==='function')
    env.document.dispatchEvent(new env.CustomEvent(`starchain:${type}`,{detail}));
}
