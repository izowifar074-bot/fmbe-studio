import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { deepseekChat, modelStatus, redact } from "./deepseek.js";
import {
  compileGun,
  referenceGunSource,
  GUN_PROFILE,
  GUN_SOURCE_HASH,
  isGunPrompt,
  type GunContext,
} from "../core/gun.js";
import { hashText, type CompilerContext } from "../core/compiler.js";
import type { Project, Compilation } from "../core/types.js";
export type GunJob = {
  id: string;
  status: "running" | "completed" | "failed" | "cancelled" | "ready";
  prompt: string;
  model: string;
  baseRevision: number;
  events: any[];
  usage: any[];
  error?: string;
  result?: any;
  preview?: { captured: number; delivered: number; sourceHash?: string };
};
type Candidate = { project: Project; compilation: Compilation };
export class GunAgent {
  jobs = new Map<string, GunJob>();
  private candidates = new Map<string, Candidate>();
  private controllers = new Map<string, AbortController>();
  constructor(
    private assets: string,
    private ctx: CompilerContext,
    private gc: GunContext,
    private callbacks: {
      current: () => Project;
      accept: (p: Project, revision: number) => Promise<void>;
      event: (j: GunJob) => void;
      capture?: (c: Compilation) => Promise<string | null>;
      persist: (j: GunJob, c?: Candidate) => Promise<void>;
    },
  ) {}
  private event(job: GunJob, stage: string, message: string, detail?: any) {
    job.events.push({
      at: new Date().toISOString(),
      stage,
      message: redact(message),
      detail,
    });
    this.callbacks.event(job);
  }
  get(id: string) {
    const j = this.jobs.get(id);
    if (!j) throw new Error("任务不存在");
    return j;
  }
  getCandidate(id: string) {
    const c = this.candidates.get(id);
    if (!c) throw new Error("任务尚无成功候选");
    return c;
  }
  restoreRecord(job: GunJob, project?: Project) {
    // v0.2 used "observed" when a PNG had only been queued locally. Keep
    // historical events but correct the claim instead of inventing receipt.
    for (const event of job.events)
      if (event.stage === "preview_observed") {
        event.stage = "preview_ready_legacy";
        event.message = "旧版记录：预览图已生成；该事件本身不证明模型收到图片";
      }
    if (job.status === "running") {
      job.status = "failed";
      job.error = "服务重启中断了此任务；可重新发起。";
    }
    this.jobs.set(job.id, job);
    if (project?.gun) {
      const compilation = compileGun(project, this.ctx, this.gc);
      if (compilation.exportable)
        this.candidates.set(job.id, { project, compilation });
    }
  }
  cancel(id: string) {
    this.controllers.get(id)?.abort();
    const j = this.get(id);
    j.status = "cancelled";
    this.event(j, "cancelled", "任务已取消");
    return j;
  }
  async reference(section = "overview") {
    const dir = path.join(this.assets, "gun-mode/skills/fmbe-guns");
    if (section === "model")
      return {
        partCount: 75,
        source: referenceGunSource(this.gc),
        purpose: "参考复杂度和接口；按请求的枪型重新组织外形，不要只改标题",
      };
    if (section === "overview")
      return {
        skill: "fmbe-guns",
        worldBlocks: 124,
        sourceHash: GUN_SOURCE_HASH,
        parts: 75,
        groups: {
          receiver: 12,
          stock: 7,
          gripAndGuard: 9,
          magazine: 24,
          handguard: 6,
          barrelAndGasTube: 8,
          sights: 9,
        },
        current: [
          "normal/run/aim",
          "C23 reload",
          "ammo/fire/reload",
          "M1 root sampler",
        ],
        coordinates: "X forward, Y up, Z side; blocks and degrees",
        referenceEvidence:
          "source extraction + user-provided baseline; no new NetEase validation",
      };
    if (!["geometry", "runtime", "evidence"].includes(section))
      throw new Error("section: overview/model/geometry/runtime/evidence");
    return {
      section,
      text: await fs.readFile(
        path.join(dir, "references", `${section}.md`),
        "utf8",
      ),
    };
  }
  start(prompt: string, budget: number, baseRevision: number) {
    if (!isGunPrompt(prompt))
      throw new Error("当前自动技能针对“制作…枪械/步枪/手枪”等游戏建模请求");
    if (!modelStatus().configured)
      throw new Error("请先配置本机临时 DeepSeek 密钥");
    if (prompt.length > 5000) throw new Error("提示词最多 5000 字符");
    if (!Number.isInteger(budget) || budget < 16 || budget > 125)
      throw new Error("枪械实体预算范围 16～125");
    if ([...this.jobs.values()].some((j) => j.status === "running"))
      throw new Error("已有生成任务正在运行");
    const job: GunJob = {
      id: randomUUID(),
      status: "running",
      prompt: redact(prompt),
      model: "deepseek-flash",
      baseRevision,
      events: [],
      usage: [],
    };
    this.jobs.set(job.id, job);
    const ac = new AbortController();
    this.controllers.set(job.id, ac);
    void this.run(job, budget, ac.signal);
    return job;
  }
  private async run(job: GunJob, budget: number, signal: AbortSignal) {
    try {
      const skill = await fs.readFile(
        path.join(this.assets, "gun-mode/skills/fmbe-guns/SKILL.md"),
        "utf8",
      );
      const geometry = (await this.reference("geometry")).text;
      this.event(job, "skill_loaded", "已自动加载 fmbe-guns 技能与几何接口", {
        skill: "fmbe-guns",
        baselineBlocks: 124,
      });
      const messages: any[] = [
        {
          role: "system",
          content: `你是 FMBE Studio 的游戏像素造型代理。只制作 Minecraft 中的视觉模型和虚拟玩法。用户已经要求直接完成构建。你必须调用 gun_submit 交付可运行的造型源码。不要输出真实制造数据。\n${skill}\n${geometry}\n当前硬实体预算=${budget}，最多7轮模型调用，其中保留后续轮次接收预览反馈。成功提交且下一轮收到预览后，如果没有明确缺陷应直接结束，不做无目的反复重写。普通步枪应尽量达到参考AK47的结构与细节层次，优先约55～${budget}个可实现实体；小型手枪可更少。source的每个box需要稳定id、中文name、material、正确motionGroup。不得调用不存在的SDK。无需编写底层命令，软件会从最新基线编译。先调用gun_reference读取需要的资料，再提交设计；编译失败可根据工具反馈修复。拿到成功提交后可以评估返回的预览图并做一次有理由的修改。不要声称新作品已在网易测试。`,
        },
        { role: "user", content: job.prompt },
      ];
      const tools = [
        {
          type: "function",
          function: {
            name: "gun_reference",
            description:
              "Read authoritative overview, geometry SDK, runtime invariants, evidence, or full AK47 reference model. Call before first design.",
            parameters: {
              type: "object",
              properties: {
                section: {
                  type: "string",
                  enum: [
                    "overview",
                    "geometry",
                    "runtime",
                    "evidence",
                    "model",
                  ],
                },
              },
              required: ["section"],
              additionalProperties: false,
            },
          },
        },
        {
          type: "function",
          function: {
            name: "gun_submit",
            description:
              "Submit complete JavaScript SDK source. The local compiler builds actual FMBE commands, checks entity budget and motion groups, and returns diagnostics. Successful designs are candidates, not game-tested claims.",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string" },
                source: { type: "string" },
                notes: { type: "string" },
              },
              required: ["name", "source", "notes"],
              additionalProperties: false,
            },
          },
        },
      ];
      let accepted: Candidate | undefined;
      let pendingPreviewHash = "";
      for (let round = 0; round < 7; round++) {
        if (signal.aborted) throw new Error("任务已取消");
        this.event(
          job,
          "model_call",
          `DeepSeek 正在设计 / 修正（第 ${round + 1} 轮）`,
        );
        const response = await deepseekChat(messages, {
          tools,
          maxTokens: 18000,
          thinking: true,
          signal,
        });
        job.usage.push(response.usage);
        if (pendingPreviewHash) {
          job.preview ??= { captured: 0, delivered: 0 };
          job.preview.delivered++;
          job.preview.sourceHash = pendingPreviewHash;
          this.event(
            job,
            "preview_delivered",
            "预览图已随本轮请求送达模型，收到模型响应",
            { sourceHash: pendingPreviewHash },
          );
          pendingPreviewHash = "";
        }
        const message = response.choices[0].message;
        messages.push(message);
        if (!message.tool_calls?.length) {
          if (accepted) break;
          messages.push({
            role: "user",
            content: "请直接调用 gun_submit 提交完整 source，不要只给解释。",
          });
          continue;
        }
        for (const call of message.tool_calls) {
          let result: any;
          try {
            const args = JSON.parse(call.function.arguments);
            if (call.function.name === "gun_reference") {
              result = await this.reference(args.section);
              this.event(
                job,
                "reference_read",
                `模型读取资料：${args.section}`,
              );
            } else if (call.function.name === "gun_submit") {
              if (
                typeof args.source !== "string" ||
                args.source.length > 131072 ||
                typeof args.name !== "string"
              )
                throw new Error("source/name 类型或长度无效");
              const id = `gun-${job.id}`,
                p: Project = {
                  schemaVersion: 1,
                  id,
                  name: redact(args.name).slice(0, 100),
                  revision: job.baseRevision + 1,
                  profile: GUN_PROFILE,
                  source: args.source,
                  params: {},
                  overrides: {},
                  budget,
                  camera: {
                    mode: "first_person",
                    position: [0, 1.62, 0],
                    rotation: [0, 0],
                    fov: 70,
                  },
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  gun: {
                    mode: "firearm",
                    reload: true,
                    namespace: `g${hashText(id).slice(0, 6)}`,
                    baselineHash: GUN_SOURCE_HASH,
                  },
                };
              this.event(job, "compiling", "编译几何、重建狐狸编号与换弹绑定");
              const c = compileGun(p, this.ctx, this.gc);
              const errors = c.diagnostics.filter(
                (d) => d.severity === "error",
              );
              if (!c.exportable) {
                result = {
                  ok: false,
                  errors: errors.length ? errors : c.diagnostics,
                  entityCount: c.entityCount,
                  budget,
                  expensiveParts: c.design.parts
                    .map((p) => ({
                      id: p.id,
                      name: p.name,
                      size: p.size,
                      entities: c.gun.primitives.filter(
                        (x: any) => x.partId === p.id,
                      ).length,
                    }))
                    .sort((a, b) => b.entities - a.entities)
                    .slice(0, 12),
                  advice:
                    "修复后重新提交完整 source。矩形截面分解会增加狐狸数，优先使用两个相等尺寸的杆/压缩方块。",
                };
                this.event(
                  job,
                  "validation_failed",
                  errors.map((d) => d.message).join("；"),
                );
              } else {
                accepted = { project: p, compilation: c };
                this.candidates.set(job.id, accepted);
                result = {
                  ok: true,
                  name: p.name,
                  parts: c.design.parts.length,
                  entities: c.entityCount,
                  budget,
                  magazineParts: c.gun.magazineIds.length,
                  boltParts: c.gun.boltIds.length,
                  rootPreserved: c.gun.rootPreserved,
                  commandBlocks: c.gun.sections.reduce(
                    (s: number, x: any) => s + x.items.length,
                    0,
                  ),
                  warnings: c.diagnostics.filter(
                    (d) => d.severity === "warning",
                  ),
                  notes: redact(String(args.notes ?? "")),
                  evidence:
                    "compiled from current source, not newly game-tested",
                };
                this.event(
                  job,
                  "candidate_ready",
                  `候选已通过编译：${c.entityCount} 只狐狸`,
                  { entities: c.entityCount, parts: c.design.parts.length },
                );
                if (this.callbacks.capture) {
                  try {
                    const png = await this.callbacks.capture(c);
                    if (png) {
                      job.preview ??= { captured: 0, delivered: 0 };
                      job.preview.captured++;
                      pendingPreviewHash = hashText(p.source);
                      result = {
                        content: [
                          { type: "text", text: JSON.stringify(result) },
                          {
                            type: "image_url",
                            image_url: { url: png, detail: "high" },
                          },
                        ],
                      };
                      this.event(
                        job,
                        "preview_ready",
                        "实际命令预览图已生成，等待下一轮模型请求",
                      );
                    }
                  } catch (e: any) {
                    this.event(
                      job,
                      "preview_unavailable",
                      "截图不可用，继续使用结构化检查",
                    );
                  }
                }
              }
            } else throw new Error("未知工具");
          } catch (e: any) {
            result = { ok: false, error: redact(e.message) };
          }
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            content: result?.content ?? JSON.stringify(result),
          });
        }
      }
      if (!accepted)
        throw new Error(
          "在本次7轮调用预算内没有得到通过编译的设计；错误和调用统计已保留",
        );
      if (signal.aborted) throw new Error("任务已取消");
      try {
        if (pendingPreviewHash) throw new Error("preview_pending");
        await this.callbacks.accept(accepted.project, job.baseRevision);
        job.status = "completed";
        this.event(job, "completed", "枪械已生成并载入，命令包已准备好");
      } catch (e: any) {
        job.status = "ready";
        this.event(
          job,
          "ready",
          pendingPreviewHash
            ? "候选已生成，但本次调用额度内尚未送达最终预览；保留候选等待检查"
            : "候选已生成；当前工程修订发生变化，保留候选等待载入",
        );
      }
      job.result = {
        name: accepted.project.name,
        entities: accepted.compilation.entityCount,
        parts: accepted.compilation.design.parts.length,
        rootPreserved: accepted.compilation.gun.rootPreserved,
        source: accepted.project.source,
        exportReady: true,
        previewDelivered:
          job.preview?.sourceHash === hashText(accepted.project.source),
      };
      await this.callbacks.persist(job, accepted);
    } catch (e: any) {
      const previous = this.candidates.get(job.id);
      job.status = signal.aborted ? "cancelled" : previous ? "ready" : "failed";
      job.error = redact(e.message);
      if (previous) {
        job.result = {
          name: previous.project.name,
          entities: previous.compilation.entityCount,
          parts: previous.compilation.design.parts.length,
          rootPreserved: previous.compilation.gun.rootPreserved,
          source: previous.project.source,
          exportReady: true,
        };
      }
      this.event(
        job,
        job.status,
        previous
          ? "后续调用未完成，已保留之前通过验证的候选。" + job.error
          : job.error,
      );
      await this.callbacks.persist(job, previous);
    } finally {
      this.controllers.delete(job.id);
    }
  }
}
