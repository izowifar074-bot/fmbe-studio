// ===== AUG 风格无托游戏步枪 (v2) =====
// 坐标系: X 枪口前方, Y 上, Z 侧; 单位=游戏格, 角度=度, 旋转 Rz*Ry*Rx
// 布局: 弹匣在握把后方(无托), 短厚托部, 一体式瞄准镜, 倾斜前握把, 完整扳机护圈孔, 黑灰材质

const magTilt = param("magTilt", 6, {min:3, max:10, step:1, label:"弹匣前倾角"});
const magDeg = magTilt - 90;                      // 弹匣长轴角度(近竖直, 底部略前倾)
const rad = magDeg * Math.PI / 180;
const dx = Math.cos(rad), dy = Math.sin(rad);     // 弹匣轴向单位量
const px = -dy, py = dx;                          // 弹匣横向(前后)单位量
const magLen = 0.275;
const magHalf = magLen / 2;
const magCx = -0.2336, magCy = -0.2228;           // 弹匣主体中心(顶面接井口 y=-0.086)

// ---------- 主体: 后机匣 / 中段 / 前壳体 ----------
box("r_body",   {name:"后部机匣主体", size:[0.42,0.075,0.075], position:[-0.25,0.025,0],   rotation:[0,0,0], material:"black", motionGroup:"static"});
box("r_lower",  {name:"机匣下壳体",   size:[0.34,0.075,0.075], position:[-0.27,-0.035,0],  rotation:[0,0,0], material:"black", motionGroup:"static"});
box("r_edge_l", {name:"机匣左侧下沿", size:[0.32,0.010,0.010], position:[-0.27,-0.062,-0.041], rotation:[0,0,0], material:"gray", motionGroup:"static"});
box("r_edge_r", {name:"机匣右侧下沿", size:[0.32,0.010,0.010], position:[-0.27,-0.062,0.041],  rotation:[0,0,0], material:"gray", motionGroup:"static"});
box("m_body",   {name:"中段壳体",     size:[0.28,0.088,0.088], position:[0.06,0.008,0],   rotation:[0,0,0], material:"black", motionGroup:"static"});
box("m_edge_l", {name:"中段左侧棱",   size:[0.24,0.010,0.010], position:[0.06,-0.030,-0.046], rotation:[0,0,0], material:"gray", motionGroup:"static"});
box("m_edge_r", {name:"中段右侧棱",   size:[0.24,0.010,0.010], position:[0.06,-0.030,0.046],  rotation:[0,0,0], material:"gray", motionGroup:"static"});
box("m_join",   {name:"前后壳体接座", size:[0.09,0.082,0.082], position:[0.155,0.008,0],  rotation:[0,0,0], material:"black", motionGroup:"static"});
box("f_body",   {name:"前壳体",       size:[0.28,0.090,0.090], position:[0.29,0.008,0],   rotation:[0,0,0], material:"black", motionGroup:"static"});
box("f_top",    {name:"前壳体上脊",   size:[0.24,0.030,0.030], position:[0.28,0.056,0],   rotation:[0,0,0], material:"gray",  motionGroup:"static"});
box("f_low",    {name:"前壳体下棱",   size:[0.20,0.026,0.026], position:[0.30,-0.046,0],  rotation:[0,0,0], material:"gray",  motionGroup:"static"});
box("f_slot_l", {name:"前壳体左侧槽", size:[0.18,0.012,0.012], position:[0.29,0.020,-0.047], rotation:[0,0,0], material:"gray", motionGroup:"static"});
box("f_slot_r", {name:"前壳体右侧槽", size:[0.18,0.012,0.012], position:[0.29,0.020,0.047],  rotation:[0,0,0], material:"gray", motionGroup:"static"});

// ---------- 短而厚的托部 ----------
box("st_core",     {name:"托部主体",    size:[0.15,0.100,0.100], position:[-0.535,0.000,0],    rotation:[0,0,0],   material:"black", motionGroup:"static"});
box("st_low",      {name:"托部下延块",  size:[0.13,0.075,0.075], position:[-0.525,-0.075,0],   rotation:[0,0,0],   material:"black", motionGroup:"static"});
box("st_wedge",    {name:"托部下前斜块",size:[0.09,0.050,0.050], position:[-0.445,-0.078,0],   rotation:[0,0,18],  material:"black", motionGroup:"static"});
box("st_plate_up", {name:"托底板上段",  size:[0.026,0.105,0.105], position:[-0.622,0.000,0],   rotation:[0,0,0],   material:"black", motionGroup:"static"});
box("st_plate_low",{name:"托底板下段",  size:[0.026,0.080,0.080], position:[-0.616,-0.075,0],  rotation:[0,0,0],   material:"black", motionGroup:"static"});
box("st_top",      {name:"托部上脊",    size:[0.135,0.030,0.030], position:[-0.535,0.062,0],   rotation:[0,0,0],   material:"gray",  motionGroup:"static"});
box("st_sling",    {name:"后背带环",    size:[0.028,0.028,0.028], position:[-0.580,-0.075,-0.058], rotation:[0,0,0], material:"gray", motionGroup:"static"});
box("bolt_rel",    {name:"枪机释放钮",  size:[0.026,0.026,0.026], position:[-0.430,-0.050,-0.042], rotation:[0,0,0], material:"gray", motionGroup:"static"});

