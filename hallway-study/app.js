// ===== Minimal Hallway Study Application =====
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm';
import { PeopleManager } from './people.js';
import { CameraManager, setGlobalCameraModel, getGlobalCameraModel } from './camera.js';
import { setShowRays, updateRaycastVisualization } from './visibility.js';
import { createFloorTexture, updateFloorTexture } from './floor-texture.js';

// ===== Hallway dimensions (in meters) =====
const hallway = {
  length_m: 13.1064,
  width_m: 2.0574,
  height_m: 3.4538
};

// ===== Scene Setup =====
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e14);

// ===== Camera Setup =====
const perspectiveCamera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
perspectiveCamera.position.set(8, 6, 8);
perspectiveCamera.layers.enableAll(); // Main camera sees all layers (0 and 1)

// Orthographic camera
const frustumSize = 10;
const aspect = window.innerWidth / window.innerHeight;
const orthographicCamera = new THREE.OrthographicCamera(
  frustumSize * aspect / -2,
  frustumSize * aspect / 2,
  frustumSize / 2,
  frustumSize / -2,
  0.1,
  1000
);
orthographicCamera.position.set(8, 6, 8);
orthographicCamera.layers.enableAll();

// Active camera (starts as perspective)
let camera = perspectiveCamera;
let isPerspective = true;

// ===== Renderer Setup =====
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

// ===== Orbit Controls =====
const controls = new OrbitControls(perspectiveCamera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, hallway.height_m / 2, 0);
controls.update();

// Store both cameras' controls
const perspectiveControls = controls;
const orthographicControls = new OrbitControls(orthographicCamera, renderer.domElement);
orthographicControls.enableDamping = true;
orthographicControls.dampingFactor = 0.05;
orthographicControls.target.set(0, hallway.height_m / 2, 0);
orthographicControls.update();
orthographicControls.enabled = false; // Disabled initially

let activeControls = perspectiveControls;

// ===== Transform Controls =====
const transformControls = new TransformControls(perspectiveCamera, renderer.domElement);
transformControls.setMode('translate'); // Start in translate mode
transformControls.setSize(0.5); // Reasonable size
transformControls.setSpace('world'); // Use world space

// Add the root object which contains the gizmo
if (transformControls._root) {
  scene.add(transformControls._root);
  // Put transform controls on layer 1 so they don't appear in camera previews
  transformControls._root.layers.set(1);
  transformControls._root.traverse((child) => {
    child.layers.set(1);
  });

  // Configure TransformControls' internal raycaster to check layer 1
  if (transformControls.getRaycaster) {
    const raycaster = transformControls.getRaycaster();
    raycaster.layers.set(1);
  }
}

// Track if transform controls were recently used
let transformJustUsed = false;
let transformUseTimeout = null;

// Disable OrbitControls when dragging with TransformControls
transformControls.addEventListener('dragging-changed', (event) => {
  activeControls.enabled = !event.value;

  if (event.value) {
    // Started dragging
    transformJustUsed = true;
  } else {
    // Stopped dragging - keep flag set briefly to prevent click from deselecting
    if (transformUseTimeout) clearTimeout(transformUseTimeout);
    transformUseTimeout = setTimeout(() => {
      transformJustUsed = false;
    }, 100);
  }
});

// Update camera position/rotation when transform controls change
let lastUpdateTime = 0;
const UPDATE_THROTTLE = 16; // ~60fps

transformControls.addEventListener('objectChange', () => {
  if (transformControls.object && transformControls.object.userData.camera) {
    const now = performance.now();

    // Throttle updates to avoid too many GUI refreshes
    if (now - lastUpdateTime < UPDATE_THROTTLE) return;
    lastUpdateTime = now;

    const cam = transformControls.object.userData.camera;

    // Update position
    cam.pos.copy(transformControls.object.position);

    // Update rotation from quaternion
    const euler = new THREE.Euler().setFromQuaternion(transformControls.object.quaternion, 'YXZ');
    cam.yaw = THREE.MathUtils.radToDeg(euler.y);
    cam.pitch = THREE.MathUtils.radToDeg(euler.x);
    cam.roll = THREE.MathUtils.radToDeg(euler.z);

    cam.build();

    // Update GUI displays (throttled)
    gui.controllersRecursive().forEach(c => c.updateDisplay());
  }
});

// ===== Lighting =====
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
directionalLight.position.set(5, 10, 5);
directionalLight.castShadow = true;
directionalLight.shadow.camera.left = -10;
directionalLight.shadow.camera.right = 10;
directionalLight.shadow.camera.top = 10;
directionalLight.shadow.camera.bottom = -10;
scene.add(directionalLight);

// ===== Helper function to create dimension labels =====
function createDimensionLabel(text) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.width = 256;
  canvas.height = 64;

  // Draw background
  context.fillStyle = 'rgba(139, 102, 0, 0.5)';
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

