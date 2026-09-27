import { Howl, Howler } from "howler";
import { AUDIO_BANK } from "../../dist/audio-bank.mjs";
import type { AudioBus } from "../contracts";
export function createAudio(): AudioBus {
  let enabled = true,
    volume = 0.3,
    disposed = false,
    unlocked = false;
  const sounds = new Map<string, Howl>();
  const soundFor = (id: string) => {
    let sound = sounds.get(id);
    if (!sound) {
      sound = new Howl({
        src: ["/assets/audio-" + id + ".wav"],
        volume,
        preload: true,
      });
      sounds.set(id, sound);
    }
    return sound;
  };
  const voices: { sound: Howl; id: number }[] = [];
  const stop = () => {
    for (const s of sounds.values()) s.stop();
    voices.length = 0;
  };
  return {
    get enabled() {
      return enabled;
    },
    get volume() {
      return volume;
    },
    async unlock() {
      if (disposed) return false;
      if (unlocked) return true;
      try {
        // Decode the small sound bank on the first gesture, before combat starts.
        AUDIO_BANK.forEach((entry) => soundFor(String(entry.id)));
        await Howler.ctx?.resume();
        unlocked = true;
        return true;
      } catch {
        return false;
      }
    },
    async play(id, pan = 0, power = 1) {
      if (!enabled || !unlocked || disposed) return false;
      const entry = AUDIO_BANK.find((e) => e.id === id);
      if (!entry) return false;
      const sound = soundFor(id);
      while (voices.length >= 8) {
        const old = voices.shift()!;
        old.sound.stop(old.id);
      }
      const voice = sound.play();
      sound.stereo(Math.max(-1, Math.min(1, pan)), voice);
      sound.volume(Math.min(0.7, volume * power), voice);
      voices.push({ sound, id: voice });
      sound.once(
        "end",
        () => {
          const index = voices.findIndex(
            (v) => v.id === voice && v.sound === sound,
          );
          if (index >= 0) voices.splice(index, 1);
        },
        voice,
      );
      return true;
    },
    setEnabled(v) {
      enabled = v;
      if (!v) stop();
    },
    setVolume(v) {
      const old = volume;
      volume = Math.max(0, Math.min(1, v));
      for (const s of sounds.values()) s.fade(old, volume, 120);
    },
    stop,
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      sounds.forEach((s) => s.unload());
      sounds.clear();
    },
  };
}
