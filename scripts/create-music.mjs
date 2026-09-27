// Original 64-second ambient composition; no samples or third-party recordings.
import { writeFile } from "node:fs/promises";
const rate = 22050,
  duration = 64,
  frames = rate * duration,
  tau = Math.PI * 2;
const chords = [
  [48, 55, 59, 62, 64],
  [45, 52, 55, 59, 64],
  [41, 48, 52, 57, 60],
  [43, 50, 55, 57, 62],
  [40, 47, 55, 59, 62],
  [41, 48, 52, 55, 60],
  [45, 52, 55, 59, 62],
  [43, 50, 55, 57, 62],
];
const notes = [];
for (let bar = 0; bar < 8; bar++) {
  chords[bar].forEach((midi, j) =>
    notes.push({
      midi,
      start: bar * 8 + j * 0.12,
      life: 11,
      amp: j ? 0.045 : 0.065,
      pan: (j - 2) * 0.2,
      pluck: false,
    }),
  );
  [0, 2.5, 5.5].forEach((beat, j) =>
    notes.push({
      midi: chords[bar][2 + (j % 3)] + 12,
      start: bar * 8 + beat,
      life: 6,
      amp: 0.055,
      pan: Math.sin(bar + j) * 0.5,
      pluck: true,
    }),
  );
}
const left = new Float32Array(frames),
  right = new Float32Array(frames);
for (let i = 0; i < frames; i++) {
  const t = i / rate;
  for (const n of notes) {
    const dt = (t - n.start + duration) % duration;
    if (dt >= n.life) continue;
    const f = 440 * 2 ** ((n.midi - 69) / 12);
    const env = n.pluck
      ? Math.min(1, dt / 0.025) *
        Math.exp(-dt * 1.1) *
        Math.min(1, (n.life - dt) / 0.6)
      : Math.sin((Math.PI * dt) / n.life) ** 2;
    const wave =
      (Math.sin(tau * f * dt) +
        0.16 * Math.sin(tau * f * 2 * dt) +
        0.06 * Math.sin(tau * f * 3 * dt)) *
      env *
      n.amp;
    left[i] += wave * Math.sqrt((1 - n.pan) / 2);
    right[i] += wave * Math.sqrt((1 + n.pan) / 2);
  }
}
// Circular soft reflections preserve sample continuity at the loop seam.
const out = Buffer.alloc(44 + frames * 4);
out.write("RIFF");
out.writeUInt32LE(out.length - 8, 4);
out.write("WAVEfmt ", 8);
out.writeUInt32LE(16, 16);
out.writeUInt16LE(1, 20);
out.writeUInt16LE(2, 22);
out.writeUInt32LE(rate, 24);
out.writeUInt32LE(rate * 4, 28);
out.writeUInt16LE(4, 32);
out.writeUInt16LE(16, 34);
out.write("data", 36);
out.writeUInt32LE(frames * 4, 40);
let peak = 0,
  sum = 0;
for (let i = 0; i < frames; i++)
  for (let ch = 0; ch < 2; ch++) {
    const src = ch ? right : left,
      other = ch ? left : right;
    const sample =
      Math.tanh(
        (src[i] +
          other[(i - Math.round(0.375 * rate) + frames) % frames] * 0.23 +
          src[(i - Math.round(0.75 * rate) + frames) % frames] * 0.12) *
          1.6,
      ) * 0.65;
    peak = Math.max(peak, Math.abs(sample));
    sum += sample * sample;
    out.writeInt16LE(Math.round(sample * 32767), 44 + i * 4 + ch * 2);
  }
await writeFile("dist/assets/music-starlight.wav", out);
console.log(
  JSON.stringify({
    duration,
    rate,
    channels: 2,
    peak,
    rms: Math.sqrt(sum / (frames * 2)),
    bytes: out.length,
  }),
);
