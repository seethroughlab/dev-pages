// ===== ES6 Module Imports =====
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm';

// ===== Units & defaults =====
const FT = 0.3048; // meters per foot
const defaults = {
  hallway: { length_ft: 43, width_ft: 6.75, height_ft: 11.33 },
  cameraDefaults: { hFovDeg: 80, vAspect: 10/16, range_m: 12, minRange_m: 0.7, baseline_m: 0.075, size_m: [0.12,0.06,0.03] },
  heatmap: { cell: 0.25 }
};

// ===== Scene setup =====
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

// Camera preview renderers
const previewWidth = 960; // 2x larger preview size
const previewHeight = 600; // 16:10 aspect ratio to match OAK-D Pro PoE stereo cameras

const canvasA = document.getElementById('camA-preview');
const canvasB = document.getElementById('camB-preview');

if (!canvasA || !canvasB) {
  console.error('Preview canvases not found!', canvasA, canvasB);
}

const previewRendererA = new THREE.WebGLRenderer({
  canvas: canvasA,
  antialias: true,
  alpha: false
});
previewRendererA.setPixelRatio(Math.min(2, window.devicePixelRatio));
previewRendererA.setSize(previewWidth, previewHeight, false);
previewRendererA.setClearColor(0x0b0f14, 1);

const previewRendererB = new THREE.WebGLRenderer({
  canvas: canvasB,
  antialias: true,
  alpha: false
});
previewRendererB.setPixelRatio(Math.min(2, window.devicePixelRatio));
previewRendererB.setSize(previewWidth, previewHeight, false);
previewRendererB.setClearColor(0x0b0f14, 1);

// Preview cameras (will be updated to match simulated camera positions)
// Three.js PerspectiveCamera uses VERTICAL FOV, not horizontal
// OAK-D Pro PoE: hFOV=80°, vFOV=55° (calculated from 80° * (10/16) aspect)
// Near/far clipping: 0.7m (min depth) to 12m (max depth)
const previewCameraA = new THREE.PerspectiveCamera(55, 16/10, 0.7, 12);
const previewCameraB = new THREE.PerspectiveCamera(55, 16/10, 0.7, 12);

// Use layer 1 for camera/projector visualizations (excluded from preview renders)
// Layer 0 (default) for everything else
previewCameraA.layers.set(0); // Only see scene objects, not visualization
previewCameraB.layers.set(0);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0f14, 10, 120);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 500);
camera.position.set(8, 6, 16);
camera.layers.enableAll(); // Main camera sees all layers (0 and 1)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Auto-save camera position when user moves it (debounced)
let cameraMoveSaveTimeout;
controls.addEventListener('change', () => {
  clearTimeout(cameraMoveSaveTimeout);
  cameraMoveSaveTimeout = setTimeout(saveSettings, 1000); // Save 1 second after user stops moving
});

const light = new THREE.HemisphereLight(0xcad7ff, 0x0a0e12, 0.9);
scene.add(light);
const dir = new THREE.DirectionalLight(0xffffff, 0.35); dir.position.set(5,10,2); scene.add(dir);

// ===== Wavy grid texture for floor projections =====
let floorTextureCanvas, floorTextureCtx, floorTexture;

// Wave simulation state for elastic grid lines
const lineState = {
  longLines: [], // Each line has displacement and velocity arrays
  shortLines: []
};

function createWavyGridTexture() {
  floorTextureCanvas = document.createElement('canvas');
  floorTextureCtx = floorTextureCanvas.getContext('2d');

  // Each projector: 1920x1200 WUXGA (landscape along hallway)
  // 3 projectors with ~15% overlap (288px) between adjacent projectors
  // Total combined: 5184 x 1200 (width x height along hallway length x width)
  // Half resolution: 2592 x 600
  // PlaneGeometry UV: width maps to X (hallway width), height maps to Z (hallway length)
  // So canvas: width = 600 (hallway width), height = 2592 (hallway length)
  floorTextureCanvas.width = 600;
  floorTextureCanvas.height = 2592;

  // Initialize line state for wave simulation
  // Calculate line counts to create square cells (6x original density)
  // Long lines run along the length, spaced across the width
  // Short lines run across the width, spaced along the length
  // With 48 long lines across 6.75ft width = 47 cells of ~0.14ft each
  // For square cells along 43ft length: 270 short lines = 269 cells of ~0.16ft each
  const numLongLines = 48;
  const numShortLines = 270;
  const pointsPerLine = 200; // Resolution for wave simulation

  lineState.longLines = [];
  for (let i = 0; i < numLongLines; i++) {
    lineState.longLines.push({
      displaceX: new Array(pointsPerLine).fill(0),
      displaceY: new Array(pointsPerLine).fill(0),
      velocityX: new Array(pointsPerLine).fill(0),
      velocityY: new Array(pointsPerLine).fill(0)
    });
  }

  lineState.shortLines = [];
  for (let i = 0; i < numShortLines; i++) {
    lineState.shortLines.push({
      displaceX: new Array(pointsPerLine).fill(0),
      displaceY: new Array(pointsPerLine).fill(0),
      velocityX: new Array(pointsPerLine).fill(0),
      velocityY: new Array(pointsPerLine).fill(0)
    });
  }

  floorTexture = new THREE.CanvasTexture(floorTextureCanvas);
  floorTexture.wrapS = THREE.RepeatWrapping;
  floorTexture.wrapT = THREE.RepeatWrapping;

  return floorTexture;
}

