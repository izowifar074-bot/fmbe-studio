import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { WebSocketServer } from "ws";
import {
  compile,
  replay,
  makeCompilerContext,
  paretoCandidates,
  PROFILE,
  hashText,
} from "../core/compiler.js";
import { Runtime, normalizeResources } from "../core/runtime.js";
import { EXAMPLES, RAW_EXAMPLE } from "../core/examples.js";
import { MATERIALS, type Project, type Compilation } from "../core/types.js";
import { bounds, type V3 } from "../core/math.js";
import { observeGeometry } from "../core/observation.js";
import { TOOL_SCHEMAS } from "./tool-schema.js";
import {
  compileGun,
  GunRuntime,
  gunMccmd,
  referenceGunSource,
  GUN_PROFILE,
  GUN_SOURCE_HASH,
  type GunContext,
} from "../core/gun.js";
import { GunAgent } from "./gun-agent.js";
import { modelStatus, configureModel, testModel, redact } from "./deepseek.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assets = path.join(root, "assets"),
  data = process.env.FMBE_DATA_DIR
    ? path.resolve(process.env.FMBE_DATA_DIR)
    : path.join(root, "data");
await fs.mkdir(data, { recursive: true });
const raw = JSON.parse(
  await fs.readFile(path.join(assets, "bedrock-1.21.120.4.json"), "utf8"),
);
const recipes = JSON.parse(
  await fs.readFile(path.join(assets, "community-recipes.json"), "utf8"),
);
const ctx = makeCompilerContext(normalizeResources(raw), recipes);
const gunRead = async (name: string) =>
  JSON.parse(
    (
      await fs.readFile(path.join(assets, "gun-mode/reference", name), "utf8")
    ).replace(/^\uFEFF/, ""),
  );
const gunContext: GunContext = {
  world: await gunRead("world-commands.json"),
  chains: await gunRead("chain-groups.json"),
  model: await gunRead("ak47-model.json"),
  calibration: await gunRead("provisional-held-transform.json"),
  sourceHash: GUN_SOURCE_HASH,
};
function compileProject(p: Project) {
  return p.gun ? compileGun(p, ctx, gunContext) : compile(p, ctx);
}
function replayProject(c: Compilation) {
  return c.gun ? new GunRuntime(c, ctx) : replay(c, ctx);
}
const now = () => new Date().toISOString();
function fresh(example = EXAMPLES[0]): Project {
  return {
    schemaVersion: 1,
    id: randomUUID(),
    name: example.name,
    revision: 1,
    profile: PROFILE,
    source: example.source,
    params: {},
    overrides: {},
    budget: example.budget,
    camera: {
      mode: "first_person",
      position: [0, 2, -7],
      rotation: [0, 0],
      fov: 70,
    },
    createdAt: now(),
    updatedAt: now(),
  };
}
let project: Project;
try {
  project = JSON.parse(
    await fs.readFile(path.join(data, "current.json"), "utf8"),
  );
} catch {
  project = fresh();
}
function validate(p: any): asserts p is Project {
  if (!p || typeof p.source !== "string" || p.source.length > 131072)
    throw new Error("source 必须是 <=128 KiB 文本");
  if (!Number.isInteger(p.budget) || p.budget < 1 || p.budget > 1024)
    throw new Error("budget 范围 1～1024");
  if (!p.params || Array.isArray(p.params) || typeof p.params !== "object")
    throw new Error("params 必须是对象");
  if (
    !p.overrides ||
    Array.isArray(p.overrides) ||
    typeof p.overrides !== "object"
  )
    throw new Error("overrides 必须是对象");
  if (Object.keys(p.overrides).length > 2048) throw new Error("局部覆盖太多");
  if (
    Object.values(p.params).some(
      (v) => typeof v !== "number" || !Number.isFinite(v),
    )
  )
    throw new Error("参数必须为有限数字");
  if (
    p.gun &&
    (!/^(k47|g[0-9a-f]{6})$/.test(p.gun.namespace) || p.gun.mode !== "firearm")
  )
    throw new Error("无效枪械命名空间或模式");
}
validate(project);
let compilation = compileProject(project),
  runtime = replayProject(compilation);
runtime.camera = structuredClone(project.camera);
runtime.evaluate(0);
let revisionHistory: Project[] = [structuredClone(project)],
  redoHistory: Project[] = [];
const requests = new Map<string, { fingerprint: string; result: any }>(),
  checkpoints = new Map<string, any>(),
  candidateRuns = new Map<string, any>(),
  captures = new Map<string, any>();
