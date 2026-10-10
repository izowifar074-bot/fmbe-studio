# 几何操作

```javascript
const length = param("length", 0.36, {min:0.25,max:0.5,step:0.01,label:"机匣长度"});
box("receiver", {name:"机匣主体", size:[length,0.075,0.075], position:[0,0,0], material:"black"});
beamBetween("barrel", {name:"枪管", from:[0.2,0.02,0],to:[0.75,0.02,0],section:[0.024,0.024],material:"gray"});
group("magazine", {position:[0.09,-0.08,0],rotation:[0,0,10]}, () => {
  for(let i=0;i<8;i++) {
    box("mag_"+i,{name:"弹匣段",size:[0.13,0.038,0.038],position:[i*i*0.001,-i*0.032,0],rotation:[0,0,i*4],material:"black",motionGroup:"magazine"});
  }
});
```

此片段只展示接口，不是完整作品。完整步枪应有合适的枪托、机匣盖、握把、护圈、弹匣、护木、枪管/导气管、瞄具和有限细节。新枪的识别特征必须体现在几何上。

box 的 size 是完整长度，position 在当前 group 的局部坐标中。beamBetween 的两个数组端点使用当前 group 坐标；anchor 和 anchor.offset 已标记为世界点，不重复套父变换。up 若显式给出，为世界方向。

arc 支持 plane xy/xz/yz、center、radius、start/end(度)、segments、thickness、depth、material、motionGroup。轮廓相同不意味纹理相同。不要用大量细段模拟原本一根直梁就可实现的形状。

独立 XYZ 尺寸使用方截面杆分解时可能增加成本。尺寸如 [0.3,0.07,0.07] 通常1实体，[0.3,0.07,0.09] 的成本要以编译结果为准。允许窄轴压缩，不应强迫 distinguished dimension 总是最长轴。

平面近似与实际厚度都要检查。不要仅做侧面剪影。保留护圈等关键孔洞和前后瞄具层次；避免相互穿透的大盒子掩盖结构。

输出 source 必须是可执行 SDK 调用，不能含 import、DOM、网络、process 或外部模块。不要使用尚未提供的 extrude/mesh/CSG API。
