import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  beam,
  point,
  distance,
  mm,
  rot,
  inverse,
  ident,
  type V3,
} from "../src/core/math.js";
import { evaluateMolang, parseMolang } from "../src/core/molang.js";
import { author } from "../src/core/authoring.js";
import {
  Runtime,
  normalizeResources,
  commandTokens,
} from "../src/core/runtime.js";
import {
  compile,
  makeCompilerContext,
  replay,
  splitBox,
  paretoCandidates,
} from "../src/core/compiler.js";
import { EXAMPLES } from "../src/core/examples.js";
import type { Project } from "../src/core/types.js";
const raw = JSON.parse(
  fs.readFileSync(
    new URL("../assets/bedrock-1.21.120.4.json", import.meta.url),
    "utf8",
  ),
);
const resources = normalizeResources(raw),
  ctx = makeCompilerContext(
    resources,
    JSON.parse(
      fs.readFileSync(
        new URL("../assets/community-recipes.json", import.meta.url),
        "utf8",
      ),
    ),
  );
function project(source: string, budget = 100): Project {
  return {
    schemaVersion: 1,
    id: "test",
    name: "test",
    revision: 1,
    profile: "test",
    source,
    params: {},
    overrides: {},
    budget,
    camera: {
      mode: "first_person",
      position: [0, 2, -7],
      rotation: [0, 0],
      fov: 70,
    },
    createdAt: "",
    updatedAt: "",
  };
}
test("beam construction maps local endpoints to specified points for 250 directions", () => {
  let seed = 1939;
  const rand = () =>
    ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) * 10 -
    5;
  for (let i = 0; i < 250; i++) {
    const a: V3 = [rand(), rand(), rand()],
      b: V3 = [rand(), rand(), rand()],
      r = beam(a, b, [0.2, 0.4]);
    assert.ok(distance(point(r.matrix, [0, 0, -r.size[2] / 2]), a) < 1e-10);
    assert.ok(distance(point(r.matrix, [0, 0, r.size[2] / 2]), b) < 1e-10);
  }
});
test("beam degeneracy and collinear up are explicit", () => {
  assert.throws(() => beam([0, 0, 0], [0, 0, 0], [1, 1]));
  assert.equal(beam([0, 0, 0], [0, 2, 0], [1, 1]).fallback, true);
});
test("matrix inverse and known degree rotations", () => {
  const r = rot([0, 0, 90]);
  assert.ok(distance(point(r, [1, 0, 0]), [0, 1, 0]) < 1e-12);
  const p = mm(inverse(rot([22, 37, 81])), rot([22, 37, 81]));
  assert.ok(p.every((v, i) => Math.abs(v - ident()[i]) < 1e-12));
});
test("Molang assignment side effects, aliases, degree trig and complex return", () => {
  const c = { variables: {} as any, queries: {} };
  assert.equal(evaluateMolang("v.x=math.sin(90);v.y=variable.x*4;", c), 0);
  assert.equal(c.variables.y, 4);
  assert.equal(evaluateMolang("return v.y+3;", c), 7);
  assert.equal(evaluateMolang("v.missing??6", c), 6);
  assert.equal(evaluateMolang("v.x??9", c), 1);
});
test("Molang short circuit does not execute assignment branches", () => {
  const c = { variables: {} as any, queries: {} };
  evaluateMolang("0 && (v.bad=3);1 || (v.bad=4);", c);
  assert.equal(c.variables.bad, undefined);
  assert.equal(evaluateMolang("0 ? 10 : 3+4*2", c), 11);
});
test("Molang this cancellation, looping and bounded execution", () => {
  const c = { variables: {} as any, queries: {}, thisValue: 30 };
  assert.equal(evaluateMolang("45-this", c), 15);
  assert.equal(evaluateMolang("v.n=0;loop(8,{v.n=v.n+1;});return v.n;", c), 8);
  assert.throws(() => evaluateMolang("loop(5000,{v.x=1;});", c));
  assert.throws(() => parseMolang("process.exit() #"));
});
test("missing queries are reported rather than silently certified", () => {
  const missing: string[] = [];
  evaluateMolang("q.some_unknown_query", {
    variables: {},
    queries: {},
    onMissing: (n) => missing.push(n),
  });
  assert.deepEqual(missing, ["q.some_unknown_query"]);
});
test("command tokenizer preserves empty and quoted expression arguments", () => {
  assert.deepEqual(
    commandTokens(
      'playanimation @e[tag=x] animation.player.sleeping none 0 "" c',
    ),
    [
      "playanimation",
      "@e[tag=x]",
      "animation.player.sleeping",
      "none",
      "0",
      "",
      "c",
    ],
  );
  assert.equal(
    commandTokens('playanimation @e[tag=x] a _ 0 "v.x = 3;" c')[5],
    "v.x = 3;",
  );
  assert.throws(() => commandTokens('playanimation @e[tag=x] a "unclosed'));
});
test("source interpreter supports parameters, repeat IDs and isolated overrides", () => {
  const p = project(
    'const n=param("n",3,{min:1,max:5});for(let i=0;i<n;i++){box("b"+i,{size:[1,1,1],position:[i,0,0]});}',
  );
  p.overrides.b1 = { size: [2, 2, 2] };
  const d = author(p);
  assert.equal(d.parts.length, 3);
  assert.deepEqual(d.parts[1].size, [2, 2, 2]);
  assert.deepEqual(d.parts[2].size, [1, 1, 1]);
  assert.ok(!d.diagnostics.some((d) => d.severity === "error"));
});
test("source interpreter rejects ambient access, prototype escape and infinite loops", () => {
  for (const source of [
    "process.exit()",
    'const x = box.constructor("return process")();',
    'for(let i=0;i>=0;i++){box("x"+i,{size:[1,1,1]});}',
  ])
    assert.ok(
      author(project(source)).diagnostics.some((d) => d.severity === "error"),
    );
});
test("point attachment applies actual local anchor coordinates", () => {
  const d = author(
    project(
      'const a=box("a",{size:[2,2,2]});const b=box("b",{size:[1,1,1],position:[5,0,0]});attach(b.anchor("bottom.center"),a.anchor("top.center"));',
    ),
  );
  assert.equal(d.parts[1].matrix[13], 1.5);
  assert.equal(d.constraints[0].residual, 0);
});
test("rectangular decomposition preserves volume and fits original bounds", () => {
  for (const size of [
    [0.3, 0.7, 1.1],
    [2, 0.25, 3],
    [0.23, 0.41, 0.58],
    [1, 1, 1],
  ] as V3[]) {
    const p = author(project(`box("a",{size:${JSON.stringify(size)}});`))
        .parts[0],
      rods = splitBox(p);
    const vol = rods.reduce((s, r) => s + r.side * r.side * r.length, 0);
    assert.ok(Math.abs(vol - size[0] * size[1] * size[2]) < 1e-7);
    for (const r of rods)
      for (let i = 0; i < 8; i++) {
        const q = point(
          r.matrix,
          r.size.map((s, j) => s * ((i >> j) & 1 ? 0.5 : -0.5)) as V3,
        );
        assert.ok(q.every((v, j) => Math.abs(v) <= size[j] / 2 + 1e-7));
      }
  }
});
test("noncommuting rotated rods compile and clean command replay matches target", () => {
  for (let i = 0; i < 20; i++) {
    const p = project(
      `box("part",{size:[0.25,${0.3 + i * 0.11},0.25],position:[${i * 0.3},2,-3],rotation:[${i * 19},${i * 29 - 80},${i * 7}]});`,
    );
    const c = compile(p, ctx);
    assert.equal(c.recipes.length, 1);
    assert.ok(c.exportable);
    assert.ok(c.recipes[0].residual < 2e-6);
    const r = replay(c, ctx);
    assert.equal(r.entities.length, 1);
    assert.ok(!r.diagnostics.some((d) => d.severity === "error"));
    const a = r.observe().entities[0].itemMatrix;
    const target = mm(c.recipes[0].targetMatrix, [
      0.25,
      0,
      0,
      0,
      0,
      0.3 + i * 0.11,
      0,
      0,
      0,
      0,
      0.25,
      0,
      0,
      0,
      0,
      1,
    ]);
    assert.ok(a.every((v, j) => Math.abs(v - target[j]) < 2e-6));
  }
});
test("all included projects compile and respect truthful entity accounting", () => {
  for (const ex of EXAMPLES) {
    const c = compile(project(ex.source, ex.budget), ctx);
    assert.ok(
      !c.diagnostics.some((d) => d.severity === "error"),
      JSON.stringify({ name: ex.name, diagnostics: c.diagnostics }),
    );
    const r = replay(c, ctx);
    assert.equal(r.entities.length, c.entityCount);
    assert.ok(c.entityCount >= c.design.parts.length);
  }
});
test("budget violation is explicit and does not silently delete geometry", () => {
  const c = compile(
    project('for(let i=0;i<3;i++){box("p"+i,{size:[1,1,1]});}', 1),
    ctx,
  );
  assert.equal(c.entityCount, 3);
  assert.equal(c.exportable, false);
  assert.ok(c.diagnostics.some((d) => d.code === "ENTITY_BUDGET"));
});
test("animation side effects run once per evaluation and observation is pure", () => {
  const r = new Runtime(resources);
  r.runCommands([
    "summon fox 0 0 0",
    'playanimation @e animation.player.attack.positions none 0 "v.n=(v.n??0)+1;" test',
  ]);
  r.evaluate(0);
  const n = r.entities[0].variables.n,
    s = r.snapshot();
  r.observe();
  r.observe();
  assert.equal(r.entities[0].variables.n, n);
  assert.deepEqual(r.snapshot(), s);
  r.step(1 / 60, 1);
  assert.equal(r.entities[0].variables.n, n + 1);
});
test("checkpoint replay retains variables, controller clocks and exact frame", () => {
  const r = new Runtime(resources);
  r.runCommands([
    "summon fox 0 0 0",
    'playanimation @e animation.warden.move none 0 "v.body_x_rot=math.sin(q.life_time*90)*20;v.n=(v.n??0)+1;" test',
  ]);
  r.evaluate(0);
  r.step(1 / 60, 9);
  const checkpoint = r.snapshot();
  const first = r.step(1 / 60, 15);
  r.restore(checkpoint);
  const second = r.step(1 / 60, 15);
  assert.deepEqual(second, first);
});
test("controller names stack independently and named stop expressions stop", () => {
  const r = new Runtime(resources);
  r.spawn();
  r.execute(
    'playanimation @e animation.warden.move none 0 "return q.anim_time>=0.1;" a',
  );
  r.execute('playanimation @e animation.player.attack.rotations none 0 "" b');
  assert.equal(r.entities[0].controllers.length, 2);
  r.step(0.05, 4);
  assert.deepEqual(
    r.entities[0].controllers.map((c) => c.controller),
    ["b"],
  );
});
test("optimizer preserves original candidate and reports dimensional sacrifice", () => {
  const p = project('box("a",{size:[0.23,0.41,1.12]});', 100);
  const a = paretoCandidates(p, ctx, 0.05);
  assert.ok(a.some((c) => c.id === "original"));
  for (const c of a) {
    assert.ok(c.maxDimensionChange <= 0.05 + 1e-9);
    if (c.id !== "original") assert.ok(c.count < a[0].count);
  }
  assert.equal(p.overrides.a, undefined);
});

