import { author } from "./authoring.js";
import { Runtime } from "./runtime.js";
import {
  ident,
  inverse,
  mm,
  rot,
  euler,
  point,
  sub,
  direction,
  scale,
  translation,
  type V3,
  type Mat,
} from "./math.js";
import type {
  Project,
  Part,
  Compilation,
  ResourcePack,
  RecipeResult,
} from "./types.js";
export const PROFILE = "bedrock-1.21.120.4-community-inferred";
export type CompilerContext = {
  resources: ResourcePack;
  heldTransform: Mat;
  calibration: { method: string; verifiedInGame: false; reference: string };
};
export function makeCompilerContext(
  resources: ResourcePack,
  recipes: any[],
): CompilerContext {
  const rt = new Runtime(resources),
    entity = rt.spawn();
  entity.tags = ["wiki:fmbe"];
  entity.item = "minecraft:stone";
  rt.heldTransform = ident();
  const baseline = recipes.find((x) => x.id === "advanced_3d_blocks");
  if (!baseline) throw new Error("缺少参考配方");
  const results = rt.runCommands(baseline.commands);
  if (results.some((r) => !r.ok)) throw new Error("参考配方不能解析");
  const frame = rt.evaluate(0);
  if (frame.diagnostics.some((d) => d.severity === "error"))
    throw new Error("参考配方求值失败");
  // One global, explicit provisional calibration, never a per-part correction.
  // Reference assumption: the community recipe at all defaults produces a centred unit cube.
  const heldTransform = inverse(frame.entities[0].itemMatrix);
  return {
    resources,
    heldTransform,
    calibration: {
      method:
        "community-default-unit-cube-inference; centre assumption; NOT measured in Minecraft",
      verifiedInGame: false,
      reference: "https://github.com/szea-ll14/mcbe-cmd-memo/discussions/5",
    },
  };
}
export function hashText(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
const number = (n: number) => {
  if (!Number.isFinite(n)) throw new Error("编译产生非有限数字");
  return Math.abs(n) < 1e-10 ? "0" : Number(n.toFixed(9)).toString();
};
type Rod = { key: string; matrix: Mat; side: number; length: number; size: V3 };
export function splitBox(part: Part, limit = 96): Rod[] {
  // Exact Euclidean square tiling of a rectangular section, with a bounded count.
  // Every emitted rod has equal X/Z dimensions and arbitrary Y length.
  let best: Rod[] | null = null;
  for (let axis = 0; axis < 3; axis++) {
    const axes = axis === 0 ? [1, 0, 2] : axis === 1 ? [2, 1, 0] : [0, 2, 1];
    let u = part.size[axes[0]],
      v = part.size[axes[2]],
      ox = -u / 2,
      oz = -v / 2;
    const rods: Rod[] = [];
    let guard = 0;
    while (u > 1e-7 && v > 1e-7 && guard++ < limit) {
      const side = Math.min(u, v);
      const local: V3 = [0, 0, 0];
      local[axes[0]] = ox + side / 2;
      local[axes[2]] = oz + side / 2;
      const basis = ident();
      for (let k = 0; k < 3; k++) {
        basis[k] = axes[0] === k ? 1 : 0;
        basis[4 + k] = axes[1] === k ? 1 : 0;
        basis[8 + k] = axes[2] === k ? 1 : 0;
      }
      // Preserve a positive orientation; a cube's geometry allows the flipped transverse axis.
      const a = [basis[0], basis[1], basis[2]],
        b = [basis[4], basis[5], basis[6]],
        c = [basis[8], basis[9], basis[10]];
      const det =
        a[0] * (b[1] * c[2] - b[2] * c[1]) -
        b[0] * (a[1] * c[2] - a[2] * c[1]) +
        c[0] * (a[1] * b[2] - a[2] * b[1]);
      if (det < 0) for (let k = 0; k < 3; k++) basis[8 + k] *= -1;
      const matrix = mm(part.matrix, mm(translation(local), basis));
      rods.push({
        key: String(rods.length),
        matrix,
        side,
        length: part.size[axis],
        size: [side, part.size[axis], side],
      });
      if (u > v) {
        ox += side;
        u -= side;
      } else {
        oz += side;
        v -= side;
      }
    }
    if (u > 1e-7 && v > 1e-7) continue;
    if (!best || rods.length < best.length) best = rods;
  }
  if (!best)
    throw new Error(
      `${part.id} 的矩形截面需要超过 ${limit} 个方截面杆；请调整尺寸或预算`,
    );
  return best;
}
function rawPose(
  selector: string,
  s1: number,
  s2: number,
  body: V3,
  head: V3,
): string[] {
  return [
    `playanimation ${selector} animation.player.sleeping none 0 "" controller.animation.fox.move`,
    `playanimation ${selector} animation.creeper.swelling none 0 "v.swelling_scale1=${number(s1)};v.swelling_scale2=${number(s2)};" fmbe.scale`,
    `playanimation ${selector} animation.ender_dragon.neck_head_movement none 0 "v.head_position_x=${number(head[0])};v.head_position_y=${number(head[1])};v.head_position_z=${number(head[2])};v.head_rotation_x=0;v.head_rotation_y=0;v.head_rotation_z=0;" fmbe.head`,
    `playanimation ${selector} animation.warden.move none 0 "v.body_x_rot=${number(body[0])};v.body_z_rot=${number(body[2])};v.head_x_rot=0;v.head_z_rot=0;" fmbe.body`,
    `playanimation ${selector} animation.player.attack.rotations none 0 "v.attack_body_rot_y=${number(body[1])};" fmbe.yaw`,
  ];
}
function lowerRod(
  ctx: CompilerContext,
  part: Part,
  rod: Rod,
  prefix: string,
  index: number,
): RecipeResult {
  const tag = `${prefix}_${hashText(part.id)}_${index}`,
    selector = `@e[tag=${tag}]`;
  const rootRotation = rot([-90, 270, 0]);
  const desiredR = [...rod.matrix];
  desiredR[12] = desiredR[13] = desiredR[14] = 0;
  const body = euler(mm(inverse(rootRotation), desiredR));
  const s1 = Math.sqrt((rod.side * 32) / 7),
    s2 = Math.sqrt((rod.length * 32) / 7);
  const anchor: V3 = [rod.matrix[12], rod.matrix[13], rod.matrix[14]];
  const rt = new Runtime(ctx.resources);
  rt.heldTransform = ctx.heldTransform;
  const ent = rt.spawn("minecraft:fox", anchor);
  ent.tags = [tag];
  ent.item = part.item;
  rt.runCommands(rawPose(selector, s1, s2, body, [0, 0, 0]));
  const f = rt.evaluate(0).entities[0];
  const target: V3 = [rod.matrix[12], rod.matrix[13], rod.matrix[14]],
    actual: V3 = [f.itemMatrix[12], f.itemMatrix[13], f.itemMatrix[14]];
  const headDelta = direction(
    inverse(f.bones.body.matrix),
    sub(target, actual),
  );
  const cmds = rawPose(selector, s1, s2, body, headDelta);
  rt.runCommands(cmds);
  const out = rt.evaluate(0).entities[0].itemMatrix,
    want = mm(rod.matrix, scale(rod.size));
  let residual = 0;
  for (let i = 0; i < 16; i++)
    residual = Math.max(residual, Math.abs(out[i] - want[i]));
  return {
    partId: part.id,
    entityId: tag,
    commands: cmds,
    targetMatrix: rod.matrix,
    targetSize: rod.size,
    anchor,
    residual,
    status: residual < 2e-6 ? "simulated" : "unsupported",
    message: residual < 2e-6 ? undefined : `变换翻译残差 ${residual}`,
  };
}
export function compile(project: Project, ctx: CompilerContext): Compilation {
  const design = author(project),
    diagnostics = [...design.diagnostics],
    recipes: RecipeResult[] = [];
  const prefix = `fmbe_${hashText(project.id)}`;
  const init: string[] = [
      `# ${project.name} — FMBE Studio experimental export`,
      `# UNVERIFIED in NetEase. Resource baseline v1.21.120.4.`,
      `# Position origin is absolute world origin.`,
      `kill @e[tag=${prefix}]`,
    ],
    tick: string[] = [],
    cleanup = [`kill @e[tag=${prefix}]`];
  if (!diagnostics.some((d) => d.severity === "error"))
    for (const part of design.parts) {
      try {
        const rods = splitBox(part);
        if (rods.length > 1)
          diagnostics.push({
            severity: "info",
            code: "RECTANGULAR_SPLIT",
            partId: part.id,
            message: `${part.id} 精确分解为 ${rods.length} 根方截面杆；纹理分块方向可能与单块拉伸不同`,
          });
        for (let i = 0; i < rods.length; i++) {
          if (recipes.length >= 1024) throw new Error("编译后实体超过 1024");
          const r = lowerRod(ctx, part, rods[i], prefix, i);
          recipes.push(r);
          if (r.status === "unsupported")
            diagnostics.push({
              severity: "error",
              code: "LOWERING_RESIDUAL",
              message: r.message!,
              partId: part.id,
            });
          const name = r.entityId,
            pos = r.anchor.map(number).join(" ");
          init.push(
            `summon minecraft:fox ${pos} 0 0 minecraft:as_adult "${name}"`,
            `tag @e[name=${name}] add ${prefix}`,
            `tag @e[name=${name}] add ${name}`,
            `replaceitem entity @e[tag=${name}] slot.weapon.mainhand 0 ${part.item} 1`,
            `effect @e[tag=${name}] invisibility 999999 0 true`,
            ...r.commands,
          );
          tick.push(`tp @e[tag=${name}] ${pos} 0 0`, ...r.commands);
        }
      } catch (e: any) {
        diagnostics.push({
          severity: "error",
          code: "LOWERING_ERROR",
          partId: part.id,
          message: e.message,
        });
      }
    }
  const count = recipes.length,
    within = count <= project.budget;
  if (!within)
    diagnostics.push({
      severity: "error",
      code: "ENTITY_BUDGET",
      message: `需要 ${count} 只狐狸，超过预算 ${project.budget}；不会静默删去部件`,
    });
  diagnostics.push({
    severity: "warning",
    code: "NETEASE_UNCALIBRATED",
    message:
      "持物适配由社区单位立方体配方推定，未完成网易客户端校准；当前仅可实验导出",
  });
  return {
    design,
    recipes,
    init,
    tick,
    cleanup,
    diagnostics,
    entityCount: count,
    budget: project.budget,
    withinBudget: within,
    exportable: within && !diagnostics.some((d) => d.severity === "error"),
    verifiedInGame: false,
    profile: PROFILE,
    hash: hashText(init.join("\n")),
  };
}
export function replay(
  compilation: Compilation,
  ctx: CompilerContext,
): Runtime {
  const rt = new Runtime(ctx.resources);
  rt.heldTransform = ctx.heldTransform;
  rt.runCommands(compilation.init);
  rt.evaluate(0);
  return rt;
}
export function paretoCandidates(
  project: Project,
  ctx: CompilerContext,
  tolerance = 0.05,
) {
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 0.25)
    throw new Error("容差范围为 0～0.25 格");
  const original = compile(project, ctx);
  const candidates: {
    id: string;
    label: string;
    count: number;
    maxDimensionChange: number;
    project: Project;
    compilation: Compilation;
  }[] = [
    {
      id: "original",
      label: "原始设计",
      count: original.entityCount,
      maxDimensionChange: 0,
      project: structuredClone(project),
      compilation: original,
    },
  ];
  for (const grid of [0.025, 0.05, 0.1, 0.2]) {
    const p = structuredClone(project);
    let change = 0;
    for (const part of original.design.parts) {
      const size = part.size.map((x) => {
        const rounded = Math.max(grid, Math.round(x / grid) * grid);
        return Math.abs(x - rounded) <= tolerance ? rounded : x;
      }) as V3;
      change = Math.max(
        change,
        ...size.map((v, i) => Math.abs(v - part.size[i])),
      );
      p.overrides[part.id] = { ...p.overrides[part.id], size };
    }
    if (change < 1e-8) continue;
    const c = compile(p, ctx);
    if (
      c.entityCount < original.entityCount &&
      !c.diagnostics.some(
        (d) => d.severity === "error" && d.code !== "ENTITY_BUDGET",
      )
    )
      candidates.push({
        id: `grid-${grid}`,
        label: `尺寸网格 ${grid} 格`,
        count: c.entityCount,
        maxDimensionChange: change,
        project: p,
        compilation: c,
      });
  }
  return candidates.filter(
    (c, i, a) =>
      !a.some(
        (b, j) =>
          i !== j &&
          b.count <= c.count &&
          b.maxDimensionChange <= c.maxDimensionChange &&
          (b.count < c.count || b.maxDimensionChange < c.maxDimensionChange),
      ) || c.id === "original",
  );
}
