export const EXAMPLES = [
  {
    id: "arm",
    name: "机械臂 · 连接与旋转",
    description: "修改关节位置，梁的长度与姿态自动求解。",
    budget: 32,
    source: `// 各部件使用语义 ID；修改参数无需计算旋转角。
const reach = param("reach", 2.6, {label:"伸展距离", min:1, max:4, step:0.1});
const height = param("height", 3.4, {label:"肘部高度", min:2, max:5, step:0.1});
const side = param("side", 0.4, {label:"臂截面", min:0.2, max:0.8, step:0.1});
const elbow = [0.6, height, 0];
const wrist = [reach, 2.4, 0.6];
box("base", {size:[2,0.3,2], position:[0,0.15,0], material:"dark"});
box("pedestal", {size:[0.8,0.8,0.8], position:[0,0.7,0], material:"iron"});
beamBetween("lower", {from:[0,1.1,0], to:elbow, section:[side,side], material:"copper"});
box("elbow", {size:[0.65,0.65,0.65], position:elbow, material:"dark"});
beamBetween("upper", {from:elbow, to:wrist, section:[side,side], material:"copper"});
box("wrist", {size:[0.55,0.55,0.55], position:wrist, material:"iron"});
group("gripper", {position:wrist, rotation:[0,20,-25]}, () => {
  box("finger_l", {size:[0.2,0.8,0.2], position:[-0.3,-0.55,0], material:"dark"});
  box("finger_r", {size:[0.2,0.8,0.2], position:[0.3,-0.55,0], material:"dark"});
});`,
  },
  {
    id: "bridge",
    name: "拱桥 · 参数化重复",
    description: "圆弧与栏杆共享参数，实体数量随分段改变。",
    budget: 80,
    source: `const span = param("span", 6, {label:"桥跨度", min:4, max:10, step:0.5});
const segments = param("segments", 8, {label:"拱分段", min:4, max:16, step:1});
box("deck", {size:[span,0.25,2], position:[0,2.4,0], material:"wood"});
for (let side = 0; side < 2; side++) {
  const z = side === 0 ? -1 : 1;
  arc("arch_" + side, {center:[0,0,z], radius:span/2, start:0, end:180,
    segments:segments, thickness:0.25, depth:0.25, material:"stone"});
  beamBetween("rail_" + side, {from:[-span/2,3.35,z],to:[span/2,3.35,z],
    section:[0.16,0.16], material:"dark"});
  for (let i = 0; i < 7; i++) {
    box("post_" + side + "_" + i, {size:[0.15,0.9,0.15],
      position:[-span/2 + span*i/6,2.85,z], material:"iron"});
  }
}`,
  },
  {
    id: "profile",
    name: "轮廓薄件 · 保留孔洞",
    description: "从二维外轮廓及孔洞生成可检查的条带候选。",
    budget: 100,
    source: `const segments = param("segments", 12, {label:"条带数量", min:4, max:24, step:1});
profilePrism("bracket", {
  outline:[[-2,0],[2,0],[2,3],[0.8,4],[-2,3]],
  holes:[[[-0.7,1],[0.7,1],[0.7,2.7],[-0.7,2.7]]],
  thickness:0.25, segments:segments, material:"copper"
});`,
  },
  {
    id: "frame",
    name: "空间框架 · 16 根杆",
    description: "两点梁自动求解不同方向，不需要填写欧拉角。",
    budget: 24,
    source: `const w = param("width", 4, {label:"框架宽度", min:2, max:6, step:0.5});
const h = param("height", 3, {label:"框架高度", min:1, max:5, step:0.5});
const p = [[-w/2,0,-1.5],[w/2,0,-1.5],[w/2,0,1.5],[-w/2,0,1.5],
           [-w/2,h,-1.5],[w/2,h,-1.5],[w/2,h,1.5],[-w/2,h,1.5]];
const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],
               [0,4],[1,5],[2,6],[3,7],[0,5],[1,6],[2,7],[3,4]];
for (let i=0; i<edges.length; i++) {
  beamBetween("beam_"+i, {from:p[edges[i][0]], to:p[edges[i][1]],
    section:[0.14,0.14], material:i<12?"iron":"cyan"});
}`,
  },
];
export const RAW_EXAMPLE = `# 独立命令实验：原生狐狸动画和 Molang
summon minecraft:fox 0 0 0 0 0 minecraft:as_adult "test_fox"
tag @e[name=test_fox] add test
replaceitem entity @e[tag=test] slot.weapon.mainhand 0 minecraft:stone 1
playanimation @e[tag=test] animation.warden.move none 0 "v.body_x_rot=math.sin(q.life_time*90)*25;v.body_z_rot=0;" test.swing
`;
