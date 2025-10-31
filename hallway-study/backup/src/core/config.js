// ===== Units & defaults =====
// All dimensions in meters
export const defaults = {
  hallway: { length_m: 13.1064, width_m: 2.0574, height_m: 3.4538 },
  cameraDefaults: { hFovDeg: 80, vAspect: 10/16, range_m: 12, minRange_m: 0.7, baseline_m: 0.075, size_m: [0.12,0.06,0.03] },
  heatmap: { cell: 0.25 }
};

export const peopleSettings = {
  enabled: true,
  count: 6
};

export const raycastSettings = {
  showRays: false
};

export const displaySettings = {
  showProjectors: true,
  showCameraFOV: true,
  showHeatmap: true,
  showDepthVisualization: false
};