function updateWavyGridTexture(time, deltaTime) {
  if (!floorTextureCtx || !hall.bounds || lineState.longLines.length === 0) return;

  const canvas = floorTextureCanvas;
  const ctx = floorTextureCtx;
  const { W, L } = hall.bounds;
  const origin = hall.origin;

  // Convert people positions to canvas coordinates
  // Only apply force based on velocity (movement), not position
  const peopleInCanvas = people.map(person => {
    const canvasX = ((person.xOffset + W/2) / W) * canvas.width;
    const canvasY = (person.z / L) * canvas.height;

    // Calculate velocity in canvas space
    const velocityMagnitude = person.isDwelling ? 0 : Math.abs(person.speed);

    return { x: canvasX, y: canvasY, velocity: velocityMagnitude };
  });

  // Physics parameters for wave simulation
  const stiffness = 2.5; // Spring constant between points (higher = faster wave speed)
  const restoring = 2.4; // Force pulling points back to rest position (4x faster snapback)
  const damping = 0.88; // Energy loss per frame (lower = faster settling)
  const pushRadius = 100; // Pixels
  const pushForce = 5000; // Force strength (higher = more extreme displacement)
  const dt = Math.min(deltaTime, 0.033); // Cap timestep for stability

  // Helper to apply force from people (only when moving)
  function applyPeopleForce(canvasPos, forceArray, index, isXDirection) {
    let totalForce = 0;

    for (const person of peopleInCanvas) {
      // Only apply force if person is moving
      if (person.velocity < 0.01) continue;

      const dx = canvasPos.x - person.x;
      const dy = canvasPos.y - person.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < pushRadius && dist > 0.1) {
        const t = 1 - (dist / pushRadius);
        const smoothT = t * t * (3 - 2 * t);
        // Force scales with velocity - faster movement = stronger force
        const force = smoothT * pushForce * person.velocity;
        totalForce += isXDirection ? (dx / dist) * force : (dy / dist) * force;
      }
    }

    forceArray[index] = totalForce;
  }

  // Update long lines (vertical - varying in Y)
  const numLongLines = lineState.longLines.length;
  const pointsPerLine = lineState.longLines[0].displaceX.length;

  for (let i = 0; i < numLongLines; i++) {
    const line = lineState.longLines[i];
    const x = (i / (numLongLines - 1)) * canvas.width;
    const forces = new Array(pointsPerLine).fill(0);

    // Apply forces from people
    for (let j = 0; j < pointsPerLine; j++) {
      const y = (j / (pointsPerLine - 1)) * canvas.height;
      applyPeopleForce({ x, y }, forces, j, true);
    }

    // Wave propagation via spring forces between adjacent points
    for (let j = 0; j < pointsPerLine; j++) {
      let springForceX = 0;

      // Couple with neighbors
      if (j > 0) {
        springForceX += (line.displaceX[j - 1] - line.displaceX[j]) * stiffness;
      }
      if (j < pointsPerLine - 1) {
        springForceX += (line.displaceX[j + 1] - line.displaceX[j]) * stiffness;
      }

      // Restoring force - pulls point back to original position
      const restoringForceX = -line.displaceX[j] * restoring;

      // Update velocity and position
      line.velocityX[j] += (springForceX + restoringForceX + forces[j]) * dt;
      line.velocityX[j] *= damping;
      line.displaceX[j] += line.velocityX[j] * dt;
    }
  }

  // Update short lines (horizontal - varying in X)
  const numShortLines = lineState.shortLines.length;

  for (let i = 0; i < numShortLines; i++) {
    const line = lineState.shortLines[i];
    const y = (i / (numShortLines - 1)) * canvas.height;
    const forces = new Array(pointsPerLine).fill(0);

    // Apply forces from people
    for (let j = 0; j < pointsPerLine; j++) {
      const x = (j / (pointsPerLine - 1)) * canvas.width;
      applyPeopleForce({ x, y }, forces, j, false);
    }

    // Wave propagation
    for (let j = 0; j < pointsPerLine; j++) {
      let springForceY = 0;

      if (j > 0) {
        springForceY += (line.displaceY[j - 1] - line.displaceY[j]) * stiffness;
      }
      if (j < pointsPerLine - 1) {
        springForceY += (line.displaceY[j + 1] - line.displaceY[j]) * stiffness;
      }

      // Restoring force - pulls point back to original position
      const restoringForceY = -line.displaceY[j] * restoring;

      line.velocityY[j] += (springForceY + restoringForceY + forces[j]) * dt;
      line.velocityY[j] *= damping;
      line.displaceY[j] += line.velocityY[j] * dt;
    }
  }

  // Render the displaced lines
  ctx.fillStyle = '#0f151c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(100, 150, 200, 0.6)';
  ctx.lineWidth = 1; // Very fine lines for dense grid

  // Draw long lines
  for (let i = 0; i < numLongLines; i++) {
    const line = lineState.longLines[i];
    const x = (i / (numLongLines - 1)) * canvas.width;

    ctx.beginPath();
    for (let j = 0; j < pointsPerLine; j++) {
      const y = (j / (pointsPerLine - 1)) * canvas.height;
      const finalX = x + line.displaceX[j];
      const finalY = y;

      if (j === 0) {
        ctx.moveTo(finalX, finalY);
      } else {
        ctx.lineTo(finalX, finalY);
      }
    }
    ctx.stroke();
  }

  // Draw short lines
  for (let i = 0; i < numShortLines; i++) {
    const line = lineState.shortLines[i];
    const y = (i / (numShortLines - 1)) * canvas.height;

    ctx.beginPath();
    for (let j = 0; j < pointsPerLine; j++) {
      const x = (j / (pointsPerLine - 1)) * canvas.width;
      const finalX = x;
      const finalY = y + line.displaceY[j];

      if (j === 0) {
        ctx.moveTo(finalX, finalY);
      } else {
        ctx.lineTo(finalX, finalY);
      }
    }
    ctx.stroke();
  }

  floorTexture.needsUpdate = true;
}

// ===== Hallway model =====
const hall = { };
function buildHall() {
  const L = defaults.hallway.length_ft * FT;
  const W = defaults.hallway.width_ft * FT;
  const H = defaults.hallway.height_ft * FT;

  // clear previous
  if (hall.group) scene.remove(hall.group);
  hall.group = new THREE.Group(); scene.add(hall.group);

  // Floor with wavy grid texture
  const floorGeo = new THREE.PlaneGeometry(W, L, 1, 1);
  floorGeo.rotateX(-Math.PI/2);

  // Create or reuse wavy grid texture
  if (!floorTexture) {
    createWavyGridTexture();
  }

  // Texture is 600x2592 (width x height) matching floor UVs
  // No repeat needed - texture matches floor aspect ratio
  floorTexture.repeat.set(1, 1);

  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTexture,
    roughness: 0.9,
    metalness: 0.0
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = 0;
  floor.receiveShadow = true; hall.group.add(floor);

  // Define half dimensions for lines
  const hw = W/2, hl = L/2;

  // Ceiling (outline only)
  const ceilingLineMat = new THREE.LineBasicMaterial({ color: 0x314150, linewidth: 1 });
  const ceilingShape = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-hw, H, -hl), new THREE.Vector3(hw, H, -hl),
    new THREE.Vector3(hw, H, hl), new THREE.Vector3(-hw, H, hl), new THREE.Vector3(-hw, H, -hl)
  ]);
  const ceilingOutline = new THREE.Line(ceilingShape, ceilingLineMat);
  hall.group.add(ceilingOutline);

  // Walls as lines
  const lineMat = new THREE.LineBasicMaterial({ color: 0x314150, linewidth: 1 });
  const shape = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-hw, 0.001, -hl), new THREE.Vector3(hw, 0.001, -hl),
    new THREE.Vector3(hw, 0.001, hl), new THREE.Vector3(-hw, 0.001, hl), new THREE.Vector3(-hw, 0.001, -hl)
  ]);
  const perim = new THREE.Line(shape, lineMat); hall.group.add(perim);

  // Grid
  const grid = new THREE.GridHelper(L, Math.max(6, Math.round(L)), 0x233140, 0x1a2633);
  grid.rotation.y = Math.PI/2;
  grid.position.y = 0.001; // Slightly above floor to avoid z-fighting
  grid.layers.set(1); // Hide from preview cameras
  hall.group.add(grid);

  // Axes label
  const axes = new THREE.AxesHelper(1.5);
  axes.position.set(0, 0.003, -hl + 0.5); // Slightly above grid
  axes.layers.set(1); // Hide from preview cameras
  hall.group.add(axes);

  // Dimension arrows and labels
  const dimColor = 0x8b6600; // Darker orange for dimmer appearance
  const dimOffset = 0.3; // Offset from walls

  // Length dimension (Z axis)
  const lengthArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(-hw - dimOffset, 0.1, -hl),
    L,
    dimColor,
    0.3,
    0.2
  );
  lengthArrow.traverse(child => child.layers.set(1)); // Hide from preview cameras
  hall.group.add(lengthArrow);

  const lengthLabel = createDimensionLabel(`${defaults.hallway.length_ft.toFixed(2)} ft`);
  lengthLabel.position.set(-hw - dimOffset - 0.3, 0.5, 0);
  lengthLabel.layers.set(1); // Hide from preview cameras
  hall.group.add(lengthLabel);

  // Width dimension (X axis)
  const widthArrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-hw, 0.1, -hl - dimOffset),
    W,
    dimColor,
    0.3,
    0.2
  );
  widthArrow.traverse(child => child.layers.set(1)); // Hide from preview cameras
  hall.group.add(widthArrow);

  const widthLabel = createDimensionLabel(`${defaults.hallway.width_ft.toFixed(2)} ft`);
  widthLabel.position.set(0, 0.5, -hl - dimOffset - 0.3);
  widthLabel.layers.set(1); // Hide from preview cameras
  hall.group.add(widthLabel);

  // Height dimension (Y axis)
  const heightArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(-hw - dimOffset, 0, -hl - dimOffset),
    H,
    dimColor,
    0.3,
    0.2
  );
  heightArrow.traverse(child => child.layers.set(1)); // Hide from preview cameras
  hall.group.add(heightArrow);

  const heightLabel = createDimensionLabel(`${defaults.hallway.height_ft.toFixed(2)} ft`);
  heightLabel.position.set(-hw - dimOffset - 0.3, H / 2, -hl - dimOffset - 0.3);
  heightLabel.layers.set(1); // Hide from preview cameras
  hall.group.add(heightLabel);

  hall.bounds = { W, L, H };
  hall.origin = new THREE.Vector3(0, 0, -hl); // z: 0..L along +Z from near end

  buildHeatmap();
  createPeople(); // Recreate people with new hallway dimensions
}

