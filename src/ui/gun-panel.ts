type Host = {
  getState: () => any;
  post: (url: string, body?: any) => Promise<any>;
  api: (url: string) => Promise<any>;
  context: (s: any) => void;
  frame: (r: any) => void;
  tab: (name: string) => void;
  toast: (s: string, error?: boolean) => void;
};
export function installGunPanel(host: Host) {
  const button = document.createElement("button");
  button.dataset.tab = "gun";
  button.textContent = "枪械";
  document.querySelector(".inspector-tabs")!.prepend(button);
  button.onclick = () => host.tab("gun");
  const panel = document.createElement("section");
  panel.id = "tab-gun";
  panel.className = "tab-panel";
  panel.hidden = true;
  panel.innerHTML = `<div class="panel-title"><span class="eyebrow">FIREARM WORKSHOP</span><h2>制作一把游戏枪械</h2><p>提示词自动触发 fmbe-guns 技能。造型交给模型，命令、身份和动作链由编译器生成。</p></div>
 <div class="gun-reference"><strong>AK47 · 75 狐狸参考</strong><small>当前存档 124 块 · 含换弹与弹药<br>root 补偿与单驱动保持原文</small><button id="gun-load-reference" class="outline">载入完整参考模型</button></div>
 <label class="field-label" for="gun-prompt">创作提示词</label><textarea id="gun-prompt" rows="5" spellcheck="false" placeholder="制作一把 M4A1 风格的枪械，保留护圈、瞄具、弹匣与拉柄，使用黑灰材质…">制作一把 M4A1 风格的枪械，建模细节接近 AK47 参考，使用黑灰材质，包含独立弹匣和拉柄，支持换弹。</textarea>
 <div class="field"><label for="gun-budget">狐狸上限</label><input id="gun-budget" type="number" min="16" max="125" value="85"></div>
 <div class="gun-actions"><button id="gun-generate" class="primary">生成模型与命令</button><button id="gun-cancel" class="outline" disabled>取消</button></div>
 <label class="field-label" for="gun-history">生成历史</label><select id="gun-history" aria-label="生成历史"><option value="">尚无记录</option></select>
 <div id="gun-job" class="gun-job"><small>尚无生成任务。现有工程会保留撤销版本。</small></div><button id="gun-apply-candidate" class="outline" hidden>载入此模型</button>
 <div class="gun-pose"><h3>动作预览</h3><div class="gun-pose-buttons"><button data-gun-action="normal">常态</button><button data-gun-action="run">跑动</button><button data-gun-action="aim">机瞄</button><button data-gun-action="reload">换弹</button><button data-gun-action="fire">开火状态</button></div><p id="gun-gameplay">先载入枪械工程。</p><small class="note">动作按钮发送短状态信号；点击底部播放查看过渡。换弹按钮只触发视觉；空仓才启动65tick补弹链。此处不模拟世界射线伤害。</small></div>
 <details class="gun-provider" open><summary>DeepSeek 连接</summary><p>官方地址 · deepseek-flash</p><label class="field-label" for="deepseek-key">临时 API 密钥</label><input id="deepseek-key" type="password" autocomplete="off" spellcheck="false" placeholder="仅保存在本机进程内存"><div class="gun-actions"><button id="model-save" class="outline">使用临时密钥</button><button id="model-test" class="outline">测试连接</button></div><small id="model-state">正在读取状态…</small><button id="model-clear" class="subtle">清除会话密钥</button></details>
 <small class="note">生成最多 7 轮模型调用。预览生成和模型收到预览分别记录。新结果仍需网易实测，不因参考存档成功就标记全部兼容。</small>`;
  document.querySelector(".inspector")!.append(panel);
  const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  let jobId = "",
    poll: any;
  let jobs: any[] = [];
  async function history(preferredId = jobId) {
    const h = await host.api("/api/agent/history");
    jobs = h.jobs ?? [];
    const select = $<HTMLSelectElement>("gun-history");
    select.replaceChildren();
    for (const j of jobs) {
      const option = document.createElement("option");
      option.value = j.id;
      option.textContent = `${j.result?.name ?? j.prompt.slice(0, 30)} · ${j.status}`;
      select.append(option);
    }
    jobId = jobs.some((j) => j.id === preferredId)
      ? preferredId
      : (jobs[0]?.id ?? "");
    select.value = jobId;
    const job = jobs.find((j) => j.id === jobId);
    if (job) paintJob(job);
    $<HTMLButtonElement>("gun-generate").disabled = jobs.some(
      (j) => j.status === "running",
    );
  }
  $("gun-history").onchange = () => {
    jobId = $<HTMLSelectElement>("gun-history").value;
    const j = jobs.find((j) => j.id === jobId);
    if (j) {
      paintJob(j);
      $<HTMLTextAreaElement>("gun-prompt").value = j.prompt;
    }
  };
  const run = async (fn: () => Promise<any>) => {
    try {
      return await fn();
    } catch (e: any) {
      host.toast(e.message, true);
      return null;
    }
  };
  async function status() {
    const s = await host.api("/api/model/status");
    $("model-state").textContent = s.configured
      ? "已配置 · 仅进程内存保存"
      : "未配置 · 密钥不会保存到工程或磁盘";
  }
  $("model-save").onclick = () =>
    run(async () => {
      const input = $<HTMLInputElement>("deepseek-key"),
        key = input.value;
      input.value = "";
      await host.post("/api/model/config", { apiKey: key });
      await status();
      host.toast("临时密钥已载入本机内存");
    });
  $("model-clear").onclick = () =>
    run(async () => {
      await host.post("/api/model/config", { clear: true });
      await status();
    });
  $("model-test").onclick = () =>
    run(async () => {
      $("model-state").textContent = "正在测试官方 API…";
      const s = await host.post("/api/model/test");
      $("model-state").textContent =
        `连接成功 · ${s.model} · ${s.usage?.total_tokens ?? 0} tokens`;
    });
  $("gun-load-reference").onclick = () =>
    run(async () => {
      const s = await host.post("/api/gun/reference/load", {
        base_revision: host.getState().project.revision,
      });
      host.context(s);
      host.tab("gun");
      host.toast("已载入 75 实体参考，原工程可撤销恢复");
    });
  function paintJob(j: any) {
    $("gun-job").replaceChildren();
    const title = document.createElement("strong");
    title.textContent =
      j.status === "completed"
        ? "模型与命令已生成"
        : j.status === "failed"
          ? "生成未完成"
          : j.status === "ready"
            ? "候选已就绪"
            : j.status === "cancelled"
              ? "生成已取消"
              : "正在生成…";
    $("gun-job").append(title);
    for (const event of j.events.slice(-8)) {
      const line = document.createElement("div");
      line.textContent = event.message;
      $("gun-job").append(line);
    }
    const usage = document.createElement("small");
    usage.textContent = `${j.usage.length} 次调用 · ${j.usage.reduce((n: number, u: any) => n + (u?.total_tokens ?? 0), 0).toLocaleString()} tokens`;
    $("gun-job").append(usage);
    if (j.error) {
      const error = document.createElement("p");
      error.textContent = j.error;
      $("gun-job").append(error);
    }
    if (j.result) {
      const info = document.createElement("p");
      info.textContent = `${j.result.name} · ${j.result.entities} 只狐狸 · root 原文保留`;
      $("gun-job").append(info);
    }
    $<HTMLButtonElement>("gun-cancel").disabled = j.status !== "running";
    $("gun-apply-candidate").hidden =
      !j.result?.exportReady || j.status === "running";
    if (j.status !== "running") {
      $<HTMLButtonElement>("gun-generate").disabled = false;
      clearInterval(poll);
      if (j.status === "completed") host.api("/api/context").then(host.context);
    }
  }
  $("gun-generate").onclick = () =>
    run(async () => {
      const prompt = $<HTMLTextAreaElement>("gun-prompt").value,
        budget = Number($<HTMLInputElement>("gun-budget").value);
      const j = await host.post("/api/agent/run", {
        prompt,
        budget,
        base_revision: host.getState().project.revision,
      });
      jobId = j.id;
      await history(jobId);
      $<HTMLButtonElement>("gun-generate").disabled = true;
      paintJob(j);
      clearInterval(poll);
      poll = setInterval(
        () =>
          host
            .api(`/api/agent/job?id=${encodeURIComponent(jobId)}`)
            .then(paintJob)
            .catch(() => {}),
        1500,
      );
    });
  $("gun-cancel").onclick = () =>
    run(async () =>
      paintJob(await host.post("/api/agent/cancel", { id: jobId })),
    );
  $("gun-apply-candidate").onclick = () =>
    run(async () => {
      host.context(
        await host.post("/api/agent/apply", {
          id: jobId,
          base_revision: host.getState().project.revision,
        }),
      );
      $("gun-apply-candidate").hidden = true;
    });
  panel.querySelectorAll<HTMLButtonElement>("[data-gun-action]").forEach(
    (b) =>
      (b.onclick = () =>
        run(async () => {
          const r = await host.post("/api/gun/action", {
            action: b.dataset.gunAction,
          });
          host.frame(r);
          $("gun-gameplay").textContent =
            `弹药 ${r.state.ammo}/30 · ${r.state.reloadTicks ? "换弹锁定" : "可用"} · 姿态 ${r.state.pose}`;
        })),
  );
  void status();
  void history().catch(() => {});
  let historyRefresh: any;
  return {
    jobEvent: (msg: any) => {
      clearTimeout(historyRefresh);
      historyRefresh = setTimeout(
        () =>
          history(msg.event?.stage === "skill_loaded" ? msg.id : jobId).catch(
            () => {},
          ),
        120,
      );
    },
    update: (s: any) => {
      if (s.gunState)
        $("gun-gameplay").textContent =
          `弹药 ${s.gunState.ammo}/30 · ${s.gunState.reloadTicks ? "换弹锁定" : "可用"} · ${s.gunState.pose}`;
    },
  };
}