// ===== Build Hallway =====
function buildHallway() {
  const L = hallway.length_m;
  const W = hallway.width_m;
  const H = hallway.height_m;

  const hallGroup = new THREE.Group();

  // Floor with interactive texture
  const floorGeo = new THREE.PlaneGeometry(W, L, 1, 1);
  floorGeo.rotateX(-Math.PI / 2);

  // Create interactive floor texture
  const floorTexture = createFloorTexture(hallway);

  const floorMat = new THREE.MeshStandardMaterial({
    map: floorTexture,
    roughness: 0.9,
    metalness: 0.0,
    emissive: 0x000000,
    emissiveMap: floorTexture,
    emissiveIntensity: 0.3 // Add slight glow
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = 0;
  floor.receiveShadow = true;
  hallGroup.add(floor);

  // Half dimensions for convenience
  const hw = W / 2;
  const hl = L / 2;

  // Ceiling outline
  const ceilingLineMat = new THREE.LineBasicMaterial({ color: 0x314150, linewidth: 1 });
  const ceilingShape = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-hw, H, -hl),
    new THREE.Vector3(hw, H, -hl),
    new THREE.Vector3(hw, H, hl),
    new THREE.Vector3(-hw, H, hl),
    new THREE.Vector3(-hw, H, -hl)
  ]);
  const ceilingOutline = new THREE.Line(ceilingShape, ceilingLineMat);
  hallGroup.add(ceilingOutline);

  // Wall outlines
  const wallMat = new THREE.LineBasicMaterial({ color: 0x314150, linewidth: 1 });
  const wallShape = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-hw, 0.001, -hl),
    new THREE.Vector3(hw, 0.001, -hl),
    new THREE.Vector3(hw, 0.001, hl),
    new THREE.Vector3(-hw, 0.001, hl),
    new THREE.Vector3(-hw, 0.001, -hl)
  ]);
  const wallOutline = new THREE.Line(wallShape, wallMat);
  hallGroup.add(wallOutline);

  // Vertical corner lines
  const corners = [
    [-hw, -hl], [hw, -hl], [hw, hl], [-hw, hl]
  ];
  corners.forEach(([x, z]) => {
    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 0, z),
      new THREE.Vector3(x, H, z)
    ]);
    const line = new THREE.Line(lineGeo, wallMat);
    hallGroup.add(line);
  });

  // Grid on floor (layer 1 - hide from camera previews)
  const grid = new THREE.GridHelper(L, Math.max(6, Math.round(L)), 0x233140, 0x1a2633);
  grid.rotation.y = Math.PI / 2;
  grid.position.y = 0.001;
  grid.layers.set(1);
  hallGroup.add(grid);

  // Axis helper (layer 1 - hide from camera previews)
  const axes = new THREE.AxesHelper(1.5);
  axes.position.set(0, 0.003, -hl + 0.5);
  axes.layers.set(1);
  hallGroup.add(axes);

  // Dimension arrows and labels
  const dimColor = 0x8b6600;
  const dimOffset = 0.3;

  // Length dimension (Z axis) - layer 1 (hide from camera previews)
  const lengthArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(-hw - dimOffset, 0.1, -hl),
    L,
    dimColor,
    0.3,
    0.2
  );
  lengthArrow.traverse(child => child.layers.set(1));
  hallGroup.add(lengthArrow);

  const lengthLabel = createDimensionLabel(`${L.toFixed(2)} m`);
  lengthLabel.position.set(-hw - dimOffset - 0.3, 0.5, 0);
  lengthLabel.layers.set(1);
  hallGroup.add(lengthLabel);

  // Width dimension (X axis) - layer 1 (hide from camera previews)
  const widthArrow = new THREE.ArrowHelper(
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-hw, 0.1, -hl - dimOffset),
    W,
    dimColor,
    0.3,
    0.2
  );
  widthArrow.traverse(child => child.layers.set(1));
  hallGroup.add(widthArrow);

  const widthLabel = createDimensionLabel(`${W.toFixed(2)} m`);
  widthLabel.position.set(0, 0.5, -hl - dimOffset - 0.3);
  widthLabel.layers.set(1);
  hallGroup.add(widthLabel);

  // Height dimension (Y axis) - layer 1 (hide from camera previews)
  const heightArrow = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(-hw - dimOffset, 0, -hl - dimOffset),
    H,
    dimColor,
    0.3,
    0.2
  );
  heightArrow.traverse(child => child.layers.set(1));
  hallGroup.add(heightArrow);

  const heightLabel = createDimensionLabel(`${H.toFixed(2)} m`);
  heightLabel.position.set(-hw - dimOffset - 0.3, H / 2, -hl - dimOffset - 0.3);
  heightLabel.layers.set(1);
  hallGroup.add(heightLabel);

  scene.add(hallGroup);
}

// ===== Build the scene =====
buildHallway();

// ===== People Simulation =====
const peopleManager = new PeopleManager(scene, hallway);
peopleManager.setCount(3); // Start with 3 people
peopleManager.setEnabled(true);

// ===== Camera System =====
const cameraManager = new CameraManager(scene, hallway, renderer);

// ===== Raycast Visualization =====
const raycastLines = new THREE.Group();
raycastLines.layers.set(1); // Hide from camera previews
scene.add(raycastLines);

// Camera preview setup (old single preview)
const previewCanvas = document.getElementById('preview-canvas');
const previewRenderer = new THREE.WebGLRenderer({ canvas: previewCanvas, antialias: true });
previewRenderer.setSize(320, 200);
const previewPanel = document.getElementById('camera-preview');

let activeCamera = null; // Currently selected camera for preview
let activeCameraFolder = null; // Currently selected camera's GUI folder

// Multi-camera preview setup
const multiPreviewPanel = document.getElementById('multi-preview-panel');
const togglePreviewsBtn = document.getElementById('toggle-previews');
const previewCountSpan = document.getElementById('preview-count');
const previewList = document.getElementById('preview-list');
const cameraPreviewItems = new Map(); // Map camera ID to preview element