function createDimensionLabel(text) {
  // Create canvas for dimension text
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 64;

  // Draw background
  context.fillStyle = 'rgba(139, 102, 0, 0.5)'; // Darker, more transparent orange
  context.fillRect(0, 0, canvas.width, canvas.height);

  // Draw text
  context.font = 'Bold 36px Arial';
  context.fillStyle = 'white';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  // Create texture and sprite
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false
  });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(0.8, 0.2, 1);

  return sprite;
}

// ===== Heatmap (floor coverage) =====
const heat = { cells: [], group: null };
function buildHeatmap() {
  const { W, L } = hall.bounds; const origin = hall.origin;
  if (heat.group) { scene.remove(heat.group); heat.cells.length = 0; }
  heat.group = new THREE.Group(); scene.add(heat.group);

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
      quad.position.set(x, 0.002, z);
      heat.group.add(quad);
      heat.cells.push(quad);
    }
  }
  updateHeatmap();
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

function updateHeatmap(){
  const { W, L } = hall.bounds; const origin = hall.origin;
  if (!cameras.length) return;

  const cell = defaults.heatmap.cell;
  const nx = Math.floor(W / cell), nz = Math.floor(L / cell);

  let idx = 0;
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const x = -W/2 + (ix + 0.5) * cell;
      const z = (iz + 0.5) * cell + origin.z;
      const p = new THREE.Vector3(x, 0.0, z);
      let seen = 0;
      for (const cam of cameras){ if (pointInFrustum2D(p, cam)) seen++; }
      setCellSeen(heat.cells[idx++], seen);
    }
  }
}