// ---------- 握把 + 完整扳机护圈孔 ----------
box("gp_core",  {name:"握把主体", size:[0.175,0.058,0.058], position:[-0.103,-0.118,0],  rotation:[0,0,-100], material:"black", motionGroup:"static"});
box("gp_heel",  {name:"握把底托", size:[0.034,0.064,0.064], position:[-0.121,-0.212,0],  rotation:[0,0,-100], material:"black", motionGroup:"static"});
box("tg_post",  {name:"护圈前柱", size:[0.024,0.140,0.024], position:[0.006,-0.090,0],   rotation:[0,0,0],    material:"black", motionGroup:"static"});
box("tg_bottom",{name:"护圈底条", size:[0.135,0.022,0.022], position:[-0.055,-0.162,0],  rotation:[0,0,0],    material:"black", motionGroup:"static"});
box("trig_up",  {name:"扳机上段", size:[0.055,0.012,0.012], position:[-0.048,-0.095,0],  rotation:[0,0,-80],  material:"gray",  motionGroup:"static"});
box("trig_low", {name:"扳机下段", size:[0.022,0.012,0.012], position:[-0.054,-0.125,0],  rotation:[0,0,-128], material:"gray",  motionGroup:"static"});

// ---------- 弹匣井口(静态) + 弹匣(整组可动) ----------
box("mag_well",  {name:"弹匣井口", size:[0.046,0.060,0.060], position:[-0.253,-0.080,0], rotation:[0,0,magDeg], material:"gray",  motionGroup:"static"});
box("mag_latch", {name:"弹匣卡榫", size:[0.030,0.024,0.024], position:[-0.205,-0.070,0], rotation:[0,0,0],      material:"black", motionGroup:"static"});

group("magazine", {position:[0,0,0], rotation:[0,0,0]}, () => {
  box("mag_body", {name:"弹匣主体", size:[magLen,0.048,0.048], position:[magCx,magCy,0], rotation:[0,0,magDeg], material:"black", motionGroup:"magazine"});
  box("mag_base", {name:"弹匣底板", size:[0.026,0.056,0.056],
       position:[magCx+(magHalf+0.013)*dx, magCy+(magHalf+0.013)*dy, 0], rotation:[0,0,magDeg], material:"gray", motionGroup:"magazine"});
  let n = 0;
  const offs = [-0.010, 0.010];
  const sides = [-1, 1];
  for(let si=0; si<sides.length; si++) {
    for(let oi=0; oi<offs.length; oi++) {
      n = n + 1;
      box("mag_rib_"+n, {name:"弹匣侧棱", size:[0.230,0.006,0.006],
          position:[magCx+offs[oi]*px, magCy+offs[oi]*py, sides[si]*0.025],
          rotation:[0,0,magDeg], material:"gray", motionGroup:"magazine"});
    }
  }
});

// ---------- 倾斜前握把 ----------
box("fg_mount",{name:"前握把座",     size:[0.070,0.045,0.045], position:[0.200,-0.052,0], rotation:[0,0,0],   material:"black", motionGroup:"static"});
box("fg_core", {name:"倾斜前握把",   size:[0.165,0.052,0.052], position:[0.228,-0.135,0], rotation:[0,0,-70], material:"black", motionGroup:"static"});
box("fg_base", {name:"前握把底座",   size:[0.028,0.058,0.058], position:[0.260,-0.220,0], rotation:[0,0,-70], material:"black", motionGroup:"static"});
box("fg_rib_1",{name:"前握把防滑棱", size:[0.008,0.058,0.058], position:[0.235,-0.155,0], rotation:[0,0,-70], material:"gray",  motionGroup:"static"});
box("fg_rib_2",{name:"前握把防滑棱", size:[0.008,0.058,0.058], position:[0.250,-0.196,0], rotation:[0,0,-70], material:"gray",  motionGroup:"static"});

