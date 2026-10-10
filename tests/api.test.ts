import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, strFromU8 } from "fflate";
const root = fileURLToPath(new URL("..", import.meta.url)),
  port = 18223,
  url = `http://127.0.0.1:${port}`;
let child: ChildProcess,
  rev = 0;
async function request(p: string, b?: any) {
  const r = await fetch(
    url + p,
    b === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(b),
        },
  );
  return { status: r.status, body: await r.json() };
}
before(async () => {
  const dir = path.resolve(root, "../../work/checks", `api-${Date.now()}`);
  await fs.mkdir(dir, { recursive: true });
  let log = "";
  child = spawn(process.execPath, ["dist/server.mjs"], {
    cwd: root,
    env: { ...process.env, FMBE_PORT: String(port), FMBE_DATA_DIR: dir },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (b) => (log += b));
  child.stderr?.on("data", (b) => (log += b));
  for (let i = 0; i < 100; i++) {
    try {
      const r = await request("/api/health");
      if (r.status === 200) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(log || "Test service did not start");
});
after(() => {
  child?.kill();
});
test("API read, transactional edits, revisions and replay export", async () => {
  const c = await request("/api/context");
  assert.equal(c.status, 200);
  rev = c.body.project.revision;
  const body = {
    base_revision: rev,
    request_id: "case-1",
    patch: { params: { reach: 3.1 } },
  };
  const edit = await request("/api/design/apply", body);
  assert.equal(edit.status, 200);
  rev = edit.body.project.revision;
  assert.equal(edit.body.project.params.reach, 3.1);
  const duplicate = await request("/api/design/apply", body);
  assert.equal(duplicate.body.project.revision, rev);
  assert.equal(duplicate.body.frame.entityCount, edit.body.frame.entityCount);
  const conflict = await request("/api/design/apply", {
    ...body,
    request_id: "case-2",
  });
  assert.equal(conflict.status, 409);
  const misuse = await request("/api/design/apply", {
    ...body,
    patch: { budget: 64 },
  });
  assert.equal(misuse.status, 409);
  const invalid = await request("/api/design/apply", {
    base_revision: rev,
    request_id: "bad",
    patch: { source: 'box("x",{size:[-1,1,1]});' },
  });
  assert.equal(invalid.status, 422);
  const unchanged = await request("/api/project");
  assert.equal(unchanged.body.revision, rev);
  assert.equal(unchanged.body.params.reach, 3.1);
  const before = (await request("/api/simulation/frame")).body;
  await request("/api/inspect?id=lower");
  const same = (await request("/api/simulation/frame")).body;
  assert.deepEqual(before, same);
  const checkpoint = (await request("/api/simulation/checkpoint", {})).body;
  const after = (
    await request("/api/simulation/step", { frames: 20, dt: 1 / 60 })
  ).body.frame;
  assert.equal(after.frame, 20);
  const restored = (
    await request("/api/simulation/restore", { id: checkpoint.id })
  ).body.frame;
  assert.deepEqual(restored, before);
  assert.equal(
    (await request("/api/export", { experimental: false })).status,
    400,
  );
  const exported = await fetch(url + "/api/export.zip?experimental=true");
  assert.equal(exported.status, 200);
  const entries = unzipSync(new Uint8Array(await exported.arrayBuffer()));
  assert.ok(entries["project.json"]);
  assert.ok(entries["behavior_pack/functions/tick.json"]);
  const report = JSON.parse(strFromU8(entries["report.json"]));
  assert.equal(report.calibration.verifiedInGame, false);
  assert.equal(report.entityCount, edit.body.compilation.entityCount);
  assert.ok(strFromU8(entries["tick.mcfunction"]).includes("tp @e"));
  const raw = await request("/api/experiment/commands", {
    reset: true,
    commands:
      'summon fox 0 0 0\nplayanimation @e animation.warden.move none 0 "v.body_x_rot=math.sin(q.life_time*90)*20;" sample',
  });
  assert.equal(raw.body.frame.entityCount, 1);
  assert.ok(raw.body.results.every((r: any) => r.ok));
  const moved = (
    await request("/api/simulation/step", { frames: 60, dt: 1 / 60 })
  ).body.frame;
  assert.ok(Math.abs(moved.entities[0].bones.body.rotation[0] - 20) < 0.01);
  const unsupported = await request("/api/experiment/commands", {
    commands: "replaceitem entity @e slot.weapon.mainhand 0 minecraft:shield 1",
  });
  assert.ok(
    unsupported.body.frame.diagnostics.some(
      (d: any) => d.code === "UNSUPPORTED_ITEM_MODEL",
    ),
  );
  assert.equal((await request("/api/render/capture", {})).status, 503);
});
test("server rejects cross origin mutations and static traversal", async () => {
  const r = await fetch(url + "/api/design/apply", {
    method: "POST",
    headers: {
      Origin: `${url}.evil.example`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(r.status, 403);
  const r2 = await fetch(url + "/assets/%2e%2e%2fpackage.json");
  assert.equal(r2.status, 403);
});

test("model tools return compact semantic context and explicit unsupported geometry", async () => {
  const tools = await request("/api/tools");
  assert.equal(tools.body.tools.length, 5);
  const context = await request("/api/tools/call", {
    name: "context_read",
    arguments: { include_source: true },
  });
  assert.equal(context.status, 200);
  assert.ok(context.body.source.includes("beamBetween"));
  assert.equal(context.body.project.revision, rev);
  assert.equal(context.body.parts[0].matrix, undefined);
  const g = await request("/api/observe/geometry");
  assert.equal(g.body.unsupportedItems[0].item, "minecraft:shield");
  assert.equal(g.body.entities.length, 0);
  const record = await request("/api/experiment/recording");
  assert.equal(record.body.kind, "fmbe-command-recording");
  assert.ok(record.body.commands.length > 0);
});

test("gun API loads the source model and exports command-block JSON without provider secrets", async () => {
  const current = await request("/api/project");
  const loaded = await request("/api/gun/reference/load", {
    base_revision: current.body.revision,
  });
  assert.equal(loaded.status, 200);
  assert.equal(loaded.body.compilation.entityCount, 75);
  assert.ok(loaded.body.compilation.gun.rootPreserved);
  const action = await request("/api/gun/action", { action: "reload" });
  assert.equal(action.status, 200);
  assert.equal(action.body.frame.entityCount, 75);
  assert.equal(action.body.state.reloadTicks, 0);
  const output = await request("/api/export", { experimental: true });
  assert.equal(output.status, 200);
  const pack = JSON.parse(output.body.files["枪械命令.mccmd.json"]);
  assert.equal(pack.mccmd, 1);
  assert.equal(output.body.files["behavior_pack/manifest.json"], undefined);
  const fake = "sk-" + "offline-test-only-placeholder";
  const configured = await request("/api/model/config", { apiKey: fake });
  assert.ok(configured.body.configured);
  assert.equal(configured.body.baseURL, "https://api.deepseek.com");
  assert.equal(configured.body.model, "deepseek-flash");
  const status = await request("/api/model/status");
  assert.ok(!JSON.stringify(status.body).includes(fake));
  assert.equal((await request("/api/tools")).body.providerConfigured, true);
  await request("/api/model/config", { clear: true });
  assert.equal((await request("/api/model/status")).body.configured, false);
  assert.equal((await request("/api/tools")).body.providerConfigured, false);
});
