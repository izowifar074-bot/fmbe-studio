export type V3 = [number, number, number];
export type Mat = number[];
export const add = (a: V3, b: V3): V3 => [
  a[0] + b[0],
  a[1] + b[1],
  a[2] + b[2],
];
export const sub = (a: V3, b: V3): V3 => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2],
];
export const mulv = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a: V3) => Math.hypot(...a);
export const norm = (a: V3): V3 => {
  const l = len(a);
  if (l < 1e-12) throw new Error("零长度方向");
  return mulv(a, 1 / l);
};
export const ident = (): Mat => [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
];
export function mm(a: Mat, b: Mat): Mat {
  const c = Array(16).fill(0);
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++)
      for (let k = 0; k < 4; k++) c[j * 4 + i] += a[k * 4 + i] * b[j * 4 + k];
  return c;
}
export const translation = (p: V3): Mat => [
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  ...p,
  1,
];
export const scale = (p: V3): Mat => [
  p[0],
  0,
  0,
  0,
  0,
  p[1],
  0,
  0,
  0,
  0,
  p[2],
  0,
  0,
  0,
  0,
  1,
];
export function rot(a: V3): Mat {
  const [x, y, z] = a.map((v) => (v * Math.PI) / 180),
    cx = Math.cos(x),
    sx = Math.sin(x),
    cy = Math.cos(y),
    sy = Math.sin(y),
    cz = Math.cos(z),
    sz = Math.sin(z);
  return [
    cz * cy,
    sz * cy,
    -sy,
    0,
    cz * sy * sx - sz * cx,
    sz * sy * sx + cz * cx,
    cy * sx,
    0,
    cz * sy * cx + sz * sx,
    sz * sy * cx - cz * sx,
    cy * cx,
    0,
    0,
    0,
    0,
    1,
  ];
}
export function euler(m: Mat): V3 {
  const y = Math.asin(Math.max(-1, Math.min(1, -m[2])));
  let x, z;
  if (Math.abs(Math.cos(y)) > 1e-7) {
    x = Math.atan2(m[6], m[10]);
    z = Math.atan2(m[1], m[0]);
  } else {
    x = Math.atan2(-m[9], m[5]);
    z = 0;
  }
  return [x, y, z].map((v) => (v * 180) / Math.PI) as V3;
}
export const trs = (p: V3, r: V3, s: V3 = [1, 1, 1]) =>
  mm(translation(p), mm(rot(r), scale(s)));
export const point = (m: Mat, p: V3): V3 => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];
export const direction = (m: Mat, p: V3): V3 =>
  sub(point(m, p), point(m, [0, 0, 0]));
export function inverse(m: Mat): Mat {
  const a = Array.from({ length: 4 }, (_, r) => [
    ...Array.from({ length: 4 }, (_, c) => m[c * 4 + r]),
    ...Array.from({ length: 4 }, (_, c) => (r === c ? 1 : 0)),
  ]);
  for (let i = 0; i < 4; i++) {
    let p = i;
    for (let j = i + 1; j < 4; j++)
      if (Math.abs(a[j][i]) > Math.abs(a[p][i])) p = j;
    if (Math.abs(a[p][i]) < 1e-14) throw new Error("不可逆变换");
    [a[i], a[p]] = [a[p], a[i]];
    const v = a[i][i];
    a[i] = a[i].map((x) => x / v);
    for (let j = 0; j < 4; j++)
      if (j !== i) {
        const v = a[j][i];
        a[j] = a[j].map((x, k) => x - v * a[i][k]);
      }
  }
  return Array.from({ length: 16 }, (_, i) => a[i % 4][4 + Math.floor(i / 4)]);
}
export function beam(
  a: V3,
  b: V3,
  section: [number, number],
  up: V3 = [0, 1, 0],
): { matrix: Mat; size: V3; fallback: boolean } {
  const z = norm(sub(b, a));
  let x = cross(up, z),
    fallback = false;
  if (len(x) < 1e-7) {
    fallback = true;
    const axis: V3 = Math.abs(z[0]) < 0.8 ? [1, 0, 0] : [0, 0, 1];
    x = cross(axis, z);
  }
  x = norm(x);
  const y = norm(cross(z, x));
  const p = mulv(add(a, b), 0.5);
  return {
    matrix: [...x, 0, ...y, 0, ...z, 0, ...p, 1],
    size: [section[0], section[1], len(sub(b, a))],
    fallback,
  };
}
export function bounds(m: Mat, size: V3) {
  let min: V3 = [Infinity, Infinity, Infinity],
    max: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 8; i++) {
    const p = point(
      m,
      size.map((v, j) => v * ((i >> j) & 1 ? 0.5 : -0.5)) as V3,
    );
    min = min.map((v, j) => Math.min(v, p[j])) as V3;
    max = max.map((v, j) => Math.max(v, p[j])) as V3;
  }
  return { min, max };
}
export const distance = (a: V3, b: V3) => len(sub(a, b));
export function finite(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isFinite(v))
    throw new Error(`${label} 必须是有限数字`);
  return v;
}
export function vec(v: any, fallback: V3 = [0, 0, 0]): V3 {
  if (v === undefined) return [...fallback];
  if (!Array.isArray(v) || v.length !== 3)
    throw new Error("向量必须包含 3 个数字");
  return v.map((x, i) => finite(x, `向量 ${i}`)) as V3;
}
