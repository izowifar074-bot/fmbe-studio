const segments = param("segments", 12, {label:"条带数量", min:4, max:24, step:1});
profilePrism("bracket", {
  outline:[[-2,0],[2,0],[2,3],[0.8,4],[-2,3]],
  holes:[[[-0.7,1],[0.7,1],[0.7,2.7],[-0.7,2.7]]],
  thickness:0.25, segments:segments, material:"copper"
});