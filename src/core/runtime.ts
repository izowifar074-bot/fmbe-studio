import { evaluateMolang } from "./molang.js";
import {
  ident,
  mm,
  trs,
  rot,
  scale,
  translation,
  point,
  sub,
  add,
  mulv,
  vec,
  distance,
  type V3,
  type Mat,
} from "./math.js";
import {
  MATERIALS,
  type Diagnostic,
  type CameraSettings,
  type ResourcePack,
} from "./types.js";
export type AnimationInstance = {
  animation: string;
  next: string;
  blend: number;
  stop: string;
  controller: string;
  time: number;
  stopping: number | null;
  state?: string;
  raw: string;
};
export type Entity = {
  id: string;
  type: string;
  name: string;
  position: V3;
  rotation: V3;
  tags: string[];
  item: string;
  invisible: boolean;
  variables: Record<string, any>;
  state: Record<string, any>;
  controllers: AnimationInstance[];
  nativeStates: Record<string, any>;
  born: number;
  renderPosition?: V3;
  previousPosition?: V3;
};
export type BonePose = { position: V3; rotation: V3; scale: V3; matrix: Mat };
export type EntityFrame = {
  id: string;
  type: string;
  name: string;
  position: V3;
  rotation: V3;
  item: string;
  invisible: boolean;
  tags: string[];
  bones: Record<string, BonePose>;
  itemMatrix: Mat;
  controllers: any[];
};
export type Frame = {
  time: number;
  tick: number;
  frame: number;
  entities: EntityFrame[];
  camera: CameraSettings;
  diagnostics: Diagnostic[];
  entityCount: number;
  profile: string;
  verifiedInGame: false;
};
export function effectiveCamera(c: CameraSettings): CameraSettings {
  const out = structuredClone(c);
  if (c.resolved) return out;
  const pitch = (c.rotation[0] * Math.PI) / 180,
    yaw = (c.rotation[1] * Math.PI) / 180,
    forward: V3 = [
      -Math.sin(yaw) * Math.cos(pitch),
      -Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    ];
  if (c.mode === "third_person")
    out.position = add(c.position, mulv(forward, -4));
  if (c.mode === "third_person_front") {
    out.position = add(c.position, mulv(forward, 4));
    out.rotation = [-c.rotation[0], c.rotation[1] + 180];
  }
  out.resolved = true;
  return out;
}
export function commandTokens(line: string): string[] {
  const tokens: string[] = [];
  let word = "",
    quoted = false,
    quote = "",
    brackets = 0;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (
        c === "\\" &&
        i + 1 < line.length &&
        (line[i + 1] === quote || line[i + 1] === "\\")
      ) {
        word += line[++i];
        continue;
      }
      if (c === quote) {
        quoted = false;
      } else word += c;
      continue;
    }
    if (c === '"' || c === "'") {
      quoted = true;
      quote = c;
      if (!word) word = "\u0000";
      continue;
    }
    if (c === "[") brackets++;
    if (c === "]") brackets--;
    if (/\s/.test(c) && brackets === 0) {
      if (word) {
        tokens.push(word.replace(/^\u0000/, ""));
        word = "";
      }
    } else word += c;
  }
  if (quoted || brackets !== 0) throw new Error("命令引号或选择器括号未闭合");
  if (word) tokens.push(word.replace(/^\u0000/, ""));
  return tokens;
}
export function normalizeResources(raw: any): ResourcePack {
  const gs = Object.values<any>(raw.geometry).flatMap(
    (g) => g["minecraft:geometry"] ?? [g],
  );
  return {
    version: raw.metadata?.tag ?? "v1.21.120.4",
    commit: raw.metadata?.commit ?? "",
    animations: raw.animations,
    controllers: raw.animationControllers,
    fox: gs.find((g) => g.description?.identifier === "geometry.fox"),
    foxEntity: raw.entities["minecraft:fox"].description,
    player: gs.find(
      (g) => g.description?.identifier === "geometry.humanoid.custom",
    ),
    raw,
  };
}
export class Runtime {
  entities: Entity[] = [];
  time = 0;
  frameNumber = 0;
  peak = 0;
  sequence = 0;
  seed = 49291;
  diagnostics: Diagnostic[] = [];
  trace: any[] = [];
  commands: { time: number; command: string }[] = [];
  functions: Record<string, string[]> = {};
  heldTransform: Mat = mm(rot([90, 0, 0]), scale([0.21875, 0.21875, 0.21875]));
  camera: CameraSettings = {
    mode: "first_person",
    position: [0, 2, -6],
    rotation: [0, 0],
    fov: 70,
  };
  player = {
    position: [0, 0.38, -6] as V3,
    rotation: [0, 0, 0] as V3,
    eyeHeight: 1.62,
  };
  lastFrame: Frame | null = null;
  modelBasis: Mat = ident();
  renderOrigin: V3 = [0, 0, 0];
  rotationSigns: V3 = [1, 1, 1];
  rotationOrder = "ZYX";
  private queryCache = new Map<string, Record<string, any>>();
  constructor(public resources: ResourcePack) {}
  diagnostic(
    code: string,
    message: string,
    severity: Diagnostic["severity"] = "warning",
  ) {
    if (!this.diagnostics.some((d) => d.code === code && d.message === message))
      this.diagnostics.push({ severity, code, message });
    if (this.diagnostics.length > 100) this.diagnostics.shift();
  }
  spawn(type = "minecraft:fox", position: V3 = [0, 0, 0], name = ""): Entity {
    if (this.entities.length >= 2048) throw new Error("运行时实体上限 2048");
    const e: Entity = {
      id: `e${++this.sequence}`,
      type: type.includes(":") ? type : `minecraft:${type}`,
      name,
      position,
      rotation: [0, 0, 0],
      tags: [],
      item: "",
      invisible: false,
      variables: Object.create(null),
      state: {
        is_baby: 0,
        is_sleeping: 0,
        is_sitting: 0,
        is_stalking: 0,
        is_interested: 0,
        is_stunned: 0,
        has_target: 0,
        is_on_ground: 1,
        modified_move_speed: 0,
        modified_distance_moved: 0,
        vertical_speed: 0,
        ground_speed: 0,
        sleep_rotation: 0,
        head_x_rotation: 0,
        head_y_rotation: 0,
      },
      controllers: [],
      nativeStates: {},
      born: this.time,
    };
    if (e.type !== "minecraft:fox" && e.type !== "minecraft:player")
      throw new Error(`尚未实现实体模型 ${e.type}`);
    this.entities.push(e);
    this.peak = Math.max(this.peak, this.entities.length);
    return e;
  }
  select(target: string, self?: Entity): Entity[] {
    if (target === "@s") return self ? [self] : [];
    if (target === "@p" || target === "@a") {
      return this.entities.filter((e) => e.type === "minecraft:player");
    }
    if (!target.startsWith("@"))
      return this.entities.filter((e) => e.name === target || e.id === target);
    if (!/^@[enr](\[.*\])?$/.test(target))
      throw new Error(`不支持选择器 ${target}`);
    let out = this.entities.slice();
    const inside = target.includes("[")
      ? target.slice(target.indexOf("[") + 1, -1)
      : "";
    for (const pair of inside.split(",").filter(Boolean)) {
      const k = pair.slice(0, pair.indexOf("=")),
        v = pair.slice(pair.indexOf("=") + 1).replace(/^"|"$/g, "");
      const negative = v.startsWith("!"),
        value = negative ? v.slice(1) : v;
      let predicate: (e: Entity) => boolean;
      if (k === "tag") predicate = (e) => e.tags.includes(value);
      else if (k === "name") predicate = (e) => e.name === value;
      else if (k === "type")
        predicate = (e) =>
          e.type === (value.includes(":") ? value : `minecraft:${value}`);
      else if (k === "c" || k === "limit") {
        const n = Number(value);
        out = n < 0 ? out.reverse().slice(0, -n) : out.slice(0, n);
        continue;
      } else if (k === "r" || k === "rm") {
        const origin = self?.position ?? this.player.position;
        out = out.filter((e) =>
          k === "r"
            ? distance(e.position, origin) <= Number(value)
            : distance(e.position, origin) >= Number(value),
        );
        continue;
      } else throw new Error(`选择器参数 ${k} 尚未实现`);
      out = out.filter((e) => (negative ? !predicate(e) : predicate(e)));
    }
    if (target[1] === "n")
      out.sort(
        (a, b) =>
          distance(a.position, self?.position ?? this.player.position) -
          distance(b.position, self?.position ?? this.player.position),
      );
    if (target[1] === "n" || target[1] === "r") out = out.slice(0, 1);
    return out;
  }
  execute(
    source: string,
    self?: Entity,
    origin?: V3,
    depth = 0,
  ): { ok: boolean; affected: number; error?: string } {
    if (depth > 16) throw new Error("命令调用层级超过 16");
    let line = source.trim().replace(/^\//, "");
    if (!line || line.startsWith("#")) return { ok: true, affected: 0 };
    try {
      const t = commandTokens(line),
        cmd = t.shift()!;
      const base = origin ?? self?.position ?? [0, 0, 0];
      const coord = (s: string, i: number) => {
        if (s?.startsWith("^")) throw new Error("局部 ^ 坐标尚未实现");
        const n = s?.startsWith("~")
          ? base[i] + Number(s.slice(1) || 0)
          : Number(s);
        if (!Number.isFinite(n)) throw new Error(`无效坐标 ${s}`);
        return n;
      };
      let n = 0;
      switch (cmd) {
        case "summon": {
          if (t.length < 4) throw new Error("summon 需要实体和三个坐标");
          const e = this.spawn(
            t[0],
            [coord(t[1], 0), coord(t[2], 1), coord(t[3], 2)],
            t[t.length - 1].startsWith("minecraft:")
              ? ""
              : t.length > 4
                ? t[t.length - 1]
                : "",
          );
          if (t[4] !== undefined && !isNaN(Number(t[4])))
            e.rotation[1] = Number(t[4]);
          n = 1;
          break;
        }
        case "tag": {
          for (const e of this.select(t[0], self)) {
            if (t[1] === "add" && !e.tags.includes(t[2])) e.tags.push(t[2]);
            else if (t[1] === "remove")
              e.tags = e.tags.filter((v) => v !== t[2]);
            else if (t[1] !== "add") throw new Error("tag 仅支持 add/remove");
            n++;
          }
          break;
        }
        case "replaceitem": {
          if (t[0] !== "entity" || t[2] !== "slot.weapon.mainhand")
            throw new Error("仅支持狐狸/玩家 mainhand");
          for (const e of this.select(t[1], self)) {
            e.item = t[4].includes(":") ? t[4] : `minecraft:${t[4]}`;
            n++;
          }
          break;
        }
        case "effect": {
          for (const e of this.select(t[0], self)) {
            if (t[1] === "invisibility") e.invisible = true;
            else if (t[1] === "clear") e.invisible = false;
            else
              this.diagnostic(
                "EFFECT_VISUAL_ONLY",
                `${t[1]} 不参与当前物理计算`,
              );
            n++;
          }
          break;
        }
        case "tp":
        case "teleport": {
          for (const e of this.select(t[0], self)) {
            e.position = [coord(t[1], 0), coord(t[2], 1), coord(t[3], 2)];
            if (t[4] !== undefined) e.rotation[1] = Number(t[4]);
            if (t[5] !== undefined) e.rotation[0] = Number(t[5]);
            n++;
          }
          break;
        }
        case "kill": {
          const ids = new Set(this.select(t[0], self).map((e) => e.id));
          n = ids.size;
          this.entities = this.entities.filter((e) => !ids.has(e.id));
          break;
        }
        case "event": {
          if (t[0] !== "entity") throw new Error("event entity ...");
          for (const e of this.select(t[1], self)) {
            if (t[2] === "minecraft:as_adult") e.state.is_baby = 0;
            else if (t[2] === "minecraft:as_baby") e.state.is_baby = 1;
            else if (t[2] === "minecraft:fox_configure_day")
              e.state.is_sleeping = 0;
            else throw new Error(`未实现事件 ${t[2]}`);
            n++;
          }
          break;
        }
        case "playanimation": {
          if (t.length < 2 || t.length > 6)
            throw new Error("playanimation 需要 2～6 个参数");
          const [
            selector,
            animation,
            next = "default",
            blend = "0",
            stop = "0",
            controller = "__default",
          ] = t;
          const bt = Number(blend);
          if (!Number.isFinite(bt) || bt < 0)
            throw new Error("blend_out_time 必须是非负数字");
          if (
            !this.resources.animations[animation] &&
            !this.resources.controllers[animation]
          )
            throw new Error(`动画资源不存在 ${animation}`);
          for (const e of this.select(selector, self)) {
            e.controllers = e.controllers.filter(
              (c) => c.controller !== controller,
            );
            e.controllers.push({
              animation,
              next,
              blend: bt,
              stop,
              controller,
              time: 0,
              stopping: null,
              raw: line,
            });
            n++;
          }
          break;
        }
        case "execute": {
          if (
            t[0] === "as" &&
            t[2] === "at" &&
            t[3] === "@s" &&
            t[4] === "run"
          ) {
            for (const e of this.select(t[1], self)) {
              const raw = line.slice(line.indexOf(" run ") + 5);
              const r = this.execute(raw, e, e.position, depth + 1);
              if (!r.ok) throw new Error(r.error);
              n += r.affected;
            }
          } else if (t[0] === "as" && t[2] === "run") {
            for (const e of this.select(t[1], self)) {
              const r = this.execute(
                line.slice(line.indexOf(" run ") + 5),
                e,
                base as V3,
                depth + 1,
              );
              if (!r.ok) throw new Error(r.error);
              n += r.affected;
            }
          } else
            throw new Error("execute 当前支持 as <target> [at @s] run ...");
          break;
        }
        case "function": {
          const lines = this.functions[t[0]];
          if (!lines) throw new Error(`未知函数 ${t[0]}`);
          for (const l of lines) {
            const r = this.execute(l, self, base as V3, depth + 1);
            if (!r.ok) throw new Error(r.error);
            n += r.affected;
          }
          break;
        }
        case "camera": {
          if (t[1] === "clear") {
            this.camera.mode = "first_person";
          } else if (t[1] === "set") {
            const mode = t[2].replace("minecraft:", "");
            if (
              ![
                "first_person",
                "third_person",
                "third_person_front",
                "free",
              ].includes(mode)
            )
              throw new Error("未实现此 camera preset");
            this.camera.mode = mode as any;
            const p = t.indexOf("pos"),
              r = t.indexOf("rot");
            if (p >= 0)
              this.camera.position = [
                coord(t[p + 1], 0),
                coord(t[p + 2], 1),
                coord(t[p + 3], 2),
              ];
            if (r >= 0)
              this.camera.rotation = [Number(t[r + 1]), Number(t[r + 2])];
            if (t.includes("ease"))
              this.diagnostic(
                "CAMERA_EASE_UNIMPLEMENTED",
                "camera ease 尚未实现；当前应用终点",
              );
          } else throw new Error("camera 当前支持 set/clear");
          n = 1;
          break;
        }
        default:
          throw new Error(`尚未实现命令 /${cmd}`);
      }
      if (depth === 0) this.commands.push({ time: this.time, command: line });
      return { ok: true, affected: n };
    } catch (e: any) {
      this.diagnostic("COMMAND_ERROR", e.message, "error");
      return { ok: false, affected: 0, error: e.message };
    }
  }
  runCommands(source: string | string[]) {
    return (Array.isArray(source) ? source : source.split(/\r?\n/))
      .filter((l) => l.trim() && !l.trim().startsWith("#"))
      .map((l) => ({ command: l, ...this.execute(l) }));
  }
  queries(e: Entity, time: number, dt: number): Record<string, any> {
    const cacheKey = `${e.id}:${time}:${dt}`;
    const cached = this.queryCache.get(cacheKey);
    if (cached) return cached;
    const camera = effectiveCamera(this.camera),
      cam = camera.position,
      delta = sub(cam, e.position);
    const result = {
      ...e.state,
      anim_time: time,
      life_time: this.time - e.born,
      delta_time: dt,
      frame_alpha: Math.max(
        0,
        this.time * 20 - Math.floor(this.time * 20 + 1e-8),
      ),
      body_y_rotation: e.rotation[1],
      body_x_rotation: e.rotation[0],
      head_y_rotation: () => e.state.head_y_rotation ?? 0,
      head_x_rotation: () => e.state.head_x_rotation ?? 0,
      target_x_rotation: e.state.target_x_rotation ?? 0,
      target_y_rotation: e.state.target_y_rotation ?? 0,
      position: (i: number) => e.position[i] ?? 0,
      rotation: (i: number) => e.rotation[i] ?? 0,
      camera_rotation: (i: number) => camera.rotation[i] ?? 0,
      distance_from_camera: Math.hypot(...delta),
      rotation_to_camera: (i: number) =>
        i === 0
          ? (Math.atan2(-delta[1], Math.hypot(delta[0], delta[2])) * 180) /
            Math.PI
          : (Math.atan2(-delta[0], delta[2]) * 180) / Math.PI,
      camera_distance_range_lerp: (a: number, b: number) =>
        Math.max(0, Math.min(1, (Math.hypot(...delta) - a) / (b - a))),
      is_alive: 1,
      is_in_ui: 0,
      is_first_person: this.camera.mode === "first_person" ? 1 : 0,
      model_scale: 1,
      all_animations_finished: 0,
      any_animation_finished: 0,
      has_main_hand_item: e.item ? 1 : 0,
    };
    this.queryCache.set(cacheKey, result);
    return result;
  }
  eval(value: any, e: Entity, time = 0, dt = 0, thisValue = 0): number {
    if (typeof value === "number") return value;
    if (typeof value !== "string") return 0;
    const variable = /^(?:v|variable)\.([a-z_][a-z0-9_.]*)$/i.exec(value);
    if (variable) return Number(e.variables[variable[1].toLowerCase()] ?? 0);
    try {
      const c = {
        variables: e.variables,
        queries: this.queries(e, time, dt),
        seed: this.seed,
        thisValue,
        onMissing: (q: string) =>
          this.diagnostic("MISSING_QUERY", `${e.id}: ${q} 缺少实现或场景输入`),
        onWrite: (name: string, v: any) => {
          if (this.trace.length < 1000)
            this.trace.push({ entity: e.id, time: this.time, name, value: v });
        },
      };
      const n = evaluateMolang(value, c);
      this.seed = c.seed;
      return Number.isFinite(Number(n)) ? Number(n) : 0;
    } catch (err: any) {
      this.diagnostic(
        "MOLANG_ERROR",
        `${e.id}: ${err.message} [${value.slice(0, 90)}]`,
        "error",
      );
      return 0;
    }
  }
  geometry(e: Entity) {
    return (
      (e.type === "minecraft:player"
        ? this.resources.player
        : this.resources.fox) ?? this.resources.fox
    );
  }
  channel(value: any, t: number, e: Entity, dt: number, current: V3): V3 {
    const val = (x: any, i: number) => this.eval(x, e, t, dt, current[i]);
    const vector = (x: any): V3 => {
      if (Array.isArray(x))
        return [
          val(x[0] ?? 0, 0),
          val(x[1] ?? x[0] ?? 0, 1),
          val(x[2] ?? x[0] ?? 0, 2),
        ];
      return [val(x, 0), val(x, 1), val(x, 2)];
    };
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const keys = Object.keys(value)
        .map(Number)
        .filter(Number.isFinite)
        .sort((a, b) => a - b);
      if (!keys.length) return vector(0);
      let a = keys[0],
        b = keys[keys.length - 1];
      for (const k of keys) {
        if (k <= t) a = k;
        if (k >= t) {
          b = k;
          break;
        }
      }
      const nodeA = value[String(a)],
        nodeB = value[String(b)];
      const va = vector(nodeA?.post ?? nodeA?.pre ?? nodeA),
        vb = vector(nodeB?.pre ?? nodeB?.post ?? nodeB);
      if (
        nodeA?.lerp_mode === "catmullrom" ||
        nodeB?.lerp_mode === "catmullrom"
      ) {
        const i = keys.indexOf(a),
          j = keys.indexOf(b),
          p0 = vector(
            value[String(keys[Math.max(0, i - 1)])]?.post ??
              value[String(keys[Math.max(0, i - 1)])],
          ),
          p3 = vector(
            value[String(keys[Math.min(keys.length - 1, j + 1)])]?.pre ??
              value[String(keys[Math.min(keys.length - 1, j + 1)])],
          );
        const u = a === b ? 0 : Math.max(0, Math.min(1, (t - a) / (b - a)));
        return va.map(
          (v, k) =>
            0.5 *
            (2 * v +
              (-p0[k] + vb[k]) * u +
              (2 * p0[k] - 5 * v + 4 * vb[k] - p3[k]) * u * u +
              (-p0[k] + 3 * v - 3 * vb[k] + p3[k]) * u * u * u),
        ) as V3;
      }
      const f = a === b ? 0 : Math.max(0, Math.min(1, (t - a) / (b - a)));
      return va.map((v, i) => v + (vb[i] - v) * f) as V3;
    }
    return vector(value);
  }
  applyAnimation(
    id: string,
    e: Entity,
    pose: Record<string, BonePose>,
    time: number,
    dt: number,
    weight = 1,
    depth = 0,
  ) {
    if (depth > 12) {
      this.diagnostic("ANIMATION_RECURSION", id, "error");
      return;
    }
    const aliases =
      e.type === "minecraft:fox"
        ? this.resources.foxEntity.animations
        : this.resources.raw.entities["minecraft:player"].description
            .animations;
    id = aliases[id] ?? id;
    const a = this.resources.animations[id];
    if (!a) {
      const c = this.resources.controllers[id];
      if (!c) {
        this.diagnostic("MISSING_ANIMATION", id);
        return;
      }
      const track =
        e.nativeStates[id] ??
        (e.nativeStates[id] = { state: c.initial_state ?? "default", time: 0 });
      let state = c.states[track.state];
      if (!state) {
        this.diagnostic("MISSING_STATE", `${id}.${track.state}`);
        return;
      }
      for (const tr of state.transitions ?? []) {
        const [name, expr] = Object.entries(tr)[0];
        if (this.eval(expr, e, time, dt)) {
          for (const ex of state.on_exit ?? []) this.eval(ex, e, time, dt);
          track.state = name;
          track.time = 0;
          state = c.states[name];
          for (const en of state?.on_entry ?? []) this.eval(en, e, time, dt);
          break;
        }
      }
      for (const ent of state?.animations ?? []) {
        if (typeof ent === "string")
          this.applyAnimation(ent, e, pose, track.time, dt, weight, depth + 1);
        else
          for (const [name, w] of Object.entries(ent))
            this.applyAnimation(
              name,
              e,
              pose,
              track.time,
              dt,
              weight * this.eval(w, e, time, dt),
              depth + 1,
            );
      }
      if (state?.blend_transition)
        this.diagnostic(
          "CONTROLLER_BLEND_PENDING",
          "资源控制器 blend_transition 尚未完整校准/实现；当前使用状态终点",
        );
      track.time += dt;
      return;
    }
    const length = a.animation_length ?? 0;
    let t =
      length > 0 && a.loop
        ? time % length
        : length > 0
          ? Math.min(time, length)
          : time;
    if (a.anim_time_update) t = this.eval(a.anim_time_update, e, time, dt);
    const w =
      weight *
      (a.blend_weight === undefined ? 1 : this.eval(a.blend_weight, e, t, dt));
    if (a.timeline || a.particle_effects || a.sound_effects)
      this.diagnostic(
        "ANIMATION_EFFECTS_PENDING",
        `${id} 的 timeline/粒子/声音事件尚未实现`,
      );
    for (const [bone, data] of Object.entries<any>(a.bones ?? {})) {
      const p = pose[bone];
      if (!p) continue;
      if (a.override_previous_animation) {
        const bind = this.geometry(e).bones.find((b: any) => b.name === bone);
        const parentBind = this.geometry(e).bones.find(
          (b: any) => b.name === bind?.parent,
        );
        p.position = sub(vec(bind?.pivot), vec(parentBind?.pivot));
        p.rotation = vec(
          this.geometry(e).bones.find((b: any) => b.name === bone)?.rotation,
        );
        p.scale = [1, 1, 1];
      }
      for (const k of ["position", "rotation", "scale"] as const) {
        if (data[k] === undefined) continue;
        const v = this.channel(data[k], t, e, dt, p[k]);
        p[k] = p[k].map((x, i) =>
          k === "scale" ? x * (1 + (v[i] - 1) * w) : x + v[i] * w,
        ) as V3;
      }
    }
  }
  evaluate(dt = 0): Frame {
    this.queryCache.clear();
    this.trace = [];
    const entities: EntityFrame[] = [];
    for (const e of this.entities) {
      const geometry = this.geometry(e);
      const pose: Record<string, BonePose> = {};
      for (const b of geometry.bones)
        pose[b.name] = {
          position: sub(
            vec(b.pivot),
            vec(geometry.bones.find((p: any) => p.name === b.parent)?.pivot),
          ),
          rotation: vec(b.rotation),
          scale: [1, 1, 1],
          matrix: ident(),
        };
      if (e.type === "minecraft:fox") {
        this.applyAnimation(
          "animation.fox.setup",
          e,
          pose,
          this.time - e.born,
          dt,
        );
        if (e.state.is_baby)
          this.applyAnimation(
            "animation.fox.baby_transform",
            e,
            pose,
            this.time - e.born,
            dt,
          );
        if (
          !e.controllers.some(
            (c) => c.controller === "controller.animation.fox.move",
          )
        )
          this.applyAnimation(
            "controller.animation.fox.move",
            e,
            pose,
            this.time - e.born,
            dt,
          );
      } else
        this.applyAnimation(
          "animation.humanoid.base_pose",
          e,
          pose,
          this.time - e.born,
          dt,
        );
      const completed: string[] = [];
      for (const c of e.controllers) {
        const stop = this.eval(c.stop, e, c.time, dt);
        if (stop && c.stopping === null) c.stopping = 0;
        const weight =
          c.stopping === null
            ? 1
            : c.blend <= 0
              ? 0
              : Math.max(0, 1 - c.stopping / c.blend);
        this.applyAnimation(c.animation, e, pose, c.time, dt, weight);
        if (c.stopping !== null) {
          c.stopping += dt;
          if (c.stopping >= c.blend) {
            completed.push(c.controller);
            if (c.next && !["none", "_", "default"].includes(c.next))
              this.diagnostic(
                "NEXT_STATE_UNRESOLVED",
                `next_state=${c.next} 未解析为已知状态，不能标记完整兼容`,
              );
          }
        }
        c.time += dt;
      }
      e.controllers = e.controllers.filter(
        (c) => !completed.includes(c.controller),
      );
      const done = new Set<string>();
      const base = mm(
        mm(
          trs(add(e.renderPosition ?? e.position, this.renderOrigin), [
            0,
            e.rotation[1],
            0,
          ]),
          this.modelBasis,
        ),
        scale([1 / 16, 1 / 16, 1 / 16]),
      );
      const solve = (b: any): Mat => {
        if (done.has(b.name)) return pose[b.name].matrix;
        let parent = base,
          parentPivot: V3 = [0, 0, 0];
        if (b.parent) {
          const pb = geometry.bones.find((q: any) => q.name === b.parent);
          if (pb) {
            parent = solve(pb);
            parentPivot = vec(pb.pivot);
          }
        }
        const p = pose[b.name],
          offset = p.position;
        const angles = p.rotation.map(
          (v, i) => v * this.rotationSigns[i],
        ) as V3;
        const axes: Record<string, Mat> = {
          X: rot([angles[0], 0, 0]),
          Y: rot([0, angles[1], 0]),
          Z: rot([0, 0, angles[2]]),
        };
        let rotation = ident();
        for (const axis of this.rotationOrder)
          rotation = mm(rotation, axes[axis]);
        p.matrix = mm(
          parent,
          mm(translation(offset), mm(rotation, scale(p.scale))),
        );
        done.add(b.name);
        return p.matrix;
      };
      for (const b of geometry.bones) solve(b);
      const head = geometry.bones.find((b: any) => b.locators?.held_item);
      let itemMatrix = base;
      if (head) {
        const loc = head.locators.held_item,
          offset = sub(
            vec(Array.isArray(loc) ? loc : loc.offset),
            vec(head.pivot),
          );
        itemMatrix = mm(
          pose[head.name].matrix,
          mm(translation(offset), this.heldTransform),
        );
      }
      entities.push({
        id: e.id,
        type: e.type,
        name: e.name,
        position: [...e.position],
        rotation: [...e.rotation],
        item: e.item,
        invisible: e.invisible,
        tags: [...e.tags],
        bones: pose,
        itemMatrix,
        controllers: e.controllers.map((c) => ({
          controller: c.controller,
          animation: c.animation,
          time: c.time,
          next: c.next,
          blend: c.blend,
          stopping: c.stopping,
        })),
      });
    }
    for (const e of this.entities)
      if (e.item && !Object.values(MATERIALS).some((m) => m.item === e.item))
        this.diagnostic(
          "UNSUPPORTED_ITEM_MODEL",
          `${e.item} 暂无持物形状与材质适配；不会用普通立方体冒充`,
        );
    const f: Frame = {
      time: this.time,
      tick: Math.floor(this.time * 20 + 1e-8),
      frame: this.frameNumber,
      entities,
      camera: effectiveCamera(this.camera),
      diagnostics: structuredClone(this.diagnostics),
      entityCount: this.entities.length,
      profile: "bedrock-1.21.120.4-provisional",
      verifiedInGame: false,
    };
    this.lastFrame = f;
    return f;
  }
  step(dt = 1 / 60, frames = 1): Frame {
    if (
      !Number.isFinite(dt) ||
      dt <= 0 ||
      dt > 1 ||
      !Number.isInteger(frames) ||
      frames < 1 ||
      frames > 3600
    )
      throw new Error("step: dt ∈ (0,1], frames ∈ [1,3600]");
    if (frames * Math.max(1, this.entities.length) > 100000)
      throw new Error("单次推进超过 100000 实体帧预算，请拆分请求");
    for (let i = 0; i < frames; i++) {
      this.time += dt;
      this.frameNumber++;
      this.evaluate(dt);
    }
    return this.observe();
  }
  observe(): Frame {
    if (!this.lastFrame) this.evaluate(0);
    return structuredClone(this.lastFrame!);
  }
  snapshot() {
    return structuredClone({
      entities: this.entities,
      time: this.time,
      frameNumber: this.frameNumber,
      peak: this.peak,
      sequence: this.sequence,
      seed: this.seed,
      camera: this.camera,
      player: this.player,
      heldTransform: this.heldTransform,
      modelBasis: this.modelBasis,
      renderOrigin: this.renderOrigin,
      rotationSigns: this.rotationSigns,
      rotationOrder: this.rotationOrder,
      commands: this.commands,
      diagnostics: this.diagnostics,
      lastFrame: this.lastFrame,
      functions: this.functions,
    });
  }
  restore(s: ReturnType<Runtime["snapshot"]>) {
    Object.assign(this, structuredClone(s));
    this.queryCache.clear();
  }
}