// ===== Camera nodes & FOV wedges =====
class CamNode {
  constructor(opts){
    const defaultHeight = defaults.hallway.height_ft * FT - 0.5; // 0.5m below ceiling
    const { name = 'Camera', pos_m = [0, defaultHeight, 0.2], yawDeg = 0, pitchDeg = -10, rollDeg = 0, hFovDeg = 80, vAspect = 10/16, range_m = 12, minRange_m = 0.7, baseline_m = 0.075, end = 'near' } = opts || {};
    this.name = name; this.pos = new THREE.Vector3(...pos_m); this.yaw = yawDeg; this.pitch = pitchDeg; this.roll = rollDeg;
    this.hfov = hFovDeg; this.vaspect = vAspect; this.range = range_m; this.minRange = minRange_m; this.baseline = baseline_m; this.end = end; // 'near' or 'far'
    this.group = new THREE.Group(); scene.add(this.group);
    this.build();
  }
  build(){
    const { W, L } = hall.bounds; const origin = hall.origin;
    const zBase = (this.end === 'far') ? origin.z + L : origin.z;
    // Allow cameras to extend 5m outside hallway (no Z clamping)
    this.group.position.set(
      THREE.MathUtils.clamp(this.pos.x, -W/2, W/2),
      THREE.MathUtils.clamp(this.pos.y, 0, 50),
      this.pos.z + zBase
    );
    this.group.rotation.set(THREE.MathUtils.degToRad(this.pitch), THREE.MathUtils.degToRad(this.yaw), THREE.MathUtils.degToRad(this.roll));

    // Create stereo camera bodies only once (left and right separated by baseline)
    if (!this.stereoGroup) {
      this.stereoGroup = new THREE.Group();
      this.stereoGroup.layers.set(1);
      this.group.add(this.stereoGroup);

      const cameraSize = defaults.cameraDefaults.size_m;
      const halfBaseline = this.baseline / 2;

      // Left camera
      const leftCamera = new THREE.Mesh(
        new THREE.BoxGeometry(...cameraSize),
        new THREE.MeshStandardMaterial({
          color: 0x2e85ff,
          roughness: 0.3,
          metalness: 0.05,
          transparent: true,
          opacity: 0.7,
          depthWrite: false
        })
      );
      leftCamera.position.set(-halfBaseline, 0, 0);
      leftCamera.layers.set(1);
      this.stereoGroup.add(leftCamera);

      // Right camera
      const rightCamera = new THREE.Mesh(
        new THREE.BoxGeometry(...cameraSize),
        new THREE.MeshStandardMaterial({
          color: 0x2e85ff,
          roughness: 0.3,
          metalness: 0.05,
          transparent: true,
          opacity: 0.7,
          depthWrite: false
        })
      );
      rightCamera.position.set(halfBaseline, 0, 0);
      rightCamera.layers.set(1);
      this.stereoGroup.add(rightCamera);

      // Baseline connecting line
      const baselineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-halfBaseline, 0, 0),
        new THREE.Vector3(halfBaseline, 0, 0)
      ]);
      const baselineLine = new THREE.Line(
        baselineGeometry,
        new THREE.LineBasicMaterial({ color: 0x2e85ff, opacity: 0.6, transparent: true })
      );
      baselineLine.layers.set(1);
      this.stereoGroup.add(baselineLine);

      // Add text label
      this.label = this.createLabel(this.name);
      this.label.position.set(0, 0.15, 0); // Above camera body
      this.label.layers.set(1); // Put on layer 1
      this.group.add(this.label);
    }

    // Create FOV group only once
    if (!this.fov) {
      this.fov = new THREE.Group();
      this.fov.layers.set(1); // Put entire FOV group on layer 1
      this.group.add(this.fov);
    }
    this._rebuildFOV();
  }
  createLabel(text) {
    // Extract just the letter (e.g., "Cam A" -> "A")
    const label = text.match(/[A-Z]$/)?.[0] || text;

    // Create canvas for text
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 128;

    // Draw text
    context.fillStyle = 'rgba(46, 133, 255, 0.9)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = 'Bold 80px Arial';
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(label, canvas.width / 2, canvas.height / 2);

    // Create texture and sprite
    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(0.3, 0.15, 1);

    return sprite;
  }

  _rebuildFOV(){
    // Clear prior
    while (this.fov.children.length) this.fov.remove(this.fov.children[0]);

    const L = this.range;
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.hfov/2)) * L;

    // Calculate vertical FOV from horizontal FOV and aspect ratio
    const vfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(this.hfov/2)) * this.vaspect) * THREE.MathUtils.RAD2DEG;
    const halfV = Math.tan(THREE.MathUtils.degToRad(vfov/2)) * L;

    // Four corners of the frustum at far plane
    const topLeft = new THREE.Vector3(-halfH, halfV, L);
    const topRight = new THREE.Vector3(halfH, halfV, L);
    const bottomLeft = new THREE.Vector3(-halfH, -halfV, L);
    const bottomRight = new THREE.Vector3(halfH, -halfV, L);
    const origin = new THREE.Vector3(0, 0, 0);

    const matLine = new THREE.LineBasicMaterial({ color: 0x2e85ff, transparent: true, opacity: 0.9 });

    // Draw lines from camera to corners
    const line1 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin, topLeft]), matLine);
    line1.layers.set(1);
    this.fov.add(line1);

    const line2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin, topRight]), matLine);
    line2.layers.set(1);
    this.fov.add(line2);

    const line3 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin, bottomLeft]), matLine);
    line3.layers.set(1);
    this.fov.add(line3);

    const line4 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin, bottomRight]), matLine);
    line4.layers.set(1);
    this.fov.add(line4);

    // Draw rectangle at far plane
    const line5 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([topLeft, topRight, bottomRight, bottomLeft, topLeft]), matLine);
    line5.layers.set(1);
    this.fov.add(line5);

    // Create translucent pyramid faces
    const faceMat = new THREE.MeshBasicMaterial({
      color: 0x2e85ff,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    // Top face
    const topFace = new THREE.BufferGeometry().setFromPoints([origin, topLeft, topRight]).toNonIndexed();
    topFace.computeVertexNormals();
    const topMesh = new THREE.Mesh(topFace, faceMat);
    topMesh.layers.set(1);
    this.fov.add(topMesh);

    // Bottom face
    const bottomFace = new THREE.BufferGeometry().setFromPoints([origin, bottomRight, bottomLeft]).toNonIndexed();
    bottomFace.computeVertexNormals();
    const bottomMesh = new THREE.Mesh(bottomFace, faceMat);
    bottomMesh.layers.set(1);
    this.fov.add(bottomMesh);

    // Left face
    const leftFace = new THREE.BufferGeometry().setFromPoints([origin, bottomLeft, topLeft]).toNonIndexed();
    leftFace.computeVertexNormals();
    const leftMesh = new THREE.Mesh(leftFace, faceMat);
    leftMesh.layers.set(1);
    this.fov.add(leftMesh);

    // Right face
    const rightFace = new THREE.BufferGeometry().setFromPoints([origin, topRight, bottomRight]).toNonIndexed();
    rightFace.computeVertexNormals();
    const rightMesh = new THREE.Mesh(rightFace, faceMat);
    rightMesh.layers.set(1);
    this.fov.add(rightMesh);

    // Far plane rectangle
    const farFace = new THREE.BufferGeometry().setFromPoints([
      topLeft, topRight, bottomRight, bottomLeft
    ]);
    farFace.setIndex([0, 1, 2, 0, 2, 3]);
    farFace.computeVertexNormals();
    const farMesh = new THREE.Mesh(farFace, faceMat);
    farMesh.layers.set(1);
    this.fov.add(farMesh);

    // Minimum depth (near plane) - show blind zone in red
    const minZ = this.minRange;
    const minHalfH = Math.tan(THREE.MathUtils.degToRad(this.hfov/2)) * minZ;
    const minHalfV = Math.tan(THREE.MathUtils.degToRad(vfov/2)) * minZ;

    const minTopLeft = new THREE.Vector3(-minHalfH, minHalfV, minZ);
    const minTopRight = new THREE.Vector3(minHalfH, minHalfV, minZ);
    const minBottomLeft = new THREE.Vector3(-minHalfH, -minHalfV, minZ);
    const minBottomRight = new THREE.Vector3(minHalfH, -minHalfV, minZ);

    // Draw rectangle at near plane (red to indicate blind zone)
    const minPlaneLineMat = new THREE.LineBasicMaterial({ color: 0xff4466, transparent: true, opacity: 0.7 });
    const minPlaneLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([minTopLeft, minTopRight, minBottomRight, minBottomLeft, minTopLeft]),
      minPlaneLineMat
    );
    minPlaneLine.layers.set(1);
    this.fov.add(minPlaneLine);

    // Semi-transparent red rectangle showing minimum depth plane
    const nearFaceMat = new THREE.MeshBasicMaterial({
      color: 0xff4466,
      transparent: true,
      opacity: 0.15,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const nearFace = new THREE.BufferGeometry().setFromPoints([
      minTopLeft, minTopRight, minBottomRight, minBottomLeft
    ]);
    nearFace.setIndex([0, 1, 2, 0, 2, 3]);
    nearFace.computeVertexNormals();
    const nearMesh = new THREE.Mesh(nearFace, nearFaceMat);
    nearMesh.layers.set(1);
    this.fov.add(nearMesh);
  }
}

const cameras = [];
function addCamera(opts){
  const c = new CamNode(opts); cameras.push(c); updateHeatmap(); return c;
}

// default two end cameras
function seedCameras(){
  cameras.splice(0, cameras.length);
  const camHeight = defaults.hallway.height_ft * FT - 0.5; // 0.5m below ceiling
  addCamera({ name: 'Cam A', pos_m: [0, camHeight, 0.2], yawDeg: 0, pitchDeg: -8, hFovDeg: 80, end: 'near' });
  addCamera({ name: 'Cam B', pos_m: [0, camHeight, -0.2], yawDeg: 180, pitchDeg: -8, hFovDeg: 80, end: 'far' });
}

// ===== Projector nodes =====
class ProjectorNode {
  constructor(opts){
    const { name = 'Projector', pos_m = [0, 0, 0], throwRatio = 0.7 } = opts || {};
    this.name = name;
    this.pos = new THREE.Vector3(...pos_m);
    this.throwRatio = throwRatio; // ELPLU03 lens: 0.65-0.78
    this.group = new THREE.Group();
    scene.add(this.group);
    this.build();
  }

  build(){
    this.group.position.copy(this.pos);

    // Create projector body only once
    if (!this.body) {
      // Epson EB-PU1008W dimensions: 0.546m x 0.437m x 0.165m (W x D x H)
      const projectorGeo = new THREE.BoxGeometry(0.546, 0.165, 0.437);
      const projectorMat = new THREE.MeshStandardMaterial({
        color: 0xcccccc,
        roughness: 0.4,
        metalness: 0.3,
        transparent: true,
        opacity: 0.8
      });
      this.body = new THREE.Mesh(projectorGeo, projectorMat);
      this.body.position.set(0, -0.165/2, 0); // Position so top is at mount point
      this.body.layers.set(1); // Put on layer 1 (hidden from preview cameras)
      this.group.add(this.body);

      // Add label
      this.label = this.createLabel(this.name);
      this.label.position.set(0, 0.3, 0); // Above projector
      this.label.layers.set(1); // Put on layer 1
      this.group.add(this.label);

      // Create projection cone
      this.cone = new THREE.Group();
      this.cone.layers.set(1); // Put entire cone group on layer 1
      this.group.add(this.cone);
      this._rebuildCone();
    }
  }

  createLabel(text) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 128;

    context.fillStyle = 'rgba(200, 200, 200, 0.9)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = 'Bold 48px Arial';
    context.fillStyle = 'white';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 0.9,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(0.5, 0.25, 1);
    return sprite;
  }

  _rebuildCone(){
    // Clear prior
    while (this.cone.children.length) this.cone.remove(this.cone.children[0]);

    // Calculate projection at floor level
    const { H } = hall.bounds;
    const projectionDistance = H; // Distance from ceiling to floor

    // WUXGA is 16:10 aspect ratio (landscape)
    // For throw ratio 0.7, if distance is H, then width = H / throwRatio
    const projectionWidth = projectionDistance / this.throwRatio;
    const projectionHeight = projectionWidth * (10/16); // 16:10 aspect

    const halfW = projectionWidth / 2;
    const halfH = projectionHeight / 2;

    // Four corners of projection on floor (landscape oriented along hallway length)
    // Swap X and Z so width goes along Z (hallway length) and height goes along X (hallway width)
    const origin = new THREE.Vector3(0, 0, 0);
    const topLeft = new THREE.Vector3(-halfH, -projectionDistance, -halfW);
    const topRight = new THREE.Vector3(halfH, -projectionDistance, -halfW);
    const bottomLeft = new THREE.Vector3(-halfH, -projectionDistance, halfW);
    const bottomRight = new THREE.Vector3(halfH, -projectionDistance, halfW);

    const matLine = new THREE.LineBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.6 });

    // Draw lines from projector to corners
    const line1 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin, topLeft]), matLine);
    line1.layers.set(1);
    this.cone.add(line1);

    const line2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin, topRight]), matLine);
    line2.layers.set(1);
    this.cone.add(line2);

    const line3 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin, bottomLeft]), matLine);
    line3.layers.set(1);
    this.cone.add(line3);

    const line4 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin, bottomRight]), matLine);
    line4.layers.set(1);
    this.cone.add(line4);

    // Draw rectangle on floor
    const line5 = new THREE.Line(new THREE.BufferGeometry().setFromPoints([topLeft, topRight, bottomRight, bottomLeft, topLeft]), matLine);
    line5.layers.set(1);
    this.cone.add(line5);

    // Create translucent pyramid faces
    const faceMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    // Four side faces
    const face1 = new THREE.BufferGeometry().setFromPoints([origin, topLeft, topRight]).toNonIndexed();
    face1.computeVertexNormals();
    const mesh1 = new THREE.Mesh(face1, faceMat);
    mesh1.layers.set(1);
    this.cone.add(mesh1);

    const face2 = new THREE.BufferGeometry().setFromPoints([origin, topRight, bottomRight]).toNonIndexed();
    face2.computeVertexNormals();
    const mesh2 = new THREE.Mesh(face2, faceMat);
    mesh2.layers.set(1);
    this.cone.add(mesh2);

    const face3 = new THREE.BufferGeometry().setFromPoints([origin, bottomRight, bottomLeft]).toNonIndexed();
    face3.computeVertexNormals();
    const mesh3 = new THREE.Mesh(face3, faceMat);
    mesh3.layers.set(1);
    this.cone.add(mesh3);

    const face4 = new THREE.BufferGeometry().setFromPoints([origin, bottomLeft, topLeft]).toNonIndexed();
    face4.computeVertexNormals();
    const mesh4 = new THREE.Mesh(face4, faceMat);
    mesh4.layers.set(1);
    this.cone.add(mesh4);

    // Floor rectangle
    const floorFace = new THREE.BufferGeometry().setFromPoints([
      topLeft, topRight, bottomRight, bottomLeft
    ]);
    floorFace.setIndex([0, 1, 2, 0, 2, 3]);
    floorFace.computeVertexNormals();
    const floorMesh = new THREE.Mesh(floorFace, faceMat);
    floorMesh.layers.set(1);
    this.cone.add(floorMesh);
  }
}

