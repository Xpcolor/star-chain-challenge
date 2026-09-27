import React from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { LocalMatchClient } from "./application/local-client";
import { createAudio } from "./presentation/audio";
import { BattleScene } from "./presentation/scene";
import { Cockpit, usePreferences } from "./ui/Cockpit";
import { Markup } from "./ui/markup";
import type { ActionName } from "./contracts";
import "../dist/visual-sample.css";
import "./ui/app.css";

const audio = createAudio(),
  scene = new BattleScene(audio);
const modalRoot = createRoot(document.getElementById("modal")!);
const client = new LocalMatchClient(audio, scene, (html) =>
  flushSync(() => modalRoot.render(<Markup html={html} />)),
);
window.starChainClient = client;
window.starChainBridge!.motionReduced = () => usePreferences.getState().reduced;
createRoot(document.getElementById("app")!).render(<Cockpit client={client} />);
document.addEventListener("click", (event) => {
  void audio.unlock();
  const button = (event.target as Element).closest<HTMLElement>(
    "[data-action]",
  );
  if (!button || button.hasAttribute("disabled")) return;
  const snapshot = client.getSnapshot();
  if (!snapshot) return;
  const data = Object.fromEntries(
    Object.entries(button.dataset).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  );
  void client
    .dispatch({
      protocol: 1,
      id: crypto.randomUUID(),
      matchId: snapshot.matchId,
      action: data.action as ActionName,
      data,
    })
    .then((result) => {
      if (!result.ok) {
        const toast = document.getElementById("toast")!;
        toast.textContent = result.error || "操作暂不可用";
        toast.hidden = false;
        setTimeout(() => {
          toast.hidden = true;
        }, 2500);
      }
    });
});
await client.start();
await scene.init();
if (import.meta.hot) import.meta.hot.dispose(() => client.dispose());
