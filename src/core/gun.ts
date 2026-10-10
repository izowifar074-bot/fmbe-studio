import { author } from "./authoring.js";
import { splitBox, hashText, type CompilerContext } from "./compiler.js";
import {
  Runtime,
  commandTokens,
  effectiveCamera,
  type Frame,
} from "./runtime.js";
import { evaluateMolang } from "./molang.js";
import { replayGunConstruction } from "./gun-installation.js";
import { mm, trs, scale, rot, point, add, type V3, type Mat } from "./math.js";
import {
  MATERIALS,
  type Project,
  type Compilation,
  type Diagnostic,
} from "./types.js";
export type GunContext = {
  world: any[];
  chains: any;
  model: any;
  calibration: any;
  sourceHash: string;
};
export const GUN_SOURCE_HASH =
  "ecb78e859e2d5de27b606fc813b6e3de646a580033ada77b59ab111759681df0";
export const GUN_PROFILE = "netease-ak47-current-124-source-fit";
export type GunBlock = {
  label: string;
  cmd: string;
  where: "block" | "chat";
  block?: {
    type: "impulse" | "repeating" | "chain";
    conditional: boolean;
    redstone: boolean;
    delay: number;
  };
  note?: string;
  sourcePosition?: number[];
};
export type GunSection = {
  title: string;
  purpose: string;
  items: GunBlock[];
  optional?: boolean;
};
export function isGunPrompt(s: string) {
  return /(?:制作|做|生成|设计|建模|创建).{0,100}(?:枪械|步枪|手枪|冲锋枪|狙击枪|霰弹枪|机枪|AK[- ]?47|M4A?1|枪)|(?:gun|rifle|pistol|firearm)/i.test(
    s,
  );
}
export function referenceGunSource(gc: GunContext) {
  const lines = [
    "// AK47: exact 75-part geometry from the supplied report, command order preserved.",
  ];
  for (const p of gc.model.parts) {
    const material = p.material === "wood" ? "acacia" : p.material;
    const motion = gc.model.parts
      .filter((x: any) => x.group === "弹匣")
      .some((x: any) => x.id === p.id)
      ? "magazine"
      : p.id === 3 || p.id === 24
        ? "bolt"
        : "static";
    lines.push(
      `box(${JSON.stringify(p.html_id)},{name:${JSON.stringify(p.name)},size:${JSON.stringify(p.size)},position:${JSON.stringify(p.center)},rotation:${JSON.stringify(p.rotation_deg)},material:${JSON.stringify(material)},motionGroup:${JSON.stringify(motion)}});`,
    );
  }
  return lines.join("\n");
}
function worldAt(gc: GunContext, x: number, y: number, z = 5) {
  const c = gc.world.find(
    (c) => c.position[0] === x && c.position[1] === y && c.position[2] === z,
  );
  if (!c) throw new Error(`缺少基线命令 (${x},${y},${z})`);
  return c.command as string;
}
const innerPlay = (c: string) => c.slice(c.indexOf("playanimation "));
export function playExpression(cmd: string) {
  return commandTokens(innerPlay(cmd))[5] ?? "";
}
const number = (v: number) => {
  if (!Number.isFinite(v)) throw new Error("非有限几何值");
  return Math.abs(v) < 1e-11 ? "0" : Number(v.toFixed(12)).toString();
};
function leaf(values: number[]) {
  return values.map((v, k) => `v.k${k}=${number(v)};`).join("");
}
function table(values: number[][], start = 0): string {
  if (values.length === 1) return leaf(values[0]);
  const mid = Math.floor(values.length / 2);
  return `(v.k44<${start + mid})?{${table(values.slice(0, mid), start)}}:{${table(values.slice(mid), start + mid)}};`;
}
function condition(ids: number[]) {
  if (!ids.length) return "0";
  const ranges: number[][] = [];
  for (const id of ids) {
    const last = ranges.at(-1);
    if (last && id === last[1] + 1) last[1] = id;
    else ranges.push([id, id]);
  }
  return ranges
    .map(([a, b]) => (a === b ? `v.k44==${a}` : `(v.k44>=${a}&&v.k44<=${b})`))
    .join("||");
}
function fieldsFromRod(rod: ReturnType<typeof splitBox>[number]) {
  const by = [0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1];
  const b = mm(rod.matrix, by);
  return [
    rod.matrix[12] + 0.66,
    rod.matrix[13] - 0.174,
    rod.matrix[14] + 0.245,
    b[0],
    b[4],
    b[8],
    b[1],
    b[5],
    b[9],
    b[2],
    b[6],
    b[10],
    rod.side,
    Math.sqrt(rod.length / rod.side),
  ];
}
const block = (
  label: string,
  cmd: string,
  type: "impulse" | "repeating" | "chain" = "chain",
  conditional = false,
  note = "",
): GunBlock => ({
  label,
  cmd,
  where: "block",
  block: { type, conditional, redstone: type === "impulse", delay: 0 },
  note,
});
function rawSections(gc: GunContext): GunSection[] {
  return gc.chains.groups.map((g: any) => ({
    title: g.title,
    purpose: g.id,
    optional: Boolean(g.optional),
    items: g.items.map((i: any) => ({
      label: i.label,
      cmd: i.command,
      where: "block",
      block: i.block,
      sourcePosition: i.position,
      note: `原存档 ${i.position.join?.(",") ?? i.position}；箭头 ${i.facingName}`,
    })),
  }));
}
export function compileGun(
  project: Project,
  ctx: CompilerContext,
  gc: GunContext,
): Compilation {
  const design = author(project),
    diagnostics: Diagnostic[] = [...design.diagnostics];
  const primitives: any[] = [],
    values: number[][] = [];
  const exactReference =
    project.gun?.reference === "AK47" &&
    project.source === referenceGunSource(gc) &&
    Object.keys(project.overrides).length === 0;
  const mag: number[] = [],
    bolt: number[] = [];
  if (!diagnostics.some((d) => d.severity === "error"))
    for (const p of design.parts) {
      try {
        const rods = splitBox(p);
        for (const rod of rods) {
          const id = primitives.length;
          primitives.push({
            id,
            partId: p.id,
            modelId: p.id,
            material: p.material,
            item: p.item,
            size: rod.size,
            matrix: rod.matrix,
            motionGroup: p.motionGroup,
          });
          values.push(
            exactReference ? gc.model.parts[id].k0_k13 : fieldsFromRod(rod),
          );
          if (p.motionGroup === "magazine" || /弹匣|magazine/i.test(p.group))
            mag.push(id);
          if (p.motionGroup === "bolt") bolt.push(id);
        }
      } catch (e: any) {
        diagnostics.push({
          severity: "error",
          code: "GUN_PRIMITIVE",
          message: e.message,
          partId: p.id,
        });
      }
    }
  const count = primitives.length;
  if (!count)
    diagnostics.push({
      severity: "error",
      code: "EMPTY_GUN",
      message: "枪械没有几何部件",
    });
  if (count === 1)
    diagnostics.push({
      severity: "error",
      code: "GUN_RAY_REQUIRES_TWO",
      message: "当前开火的 c=2 分支依赖至少两只狐狸；只有一只不能按512末端导出",
    });
  if (count > 125)
    diagnostics.push({
      severity: "error",
      code: "GUN_ID_CAPACITY",
      message: "当前 5×5×5 身份编码最多支持 125 只狐狸",
    });
  if (count > project.budget)
    diagnostics.push({
      severity: "error",
      code: "ENTITY_BUDGET",
      message: `实际需要 ${count} 只狐狸，预算 ${project.budget}`,
    });
  if (project.gun?.reload && mag.length === 0)
    diagnostics.push({
      severity: "error",
      code: "MISSING_MAGAZINE_GROUP",
      message: '换弹需要至少一个 motionGroup:"magazine" 部件',
    });
  const all = rawSections(gc),
    render = all.find((s) => s.purpose === "G07")!;
  let sections: GunSection[] = all.filter(
    (s) => !["G08", "G12"].includes(s.purpose),
  );
  const prerequisites: GunSection = {
    title: "00 新世界前置：只执行一次",
    purpose: "prerequisites",
    items: [
      block(
        "P001",
        "scoreboard objectives add fire dummy",
        "impulse",
        false,
        "已有目标提示已存在是正常情况；不要将此块接成有条件链",
      ),
      block("P002", "scoreboard objectives add ammo dummy", "impulse"),
      block("P003", "scoreboard objectives add reload dummy", "impulse"),
      block("P004", "scoreboard players set test fire 0", "impulse"),
      block("P005", "scoreboard players set @p ammo 30", "impulse"),
      block("P006", "scoreboard players set @p reload 0", "impulse"),
    ],
  };
  if (!exactReference && count) {
    const original = worldAt(gc, -4, -59),
      expr = playExpression(original),
      motionAt = expr.indexOf("v.k110=");
    if (motionAt < 0) throw new Error("基线缺少 C23 时间驱动");
    let suffix = expr.slice(motionAt);
    const oldMag =
      "((v.k44>=13&&v.k44<=19)||(v.k44>=25&&v.k44<=28)||(v.k44>=57&&v.k44<=69))";
    if (!suffix.includes(oldMag) || !suffix.includes("(v.k44==3||v.k44==24)"))
      throw new Error("换弹绑定条件与基线不符");
    suffix = suffix
      .replace(oldMag, `(${condition(mag)})`)
      .replace("(v.k44==3||v.k44==24)", `(${condition(bolt)})`);
    const pivot = mag.length
      ? mag
          .reduce(
            (s: V3, i) => add(s, [values[i][0], values[i][1], values[i][2]]),
            [0, 0, 0] as V3,
          )
          .map((x) => x / mag.length)
      : [0.728, -0.242, 0.245];
    // Replace only the magazine-local pivot, never the root transport or pose equations.
    suffix = suffix
      .replace("v.k0-0.728", `v.k0-(${number(pivot[0])})`)
      .replace("v.k1+0.242", `v.k1-(${number(pivot[1])})`)
      .replace("+0.728-0.07*t.k84", `+(${number(pivot[0])})-0.07*t.k84`)
      .replace("-0.242-0.52*t.k84", `+(${number(pivot[1])})-0.52*t.k84`);
    const expression = `v.k44=v.k41+5*v.k42+25*v.k43;${table(values)}${suffix}`;
    if (expression.length > 32000)
      diagnostics.push({
        severity: "error",
        code: "GUN_COMMAND_LENGTH",
        message: `R001 表达式 ${expression.length} 字符，超过当前导出上限 32000`,
      });
    render.items[1].cmd = original.replace(
      playExpression(original),
      expression,
    );
    const yEntries = render.items.filter((i) =>
      i.cmd.includes("animation.ender_dragon.neck_head_movement"),
    );
    const yFirst = render.items.indexOf(yEntries[0]);
    render.items.splice(
      yFirst,
      yEntries.length,
      ...Array.from({ length: Math.ceil(count / 25) }, (_, y) => ({
        ...yEntries[0],
        label: `RY${y}`,
        cmd: yEntries[0].cmd
          .replace("tag=k47y0", `tag=k47y${y}`)
          .replace("v.k43=0", `v.k43=${y}`),
      })),
    );
    render.items = render.items.filter((i) => {
      const m = /tag=k47([xz])(\d+)/.exec(i.cmd);
      if (!m) return true;
      return (
        Number(m[2]) <
        (m[1] === "x" ? Math.min(5, count) : Math.min(5, Math.ceil(count / 5)))
      );
    });
    const setup: GunBlock[] = [
      block("S000", "kill @e[type=fox,name=k47f]", "impulse"),
    ];
    for (let i = 0; i < count; i++) {
      const a = i % 5,
        b = Math.floor(i / 5) % 5,
        c = Math.floor(i / 25);
      setup.push(
        block(
          `S${i + 1}`,
          `summon fox ${0.5 + 2 * a} ${100 + 2 * c} ${0.5 + 2 * b} 0 0 minecraft:ageable_grow_up k47f`,
        ),
      );
    }
    for (const effect of [
      "resistance infinite 4 true",
      "instant_health infinite 4 true",
      "invisibility infinite 0 true",
      "slowness infinite 255 true",
    ])
      setup.push(
        block(`E${setup.length}`, `effect @e[type=fox,name=k47f] ${effect}`),
      );
    for (let i = 0; i < count; i++) {
      const a = i % 5,
        b = Math.floor(i / 5) % 5,
        c = Math.floor(i / 25);
      setup.push(
        block(
          `M${i}`,
          `replaceitem entity @e[type=fox,name=k47f,x=${2 * a},y=${100 + 2 * c},z=${2 * b},dx=0,dy=0,dz=0] slot.weapon.mainhand 0 ${primitives[i].item.replace("minecraft:", "")} 1`,
        ),
      );
    }
    for (const axis of ["x", "z", "y"])
      for (let i = 0; i < (axis === "y" ? Math.ceil(count / 25) : 5); i++) {
        const xyz =
          axis === "x"
            ? `${2 * i},y=100,z=0,dx=0,dy=${2 * Math.ceil(count / 25)},dz=8`
            : axis === "z"
              ? `0,y=100,z=${2 * i},dx=8,dy=${2 * Math.ceil(count / 25)},dz=0`
              : `0,y=${100 + 2 * i},z=0,dx=8,dy=0,dz=8`;
        setup.push(
          block(
            `T${axis}${i}`,
            `tag @e[type=fox,name=k47f,x=${xyz}] add k47${axis}${i}`,
          ),
        );
      }
    setup.push(
      block("TAG", "tag @e[type=fox,name=k47f] add k47f"),
      block("FOLLOW", worldAt(gc, 0, -28)),
    );
    sections = sections.map((s) =>
      s.purpose === "G10"
        ? { ...s, items: setup }
        : s.purpose === "G07"
          ? render
          : s,
    );
  }
  const sound = all.find((s) => s.purpose === "G12")!;
  sections.push({
    title: "静音（原存档声音命令）",
    purpose: "sounds",
    items: sound.items
      .filter((i) => i.cmd.startsWith("stopsound "))
      .map((i, n) =>
        n === 0
          ? {
              ...i,
              block: {
                ...i.block!,
                type: "repeating",
                conditional: false,
                redstone: false,
              },
              note: "原静音链移除全局清理后，此条升为独立循环链头；命令内容不变",
            }
          : i,
      ),
  });
  sections.unshift(prerequisites);
  // Copy the exact base frame sampler and motion code. Scope broad fox handling only for generated projects.
  const namespace = exactReference
    ? "k47"
    : (project.gun?.namespace ?? `g${hashText(project.id).slice(0, 6)}`);
  const names = [
    "k47f",
    "k47p",
    "k47r",
    "k47s",
    "k47u",
    "k47h",
    "k47b",
    "k47e",
    "k47q",
    "k47t22",
    "k47t23",
    ...Array.from({ length: 5 }, (_, i) => `k47x${i}`),
    ...Array.from({ length: 5 }, (_, i) => `k47z${i}`),
    ...Array.from({ length: 5 }, (_, i) => `k47y${i}`),
  ];
  const rename = (cmd: string) => {
    let c = cmd;
    if (namespace !== "k47")
      for (const name of [...names].sort((a, b) => b.length - a.length))
        c = c.replace(
          new RegExp(`\\b${name}\\b`, "g"),
          name.replace("k47", namespace),
        );
    return c;
  };
  if (namespace !== "k47")
    sections = sections.map((s) => ({
      ...s,
      items: s.items.map((i) => ({
        ...i,
        cmd: rename(
          i.cmd.replace(
            "tp @e[type=fox] ~~50~",
            "tp @e[type=fox,tag=k47f] ~~50~",
          ),
        ),
      })),
    }));
  const renderCommands = sections
    .find((s) => s.purpose === "G07")!
    .items.filter((i) => i.cmd.includes("playanimation "))
    .map((i) => innerPlay(i.cmd));
  const rootSource = playExpression(worldAt(gc, -4, -48)),
    rootCompiled = playExpression(
      renderCommands.find((c) => c.includes("animation.minecart.move.v1.0"))!,
    );
  if (rootSource !== rootCompiled)
    diagnostics.push({
      severity: "error",
      code: "ROOT_CHANGED",
      message: "根运输/帧补偿表达式偏离基线，拒绝导出",
    });
  if (count < 32)
    diagnostics.push({
      severity: "warning",
      code: "DETAIL_BELOW_REFERENCE",
      message: `当前 ${count} 实体，明显少于 75 实体参考；需要检查造型细节是否满足请求`,
    });
  diagnostics.push({
    severity: "warning",
    code: "GUN_EVIDENCE",
    message:
      "采用当前网易存档的命令与换弹基线；当前预览为源码几何对照，未重新进行网易客户端安装验证",
  });
  const setup = sections.find((s) => s.purpose === "G10")!;
  const init = setup.items.map((i) => i.cmd),
    tick = sections
      .filter(
        (s) => s.purpose !== "G07" && s.items[0]?.block?.type === "repeating",
      )
      .flatMap((s) => s.items.map((i) => i.cmd));
  const gun: any = {
    version: 1,
    sourceHash: gc.sourceHash,
    sourceBlockCount: 124,
    exactReference,
    namespace,
    sections,
    renderCommands,
    primitives,
    values,
    magazineIds: mag,
    boltIds: bolt,
    rootSourceHash: hashText(rootSource),
    rootPreserved: rootSource === rootCompiled,
    renderOrigin: gc.calibration.renderOrigin,
    modelBasis: gc.calibration.modelBasis,
    rotationSigns: gc.calibration.rotationSigns,
    rotationOrder: gc.calibration.rotationOrder ?? "ZYX",
    heldTransform: gc.calibration.matrix,
    referenceExcluded: [
      "G08 global kill button",
      "G12 item/xp cleanup; sounds retained",
    ],
    scoreboards: ["fire", "ammo", "reload"],
    gameplay: {
      magazineCapacity: 30,
      reloadVisualSeconds: 2.6,
      reloadUnlockTicks: 65,
      rayBranchCount: 512,
      rayStep: 0.5,
      nominalRayDistance: 256,
      damage: 11,
    },
  };
  const withinBudget = count <= project.budget,
    exportable = !diagnostics.some((d) => d.severity === "error");
  const result: Compilation = {
    design,
    recipes: primitives.map((p, i) => ({
      partId: p.partId,
      entityId: `${namespace}_${i}`,
      commands: [],
      targetMatrix: p.matrix,
      targetSize: p.size,
      anchor: [0, 1.62, 2],
      residual: 0,
      status: "simulated",
    })),
    init,
    tick,
    cleanup: [`kill @e[type=fox,name=${namespace}f,tag=${namespace}f]`],
    diagnostics,
    entityCount: count,
    budget: project.budget,
    withinBudget,
    exportable,
    verifiedInGame: false,
    profile: GUN_PROFILE,
    hash: hashText(JSON.stringify(sections)),
    gun,
  };
  if (!diagnostics.some((d) => d.severity === "error")) {
    const construction = replayGunConstruction(result, ctx.resources);
    gun.installationValidation = construction.report;
    diagnostics.push(...construction.diagnostics);
    if (construction.diagnostics.length) result.exportable = false;
  }
  if (
    !diagnostics.some(
      (d) => d.severity === "error" && d.code !== "ENTITY_BUDGET",
    )
  ) {
    const simulation = new GunRuntime(result, ctx),
      frame = simulation.observe(),
      W = [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 1.62, 0, 1];
    const vertices = (m: Mat) =>
      Array.from({ length: 8 }, (_, i) =>
        point(m, [i & 1 ? 0.5 : -0.5, i & 2 ? 0.5 : -0.5, i & 4 ? 0.5 : -0.5]),
      );
    for (let i = 0; i < count; i++) {
      const p = primitives[i],
        want = mm(
          W,
          mm(
            trs([0.66, -0.174, 0.245], [0, 0, 0]),
            mm(p.matrix, scale(p.size)),
          ),
        ),
        actual = frame.entities[i].itemMatrix,
        a = vertices(actual),
        b = vertices(want);
      const error = Math.max(
        ...a.map((p) =>
          Math.min(...b.map((q) => Math.hypot(...p.map((v, k) => v - q[k])))),
        ),
      );
      result.recipes[i].residual = error;
      if (error > 1e-6) {
        result.recipes[i].status = "unsupported";
        diagnostics.push({
          severity: "error",
          code: "GUN_TRANSLATION_MISMATCH",
          partId: p.partId,
          message: `${p.partId} 命令预览角点残差 ${error.toExponential(3)} 格`,
        });
      }
    }
    diagnostics.push(
      ...simulation.diagnostics.filter(
        (d) => d.severity === "error" || d.code === "MISSING_QUERY",
      ),
    );
    gun.translationValidation = {
      maxCornerError: Math.max(...result.recipes.map((r) => r.residual)),
      count,
      scope:
        "normal pose at camera yaw/pitch 0 after 3 initial evaluations; source geometry check, not game evidence",
    };
    result.exportable =
      withinBudget &&
      !diagnostics.some(
        (d) => d.severity === "error" || d.code === "MISSING_QUERY",
      );
  }
  return result;
}
export class GunRuntime extends Runtime {
  gunInfo: any;
  gunState = { ammo: 30, reloadTicks: 0, pose: "normal", shots: 0 };
  lastFollowTick = -1;
  lastGameTick = -1;
  constructor(c: Compilation, ctx: CompilerContext) {
    super(ctx.resources);
    this.gunInfo = c.gun;
    this.heldTransform = c.gun.heldTransform;
    this.modelBasis = c.gun.modelBasis;
    this.renderOrigin = c.gun.renderOrigin;
    this.rotationSigns = c.gun.rotationSigns;
    this.rotationOrder = c.gun.rotationOrder;
    this.camera = {
      mode: "first_person",
      position: [0, 1.62, 0],
      rotation: [0, 0],
      fov: 70,
    };
    const construction = replayGunConstruction(c, ctx.resources);
    this.entities = construction.entities;
    this.sequence = this.entities.length;
    this.peak = this.entities.length;
    this.diagnostics.push(...construction.diagnostics);
    for (const e of this.entities) e.position = [0, 1.62, 2];
    const results = this.runCommands(c.gun.renderCommands);
    if (results.some((r) => !r.ok || r.affected === 0))
      this.diagnostic(
        "GUN_INSTALL_CHAIN",
        "安装动画包含失败或零目标指令，条件连锁可能被截断",
        "error",
      );
    for (let i = 0; i < 3; i++) this.evaluate(0);
  }
  override evaluate(dt = 0): Frame {
    if (this.gunInfo) {
      const tick = Math.floor(this.time * 20 + 1e-8);
      if (tick !== this.lastFollowTick) {
        const c = this.camera,
          p = (c.rotation[0] * Math.PI) / 180,
          y = (c.rotation[1] * Math.PI) / 180,
          f: V3 = [
            -Math.sin(y) * Math.cos(p),
            -Math.sin(p),
            Math.cos(y) * Math.cos(p),
          ];
        for (const e of this.entities) {
          const next = add(c.position, f.map((x) => 2 * x) as V3);
          e.previousPosition = dt > 0 ? [...e.position] : [...next];
          e.position = next;
        }
        this.lastFollowTick = tick;
      }
      // Explicit test timing model: query Pcur, render lerp(Pprev,Pcur,alpha).
      // This exercises the source M1 compensation; it is not an engine timing claim.
      const alpha = Math.max(
        0,
        this.time * 20 - Math.floor(this.time * 20 + 1e-8),
      );
      for (const e of this.entities) {
        const prev = e.previousPosition ?? e.position;
        e.renderPosition = e.position.map(
          (v, i) => prev[i] + (v - prev[i]) * alpha,
        ) as V3;
      }
      if (this.lastGameTick >= 0 && this.gunState.reloadTicks > 0) {
        this.gunState.reloadTicks += Math.max(0, tick - this.lastGameTick);
        if (this.gunState.reloadTicks >= 65) {
          this.gunState.reloadTicks = 0;
          this.gunState.ammo = 30;
        }
      }
      this.lastGameTick = tick;
    }
    return super.evaluate(dt);
  }
  action(action: string) {
    const ns = this.gunInfo.namespace,
      selector = `@e[type=fox,name=${ns}f,tag=${ns}f]`;
    if (["normal", "run", "aim"].includes(action)) {
      if (this.gunState.reloadTicks)
        throw new Error("换弹休止期间不接收姿态切换（与当前存档一致）");
      const modes: any = {
        normal: [0, "animation.player.riding.arms"],
        run: [1, "animation.player.riding.arms.zombie"],
        aim: [2, "animation.player.holding.zombie"],
      };
      const [n, a] = modes[action];
      this.execute(
        `playanimation ${selector} ${a} none 0 "v.k90=${n};return 1;" ${ns}t22`,
      );
      this.gunState.pose = action;
    } else if (action === "reload") {
      this.execute(
        `playanimation ${selector} animation.player.riding.arms none 0 "((v.k111??0)==0)?{v.k110=0;v.k111=1;};return 1;" ${ns}t23`,
      );
    } else if (action === "fire") {
      if (this.gunState.reloadTicks || this.gunState.ammo <= 0)
        throw new Error("当前处于换弹休止或空仓状态");
      this.gunState.ammo--;
      this.gunState.shots++;
      if (this.gunState.ammo === 0) {
        this.action("normal");
        this.gunState.reloadTicks = 1;
        this.action("reload");
      }
    } else throw new Error("动作必须为 normal/run/aim/reload/fire");
    this.evaluate(0);
    return {
      state: this.gunState,
      frame: this.observe(),
      scope: "视觉动画与玩法状态预览；没有模拟世界射线伤害/碰撞",
    };
  }
  override snapshot(): any {
    return {
      ...super.snapshot(),
      gunState: structuredClone(this.gunState),
      lastFollowTick: this.lastFollowTick,
      lastGameTick: this.lastGameTick,
    };
  }
}
export function gunMccmd(c: Compilation) {
  if (!c.gun) throw new Error("不是枪械工程");
  if (!c.exportable) throw new Error("枪械编译未通过");
  return {
    mccmd: 1,
    title: c.design.parts.length
      ? `FMBE 枪械命令包 · ${c.entityCount} 狐狸`
      : "FMBE 枪械",
    subtitle: "基于当前 124 命令方块存档；单人纯命令；含换弹/弹药",
    notes: [
      "召唤、渲染、循环逻辑分别安装；不要把独立按钮串成链。",
      "先完成三个记分板目标创建，手持雪球并执行初始化。",
      "渲染只安装一次，跟随/动作检测/开火链每 tick 运行。",
      "全局清理按钮保存在原文参考包，没有默认加入新工程。",
      "持物预览为源码几何对照，不等同本轮网易实机验证。",
    ],
    sections: c.gun.sections.map((s: GunSection) => ({
      title: s.title,
      items: s.items,
    })),
  };
}
