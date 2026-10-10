// M4A1 风格卡宾枪 —— 游戏造型（R2：修正前段比例与托底板高度）
// 坐标系：X 枪口前方，Y 上方，Z 侧向；尺寸单位=游戏格，角度=度。
// 材质：black=上/下机匣、护木与托体，gray=导轨梁/管件/卡销/棱线，iron=枪机与拉机柄。
// 动作组：static 机匣托握把握把护木枪管瞄具 / magazine 直插弹匣 / bolt 拉机柄与枪机框。
// M4 识别特征：平顶导轨 + 提把照门、缓冲管上的伸缩托、直插式弹匣（近垂直微前倾）、
//             加长卡宾护木 + 三角环 + 防滑棱、A 形前准星护翼、粗短鸟笼消焰器、
//             辅助推机柄 / 抛壳口盖 / 抛壳偏转块 / 前后连接销。

const S = "static";
const barrelLen = param("barrelLen", 0.32, {min:0.24, max:0.44, step:0.01, label:"裸露枪管长度"});
const barrelX0 = 0.34;                 // 裸露枪管起点（护木前箍内）
const barrelX1 = barrelX0 + barrelLen; // 枪管前端

// ===== 上机匣 / 平顶导轨 / 下机匣 =====
box("m4_upper", {name:"上机匣主体", size:[0.300,0.076,0.076], position:[-0.055,0.028,0], rotation:[0,0,0], material:"black", motionGroup:S});
box("m4_rail_spine", {name:"平顶导轨座", size:[0.290,0.036,0.036], position:[-0.055,0.084,0], rotation:[0,0,0], material:"gray", motionGroup:S});
for (let i = 0; i < 2; i++) {
  box("m4_rail_seg_" + i, {name:"导轨分段卡槽" + (i + 1), size:[0.010,0.040,0.040], position:[0.018 - i * 0.064,0.084,0], rotation:[0,0,0], material:"black", motionGroup:S});
}
box("m4_ejection_port", {name:"抛壳口盖", size:[0.085,0.018,0.018], position:[0.012,0.032,0.042], rotation:[0,0,0], material:"gray", motionGroup:S});
box("m4_forward_assist", {name:"辅助推机柄", size:[0.030,0.024,0.024], position:[-0.138,0.042,0.040], rotation:[0,0,0], material:"gray", motionGroup:S});
box("m4_brass_deflector", {name:"抛壳偏转块", size:[0.026,0.026,0.026], position:[-0.030,0.058,0.038], rotation:[0,0,0], material:"black", motionGroup:S});
box("m4_lower", {name:"下机匣主体", size:[0.235,0.048,0.048], position:[-0.075,-0.034,0], rotation:[0,0,0], material:"black", motionGroup:S});
box("m4_magwell", {name:"弹匣井", size:[0.070,0.052,0.052], position:[0.005,-0.058,0], rotation:[0,0,0], material:"black", motionGroup:S});
box("m4_magwell_lip", {name:"弹匣井前缘", size:[0.020,0.056,0.056], position:[0.046,-0.056,0], rotation:[0,0,0], material:"gray", motionGroup:S});
box("m4_pin_front", {name:"前连接销", size:[0.014,0.014,0.014], position:[0.030,-0.006,0.030], rotation:[0,0,0], material:"gray", motionGroup:S});
box("m4_pin_rear", {name:"后连接销", size:[0.014,0.014,0.014], position:[-0.178,-0.006,0.030], rotation:[0,0,0], material:"gray", motionGroup:S});

// ===== bolt 动作组：拉机柄与枪机框 =====
box("m4_charging_handle", {name:"拉机柄杆", size:[0.105,0.014,0.014], position:[-0.245,0.058,0], rotation:[0,0,0], material:"iron", motionGroup:"bolt"});
box("m4_charging_latch", {name:"拉机柄T型端", size:[0.016,0.040,0.040], position:[-0.293,0.056,0], rotation:[0,0,0], material:"iron", motionGroup:"bolt"});
box("m4_bolt_carrier", {name:"枪机框", size:[0.070,0.020,0.020], position:[0.020,0.030,0.034], rotation:[0,0,0], material:"iron", motionGroup:"bolt"});