test("group-local endpoints and world anchors are transformed exactly once", () => {
  const d = author(
    project(
      'group("g",{position:[5,0,0],rotation:[0,0,90]},()=>{const a=box("a",{size:[1,1,1]});beamBetween("b",{from:a.anchor("top.center"),to:a.anchor("top.center").offset([0,2,0]),section:[0.2,0.2]});});',
    ),
  );
  assert.ok(!d.diagnostics.some((x) => x.severity === "error"));
  const p = d.parts[1];
  assert.ok(distance(point(p.matrix, [0, 0, -1]), [4.5, 0, 0]) < 1e-10);
  assert.ok(distance(point(p.matrix, [0, 0, 1]), [2.5, 0, 0]) < 1e-10);
});

test("effective third-person camera is also used by Molang queries", () => {
  const r = new Runtime(resources),
    e = r.spawn();
  r.camera = {
    mode: "third_person",
    position: [0, 0, 0],
    rotation: [0, 0],
    fov: 70,
  };
  const f = r.evaluate(0);
  assert.deepEqual(f.camera.position, [0, 0, -4]);
  assert.equal(r.queries(e, 0, 0).distance_from_camera, 4);
});

test("sub-domain dimensions are rejected instead of disappearing in decomposition", () => {
  assert.ok(
    author(
      project('box("tiny",{size:[0.00000001,0.00000001,1]});'),
    ).diagnostics.some((d) => d.severity === "error"),
  );
});
