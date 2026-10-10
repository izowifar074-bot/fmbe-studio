import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeResources, commandTokens } from "../src/core/runtime.js";
import { makeCompilerContext } from "../src/core/compiler.js";
import {
  compileGun,
  GunRuntime,
  referenceGunSource,
  GUN_PROFILE,
  GUN_SOURCE_HASH,
} from "../src/core/gun.js";
import { replayGunConstruction } from "../src/core/gun-installation.js";
import { point, distance, type V3 } from "../src/core/math.js";
import type { Project } from "../src/core/types.js";
import { evaluateMolang } from "../src/core/molang.js";
const root = new URL("../", import.meta.url);
const read = (p: string) =>
  JSON.parse(fs.readFileSync(new URL(p, root), "utf8").replace(/^\uFEFF/, ""));
const ctx = makeCompilerContext(
  normalizeResources(read("assets/bedrock-1.21.120.4.json")),
  read("assets/community-recipes.json"),
);
const base = "assets/gun-mode/reference/";
const gc = {
  world: read(base + "world-commands.json"),
  chains: read(base + "chain-groups.json"),
  model: read(base + "ak47-model.json"),
  calibration: read(base + "provisional-held-transform.json"),
  sourceHash: GUN_SOURCE_HASH,
};
const reference: Project = {
  schemaVersion: 1,
  id: "contract-reference",
  name: "AK47",
  revision: 1,
  source: referenceGunSource(gc),
  params: {},
  overrides: {},
  budget: 75,
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
    reference: "AK47",
    reload: true,
    namespace: "k47",
    baselineHash: GUN_SOURCE_HASH,
  },
};

test("source sampler keeps three-wrap warmup and L1 jump threshold; constant alpha is explicitly not a tick clock", () => {
  const cmd = gc.world.find(
    (x: any) => x.position[0] === -4 && x.position[1] === -48,
  ).command;
  const expression = commandTokens(cmd)[5];
  const v: Record<string, any> = { k0: 0, k1: 0, k2: 0, k64: 1 };
  let position: V3 = [0, 0, 0],
    alpha = 0.8;
  const queries = {
    frame_alpha: 0,
    position: (i: number) => position[i],
    camera_rotation: () => 0,
    rotation_to_camera: () => 0,
    distance_from_camera: 0,
    body_y_rotation: 0,
    model_scale: 1,
  };
  const sample = () => {
    queries.frame_alpha = alpha;
    evaluateMolang(expression, { variables: v, queries });
  };
  sample();
  for (let wrap = 1; wrap <= 3; wrap++) {
    alpha = 0.8;
    sample();
    position = [wrap * 0.1, 0, 0];
    alpha = 0.1;
    sample();
    assert.equal(v.k74, wrap);
    assert.ok(Math.abs(v.k70 - (wrap < 3 ? 0 : 0.1)) < 1e-9);
  }
  alpha = 0.8;
  sample();
  position = [1.4, 1.1, 1.1];
  alpha = 0.1;
  sample();
  assert.deepEqual(
    [v.k70, v.k71, v.k72],
    [0, 0, 0],
    "L1 3.3 must reset although Euclidean distance is below 3",
  );
  alpha = 0.8;
  sample();
  position = [2.4, 2.1, 2.1];
  alpha = 0.1;
  sample();
  assert.deepEqual(
    [v.k70, v.k71, v.k72],
    [1, 1, 1],
    "L1 exactly 3 is retained",
  );
  const cold: Record<string, any> = { k0: 0, k1: 0, k2: 0, k64: 1 };
  for (let tick = 0; tick < 12; tick++) {
    queries.frame_alpha = 0;
    position = [tick * 0.2, 0, 0];
    evaluateMolang(expression, { variables: cold, queries });
  }
  assert.equal(
    cold.k74,
    0,
    "20fps alpha aliasing is an unresolved source limitation, not a successful compensation test",
  );
  assert.equal(cold.k70, 0);
});

test("actual construction replay detects missing spawn, missing identity and wrong material", () => {
  const source = compileGun(reference, ctx, gc);
  assert.equal(source.gun.installationValidation.passed, true);
  for (const kind of ["spawn", "identity", "material"]) {
    const c = structuredClone(source),
      setup = c.gun.sections.find((s: any) => s.purpose === "G10");
    if (kind === "spawn")
      setup.items = setup.items.filter(
        (i: any) => !i.cmd.startsWith("summon fox 8.5"),
      );
    if (kind === "identity")
      setup.items = setup.items.filter(
        (i: any) => !i.cmd.endsWith("add k47y2"),
      );
    if (kind === "material")
      setup.items.find((i: any) => i.cmd.includes("acacia_planks")).cmd =
        setup.items
          .find((i: any) => i.cmd.includes("acacia_planks"))
          .cmd.replace("acacia_planks", "stone");
    const result = replayGunConstruction(c, ctx.resources);
    assert.equal(result.report.passed, false, kind);
    assert.ok(result.diagnostics.length > 0, kind);
  }
});