try {
  const saved = JSON.parse(
    await fs.readFile(path.join(data, "history.json"), "utf8"),
  );
  if (Array.isArray(saved) && saved.length) {
    saved.forEach(validate);
    revisionHistory = saved.slice(-40);
    revisionHistory[revisionHistory.length - 1] = structuredClone(project);
  }
} catch {}
async function persist() {
  const temp = path.join(data, "current.tmp");
  await fs.writeFile(temp, JSON.stringify(project, null, 2));
  await fs.rename(temp, path.join(data, "current.json"));
  await fs.writeFile(
    path.join(data, "history.json"),
    JSON.stringify(revisionHistory.slice(-40)),
  );
}
await persist();
function summary() {
  return {
    project,
    compilation,
    frame: runtime.observe(),
    mode: rawMode ? "experiment" : "design",
    undoCount: Math.max(0, revisionHistory.length - 1),
    redoCount: redoHistory.length,
    calibration: ctx.calibration,
    gunState: runtime instanceof GunRuntime ? runtime.gunState : undefined,
  };
}
let rawMode = false;
const capabilities = {
  version: "0.2.1",
  gunMode: {
    available: true,
    model: "deepseek-flash",
    baselineCommands: 124,
    sourceHash: GUN_SOURCE_HASH,
    skill: "fmbe-guns",
    reload: true,
  },
  profile: PROFILE,
  resourceCommit: ctx.resources.commit,
  animations: Object.keys(ctx.resources.animations).length,
  controllers: Object.keys(ctx.resources.controllers).length,
  verifiedInGame: false,
  authoring: [
    "box",
    "beamBetween",
    "arc",
    "profilePrism",
    "group",
    "param",
    "repeat",
    "attach(point)",
    "functions",
    "bounded for loops",
    "explicit local overrides",
  ],
  commands: [
    "summon fox/player",
    "tag",
    "replaceitem mainhand",
    "effect invisibility",
    "tp",
    "kill",
    "event adult/baby/day",
    "playanimation(all six fields parsed)",
    "execute as [at @s] run",
    "function",
    "camera set/clear",
  ],
  limitations: [
    "网易未校准；方块持物矩阵由社区默认单位立方体配方推定",
    "实体/摄像机裁剪、网络插值、物理和寻路尚未实现",
    "仅完整立方体物品有持物渲染适配；其他物品不会标记准确",
    "next_state 自定义状态解析、资源控制器过渡混合、动画事件尚未完整实现",
    "玩家模型仅基础姿态；摄像机无碰撞/眼高状态切换",
    "Molang 未支持实体引用箭头和 for_each；未实现 query 会报告",
    "动画精度/累计缩放/求值时机属于待真机校准语义",
    "profilePrism 为扫描条带近似；优化仅尺寸量化候选，不是全局最优",
  ],
  evidence: {
    resourceFiles: "official tag + SHA verification",
    geometry: "independent mathematical tests",
    commandReplay: "implemented; provisional semantics",
    netEase: "not tested",
  },
  tools: [
    "context.read",
    "design.apply",
    "experiment.run",
    "candidate.accept",
    "project.export",
  ],
  materials: MATERIALS,
};
function json(res: http.ServerResponse, status: number, value: any) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(value));
}
async function body(req: http.IncomingMessage) {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 2_000_000) throw new Error("请求超过 2 MB");
  }
  return text ? JSON.parse(text) : {};
}
function requireRevision(b: any) {
  if (b.base_revision !== project.revision) {
    const e: any = new Error(
      `修订冲突：当前 ${project.revision}，请求 ${b.base_revision}`,
    );
    e.status = 409;
    throw e;
  }
}
async function replace(next: Project, push = true) {
  validate(next);
  const c = compileProject(next);
  const errors = c.diagnostics.filter(
    (d) => d.severity === "error" && d.code !== "ENTITY_BUDGET",
  );
  if (errors.length) {
    const e: any = new Error(errors.map((d) => d.message).join("\n"));
    e.status = 422;
    e.details = errors;
    throw e;
  }
  project = next;
  compilation = c;
  runtime = replayProject(c);
  runtime.camera = structuredClone(project.camera);
  runtime.evaluate(0);
  rawMode = false;
  if (push) {
    revisionHistory.push(structuredClone(project));
    redoHistory = [];
  }
  await persist();
  broadcast({ type: "revision", revision: project.revision });
}
async function apply(b: any) {
  if (!b.request_id || typeof b.request_id !== "string")
    throw new Error("design.apply 需要 request_id");
  const fingerprint = hashText(JSON.stringify(b));
  const old = requests.get(b.request_id);
  if (old) {
    if (old.fingerprint !== fingerprint) {
      const e: any = new Error("同一 request_id 的内容不同");
      e.status = 409;
      throw e;
    }
    return old.result;
  }
  requireRevision(b);
  const p = structuredClone(project),
    patch = b.patch ?? {};
  for (const k of Object.keys(patch))
    if (!["source", "params", "overrides", "budget", "name"].includes(k))
      throw new Error(`不可修改字段 ${k}`);
  if (patch.source !== undefined) p.source = patch.source;
  if (patch.params) p.params = { ...p.params, ...patch.params };
  if (patch.overrides)
    for (const [key, value] of Object.entries(patch.overrides)) {
      if (["__proto__", "constructor", "prototype"].includes(key))
        throw new Error("非法部件名");
      if (value === null) delete p.overrides[key];
      else p.overrides[key] = { ...p.overrides[key], ...(value as any) };
    }
  if (patch.budget !== undefined) p.budget = patch.budget;
  if (patch.name !== undefined) p.name = String(patch.name).slice(0, 100);
  p.revision++;
  p.updatedAt = now();
  await replace(p);
  const result = summary();
  requests.set(b.request_id, { fingerprint, result });
  if (requests.size > 100) requests.delete(requests.keys().next().value!);
  return result;
}
function inspection(id: string) {
  const part = compilation.design.parts.find((p) => p.id === id),
    e = runtime.entities.find((e) => e.id === id || e.name === id);
  if (part) {
    return {
      part,
      bounds: bounds(part.matrix, part.size),
      recipes: compilation.recipes
        .filter((r) => r.partId === id)
        .map((r) =>
          compilation.gun
            ? { ...r, commands: compilation.gun.renderCommands }
            : r,
        ),
      diagnostics: compilation.diagnostics.filter((d) => d.partId === id),
    };
  }
  if (e)
    return {
      entity: e,
      frame: runtime.observe().entities.find((x) => x.id === e.id),
      trace: runtime.trace.filter((x) => x.entity === e.id),
    };
  throw new Error("部件或实体不存在");
}
function compactContext(b: any = {}) {
  const parts = compilation.design.parts.filter(
    (p) => !b.part_id || p.id === b.part_id,
  );
  return {
    project: {
      id: project.id,
      name: project.name,
      revision: project.revision,
      profile: project.profile,
    },
    budget: {
      limit: project.budget,
      compiledEntities: compilation.entityCount,
      liveEntities: runtime.entities.length,
      withinBudget: compilation.withinBudget,
    },
    parameters: compilation.design.parameters,
    parts: parts.slice(0, 60).map((p) => ({
      id: p.id,
      kind: p.kind,
      size: p.size,
      position: p.matrix.slice(12, 15),
      material: p.material,
      motionGroup: p.motionGroup,
      sourceLine: p.sourceLine,
      entityCost: compilation.recipes.filter((r) => r.partId === p.id).length,
    })),
    totalParts: parts.length,
    diagnostics: compilation.diagnostics
      .filter((d) => d.severity !== "info")
      .slice(0, 8),
    source: b.include_source ? project.source : undefined,
    frame: {
      time: runtime.time,
      frame: runtime.frameNumber,
      mode: rawMode ? "experiment" : "design",
    },
    verifiedInGame: false,
    authoring: {
      units: "blocks; rotations in degrees",
      sdk: [
        "param(name,default,{min,max,step,label})",
        "box(id,{size,position,rotation,material})",
        "beamBetween(id,{from,to,section,up,material})",
        "group(id,{position,rotation},()=>{})",
        "arc(id,{center,radius,start,end,segments,thickness,depth})",
        "profilePrism(id,{outline,holes,thickness,segments})",
      ],
      materials: Object.keys(MATERIALS),
      rule: "Keep semantic part IDs stable. Raw commands are experimental. Read capabilities for unsupported semantics.",
    },
  };
}
function exportFiles(experimental: boolean) {
  if (!experimental)
    throw new Error("目标网易尚未验证，仅可 experimental=true 导出实验包");
  if (!compilation.exportable)
    throw new Error("编译或实体预算未通过，不能导出此作品");
  if (compilation.gun) return gunFiles(project, compilation);
  const hash = hashText(project.id),
    dir = `fmbe/${hash}`;
  const manifest = {
    format_version: 2,
    header: {
      name: `FMBE Studio — ${project.name}`,
      description:
        "Experimental, NetEase compatibility not verified. Run init manually.",
      uuid: randomUUID(),
      version: [0, 1, 0],
      min_engine_version: [1, 21, 120],
    },
    modules: [{ type: "data", uuid: randomUUID(), version: [0, 1, 0] }],
  };
  return {
    "project.json": JSON.stringify(project, null, 2),
    "report.json": JSON.stringify(
      {
        profile: PROFILE,
        calibration: ctx.calibration,
        entityCount: compilation.entityCount,
        diagnostics: compilation.diagnostics,
        capabilities,
      },
      null,
      2,
    ),
    "README.txt": `FMBE Studio 实验导出\n未完成网易实机校准。\n坐标为工程绝对世界坐标。\n行为包导入目标环境的可用方式尚需验证；也提供纯函数文本。\n初始化：/function ${dir}/init\n自动 tick 函数保持狐狸位置并应用静态动画。\n清理：/function ${dir}/clear\n不要重复叠加两个相同工程包。\n`,
    "init.mcfunction": compilation.init.join("\n"),
    "tick.mcfunction": compilation.tick.join("\n"),
    "clear.mcfunction": compilation.cleanup.join("\n"),
    "behavior_pack/manifest.json": JSON.stringify(manifest, null, 2),
    [`behavior_pack/functions/${dir}/init.mcfunction`]:
      compilation.init.join("\n"),
    [`behavior_pack/functions/${dir}/tick.mcfunction`]:
      compilation.tick.join("\n"),
    [`behavior_pack/functions/${dir}/clear.mcfunction`]:
      compilation.cleanup.join("\n"),
    "behavior_pack/functions/tick.json": JSON.stringify({
      values: [`${dir}/tick`],
    }),
  };
}
function gunFiles(p: Project, c: Compilation): Record<string, string> {
  const pack = gunMccmd(c);
  return {
    "project.json": JSON.stringify(p, null, 2),
    "gun-model.js": p.source,
    "枪械命令.mccmd.json": JSON.stringify(pack, null, 2),
    "完整命令与安装顺序.txt": pack.sections
      .map(
        (s: any) =>
          `【${s.title}】\n` +
          s.items
            .map(
              (i: any) =>
                `${i.label} | ${i.block?.type} | ${i.block?.conditional ? "有条件" : "无条件"} | ${i.block?.redstone ? "需要红石" : "保持开启"} | 延迟${i.block?.delay ?? 0}\n${i.cmd}\n`,
            )
            .join("\n"),
      )
      .join("\n\n"),
    "验证与来源.json": JSON.stringify(
      {
        sourceHash: GUN_SOURCE_HASH,
        referenceWorldBlocks: 124,
        parts: c.design.parts.length,
        entities: c.entityCount,
        rootPreserved: c.gun.rootPreserved,
        rootExpressionHash: c.gun.rootSourceHash,
        magazineIds: c.gun.magazineIds,
        boltIds: c.gun.boltIds,
        scoreboards: c.gun.scoreboards,
        gameplay: c.gun.gameplay,
        diagnostics: c.diagnostics,
        renderProfile: gunContext.calibration.method,
        installationValidation: c.gun.installationValidation,
        translationValidation: c.gun.translationValidation,
        netEaseTestedThisRun: false,
      },
      null,
      2,
    ),
    "README.txt": `FMBE Studio 枪械模式\n${p.name}\n单人纯命令；${c.entityCount}只狐狸。\n先分别执行前置目标创建与分数初始化，再安装循环逻辑、召唤链、渲染链和初始化按钮。\n手持雪球触发持枪标签后，执行：tag @p add 初始化\n各sections是独立命令链或按钮，箭头沿链顺序；不要串接不同区。\n渲染一次安装，跟随/检测/开火每tick；本包不使用行为包或/function。\n换弹视觉2.6秒，当前存档玩法锁定65tick。\n当前基线开火步长0.5，512分支，名义256格；并非完整碰撞/射程实测。\n三个目标fire/ammo/reload创建命令如提示已存在，请勿改为条件链。\n全局清理按钮没有默认纳入新作品。\n预览为源码几何对照，本轮没有重新在网易实机验证。\n`,
  };
}
let mutation = Promise.resolve<any>(undefined);
const serialized = (fn: () => Promise<any>) => {
  const p = mutation.then(fn, fn);
  mutation = p.catch(() => {});
  return p;
};
const gunAgent = new GunAgent(assets, ctx, gunContext, {
  current: () => project,
  accept: (p, revision) =>
    serialized(async () => {
      if (project.revision !== revision) throw new Error("revision changed");
      p.revision = project.revision + 1;
      await replace(p);
    }),
  event: (j) =>
    broadcast({
      type: "gun_job",
      id: j.id,
      status: j.status,
      event: j.events.at(-1),
    }),
  persist: async (j, c) => {
    const dir = path.join(data, "ai-runs", j.id);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, "job.json"),
      redact(JSON.stringify(j, null, 2)),
    );
    if (c && c.compilation.exportable)
      for (const [name, content] of Object.entries(
        gunFiles(c.project, c.compilation),
      ))
        await fs.writeFile(path.join(dir, name), content);
  },
  capture: async (c) => {
    const client = [...wss.clients].find((x) => x.readyState === 1);
    if (!client) return null;
    const r = new GunRuntime(c, ctx),
      frame = r.observe(),
      id = randomUUID();
    captures.set(id, {
      id,
      status: "pending",
      createdAt: Date.now(),
      frame: frame.frame,
      time: frame.time,
      revision: project.revision,
      data: null,
    });
    client.send(
      JSON.stringify({
        type: "capture",
        id,
        view: "side",
        width: 1024,
        height: 768,
        frame,
      }),
    );
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const job = captures.get(id);
      if (job?.data)
        return `data:image/png;base64,${job.data.toString("base64")}`;
      if (job?.status === "failed") break;
    }
    return null;
  },
});
try {
  const dirs = (
    await fs.readdir(path.join(data, "ai-runs"), { withFileTypes: true })
  )
    .filter((d) => d.isDirectory() && /^[0-9a-f-]{36}$/.test(d.name))
    .slice(-10);
  for (const d of dirs) {
    try {
      const folder = path.join(data, "ai-runs", d.name),
        job = JSON.parse(
          await fs.readFile(path.join(folder, "job.json"), "utf8"),
        );
      let candidate: Project | undefined;
      try {
        candidate = JSON.parse(
          await fs.readFile(path.join(folder, "project.json"), "utf8"),
        );
        validate(candidate);
      } catch {}
      gunAgent.restoreRecord(job, candidate);
    } catch {}
  }
} catch {}
const routes: Record<string, (b: any, u: URL) => any> = {
  "GET /api/health": () => ({ ok: true, version: "0.2.1", profile: PROFILE }),
  "GET /api/model/status": () => modelStatus(),
  "POST /api/model/config": (b) => configureModel(b),
  "POST /api/model/test": () => testModel(),
  "GET /api/gun/reference": () => ({
    sourceHash: GUN_SOURCE_HASH,
    worldBlocks: 124,
    parts: 75,
    rootPreserved: true,
    sourceDelta: { unchanged: 94, changed: 15, added: 15 },
    scoreboards: ["fire", "ammo", "reload"],
    currentReload: true,
    profile: GUN_PROFILE,
  }),
  "POST /api/gun/reference/load": async (b) => {
    requireRevision(b);
    const p = fresh();
    p.name = "AK47 · 当前存档 75 狐狸";
    p.source = referenceGunSource(gunContext);
    p.budget = 75;
    p.profile = GUN_PROFILE;
    p.revision = project.revision + 1;
    p.camera = {
      mode: "first_person",
      position: [0, 1.62, 0],
      rotation: [0, 0],
      fov: 70,
    };
    p.gun = {
      mode: "firearm",
      reference: "AK47",
      reload: true,
      namespace: "k47",
      baselineHash: GUN_SOURCE_HASH,
    };
    await replace(p);
    return summary();
  },
  "POST /api/gun/action": (b) => {
    if (!(runtime instanceof GunRuntime)) throw new Error("当前不是枪械工程");
    return runtime.action(b.action);
  },
  "POST /api/agent/run": (b) => {
    requireRevision(b);
    return gunAgent.start(
      String(b.prompt ?? ""),
      Number(b.budget ?? 75),
      b.base_revision,
    );
  },
  "GET /api/agent/job": (_b, u) => gunAgent.get(u.searchParams.get("id") ?? ""),
  "GET /api/agent/history": () => ({
    jobs: [...gunAgent.jobs.values()].sort((a, b) =>
      (b.events.at(-1)?.at ?? "").localeCompare(a.events.at(-1)?.at ?? ""),
    ),
  }),
  "POST /api/agent/cancel": (b) => gunAgent.cancel(b.id),
  "POST /api/agent/apply": async (b) => {
    requireRevision(b);
    const c = gunAgent.getCandidate(b.id);
    c.project.revision = project.revision + 1;
    await replace(c.project);
    return summary();
  },
  "GET /api/capabilities": () => capabilities,
  "GET /api/context": () => summary(),
  "GET /api/context/compact": (_b, u) =>
    compactContext({
      include_source: u.searchParams.get("source") === "true",
      part_id: u.searchParams.get("part") ?? undefined,
    }),
  "GET /api/tools": () => ({
    tools: TOOL_SCHEMAS,
    callEndpoint: "/api/tools/call",
    providerConfigured: modelStatus().configured,
  }),
  "POST /api/tools/call": async (b) => {
    const a = b.arguments ?? {};
    if (!a || typeof a !== "object" || Array.isArray(a))
      throw new Error("arguments 必须为对象");
    const u = new URL("http://localhost");
    switch (b.name) {
      case "context_read":
        return compactContext(a);
      case "design_apply":
        await apply(a);
        return compactContext();
      case "candidate_accept":
        await routes["POST /api/candidate/accept"](a, u);
        return compactContext();
      case "project_export":
        return { files: exportFiles(a.experimental === true) };
      case "experiment_run":
        if (a.mode === "optimize")
          return routes["POST /api/experiment/optimize"](a, u);
        if (a.mode === "commands") {
          const r = await routes["POST /api/experiment/commands"](a, u);
          return {
            results: r.results,
            frame: {
              time: r.frame.time,
              frame: r.frame.frame,
              entityCount: r.frame.entityCount,
              diagnostics: r.frame.diagnostics,
            },
          };
        }
        if (a.mode === "step") {
          const f = runtime.step(a.dt ?? 1 / 60, a.frames ?? 1);
          return {
            time: f.time,
            frame: f.frame,
            entityCount: f.entityCount,
            diagnostics: f.diagnostics,
          };
        }
        if (a.mode === "observe")
          return observeGeometry(
            runtime.observe(),
            a.width ?? 1024,
            a.height ?? 768,
          );
        if (a.mode === "capture")
          return routes["POST /api/render/capture"](a, u);
        throw new Error("未知实验模式");
      default:
        throw new Error("未知工具名称");
    }
  },
  "GET /api/project": () => project,
  "GET /api/examples": () => ({ examples: EXAMPLES, rawExample: RAW_EXAMPLE }),
  "POST /api/design/apply": (b) => apply(b),
  "POST /api/project/new": async (b) => {
    requireRevision(b);
    const ex = EXAMPLES.find((x) => x.id === b.example) ?? EXAMPLES[0];
    const p = fresh(ex);
    p.revision = project.revision + 1;
    await replace(p);
    return summary();
  },
  "POST /api/project/import": async (b) => {
    requireRevision(b);
    validate(b.project);
    const p = {
      ...b.project,
      id: b.project.id ?? randomUUID(),
      revision: project.revision + 1,
      updatedAt: now(),
    };
    await replace(p);
    return summary();
  },
  "POST /api/project/undo": async (b) => {
    requireRevision(b);
    if (revisionHistory.length < 2) throw new Error("没有可撤销修改");
    redoHistory.push(revisionHistory.pop()!);
    const p = structuredClone(revisionHistory.at(-1)!);
    p.revision = project.revision + 1;
    p.updatedAt = now();
    await replace(p, false);
    return summary();
  },
  "POST /api/project/redo": async (b) => {
    requireRevision(b);
    if (!redoHistory.length) throw new Error("没有可重做修改");
    const p = redoHistory.pop()!;
    p.revision = project.revision + 1;
    p.updatedAt = now();
    revisionHistory.push(structuredClone(p));
    await replace(p, false);
    return summary();
  },
  "GET /api/inspect": (_b, u) => inspection(u.searchParams.get("id") ?? ""),
  "POST /api/experiment/commands": (b) => {
    if (b.reset) {
      runtime = new Runtime(ctx.resources);
      runtime.heldTransform = ctx.heldTransform;
      runtime.camera = structuredClone(project.camera);
    }
    rawMode = true;
    const results = runtime.runCommands(b.commands ?? "");
    runtime.evaluate(0);
    broadcast({ type: "frame" });
    return { results, frame: runtime.observe() };
  },
  "POST /api/simulation/reset": () => {
    runtime = replayProject(compilation);
    runtime.camera = structuredClone(project.camera);
    runtime.evaluate(0);
    rawMode = false;
    return summary();
  },
  "POST /api/simulation/step": (b) => ({
    frame: runtime.step(b.dt ?? 1 / 60, b.frames ?? 1),
    gunState: runtime instanceof GunRuntime ? runtime.gunState : undefined,
  }),
  "GET /api/simulation/frame": () => runtime.observe(),
  "GET /api/observe/geometry": (_b, u) =>
    observeGeometry(
      runtime.observe(),
      Number(u.searchParams.get("width") ?? 1024),
      Number(u.searchParams.get("height") ?? 768),
    ),
  "GET /api/experiment/recording": () => ({
    schemaVersion: 1,
    kind: "fmbe-command-recording",
    profile: PROFILE,
    calibration: ctx.calibration,
    commands: runtime.commands,
    snapshot: runtime.snapshot(),
    capabilities,
  }),
  "POST /api/simulation/checkpoint": () => {
    const id = randomUUID();
    checkpoints.set(id, runtime.snapshot());
    if (checkpoints.size > 20)
      checkpoints.delete(checkpoints.keys().next().value!);
    return { id, time: runtime.time };
  },
  "POST /api/simulation/restore": (b) => {
    const s = checkpoints.get(b.id);
    if (!s) throw new Error("检查点不存在");
    runtime.restore(s);
    return { frame: runtime.observe() };
  },
  "POST /api/entity/state": (b) => {
    const e = runtime.entities.find((e) => e.id === b.id);
    if (!e) throw new Error("实体不存在");
    Object.assign(e.state, b.state ?? {});
    runtime.evaluate(0);
    return { frame: runtime.observe() };
  },
  "POST /api/camera": async (b) => {
    const c = { ...runtime.camera, ...b, resolved: false };
    if (
      ![
        "first_person",
        "third_person",
        "third_person_front",
        "free",
        "editor",
      ].includes(c.mode)
    )
      throw new Error("无效摄像机模式");
    if (
      !Array.isArray(c.position) ||
      c.position.length !== 3 ||
      c.position.some((n: any) => !Number.isFinite(n))
    )
      throw new Error("无效摄像机位置");
    if (
      !Array.isArray(c.rotation) ||
      c.rotation.length !== 2 ||
      c.rotation.some((n: any) => !Number.isFinite(n))
    )
      throw new Error("无效摄像机角度");
    if (c.fov < 20 || c.fov > 120) throw new Error("FOV 范围 20～120");
    runtime.camera = c;
    project.camera = c;
    await persist();
    runtime.evaluate(0);
    return { frame: runtime.observe(), camera: c };
  },
  "POST /api/render/capture": (b) => {
    const client = [...wss.clients].find((c) => c.readyState === 1);
    if (!client) {
      const e: any = new Error("截图需要至少一个打开的工作台渲染窗口");
      e.status = 503;
      throw e;
    }
    const view = b.view ?? "player";
    if (!["player", "editor", "front", "side", "top"].includes(view))
      throw new Error("view: player/editor/front/side/top");
    const width = Math.floor(b.width ?? 1024),
      height = Math.floor(b.height ?? 768);
    if (width < 64 || width > 2048 || height < 64 || height > 2048)
      throw new Error("截图尺寸范围 64～2048");
    const id = randomUUID(),
      frame = runtime.observe(),
      job = {
        id,
        status: "pending",
        revision: project.revision,
        frame: frame.frame,
        time: frame.time,
        view,
        width,
        height,
        createdAt: Date.now(),
        data: null,
      };
    captures.set(id, job);
    if (captures.size > 20) captures.delete(captures.keys().next().value!);
    client.send(
      JSON.stringify({ type: "capture", id, view, width, height, frame }),
    );
    return {
      ...job,
      data: undefined,
      status_url: `/api/render/result?id=${id}`,
    };
  },
  "GET /api/render/result": (_b, u) => {
    const job = captures.get(u.searchParams.get("id") ?? "");
    if (!job) throw new Error("截图任务不存在");
    if (job.status === "pending" && Date.now() - job.createdAt > 30000) {
      job.status = "failed";
      job.error = "渲染窗口未在 30 秒内返回截图";
    }
    return {
      ...job,
      data: undefined,
      image_url: job.data ? `/api/render/image?id=${job.id}` : null,
    };
  },
  "POST /api/experiment/optimize": (b) => {
    requireRevision(b);
    if (project.gun)
      throw new Error(
        "枪械动作组不自动做尺寸量化。请通过模型或源码修改细节并查看真实实体成本。",
      );
    const id = randomUUID(),
      candidates = paretoCandidates(project, ctx, b.tolerance ?? 0.05);
    candidateRuns.set(id, { revision: project.revision, candidates });
    if (candidateRuns.size > 10)
      candidateRuns.delete(candidateRuns.keys().next().value!);
    return {
      runId: id,
      base_revision: project.revision,
      candidates: candidates.map((c) => ({
        id: c.id,
        label: c.label,
        entityCount: c.count,
        maxDimensionChange: c.maxDimensionChange,
        withinBudget: c.compilation.withinBudget,
        changes: Object.entries(c.project.overrides).filter(
          ([k, v]) =>
            JSON.stringify(v) !== JSON.stringify(project.overrides[k]),
        ),
      })),
      method:
        "尺寸量化候选 + 全编译计数。仅检查尺寸容差；不宣称受保护孔洞/连接/动作全部不变。",
    };
  },
  "POST /api/candidate/accept": async (b) => {
    requireRevision(b);
    const run = candidateRuns.get(b.runId);
    if (!run || run.revision !== project.revision)
      throw new Error("候选已过期");
    const c = run.candidates.find((c: any) => c.id === b.candidateId);
    if (!c) throw new Error("候选不存在");
    const p = structuredClone(c.project);
    p.revision = project.revision + 1;
    p.updatedAt = now();
    await replace(p);
    return summary();
  },
  "POST /api/export": (b) => ({
    files: exportFiles(b.experimental === true),
    entityCount: compilation.entityCount,
  }),
  "GET /api/resources/animations": (_b, u) => {
    const search = (u.searchParams.get("q") ?? "").toLowerCase();
    return Object.entries<any>(ctx.resources.animations)
      .filter(([id]) => id.includes(search))
      .map(([id, a]) => ({
        id,
        bones: Object.keys(a.bones ?? {}),
        loop: a.loop ?? false,
        length: a.animation_length ?? null,
      }));
  },
  "GET /api/resources/animation": (_b, u) => {
    const id = u.searchParams.get("id") ?? "";
    return {
      id,
      definition: ctx.resources.animations[id],
      source: raw.animationSources[id],
    };
  },
  "GET /api/resources/geometry": () => ({
    fox: ctx.resources.fox,
    player: ctx.resources.player,
  }),
  "GET /api/openapi.json": () => ({
    openapi: "3.1.0",
    info: { title: "FMBE Studio local API", version: "0.2.1" },
    servers: [{ url: `http://127.0.0.1:${port}` }],
    paths: Object.fromEntries(
      Object.keys(routes).map((k) => {
        const [m, p] = k.split(" ");
        return [
          p,
          {
            [m.toLowerCase()]: {
              operationId: p.slice(5).replaceAll("/", "_"),
              summary: k,
              responses: {
                200: { description: "JSON result" },
                409: { description: "Revision conflict" },
                422: { description: "Validation failure" },
              },
              ...(m === "POST"
                ? {
                    requestBody: {
                      required: true,
                      content: {
                        "application/json": {
                          schema: { $ref: "#/components/schemas/Operation" },
                        },
                      },
                    },
                  }
                : {}),
            },
          },
        ];
      }),
    ),
    components: {
      schemas: {
        Operation: {
          type: "object",
          properties: {
            base_revision: { type: "integer" },
            request_id: { type: "string" },
            patch: { type: "object" },
            commands: { type: "string" },
            frames: { type: "integer" },
            dt: { type: "number" },
            experimental: { type: "boolean" },
          },
          additionalProperties: true,
        },
      },
    },
  }),
};
const port = Number(process.env.FMBE_PORT ?? 18120);
const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url ?? "/", `http://127.0.0.1:${port}`);
    const host = (req.headers.host ?? "").split(":")[0];
    if (!["127.0.0.1", "localhost", "[::1]"].includes(host))
      return json(res, 403, { error: "Local host only" });
    const origin = req.headers.origin;
    if (
      origin &&
      origin !== `http://127.0.0.1:${port}` &&
      origin !== `http://localhost:${port}`
    )
      return json(res, 403, { error: "Cross-origin request rejected" });
    const key = `${req.method} ${u.pathname}`;
    if (routes[key]) {
      const b = req.method === "POST" ? await body(req) : {};
      const result =
        req.method === "POST"
          ? await serialized(async () => routes[key](b, u))
          : await routes[key](b, u);
      return json(res, 200, result);
    }
    if (u.pathname === "/api/render/image") {
      const job = captures.get(u.searchParams.get("id") ?? "");
      if (!job?.data) throw new Error("截图尚未完成");
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      });
      return res.end(job.data);
    }
    if (u.pathname === "/api/export.zip") {
      const files = exportFiles(u.searchParams.get("experimental") === "true");
      const zipped = zipSync(
        Object.fromEntries(
          Object.entries(files).map(([k, v]) => [k, strToU8(v)]),
        ),
      );
      res.writeHead(200, {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="fmbe-experimental.zip"',
      });
      return res.end(zipped);
    }
    if (u.pathname === "/api/project/download") {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="fmbe-project.json"',
      });
      return res.end(JSON.stringify(project, null, 2));
    }
    if (u.pathname.startsWith("/api/"))
      return json(res, 404, { error: "API endpoint not found" });
    const prefix = u.pathname.startsWith("/assets/")
      ? assets
      : path.join(root, "dist/public");
    const relative = u.pathname.startsWith("/assets/")
      ? u.pathname.slice(8)
      : u.pathname === "/"
        ? "index.html"
        : u.pathname.slice(1);
    const target = path.resolve(prefix, decodeURIComponent(relative));
    if (!target.startsWith(prefix + path.sep))
      return json(res, 403, { error: "Invalid path" });
    const bytes = await fs.readFile(target);
    const ext = path.extname(target);
    res.writeHead(200, {
      "Content-Type":
        (
          {
            ".html": "text/html; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".json": "application/json",
            ".png": "image/png",
            ".svg": "image/svg+xml",
          } as any
        )[ext] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(bytes);
  } catch (e: any) {
    json(res, e.status ?? 400, { error: e.message, details: e.details });
  }
});
const wss = new WebSocketServer({
  server,
  path: "/api/events",
  verifyClient: (info: any) => {
    const o = info.origin;
    return (
      !o || o === `http://127.0.0.1:${port}` || o === `http://localhost:${port}`
    );
  },
});
wss.on("connection", (client) =>
  client.on("message", (raw) => {
    try {
      const text = raw.toString();
      if (text.length > 24_000_000) return;
      const m = JSON.parse(text);
      if (m.type === "capture_result") {
        const job = captures.get(m.id);
        if (!job || job.status !== "pending") return;
        if (m.error) {
          job.status = "failed";
          job.error = String(m.error);
          return;
        }
        if (
          typeof m.png !== "string" ||
          !m.png.startsWith("data:image/png;base64,")
        )
          return;
        const bytes = Buffer.from(m.png.slice(22), "base64");
        if (
          bytes.length > 16_000_000 ||
          bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
        )
          return;
        job.data = bytes;
        job.status = "completed";
      }
    } catch {}
  }),
);
function broadcast(event: any) {
  for (const c of wss.clients)
    if (c.readyState === 1) c.send(JSON.stringify(event));
}
server.listen(port, "127.0.0.1", () =>
  console.log(
    `FMBE Studio ready: http://127.0.0.1:${port}\nAssets: ${capabilities.animations} animations / ${capabilities.controllers} controllers\nNetEase calibration: not performed`,
  ),
);
server.on("error", (e) => {
  console.error(e.message);
  process.exitCode = 1;
});