// Collapse/expand functionality
let previewsPanelCollapsed = false;
togglePreviewsBtn.addEventListener('click', () => {
  previewsPanelCollapsed = !previewsPanelCollapsed;
  if (previewsPanelCollapsed) {
    multiPreviewPanel.classList.add('collapsed');
  } else {
    multiPreviewPanel.classList.remove('collapsed');
  }
});

// Start collapsed
multiPreviewPanel.classList.add('collapsed');
previewsPanelCollapsed = true;

// Function to create a preview item for a camera
function createCameraPreviewItem(cam) {
  // Create container
  const item = document.createElement('div');
  item.className = 'camera-preview-item';
  item.dataset.cameraId = cam.id;
  item.draggable = true;

  // Create header with camera name
  const header = document.createElement('div');
  header.className = 'preview-item-header';
  header.textContent = cam.name;
  item.appendChild(header);

  // Create canvas for preview
  const canvas = document.createElement('canvas');
  canvas.className = 'preview-item-canvas';
  canvas.width = 220;
  canvas.height = 138;
  item.appendChild(canvas);

  // Create renderer for this preview
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(220, 138);

  // Store renderer and canvas on the item
  item.previewRenderer = renderer;
  item.previewCanvas = canvas;
  item.camera = cam;

  // Click to select camera
  item.addEventListener('click', () => {
    selectCamera(cam);
  });

  // Drag-and-drop for reordering
  item.addEventListener('dragstart', handleDragStart);
  item.addEventListener('dragover', handleDragOver);
  item.addEventListener('drop', handleDrop);
  item.addEventListener('dragend', handleDragEnd);

  // Add to list
  previewList.appendChild(item);
  cameraPreviewItems.set(cam.id, item);

  // Update count
  updatePreviewCount();

  // Expand panel on first camera
  if (cameraPreviewItems.size === 1 && previewsPanelCollapsed) {
    previewsPanelCollapsed = false;
    multiPreviewPanel.classList.remove('collapsed');
  }

  return item;
}

// Function to remove a preview item
function removeCameraPreviewItem(cam) {
  const item = cameraPreviewItems.get(cam.id);
  if (item) {
    item.previewRenderer.dispose();
    item.remove();
    cameraPreviewItems.delete(cam.id);
    updatePreviewCount();

    // Collapse panel when last camera is removed
    if (cameraPreviewItems.size === 0 && !previewsPanelCollapsed) {
      previewsPanelCollapsed = true;
      multiPreviewPanel.classList.add('collapsed');
    }
  }
}

// Update preview count display
function updatePreviewCount() {
  const count = cameraPreviewItems.size;
  previewCountSpan.textContent = `Camera Previews (${count})`;
}

// Drag-and-drop handlers
let draggedItem = null;

function handleDragStart(e) {
  draggedItem = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';

  const afterElement = getDragAfterElement(previewList, e.clientX);
  if (afterElement == null) {
    previewList.appendChild(draggedItem);
  } else {
    previewList.insertBefore(draggedItem, afterElement);
  }

  return false;
}

function handleDrop(e) {
  if (e.stopPropagation) {
    e.stopPropagation();
  }
  return false;
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  draggedItem = null;
}

