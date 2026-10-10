// AWP 风格游戏狙击枪：黑灰配色；长枪管、完整枪托（拇指孔）、护圈开口、分段瞄准镜+双镜座、机柄、独立弹匣
// 坐标：X 枪口前方，Y 上方，Z 侧向；枪管轴线 Y=0.03
// 预算约束：所有 size 都保持两轴相等（杆/压缩方块），避免矩形截面分解
const midLen = param("midLen", 0.27, {min:0.25,max:0.30,step:0.01,label:"枪管中段长度"});
const midStart = 0.345;
const muzzleStart = midStart + midLen;

// ================= 机匣（static）=================
box("rcv01",{name:"机匣主体",size:[0.42,0.086,0.086],position:[-0.05,0,0],material:"black",motionGroup:"static"});
box("rcv02",{name:"机匣顶部导轨座",size:[0.32,0.030,0.030],position:[-0.06,0.058,0],material:"black",motionGroup:"static"});
box("rcv03",{name:"抛壳口上沿",size:[0.12,0.010,0.010],position:[-0.02,0.056,0.043],material:"gray",motionGroup:"static"});
box("rcv04",{name:"机匣侧棱Z正",size:[0.20,0.012,0.012],position:[-0.09,-0.004,0.044],material:"gray",motionGroup:"static"});
box("rcv05",{name:"机匣侧棱Z负",size:[0.20,0.012,0.012],position:[-0.09,-0.004,-0.044],material:"gray",motionGroup:"static"});
box("rcv06",{name:"机匣后桥",size:[0.06,0.074,0.074],position:[-0.25,0.004,0],material:"black",motionGroup:"static"});
box("rcv07",{name:"弹匣井",size:[0.16,0.052,0.052],position:[0.075,-0.056,0],material:"black",motionGroup:"static"});
box("rcv08",{name:"弹匣卡口",size:[0.030,0.028,0.028],position:[-0.045,-0.062,0],material:"gray",motionGroup:"static"});
box("rcv09",{name:"机匣底部脊线",size:[0.40,0.012,0.012],position:[-0.05,-0.048,0],material:"black",motionGroup:"static"});
box("rcv10",{name:"机匣侧铆钉前",size:[0.008,0.008,0.008],position:[-0.05,-0.008,0.044],material:"gray",motionGroup:"static"});
box("rcv11",{name:"机匣侧铆钉后",size:[0.008,0.008,0.008],position:[-0.19,-0.008,0.044],material:"gray",motionGroup:"static"});

// ================= 机柄（bolt）=================
box("blt01",{name:"枪机尾套",size:[0.036,0.036,0.036],position:[-0.272,0.038,0],material:"gray",motionGroup:"bolt"});
box("blt02",{name:"机柄根部座",size:[0.028,0.028,0.028],position:[-0.272,0.040,0.030],material:"black",motionGroup:"bolt"});
box("blt03",{name:"机柄杆",size:[0.026,0.070,0.026],position:[-0.268,0.014,0.050],rotation:[-40,0,0],material:"black",motionGroup:"bolt"});
box("blt04",{name:"机柄球头",size:[0.036,0.036,0.036],position:[-0.268,-0.022,0.082],material:"black",motionGroup:"bolt"});