const projectors = [];
function createProjectors(){
  const { L, H } = hall.bounds;
  const origin = hall.origin;

  // Calculate projection width along hallway (landscape orientation)
  const throwRatio = 0.7;
  const projectionWidth = H / throwRatio; // Width of projection on floor (along Z/length)

  // Mount projectors at ceiling height, centered in width
  // Positioned so their combined projections fill the entire hallway
  projectors.push(new ProjectorNode({
    name: 'Proj 1',
    pos_m: [0, H, origin.z + projectionWidth/2] // Near end - centered on its projection
  }));

  projectors.push(new ProjectorNode({
    name: 'Proj 2',
    pos_m: [0, H, origin.z + L/2] // Center
  }));

  projectors.push(new ProjectorNode({
    name: 'Proj 3',
    pos_m: [0, H, origin.z + L - projectionWidth/2] // Far end - centered on its projection
  }));
}

// ===== Frustum test (3D rectangular pyramid) =====
function pointInFrustum3D(p, cam){
  // p: world pos. cam: CamNode
  // transform p into cam local space
  const m = new THREE.Matrix4();
  m.compose(cam.group.position, cam.group.quaternion, new THREE.Vector3(1,1,1));
  const inv = new THREE.Matrix4().copy(m).invert();
  const pl = p.clone().applyMatrix4(inv);

  // Check depth (must be beyond minimum depth and within maximum range)
  if (pl.z < cam.minRange || pl.z > cam.range) return false;

  // Check horizontal angle
  const angH = Math.abs(Math.atan2(pl.x, pl.z)) * THREE.MathUtils.RAD2DEG;
  if (angH > cam.hfov * 0.5) return false;

  // Check vertical angle
  const vfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.hfov/2)) * cam.vaspect) * THREE.MathUtils.RAD2DEG;
  const angV = Math.abs(Math.atan2(pl.y, pl.z)) * THREE.MathUtils.RAD2DEG;
  if (angV > vfov * 0.5) return false;

  return true;
}

// Legacy 2D check for heatmap (floor only)
function pointInFrustum2D(p, cam){
  return pointInFrustum3D(p, cam);
}

// ===== Visibility check with occlusion (per-slice) =====
const raycaster = new THREE.Raycaster();
const successfulRaycasts = []; // Store successful raycasts for visualization
const failedRaycasts = []; // Store failed raycasts for visualization

function isSliceVisibleToCamera(sliceWorldPos, sliceMesh, person, cam) {
  const cameraPos = cam.group.position.clone();

  // Check if slice center is in camera 3D frustum first
  // But account for slice radius (0.225m) - check a slightly expanded frustum
  const sliceRadius = 0.225; // Person cylinder radius

  // Simple approach: check if center is within frustum OR close enough to the edge
  // that the cylinder volume might intersect
  const centerVisible = pointInFrustum3D(sliceWorldPos, cam);

  if (!centerVisible) {
    // Center is outside frustum - check if it's close enough that the cylinder edges might be visible
    // For now, just reject it. We could do a more sophisticated bounding sphere check later.
    if (raycastSettings.showRays) {
      failedRaycasts.push({
        start: cameraPos.clone(),
        end: sliceWorldPos.clone()
      });
    }
    return false;
  }

  // Check for occlusion by other slices
  // Cast ray from camera to slice center
  const direction = new THREE.Vector3().subVectors(sliceWorldPos, cameraPos).normalize();
  const distance = cameraPos.distanceTo(sliceWorldPos);

  raycaster.set(cameraPos, direction);
  raycaster.far = distance - sliceRadius; // Don't include the target slice itself (account for radius)

  // Get all slices from OTHER people only (exclude all slices from this person)
  const otherSlices = [];
  for (const otherPerson of people) {
    if (otherPerson !== person) {
      for (const slice of otherPerson.slices) {
        otherSlices.push(slice);
      }
    }
  }

  // Check for intersections
  const intersects = raycaster.intersectObjects(otherSlices, false);

  // If there's an intersection closer than the slice, it's occluded
  const isVisible = intersects.length === 0;

  // Record raycast for visualization
  if (raycastSettings.showRays) {
    if (isVisible) {
      successfulRaycasts.push({
        start: cameraPos.clone(),
        end: sliceWorldPos.clone()
      });
    } else {
      failedRaycasts.push({
        start: cameraPos.clone(),
        end: sliceWorldPos.clone()
      });
    }
  }

  return isVisible;
}

function updateRaycastVisualization() {
  // Clear previous lines
  while (raycastLines.children.length > 0) {
    const line = raycastLines.children[0];
    line.geometry.dispose();
    line.material.dispose();
    raycastLines.remove(line);
  }

  // Draw new lines if enabled
  if (raycastSettings.showRays) {
    // Green lines for successful raycasts
    const greenMaterial = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.3
    });

    for (const ray of successfulRaycasts) {
      const geometry = new THREE.BufferGeometry().setFromPoints([ray.start, ray.end]);
      const line = new THREE.Line(geometry, greenMaterial);
      raycastLines.add(line);
    }

    // Red lines for failed raycasts
    const redMaterial = new THREE.LineBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.2
    });

    for (const ray of failedRaycasts) {
      const geometry = new THREE.BufferGeometry().setFromPoints([ray.start, ray.end]);
      const line = new THREE.Line(geometry, redMaterial);
      raycastLines.add(line);
    }
  }

  // Clear for next frame
  successfulRaycasts.length = 0;
  failedRaycasts.length = 0;
}