test("reinstalling animation after carriers overlap preserves identity and one persistent writer", () => {
  const c = compileGun(reference, ctx, gc),
    r = new GunRuntime(c, ctx);
  r.action("run");
  r.step(0.05, 5);
  for (const e of r.entities) e.position = [123, 45, -67];
  const installed = r.runCommands(c.gun.renderCommands);
  assert.ok(installed.every((i) => i.ok && i.affected > 0));
  r.evaluate(0);
  r.evaluate(0);
  r.evaluate(0);
  assert.deepEqual(
    r.entities.map((e) => e.variables.k44),
    Array.from({ length: 75 }, (_, i) => i),
  );
  for (const e of r.entities) {
    assert.equal(
      e.controllers.filter(
        (a) => a.controller === "controller.animation.fox.move",
      ).length,
      1,
    );
    assert.equal(
      new Set(e.controllers.map((a) => a.controller)).size,
      e.controllers.length,
    );
    assert.equal(e.variables.k64, 1);
  }
});

const cases = [
  "gun-m4a1-deepseek",
  "gun-mp5-deepseek",
  "gun-g17-deepseek",
  "gun-awp-deepseek",
  "gun-aug-deepseek",
];
for (const name of cases) {
  const file = `examples/${name}/project.json`;
  test(`${name}: interruptible poses, rigid motion groups, reload return and actual installation`, () => {
    assert.ok(
      fs.existsSync(new URL(file, root)),
      `missing real-model fixture: ${file}`,
    );
    const c = compileGun(read(file), ctx, gc);
    assert.ok(c.exportable, JSON.stringify(c.diagnostics));
    assert.equal(c.gun.installationValidation.passed, true);
    assert.ok(c.gun.magazineIds.length > 0 && c.gun.boltIds.length > 0);
    for (const id of ["G01", "G02", "G03", "G04", "G05", "G06", "G09", "G11"]) {
      const actual = c.gun.sections.find((s: any) => s.purpose === id);
      const original = gc.chains.groups.find((s: any) => s.id === id);
      assert.equal(
        actual.items.length,
        original.items.length,
        `${id} chain length`,
      );
      for (let n = 0; n < original.items.length; n++) {
        const command = actual.items[n].cmd.split(c.gun.namespace).join("k47");
        const expected = original.items[n].command.replace(
          "tp @e[type=fox] ~~50~",
          "tp @e[type=fox,tag=k47f] ~~50~",
        );
        assert.equal(command, expected, `${id}/${n} source command changed`);
        assert.deepEqual(
          actual.items[n].block,
          original.items[n].block,
          `${id}/${n} scheduling changed`,
        );
      }
    }
    const r = new GunRuntime(c, ctx),
      first = r.observe();
    const centers = (frame: any) =>
      frame.entities.map((e: any) => point(e.itemMatrix, [0, 0, 0]));
    const baseline = centers(first);
    const groups = [
      c.gun.primitives
        .filter((p: any) => p.motionGroup === "static")
        .map((p: any) => p.id),
      c.gun.magazineIds,
      c.gun.boltIds,
    ];
    const check = () => {
      const f = r.observe(),
        now = centers(f);
      assert.equal(f.entityCount, c.entityCount);
      for (const e of f.entities)
        assert.ok(e.itemMatrix.every(Number.isFinite));
      for (const ids of groups)
        for (const id of ids) {
          assert.ok(
            Math.abs(
              distance(now[ids[0]], now[id]) -
                distance(baseline[ids[0]], baseline[id]),
            ) < 1e-6,
            `rigid group ${id}`,
          );
          for (const axis of [
            [0.5, 0, 0],
            [0, 0.5, 0],
            [0, 0, 0.5],
          ] as V3[]) {
            const a = distance(point(f.entities[id].itemMatrix, axis), now[id]);
            const b = distance(
              point(first.entities[id].itemMatrix, axis),
              baseline[id],
            );
            assert.ok(Math.abs(a - b) < 1e-6, `scale changed ${id}`);
          }
        }
      assert.ok(!r.diagnostics.some((d) => d.severity === "error"));
    };
    for (const action of ["run", "aim", "run", "normal", "aim", "normal"]) {
      r.action(action);
      r.step(0.04, 2);
      check();
    }
    r.step(0.05, 6);
    check();
    for (const e of r.entities) {
      assert.ok(e.variables.k91 < 1e-8 && e.variables.k92 < 1e-8);
    }
    for (let cycle = 0; cycle < 2; cycle++) {
      r.action("reload");
      for (let j = 0; j < 7; j++) {
        r.step(0.1, 4);
        check();
      }
      for (const e of r.entities) assert.equal(e.variables.k111, 0);
      const after = r.observe();
      for (let i = 0; i < c.entityCount; i++)
        for (let j = 0; j < 16; j++)
          assert.ok(
            Math.abs(
              after.entities[i].itemMatrix[j] - first.entities[i].itemMatrix[j],
            ) < 1e-6,
            `reload accumulated transform ${i}/${j}`,
          );
    }
    const signals = c.gun.sections
      .filter((s: any) => ["G01", "G02", "G03", "G04"].includes(s.purpose))
      .flatMap((s: any) => s.items)
      .filter((i: any) => i.cmd.includes("playanimation"));
    assert.equal(signals.length, 4);
    for (const signal of signals) {
      const tokens = commandTokens(
        signal.cmd.slice(signal.cmd.indexOf("playanimation ")),
      );
      assert.ok(tokens[5].endsWith("return 1;"));
    }
    const rootCommand = c.gun.renderCommands.find((s: string) =>
      s.includes("animation.minecart.move.v1.0"),
    );
    const sourceRoot = gc.world.find(
      (x: any) => x.position[0] === -4 && x.position[1] === -48,
    ).command;
    assert.equal(commandTokens(rootCommand)[5], commandTokens(sourceRoot)[5]);
  });
}
