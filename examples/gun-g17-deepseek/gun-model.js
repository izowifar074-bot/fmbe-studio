// ===== G17 风格游戏手枪（Minecraft FMBE 造型，非真实尺寸）=====
// 坐标：X 枪口前方 / Y 上方 / Z 侧向；单位：格；角度：度
// 规则：每个 box 至少两条尺寸相等（方截面杆/压缩方块），避免矩形截面分解成多只狐狸
// 动作组：bolt = 套筒总成（含抛壳口、刻槽、准星照门），magazine = 弹匣总成，static = 底把/护圈/握把

// ---------------- 套筒总成（bolt）----------------
box("bolt_slide",  {name:"套筒主体",   size:[0.260,0.048,0.048], position:[-0.010,0.070,0], material:"gray",  motionGroup:"bolt"});
box("bolt_rear",   {name:"套筒后端板", size:[0.010,0.048,0.048], position:[-0.140,0.070,0], material:"black", motionGroup:"bolt"});
box("bolt_breech", {name:"枪身节套",   size:[0.040,0.052,0.052], position:[-0.115,0.070,0], material:"black", motionGroup:"bolt"});
box("bolt_toprib", {name:"套筒顶脊",   size:[0.230,0.008,0.008], position:[-0.015,0.097,0], material:"black", motionGroup:"bolt"});
box("bolt_port",   {name:"抛壳口",     size:[0.058,0.020,0.020], position:[0.012,0.082,0.019], material:"black", motionGroup:"bolt"});

// 后部刻槽（有界循环）
for (let i = 0; i < 4; i++) {
  box("bolt_serr_r" + i, {name:"套筒后刻槽" + (i + 1), size:[0.006,0.050,0.050],
    position:[-0.098 + i * 0.012, 0.070, 0], material:"black", motionGroup:"bolt"});
}
// 前部刻槽
for (let i = 0; i < 2; i++) {
  box("bolt_serr_f" + i, {name:"套筒前刻槽" + (i + 1), size:[0.006,0.050,0.050],
    position:[0.048 + i * 0.012, 0.070, 0], material:"black", motionGroup:"bolt"});
}

// 枪口与复进簧导杆
box("bolt_muzzle", {name:"枪管口",     size:[0.018,0.024,0.024], position:[0.121,0.074,0], material:"iron", motionGroup:"bolt"});
box("bolt_guide",  {name:"复进簧导杆", size:[0.020,0.012,0.012], position:[0.114,0.040,0], material:"iron", motionGroup:"bolt"});

// 前准星 / 后照门（装在套筒上，随 bolt 运动）
box("sight_front_base",  {name:"前准星基座", size:[0.010,0.010,0.026], position:[0.098,0.099,0],  material:"iron", motionGroup:"bolt"});
box("sight_front_blade", {name:"前准星柱",   size:[0.008,0.016,0.008], position:[0.098,0.112,0],  material:"iron", motionGroup:"bolt"});
box("sight_rear_base",   {name:"照门基座",   size:[0.010,0.010,0.030], position:[-0.122,0.099,0], material:"iron", motionGroup:"bolt"});
box("sight_rear_L",      {name:"照门左耳",   size:[0.008,0.014,0.008], position:[-0.122,0.110,0.011],  material:"iron", motionGroup:"bolt"});
box("sight_rear_R",      {name:"照门右耳",   size:[0.008,0.014,0.008], position:[-0.122,0.110,-0.011], material:"iron", motionGroup:"bolt"});