// ===== Simple Perlin-like noise =====
function simpleNoise(x) {
  // Simple smooth noise function
  const X = Math.floor(x) & 255;
  const t = x - Math.floor(x);
  const fade = t * t * (3 - 2 * t);

  const hash = (n) => {
    n = (n << 13) ^ n;
    return (n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff;
  };

  const a = hash(X);
  const b = hash(X + 1);

  return (a * (1 - fade) + b * fade) / 0x7fffffff * 2 - 1;
}

// ===== People simulation =====
let nextPersonId = 1;

class Person {
  constructor(opts = {}) {
    const { startZ = 0, speed = 0.5, xOffset = 0 } = opts;

    this.id = nextPersonId++;
    const personRadius = 0.225;
    this.radius = personRadius;

    this.speed = speed;
    this.baseXOffset = xOffset; // Original x position
    this.xOffset = xOffset; // Current x position (will vary with noise)
    this.z = startZ;
    this.direction = 1; // 1 = forward, -1 = backward
    this.shouldRemove = false;

    // Movement variation
    this.noiseOffset = Math.random() * 1000; // Random seed for noise
    this.lateralSpeed = 0.2 + Math.random() * 0.3; // How much they sway (0.2-0.5 m/s)

    // Dwelling behavior
    this.isDwelling = false;
    this.dwellTime = 0;
    this.nextDwellCheck = 3 + Math.random() * 5; // Check for dwelling every 3-8 seconds

    // Smooth avoidance
    this.avoidanceX = 0; // Smoothed lateral avoidance

    // Vary slice count between 5 and 10 (kids to adults)
    this.slices = [];
    this.sliceCount = Math.floor(5 + Math.random() * 6); // Random integer from 5 to 10

    // Fixed slice height - all slices are 17cm tall
    const sliceHeight = 0.17;

    // Total height depends on number of slices (kids are shorter with fewer slices)
    this.height = this.sliceCount * sliceHeight; // 0.85m (kids) to 1.7m (adults)

    this.group = new THREE.Group();
    scene.add(this.group);

    for (let i = 0; i < this.sliceCount; i++) {
      const geometry = new THREE.CylinderGeometry(personRadius, personRadius, sliceHeight * 0.95, 16);
      const material = new THREE.MeshStandardMaterial({
        color: 0xff4466,
        roughness: 0.7,
        metalness: 0.1
      });

      const slice = new THREE.Mesh(geometry, material);
      slice.position.y = (i + 0.5) * sliceHeight;
      slice.userData.visible = false;
      this.group.add(slice);
      this.slices.push(slice);
    }

    // Create bounding box
    const boxWidth = personRadius * 2;
    const boxHeight = this.height;
    const boxDepth = personRadius * 2;

    const boxGeometry = new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth);
    const boxEdges = new THREE.EdgesGeometry(boxGeometry);
    const boxMaterial = new THREE.LineBasicMaterial({ color: 0xffff00, linewidth: 2 });
    this.boundingBox = new THREE.LineSegments(boxEdges, boxMaterial);
    this.boundingBox.position.y = boxHeight / 2;
    this.group.add(this.boundingBox);

    // Create label sprite
    this.label = this.createLabel();
    this.label.position.y = this.height + 0.3; // Above the person
    this.group.add(this.label);

    this.visible = false;
  }

  createLabel() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;

    // Will be updated in updateLabel()
    this.labelCanvas = canvas;
    this.labelContext = context;

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(1, 0.25, 1);

    return sprite;
  }

  updateLabel() {
    if (!this.labelCanvas || !this.labelContext || !hall.bounds) return;

    const ctx = this.labelContext;
    const canvas = this.labelCanvas;
    const origin = hall.origin;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Text
    ctx.fillStyle = 'white';
    ctx.font = 'Bold 24px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const worldZ = origin.z + this.z;
    const boxWidth = this.radius * 2;
    const boxHeight = this.height;
    const boxDepth = this.radius * 2;

    const text = `ID:${this.id} [${this.xOffset.toFixed(2)},${worldZ.toFixed(2)}] [${boxWidth.toFixed(2)}×${boxHeight.toFixed(2)}×${boxDepth.toFixed(2)}]`;
    ctx.fillText(text, 10, 10);

    this.label.material.map.needsUpdate = true;
  }

  update(deltaTime) {
    if (!hall.bounds) return;

    const { W, L } = hall.bounds;
    const origin = hall.origin;

    // Simple, smooth collision avoidance
    const avoidanceRadius = 1.2; // Detection radius
    const personalSpace = 0.5; // Minimum comfortable distance

    let targetSteeringX = 0;
    let speedMultiplier = 1.0;

    for (const other of people) {
      if (other === this) continue;

      const dx = other.xOffset - this.xOffset;
      const dz = other.z - this.z;
      const distance = Math.sqrt(dx * dx + dz * dz);

      if (distance < avoidanceRadius && distance > 0.01) {
        // Check if other person is ahead of us
        const isAhead = (dz * this.direction) > 0;

        if (isAhead && distance < avoidanceRadius) {
          // Simple steering: move away from the other person laterally
          const lateralOffset = dx / distance; // Normalized direction TO other person
          const avoidanceForce = (avoidanceRadius - distance) / avoidanceRadius;

          // Steer away gently (negative to steer AWAY from other person)
          targetSteeringX -= lateralOffset * avoidanceForce * 0.3;

          // Slow down if directly ahead
          if (Math.abs(dx) < 0.5 && distance < personalSpace * 1.5) {
            const slowdown = Math.max(0.3, distance / (personalSpace * 1.5));
            speedMultiplier = Math.min(speedMultiplier, slowdown);
          }
        }
      }
    }

    // Very smooth steering integration
    const steeringSmoothing = 0.08; // Slower smoothing = less jitter
    this.avoidanceX += (targetSteeringX - this.avoidanceX) * steeringSmoothing;

    // Handle dwelling behavior
    if (this.isDwelling) {
      this.dwellTime -= deltaTime;
      if (this.dwellTime <= 0) {
        this.isDwelling = false;
        this.nextDwellCheck = 3 + Math.random() * 5; // Next dwell check in 3-8 seconds
      }
    } else {
      // Move person forward/backward (with collision avoidance speed adjustment)
      this.z += this.speed * this.direction * deltaTime * speedMultiplier;

      // Check if it's time to start dwelling (but not if avoiding someone)
      this.nextDwellCheck -= deltaTime;
      if (this.nextDwellCheck <= 0 && Math.random() < 0.3 && speedMultiplier > 0.8) { // 30% chance to dwell (if not avoiding)
        this.isDwelling = true;
        this.dwellTime = 1 + Math.random() * 3; // Dwell for 1-4 seconds
      }
    }

    // Mark for removal if they exit the hallway (allow up to 2.5m outside to match spawn distance)
    if (this.z > L + 2.5 || this.z < -2.5) {
      this.shouldRemove = true;
      return;
    }

    // Lateral movement using Perlin noise + collision avoidance
    const noiseInput = this.z * 0.5 + this.noiseOffset; // Scale for smooth variation
    const lateralOffset = simpleNoise(noiseInput) * this.lateralSpeed;
    this.xOffset = this.baseXOffset + lateralOffset + this.avoidanceX;

    // Clamp to hallway bounds
    this.xOffset = THREE.MathUtils.clamp(this.xOffset, -W/2 + 0.3, W/2 - 0.3);

    // Update group position
    this.group.position.set(this.xOffset, 0, origin.z + this.z);

    // Check visibility for each slice separately
    let anyVisible = false;
    for (let i = 0; i < this.slices.length; i++) {
      const slice = this.slices[i];
      const sliceWorldPos = new THREE.Vector3();
      slice.getWorldPosition(sliceWorldPos);

      // Check if this slice is visible from any camera (pass 'this' to exclude own slices)
      const sliceVisible = cameras.some(cam => isSliceVisibleToCamera(sliceWorldPos, slice, this, cam));
      slice.userData.visible = sliceVisible;

      // Update color based on visibility
      if (sliceVisible) {
        slice.material.color.setHex(0x22ff66); // Green if visible
        anyVisible = true;
      } else {
        slice.material.color.setHex(0xff4466); // Red if not visible
      }
    }

    this.visible = anyVisible;

    // Update label with current position and dimensions
    this.updateLabel();
  }

  remove() {
    this.slices.forEach(slice => {
      slice.geometry.dispose();
      slice.material.dispose();
    });
    scene.remove(this.group);
  }
}