// ---------- 枪管 / 枪口 / 前背带环 ----------
box("barrel",     {name:"枪管",       size:[0.280,0.024,0.024], position:[0.555,0.010,0],  rotation:[0,0,0], material:"black", motionGroup:"static"});
box("barrel_nut", {name:"枪管箍",     size:[0.024,0.044,0.044], position:[0.432,0.010,0],  rotation:[0,0,0], material:"black", motionGroup:"static"});
box("muzzle",     {name:"枪口消焰器", size:[0.062,0.036,0.036], position:[0.712,0.010,0],  rotation:[0,0,0], material:"gray",  motionGroup:"static"});
box("muzzle_end", {name:"枪口端面",   size:[0.004,0.024,0.024], position:[0.7425,0.010,0], rotation:[0,0,0], material:"black", motionGroup:"static"});
box("muzzle_slot",{name:"消焰器开槽", size:[0.038,0.010,0.010], position:[0.712,0.032,0],  rotation:[0,0,0], material:"gray",  motionGroup:"static"});
box("fs_base",    {name:"前背带环座", size:[0.040,0.032,0.032], position:[0.370,-0.050,0], rotation:[0,0,0], material:"black", motionGroup:"static"});
box("fs_loop",    {name:"前背带环",   size:[0.024,0.024,0.024], position:[0.370,-0.072,0], rotation:[0,0,0], material:"gray",  motionGroup:"static"});

// ---------- 一体式瞄准镜 ----------
box("sc_base",    {name:"镜座",       size:[0.440,0.050,0.050], position:[-0.200,0.078,0],   rotation:[0,0,0],   material:"black", motionGroup:"static"});
box("sc_wedge_f", {name:"镜座前斜块", size:[0.090,0.046,0.046], position:[-0.030,0.070,0],   rotation:[0,0,-18], material:"black", motionGroup:"static"});
box("sc_wedge_r", {name:"镜座后斜块", size:[0.090,0.046,0.046], position:[-0.395,0.070,0],   rotation:[0,0,14],  material:"black", motionGroup:"static"});
box("sc_body",    {name:"镜筒主体",   size:[0.340,0.078,0.078], position:[-0.205,0.140,0],   rotation:[0,0,0],   material:"black", motionGroup:"static"});
box("sc_ring_f",  {name:"镜筒前环箍", size:[0.018,0.086,0.086], position:[-0.105,0.140,0],   rotation:[0,0,0],   material:"gray",  motionGroup:"static"});
box("sc_ring_r",  {name:"镜筒后环箍", size:[0.018,0.086,0.086], position:[-0.300,0.140,0],   rotation:[0,0,0],   material:"gray",  motionGroup:"static"});
box("sc_obj_ring",{name:"物镜环",     size:[0.036,0.098,0.098], position:[-0.030,0.140,0],   rotation:[0,0,0],   material:"black", motionGroup:"static"});
box("sc_obj_lens",{name:"物镜片",     size:[0.007,0.074,0.074], position:[-0.009,0.140,0],   rotation:[0,0,0],   material:"gray",  motionGroup:"static"});
box("sc_eye",     {name:"目镜筒",     size:[0.050,0.090,0.090], position:[-0.392,0.138,0],   rotation:[0,0,0],   material:"black", motionGroup:"static"});
box("sc_eye_lens",{name:"目镜片",     size:[0.006,0.062,0.062], position:[-0.419,0.138,0],   rotation:[0,0,0],   material:"gray",  motionGroup:"static"});
box("sc_top",     {name:"镜筒顶脊",   size:[0.300,0.018,0.018], position:[-0.205,0.185,0],   rotation:[0,0,0],   material:"gray",  motionGroup:"static"});
box("sc_knob_s",  {name:"风偏调节钮", size:[0.030,0.036,0.036], position:[-0.205,0.140,0.052], rotation:[0,0,0], material:"black", motionGroup:"static"});
box("sc_knob_t",  {name:"高低调节钮", size:[0.036,0.036,0.036], position:[-0.205,0.196,0],   rotation:[0,0,0],   material:"black", motionGroup:"static"});

// ---------- 拉柄(可动枪机组)与抛壳窗 ----------
group("bolt", {position:[0,0,0], rotation:[0,0,0]}, () => {
  box("bolt_axis", {name:"拉柄横轴", size:[0.015,0.015,0.065], position:[0.105,0.050,0.0475], rotation:[0,0,0], material:"black", motionGroup:"bolt"});
  box("bolt_knob", {name:"拉柄头",   size:[0.038,0.017,0.017], position:[0.105,0.050,0.084],  rotation:[0,0,0], material:"gray",  motionGroup:"bolt"});
});
box("port_lip", {name:"抛壳窗框", size:[0.085,0.032,0.032], position:[0.090,0.008,-0.043], rotation:[0,0,0], material:"gray", motionGroup:"static"});

// ---------- 快慢机 / 销钉 ----------
box("selector", {name:"快慢机杆", size:[0.075,0.012,0.012], position:[-0.100,0.012,0.045],  rotation:[0,0,12], material:"gray", motionGroup:"static"});
box("pin_1",    {name:"机匣销钉", size:[0.016,0.016,0.016], position:[-0.355,0.015,0.041], rotation:[0,0,0],  material:"gray", motionGroup:"static"});
box("pin_2",    {name:"机匣销钉", size:[0.016,0.016,0.016], position:[-0.130,0.015,0.041], rotation:[0,0,0],  material:"gray", motionGroup:"static"});