// ===== 缓冲管与伸缩枪托 =====
box("m4_buffer_tube", {name:"缓冲管", size:[0.200,0.040,0.040], position:[-0.305,0.034,0], rotation:[0,0,0], material:"black", motionGroup:S});
box("m4_castle_nut", {name:"缓冲管锁环", size:[0.018,0.046,0.046], position:[-0.212,0.034,0], rotation:[0,0,0], material:"gray", motionGroup:S});
box("m4_stock_body", {name:"伸缩托主体", size:[0.185,0.048,0.048], position:[-0.420,0.034,0], rotation:[0,0,0], material:"black", motionGroup:S});
box("m4_stock_cheek", {name:"托腮板", size:[0.165,0.038,0.038], position:[-0.400,0.070,0], rotation:[0,0,0], material:"black", motionGroup:S});
box("m4_stock_lower", {name:"托下撑杆", size:[0.150,0.034,0.034], position:[-0.440,-0.006,0], rotation:[0,0,0], material:"black", motionGroup:S});
for (let i = 0; i < 3; i++) {
  box("m4_butt_" + i, {name:"托底板条", size:[0.024,0.128,0.024], position:[-0.524,0.018,-0.024 + i * 0.024], rotation:[0,0,0], material:"black", motionGroup:S});
}
box("m4_stock_lever", {name:"托长调节钮", size:[0.026,0.026,0.026], position:[-0.400,-0.030,0], rotation:[0,0,0], material:"gray", motionGroup:S});
box("m4_stock_sling", {name:"托底背带环", size:[0.020,0.020,0.020], position:[-0.470,-0.026,0], rotation:[0,0,0], material:"gray", motionGroup:S});

// ===== 握把 / 扳机 / 护圈 / 弹匣释放 =====
box("m4_grip_collar", {name:"握把连接座", size:[0.060,0.038,0.038], position:[-0.150,-0.052,0], rotation:[0,0,-25], material:"black", motionGroup:S});
box("m4_grip_main", {name:"握把主体", size:[0.125,0.050,0.050], position:[-0.168,-0.110,0], rotation:[0,0,-100], material:"black", motionGroup:S});
box("m4_grip_base", {name:"握把底盖", size:[0.020,0.054,0.054], position:[-0.180,-0.176,0], rotation:[0,0,-100], material:"black", motionGroup:S});
box("m4_guard_front", {name:"护圈前立柱", size:[0.014,0.032,0.014], position:[-0.048,-0.098,0], rotation:[0,0,0], material:"black", motionGroup:S});
box("m4_guard_bottom", {name:"护圈底段", size:[0.104,0.013,0.013], position:[-0.100,-0.118,0], rotation:[0,0,3], material:"black", motionGroup:S});
box("m4_guard_rear", {name:"护圈后立柱", size:[0.013,0.052,0.013], position:[-0.150,-0.092,0], rotation:[0,0,-8], material:"black", motionGroup:S});
box("m4_trigger_upper", {name:"扳机上段", size:[0.046,0.009,0.009], position:[-0.086,-0.074,0], rotation:[0,0,-78], material:"gray", motionGroup:S});
box("m4_trigger_lower", {name:"扳机下段", size:[0.024,0.009,0.009], position:[-0.090,-0.102,0], rotation:[0,0,-118], material:"gray", motionGroup:S});
box("m4_mag_release", {name:"弹匣释放钮", size:[0.018,0.018,0.018], position:[-0.055,-0.046,0.030], rotation:[0,0,0], material:"gray", motionGroup:S});

// ===== magazine 动作组：直插式弹匣（近垂直，轻微前倾）=====
for (let i = 0; i < 6; i++) {
  box("m4_mag_seg_" + i, {name:"弹匣分段" + (i + 1), size:[0.078,0.038,0.038], position:[0.004 + 0.0047 * i, -0.104 - 0.0355 * i, 0], rotation:[0,0,3 * i], material:"black", motionGroup:"magazine"});
}
box("m4_mag_floor", {name:"弹匣底板", size:[0.086,0.044,0.044], position:[0.0322,-0.317,0], rotation:[0,0,18], material:"gray", motionGroup:"magazine"});
for (let s = -1; s <= 1; s += 2) {
  box("m4_mag_rib_side_" + (s > 0 ? "p" : "n"), {name:"弹匣侧棱", size:[0.220,0.005,0.005], position:[0.0158,-0.212,0.021 * s], rotation:[0,0,97.5], material:"gray", motionGroup:"magazine"});
}
box("m4_mag_rib_front", {name:"弹匣前棱", size:[0.220,0.005,0.005], position:[0.0545,-0.217,0], rotation:[0,0,97.5], material:"gray", motionGroup:"magazine"});