const people = [];
const peopleSettings = {
  enabled: false,
  count: 3
};

// Generate JSON tracking data for all people
function generateTrackingJSON() {
  if (!hall.bounds) return [];

  const origin = hall.origin;

  return people.map(person => {
    const worldZ = origin.z + person.z;
    return {
      id: person.id,
      centroid: {
        x: parseFloat(person.xOffset.toFixed(3)),
        y: parseFloat((person.height / 2).toFixed(3)),
        z: parseFloat(worldZ.toFixed(3))
      },
      bbox: {
        w: parseFloat((person.radius * 2).toFixed(3)),
        h: parseFloat(person.height.toFixed(3)),
        d: parseFloat((person.radius * 2).toFixed(3))
      },
      visible: person.visible,
      velocity: parseFloat(person.speed.toFixed(3))
    };
  });
}

// Raycast visualization
const raycastSettings = {
  showRays: false
};
const raycastLines = new THREE.Group();
scene.add(raycastLines);

// Display settings
const displaySettings = {
  showProjectors: true
};

function createPeople() {
  // Clear existing
  people.forEach(p => p.remove());
  people.length = 0;

  if (!peopleSettings.enabled || !hall.bounds) return;

  // Spawn initial people
  for (let i = 0; i < peopleSettings.count; i++) {
    spawnPerson();
  }
}

let nextSpawnTime = 0;
const spawnInterval = 4; // Spawn a new person every 4 seconds on average (increased from 2)

function updatePeople(deltaTime) {
  if (!peopleSettings.enabled || !hall.bounds) return;

  // Update existing people
  people.forEach(p => p.update(deltaTime));

  // Remove people who have exited
  for (let i = people.length - 1; i >= 0; i--) {
    if (people[i].shouldRemove) {
      people[i].remove();
      people.splice(i, 1);
    }
  }

  // Spawn new people to maintain population
  nextSpawnTime -= deltaTime;
  if (nextSpawnTime <= 0 && people.length < peopleSettings.count) {
    spawnPerson();
    nextSpawnTime = spawnInterval * (0.7 + Math.random() * 0.6); // More randomization (2.8-5.2s)
  }
}

function spawnPerson() {
  if (!hall.bounds) return;

  const { W, L } = hall.bounds;

  // Randomly choose to spawn at near end (going forward) or far end (going backward)
  const spawnAtNear = Math.random() < 0.5;
  // Vary spawn distance more (1-2m outside hallway) to spread people out
  const spawnDistance = 1 + Math.random() * 1;
  const startZ = spawnAtNear ? -spawnDistance : L + spawnDistance;
  const direction = spawnAtNear ? 1 : -1;

  // Random x position across hallway width
  const xOffset = (Math.random() - 0.5) * W * 0.8; // Stay within 80% of width
  const speed = 0.7 + Math.random() * 0.6; // More speed variation (0.7-1.3 m/s)

  const person = new Person({ startZ, speed, xOffset });
  person.direction = direction;
  people.push(person);
}

// ===== GUI =====
const gui = new GUI({ title: 'Hallway Planner (Three.js)' });

const heatFolder = gui.addFolder('Heatmap');
heatFolder.add(defaults.heatmap, 'cell', 0.1, 1.0, 0.05).name('Cell (m)').onChange(()=> { buildHeatmap(); saveSettings(); });

const peopleFolder = gui.addFolder('People Simulation');
peopleFolder.add(peopleSettings, 'enabled').name('Enable').onChange(()=>{ createPeople(); saveSettings(); });
peopleFolder.add(peopleSettings, 'count', 1, 10, 1).name('Count').onChange(()=>{ createPeople(); saveSettings(); });

const debugFolder = gui.addFolder('Debug');
debugFolder.add(raycastSettings, 'showRays').name('Show Raycasts');

const displayFolder = gui.addFolder('Display');
displayFolder.add(displaySettings, 'showProjectors').name('Show Projectors').onChange((value) => {
  projectors.forEach(proj => {
    proj.group.visible = value;
  });
  saveSettings();
});

function addCameraToGUI(cam){
  const f = gui.addFolder(cam.name);
  f.add(cam.pos, 'x', -defaults.hallway.width_ft*FT/2, defaults.hallway.width_ft*FT/2, 0.05).name('X (m)').onChange(()=>{ cam.build(); updateHeatmap(); saveSettings(); });
  f.add(cam.pos, 'y', 0, defaults.hallway.height_ft*FT, 0.05).name('Y (m)').onChange(()=>{ cam.build(); updateHeatmap(); saveSettings(); });
  f.add(cam.pos, 'z', -5, 5, 0.05).name('Z offset (m)').onChange(()=>{ cam.build(); updateHeatmap(); saveSettings(); });
  f.add(cam, 'yaw', -180, 180, 1).name('Yaw').onChange(()=>{ cam.build(); updateHeatmap(); saveSettings(); });
  f.add(cam, 'pitch', -60, 30, 1).name('Pitch').onChange(()=>{ cam.build(); updateHeatmap(); saveSettings(); });
  f.add(cam, 'roll', -30, 30, 1).name('Roll').onChange(()=>{ cam.build(); updateHeatmap(); saveSettings(); });
  f.add({ remove: ()=>{ scene.remove(cam.group); const i=cameras.indexOf(cam); if(i>=0) cameras.splice(i,1); updateHeatmap(); gui.removeFolder(f); saveSettings(); } }, 'remove').name('Remove');
}

gui.add({reset: ()=>{
  // Reset to defaults (hallway settings are hardcoded)
  defaults.heatmap = { cell: 0.25 };
  peopleSettings.enabled = false;
  peopleSettings.count = 3;
  displaySettings.showProjectors = true;

  // Apply projector visibility
  projectors.forEach(proj => {
    proj.group.visible = displaySettings.showProjectors;
  });

  // Remove camera folders from GUI first (everything after Heatmap and People Simulation)
  const foldersToRemove = gui.folders.slice(2);
  foldersToRemove.forEach(fd => gui.removeFolder(fd));

  // Remove cameras from scene and clear array
  cameras.slice().forEach(c => scene.remove(c.group));
  cameras.length = 0;

  // Create new default cameras
  seedCameras();

  // Add camera GUI folders
  cameras.forEach(addCameraToGUI);

  // Rebuild scene elements
  updateHeatmap();
  createPeople();
  saveSettings();

  // Refresh ALL GUI controllers to show reset values
  gui.controllersRecursive().forEach(c => c.updateDisplay());
}}, 'reset').name('Reset');

// ===== Auto-save to localStorage =====
function saveSettings() {
  const data = {
    heatmap: defaults.heatmap,
    people: peopleSettings,
    display: displaySettings,
    cameras: cameras.map(c=>({
      name: c.name,
      pos: [c.pos.x, c.pos.y, c.pos.z],
      yaw: c.yaw,
      pitch: c.pitch,
      roll: c.roll,
      end: c.end
    })),
    orbitCamera: {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z]
    }
  };
  localStorage.setItem('hallwayPlannerSettings', JSON.stringify(data));

  // Show brief save confirmation
  const status = document.getElementById('status');
  status.textContent = '✓ Saved';
  setTimeout(() => { status.textContent = ''; }, 1500);
}

