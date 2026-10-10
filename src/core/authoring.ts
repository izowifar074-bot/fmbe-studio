import { parse } from "acorn";
import {
  add,
  sub,
  mulv,
  vec,
  finite,
  ident,
  mm,
  trs,
  point,
  direction,
  beam as makeBeam,
  norm,
  translation,
  type V3,
  type Mat,
} from "./math.js";
import { MATERIALS, type Project, type Design, type Part } from "./types.js";
class Scope {
  values: Record<string, any> = Object.create(null);
  constructor(public parent?: Scope) {}
  get(k: string): any {
    if (Object.hasOwn(this.values, k)) return this.values[k];
    if (this.parent) return this.parent.get(k);
    throw new Error(`未定义名称 ${k}`);
  }
  set(k: string, v: any): any {
    if (Object.hasOwn(this.values, k)) {
      this.values[k] = v;
      return v;
    }
    if (this.parent) return this.parent.set(k, v);
    throw new Error(`未定义变量 ${k}`);
  }
}
class Return {
  constructor(public value: any) {}
}
const banned = new Set([
  "constructor",
  "prototype",
  "__proto__",
  "call",
  "apply",
  "bind",
  "caller",
  "arguments",
]);
export function author(
  project: Pick<Project, "source" | "params" | "overrides" | "budget">,
): Design {
  const design: Design = {
    parts: [],
    parameters: [],
    diagnostics: [],
    constraints: [],
    source: project.source,
    budget: project.budget,
  };
  if (project.source.length > 131072) throw new Error("造型源码超过 128 KiB");
  const root = new Scope();
  let steps = 150000,
    depth = 0,
    currentLine = 1,
    currentFrame = ident(),
    currentGroup = "";
  const ids = new Set<string>();
  const tick = () => {
    if (--steps < 0) throw new Error("造型程序指令预算耗尽（150000）");
  };
  const safeKey = (k: any) => {
    k = String(k);
    if (banned.has(k)) throw new Error(`禁止访问 ${k}`);
    return k;
  };
  const invoke = (fn: any, args: any[]): any => {
    tick();
    if (++depth > 80) throw new Error("组件调用层级超过 80");
    try {
      if (typeof fn === "function") return fn(...args);
      if (fn?.closure) {
        const s = new Scope(fn.env);
        fn.node.params.forEach((p: any, i: number) => bind(p, args[i], s));
        try {
          return fn.node.body.type === "BlockStatement"
            ? block(fn.node.body.body, s)
            : run(fn.node.body, s);
        } catch (r) {
          if (r instanceof Return) return r.value;
          throw r;
        }
      }
      throw new Error("目标不是可调用的 SDK 操作或组件");
    } finally {
      depth--;
    }
  };
  const bind = (p: any, v: any, s: Scope) => {
    if (p.type === "Identifier") s.values[p.name] = v;
    else if (p.type === "AssignmentPattern")
      bind(p.left, v === undefined ? run(p.right, s) : v, s);
    else if (p.type === "ArrayPattern")
      p.elements.forEach((q: any, i: number) => q && bind(q, v?.[i], s));
    else throw new Error(`不支持解构 ${p.type}`);
  };
  const assign = (n: any, v: any, s: Scope) => {
    if (n.type === "Identifier") return s.set(n.name, v);
    if (n.type === "MemberExpression") {
      const obj = run(n.object, s),
        key = safeKey(n.computed ? run(n.property, s) : n.property.name);
      if (obj === root.values.Math) throw new Error("不能改写 Math");
      obj[key] = v;
      return v;
    }
    throw new Error("不支持该赋值目标");
  };
  const block = (nodes: any[], s: Scope) => {
    for (const n of nodes) run(n, s);
    return undefined;
  };
  function run(n: any, s: Scope): any {
    if (!n) return undefined;
    tick();
    currentLine = n.loc?.start.line ?? currentLine;
    switch (n.type) {
      case "Program":
        return block(n.body, s);
      case "BlockStatement":
        return block(n.body, new Scope(s));
      case "EmptyStatement":
        return;
      case "ExpressionStatement":
        return run(n.expression, s);
      case "VariableDeclaration":
        for (const d of n.declarations) bind(d.id, run(d.init, s), s);
        return;
      case "Literal":
        return n.value;
      case "Identifier":
        return s.get(n.name);
      case "ArrayExpression":
        return n.elements.map((x: any) => run(x, s));
      case "ObjectExpression": {
        const o = Object.create(null);
        for (const p of n.properties) {
          if (p.type !== "Property" || p.kind !== "init")
            throw new Error("对象只允许普通字段");
          const k = safeKey(
            p.computed ? run(p.key, s) : (p.key.name ?? p.key.value),
          );
          o[k] = run(p.value, s);
        }
        return o;
      }
      case "TemplateLiteral":
        return n.quasis
          .map(
            (q: any, i: number) =>
              q.value.cooked +
              (i < n.expressions.length
                ? String(run(n.expressions[i], s))
                : ""),
          )
          .join("");
      case "MemberExpression": {
        const o = run(n.object, s),
          k = safeKey(n.computed ? run(n.property, s) : n.property.name);
        if (o == null) throw new Error(`无法读取 ${k}`);
        if (Array.isArray(o)) {
          if (k === "length") return o.length;
          if (k === "map")
            return (fn: any) => o.map((v, i) => invoke(fn, [v, i]));
          if (k === "forEach")
            return (fn: any) => o.forEach((v, i) => invoke(fn, [v, i]));
          if (k === "push")
            return (...a: any[]) => {
              if (o.length + a.length > 10000) throw new Error("数组过大");
              return o.push(...a);
            };
        }
        if (!Object.hasOwn(o, k)) return undefined;
        return o[k];
      }
      case "CallExpression":
        return invoke(
          run(n.callee, s),
          n.arguments.map((a: any) => {
            if (a.type === "SpreadElement") throw new Error("暂不支持展开参数");
            return run(a, s);
          }),
        );
      case "ArrowFunctionExpression":
      case "FunctionExpression":
        return { closure: true, node: n, env: s };
      case "FunctionDeclaration":
        s.values[n.id.name] = { closure: true, node: n, env: s };
        return;
      case "ReturnStatement":
        throw new Return(run(n.argument, s));
      case "UnaryExpression": {
        const a = run(n.argument, s);
        if (n.operator === "-") return -a;
        if (n.operator === "+") return +a;
        if (n.operator === "!") return !a;
        if (n.operator === "typeof") return typeof a;
        throw new Error("不支持一元运算");
      }
      case "BinaryExpression":
      case "LogicalExpression": {
        const a = run(n.left, s);
        if (n.operator === "&&") return a && run(n.right, s);
        if (n.operator === "||") return a || run(n.right, s);
        if (n.operator === "??") return a ?? run(n.right, s);
        const b = run(n.right, s);
        switch (n.operator) {
          case "+":
            return a + b;
          case "-":
            return a - b;
          case "*":
            return a * b;
          case "/":
            return a / b;
          case "%":
            return a % b;
          case "**":
            return a ** b;
          case "<":
            return a < b;
          case ">":
            return a > b;
          case "<=":
            return a <= b;
          case ">=":
            return a >= b;
          case "===":
          case "==":
            return a === b;
          case "!==":
          case "!=":
            return a !== b;
        }
        throw new Error(`不支持运算 ${n.operator}`);
      }
      case "ConditionalExpression":
        return run(run(n.test, s) ? n.consequent : n.alternate, s);
      case "IfStatement":
        return run(run(n.test, s) ? n.consequent : n.alternate, s);
      case "AssignmentExpression": {
        const b = run(n.right, s);
        if (n.operator === "=") return assign(n.left, b, s);
        const a = run(n.left, s);
        return assign(
          n.left,
          n.operator === "+="
            ? a + b
            : n.operator === "-="
              ? a - b
              : n.operator === "*="
                ? a * b
                : (() => {
                    throw new Error("不支持复合赋值");
                  })(),
          s,
        );
      }
      case "UpdateExpression": {
        const a = run(n.argument, s),
          b = a + (n.operator === "++" ? 1 : -1);
        assign(n.argument, b, s);
        return n.prefix ? b : a;
      }
      case "ForStatement": {
        const inner = new Scope(s);
        run(n.init, inner);
        let count = 0;
        while (!n.test || run(n.test, inner)) {
          if (++count > 2048) throw new Error("循环超过 2048 次");
          run(n.body, inner);
          run(n.update, inner);
        }
        return;
      }
      case "ForOfStatement": {
        const vals = run(n.right, s);
        if (!Array.isArray(vals)) throw new Error("for…of 只接受数组");
        if (vals.length > 2048) throw new Error("循环过长");
        for (const v of vals) {
          const inner = new Scope(s);
          if (n.left.type === "VariableDeclaration")
            bind(n.left.declarations[0].id, v, inner);
          else assign(n.left, v, inner);
          run(n.body, inner);
        }
        return;
      }
      default:
        throw new Error(`造型语言不支持 ${n.type}`);
    }
  }
  const matOf = (p: any): Mat => p?.__part?.matrix ?? currentFrame;
  function handle(part: Part) {
    const h: any = Object.create(null);
    h.id = part.id;
    h.__part = part;
    h.anchor = (side = "center") => anchor(part, side);
    h.axis = (axis: string) =>
      norm(
        direction(
          part.matrix,
          axis === "right" ? [1, 0, 0] : axis === "up" ? [0, 1, 0] : [0, 0, 1],
        ),
      );
    return h;
  }
  function anchor(part: Part, side: string) {
    const local: V3 = [0, 0, 0];
    const fields = side.split(".");
    if (fields.includes("right")) local[0] = part.size[0] / 2;
    if (fields.includes("left")) local[0] = -part.size[0] / 2;
    if (fields.includes("top")) local[1] = part.size[1] / 2;
    if (fields.includes("bottom")) local[1] = -part.size[1] / 2;
    if (fields.includes("front")) local[2] = part.size[2] / 2;
    if (fields.includes("back")) local[2] = -part.size[2] / 2;
    const a: any = Object.create(null);
    a.__anchor = true;
    a.part = part;
    a.local = local;
    a.offset = (off: V3) => ({
      __point: true,
      value: add(point(part.matrix, local), direction(part.matrix, vec(off))),
    });
    return a;
  }
  const position = (p: any): V3 =>
    p?.__anchor
      ? point(p.part.matrix, p.local)
      : p?.__point
        ? vec(p.value)
        : point(currentFrame, vec(p));
  function create(id: any, o: any = {}, m?: Mat, size?: V3, kind = "box") {
    id = String(id);
    if (!/^[a-zA-Z0-9_./:-]{1,100}$/.test(id))
      throw new Error("部件 ID 使用 1～100 个英文字母、数字或 _ . / : -");
    if (ids.has(id)) throw new Error(`重复部件 ID：${id}`);
    ids.add(id);
    if (ids.size > 1024) throw new Error("单工程上限 1024 部件");
    const override = project.overrides[id] ?? {};
    if (override.hidden) return null;
    const sz = vec(override.size ?? size ?? o.size, [1, 1, 1]);
    if (sz.some((v) => v < 0.0001 || v > 128))
      throw new Error(`${id} 当前编译器尺寸范围为 0.0001～128 格`);
    let matrix = m ?? mm(currentFrame, trs(vec(o.position), vec(o.rotation)));
    if (override.position)
      matrix = [...matrix.slice(0, 12), ...vec(override.position), 1];
    if (override.rotation)
      matrix = trs(
        [matrix[12], matrix[13], matrix[14]],
        vec(override.rotation),
      );
    const material = override.material ?? o.material ?? "stone",
      mat = MATERIALS[material];
    if (!mat)
      throw new Error(
        `未知材质 ${material}，可选 ${Object.keys(MATERIALS).join(", ")}`,
      );
    const part: Part = {
      id,
      name: o.name ?? id,
      kind,
      size: sz,
      matrix,
      material,
      item: mat.item,
      color: mat.color,
      motionGroup: o.motionGroup ?? "static",
      sourceLine: currentLine,
      group: currentGroup,
    };
    design.parts.push(part);
    return handle(part);
  }
  root.values.box = (id: string, o: any) => create(id, o);
  root.values.beamBetween = (id: string, o: any) => {
    const a = position(o.from),
      b = position(o.to),
      section = o.section ?? [0.2, 0.2];
    const result = makeBeam(
      a,
      b,
      [finite(section[0], "截面宽"), finite(section[1], "截面高")],
      o.up === undefined ? direction(currentFrame, [0, 1, 0]) : vec(o.up),
    );
    if (result.fallback)
      design.diagnostics.push({
        severity: "info",
        code: "UP_FALLBACK",
        message: "上方向与梁共线，使用确定的备用轴",
        partId: id,
      });
    return create(id, o, result.matrix, result.size, "beam");
  };
  root.values.param = (name: string, value: number, o: any = {}) => {
    name = String(name);
    const v = finite(project.params[name] ?? value, name),
      min = o.min ?? -100,
      max = o.max ?? 100;
    if (v < min || v > max)
      throw new Error(`参数 ${name} 超过 [${min},${max}]`);
    design.parameters.push({
      name,
      label: o.label ?? name,
      value: v,
      default: value,
      min,
      max,
      step: o.step ?? 0.1,
    });
    return v;
  };
  root.values.group = (id: string, o: any, fn: any) => {
    const before = currentFrame,
      bg = currentGroup;
    currentFrame = mm(before, trs(vec(o.position), vec(o.rotation)));
    currentGroup = bg ? `${bg}/${id}` : id;
    try {
      return invoke(fn, []);
    } finally {
      currentFrame = before;
      currentGroup = bg;
    }
  };
  root.values.attach = (moving: any, fixed: any, o: any = {}) => {
    if (!moving?.__anchor || !fixed?.__anchor)
      throw new Error("attach 需要两个 anchor");
    if (o.align)
      throw new Error("当前 attach 支持点吸附；法线/滚转约束尚未实现");
    const delta = sub(position(fixed), position(moving));
    moving.part.matrix = mm(translation(delta), moving.part.matrix);
    design.constraints.push({
      type: "point_attach",
      moving: moving.part.id,
      fixed: fixed.part.id,
      residual: Math.hypot(...sub(position(fixed), position(moving))),
    });
  };
  root.values.repeat = (n: number, fn: any) => {
    if (n < 0 || n > 256) throw new Error("repeat 数量 0～256");
    for (let i = 0; i < Math.floor(n); i++) invoke(fn, [i]);
  };
  root.values.arc = (id: string, o: any) => {
    const count = Math.max(1, Math.min(128, Math.floor(o.segments ?? 12))),
      radius = finite(o.radius ?? 2, "半径"),
      start = o.start ?? 0,
      end = o.end ?? 180,
      center = vec(o.center),
      plane = o.plane ?? "xy";
    if (radius <= 0) throw new Error("半径必须为正");
    const make = (a: number): V3 => {
      const c = Math.cos((a * Math.PI) / 180) * radius,
        s = Math.sin((a * Math.PI) / 180) * radius;
      return add(
        center,
        plane === "xz" ? [c, 0, s] : plane === "yz" ? [0, c, s] : [c, s, 0],
      );
    };
    for (let i = 0; i < count; i++) {
      const a = make(start + ((end - start) * i) / count),
        b = make(start + ((end - start) * (i + 1)) / count);
      const r = makeBeam(
        a,
        b,
        [o.depth ?? 0.25, o.thickness ?? 0.25],
        plane === "xz" ? [0, 1, 0] : [0, 0, 1],
      );
      const h = create(
        `${id}/${i}`,
        o,
        mm(currentFrame, r.matrix),
        r.size,
        "arc",
      );
      if (h) h.__part.meta = { generator: id, segments: count, radius };
    }
    design.diagnostics.push({
      severity: "info",
      code: "ARC_ERROR",
      message: `${id}：${count} 段，中心线弦高误差约 ${(radius * (1 - Math.cos((Math.abs(end - start) * Math.PI) / 180 / count / 2))).toFixed(5)} 格`,
    });
  };
  root.values.profilePrism = (id: string, o: any) => {
    const loops: any[] = [o.outline, ...(o.holes ?? [])];
    if (
      loops.some(
        (l) =>
          !Array.isArray(l) ||
          l.length < 3 ||
          l.some(
            (p: any) =>
              !Array.isArray(p) ||
              p.length !== 2 ||
              p.some((v: any) => !Number.isFinite(v)),
          ),
      )
    )
      throw new Error("轮廓/孔洞必须是至少三个二维点");
    const xs = loops[0].map((p: any) => p[0]),
      x0 = Math.min(...xs),
      x1 = Math.max(...xs);
    if (x1 - x0 < 1e-8) throw new Error("轮廓宽度为零");
    const n = Math.max(1, Math.min(128, Math.floor(o.segments ?? 12))),
      dx = (x1 - x0) / n,
      thick = finite(o.thickness ?? 0.2, "厚度");
    let index = 0;
    const intervals = (x: number) => {
      const ys: number[] = [];
      for (const loop of loops)
        for (let i = 0; i < loop.length; i++) {
          const a = loop[i],
            b = loop[(i + 1) % loop.length];
          if ((a[0] <= x && b[0] > x) || (b[0] <= x && a[0] > x))
            ys.push(a[1] + ((x - a[0]) * (b[1] - a[1])) / (b[0] - a[0]));
        }
      ys.sort((a, b) => a - b);
      return ys;
    };
    const cuts = [
      ...new Set([
        ...Array.from({ length: n + 1 }, (_, i) => x0 + i * dx),
        ...loops
          .flatMap((l) => l.map((p: any) => p[0]))
          .filter((x: number) => x >= x0 && x <= x1),
      ]),
    ].sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const left = cuts[i],
        right = cuts[i + 1],
        stripWidth = right - left,
        eps = stripWidth * 1e-7;
      if (stripWidth < 0.0001) continue;
      const samples = [
        intervals(left + eps),
        intervals((left + right) / 2),
        intervals(right - eps),
      ];
      if (samples.some((a) => a.length !== samples[1].length)) {
        design.diagnostics.push({
          severity: "warning",
          code: "PROFILE_TOPOLOGY",
          message: `${id} 第 ${i} 条带跨过轮廓拓扑变化，保守跳过；增加 segments 或分开轮廓`,
        });
        continue;
      }
      for (let j = 0; j < samples[1].length; j += 2) {
        const low = Math.max(...samples.map((a) => a[j])),
          high = Math.min(...samples.map((a) => a[j + 1]));
        if (high - low <= 1e-7) continue;
        const p: V3 = [(left + right) / 2, (low + high) / 2, 0];
        create(
          `${id}/${index++}`,
          o,
          mm(
            currentFrame,
            mm(trs(vec(o.position), vec(o.rotation)), translation(p)),
          ),
          [stripWidth, high - low, thick],
          "profile",
        );
      }
    }
    design.diagnostics.push({
      severity: "warning",
      code: "PROFILE_APPROX",
      message: `${id}：扫描条带近似，${index} 个部件；孔洞保留及轮廓误差需要结合分段检查，尚无连续域证明`,
    });
  };
  const math: any = Object.create(null);
  for (const k of [
    "abs",
    "acos",
    "asin",
    "atan",
    "atan2",
    "ceil",
    "cos",
    "floor",
    "hypot",
    "max",
    "min",
    "pow",
    "round",
    "sin",
    "sqrt",
    "tan",
    "trunc",
  ])
    math[k] = (...a: number[]) => (Math as any)[k](...a);
  math.PI = Math.PI;
  root.values.Math = Object.freeze(math);
  root.values.undefined = undefined;
  try {
    const ast = parse(project.source, {
      ecmaVersion: 2022,
      locations: true,
      sourceType: "script",
    });
    run(ast, root);
  } catch (e: any) {
    design.diagnostics.push({
      severity: "error",
      code: "AUTHORING_ERROR",
      message: e.message ?? String(e),
      line: e.loc?.line ?? currentLine,
    });
  }
  if (
    !design.parts.length &&
    !design.diagnostics.some((d) => d.severity === "error")
  )
    design.diagnostics.push({
      severity: "warning",
      code: "EMPTY_DESIGN",
      message: "场景没有部件",
    });
  for (const id of Object.keys(project.overrides))
    if (!ids.has(id))
      design.diagnostics.push({
        severity: "warning",
        code: "ORPHAN_OVERRIDE",
        message: `局部覆盖 ${id} 的源部件不存在`,
        partId: id,
      });
  return design;
}
