import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { normalizeResources } from "../src/core/runtime.js";
import { makeCompilerContext } from "../src/core/compiler.js";
test("agent retains valid candidates on provider failure and delivers a late candidate preview before completion", async () => {
  const app = fileURLToPath(new URL("..", import.meta.url)),
    read = async (p: string) =>
      JSON.parse(
        (await fs.readFile(path.join(app, p), "utf8")).replace(/^\uFEFF/, ""),
      );
  const ctx = makeCompilerContext(
    normalizeResources(await read("assets/bedrock-1.21.120.4.json")),
    await read("assets/community-recipes.json"),
  );
  const ref = "assets/gun-mode/reference/",
    gc = {
      world: await read(ref + "world-commands.json"),
      chains: await read(ref + "chain-groups.json"),
      model: await read(ref + "ak47-model.json"),
      calibration: await read(ref + "provisional-held-transform.json"),
      sourceHash: "test",
    };
  const folder = path.resolve(app, "../../work/checks/agent-failure");
  await fs.mkdir(folder, { recursive: true });
  const outfile = path.join(folder, "agent.mjs");
  await build({
    entryPoints: [path.join(app, "src/server/gun-agent.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile,
    plugins: [
      {
        name: "offline-provider",
        setup(b) {
          b.onResolve({ filter: /^\.\/deepseek\.js$/ }, () => ({
            path: "test-provider",
            namespace: "test",
          }));
          b.onLoad({ filter: /.*/, namespace: "test" }, () => ({
            loader: "js",
            contents:
              "export const modelStatus=()=>({configured:true});export const redact=s=>s;export async function deepseekChat(){const x=globalThis.__gunTestQueue.shift();if(x.error)throw new Error(x.error);return x;}",
          }));
        },
      },
    ],
  });
  const source =
    'for(let i=0;i<16;i++)box("p"+i,{size:[0.05,0.05,0.05],position:[i*0.05,0,0],material:"black",motionGroup:i===0?"magazine":"static"});';
  (globalThis as any).__gunTestQueue = [
    {
      choices: [
        {
          message: {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: "submit",
                type: "function",
                function: {
                  name: "gun_submit",
                  arguments: JSON.stringify({
                    name: "离线测试枪械",
                    source,
                    notes: "test",
                  }),
                },
              },
            ],
          },
        },
      ],
      usage: { total_tokens: 0 },
    },
    { error: "simulated provider failure" },
  ];
  const { GunAgent } = await import(pathToFileURL(outfile).href);
  let accepted = 0;
  const agent = new GunAgent(path.join(app, "assets"), ctx, gc, {
    current: () => ({ revision: 1 }),
    accept: async () => accepted++,
    event: () => {},
    persist: async () => {},
  });
  const job = agent.start("制作一把游戏枪械", 80, 1);
  for (let i = 0; i < 500 && job.status === "running"; i++)
    await new Promise((r) => setTimeout(r, 10));
  assert.equal(job.status, "ready");
  assert.equal(accepted, 0);
  assert.ok(job.result.exportReady);
  assert.ok(agent.getCandidate(job.id).compilation.exportable);
  const submit = {
    choices: [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "late-submit",
              type: "function",
              function: {
                name: "gun_submit",
                arguments: JSON.stringify({
                  name: "晚轮次候选",
                  source,
                  notes: "test",
                }),
              },
            },
          ],
        },
      },
    ],
    usage: { total_tokens: 0 },
  };
  const prose = {
    choices: [{ message: { role: "assistant", content: "continue" } }],
    usage: { total_tokens: 0 },
  };
  (globalThis as any).__gunTestQueue = [
    prose,
    prose,
    prose,
    prose,
    submit,
    prose,
  ];
  const reviewAgent = new GunAgent(path.join(app, "assets"), ctx, gc, {
    current: () => ({ revision: 1 }),
    accept: async () => accepted++,
    event: () => {},
    persist: async () => {},
    capture: async () => "data:image/png;base64,offline-preview-fixture",
  });
  const reviewed = reviewAgent.start("制作一把游戏枪械", 80, 1);
  for (let i = 0; i < 500 && reviewed.status === "running"; i++)
    await new Promise((r) => setTimeout(r, 10));
  assert.equal(reviewed.status, "completed");
  assert.equal(reviewed.usage.length, 6);
  assert.equal(reviewed.preview.captured, 1);
  assert.equal(reviewed.preview.delivered, 1);
  assert.equal(reviewed.result.previewDelivered, true);
  assert.ok(
    reviewed.events.findIndex((e: any) => e.stage === "preview_ready") <
      reviewed.events.findIndex((e: any) => e.stage === "preview_delivered"),
  );
  delete (globalThis as any).__gunTestQueue;
});