function loadSettings() {
  const saved = localStorage.getItem('hallwayPlannerSettings');
  if (!saved) return false;

  try {
    const data = JSON.parse(saved);

    // Load heatmap settings
    if (data.heatmap) {
      Object.assign(defaults.heatmap, data.heatmap);
    }

    // Load people settings
    if (data.people) {
      Object.assign(peopleSettings, data.people);
    }

    // Load display settings
    if (data.display) {
      Object.assign(displaySettings, data.display);
      // Apply projector visibility
      projectors.forEach(proj => {
        proj.group.visible = displaySettings.showProjectors;
      });
    }

    // Load orbit camera position and target
    if (data.orbitCamera) {
      camera.position.set(...data.orbitCamera.position);
      controls.target.set(...data.orbitCamera.target);
      controls.update();
    }

    // Load cameras (using hardcoded defaults for locked FOV properties)
    if (data.cameras && data.cameras.length > 0) {
      cameras.slice().forEach(c => scene.remove(c.group));
      cameras.length = 0;

      data.cameras.forEach(cfg => {
        addCamera({
          name: cfg.name,
          pos_m: cfg.pos,
          yawDeg: cfg.yaw,
          pitchDeg: cfg.pitch !== undefined ? cfg.pitch : -8,
          rollDeg: cfg.roll !== undefined ? cfg.roll : 0,
          hFovDeg: 80,   // Hardcoded - FOV locked to match OAK-D Pro PoE stereo cameras
          range_m: 12,   // Hardcoded - range locked
          end: cfg.end
        });
      });

      return true; // Cameras were loaded
    }
  } catch(e) {
    console.error('Failed to load settings:', e);
  }

  return false;
}

// ===== Export/Import =====
function exportJSON(){
  const data = {
    heatmap: defaults.heatmap,
    people: peopleSettings,
    display: displaySettings,
    cameras: cameras.map(c=>({ name:c.name, pos:[c.pos.x,c.pos.y,c.pos.z], yaw:c.yaw, pitch:c.pitch, roll:c.roll, end:c.end })),
    orbitCamera: {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z]
    }
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'hallway_planner.json'; a.click();
}
function importJSON(file){
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);

      // Load heatmap settings
      if (data.heatmap) {
        Object.assign(defaults.heatmap, data.heatmap);
      }

      // Load people settings
      if (data.people) {
        Object.assign(peopleSettings, data.people);
      }

      // Load display settings
      if (data.display) {
        Object.assign(displaySettings, data.display);
        // Apply projector visibility
        projectors.forEach(proj => {
          proj.group.visible = displaySettings.showProjectors;
        });
      }

      // Load orbit camera position and target
      if (data.orbitCamera) {
        camera.position.set(...data.orbitCamera.position);
        controls.target.set(...data.orbitCamera.target);
        controls.update();
      }

      // Clear existing cameras
      cameras.slice().forEach(c=>scene.remove(c.group));
      cameras.length = 0;
      gui.folders.slice(2).forEach(fd=>gui.removeFolder(fd));

      // Load cameras with hardcoded defaults for locked FOV properties
      (data.cameras||[]).forEach(cfg=>{
        const cam = addCamera({
          name: cfg.name,
          pos_m: cfg.pos,
          yawDeg: cfg.yaw,
          pitchDeg: cfg.pitch !== undefined ? cfg.pitch : -8,
          rollDeg: cfg.roll !== undefined ? cfg.roll : 0,
          hFovDeg: 80,   // Hardcoded - FOV locked to match OAK-D Pro PoE stereo cameras
          range_m: 12,   // Hardcoded - range locked
          end: cfg.end
        });
        addCameraToGUI(cam);
      });

      buildHeatmap();
      createPeople();
      updateHeatmap();

      document.getElementById('status').textContent = 'Imported configuration.';
      saveSettings(); // Save imported settings
    } catch(e){ alert('Invalid JSON'); }
  };
  reader.readAsText(file);
}

// ===== Init =====
buildHall();
createProjectors(); // Add the 3 Epson projectors

// Try to load saved settings, otherwise seed default cameras
const hasLoadedSettings = loadSettings();
if (!hasLoadedSettings) {
  seedCameras();
} else {
  // Show load confirmation
  const status = document.getElementById('status');
  status.textContent = '✓ Settings restored';
  setTimeout(() => { status.textContent = ''; }, 2000);
}

// Add cameras to GUI
cameras.forEach(addCameraToGUI);
updateHeatmap();
createPeople(); // Create people if enabled in loaded settings

// Update all GUI displays to reflect loaded values
gui.controllersRecursive().forEach(c => c.updateDisplay());

// ===== Camera preview updates =====
function updateCameraPreviews() {
  if (cameras.length === 0) return; // No cameras yet

  // Find Camera A and B
  const camA = cameras.find(c => c.name === 'Cam A');
  const camB = cameras.find(c => c.name === 'Cam B');

  if (camA && camA.group) {
    // Update world matrices
    scene.updateMatrixWorld();
    camA.group.updateMatrixWorld(true);

    // Set preview camera position to match simulated camera
    previewCameraA.position.copy(camA.group.position);

    // Calculate a point in front of the camera based on its forward direction
    const forward = new THREE.Vector3(0, 0, 1); // Local forward direction
    forward.applyQuaternion(camA.group.quaternion); // Transform to world space
    const lookAtTarget = new THREE.Vector3().addVectors(camA.group.position, forward);

    // Use lookAt to set the camera orientation
    previewCameraA.lookAt(lookAtTarget);
    previewCameraA.updateMatrixWorld();

    // Render from Camera A's perspective
    previewRendererA.render(scene, previewCameraA);
  }

  if (camB && camB.group) {
    // Update world matrices
    scene.updateMatrixWorld();
    camB.group.updateMatrixWorld(true);

    // Set preview camera position to match simulated camera
    previewCameraB.position.copy(camB.group.position);

    // Calculate a point in front of the camera based on its forward direction
    const forward = new THREE.Vector3(0, 0, 1); // Local forward direction
    forward.applyQuaternion(camB.group.quaternion); // Transform to world space
    const lookAtTarget = new THREE.Vector3().addVectors(camB.group.position, forward);

    // Use lookAt to set the camera orientation
    previewCameraB.lookAt(lookAtTarget);
    previewCameraB.updateMatrixWorld();

    // Render from Camera B's perspective
    previewRendererB.render(scene, previewCameraB);
  }
}

// ===== Sidebar Panel Toggles =====
document.querySelectorAll('.panel-toggle').forEach(toggle => {
  toggle.addEventListener('click', () => {
    const panel = toggle.closest('.panel');
    panel.classList.toggle('collapsed');
  });
});

// ===== Render loop =====
let lastTime = performance.now();
function animate(){
  const now = performance.now();
  const deltaTime = Math.min((now - lastTime) / 1000, 0.1); // Cap at 0.1s to prevent huge jumps
  lastTime = now;

  updateWavyGridTexture(now / 1000, deltaTime); // Animate floor texture with physics
  updatePeople(deltaTime);
  updateRaycastVisualization(); // Draw raycast lines after visibility checks
  controls.update();
  renderer.render(scene, camera);

  // Render camera previews
  updateCameraPreviews();

  requestAnimationFrame(animate);
}
animate();

// ===== Tracking JSON Update (24fps) =====
const trackingJsonElement = document.getElementById('tracking-json');
let lastTrackingUpdate = 0;
const trackingFPS = 24;
const trackingInterval = 1000 / trackingFPS; // ~41.67ms

function updateTrackingJSON() {
  const now = performance.now();

  if (now - lastTrackingUpdate >= trackingInterval) {
    lastTrackingUpdate = now;

    const trackingData = generateTrackingJSON();
    if (trackingJsonElement) {
      trackingJsonElement.textContent = JSON.stringify(trackingData, null, 2);
    }
  }

  requestAnimationFrame(updateTrackingJSON);
}
updateTrackingJSON();

// ===== Resize =====
window.addEventListener('resize', ()=>{
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