function getDragAfterElement(container, x) {
  const draggableElements = [...container.querySelectorAll('.camera-preview-item:not(.dragging)')];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = x - box.left - box.width / 2;

    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Raycaster for click detection
const raycaster = new THREE.Raycaster();
raycaster.layers.set(1); // Only raycast against layer 1 (cameras and UI elements)
const mouse = new THREE.Vector2();

// ===== Document Management System =====
let documentDirty = false;
let documentName = 'Untitled';

function serializeDocument() {
  return {
    version: 1,
    name: documentName,
    timestamp: Date.now(),
    cameras: cameraManager.cameras.map(cam => ({
      id: cam.id,
      name: cam.name,
      pos: { x: cam.pos.x, y: cam.pos.y, z: cam.pos.z },
      yaw: cam.yaw,
      pitch: cam.pitch,
      roll: cam.roll
    })),
    orbitControls: {
      position: {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z
      },
      target: {
        x: activeControls.target.x,
        y: activeControls.target.y,
        z: activeControls.target.z
      }
    },
    settings: {
      peopleCount: peopleSettings.count,
      showFrustums: transformSettings.showFrustums,
      showRaycasts: transformSettings.showRaycasts,
      isPerspective: isPerspective,
      cameraModel: getGlobalCameraModel()
    }
  };
}

function deserializeDocument(data) {
  if (!data || data.version !== 1) {
    console.error('Invalid or unsupported document version');
    return false;
  }

  // Clear existing cameras (with GUI and preview cleanup)
  while (cameraManager.cameras.length > 0) {
    const cam = cameraManager.cameras[0];
    if (cam.guiFolder) {
      cam.guiFolder.destroy();
    }
    removeCameraPreviewItem(cam);
    cameraManager.removeCamera(cam);
  }

  // Deselect any active camera
  deselectAllCameras();

  // Restore global camera model first
  if (data.settings.cameraModel) {
    setGlobalCameraModel(data.settings.cameraModel);
    cameraModelSettings.model = data.settings.cameraModel;
  }

  // Restore cameras
  data.cameras.forEach(camData => {
    const cam = cameraManager.addCamera({
      name: camData.name,
      pos_m: [camData.pos.x, camData.pos.y, camData.pos.z],
      yawDeg: camData.yaw,
      pitchDeg: camData.pitch,
      rollDeg: camData.roll
    });

    // Set frustum visibility
    if (cam.frustumHelper) {
      cam.frustumHelper.visible = data.settings.showFrustums;
    }
    if (cam.frustumMesh) {
      cam.frustumMesh.visible = data.settings.showFrustums;
    }

    addCameraToGUI(cam);
    createCameraPreviewItem(cam);
  });

  // Restore orbit controls
  camera.position.set(
    data.orbitControls.position.x,
    data.orbitControls.position.y,
    data.orbitControls.position.z
  );
  activeControls.target.set(
    data.orbitControls.target.x,
    data.orbitControls.target.y,
    data.orbitControls.target.z
  );
  activeControls.update();

  // Restore settings
  peopleSettings.count = data.settings.peopleCount;
  peopleManager.setCount(data.settings.peopleCount);

  transformSettings.showFrustums = data.settings.showFrustums;
  transformSettings.showRaycasts = data.settings.showRaycasts;
  setShowRays(data.settings.showRaycasts);

  // Restore camera mode
  if (data.settings.isPerspective !== isPerspective) {
    toggleCameraMode();
  }

  documentName = data.name || 'Untitled';
  documentDirty = false;
  updateDocumentTitle();

  // Refresh all GUI controllers to show updated values
  gui.controllersRecursive().forEach(c => c.updateDisplay());

  return true;
}

// Preset documents loaded from JSON file
let presetDocuments = [];

// Load and process presets from JSON file
async function loadPresetDocuments() {
  try {
    const response = await fetch('./presets.json');
    const presetsRaw = await response.json();

    const { width_m, height_m, length_m } = hallway;

    // Helper function to evaluate string expressions
    function evalExpression(expr) {
      if (typeof expr === 'number') return expr;
      if (typeof expr === 'string') {
        // Create a safe evaluation context with hallway dimensions
        try {
          return eval(expr);
        } catch (e) {
          console.error(`Failed to evaluate expression: ${expr}`, e);
          return 0;
        }
      }
      return expr;
    }

    // Process each preset to evaluate expressions
    presetDocuments = presetsRaw.map(preset => ({
      name: preset.name,
      cameras: preset.cameras.map(cam => ({
        id: cam.id,
        name: cam.name,
        pos: {
          x: evalExpression(cam.pos.x),
          y: evalExpression(cam.pos.y),
          z: evalExpression(cam.pos.z)
        },
        yaw: cam.yaw,
        pitch: cam.pitch,
        roll: cam.roll
      })),
      orbitControls: {
        position: {
          x: evalExpression(preset.orbitControls.position.x),
          y: evalExpression(preset.orbitControls.position.y),
          z: evalExpression(preset.orbitControls.position.z)
        },
        target: {
          x: evalExpression(preset.orbitControls.target.x),
          y: evalExpression(preset.orbitControls.target.y),
          z: evalExpression(preset.orbitControls.target.z)
        }
      },
      settings: preset.settings
    }));

    console.log('Loaded preset documents:', presetDocuments.length);
  } catch (e) {
    console.error('Failed to load preset documents:', e);
    presetDocuments = [];
  }
}

function getPresetDocuments() {
  return presetDocuments;
}

function getPresetDocument(name) {
  const presets = getPresetDocuments();
  const preset = presets.find(p => p.name === name);
  if (preset) {
    return {
      version: 1,
      name: preset.name,
      timestamp: Date.now(),
      cameras: preset.cameras,
      orbitControls: preset.orbitControls,
      settings: preset.settings
    };
  }
  return null;
}

function isPresetDocument(name) {
  const presets = getPresetDocuments();
  return presets.some(p => p.name === name);
}

function exportCurrentAsPresetJSON() {
  const { width_m, height_m, length_m } = hallway;

  // Helper to convert number back to expression string
  function toExpression(value, context) {
    // Check for common patterns and convert back to expressions
    if (context === 'height_m' && Math.abs(value - height_m) < 0.001) {
      return 'height_m';
    }
    if (context === 'height_m/2' && Math.abs(value - height_m / 2) < 0.001) {
      return 'height_m / 2';
    }

    // Check for Z expressions
    if (context === 'z') {
      const halfLength = length_m / 2;
      if (Math.abs(value - (-halfLength - 2)) < 0.001) return '-length_m / 2 - 2';
      if (Math.abs(value - (halfLength + 2)) < 0.001) return 'length_m / 2 + 2';
      if (Math.abs(value - (-halfLength + length_m * 0.25)) < 0.001) return '-length_m / 2 + length_m * 0.25';
      if (Math.abs(value - (-halfLength + length_m * 0.5)) < 0.001) return '-length_m / 2 + length_m * 0.5';
      if (Math.abs(value - (-halfLength + length_m * 0.75)) < 0.001) return '-length_m / 2 + length_m * 0.75';
    }

    // Check for X expressions
    if (context === 'x') {
      if (Math.abs(value - (-width_m / 2)) < 0.001) return '-width_m / 2';
      if (Math.abs(value - (width_m / 2)) < 0.001) return 'width_m / 2';
    }

    // Default: return as number
    return value;
  }

  const preset = {
    name: documentName,
    cameras: cameraManager.cameras.map(cam => ({
      id: cam.id,
      name: cam.name,
      pos: {
        x: toExpression(cam.pos.x, 'x'),
        y: toExpression(cam.pos.y, 'height_m'),
        z: toExpression(cam.pos.z, 'z')
      },
      yaw: cam.yaw,
      pitch: cam.pitch,
      roll: cam.roll
    })),
    orbitControls: {
      position: {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z
      },
      target: {
        x: activeControls.target.x,
        y: toExpression(activeControls.target.y, 'height_m/2'),
        z: activeControls.target.z
      }
    },
    settings: {
      peopleCount: peopleSettings.count,
      showFrustums: transformSettings.showFrustums,
      showRaycasts: transformSettings.showRaycasts,
      isPerspective: isPerspective,
      cameraModel: getGlobalCameraModel()
    }
  };

  const json = JSON.stringify(preset, null, 2);

  // Copy to clipboard
  navigator.clipboard.writeText(json).then(() => {
    console.log('Preset JSON copied to clipboard!');
    console.log(json);
    alert('Preset JSON copied to clipboard!\n\nPaste this into presets.json to update the preset.\n\nThe JSON has also been logged to the console.');
  }).catch(err => {
    console.error('Failed to copy to clipboard:', err);
    console.log('Preset JSON:');
    console.log(json);
    alert('Could not copy to clipboard. Check the console for the JSON.');
  });
}

function getAllDocumentNames() {
  const names = [];

  // Add preset documents first
  const presets = getPresetDocuments();
  presets.forEach(preset => names.push(preset.name));

  // Add saved documents from localStorage
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('hallway-study-doc:')) {
      names.push(key.replace('hallway-study-doc:', ''));
    }
  }

  return names.sort();
}

