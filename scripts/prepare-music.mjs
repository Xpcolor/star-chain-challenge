// Offline loop edit of the owner-selected Clavier-Music recording. Source stays intact.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const source = process.argv[2];
const ffmpeg = process.argv[3] || "ffmpeg";
const sourceSha256 =
  "523155341193b74f5ef5c06eb5b248a234a9297b3e2a13799c3f1d358d3bbe54";
if (!source)
  throw Error("Usage: node scripts/prepare-music.mjs SOURCE_MP3 [FFMPEG]");
if (
  createHash("sha256").update(readFileSync(source)).digest("hex") !==
  sourceSha256
)
  throw Error(
    "Selected music source hash does not match the owner's option 3.",
  );
const rate = 44100,
  channels = 2,
  start = 18,
  end = 116,
  crossfade = 4;
const decoded = execFileSync(
  ffmpeg,
  [
    "-nostdin",
    "-v",
    "error",
    "-i",
    source,
    "-map",
    "0:a:0",
    "-ar",
    String(rate),
    "-ac",
    String(channels),
    "-f",
    "f32le",
    "pipe:1",
  ],
  { maxBuffer: 64 * 1024 * 1024, windowsHide: true },
);
const first = start * rate,
  last = end * rate,
  fade = crossfade * rate;
if (decoded.length / 8 < last)
  throw Error("Source is too short for the reviewed loop window.");
const length = last - first - fade,
  middle = length - fade;
const loop = Buffer.alloc(length * 8);
let peak = 0;
for (let i = 0; i < length; i++) {
  const t = (i - middle) / fade;
  const headWeight = i < middle ? 0 : Math.sin((t * Math.PI) / 2) ** 2;
  for (let ch = 0; ch < channels; ch++) {
    const sample =
      i < middle
        ? decoded.readFloatLE(((first + fade + i) * channels + ch) * 4)
        : decoded.readFloatLE(
            ((last - fade + i - middle) * channels + ch) * 4,
          ) *
            (1 - headWeight) +
          decoded.readFloatLE(((first + i - middle) * channels + ch) * 4) *
            headWeight;
    loop.writeFloatLE(sample, (i * channels + ch) * 4);
    peak = Math.max(peak, Math.abs(sample));
  }
}
// Preserve the music dynamics; reserve peak headroom before the game mix.
const gain = Math.min(1, 0.88 / peak);
let sum = 0;
for (let i = 0; i < length * channels; i++) {
  const sample = loop.readFloatLE(i * 4) * gain;
  loop.writeFloatLE(sample, i * 4);
  sum += sample * sample;
}
const output = "dist/assets/music-relaxing-ambient.ogg";
execFileSync(
  ffmpeg,
  [
    "-nostdin",
    "-v",
    "error",
    "-y",
    "-f",
    "f32le",
    "-ar",
    String(rate),
    "-ac",
    String(channels),
    "-i",
    "pipe:0",
    "-c:a",
    "libvorbis",
    "-q:a",
    "5",
    "-metadata",
    "title=Relaxing Ambient Music (StarChain loop)",
    "-metadata",
    "artist=Clavier-Music",
    output,
  ],
  { input: loop, windowsHide: true },
);
const data = readFileSync(output);
const receipt = {
  title: "Relaxing Ambient Music",
  artist: "Clavier-Music",
  ownerSelection: "option 3",
  libraryAssetId: "ma_523155341193b74f5ef5c06eb5b248a2",
  sourceSha256,
  sourceDurationSeconds: 123.72,
  sourceWindowSeconds: [start, end],
  crossfadeSeconds: crossfade,
  durationSeconds: length / rate,
  sampleRate: rate,
  channels,
  preparationGain: gain,
  pcmPeak: peak * gain,
  pcmRms: Math.sqrt(sum / (length * channels)),
  path: output,
  bytes: data.length,
  sha256: createHash("sha256").update(data).digest("hex"),
  rightsBasis:
    "Owner-provided SPGC library recording, selected explicitly for local StarChain use. Preserve artist credit. Publication remains pending owner approval.",
  originalPreserved: true,
};
writeFileSync("资产库/背景音乐.json", JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify(receipt));
