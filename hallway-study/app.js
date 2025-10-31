// ===== Minimal Hallway Study Application =====
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm';
import { PeopleManager } from './people.js';
import { CameraManager } from './camera.js';
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

// Disable OrbitControls when dragging with TransformControls
transformControls.addEventListener('dragging-changed', (event) => {
  activeControls.enabled = !event.value;
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
const cameraManager = new CameraManager(scene, hallway);

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

// ===== GUI Setup =====
const gui = new GUI({ title: 'Hallway Study' });

// People Simulation Panel
const peopleFolder = gui.addFolder('People Simulation');
const peopleSettings = {
  count: 3
};

peopleFolder.add(peopleSettings, 'count', 0, 12, 1).name('Count').onChange((value) => {
  peopleManager.setCount(value);
});

peopleFolder.open();

// Cameras Panel
const camerasFolder = gui.addFolder('Cameras');

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

// Keyboard shortcuts for transform modes (like Unity)
window.addEventListener('keydown', (event) => {
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
});

camerasFolder.add(transformSettings, 'showRaycasts').name('Show Raycasts').onChange((value) => {
  setShowRays(value);
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
  }
}, 'addCamera').name('Add Camera');

// Function to add camera controls to GUI
function addCameraToGUI(cam) {
  const camFolder = gui.addFolder(cam.name);

  // Store folder reference on camera
  cam.guiFolder = camFolder;

  // OAK-D Pro PoE Specs (read-only information)
  const specsFolder = camFolder.addFolder('OAK-D Pro PoE Specs');
  const specs = {
    'H-FOV': `${cam.hFovDeg}°`,
    'V-FOV': `${cam.vFovDeg}°`,
    'Min Range': `${cam.minRange_m}m`,
    'Max Range': `${cam.maxRange_m}m`
  };

  specsFolder.add(specs, 'H-FOV').name('Horizontal FOV').disable();
  specsFolder.add(specs, 'V-FOV').name('Vertical FOV').disable();
  specsFolder.add(specs, 'Min Range').name('Min Range').disable();
  specsFolder.add(specs, 'Max Range').name('Max Range').disable();

  // Position controls (number inputs with drag-to-change, no min/max constraints)
  camFolder.add(cam.pos, 'x').name('X (m)').step(0.01).decimals(4).onChange(() => {
    cam.build();
  });
  camFolder.add(cam.pos, 'y').name('Y (m)').step(0.01).decimals(4).onChange(() => {
    cam.build();
  });
  camFolder.add(cam.pos, 'z').name('Z (m)').step(0.01).decimals(4).onChange(() => {
    cam.build();
  });

  // Rotation controls
  camFolder.add(cam, 'yaw', -180, 180, 1).name('Yaw (°)').onChange(() => {
    cam.build();
  });
  camFolder.add(cam, 'pitch', -90, 90, 1).name('Pitch (°)').onChange(() => {
    cam.build();
  });
  camFolder.add(cam, 'roll', -180, 180, 1).name('Roll (°)').onChange(() => {
    cam.build();
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

  // Check if clicking on transform controls gizmo (don't deselect if so)
  // Only check this if we didn't click a camera
  if (transformControls._gizmo && transformControls.object) {
    const gizmoIntersects = raycaster.intersectObject(transformControls._gizmo, true);
    if (gizmoIntersects.length > 0 && gizmoIntersects[0].distance < 100) {
      // Clicked on transform gizmo and it's reasonably close, don't change selection
      return;
    }
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