function saveDocument() {
  if (documentName === 'Untitled' || !documentName) {
    return saveDocumentAs();
  }

  // Skip saving over a preset (silently)
  const presetData = getPresetDocument(documentName);
  if (presetData) {
    return false;
  }

  const data = serializeDocument();
  try {
    localStorage.setItem(`hallway-study-doc:${documentName}`, JSON.stringify(data));
    documentDirty = false;
    updateDocumentTitle();
    console.log(`Document "${documentName}" saved to localStorage`);

    // Refresh dropdown to show updated document list
    if (typeof refreshDocumentDropdown === 'function') {
      refreshDocumentDropdown();
    }

    return true;
  } catch (e) {
    console.error('Failed to save document:', e);
    alert('Failed to save document. localStorage might be full or disabled.');
    return false;
  }
}

function saveDocumentAs() {
  const newName = prompt('Enter document name:', documentName);
  if (!newName || newName.trim() === '') return false;

  const trimmedName = newName.trim();

  // Check if trying to overwrite a preset
  const presetData = getPresetDocument(trimmedName);
  if (presetData) {
    alert(`"${trimmedName}" is a preset document and cannot be overwritten. Please choose a different name.`);
    return false;
  }

  // Check if document already exists in localStorage
  const existingNames = getAllDocumentNames();
  if (existingNames.includes(trimmedName) && trimmedName !== documentName) {
    const overwrite = confirm(`Document "${trimmedName}" already exists. Overwrite?`);
    if (!overwrite) return false;
  }

  documentName = trimmedName;
  return saveDocument();
}

function newDocument() {
  if (documentDirty) {
    const confirmed = confirm('You have unsaved changes. Create new document anyway?');
    if (!confirmed) return;
  }

  // Clear all cameras (with GUI and preview cleanup)
  while (cameraManager.cameras.length > 0) {
    const cam = cameraManager.cameras[0];
    if (cam.guiFolder) {
      cam.guiFolder.destroy();
    }
    removeCameraPreviewItem(cam);
    cameraManager.removeCamera(cam);
  }

  // Deselect any active camera
  deselectAllCameras();

  // Reset settings
  peopleSettings.count = 3;
  peopleManager.setCount(3);

  documentName = 'Untitled';
  documentDirty = false;
  updateDocumentTitle();

  // Refresh dropdown to show Untitled
  if (typeof refreshDocumentDropdown === 'function') {
    refreshDocumentDropdown();
  }

  console.log('New document created');
}

function markDocumentDirty() {
  if (!documentDirty) {
    documentDirty = true;
    updateDocumentTitle();
  }
}

function updateDocumentTitle() {
  const dirtyMarker = documentDirty ? '• ' : '';
  gui.title(`${dirtyMarker}${documentName} - Hallway Study`);
}

// Warn before closing with unsaved changes (unless it's a preset)
window.addEventListener('beforeunload', (e) => {
  if (documentDirty && !getPresetDocument(documentName)) {
    e.preventDefault();
    // Modern browsers will show a generic "unsaved changes" dialog
  }
});

// Auto-save every 30 seconds
setInterval(() => {
  if (documentDirty && documentName !== 'Untitled' && !getPresetDocument(documentName)) {
    saveDocument();
    console.log('Auto-saved');
  }
}, 30000);


// Always start with a fresh document - user can open saved docs via dropdown

// ===== GUI Setup =====
const gui = new GUI({ title: 'Hallway Study' });
updateDocumentTitle();

// File Menu
const fileFolder = gui.addFolder('File');

// Document dropdown
const documentDropdownSettings = { currentDocument: documentName };
let documentDropdownController = null;

