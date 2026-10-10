import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { installGunPanel } from "./gun-panel.js";
import type { Frame } from "../core/runtime.js";
import type { Part } from "../core/types.js";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const escape = (s: any) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
let gunPanel: ReturnType<typeof installGunPanel> | undefined;
let state: any,
  geometry: any,
  examples: any[],
  selected = "",
  draft = false,
  playing = false,
  busy = false,
  checkpoint = "",
  playerView = false,
  animationTimer: any;
const post = (url: string, b: any = {}) =>
  api(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });
async function api(url: string, opts?: RequestInit) {
  const r = await fetch(url, opts),
    j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}
function toast(message: string, error = false) {
  const el = $("toast");
  el.textContent = message;
  el.classList.toggle("error", error);
  el.hidden = false;
  clearTimeout((toast as any).timer);
  (toast as any).timer = setTimeout(
    () => (el.hidden = true),
    error ? 8000 : 3500,
  );
}
async function action(fn: () => Promise<any>, label = "正在计算…") {
  if (busy) return;
  busy = true;
  document.body.classList.add("busy");
  $("connection").textContent = label;
  try {
    return await fn();
  } catch (e: any) {
    toast(e.message, true);
    $("status-message").textContent = e.message;
    return null;
  } finally {
    busy = false;
    document.body.classList.remove("busy");
    $("connection").textContent = "本地内核在线";
  }
}
function tab(name: string) {
  document
    .querySelectorAll<HTMLButtonElement>("[data-tab]")
    .forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  document
    .querySelectorAll<HTMLElement>(".tab-panel")
    .forEach((p) => (p.hidden = p.id !== `tab-${name}`));
}
document
  .querySelectorAll<HTMLButtonElement>("[data-tab]")
  .forEach((b) => (b.onclick = () => tab(b.dataset.tab!)));
