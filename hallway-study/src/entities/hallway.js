// ===== Hallway model =====
import * as THREE from 'three';
import { defaults, FT } from '../core/config.js';
import { scene } from '../core/scene.js';
import { createWavyGridTexture, floorTexture } from '../systems/floor-texture.js';

export const hall = { };

export function createDimensionLabel(text) {
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

// These will be set by main app
let buildHeatmapCallback = null;
let createPeopleCallback = null;

export function setBuildHeatmapCallback(callback) {
  buildHeatmapCallback = callback;
}

export function setCreatePeopleCallback(callback) {
  createPeopleCallback = callback;
}

export function buildHall() {
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
  const texture = floorTexture || createWavyGridTexture();

  // Texture is 600x2592 (width x height) matching floor UVs
  // No repeat needed - texture matches floor aspect ratio
  texture.repeat.set(1, 1);

  const floorMat = new THREE.MeshStandardMaterial({
    map: texture,
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

  if (buildHeatmapCallback) buildHeatmapCallback();
  if (createPeopleCallback) createPeopleCallback(); // Recreate people with new hallway dimensions
}