// ================= 分段瞄准镜 + 双镜座（static）=================
box("scp01",{name:"前镜座底板",size:[0.05,0.038,0.038],position:[0.045,0.072,0],material:"black",motionGroup:"static"});
box("scp02",{name:"后镜座底板",size:[0.05,0.038,0.038],position:[-0.155,0.072,0],material:"black",motionGroup:"static"});
box("scp03",{name:"前镜座卡箍",size:[0.042,0.042,0.042],position:[0.045,0.104,0],material:"gray",motionGroup:"static"});
box("scp04",{name:"后镜座卡箍",size:[0.042,0.042,0.042],position:[-0.155,0.104,0],material:"gray",motionGroup:"static"});
box("scp05",{name:"目镜段镜筒",size:[0.115,0.040,0.040],position:[-0.205,0.115,0],material:"black",motionGroup:"static"});
box("scp06",{name:"变焦环",size:[0.022,0.050,0.050],position:[-0.140,0.115,0],material:"gray",motionGroup:"static"});
box("scp07",{name:"镜筒中段",size:[0.135,0.032,0.032],position:[-0.060,0.115,0],material:"black",motionGroup:"static"});
box("scp08",{name:"物镜锥段",size:[0.070,0.044,0.044],position:[0.035,0.115,0],material:"black",motionGroup:"static"});
box("scp09",{name:"物镜筒",size:[0.085,0.052,0.052],position:[0.115,0.115,0],material:"black",motionGroup:"static"});
box("scp10",{name:"物镜端环",size:[0.018,0.056,0.056],position:[0.163,0.115,0],material:"gray",motionGroup:"static"});
box("scp11",{name:"物镜镜片",size:[0.004,0.046,0.046],position:[0.172,0.115,0],material:"gray",motionGroup:"static"});
box("scp12",{name:"目镜端环",size:[0.018,0.052,0.052],position:[-0.270,0.115,0],material:"gray",motionGroup:"static"});
box("scp13",{name:"目镜镜片",size:[0.004,0.042,0.042],position:[-0.2795,0.115,0],material:"gray",motionGroup:"static"});
box("scp14",{name:"高低调节旋钮",size:[0.030,0.030,0.030],position:[-0.060,0.147,0],material:"gray",motionGroup:"static"});
box("scp15",{name:"风偏调节旋钮",size:[0.030,0.030,0.030],position:[-0.060,0.115,0.032],material:"gray",motionGroup:"static"});

// ================= 完整枪托：拇指孔闭环（static）=================
box("stk01",{name:"枪托颈部",size:[0.12,0.066,0.066],position:[-0.320,0.004,0],material:"black",motionGroup:"static"});
box("stk02",{name:"枪托上脊",size:[0.30,0.054,0.054],position:[-0.44,0.046,0],material:"black",motionGroup:"static"});
box("stk03",{name:"托腮板",size:[0.18,0.032,0.032],position:[-0.42,0.086,0],material:"black",motionGroup:"static"});
box("stk04",{name:"拇指孔前柱",size:[0.052,0.16,0.052],position:[-0.330,-0.055,0],material:"black",motionGroup:"static"});
box("stk05",{name:"枪托下梁",size:[0.26,0.044,0.044],position:[-0.45,-0.144,0],material:"black",motionGroup:"static"});
box("stk06",{name:"枪托后柱",size:[0.060,0.21,0.060],position:[-0.575,-0.052,0],material:"black",motionGroup:"static"});
box("stk07",{name:"枪托底板",size:[0.06,0.24,0.06],position:[-0.615,-0.045,0],material:"black",motionGroup:"static"});
box("stk08",{name:"拇指孔上内缘",size:[0.18,0.010,0.010],position:[-0.45,0.014,0],material:"gray",motionGroup:"static"});
box("stk09",{name:"拇指孔下内缘",size:[0.20,0.010,0.010],position:[-0.45,-0.118,0],material:"gray",motionGroup:"static"});
box("stk10",{name:"托底背带环",size:[0.016,0.026,0.016],position:[-0.615,-0.178,0],material:"gray",motionGroup:"static"});

// ================= 握把 / 护圈开口 =================
box("grp01",{name:"握把",size:[0.050,0.19,0.050],position:[-0.20,-0.150,0],rotation:[0,0,-18],material:"black",motionGroup:"static"});
box("grp02",{name:"握把底板",size:[0.058,0.024,0.058],position:[-0.232,-0.248,0],rotation:[0,0,-18],material:"gray",motionGroup:"static"});
box("grp03",{name:"握把防滑纹上",size:[0.045,0.008,0.008],position:[-0.185,-0.130,0],rotation:[0,0,-18],material:"gray",motionGroup:"static"});
box("grp04",{name:"握把防滑纹下",size:[0.045,0.008,0.008],position:[-0.192,-0.162,0],rotation:[0,0,-18],material:"gray",motionGroup:"static"});
box("grp05",{name:"握把连接座",size:[0.050,0.040,0.050],position:[-0.182,-0.055,0],material:"black",motionGroup:"static"});
box("grp06",{name:"护圈底梁",size:[0.12,0.010,0.010],position:[-0.105,-0.118,0],material:"black",motionGroup:"static"});
box("grp07",{name:"护圈前段",size:[0.04,0.010,0.010],position:[-0.033,-0.104,0],rotation:[0,0,48],material:"black",motionGroup:"static"});
box("grp08",{name:"护圈后段",size:[0.05,0.010,0.010],position:[-0.158,-0.094,0],rotation:[0,0,72],material:"black",motionGroup:"static"});
box("grp09",{name:"扳机",size:[0.012,0.048,0.012],position:[-0.105,-0.083,0],rotation:[0,0,-6],material:"gray",motionGroup:"static"});
box("grp10",{name:"扳机组座",size:[0.030,0.028,0.028],position:[-0.105,-0.054,0],material:"gray",motionGroup:"static"});
box("grp11",{name:"弹匣释放钮",size:[0.05,0.014,0.014],position:[-0.048,-0.058,0],material:"gray",motionGroup:"static"});

