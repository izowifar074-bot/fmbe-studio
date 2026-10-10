const w = param("width", 4, {label:"框架宽度", min:2, max:6, step:0.5});
const h = param("height", 3, {label:"框架高度", min:1, max:5, step:0.5});
const p = [[-w/2,0,-1.5],[w/2,0,-1.5],[w/2,0,1.5],[-w/2,0,1.5],
           [-w/2,h,-1.5],[w/2,h,-1.5],[w/2,h,1.5],[-w/2,h,1.5]];
const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],
               [0,4],[1,5],[2,6],[3,7],[0,5],[1,6],[2,7],[3,4]];
for (let i=0; i<edges.length; i++) {
  beamBetween("beam_"+i, {from:p[edges[i][0]], to:p[edges[i][1]],
    section:[0.14,0.14], material:i<12?"iron":"cyan"});
}