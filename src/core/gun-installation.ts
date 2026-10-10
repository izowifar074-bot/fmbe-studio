import { Runtime, commandTokens, type Entity } from "./runtime.js";
import type { Compilation, Diagnostic, ResourcePack } from "./types.js";
import type { V3 } from "./math.js";

// A deliberately bounded construction checker: the exported, widely spaced
// spawn lattice has no ambiguous hitbox boundaries. This is not world physics.
class ConstructionRuntime extends Runtime {
  override select(target: string, self?: Entity): Entity[] {
    const match = /^(@e)\[(.*)\]$/.exec(target);
    if (!match) return super.select(target, self);
    const pairs = match[2].split(","),
      spatial: Record<string, number> = {};
    const filters = pairs.filter((pair) => {
      const [key, value] = pair.split("=");
      if (!["x", "y", "z", "dx", "dy", "dz"].includes(key)) return true;
      const n = Number(value);
      if (!Number.isFinite(n))
        throw new Error(`Invalid construction volume ${pair}`);
      spatial[key] = n;
      return false;
    });
    const entities = super.select(`@e[${filters.join(",")}]`, self);
    if (!["dx", "dy", "dz"].some((k) => k in spatial)) return entities;
    return entities.filter((e) =>
      ["x", "y", "z"].every((axis, i) => {
        const start = spatial[axis] ?? 0,
          extent = spatial["d" + axis] ?? 0;
        return (
          e.position[i] >= start + Math.min(0, extent) &&
          e.position[i] < start + Math.max(0, extent) + 1
        );
      }),
    );
  }
  override execute(
    source: string,
    self?: Entity,
    origin?: V3,
    depth = 0,
  ): { ok: boolean; affected: number; error?: string } {
    const tokens = commandTokens(source);
    if (tokens[0] === "execute" && tokens[1] === "at" && tokens[3] === "run") {
      let affected = 0;
      // Snapshot the selection before spawning, as execute branches must not
      // recurse into entities created by the same command.
      for (const e of this.select(tokens[2], self).slice()) {
        const result = this.execute(
          source.slice(source.indexOf(" run ") + 5),
          self,
          e.position,
          depth + 1,
        );
        if (!result.ok) return result;
        affected += result.affected;
      }
      return { ok: true, affected };
    }
    return super.execute(source, self, origin, depth);
  }
}

export function replayGunConstruction(c: Compilation, resources: ResourcePack) {
  const r = new ConstructionRuntime(resources);
  const diagnostics: Diagnostic[] = [];
  const rows: {
    label: string;
    affected: number;
    skipped?: boolean;
    deferred?: boolean;
    error?: string;
  }[] = [];
  const setup = c.gun.sections.find((s: any) => s.purpose === "G10");
  let previousSucceeded = true;
  const fail = (message: string) =>
    diagnostics.push({ severity: "error", code: "GUN_CONSTRUCTION", message });
  if (!setup) fail("导出包缺少狐狸构建链 G10");
  for (const item of setup?.items ?? []) {
    if (item.block?.conditional && !previousSucceeded) {
      rows.push({ label: item.label, affected: 0, skipped: true });
      fail(`构建条件链在 ${item.label} 被前一条失败截断`);
      continue;
    }
    // The sole final camera follow is evaluated by GunRuntime's explicit
    // timing model; construction replay doesn't invent a loaded player.
    if (
      /^execute as @a\[.*\] at @s anchored eyes positioned \^ \^ \^2 run tp @e\[.*\] ~ ~ ~ 0 0$/.test(
        item.cmd,
      )
    ) {
      rows.push({ label: item.label, affected: 0, deferred: true });
      if (item !== setup.items.at(-1))
        fail("相机跟随必须位于构建和标签赋值之后");
      continue;
    }
    const result = r.execute(item.cmd);
    rows.push({
      label: item.label,
      affected: result.affected,
      ...(!result.ok ? { error: result.error } : {}),
    });
    previousSucceeded = result.ok && result.affected > 0;
    if (!result.ok) fail(`${item.label}: ${result.error}`);
  }
  const ns = c.gun.namespace;
  const decode = (e: Entity) => {
    const digits = ["x", "z", "y"].map((axis) => {
      const tags = e.tags.filter((t) => t.startsWith(ns + axis));
      if (
        tags.length !== 1 ||
        !/^[0-4]$/.test(tags[0].slice((ns + axis).length))
      ) {
        fail(`${e.id} 缺少或重复 ${axis} 身份标签`);
        return -1;
      }
      return Number(tags[0].slice((ns + axis).length));
    });
    return digits[0] + 5 * digits[1] + 25 * digits[2];
  };
  const identities = r.entities
    .map((e) => ({ e, id: decode(e) }))
    .sort((a, b) => a.id - b.id);
  if (identities.length !== c.entityCount)
    fail(`命令实际召唤 ${identities.length} 只，编译预算计数 ${c.entityCount}`);
  for (let i = 0; i < identities.length; i++) {
    const { e, id } = identities[i],
      primitive = c.gun.primitives[i];
    if (id !== i) fail(`实际狐狸身份 ${id} 与连续编号 ${i} 不符`);
    if (e.name !== ns + "f" || !e.tags.includes(ns + "f"))
      fail(`${e.id} 缺少所属枪械身份`);
    if (primitive && e.item !== primitive.item)
      fail(
        `部件 ${primitive.partId} 实际持物 ${e.item} 与 ${primitive.item} 不符`,
      );
  }
  return {
    entities: identities.map((x) => x.e),
    diagnostics,
    report: {
      passed: diagnostics.length === 0,
      foxes: identities.length,
      rows,
      scope:
        "实际 G10 召唤/材质/空间标签命令重放；按分离网格检查实体原点，不模拟物理/加载/剔除；最终跟随由独立时序模型处理",
    },
  };
}