function refreshDocumentDropdown() {
  const savedDocs = getAllDocumentNames();
  const choices = {};

  // Add current document if it's Untitled (not in saved list)
  if (documentName === 'Untitled' || !savedDocs.includes(documentName)) {
    choices['Untitled'] = 'Untitled';
  }

  // Add all saved documents (with lock emoji for presets)
  savedDocs.forEach(name => {
    const isPreset = getPresetDocument(name) !== null;
    const displayName = isPreset ? `🔒 ${name}` : name;
    choices[displayName] = name;
  });

  // Remove old controller if it exists
  if (documentDropdownController) {
    documentDropdownController.destroy();
  }

  // Update the setting value (find the display name for current document)
  const currentIsPreset = getPresetDocument(documentName) !== null;
  const currentDisplayName = currentIsPreset ? `🔒 ${documentName}` : documentName;
  documentDropdownSettings.currentDocument = currentDisplayName;

  // Create new controller with updated choices
  documentDropdownController = fileFolder.add(documentDropdownSettings, 'currentDocument', choices)
    .name('Open Document')
    .onChange((selectedDoc) => {
      if (selectedDoc === documentName) return; // Already open

      if (documentDirty) {
        const save = confirm('You have unsaved changes. Save before switching documents?');
        if (save) {
          saveDocument();
        }
      }

      try {
        let data = null;

        // Check if it's a preset document first
        const presetData = getPresetDocument(selectedDoc);
        if (presetData) {
          data = presetData;
        } else {
          // Try to load from localStorage
          const saved = localStorage.getItem(`hallway-study-doc:${selectedDoc}`);
          if (!saved) {
            alert(`Document "${selectedDoc}" not found.`);
            // Reset dropdown to current document (with emoji if preset)
            const currentIsPreset = getPresetDocument(documentName) !== null;
            documentDropdownSettings.currentDocument = currentIsPreset ? `🔒 ${documentName}` : documentName;
            documentDropdownController.updateDisplay();
            return;
          }
          data = JSON.parse(saved);
        }

        deserializeDocument(data);
        refreshDocumentDropdown(); // Refresh to update current selection
      } catch (e) {
        console.error('Failed to load document:', e);
        alert('Failed to load document. The saved data might be corrupted.');
        // Reset dropdown to current document (with emoji if preset)
        const currentIsPreset = getPresetDocument(documentName) !== null;
        documentDropdownSettings.currentDocument = currentIsPreset ? `🔒 ${documentName}` : documentName;
        documentDropdownController.updateDisplay();
      }
    });
}

// Initialize presets and dropdown
(async function initializeDocuments() {
  await loadPresetDocuments();

  // Load the first preset by default
  const presets = getPresetDocuments();
  if (presets.length > 0) {
    const firstPreset = getPresetDocument(presets[0].name);
    if (firstPreset) {
      deserializeDocument(firstPreset);
    }
  }

  refreshDocumentDropdown();
})();

fileFolder.add({ newDoc: newDocument }, 'newDoc').name('New Document');
fileFolder.add({ save: saveDocument }, 'save').name('Save (Ctrl+S)');
fileFolder.add({ saveAs: saveDocumentAs }, 'saveAs').name('Save As...');

// Import/Export subfolder
const importExportFolder = fileFolder.addFolder('Import/Export');
importExportFolder.add({ exportPreset: exportCurrentAsPresetJSON }, 'exportPreset').name('📋 Copy as Preset JSON');
importExportFolder.add({
  export: () => {
    const data = serializeDocument();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${documentName}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}, 'export').name('Export JSON');
importExportFolder.add({
  import: () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target.result);
          deserializeDocument(data);
          refreshDocumentDropdown(); // Refresh after import
        } catch (err) {
          alert('Failed to import document. Invalid JSON file.');
          console.error(err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }
}, 'import').name('Import JSON');
importExportFolder.close(); // Collapsed by default

// People Simulation Panel
const peopleFolder = gui.addFolder('People Simulation');
const peopleSettings = {
  count: 3
};

peopleFolder.add(peopleSettings, 'count', 0, 12, 1).name('Count').onChange((value) => {
  peopleManager.setCount(value);
  markDocumentDirty();
});

peopleFolder.open();

// Cameras Panel
const camerasFolder = gui.addFolder('Cameras');

// Global Camera Model Selection
const cameraModelSettings = {
  model: 'OAK-D Pro PoE'
};

camerasFolder.add(cameraModelSettings, 'model', ['OAK-D Pro PoE', 'OAK-D Pro W PoE'])
  .name('Camera Model')
  .onChange((value) => {
    setGlobalCameraModel(value);
    // Update all existing cameras
    cameraManager.cameras.forEach(cam => {
      cam.refreshForModelChange();
      // Update specs display if camera has GUI
      if (cam.specsData && cam.specsControllers) {
        updateCameraSpecsDisplay(cam);
      }
    });
    markDocumentDirty();
  });

// Transform mode toolbar (in top-left corner)
const transformToolbar = document.querySelector('.transform-toolbar');
const translateBtn = document.getElementById('translate-mode');
const rotateBtn = document.getElementById('rotate-mode');

function setTransformMode(mode) {
  transformControls.setMode(mode);

  // Update button states
  if (mode === 'translate') {
    translateBtn.classList.add('active');
    rotateBtn.classList.remove('active');
  } else if (mode === 'rotate') {
    translateBtn.classList.remove('active');
    rotateBtn.classList.add('active');
  }
}

translateBtn.addEventListener('click', () => setTransformMode('translate'));
rotateBtn.addEventListener('click', () => setTransformMode('rotate'));

