// ===== Heatmap (floor coverage) =====
import * as THREE from 'three';
import { defaults, displaySettings } from '../core/config.js';
import { scene } from '../core/scene.js';
import { hall } from '../entities/hallway.js';

export const heat = { cells: [], group: null };

// This will be set by visibility module
let pointInFrustum2DFunc = null;
let camerasArray = null;

export function setPointInFrustum2D(func) {
  pointInFrustum2DFunc = func;
}

export function setCamerasArray(cameras) {
  camerasArray = cameras;
}

function lerpColor(a, b, t){
  return (a + (b - a) * t) | 0;
}

function setCellSeen(cellMesh, seenBy){
  // 0 -> invisible, 1 -> green, 2 -> yellow, 3+ -> red
  let col = 0x00ff66;
  let alpha = 0.0;
  if (seenBy === 1){ col = 0x22ccff; alpha = 0.22; }
  else if (seenBy === 2){ col = 0xffcc33; alpha = 0.28; }
  else if (seenBy >= 3){ col = 0xff4466; alpha = 0.34; }
  cellMesh.material.color.setHex(col);
  cellMesh.material.opacity = alpha;
}

export function buildHeatmap() {
  const { W, L } = hall.bounds; const origin = hall.origin;
  if (heat.group) { scene.remove(heat.group); heat.cells.length = 0; }
  heat.group = new THREE.Group();
  heat.group.visible = displaySettings.showHeatmap;
  scene.add(heat.group);

  const cell = defaults.heatmap.cell;
  const nx = Math.floor(W / cell), nz = Math.floor(L / cell);
  const mat = new THREE.MeshBasicMaterial({ color: 0x00ff88, transparent: true, opacity: 0.0, depthWrite: false });
  const geo = new THREE.PlaneGeometry(cell, cell); // Full cell size - no gaps between cells
  geo.rotateX(-Math.PI/2);

  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const quad = new THREE.Mesh(geo, mat.clone());
      const x = -W/2 + (ix + 0.5) * cell;
      const z = (iz + 0.5) * cell + origin.z;
      quad.position.set(x, 0.01, z);
      heat.group.add(quad);
      heat.cells.push(quad);
    }
  }
  updateHeatmap();
}

export function updateHeatmap(){
  const { W, L } = hall.bounds; const origin = hall.origin;
  if (!camerasArray || !camerasArray.length) return;

  const cell = defaults.heatmap.cell;
  const nx = Math.floor(W / cell), nz = Math.floor(L / cell);

  let idx = 0;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = -W/2 + (ix + 0.5) * cell;
      const z = (iz + 0.5) * cell + origin.z;
      const p = new THREE.Vector3(x, 0.0, z);
      let seen = 0;
      for (const cam of camerasArray){ if (pointInFrustum2DFunc && pointInFrustum2DFunc(p, cam)) seen++; }
      setCellSeen(heat.cells[idx++], seen);
    }
  }
}

export function updateHeatmapVisibility() {
  if (heat.group) {
    heat.group.visible = displaySettings.showHeatmap;
  }
}
