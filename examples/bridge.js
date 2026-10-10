const span = param("span", 6, {label:"桥跨度", min:4, max:10, step:0.5});
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
}