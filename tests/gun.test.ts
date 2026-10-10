import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeResources, commandTokens } from "../src/core/runtime.js";
import { makeCompilerContext, hashText } from "../src/core/compiler.js";
import {
  compileGun,
  referenceGunSource,
  GunRuntime,
  gunMccmd,
  isGunPrompt,
  GUN_SOURCE_HASH,
  GUN_PROFILE,
} from "../src/core/gun.js";
import {
  mm,
  trs,
  point,
  distance,
  type Mat,
  type V3,
} from "../src/core/math.js";
import type { Project } from "../src/core/types.js";
const root = new URL("../", import.meta.url),
  read = (p: string) =>
    JSON.parse(
      fs.readFileSync(new URL(p, root), "utf8").replace(/^\uFEFF/, ""),
    );
const ref = "assets/gun-mode/reference/",
  gc = {
    world: read(ref + "world-commands.json"),
    chains: read(ref + "chain-groups.json"),
    model: read(ref + "ak47-model.json"),
    calibration: read(ref + "provisional-held-transform.json"),
    sourceHash: GUN_SOURCE_HASH,
  };
const ctx = makeCompilerContext(
  normalizeResources(read("assets/bedrock-1.21.120.4.json")),
  read("assets/community-recipes.json"),
);
function p(reference = true): Project {
  return {
    schemaVersion: 1,
    id: "gun-test",
    name: "AK47",
    revision: 1,
    source: referenceGunSource(gc),
    params: {},
    overrides: {},
    budget: 85,
    profile: GUN_PROFILE,
    camera: {
      mode: "first_person",
      position: [0, 1.62, 0],
      rotation: [0, 0],
      fov: 70,
    },
    createdAt: "",
    updatedAt: "",
    gun: {
      mode: "firearm",
      reference: reference ? "AK47" : undefined,
      reload: true,
      namespace: reference ? "k47" : "g123abc",
      baselineHash: GUN_SOURCE_HASH,
    },
  };
}
const corners = (m: Mat) =>
  Array.from({ length: 8 }, (_, i) =>
    point(m, [i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, i & 4 ? 0.5 : -0.5]),
  );