// ===== 护木：加长卡宾护木 + 三角环 + 防滑棱 + 前箍 =====
box("m4_delta_ring", {name:"三角环", size:[0.020,0.062,0.062], position:[0.100,0.028,0], rotation:[0,0,0], material:"gray", motionGroup:S});
box("m4_hg_body", {name:"护木主体", size:[0.230,0.062,0.062], position:[0.225,0.028,0], rotation:[0,0,0], material:"black", motionGroup:S});
box("m4_hg_top", {name:"护木上护片", size:[0.210,0.034,0.034], position:[0.222,0.072,0], rotation:[0,0,0], material:"black", motionGroup:S});
for (let s = -1; s <= 1; s += 2) {
  box("m4_hg_seam_" + (s > 0 ? "p" : "n"), {name:"护木侧缝线", size:[0.225,0.009,0.009], position:[0.225,0.052,0.030 * s], rotation:[0,0,0], material:"gray", motionGroup:S});
}
for (let i = 0; i < 3; i++) {
  box("m4_hg_rib_" + i, {name:"护木防滑棱" + (i + 1), size:[0.012,0.066,0.066], position:[0.150 + i * 0.075,0.028,0], rotation:[0,0,0], material:"black", motionGroup:S});
}
box("m4_hg_cap", {name:"护木前箍", size:[0.018,0.056,0.056], position:[0.348,0.028,0], rotation:[0,0,0], material:"gray", motionGroup:S});

// ===== 枪管 / 前准星 / 刺刀座 / 粗短鸟笼消焰器 =====
box("m4_barrel", {name:"裸露枪管", size:[barrelLen,0.026,0.026], position:[barrelX0 + barrelLen / 2,0.028,0], rotation:[0,0,0], material:"gray", motionGroup:S});
box("m4_fsb_tower", {name:"前准星座", size:[0.048,0.075,0.048], position:[0.395,0.058,0], rotation:[0,0,0], material:"black", motionGroup:S});
for (let s = -1; s <= 1; s += 2) {
  box("m4_fsb_ear_" + (s > 0 ? "p" : "n"), {name:"准星护翼", size:[0.014,0.058,0.014], position:[0.395,0.122,0.024 * s], rotation:[0,0,0], material:"black", motionGroup:S});
}
box("m4_fsb_post", {name:"准星柱", size:[0.008,0.036,0.008], position:[0.395,0.122,0], rotation:[0,0,0], material:"gray", motionGroup:S});
box("m4_bayonet_lug", {name:"刺刀座与背带环", size:[0.032,0.026,0.026], position:[0.365,0.008,0], rotation:[0,0,0], material:"gray", motionGroup:S});
box("m4_fh_body", {name:"鸟笼消焰器", size:[0.062,0.036,0.036], position:[barrelX1 + 0.035,0.028,0], rotation:[0,0,0], material:"black", motionGroup:S});
for (let i = 0; i < 2; i++) {
  box("m4_fh_ring_" + i, {name:"消焰器开口筋" + (i + 1), size:[0.008,0.038,0.038], position:[barrelX1 + 0.018 + i * 0.024,0.028,0], rotation:[0,0,0], material:"gray", motionGroup:S});
}
box("m4_fh_tip", {name:"消焰器口环", size:[0.012,0.034,0.034], position:[barrelX1 + 0.072,0.028,0], rotation:[0,0,0], material:"gray", motionGroup:S});

// ===== 提把与照门 =====
box("m4_ch_base_rear", {name:"提把后底座", size:[0.045,0.030,0.030], position:[-0.160,0.115,0], rotation:[0,0,0], material:"black", motionGroup:S});
box("m4_ch_base_front", {name:"提把前底座", size:[0.045,0.030,0.030], position:[-0.070,0.115,0], rotation:[0,0,0], material:"black", motionGroup:S});
box("m4_ch_leg_rear", {name:"提把后支柱", size:[0.032,0.048,0.032], position:[-0.160,0.140,0], rotation:[0,0,0], material:"black", motionGroup:S});
box("m4_ch_leg_front", {name:"提把前支柱", size:[0.030,0.048,0.030], position:[-0.070,0.140,0], rotation:[0,0,0], material:"black", motionGroup:S});
box("m4_ch_top", {name:"提把顶梁", size:[0.150,0.026,0.026], position:[-0.115,0.172,0], rotation:[0,0,0], material:"black", motionGroup:S});
for (let s = -1; s <= 1; s += 2) {
  box("m4_rs_post_" + (s > 0 ? "p" : "n"), {name:"照门立柱", size:[0.010,0.026,0.010], position:[-0.150,0.198,0.014 * s], rotation:[0,0,0], material:"black", motionGroup:S});
}
box("m4_rs_bar", {name:"照门上横梁", size:[0.010,0.010,0.038], position:[-0.150,0.216,0], rotation:[0,0,0], material:"black", motionGroup:S});
box("m4_rs_knob", {name:"风偏调节钮", size:[0.020,0.020,0.020], position:[-0.166,0.172,0.026], rotation:[0,0,0], material:"gray", motionGroup:S});