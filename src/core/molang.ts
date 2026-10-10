// Independent Molang parser/interpreter. No JavaScript eval, Function or vm.
export type Expr = any;
type Tok = { s: string; p: number; kind: string };
export class MolangError extends Error {
  constructor(
    message: string,
    public position = 0,
  ) {
    super(message);
  }
}
export function tokenize(source: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < source.length) {
    const s = source.slice(i);
    const w = s.match(/^\s+/);
    if (w) {
      i += w[0].length;
      continue;
    }
    const n = s.match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
    if (n) {
      out.push({ s: n[0], p: i, kind: "n" });
      i += n[0].length;
      continue;
    }
    if (s[0] === "'" || s[0] === '"') {
      const q = s[0];
      let k = 1,
        t = "";
      while (k < s.length && s[k] !== q) {
        if (s[k] === "\\") k++;
        t += s[k++];
      }
      if (k >= s.length) throw new MolangError("字符串未闭合", i);
      out.push({ s: t, p: i, kind: "s" });
      i += k + 1;
      continue;
    }
    const id = s.match(/^[a-z_][a-z_0-9]*(?:\.[a-z_][a-z_0-9]*)*/i);
    if (id) {
      out.push({ s: id[0].toLowerCase(), p: i, kind: "id" });
      i += id[0].length;
      continue;
    }
    const op = s.match(
      /^(\?\?|&&|\|\||==|!=|<=|>=|->|[+\-*/%<>=!?:;,(){}\[\]])/,
    );
    if (op) {
      out.push({ s: op[0], p: i, kind: "op" });
      i += op[0].length;
      continue;
    }
    throw new MolangError(`未知字符 ${s[0]}`, i);
  }
  out.push({ s: "<eof>", p: i, kind: "eof" });
  return out;
}
const precedence: Record<string, number> = {
  "=": 1,
  "??": 3,
  "||": 4,
  "&&": 5,
  "==": 6,
  "!=": 6,
  "<": 7,
  ">": 7,
  "<=": 7,
  ">=": 7,
  "+": 8,
  "-": 8,
  "*": 9,
  "/": 9,
  "%": 9,
};
class Parser {
  i = 0;
  constructor(public t: Tok[]) {}
  get peek() {
    return this.t[this.i].s;
  }
  take(s?: string) {
    const t = this.t[this.i++];
    if (s && t.s !== s) throw new MolangError(`预期 ${s}，得到 ${t.s}`, t.p);
    return t;
  }
  program(end = "<eof>"): Expr {
    const a = [];
    let complex = false;
    while (this.peek !== end && this.peek !== "<eof>") {
      if (this.peek === ";") {
        this.take();
        complex = true;
        continue;
      }
      if (this.peek === "return") {
        this.take();
        a.push({ k: "return", a: this.expr() });
      } else if (this.peek === "break" || this.peek === "continue") {
        a.push({ k: this.take().s });
      } else a.push(this.expr());
      if (this.peek === ";") {
        this.take();
        complex = true;
      } else if (this.peek !== end && this.peek !== "<eof>")
        throw new MolangError(`缺少分号：${this.peek}`, this.t[this.i].p);
    }
    return { k: "program", a, complex };
  }
  expr(min = 0): Expr {
    let a: Expr;
    const t = this.take();
    if (t.kind === "n") a = { k: "value", v: Number(t.s) };
    else if (t.kind === "s") a = { k: "value", v: t.s };
    else if (t.s === "(") {
      a = this.expr();
      this.take(")");
    } else if (t.s === "{") {
      a = this.program("}");
      this.take("}");
    } else if (["!", "-", "+"].includes(t.s))
      a = { k: "unary", op: t.s, a: this.expr(10) };
    else if (t.kind === "id") a = { k: "id", name: t.s };
    else throw new MolangError(`无效表达式 ${t.s}`, t.p);
    while (true) {
      if (this.peek === "(") {
        this.take();
        const args = [];
        while (String(this.peek) !== ")") {
          args.push(this.expr());
          if (String(this.peek) !== ",") break;
          this.take();
        }
        this.take(")");
        a = { k: "call", a, args };
        continue;
      }
      if (this.peek === "[") {
        this.take();
        const index = this.expr();
        this.take("]");
        a = { k: "index", a, index };
        continue;
      }
      if (this.peek === "?" && min <= 2) {
        this.take();
        const yes = this.expr();
        let no: Expr = { k: "value", v: 0 };
        if (String(this.peek) === ":") {
          this.take();
          no = this.expr(2);
        }
        a = { k: "ternary", a, yes, no };
        continue;
      }
      const op = this.peek,
        p = precedence[op];
      if (p === undefined || p < min) break;
      this.take();
      const b = this.expr(p + (op === "=" ? 0 : 1));
      a = { k: op === "=" ? "assign" : "binary", op, a, b };
    }
    return a;
  }
}
const cache = new Map<string, Expr>();
export function parseMolang(s: string | number): Expr {
  if (typeof s === "number") return { k: "value", v: s };
  if (cache.has(s)) return cache.get(s);
  if (s.length > 65536) throw new MolangError("表达式超过 64 KiB");
  const p = new Parser(tokenize(s)),
    e = p.program();
  if (cache.size > 10000) cache.clear();
  cache.set(s, e);
  return e;
}
export type MolangContext = {
  variables: Record<string, any>;
  queries: Record<string, any>;
  context?: Record<string, any>;
  thisValue?: number;
  temp?: Record<string, any>;
  seed?: number;
  budget?: number;
  onWrite?: (name: string, value: any) => void;
  onMissing?: (name: string) => void;
};
function name(n: string) {
  return n
    .replace(/^variable\./, "v.")
    .replace(/^query\./, "q.")
    .replace(/^temp\./, "t.")
    .replace(/^context\./, "c.");
}
class Flow {
  constructor(
    public kind: string,
    public value: any = 0,
  ) {}
}
export function evaluateMolang(
  input: Expr | string | number,
  ctx: MolangContext,
): any {
  const ast =
    typeof input === "string" || typeof input === "number"
      ? parseMolang(input)
      : input;
  let steps = ctx.budget ?? 20000;
  const temp = ctx.temp ?? Object.create(null);
  const read = (raw: string): any => {
    const n = name(raw);
    if (n === "this") return ctx.thisValue ?? 0;
    if (n === "math.pi") return Math.PI;
    if (n === "true") return 1;
    if (n === "false") return 0;
    const scope = n.slice(0, 2),
      key = n.slice(2);
    if (scope === "v.") return ctx.variables[key];
    if (scope === "t.") return temp[key];
    if (scope === "c.") return ctx.context?.[key];
    if (scope === "q.") {
      if (Object.hasOwn(ctx.queries, key)) return ctx.queries[key];
      ctx.onMissing?.(n);
      return undefined;
    }
    throw new MolangError(`未知标识符 ${raw}`);
  };
  const write = (raw: string, value: any) => {
    const n = name(raw),
      key = n.slice(2);
    if (n.startsWith("v.")) {
      ctx.variables[key] = value;
      ctx.onWrite?.(n, value);
      return value;
    }
    if (n.startsWith("t.")) {
      temp[key] = value;
      return value;
    }
    throw new MolangError(`不可写入 ${raw}`);
  };
  const num = (v: any) => (typeof v === "number" ? v : Number(v ?? 0));
  const rad = (x: number) => (x * Math.PI) / 180,
    deg = (x: number) => (x * 180) / Math.PI;
  const clamp = (v: number, a: number, b: number) =>
    Math.max(a, Math.min(b, v));
  const random = () => {
    ctx.seed = ((ctx.seed ?? 123456789) * 1664525 + 1013904223) >>> 0;
    return ctx.seed / 4294967296;
  };
  const math: Record<string, (...v: number[]) => number> = {
    abs: Math.abs,
    acos: (x) => deg(Math.acos(x)),
    asin: (x) => deg(Math.asin(x)),
    atan: (x) => deg(Math.atan(x)),
    atan2: (y, x) => deg(Math.atan2(y, x)),
    ceil: Math.ceil,
    clamp,
    cos: (x) => Math.cos(rad(x)),
    sin: (x) => Math.sin(rad(x)),
    exp: Math.exp,
    floor: Math.floor,
    ln: Math.log,
    max: Math.max,
    min: Math.min,
    mod: (a, b) => (b === 0 ? 0 : a % b),
    pow: Math.pow,
    round: Math.round,
    sqrt: (x) => Math.sqrt(Math.max(0, x)),
    trunc: Math.trunc,
    lerp: (a, b, t) => a + (b - a) * t,
    lerprotate: (a, b, t) =>
      a + (((((b - a + 180) % 360) + 360) % 360) - 180) * t,
    min_angle: (x) => ((((x + 180) % 360) + 360) % 360) - 180,
    random: (a, b) => a + random() * (b - a),
    random_integer: (a, b) => Math.floor(a + random() * (b - a + 1)),
    die_roll: (n, a, b) => {
      let s = 0;
      for (let i = 0; i < clamp(n, 0, 1024); i++) s += a + random() * (b - a);
      return s;
    },
    die_roll_integer: (n, a, b) => {
      let s = 0;
      for (let i = 0; i < clamp(n, 0, 1024); i++)
        s += Math.floor(a + random() * (b - a + 1));
      return s;
    },
    hermite_blend: (x) => 3 * x * x - 2 * x * x * x,
  };
  function run(e: Expr): any {
    if (--steps < 0) throw new MolangError("Molang 指令预算耗尽");
    switch (e.k) {
      case "value":
        return e.v;
      case "id":
        return read(e.name);
      case "assign": {
        if (e.a.k !== "id") throw new MolangError("当前运行时不支持此赋值目标");
        return write(e.a.name, run(e.b));
      }
      case "unary": {
        const v = num(run(e.a));
        return e.op === "!" ? (v ? 0 : 1) : e.op === "-" ? -v : v;
      }
      case "ternary":
        return run(num(run(e.a)) ? e.yes : e.no);
      case "binary": {
        const a = run(e.a);
        if (e.op === "??") return a === undefined || a === null ? run(e.b) : a;
        if (e.op === "&&") return num(a) ? (num(run(e.b)) ? 1 : 0) : 0;
        if (e.op === "||") return num(a) ? 1 : num(run(e.b)) ? 1 : 0;
        const b = run(e.b),
          x = num(a),
          y = num(b);
        switch (e.op) {
          case "+":
            return x + y;
          case "-":
            return x - y;
          case "*":
            return x * y;
          case "/":
            return y === 0 ? 0 : x / y;
          case "%":
            return y === 0 ? 0 : x % y;
          case "==":
            return a === b ? 1 : 0;
          case "!=":
            return a !== b ? 1 : 0;
          case "<":
            return x < y ? 1 : 0;
          case ">":
            return x > y ? 1 : 0;
          case "<=":
            return x <= y ? 1 : 0;
          case ">=":
            return x >= y ? 1 : 0;
        }
        break;
      }
      case "program": {
        let last = 0;
        for (const a of e.a) last = run(a);
        return e.complex ? 0 : last;
      }
      case "return":
        throw new Flow("return", run(e.a));
      case "break":
      case "continue":
        throw new Flow(e.k);
      case "index": {
        const a = run(e.a),
          i = Math.max(0, Math.trunc(num(run(e.index))));
        return Array.isArray(a) ? a[i % Math.max(1, a.length)] : undefined;
      }
      case "call": {
        if (e.a.k !== "id") throw new MolangError("无效调用");
        const n = name(e.a.name);
        if (n === "loop") {
          const count = Math.trunc(num(run(e.args[0])));
          if (count > 1024) throw new MolangError("loop 超过 1024 次");
          for (let i = 0; i < count; i++) {
            try {
              run(e.args[1]);
            } catch (f) {
              if (f instanceof Flow && f.kind === "break") break;
              if (f instanceof Flow && f.kind === "continue") continue;
              throw f;
            }
          }
          return 0;
        }
        if (n === "for_each")
          throw new MolangError("for_each 实体引用迭代尚未实现");
        const args = e.args.map(run);
        if (n === "math.pi") return Math.PI;
        if (n.startsWith("math.")) {
          const fn = math[n.slice(5)];
          if (!fn) throw new MolangError(`未实现数学函数 ${n}`);
          return fn(...args.map(num));
        }
        if (n.startsWith("q.")) {
          const key = n.slice(2),
            q = ctx.queries[key];
          if (q !== undefined) return typeof q === "function" ? q(...args) : q;
          ctx.onMissing?.(n);
          return 0;
        }
        throw new MolangError(`未实现函数 ${n}`);
      }
    }
    throw new MolangError(`未实现表达式 ${e.k}`);
  }
  try {
    const v = run(ast);
    return v ?? 0;
  } catch (e) {
    if (e instanceof Flow && e.kind === "return") return e.value ?? 0;
    throw e;
  }
}
export function molangDependencies(input: string): {
  variables: string[];
  queries: string[];
} {
  const vars = new Set<string>(),
    queries = new Set<string>();
  for (const t of tokenize(input)) {
    if (t.kind === "id") {
      const n = name(t.s);
      if (n.startsWith("v.")) vars.add(n);
      if (n.startsWith("q.")) queries.add(n);
    }
  }
  return { variables: [...vars], queries: [...queries] };
}
