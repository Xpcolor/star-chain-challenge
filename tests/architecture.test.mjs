import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { LocalMatchClient } from "../src/application/local-client.ts";

test("replaceable match boundary rejects stale/protocol commands and deduplicates confirmations", async () => {
  globalThis.window = {};
  let calls = 0,
    stops = 0;
  const client = new LocalMatchClient({}, {}, () => {}),
    bridge = window.starChainBridge;
  bridge.ready(
    () => {
      calls++;
    },
    () => stops++,
  );
  bridge.render({ game: { hp: [18, 18] }, ui: {}, battle: { match: 1 } });
  const command = {
    protocol: 1,
    id: "confirm-1",
    matchId: "1",
    action: "play",
  };
  const [a, b] = await Promise.all([
    client.dispatch(command),
    client.dispatch(command),
  ]);
  assert.equal(a.ok, true);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  bridge.render({ game: { hp: [18, 18] }, ui: {}, battle: { match: 2 } });
  assert.equal((await client.dispatch({ ...command, id: "late-1" })).ok, false);
  assert.equal(
    (await client.dispatch({ ...command, id: "v2", protocol: 2, matchId: "2" }))
      .ok,
    false,
  );
  bridge.ready(
    () => {
      throw Error("illegal move");
    },
    () => stops++,
  );
  assert.match(
    (await client.dispatch({ ...command, id: "invalid", matchId: "2" })).error,
    /illegal move/,
  );
  assert.equal(calls, 1);
  client.dispose();
  assert.equal(stops, 1);
  assert.equal(
    (await client.dispatch({ ...command, id: "disposed", matchId: "2" })).ok,
    false,
  );
});

test("all detailed fleet identities contain embedded textures, intact hulls and six actual fracture parts", () => {
  const manifest = JSON.parse(
      readFileSync("dist/assets/fleet-models.json", "utf8"),
    ),
    hashes = new Set();
  assert.equal(manifest.length, 17);
  for (const entry of manifest) {
    const bytes = readFileSync("dist" + entry.model);
    assert.ok(bytes.length < 8_000_000, entry.id + " download budget");
    assert.equal(entry.bytes, bytes.length);
    assert.equal(
      entry.sha256,
      createHash("sha256").update(bytes).digest("hex"),
    );
    const gltf = JSON.parse(
      bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
    );
    assert.ok(
      gltf.nodes.some((n) => n.name === "hull"),
      entry.id,
    );
    assert.equal(
      gltf.nodes.filter((n) => n.name?.startsWith("debris_")).length,
      entry.fractureParts,
      entry.id,
    );
    assert.equal(entry.fractureParts, 6);
    assert.ok(gltf.images.length > 0);
    assert.ok(
      gltf.images.every((i) => Number.isInteger(i.bufferView) && !i.uri),
      "textures must be self contained",
    );
    assert.ok(gltf.materials.some((m) => m.name === "fracture_inner_alloy"));
    hashes.add(entry.sha256);
  }
  assert.equal(hashes.size, 17);
});

test("preview deployment explicitly clears production domain routes", () => {
  const source = readFileSync("scripts/deploy.mjs", "utf8");
  assert.match(
    source,
    /if\(pr\)\{\s*delete config\.routes;delete config\.route;config\.workers_dev=true/,
  );
});
