// 各部件使用语义 ID；修改参数无需计算旋转角。
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
});