function worldBasis(pitch: number, yaw: number, eye: V3): Mat {
  const a = (pitch * Math.PI) / 180,
    b = (yaw * Math.PI) / 180;
  return [
    -Math.sin(b) * Math.cos(a),
    -Math.sin(a),
    Math.cos(b) * Math.cos(a),
    0,
    -Math.sin(b) * Math.sin(a),
    Math.cos(a),
    Math.cos(b) * Math.sin(a),
    0,
    -Math.cos(b),
    0,
    -Math.sin(b),
    0,
    ...eye,
    1,
  ];
}
test("gun mode triggers creation prompts but not unrelated architecture text", () => {
  assert.ok(isGunPrompt("制作一把M4A1枪械"));
  assert.ok(isGunPrompt("制作一把MP5冲锋枪"));
  assert.equal(isGunPrompt("制作一个拱桥"), false);
});
test("actual archive contains current reload and differs from old report", () => {
  assert.equal(gc.world.length, 124);
  assert.equal(gc.chains.groups.length, 12);
  assert.equal(
    gc.chains.groups.reduce((n: number, g: any) => n + g.items.length, 0),
    124,
  );
  const delta = read(ref + "source-delta.json");
  assert.deepEqual(
    [delta.summary.unchanged, delta.summary.changed, delta.summary.added],
    [94, 15, 15],
  );
  assert.ok(delta.summary.worldR001MatchesC23);
  assert.ok(delta.summary.rootUnchanged);
});
test("reference retains 75 parts and correct magazine/bolt binding", () => {
  const c = compileGun(p(), ctx, gc);
  assert.equal(c.entityCount, 75);
  assert.equal(c.gun.magazineIds.length, 24);
  assert.deepEqual(c.gun.boltIds, [3, 24]);
  assert.ok(c.exportable);
  assert.ok(c.gun.rootPreserved);
  const original = gc.world.find(
    (x: any) => x.position[0] === -4 && x.position[1] === -59,
  ).command;
  assert.equal(
    c.gun.sections.find((s: any) => s.purpose === "G07").items[1].cmd,
    original,
  );
});
test("75 reference primitives match independent author geometry at multiple camera angles", () => {
  const c = compileGun(p(), ctx, gc),
    r = new GunRuntime(c, ctx);
  for (const [pitch, yaw] of [
    [0, 0],
    [0, 90],
    [0, 180],
    [0, 270],
    [35, 42],
    [-75, -120],
    [89.9, 15],
  ]) {
    r.camera.rotation = [pitch, yaw];
    r.lastFollowTick = -1;
    r.evaluate(0);
    const frame = r.observe(),
      w = worldBasis(pitch, yaw, r.camera.position);
    for (let i = 0; i < 75; i++) {
      const part = gc.model.parts[i],
        want = mm(
          w,
          trs(
            part.center.map(
              (v: number, j: number) =>
                v + gc.model.model_center_to_baseline_offset[j],
            ) as V3,
            part.rotation_deg,
            part.size,
          ),
        ),
        actual = frame.entities[i].itemMatrix;
      assert.ok(
        distance(point(actual, [0, 0, 0]), point(want, [0, 0, 0])) < 1e-7,
        `centre ${i} ${pitch}/${yaw}`,
      );
      const a = corners(actual),
        b = corners(want),
        error = Math.max(
          ...a.map((p) => Math.min(...b.map((q) => distance(p, q)))),
        );
      assert.ok(error < 1e-7, `corners ${i} ${pitch}/${yaw}: ${error}`);
    }
  }
});
test("new model compilation rebinds IDs without changing the root expression", () => {
  const c = compileGun(p(false), ctx, gc),
    r = new GunRuntime(c, ctx);
  assert.equal(c.entityCount, 75);
  assert.ok(c.gun.rootPreserved);
  assert.ok(
    c.gun.renderCommands.every((s: string) => !s.includes("name=k47f")),
  );
  assert.equal(r.entities.length, 75);
  assert.ok(!r.diagnostics.some((d) => d.severity === "error"));
  const frame = r.observe(),
    w = worldBasis(0, 0, r.camera.position);
  for (let i = 0; i < 75; i++) {
    const part = gc.model.parts[i],
      want = mm(
        w,
        trs(
          part.center.map(
            (v: number, j: number) =>
              v + gc.model.model_center_to_baseline_offset[j],
          ) as V3,
          part.rotation_deg,
          part.size,
        ),
      ),
      a = corners(frame.entities[i].itemMatrix),
      b = corners(want);
    assert.ok(
      Math.max(...a.map((p) => Math.min(...b.map((q) => distance(p, q))))) <
        1e-7,
      `new primitive ${i}`,
    );
  }
});
test("pose signals use one persistent driver and preserve rigid group distances", () => {
  const r = new GunRuntime(compileGun(p(), ctx, gc), ctx);
  const before = r.observe();
  r.action("run");
  r.step(1 / 30, 10);
  const after = r.observe();
  for (const [a, b] of [
    [0, 20],
    [13, 69],
    [3, 24],
  ])
    assert.ok(
      Math.abs(
        distance(
          before.entities[a].itemMatrix.slice(12, 15) as V3,
          before.entities[b].itemMatrix.slice(12, 15) as V3,
        ) -
          distance(
            after.entities[a].itemMatrix.slice(12, 15) as V3,
            after.entities[b].itemMatrix.slice(12, 15) as V3,
          ),
      ) < 1e-7,
    );
  assert.equal(
    r.entities[0].controllers.filter(
      (c) => c.controller === "controller.animation.fox.move",
    ).length,
    1,
  );
  assert.ok(r.entities[0].variables.k91 > 0.99);
  r.action("aim");
  r.step(1 / 30, 10);
  assert.ok(r.entities[0].variables.k92 > 0.99);
  assert.ok(r.entities[0].variables.k91 < 0.01);
});
test("reload moves the magazine as a rigid group and uses zero extra entities", () => {
  const c = compileGun(p(), ctx, gc),
    r = new GunRuntime(c, ctx);
  const before = r.observe();
  r.action("reload");
  r.step(1 / 20, 15);
  const after = r.observe();
  assert.equal(after.entityCount, 75);
  const ids = c.gun.magazineIds;
  for (let j = 1; j < ids.length; j++) {
    const a = ids[0],
      b = ids[j],
      d0 = distance(
        before.entities[a].itemMatrix.slice(12, 15) as V3,
        before.entities[b].itemMatrix.slice(12, 15) as V3,
      ),
      d1 = distance(
        after.entities[a].itemMatrix.slice(12, 15) as V3,
        after.entities[b].itemMatrix.slice(12, 15) as V3,
      );
    assert.ok(Math.abs(d0 - d1) < 1e-7);
  }
  assert.ok(r.entities[13].variables.k111 === 1);
  assert.equal(
    r.gunState.reloadTicks,
    0,
    "manual reload tag is visual-only in the supplied world",
  );
  const snapshot = r.snapshot();
  r.step(1 / 20, 55);
  assert.equal(r.gunState.reloadTicks, 0);
  assert.equal(r.gunState.ammo, 30);
  r.restore(snapshot);
  assert.equal(r.gunState.reloadTicks, snapshot.gunState.reloadTicks);
});