// Keyboard shortcuts
window.addEventListener('keydown', (event) => {
  // Ctrl+S to save
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault();
    saveDocument();
    return;
  }

  // Transform modes (like Unity)
  if (event.key === 'w' || event.key === 'W') {
    setTransformMode('translate');
  } else if (event.key === 'e' || event.key === 'E') {
    setTransformMode('rotate');
  }
});

// Frustum visibility toggle
const transformSettings = {
  showFrustums: true,
  showRaycasts: false
};

camerasFolder.add(transformSettings, 'showFrustums').name('Show Frustums').onChange((value) => {
  cameraManager.cameras.forEach(cam => {
    if (cam.frustumHelper) {
      cam.frustumHelper.visible = value;
    }
    if (cam.frustumMesh) {
      cam.frustumMesh.visible = value;
    }
  });
  markDocumentDirty();
});

camerasFolder.add(transformSettings, 'showRaycasts').name('Show Raycasts').onChange((value) => {
  setShowRays(value);
  markDocumentDirty();
});

// Function to select a camera
function selectCamera(cam) {
  // Deselect previous camera
  if (activeCamera) {
    activeCamera.setSelected(false);

    // Remove selection from previous preview item
    const prevItem = cameraPreviewItems.get(activeCamera.id);
    if (prevItem) {
      prevItem.classList.remove('selected');
    }
  }

  // Hide previous camera folder
  if (activeCameraFolder) {
    activeCameraFolder.hide();
  }

  // Show new camera folder
  const folder = cam.guiFolder;
  if (folder) {
    folder.show();
    folder.open();
    activeCameraFolder = folder;
  }

  // Update active camera
  activeCamera = cam;
  activeCamera.setSelected(true);
  previewPanel.classList.add('active');

  // Highlight selected preview item
  const item = cameraPreviewItems.get(cam.id);
  if (item) {
    item.classList.add('selected');
  }

  // Show transform toolbar
  transformToolbar.style.display = 'flex';

  // Attach transform controls
  transformControls.attach(cam.group);
}

// Function to deselect all cameras
function deselectAllCameras() {
  if (activeCamera) {
    activeCamera.setSelected(false);

    // Remove selection from preview item
    const item = cameraPreviewItems.get(activeCamera.id);
    if (item) {
      item.classList.remove('selected');
    }
  }

  if (activeCameraFolder) {
    activeCameraFolder.hide();
  }

  activeCamera = null;
  activeCameraFolder = null;
  previewPanel.classList.remove('active');
  transformToolbar.style.display = 'none';
  transformControls.detach();
}

// Add Camera button
camerasFolder.add({
  addCamera: () => {
    const newCamera = cameraManager.addCamera({
      name: `Cam ${String.fromCharCode(64 + cameraManager.cameras.length + 1)}`,
      pos_m: [0, hallway.height_m - 0.5, 0],
      yawDeg: 0,
      pitchDeg: -10,
      rollDeg: 0
    });

    // Set frustum visibility to match current setting
    if (newCamera.frustumHelper) {
      newCamera.frustumHelper.visible = transformSettings.showFrustums;
    }
    if (newCamera.frustumMesh) {
      newCamera.frustumMesh.visible = transformSettings.showFrustums;
    }

    addCameraToGUI(newCamera);

    // Create preview item for the new camera
    createCameraPreviewItem(newCamera);

    // Automatically select the new camera
    selectCamera(newCamera);

    // Mark document as dirty
    markDocumentDirty();
  }
}, 'addCamera').name('Add Camera');

// Function to update camera specs display when model changes
function updateCameraSpecsDisplay(cam) {
  // Update the spec values
  if (cam.specsData) {
    cam.specsData['H-FOV'] = `${cam.hFovDeg}°`;
    cam.specsData['V-FOV'] = `${cam.vFovDeg}°`;
    cam.specsData['Min Range'] = `${cam.minRange_m}m`;
    cam.specsData['Max Range'] = `${cam.maxRange_m}m`;
  }

  // Refresh the controllers to show new values
  if (cam.specsControllers) {
    cam.specsControllers.hFov.updateDisplay();
    cam.specsControllers.vFov.updateDisplay();
    cam.specsControllers.minRange.updateDisplay();
    cam.specsControllers.maxRange.updateDisplay();
  }
}

