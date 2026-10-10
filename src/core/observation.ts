import { point, sub, dot, cross, norm, type V3 } from "./math.js";
import type { Frame } from "./runtime.js";
import { MATERIALS } from "./types.js";
export function observeGeometry(frame: Frame, width = 1024, height = 768) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 64 ||
    width > 4096 ||
    height < 64 ||
    height > 4096
  )
    throw new Error("观察尺寸范围 64～4096");
  const c = frame.camera,
    p = (c.rotation[0] * Math.PI) / 180,
    y = (c.rotation[1] * Math.PI) / 180,
    forward: V3 = [
      -Math.sin(y) * Math.cos(p),
      -Math.sin(p),
      Math.cos(y) * Math.cos(p),
    ];
  const right: V3 = [-Math.cos(y), 0, -Math.sin(y)],
    up = norm(cross(right, forward)),
    t = Math.tan((c.fov * Math.PI) / 360),
    aspect = width / height;
  return {
    frame: frame.frame,
    time: frame.time,
    width,
    height,
    camera: c,
    visibilityModel:
      "geometric projection only; no Bedrock entity tracking/culling",
    unsupportedItems: frame.entities
      .filter(
        (e) =>
          e.item && !Object.values(MATERIALS).some((m) => m.item === e.item),
      )
      .map((e) => ({
        id: e.id,
        item: e.item,
        reason: "No supported item geometry",
      })),
    entities: frame.entities
      .filter(
        (e) =>
          e.item && Object.values(MATERIALS).some((m) => m.item === e.item),
      )
      .map((e) => {
        const corners = Array.from({ length: 8 }, (_, i) =>
          point(e.itemMatrix, [
            i & 1 ? 0.5 : -0.5,
            i & 2 ? 0.5 : -0.5,
            i & 4 ? 0.5 : -0.5,
          ]),
        );
        const projected = corners.map((v) => {
          const d = sub(v, c.position),
            depth = dot(d, forward);
          return {
            x:
              depth > 0
                ? width * (0.5 + dot(d, right) / (2 * depth * t * aspect))
                : null,
            y: depth > 0 ? height * (0.5 - dot(d, up) / (2 * depth * t)) : null,
            depth,
          };
        });
        const visible = projected.filter(
            (p) => p.depth > 0.015 && p.x !== null && p.y !== null,
          ),
          min: V3 = [0, 1, 2].map((i) =>
            Math.min(...corners.map((v) => v[i])),
          ) as V3,
          max: V3 = [0, 1, 2].map((i) =>
            Math.max(...corners.map((v) => v[i])),
          ) as V3;
        return {
          id: e.id,
          name: e.name,
          tags: e.tags,
          item: e.item,
          worldCorners: corners,
          worldBounds: { min, max },
          projectedCorners: projected,
          screenBounds: visible.length
            ? {
                minX: Math.min(...visible.map((p) => p.x!)),
                maxX: Math.max(...visible.map((p) => p.x!)),
                minY: Math.min(...visible.map((p) => p.y!)),
                maxY: Math.max(...visible.map((p) => p.y!)),
              }
            : null,
          crossesNearPlane:
            projected.some((p) => p.depth <= 0.015) &&
            projected.some((p) => p.depth > 0.015),
        };
      }),
  };
}