// ================= 独立弹匣（magazine）=================
box("mag01",{name:"弹匣上接口",size:[0.15,0.055,0.055],position:[0.075,-0.072,0],material:"black",motionGroup:"magazine"});
box("mag02",{name:"弹匣主体",size:[0.10,0.10,0.050],position:[0.075,-0.135,0],material:"black",motionGroup:"magazine"});
box("mag03",{name:"弹匣卡榫",size:[0.028,0.028,0.028],position:[0.130,-0.105,0],material:"gray",motionGroup:"magazine"});
box("mag04",{name:"弹匣底板",size:[0.12,0.05,0.05],position:[0.075,-0.215,0],material:"gray",motionGroup:"magazine"});
box("mag05",{name:"底板压条",size:[0.13,0.012,0.012],position:[0.075,-0.245,0],material:"black",motionGroup:"magazine"});
box("mag06",{name:"弹匣侧压印Z正",size:[0.09,0.012,0.012],position:[0.075,-0.135,0.028],material:"gray",motionGroup:"magazine"});
box("mag07",{name:"弹匣侧压印Z负",size:[0.09,0.012,0.012],position:[0.075,-0.135,-0.028],material:"gray",motionGroup:"magazine"});

// ================= 前护木（static）=================
box("hgd01",{name:"前护木",size:[0.24,0.064,0.064],position:[0.28,-0.022,0],material:"black",motionGroup:"static"});
box("hgd02",{name:"护木前箍",size:[0.02,0.072,0.072],position:[0.392,-0.022,0],material:"black",motionGroup:"static"});
box("hgd03",{name:"护木侧棱Z正",size:[0.22,0.010,0.010],position:[0.28,-0.004,0.036],material:"gray",motionGroup:"static"});
box("hgd04",{name:"护木侧棱Z负",size:[0.22,0.010,0.010],position:[0.28,-0.004,-0.036],material:"gray",motionGroup:"static"});
box("hgd05",{name:"护木下沿条",size:[0.22,0.012,0.012],position:[0.28,-0.055,0],material:"gray",motionGroup:"static"});
box("hgd06",{name:"散热槽隔条后",size:[0.030,0.030,0.080],position:[0.21,-0.040,0],material:"gray",motionGroup:"static"});
box("hgd07",{name:"散热槽隔条中",size:[0.030,0.030,0.080],position:[0.28,-0.040,0],material:"gray",motionGroup:"static"});
box("hgd08",{name:"散热槽隔条前",size:[0.030,0.030,0.080],position:[0.35,-0.040,0],material:"gray",motionGroup:"static"});

// ================= 长枪管 / 枪口（static）=================
box("bar01",{name:"枪管根段",size:[0.19,0.044,0.044],position:[0.255,0.03,0],material:"black",motionGroup:"static"});
box("bar02",{name:"枪管中段",size:[midLen,0.034,0.034],position:[midStart+midLen/2,0.03,0],material:"gray",motionGroup:"static"});
box("bar03",{name:"枪管环",size:[0.022,0.052,0.052],position:[0.40,0.03,0],material:"black",motionGroup:"static"});
box("bar04",{name:"枪口段",size:[0.12,0.042,0.042],position:[muzzleStart+0.060,0.03,0],material:"black",motionGroup:"static"});
box("bar05",{name:"制退器槽后",size:[0.012,0.046,0.046],position:[muzzleStart+0.030,0.03,0],material:"gray",motionGroup:"static"});
box("bar06",{name:"制退器槽前",size:[0.012,0.046,0.046],position:[muzzleStart+0.070,0.03,0],material:"gray",motionGroup:"static"});
box("bar07",{name:"枪口端面",size:[0.004,0.030,0.030],position:[muzzleStart+0.122,0.03,0],material:"gray",motionGroup:"static"});
box("bar08",{name:"护木背带环",size:[0.014,0.026,0.014],position:[0.28,-0.075,0],material:"gray",motionGroup:"static"});