// Function to add camera controls to GUI
function addCameraToGUI(cam) {
  const camFolder = gui.addFolder(cam.name);

  // Store folder reference on camera
  cam.guiFolder = camFolder;

  // Camera Specs (read-only information)
  const specsFolder = camFolder.addFolder('Camera Specs');
  const specs = {
    'H-FOV': `${cam.hFovDeg}°`,
    'V-FOV': `${cam.vFovDeg}°`,
    'Min Range': `${cam.minRange_m}m`,
    'Max Range': `${cam.maxRange_m}m`
  };

  const hFovController = specsFolder.add(specs, 'H-FOV').name('Horizontal FOV').disable();
  const vFovController = specsFolder.add(specs, 'V-FOV').name('Vertical FOV').disable();
  const minRangeController = specsFolder.add(specs, 'Min Range').name('Min Range').disable();
  const maxRangeController = specsFolder.add(specs, 'Max Range').name('Max Range').disable();

  // Store controllers for updating
  cam.specsControllers = {
    hFov: hFovController,
    vFov: vFovController,
    minRange: minRangeController,
    maxRange: maxRangeController
  };
  cam.specsData = specs;

  // Position controls (number inputs with drag-to-change, no min/max constraints)
  camFolder.add(cam.pos, 'x').name('X (m)').step(0.01).decimals(4).onChange(() => {
    cam.build();
    markDocumentDirty();
  });
  camFolder.add(cam.pos, 'y').name('Y (m)').step(0.01).decimals(4).onChange(() => {
    cam.build();
    markDocumentDirty();
  });
  camFolder.add(cam.pos, 'z').name('Z (m)').step(0.01).decimals(4).onChange(() => {
    cam.build();
    markDocumentDirty();
  });

  // Rotation controls
  camFolder.add(cam, 'yaw', -180, 180, 1).name('Yaw (°)').onChange(() => {
    cam.build();
    markDocumentDirty();
  });
  camFolder.add(cam, 'pitch', -90, 90, 1).name('Pitch (°)').onChange(() => {
    cam.build();
    markDocumentDirty();
  });
  camFolder.add(cam, 'roll', -180, 180, 1).name('Roll (°)').onChange(() => {
    cam.build();
    markDocumentDirty();
  });

  // Remove camera button
  camFolder.add({
    remove: () => {
      // If this was the active camera, deselect it
      if (activeCamera === cam) {
        deselectAllCameras();
      }

      // Remove preview item
      removeCameraPreviewItem(cam);

      cameraManager.removeCamera(cam);
      camFolder.destroy();

      // Mark document as dirty
      markDocumentDirty();
    }
  }, 'remove').name('Remove');

  // Start hidden (will be shown when selected)
  camFolder.hide();
}

camerasFolder.open();

// ===== Perspective/Orthographic Toggle =====
const cameraModeBtn = document.getElementById('camera-mode');
const viewLabel = document.getElementById('view-label');

function toggleCameraMode() {
  isPerspective = !isPerspective;

  if (isPerspective) {
    // Switch to perspective
    camera = perspectiveCamera;
    activeControls = perspectiveControls;

    // Copy position and target from ortho to persp
    perspectiveCamera.position.copy(orthographicCamera.position);
    perspectiveControls.target.copy(orthographicControls.target);

    orthographicControls.enabled = false;
    perspectiveControls.enabled = true;

    viewLabel.textContent = 'PERSP';
  } else {
    // Switch to orthographic
    camera = orthographicCamera;
    activeControls = orthographicControls;

    // Copy position and target from persp to ortho
    orthographicCamera.position.copy(perspectiveCamera.position);
    orthographicControls.target.copy(perspectiveControls.target);

    perspectiveControls.enabled = false;
    orthographicControls.enabled = true;

    viewLabel.textContent = 'ORTHO';
  }

  // Update transform controls camera
  transformControls.camera = camera;

  // Update controls
  activeControls.update();
}

cameraModeBtn.addEventListener('click', toggleCameraMode);

// ===== Click to select camera =====
renderer.domElement.addEventListener('click', (event) => {
  // Calculate mouse position in normalized device coordinates (-1 to +1)
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  // Update raycaster
  raycaster.setFromCamera(mouse, camera);

  // Check for intersections with camera click boxes FIRST (highest priority)
  const clickBoxes = [];
  cameraManager.cameras.forEach(cam => {
    if (cam.clickBox) {
      clickBoxes.push({ object: cam.clickBox, camera: cam });
    }
  });

  // Raycast against click boxes
  const cameraIntersects = raycaster.intersectObjects(clickBoxes.map(c => c.object));

  if (cameraIntersects.length > 0) {
    // Find which camera was clicked
    const clickedObject = cameraIntersects[0].object;
    const clickedCameraData = clickBoxes.find(c => c.object === clickedObject);

    if (clickedCameraData) {
      selectCamera(clickedCameraData.camera);
      return; // Exit early - we found a camera to select
    }
  }

  // Check if transform controls were just used (dragged)
  // If so, don't deselect - the user was manipulating the camera
  if (transformJustUsed) {
    return;
  }

  // Clicked on empty space - deselect all cameras
  deselectAllCameras();
});

// ===== Window resize handler =====
window.addEventListener('resize', () => {
  const aspect = window.innerWidth / window.innerHeight;

  // Update perspective camera
  perspectiveCamera.aspect = aspect;
  perspectiveCamera.updateProjectionMatrix();

  // Update orthographic camera
  orthographicCamera.left = frustumSize * aspect / -2;
  orthographicCamera.right = frustumSize * aspect / 2;
  orthographicCamera.top = frustumSize / 2;
  orthographicCamera.bottom = frustumSize / -2;
  orthographicCamera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ===== Animation loop =====
let lastTime = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const deltaTime = Math.min((now - lastTime) / 1000, 0.1); // Cap at 0.1s to prevent huge jumps
  lastTime = now;

  // Update people simulation (pass cameras for visibility detection)
  peopleManager.update(deltaTime, cameraManager.cameras);

  // Update cameras (for pulsing boundary violation lines)
  cameraManager.cameras.forEach(cam => cam.update(deltaTime));

  // Update interactive floor texture
  updateFloorTexture(now / 1000, deltaTime, hallway, peopleManager.people);

  // Update raycast visualization
  updateRaycastVisualization(raycastLines);

  // Update controls
  activeControls.update();

  // Render main scene
  renderer.render(scene, camera);

  // Render all camera previews
  cameraPreviewItems.forEach((item) => {
    if (item.camera && item.previewRenderer) {
      const previewCam = item.camera.getPreviewCamera();
      item.previewRenderer.render(scene, previewCam);
    }
  });
}

animate();