function download(name: string, data: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([data], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function modal(title: string, html: string) {
  $("modal-title").textContent = title;
  $("modal-body").innerHTML = html;
  $<HTMLDialogElement>("modal").showModal();
}
$("modal-close").onclick = () => $<HTMLDialogElement>("modal").close();

// The renderer consumes command-runtime matrices only. Reference geometry is a separate wire layer.
const scene = new THREE.Scene();
scene.background = new THREE.Color("#ffffff");
scene.fog = new THREE.Fog("#ffffff", 25, 70);
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$("canvas-host").appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(45, 1, 0.015, 300);
camera.position.set(8, 6, -9);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0.5, 1.7, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
const gameCamera = new THREE.PerspectiveCamera(70, 1, 0.015, 300);
scene.add(new THREE.HemisphereLight(0xc8e9f2, 0x566859, 2));
const sun = new THREE.DirectionalLight(0xffeee0, 3);
sun.position.set(7, 12, -5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -15;
sun.shadow.camera.right = 15;
sun.shadow.camera.top = 15;
sun.shadow.camera.bottom = -15;
sun.shadow.bias = -0.0003;
scene.add(sun);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(200, 200),
  new THREE.ShadowMaterial({ color: "#71808a", opacity: 0.12 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.025;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(40, 40, "#c9d1d8", "#e9edf0");
grid.position.y = -0.019;
scene.add(grid);
const origin = new THREE.AxesHelper(0.65);
origin.position.y = 0.02;
scene.add(origin);
const itemGroup = new THREE.Group(),
  foxGroup = new THREE.Group(),
  referenceGroup = new THREE.Group();
scene.add(itemGroup, foxGroup, referenceGroup);
const materials = new Map<string, THREE.MeshStandardMaterial>();
const texturePaths: Record<string, string> = {
  "minecraft:gray_concrete": "concrete_gray",
  "minecraft:acacia_planks": "planks_acacia",
  "minecraft:stone": "stone",
  "minecraft:iron_block": "iron_block",
  "minecraft:black_concrete": "concrete_black",
  "minecraft:white_concrete": "concrete_white",
  "minecraft:copper_block": "copper_block",
  "minecraft:oak_planks": "planks_oak",
  "minecraft:red_concrete": "concrete_red",
  "minecraft:blue_concrete": "concrete_blue",
  "minecraft:cyan_concrete": "concrete_cyan",
  "minecraft:gold_block": "gold_block",
};
const loader = new THREE.TextureLoader();
function texture(url: string) {
  const t = loader.load(
    url,
    () => renderOnce(),
    undefined,
    () => {},
  );
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
for (const [id, p] of Object.entries(texturePaths))
  materials.set(
    id,
    new THREE.MeshStandardMaterial({
      map: texture(`/assets/textures/blocks/${p}.png`),
      roughness: 0.9,
      metalness: 0,
    }),
  );
const foxTexture = texture("/assets/textures/entity/fox/fox.png");
const foxMaterial = new THREE.MeshStandardMaterial({
  map: foxTexture,
  roughness: 1,
  transparent: true,
  opacity: 1,
  alphaTest: 0.1,
});
const foxGhost = new THREE.MeshStandardMaterial({
  color: "#82b9a7",
  wireframe: true,
  transparent: true,
  opacity: 0.23,
  depthWrite: false,
});
const playerMaterial = new THREE.MeshStandardMaterial({
  color: "#7d9bb3",
  roughness: 1,
});
const cube = new THREE.BoxGeometry(1, 1, 1),
  edge = new THREE.EdgesGeometry(cube);
const boneMaterial = new THREE.LineBasicMaterial({
    color: "#c69553",
    transparent: true,
    opacity: 0.7,
  }),
  referenceMaterial = new THREE.LineBasicMaterial({
    color: "#ae90db",
    transparent: true,
    opacity: 0.65,
    depthTest: false,
  });
let selectionOutline: THREE.Box3Helper | null = null;
const dynamicGeometries: THREE.BufferGeometry[] = [];
function clearGroup(g: THREE.Group) {
  g.clear();
}
function foxCubeUV(c: any, g: any): THREE.BoxGeometry {
  const size = c.size ?? [0, 0, 0],
    b = new THREE.BoxGeometry(...(size as [number, number, number]));
  if (!Array.isArray(c.uv)) return b;
  const [u, v] = c.uv,
    [x, y, z] = size,
    tw = g.description.texture_width ?? 64,
    th = g.description.texture_height ?? 32;
  const rects = [
    [u + z + x, v + z, z, y],
    [u, v + z, z, y],
    [u + z, v, x, z],
    [u + z + x, v, x, z],
    [u + z, v + z, x, y],
    [u + 2 * z + x, v + z, x, y],
  ];
  const uv = b.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const [a, d, w, h] = rects[f];
    uv.setXY(f * 4, a / tw, 1 - d / th);
    uv.setXY(f * 4 + 1, (a + w) / tw, 1 - d / th);
    uv.setXY(f * 4 + 2, a / tw, 1 - (d + h) / th);
    uv.setXY(f * 4 + 3, (a + w) / tw, 1 - (d + h) / th);
  }
  return b;
}
function drawFrame(frame: Frame, diagnosticLayers = true) {
  if (!geometry) return;
  for (const g of dynamicGeometries) g.dispose();
  dynamicGeometries.length = 0;
  clearGroup(itemGroup);
  clearGroup(foxGroup);
  clearGroup(referenceGroup);
  const showFox = diagnosticLayers && $<HTMLInputElement>("show-fox").checked,
    showReference =
      diagnosticLayers && $<HTMLInputElement>("show-reference").checked;
  const partTags = new Map(
    state?.compilation.recipes.map((r: any) => [r.entityId, r.partId]) ?? [],
  );
  for (const [entityIndex, e] of frame.entities.entries()) {
    const partId =
      state?.compilation?.gun?.primitives?.[entityIndex]?.partId ??
      e.tags.map((t) => partTags.get(t)).find(Boolean) ??
      e.id;
    if (e.item && materials.has(e.item)) {
      const mesh = new THREE.Mesh(cube, materials.get(e.item));
      mesh.matrixAutoUpdate = false;
      mesh.matrix.fromArray(e.itemMatrix);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { id: partId, entity: e.id };
      itemGroup.add(mesh);
    }
    if (!e.invisible || showFox) {
      const g = e.type === "minecraft:fox" ? geometry.fox : geometry.player;
      if (g)
        for (const bone of g.bones) {
          if (bone.name === "head_sleeping") continue;
          const bp = e.bones[bone.name];
          if (!bp) continue;
          for (const c of bone.cubes ?? []) {
            if (c.size.some((s: number) => s <= 0)) continue;
            const geom = foxCubeUV(c, g);
            dynamicGeometries.push(geom);
            const mesh = new THREE.Mesh(
              geom,
              e.invisible
                ? foxGhost
                : e.type === "minecraft:fox"
                  ? foxMaterial
                  : playerMaterial,
            );
            mesh.matrixAutoUpdate = false;
            const pivot = bone.pivot ?? [0, 0, 0];
            const centre = c.origin.map(
              (v: number, i: number) => v + c.size[i] / 2 - pivot[i],
            );
            const local = new THREE.Matrix4().makeTranslation(
              ...(centre as [number, number, number]),
            );
            mesh.matrix.fromArray(bp.matrix).multiply(local);
            mesh.userData = { id: partId, entity: e.id };
            mesh.castShadow = !e.invisible;
            foxGroup.add(mesh);
          }
        }
      if (showFox) {
        const positions: number[] = [];
        for (const bone of g?.bones ?? []) {
          const a = e.bones[bone.name],
            b = e.bones[bone.parent];
          if (a && b)
            positions.push(
              a.matrix[12],
              a.matrix[13],
              a.matrix[14],
              b.matrix[12],
              b.matrix[13],
              b.matrix[14],
            );
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(positions, 3),
        );
        dynamicGeometries.push(geom);
        foxGroup.add(new THREE.LineSegments(geom, boneMaterial));
      }
    }
  }
  if (showReference && state?.mode !== "experiment")
    for (const p of state.compilation.design.parts) {
      const wire = new THREE.LineSegments(edge, referenceMaterial);
      wire.matrixAutoUpdate = false;
      wire.matrix.fromArray(p.matrix).scale(new THREE.Vector3(...p.size));
      referenceGroup.add(wire);
    }
  const c = frame.camera;
  gameCamera.fov = c.fov;
  const eye = new THREE.Vector3(...c.position),
    pitch = THREE.MathUtils.degToRad(c.rotation[0]),
    yaw = THREE.MathUtils.degToRad(c.rotation[1]),
    forward = new THREE.Vector3(
      -Math.sin(yaw) * Math.cos(pitch),
      -Math.sin(pitch),
      Math.cos(yaw) * Math.cos(pitch),
    );
  gameCamera.position.copy(eye);
  gameCamera.lookAt(gameCamera.position.clone().add(forward));
  gameCamera.updateProjectionMatrix();
  $("time").textContent =
    `${String(Math.floor(frame.time / 60)).padStart(2, "0")}:${(frame.time % 60).toFixed(3).padStart(6, "0")}`;
  $("frame-info").textContent = `帧 ${frame.frame} · tick ${frame.tick}`;
  $("timeline-progress").style.left = `${(frame.time % 10) * 10}%`;
  updateSelectionOutline();
  $("empty-state").hidden = frame.entities.length > 0;
  renderOnce();
}
function renderOnce() {
  renderer.render(scene, playerView ? gameCamera : camera);
}
function resize() {
  const host = $("canvas-host"),
    w = host.clientWidth,
    h = host.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  gameCamera.aspect = w / h;
  camera.updateProjectionMatrix();
  gameCamera.updateProjectionMatrix();
  renderOnce();
}
new ResizeObserver(resize).observe($("canvas-host"));
function updateSelectionOutline() {
  if (selectionOutline) {
    scene.remove(selectionOutline);
    selectionOutline.geometry.dispose();
    selectionOutline = null;
  }
  if (!selected) return;
  const box = new THREE.Box3();
  for (const obj of [...itemGroup.children, ...foxGroup.children])
    if (obj.userData.id === selected) {
      obj.updateMatrixWorld(true);
      box.expandByObject(obj);
    }
  if (!box.isEmpty()) {
    selectionOutline = new THREE.Box3Helper(box, 0x9df5cd);
    scene.add(selectionOutline);
  }
}
function fit() {
  const box = new THREE.Box3().setFromObject(itemGroup);
  if (box.isEmpty()) box.setFromObject(foxGroup);
  if (box.isEmpty()) return;
  const centre = box.getCenter(new THREE.Vector3()),
    size = box.getSize(new THREE.Vector3()),
    radius = Math.max(size.x, size.y, size.z, state?.project.gun ? 0.05 : 1);
  controls.target.copy(centre);
  camera.position
    .copy(centre)
    .add(
      (state?.project.gun
        ? new THREE.Vector3(1.5, 0.45, -0.6)
        : new THREE.Vector3(1.3, 0.9, -1.5)
      ).multiplyScalar(radius),
    );
  camera.fov = state?.project.gun ? 38 : 45;
  camera.near = 0.015;
  camera.far = Math.max(300, radius * 20);
  camera.updateProjectionMatrix();
  controls.update();
}
let pointerStart = [0, 0];
renderer.domElement.addEventListener(
  "pointerdown",
  (e) => (pointerStart = [e.clientX, e.clientY]),
);
renderer.domElement.addEventListener("pointerup", (e) => {
  if (Math.hypot(e.clientX - pointerStart[0], e.clientY - pointerStart[1]) > 4)
    return;
  const r = renderer.domElement.getBoundingClientRect(),
    ray = new THREE.Raycaster();
  ray.setFromCamera(
    new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      (-(e.clientY - r.top) / r.height) * 2 + 1,
    ),
    playerView ? gameCamera : camera,
  );
  const hit = ray
    .intersectObjects([...itemGroup.children, ...foxGroup.children], false)
    .find((h) => h.object.userData.id);
  if (hit) select(hit.object.userData.id);
});
let previous = 0;
function animate(t: number) {
  requestAnimationFrame(animate);
  if (t - previous < 30) return;
  previous = t;
  controls.enabled = !playerView;
  controls.update();
  renderOnce();
  $("performance").textContent =
    `${renderer.info.render.calls} 次绘制 · ${renderer.info.render.triangles.toLocaleString()} 三角面`;
}
requestAnimationFrame(animate);

function paint(s: any, fitView = false) {
  state = s;
  gunPanel?.update(s);
  $<HTMLInputElement>("show-reference").disabled = Boolean(s.project.gun);
  if (s.project.gun) $<HTMLInputElement>("show-reference").checked = false;
  const actualCount =
    s.mode === "experiment" ? s.frame.entityCount : s.compilation.entityCount;
  $("project-name").textContent = s.project.name;
  $("revision").textContent = `修订 ${s.project.revision}`;
  $("budget-ratio").textContent = `${actualCount} / ${s.project.budget}`;
  $<HTMLInputElement>("budget").value = s.project.budget;
  $("budget-bar").style.width =
    `${Math.min(100, (actualCount / s.project.budget) * 100)}%`;
  $("budget-bar").style.background =
    actualCount <= s.project.budget ? "var(--accent)" : "var(--error)";
  $("part-count").textContent =
    s.mode === "experiment"
      ? `${actualCount} 个实验实体`
      : `${s.compilation.design.parts.length} 个设计部件`;
  $<HTMLButtonElement>("undo").disabled = s.undoCount < 1;
  $<HTMLButtonElement>("redo").disabled = s.redoCount < 1;
  $<HTMLButtonElement>("export").disabled =
    s.mode !== "experiment" && !s.compilation.exportable;
  $("export").innerHTML =
    s.mode === "experiment"
      ? "导出实验记录 <span>↗</span>"
      : "导出实验包 <span>↗</span>";
  if (!draft) $<HTMLTextAreaElement>("source").value = s.project.source;
  $("api-example").textContent = JSON.stringify(
    {
      base_revision: s.project.revision,
      request_id: "edit-001",
      patch: {
        params: {
          [s.compilation.design.parameters[0]?.name ?? "height"]:
            s.compilation.design.parameters[0]?.value ?? 3.5,
        },
      },
    },
    null,
    2,
  );
  $("view-label").textContent =
    s.mode === "experiment" ? "原生命令实验" : "命令仿真结果";
  $("status-message").textContent =
    s.mode === "experiment"
      ? `${actualCount} 个实验实体 · 当前命令会话可单独导出 · 作者工程保留`
      : `${s.compilation.entityCount} 只狐狸 · ${s.compilation.init.filter((x: string) => !x.startsWith("#")).length} 条初始化命令 · 自动保存于本机`;
  paintTree();
  paintParams();
  paintSelection();
  paintDiagnostics();
  drawFrame(s.frame);
  if (fitView) fit();
  const cp = $("camera-position").querySelectorAll<HTMLInputElement>("input"),
    cr = $("camera-rotation").querySelectorAll<HTMLInputElement>("input");
  s.project.camera.position.forEach(
    (v: number, i: number) => (cp[i].value = String(v)),
  );
  s.project.camera.rotation.forEach(
    (v: number, i: number) => (cr[i].value = String(v)),
  );
  $<HTMLInputElement>("camera-fov").value = String(s.project.camera.fov);
  $<HTMLSelectElement>("camera-mode").value = s.project.camera.mode;
}
function paintTree() {
  const filter = $<HTMLInputElement>("tree-filter").value.toLowerCase();
  const parts =
    state.mode === "experiment"
      ? state.frame.entities.map((e: any) => ({
          id: e.id,
          name: e.name || e.id,
          kind: e.type,
          cost: 1,
        }))
      : state.compilation.design.parts.map((p: Part) => ({
          ...p,
          cost: state.compilation.recipes.filter((r: any) => r.partId === p.id)
            .length,
        }));
  $("tree-count").textContent = String(parts.length);
  $("tree").innerHTML = parts
    .filter((p: any) => `${p.id} ${p.name}`.toLowerCase().includes(filter))
    .map(
      (p: any) =>
        `<button class="tree-row ${p.id === selected ? "selected" : ""}" data-part="${escape(p.id)}"><span class="tree-icon">${p.kind === "beam" ? "╱" : p.kind === "arc" ? "⌒" : "◇"}</span><span class="tree-name">${escape(p.name)}</span><span class="tree-cost">${p.cost} 狐狸</span></button>`,
    )
    .join("");
  $("tree")
    .querySelectorAll<HTMLButtonElement>("[data-part]")
    .forEach((b) => (b.onclick = () => select(b.dataset.part!)));
}
function paintParams() {
  const params = state.compilation.design.parameters;
  $("parameters").innerHTML = params.length
    ? params
        .map(
          (p: any) =>
            `<div class="parameter"><div class="parameter-top"><label>${escape(p.label)}</label><input type="number" value="${p.value}" min="${p.min}" max="${p.max}" step="${p.step}" data-param="${escape(p.name)}" aria-label="${escape(p.label)}"></div><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.value}" data-range="${escape(p.name)}" aria-label="${escape(p.label)} 滑块"><div class="parameter-range"><span>${p.min}</span><span>${p.max}</span></div><div class="parameter-name">${escape(p.name)}</div></div>`,
        )
        .join("")
    : '<p class="muted">在源码中使用 param() 暴露可编辑参数。</p>';
  $("parameters")
    .querySelectorAll<HTMLInputElement>("[data-param]")
    .forEach(
      (i) =>
        (i.onchange = () =>
          change({ params: { [i.dataset.param!]: Number(i.value) } })),
    );
  $("parameters")
    .querySelectorAll<HTMLInputElement>("[data-range]")
    .forEach((i) => {
      i.oninput = () => {
        const n = $("parameters").querySelector<HTMLInputElement>(
          `[data-param="${i.dataset.range}"]`,
        );
        if (n) n.value = i.value;
      };
      i.onchange = () =>
        change({ params: { [i.dataset.range!]: Number(i.value) } });
    });
}
function paintDiagnostics() {
  const list = [...state.compilation.diagnostics, ...state.frame.diagnostics];
  $("diagnostics-count").textContent = String(list.length);
  $("verification-state").textContent = list.some(
    (x: any) => x.severity === "error",
  )
    ? "存在未通过项"
    : "数值仿真 · 网易待校准";
  $("diagnostics").innerHTML = list
    .map(
      (d: any) =>
        `<div class="diagnostic ${d.severity}"><span class="level">${d.severity === "error" ? "错误" : d.severity === "warning" ? "待验证" : "信息"}</span><span>${escape(d.message)}${d.line ? ` · 第 ${d.line} 行` : ""}</span></div>`,
    )
    .join("");
}
function paintSelection() {
  const p = state.compilation.design.parts.find((p: Part) => p.id === selected);
  if (!p) {
    $("selection").innerHTML = "";
    return;
  }
  $("selection").innerHTML =
    `<div class="selection-card"><h3>◇ ${escape(p.name)}</h3><p>来源：build.js 第 ${p.sourceLine} 行 · ${state.compilation.recipes.filter((r: any) => r.partId === p.id).length} 只狐狸</p><label class="field-label">尺寸 X / Y / Z · 格</label><div class="vector-fields" id="part-size">${p.size.map((v: number) => `<input type="number" value="${Number(v.toFixed(5))}" min="0.001" step="0.05">`).join("")}</div><label class="field-label">世界位置 X / Y / Z</label><div class="vector-fields" id="part-position">${p.matrix
      .slice(12, 15)
      .map(
        (v: number) =>
          `<input type="number" value="${Number(v.toFixed(5))}" step="0.1">`,
      )
      .join(
        "",
      )}</div><button class="outline" id="part-apply">保存此部件的局部覆盖</button><button class="outline" id="part-clear">清除此部件覆盖</button><small class="note">覆盖只作用于当前部件，可能解除生成关系；连接约束仍在编译时执行。</small></div>`;
  $("part-apply").onclick = () => {
    const size = [
        ...$("part-size").querySelectorAll<HTMLInputElement>("input"),
      ].map((i) => Number(i.value)),
      position = [
        ...$("part-position").querySelectorAll<HTMLInputElement>("input"),
      ].map((i) => Number(i.value));
    change({ overrides: { [selected]: { size, position } } });
  };
  $("part-clear").onclick = () => change({ overrides: { [selected]: null } });
}
async function select(id: string) {
  selected = id;
  paintTree();
  paintSelection();
  updateSelectionOutline();
  try {
    const j = await api(`/api/inspect?id=${encodeURIComponent(id)}`);
    $("inspect-content").innerHTML = j.part
      ? `<h3>${escape(j.part.name)}</h3><p>来源第 ${j.part.sourceLine} 行 · ${j.recipes.length} 个实体</p><details open><summary>尺寸、位置与包围盒</summary><pre>${escape(JSON.stringify({ size: j.part.size, bounds: j.bounds, motionGroup: j.part.motionGroup }, null, 2))}</pre></details><details><summary>实际动画命令</summary><pre>${escape(j.recipes.map((r: any) => r.commands.join("\n")).join("\n\n"))}</pre></details><details><summary>目标矩阵与翻译残差</summary><pre>${escape(
          JSON.stringify(
            j.recipes.map((r: any) => ({
              entity: r.entityId,
              residual: r.residual,
              matrix: r.targetMatrix,
            })),
            null,
            2,
          ),
        )}</pre></details>`
      : `<h3>${escape(j.entity.name || j.entity.id)}</h3><details open><summary>Molang 变量</summary><pre>${escape(JSON.stringify(j.entity.variables, null, 2))}</pre></details><details open><summary>控制器</summary><pre>${escape(JSON.stringify(j.frame?.controllers, null, 2))}</pre></details><details><summary>骨骼与挂点矩阵</summary><pre>${escape(JSON.stringify(j.frame?.bones, null, 2))}</pre></details><details><summary>本帧变量写入</summary><pre>${escape(JSON.stringify(j.trace, null, 2))}</pre></details>`;
  } catch (e: any) {
    toast(e.message, true);
  }
}
async function change(patch: any) {
  await action(async () => {
    const s = await post("/api/design/apply", {
      base_revision: state.project.revision,
      request_id: crypto.randomUUID(),
      patch,
    });
    draft = false;
    paint(s);
    $("source-status").textContent = "已编译并自动保存";
  }, "编译与命令重放…");
}
async function refresh(fitView = false) {
  paint(await api("/api/context"), fitView);
}
$("tree-filter").oninput = paintTree;
$<HTMLTextAreaElement>("source").oninput = () => {
  draft = true;
  $("source-status").textContent = "有未编译修改";
};
$<HTMLTextAreaElement>("source").onkeydown = (e) => {
  if (e.key === "Tab") {
    e.preventDefault();
    const t = e.currentTarget as HTMLTextAreaElement;
    t.setRangeText("  ", t.selectionStart, t.selectionEnd, "end");
    draft = true;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    $("build").click();
  }
};
$("build").onclick = () =>
  change({ source: $<HTMLTextAreaElement>("source").value });
$("budget").onchange = () =>
  change({ budget: Number($<HTMLInputElement>("budget").value) });
$("load-example").onclick = () =>
  action(async () => {
    playing = false;
    $("play").textContent = "▶";
    const s = await post("/api/project/new", {
      base_revision: state.project.revision,
      example: $<HTMLSelectElement>("examples").value,
    });
    draft = false;
    selected = "";
    paint(s, true);
    toast("已载入示例；可用撤销返回之前的工程");
  });
$("undo").onclick = () =>
  action(async () => {
    const s = await post("/api/project/undo", {
      base_revision: state.project.revision,
    });
    draft = false;
    paint(s);
  });
$("redo").onclick = () =>
  action(async () => {
    const s = await post("/api/project/redo", {
      base_revision: state.project.revision,
    });
    draft = false;
    paint(s);
  });
$("save").onclick = () =>
  download(
    "fmbe-project.json",
    JSON.stringify(state.project, null, 2),
    "application/json",
  );
$("import").onclick = () => $<HTMLInputElement>("file-input").click();
$<HTMLInputElement>("file-input").onchange = (e) =>
  action(async () => {
    const input = e.target as HTMLInputElement,
      file = input.files?.[0];
    if (!file) return;
    const s = await post("/api/project/import", {
      base_revision: state.project.revision,
      project: JSON.parse(await file.text()),
    });
    draft = false;
    paint(s, true);
    input.value = "";
  });
$("export").onclick = () => {
  if (state.project.gun && state.mode !== "experiment") {
    modal(
      "导出枪械纯命令包",
      `<p>${escape(state.project.name)} · ${state.compilation.entityCount} 只狐狸。</p><p>包含数字 mccmd:1 格式、完整命令、独立初始化与换弹/弹药链，保留 root 原文。不会转换为行为包或 /function。</p><p>当前预览属于源码几何对照，本轮未重新进行网易实机安装验证。</p><a class="link-button outline" href="/api/export.zip?experimental=true">下载枪械命令 ZIP ↗</a>`,
    );
    return;
  }
  if (state.mode === "experiment") {
    action(async () => {
      const record = await api("/api/experiment/recording");
      download(
        "fmbe-command-recording.json",
        JSON.stringify(record, null, 2),
        "application/json",
      );
      toast("已保存命令时间记录、运行快照和能力边界");
    });
    return;
  }
  modal(
    "导出实验包",
    `<p>这份作品包含 <strong>${state.compilation.entityCount} 只狐狸</strong>，预算为 ${state.project.budget}。</p><p style="margin-top:12px">命令已通过当前仿真器重放，但持物补偿和网易行为尚未实测。导出包包含工程、初始化/持续/清理函数、行为包目录及验证报告。</p><p style="margin-top:12px">坐标为工程绝对世界坐标。导入方式与实际效果需在目标客户端核对。</p><a class="link-button outline" href="/api/export.zip?experimental=true">下载 ZIP 实验包 ↗</a>`,
  );
};
$("capabilities").onclick = () =>
  action(async () => {
    const c = await api("/api/capabilities");
    modal(
      "已实现能力与准确性边界",
      `<p>官方资源：${c.animations} 个动画、${c.controllers} 个控制器。资源存在不代表所有依赖语义都已实现。</p><h3>当前限制</h3><ul>${c.limitations.map((s: string) => `<li>${escape(s)}</li>`).join("")}</ul><h3>资源固定提交</h3><pre>${escape(c.resourceCommit)}</pre>`,
    );
  });
$("fit").onclick = fit;
function setView(player: boolean) {
  playerView = player;
  $("view-editor").classList.toggle("active", !player);
  $("view-player").classList.toggle("active", player);
  $("viewport-help").textContent = player
    ? "玩家视角由右侧摄像机参数控制；编辑器观察不修改动画查询"
    : "左键旋转 · 右键平移 · 滚轮缩放 · 点击选择部件";
  renderOnce();
}
$("view-editor").onclick = () => setView(false);
$("view-player").onclick = () => setView(true);
$("screenshot").onclick = () => {
  renderOnce();
  const a = document.createElement("a");
  a.href = renderer.domElement.toDataURL("image/png");
  a.download = `fmbe-${playerView ? "player" : "editor"}-${state.frame.frame}.png`;
  a.click();
};
$("show-grid").onchange = () => {
  grid.visible = $<HTMLInputElement>("show-grid").checked;
  renderOnce();
};
for (const id of ["show-fox", "show-reference"])
  $(id).onchange = () => drawFrame(state.frame);
$("camera-apply").onclick = () =>
  action(async () => {
    const position = [
        ...$("camera-position").querySelectorAll<HTMLInputElement>("input"),
      ].map((i) => Number(i.value)),
      rotation = [
        ...$("camera-rotation").querySelectorAll<HTMLInputElement>("input"),
      ].map((i) => Number(i.value));
    const r = await post("/api/camera", {
      position,
      rotation,
      mode: $<HTMLSelectElement>("camera-mode").value,
      fov: Number($<HTMLInputElement>("camera-fov").value),
    });
    state.frame = r.frame;
    state.project.camera = r.camera;
    drawFrame(r.frame);
    setView(true);
  });
$("execute").onclick = () =>
  action(async () => {
    playing = false;
    $("play").textContent = "▶";
    const r = await post("/api/experiment/commands", {
      commands: $<HTMLTextAreaElement>("commands").value,
      reset: $<HTMLInputElement>("raw-reset").checked,
    });
    $("command-results").textContent = r.results
      .map(
        (r: any) =>
          `${r.ok ? "✓" : "✕"} ${r.ok ? `${r.affected} 个目标` : r.error} · ${r.command.slice(0, 85)}`,
      )
      .join("\n");
    selected = "";
    await refresh(true);
  });
$("load-compiled").onclick = () => {
  $<HTMLTextAreaElement>("commands").value = state.compilation.init.join("\n");
  toast("编译命令已载入，点击执行可在空白场景重放");
};
$("reset").onclick = () =>
  action(async () => {
    playing = false;
    $("play").textContent = "▶";
    paint(await post("/api/simulation/reset"));
  });
async function step(frames = 1) {
  const r = await post("/api/simulation/step", { dt: 1 / 60, frames });
  state.frame = r.frame;
  if (r.gunState) {
    state.gunState = r.gunState;
    gunPanel?.update(state);
  }
  drawFrame(r.frame);
  paintDiagnostics();
}
$("step").onclick = () => action(() => step(1));
$("play").onclick = () => {
  playing = !playing;
  $("play").textContent = playing ? "Ⅱ" : "▶";
};
let advancing = false;
setInterval(async () => {
  if (!playing || busy || advancing || !state) return;
  advancing = true;
  try {
    await step(4);
  } catch (e: any) {
    playing = false;
    toast(e.message, true);
  } finally {
    advancing = false;
  }
}, 66);
$("checkpoint").onclick = () =>
  action(async () => {
    const s = await post("/api/simulation/checkpoint");
    checkpoint = s.id;
    $<HTMLButtonElement>("restore").disabled = false;
    toast(`已保存 ${s.time.toFixed(3)} 秒的完整运行快照`);
  });
$("restore").onclick = () =>
  action(async () => {
    playing = false;
    $("play").textContent = "▶";
    const r = await post("/api/simulation/restore", { id: checkpoint });
    state.frame = r.frame;
    drawFrame(r.frame);
    paintDiagnostics();
  });
$("optimize").onclick = () => {
  modal(
    "生成实体成本候选",
    `<p>在允许的尺寸变化内尝试更容易分解的截面，逐个重新编译并计数。原始方案始终保留。</p><p style="margin:12px 0;color:var(--warn)">当前是尺寸量化优化。连接关系、孔洞与动态特征仍需你检查；工具不会自动接受候选。</p><label>最大尺寸变化（格） <input id="opt-tolerance" type="number" min="0" max="0.25" step="0.01" value="0.05"></label><button id="opt-run" class="primary" style="margin-left:15px">计算候选</button><div id="candidates"></div>`,
  );
  $("opt-run").onclick = () =>
    action(async () => {
      const r = await post("/api/experiment/optimize", {
        base_revision: state.project.revision,
        tolerance: Number($<HTMLInputElement>("opt-tolerance").value),
      });
      $("candidates").innerHTML = r.candidates
        .map(
          (c: any) =>
            `<div class="candidate"><div><strong>${escape(c.label)} · ${c.entityCount} 只狐狸</strong><small>最大尺寸变化 ${c.maxDimensionChange.toFixed(4)} 格 · ${c.withinBudget ? "预算内" : "超过预算"}</small></div>${c.id !== "original" ? `<button class="primary" data-candidate="${escape(c.id)}">选择</button>` : "<small>已保留</small>"}</div>`,
        )
        .join("");
      if (r.candidates.length === 1)
        $("candidates").innerHTML +=
          "<p>在当前搜索范围内，没有找到实体更少的候选。</p>";
      $("candidates")
        .querySelectorAll<HTMLButtonElement>("[data-candidate]")
        .forEach(
          (b) =>
            (b.onclick = () =>
              action(async () => {
                const s = await post("/api/candidate/accept", {
                  base_revision: state.project.revision,
                  runId: r.runId,
                  candidateId: b.dataset.candidate,
                });
                draft = false;
                paint(s);
                $<HTMLDialogElement>("modal").close();
                toast("候选已应用，原方案可撤销恢复");
              })),
        );
    }, "生成并重放候选…");
};
$("animation-search").oninput = () => {
  clearTimeout(animationTimer);
  animationTimer = setTimeout(searchAnimations, 200);
};
async function searchAnimations() {
  try {
    const list = await api(
      `/api/resources/animations?q=${encodeURIComponent($<HTMLInputElement>("animation-search").value)}`,
    );
    $("animation-list").innerHTML = list
      .slice(0, 80)
      .map(
        (a: any) =>
          `<button data-animation="${escape(a.id)}">${escape(a.id)}</button>`,
      )
      .join("");
    $("animation-list")
      .querySelectorAll<HTMLButtonElement>("[data-animation]")
      .forEach(
        (b) =>
          (b.onclick = async () => {
            const a = await api(
              `/api/resources/animation?id=${encodeURIComponent(b.dataset.animation!)}`,
            );
            $("animation-definition").textContent = JSON.stringify(
              a.definition,
              null,
              2,
            );
          }),
      );
  } catch {}
}
function capture(msg: any, socket: WebSocket) {
  const old = state.frame,
    savedPlayer = playerView,
    savedPosition = camera.position.clone(),
    savedCamera = camera.clone(),
    savedTarget = controls.target.clone(),
    pixel = renderer.getPixelRatio();
  try {
    drawFrame(msg.frame, false);
    if (selectionOutline) selectionOutline.visible = false;
    const box = new THREE.Box3().setFromObject(itemGroup),
      center = box.isEmpty()
        ? new THREE.Vector3(0, 1, 0)
        : box.getCenter(new THREE.Vector3()),
      size = box.isEmpty()
        ? new THREE.Vector3(4, 4, 4)
        : box.getSize(new THREE.Vector3()),
      radius = Math.max(size.x, size.y, size.z, 0.01);
    playerView = msg.view === "player";
    if (["front", "side", "top"].includes(msg.view)) {
      const axis =
        msg.view === "front"
          ? new THREE.Vector3(0, 0, -1)
          : msg.view === "side"
            ? new THREE.Vector3(1, 0, 0)
            : new THREE.Vector3(0, 1, 0.0001);
      const horizontal = msg.view === "side" ? size.z : size.x,
        vertical = msg.view === "top" ? size.z : size.y,
        depth = msg.view === "side" ? size.x : msg.view === "top" ? size.y : size.z;
      camera.fov = 38;
      const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)),
        fitDistance = Math.max(horizontal / (2 * tangent * (msg.width / msg.height)), vertical / (2 * tangent));
      const distance = Math.max(0.03, fitDistance * 1.18 + depth / 2);
      camera.near = Math.max(0.0001, distance / 100);
      camera.far = Math.max(300, radius * 20);
      camera.position.copy(center).addScaledVector(axis, distance);
      camera.lookAt(center);
    }
    renderer.setPixelRatio(1);
    renderer.setSize(msg.width, msg.height, false);
    camera.aspect = msg.width / msg.height;
    gameCamera.aspect = msg.width / msg.height;
    camera.updateProjectionMatrix();
    gameCamera.updateProjectionMatrix();
    renderer.render(scene, playerView ? gameCamera : camera);
    const png = renderer.domElement.toDataURL("image/png");
    socket.send(JSON.stringify({ type: "capture_result", id: msg.id, png }));
  } catch (e: any) {
    socket.send(
      JSON.stringify({ type: "capture_result", id: msg.id, error: e.message }),
    );
  } finally {
    renderer.setPixelRatio(pixel);
    playerView = savedPlayer;
    camera.copy(savedCamera);
    camera.position.copy(savedPosition);
    controls.target.copy(savedTarget);
    controls.update();
    drawFrame(old);
    resize();
  }
}
try {
  const [s, g, e, c] = await Promise.all([
    api("/api/context"),
    api("/api/resources/geometry"),
    api("/api/examples"),
    api("/api/capabilities"),
  ]);
  geometry = g;
  examples = e.examples;
  $("examples").innerHTML = examples
    .map((x) => `<option value="${x.id}">${escape(x.name)}</option>`)
    .join("");
  $<HTMLTextAreaElement>("commands").value = e.rawExample;
  $("animation-count").textContent = `${c.animations} 个`;
  $("connection").textContent = "本地内核在线";
  gunPanel = installGunPanel({
    getState: () => state,
    post,
    api,
    context: (s) => {
      draft = false;
      paint(s, true);
    },
    frame: (r) => {
      state.frame = r.frame;
      state.gunState = r.state;
      drawFrame(r.frame);
      paintDiagnostics();
    },
    tab,
    toast,
  });
  paint(s, true);
  if (s.project.gun) tab("gun");
  resize();
  searchAnimations();
  const socket = new WebSocket(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/events`,
  );
  socket.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (
      msg.type === "revision" &&
      !busy &&
      msg.revision !== state.project.revision
    )
      refresh();
    if (msg.type === "capture") capture(msg, socket);
    if (msg.type === "gun_job") gunPanel?.jobEvent(msg);
  };
  socket.onclose = () => {
    $("connection").textContent = "连接已断开，请检查本地服务";
  };
} catch (e: any) {
  toast(`初始化失败：${e.message}`, true);
  $("connection").textContent = "连接失败";
}