// ---------------- 底把与护圈（static）----------------
box("frame_body", {name:"底把主体",   size:[0.215,0.040,0.040], position:[-0.030,0.026,0], material:"black", motionGroup:"static"});
box("frame_dust", {name:"底把防尘盖", size:[0.060,0.030,0.030], position:[0.075,0.031,0],  material:"black", motionGroup:"static"});
box("frame_rail", {name:"附件导轨",   size:[0.050,0.008,0.008], position:[0.075,0.012,0],  material:"gray",  motionGroup:"static"});
box("frame_tail", {name:"底把海狸尾", size:[0.026,0.030,0.030], position:[-0.145,0.031,0], material:"black", motionGroup:"static"});
box("frame_tex_L",{name:"底把左侧纹", size:[0.100,0.008,0.008], position:[-0.045,0.024,0.021],  material:"gray", motionGroup:"static"});
box("frame_tex_R",{name:"底把右侧纹", size:[0.100,0.008,0.008], position:[-0.045,0.024,-0.021], material:"gray", motionGroup:"static"});
box("frame_rel",  {name:"弹匣卡榫",   size:[0.012,0.012,0.012], position:[-0.050,0.026,0.024],  material:"black", motionGroup:"static"});
box("frame_stop", {name:"空仓挂机杆", size:[0.030,0.008,0.008], position:[-0.028,0.040,0.022],  material:"gray",  motionGroup:"static"});
box("frame_pin1", {name:"分解销1",    size:[0.008,0.008,0.008], position:[-0.062,0.040,0.023],  material:"iron",  motionGroup:"static"});
box("frame_pin2", {name:"分解销2",    size:[0.008,0.008,0.008], position:[-0.010,0.040,0.023],  material:"iron",  motionGroup:"static"});
box("frame_trig", {name:"扳机",       size:[0.012,0.032,0.012], position:[-0.020,-0.010,0], rotation:[0,0,-8], material:"iron", motionGroup:"static"});

// 扳机护圈：前段 + 底段 + 后段，围出完整护圈孔（方截面杆）
box("guard_front",  {name:"护圈前段", size:[0.049,0.012,0.012], position:[0.014,-0.016,0],  rotation:[0,0,76],   material:"black", motionGroup:"static"});
box("guard_bottom", {name:"护圈底段", size:[0.050,0.012,0.012], position:[-0.017,-0.040,0], rotation:[0,0,0],    material:"black", motionGroup:"static"});
box("guard_rear",   {name:"护圈后段", size:[0.051,0.012,0.012], position:[-0.037,-0.015,0], rotation:[0,0,78.7], material:"black", motionGroup:"static"});

// ---------------- 倾斜握把（static，-110° 后倾）----------------
group("grip", {position:[-0.050,0.010,0], rotation:[0,0,-110]}, () => {
  box("grip_core",   {name:"握把主体",     size:[0.115,0.046,0.046], position:[0.0575,0,0],        material:"black", motionGroup:"static"});
  box("grip_front_1",{name:"握把前指槽1",  size:[0.100,0.010,0.010], position:[0.055,0.025,0.012], material:"gray",  motionGroup:"static"});
  box("grip_front_2",{name:"握把前指槽2",  size:[0.100,0.010,0.010], position:[0.055,0.025,-0.012],material:"gray",  motionGroup:"static"});
  box("grip_back_1", {name:"握把后脊纹1",  size:[0.095,0.010,0.010], position:[0.058,-0.025,0.012],material:"gray",  motionGroup:"static"});
  box("grip_back_2", {name:"握把后脊纹2",  size:[0.095,0.010,0.010], position:[0.058,-0.025,-0.012],material:"gray", motionGroup:"static"});
  box("grip_side_L", {name:"握把左侧棱线", size:[0.100,0.008,0.008], position:[0.055,0,0.024],     material:"gray",  motionGroup:"static"});
  box("grip_side_R", {name:"握把右侧棱线", size:[0.100,0.008,0.008], position:[0.055,0,-0.024],    material:"gray",  motionGroup:"static"});
});

// ---------------- 弹匣总成（magazine，与握把同轴后倾）----------------
group("magazine", {position:[-0.050,0.010,0], rotation:[0,0,-110]}, () => {
  box("mag_lips",  {name:"弹匣口沿",   size:[0.012,0.026,0.026], position:[0.005,0,0],          material:"iron",  motionGroup:"magazine"});
  box("mag_body",  {name:"弹匣体",     size:[0.130,0.030,0.030], position:[0.060,0,0],          material:"black", motionGroup:"magazine"});
  box("mag_wit_L", {name:"弹匣侧棱1",  size:[0.100,0.008,0.008], position:[0.058,0.014,0.014],  material:"gray",  motionGroup:"magazine"});
  box("mag_wit_R", {name:"弹匣侧棱2",  size:[0.100,0.008,0.008], position:[0.058,0.014,-0.014], material:"gray",  motionGroup:"magazine"});
  box("mag_plate", {name:"弹匣底板",   size:[0.018,0.050,0.050], position:[0.132,0,0],          material:"gray",  motionGroup:"magazine"});
});