test("empty magazine starts the source 65-tick refill lock independently of visual reload", () => {
  const r = new GunRuntime(compileGun(p(), ctx, gc), ctx);
  r.gunState.ammo = 1;
  r.action("fire");
  assert.equal(r.gunState.ammo, 0);
  assert.equal(r.gunState.reloadTicks, 1);
  assert.throws(() => r.action("fire"));
  r.step(0.05, 64);
  assert.equal(r.gunState.ammo, 30);
  assert.equal(r.gunState.reloadTicks, 0);
});
test("pure-command export contains prerequisites, source scheduling and no global wipe", () => {
  const c = compileGun(p(), ctx, gc),
    m = gunMccmd(c);
  assert.equal(m.mccmd, 1);
  const all = m.sections.flatMap((s: any) => s.items);
  for (const n of ["fire", "ammo", "reload"])
    assert.ok(
      all.some((x: any) => x.cmd === `scoreboard objectives add ${n} dummy`),
    );
  assert.ok(all.every((x: any) => x.cmd !== "kill @e"));
  assert.ok(all.every((x: any) => !/^function\s/.test(x.cmd)));
  const g = c.gun.sections.find((s: any) => s.purpose === "G07");
  assert.ok(g.items[1].block.conditional);
  const sounds = c.gun.sections.find((s: any) => s.purpose === "sounds");
  assert.equal(sounds.items[0].block.type, "repeating");
  assert.equal(sounds.items[0].block.conditional, false);
  assert.equal(sounds.items[0].block.redstone, false);
  assert.ok(
    c.tick.some((s) => s.includes("anchored eyes positioned ^ ^ ^2 run tp")),
    "continuous follow must be listed as tick work",
  );
  assert.ok(
    !c.tick.includes("tag @p add 初始化"),
    "initialization button must not run every tick",
  );
  assert.ok(
    !c.tick.some((s) => s.includes("animation.player.sleeping")),
    "render driver is installed once",
  );
  assert.ok(
    c.gun.gameplay.rayStep === 0.5 && c.gun.gameplay.nominalRayDistance === 256,
  );
  for (const item of all) {
    assert.equal(typeof item.block.conditional, "boolean");
    assert.equal(typeof item.block.redstone, "boolean");
    assert.ok(Number.isInteger(item.block.delay));
  }
});

test("small models omit empty conditional animation selectors", () => {
  for (const count of [2, 16, 20, 21]) {
    const project = p(false);
    project.source = `for(let i=0;i<${count};i++)box("p"+i,{size:[0.05,0.05,0.05],position:[i*0.05,0,0],material:"black",motionGroup:i===0?"magazine":"static"});`;
    const c = compileGun(project, ctx, gc);
    assert.ok(c.exportable);
    const r = new GunRuntime(c, ctx);
    for (const cmd of c.gun.renderCommands) {
      const target = commandTokens(cmd)[1];
      assert.ok(
        r.select(target).length > 0,
        `${count} carriers: empty ${target}`,
      );
    }
  }
  const project = p(false);
  project.source = 'box("single",{size:[0.1,0.1,0.1],motionGroup:"magazine"});';
  const c = compileGun(project, ctx, gc);
  assert.equal(c.exportable, false);
  assert.ok(c.diagnostics.some((d) => d.code === "GUN_RAY_REQUIRES_TWO"));
});

test("M1 compensation cancels the configured query-current/render-interpolated timing model after warmup", () => {
  const r = new GunRuntime(compileGun(p(), ctx, gc), ctx),
    part = gc.model.parts[0];
  for (let i = 0; i < 35; i++) {
    r.camera.position = [i * 0.01, 1.62, 0];
    r.step(1 / 60, 1);
    if (r.entities[0].variables.k74 >= 3) {
      const f = r.observe(),
        want = point(
          worldBasis(0, 0, r.camera.position),
          part.center.map(
            (v: number, j: number) =>
              v + gc.model.model_center_to_baseline_offset[j],
          ) as V3,
        );
      assert.ok(
        distance(f.entities[0].itemMatrix.slice(12, 15) as V3, want) < 1e-7,
      );
    }
  }
  assert.ok(r.entities[0].variables.k74 >= 3);
  assert.ok(
    Math.abs(r.entities[0].variables.k70 - 0.03) < 1e-8,
    "exercise a non-zero sampled carrier delta",
  );
});
