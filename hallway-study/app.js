// ===== Minimal Hallway Study Application =====
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm';
import { PeopleManager } from './people.js';
import { CameraManager, setGlobalCameraModel, getGlobalCameraModel } from './camera.js';
import { setShowRays, updateRaycastVisualization } from './visibility.js';
import { createFBOFloor, updateFBOFloor } from './floor-fbo.js';
import { MIDIManager } from './midi-manager.js';
import { ClockManager } from './clock-manager.js';
import { TriggerZone } from './trigger-zones.js';
import { KeyManager } from './key-manager.js';
import { ChordManager } from './chord-manager.js';
import { WebSocketManager } from './websocket-manager.js';

// ===== Hallway dimensions (in meters) =====
const hallway = {
  length_m: 13.1064,
  width_m: 2.0574,
  height_m: 3.4538
};

// ===== Cookie Utilities =====
function setCookie(name, value, days = 365) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

function getCookie(name) {
  const nameEQ = name + '=';
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

// ===== Toast Notification System =====
function showToast(title, content, type = 'info') {
  const container = document.getElementById('toast-container');

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const titleEl = document.createElement('div');
  titleEl.className = 'toast-title';
  titleEl.textContent = title;

  const contentEl = document.createElement('div');
  contentEl.className = 'toast-content';
  contentEl.textContent = content;

  toast.appendChild(titleEl);
  toast.appendChild(contentEl);
  container.appendChild(toast);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease-out';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, 3000);
}

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
// Load isPerspective from cookie (defaults to true)
const savedIsPerspective = getCookie('isPerspective');
let isPerspective = savedIsPerspective !== null ? savedIsPerspective === 'true' : true;
console.log(`[Settings] isPerspective initialized to: ${isPerspective}`);

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

// Auto-save orbit controls to cookie when user moves camera (debounced)
let orbitControlsSaveTimeout;
function setupOrbitControlsSaving() {
  const saveHandler = () => {
    clearTimeout(orbitControlsSaveTimeout);
    orbitControlsSaveTimeout = setTimeout(() => {
      saveOrbitControlsToCookie();
      console.log('[Settings] Saved orbit controls to cookie');
    }, 1000); // Save 1 second after user stops moving
  };

  perspectiveControls.addEventListener('change', saveHandler);
  orthographicControls.addEventListener('change', saveHandler);
}

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

  // Solid floor plane (layer 0 - visible to cameras)
  // This is visible only when Floor FBO is disabled
  const floorGeometry = new THREE.PlaneGeometry(W, L);
  const floorMaterial = new THREE.MeshBasicMaterial({
    color: 0x0a0e14,  // Match background color
    side: THREE.DoubleSide
  });
  const solidFloor = new THREE.Mesh(floorGeometry, floorMaterial);
  solidFloor.rotation.x = -Math.PI / 2; // Rotate to be horizontal
  solidFloor.position.y = 0; // At ground level
  solidFloor.name = 'solidFloor'; // Name it so we can find it later
  hallGroup.add(solidFloor);

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
peopleManager.setEnabled(true); // Will be set from cookie below

// ===== Camera System =====
const cameraManager = new CameraManager(scene, hallway, renderer);

// ===== MIDI System =====
// Check if MIDI is enabled from cookie before initializing
const savedMidiEnabledEarly = getCookie('midiEnabled');
const midiEnabledEarly = savedMidiEnabledEarly !== null ? savedMidiEnabledEarly === 'true' : true;

// These will be created only if MIDI is enabled
let midiManager = null;
let clockManager = null;
let chordManager = null;
let keyManager = null;

// Update trigger notes when auto-key/chord-change happens (after managers initialize)
// This will be set up after GUI is ready
let keyManagerOnBar = null;
let chordManagerOnBar = null;

// Function to create MIDI-related managers
async function createMIDIManagers() {
  console.log('[MIDI] Creating MIDI managers...');

  midiManager = new MIDIManager();
  await midiManager.init();

  clockManager = new ClockManager(120, midiManager);

  // Set up clock callbacks
  clockManager.onSixteenthNote = (count, pos) => {
    // This fires every 16th note (125ms at 120 BPM)
  };

  clockManager.onBeat = (count, pos) => {
    // This fires every quarter note beat
  };

  chordManager = new ChordManager(clockManager);
  chordManagerOnBar = clockManager.onBar;

  keyManager = new KeyManager(clockManager);
  keyManagerOnBar = clockManager.onBar;

  console.log('[MIDI] Created managers - keyManager:', keyManager, 'chordManager:', chordManager);

  // Set up clock callbacks after all managers are created
  setupClockCallbacks();

  // Wait for MIDI to connect, then start clock
  setTimeout(() => {
    if (midiManager && midiManager.isConnected) {
      console.log('[MIDI] Connection established');
      console.log('[MIDI] Auto-panic on startup...');
      midiManager.panic();
      console.log('[Clock] Starting with MIDI Clock output enabled');
      clockManager.start();
    } else if (midiManager) {
      console.warn('[MIDI] Not connected - starting clock without MIDI sync');
      clockManager.start();
    }
  }, 500);
}

// Function to destroy MIDI-related managers
function destroyMIDIManagers() {
  console.log('[MIDI] Destroying MIDI managers...');

  if (clockManager) {
    clockManager.stop();
  }

  if (midiManager) {
    midiManager.panic();
    midiManager.disconnect();
  }

  midiManager = null;
  clockManager = null;
  chordManager = null;
  keyManager = null;
  keyManagerOnBar = null;
  chordManagerOnBar = null;

  console.log('[MIDI] Managers destroyed');
}

// Initialize systems asynchronously
async function initializeSystems() {
  // Create managers on startup if MIDI is enabled
  if (midiEnabledEarly) {
    await createMIDIManagers();
    console.log('[MIDI] MIDI managers fully initialized');
  } else {
    console.log('[MIDI] MIDI disabled - managers not created');
  }

  // Create floor system on startup if enabled
  if (floorEnabledEarly) {
    console.log('[Floor] Creating floor with keyManager:', keyManager, 'chordManager:', chordManager);
    createFloorSystem();
  } else {
    console.log('[Floor] Floor disabled - system not created');
  }
}

// ===== Floor System =====
// Check if Floor is enabled from cookie before initializing
const savedFloorEnabledEarly = getCookie('floorEnabled');
const floorEnabledEarly = savedFloorEnabledEarly !== null ? savedFloorEnabledEarly === 'true' : true;

// These will be created only if Floor is enabled
let triggerZones = null;
let shaderFloor = null;

// Function to create Floor-related systems
function createFloorSystem() {
  console.log('[Floor] Creating floor system...');

  triggerZones = new TriggerZone(hallway, keyManager, chordManager);
  shaderFloor = createFBOFloor(hallway, triggerZones, renderer);
  scene.add(shaderFloor);

  // Hide the solid floor when FBO floor is enabled
  const solidFloor = scene.getObjectByName('solidFloor');
  if (solidFloor) {
    solidFloor.visible = false;
  }

  console.log('[Floor] Floor system created');
}

// Function to destroy Floor-related systems
function destroyFloorSystem() {
  console.log('[Floor] Destroying floor system...');

  if (shaderFloor) {
    scene.remove(shaderFloor);
    // Dispose of FBO resources if needed
    if (shaderFloor.material && shaderFloor.material.uniforms) {
      // Clean up FBO textures
      const uniforms = shaderFloor.material.uniforms;
      if (uniforms.zone1FBO && uniforms.zone1FBO.value) uniforms.zone1FBO.value.dispose();
      if (uniforms.zone2FBO && uniforms.zone2FBO.value) uniforms.zone2FBO.value.dispose();
      if (uniforms.zone3FBO && uniforms.zone3FBO.value) uniforms.zone3FBO.value.dispose();
    }
    if (shaderFloor.geometry) shaderFloor.geometry.dispose();
    if (shaderFloor.material) shaderFloor.material.dispose();
  }

  // Show the solid floor when FBO floor is disabled
  const solidFloor = scene.getObjectByName('solidFloor');
  if (solidFloor) {
    solidFloor.visible = true;
  }

  triggerZones = null;
  shaderFloor = null;

  console.log('[Floor] Floor system destroyed');
}

// Floor enabled state (will be set from cookie below)
let floorEnabled = floorEnabledEarly;

// ===== WebSocket Client System =====
// Using Web Worker to avoid browser throttling of background tabs
const wsBroadcastWorker = new Worker('websocket-broadcast-worker.js');

// Initialize the worker
wsBroadcastWorker.postMessage({
  type: 'init',
  data: {
    url: 'ws://localhost:8080',
    enabled: true
  }
});

// Listen for worker messages
wsBroadcastWorker.onmessage = (e) => {
  const { type, data } = e.data;

  if (type === 'connected') {
    console.log('[Worker WS] WebSocket connected');
  } else if (type === 'disconnected') {
    console.log('[Worker WS] WebSocket disconnected');
  } else if (type === 'message') {
    console.log('[Worker WS] Received:', data);
  }
};

wsBroadcastWorker.onerror = (error) => {
  console.error('[Worker WS] Error:', error);
};

console.log('[WebSocket] Worker initialized - broadcasting at 30Hz');

// Keep wsManager for backward compatibility (if used elsewhere)
const wsManager = new WebSocketManager('ws://localhost:8080');

// Helper function to serialize person (moved from WebSocketManager)
function serializePerson(person) {
  const width = person.radius * 2;
  const height = person.height;
  const xvel = person.xVelocity || 0;
  const yvel = person.isDwelling ? 0 : (person.speed * person.direction);

  // Normalize positions to 0-1 range within floor plane
  // x = blue axis (Z in Three.js) = hallway length
  // y = red axis (X in Three.js) = hallway width
  // Note: person.z ranges [0, length_m], person.xOffset ranges [-width_m/2, +width_m/2]
  const xNormalized = Math.max(0, Math.min(1, person.z / hallway.length_m));
  const yNormalized = Math.max(0, Math.min(1, (person.xOffset + hallway.width_m * 0.5) / hallway.width_m));

  return {
    id: person.id,
    x: parseFloat(xNormalized.toFixed(4)),
    y: parseFloat(yNormalized.toFixed(4)),
    w: parseFloat(width.toFixed(4)),
    h: parseFloat(height.toFixed(4)),
    xvel: parseFloat(xvel.toFixed(4)),
    yvel: parseFloat(yvel.toFixed(4))
  };
}

// Send people data to worker (called from simulation update)
function sendPeopleToWorker(people) {
  if (people.length === 0) return;

  const serializedPeople = people.map(person => serializePerson(person));
  wsBroadcastWorker.postMessage({
    type: 'updatePeople',
    data: serializedPeople
  });
}

function startWebSocketBroadcast() {
  // Worker is always running, just enable it
  wsBroadcastWorker.postMessage({ type: 'setEnabled', data: true });
  console.log('[WebSocket] Broadcast enabled');
}

function stopWebSocketBroadcast() {
  // Disable worker broadcasting
  wsBroadcastWorker.postMessage({ type: 'setEnabled', data: false });
  console.log('[WebSocket] Broadcast disabled');
}

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

// ===== Depth Visualization Setup =====
// Depth visualization mode toggle (false = RGB, true = depth)
let depthVisualizationMode = false;

// Depth visualization shader (Oak-D style: near = warm, far = cool)
const depthVisualizationShader = {
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    #include <packing>

    uniform sampler2D tDepth;
    uniform float cameraNear;
    uniform float cameraFar;
    varying vec2 vUv;

    // Convert non-linear depth buffer value to linear depth
    float readDepth(sampler2D depthSampler, vec2 coord) {
      float fragCoordZ = texture2D(depthSampler, coord).x;
      // Convert from [0,1] non-linear depth to view space Z (negative values)
      float viewZ = perspectiveDepthToViewZ(fragCoordZ, cameraNear, cameraFar);
      // viewZ is negative, so we take abs and normalize to [0,1]
      // 0 = near plane (0.7m), 1 = far plane (12m)
      float linearDepth = (-viewZ - cameraNear) / (cameraFar - cameraNear);
      return clamp(linearDepth, 0.0, 1.0);
    }

    // Oak-D style colormap: warm (near) to cool (far)
    vec3 depthToColor(float depth) {
      // depth is 0 (near) to 1 (far)
      // Invert so near is 1.0, far is 0.0
      float d = 1.0 - clamp(depth, 0.0, 1.0);

      // Smoother color transitions to reduce flickering
      // Use smoothstep for gradual transitions between color stops
      vec3 color1 = vec3(0.0, 0.0, 0.2);    // Very far: dark blue
      vec3 color2 = vec3(0.0, 0.3, 0.9);    // Far: blue
      vec3 color3 = vec3(0.0, 0.8, 0.8);    // Mid-far: cyan
      vec3 color4 = vec3(0.1, 0.9, 0.3);    // Mid: green
      vec3 color5 = vec3(1.0, 0.85, 0.0);   // Near: yellow
      vec3 color6 = vec3(1.0, 0.15, 0.0);   // Very near: red

      // Smooth interpolation between 6 color stops
      vec3 color;
      if (d < 0.2) {
        float t = smoothstep(0.0, 0.2, d);
        color = mix(color1, color2, t);
      } else if (d < 0.4) {
        float t = smoothstep(0.2, 0.4, d);
        color = mix(color2, color3, t);
      } else if (d < 0.6) {
        float t = smoothstep(0.4, 0.6, d);
        color = mix(color3, color4, t);
      } else if (d < 0.8) {
        float t = smoothstep(0.6, 0.8, d);
        color = mix(color4, color5, t);
      } else {
        float t = smoothstep(0.8, 1.0, d);
        color = mix(color5, color6, t);
      }

      return color;
    }

    void main() {
      float depth = readDepth(tDepth, vUv);
      vec3 color = depthToColor(depth);
      gl_FragColor = vec4(color, 1.0);
    }
  `
};

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

  // Create depth render target with depth texture
  const depthRenderTarget = new THREE.WebGLRenderTarget(220, 138, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
    generateMipmaps: false
  });
  depthRenderTarget.depthTexture = new THREE.DepthTexture(220, 138);
  depthRenderTarget.depthTexture.format = THREE.DepthFormat;
  depthRenderTarget.depthTexture.type = THREE.UnsignedIntType;
  depthRenderTarget.depthTexture.minFilter = THREE.NearestFilter;
  depthRenderTarget.depthTexture.magFilter = THREE.NearestFilter;

  // Create depth visualization material
  const depthVisualizationMaterial = new THREE.ShaderMaterial({
    vertexShader: depthVisualizationShader.vertexShader,
    fragmentShader: depthVisualizationShader.fragmentShader,
    uniforms: {
      tDepth: { value: depthRenderTarget.depthTexture },
      cameraNear: { value: cam.minRange_m },
      cameraFar: { value: cam.maxRange_m }
    }
  });

  // Create fullscreen quad for displaying depth visualization
  const quadGeometry = new THREE.PlaneGeometry(2, 2);
  const depthQuad = new THREE.Mesh(quadGeometry, depthVisualizationMaterial);

  // Create orthographic camera for rendering the depth quad
  const depthQuadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Create scene for the depth quad
  const depthScene = new THREE.Scene();
  depthScene.add(depthQuad);

  // Store renderer, canvas, and depth visualization components on the item
  item.previewRenderer = renderer;
  item.previewCanvas = canvas;
  item.camera = cam;
  item.depthRenderTarget = depthRenderTarget;
  item.depthScene = depthScene;
  item.depthQuadCamera = depthQuadCamera;

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
    if (item.depthRenderTarget) {
      item.depthRenderTarget.dispose();
      item.depthRenderTarget.depthTexture.dispose();
    }
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
    settings: {
      cameraModel: getGlobalCameraModel()
    }
  };
}

// Save/load orbit controls to/from cookies (user preference, not document state)
function saveOrbitControlsToCookie() {
  const orbitData = {
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
  };
  setCookie('orbitControls', JSON.stringify(orbitData));
}

function loadOrbitControlsFromCookie() {
  const saved = getCookie('orbitControls');
  if (saved) {
    try {
      const orbitData = JSON.parse(saved);
      camera.position.set(
        orbitData.position.x,
        orbitData.position.y,
        orbitData.position.z
      );
      activeControls.target.set(
        orbitData.target.x,
        orbitData.target.y,
        orbitData.target.z
      );
      activeControls.update();
      console.log('[Settings] Loaded orbit controls from cookie');
      return true;
    } catch (e) {
      console.error('[Settings] Failed to load orbit controls from cookie:', e);
    }
  }
  return false;
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

    // Set frustum visibility from user preference (not from document)
    if (cam.frustumHelper) {
      cam.frustumHelper.visible = transformSettings.showFrustums;
    }
    if (cam.frustumMesh) {
      cam.frustumMesh.visible = transformSettings.showFrustums;
    }

    addCameraToGUI(cam);
    createCameraPreviewItem(cam);
  });

  // Note: Orbit controls, peopleCount, and isPerspective are now saved in cookies (user preferences), not in documents
  // Old documents that have these settings will ignore them

  documentName = data.name || 'Untitled';
  documentDirty = false;
  updateDocumentTitle();

  // Refresh all GUI controllers to show updated values
  gui.controllersRecursive().forEach(c => c.updateDisplay());

  console.log(`[Document] Loaded "${documentName}" - user prefs from cookies: showFrustums=${transformSettings.showFrustums}, showRaycasts=${transformSettings.showRaycasts}`);

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
    settings: {
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

  // Note: peopleCount and isPerspective are user preferences (cookies), not reset on new document

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

// ===== GUI PANELS =====

// Camera Presets & Configuration
const fileFolder = gui.addFolder('Camera Presets');

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
    .name('Camera Configuration')
    .onChange((selectedDoc) => {
      if (selectedDoc === documentName) return; // Already open

      if (documentDirty) {
        const save = confirm('You have unsaved changes to camera configuration. Save before switching?');
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
            alert(`Camera configuration "${selectedDoc}" not found.`);
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
        console.error('Failed to load camera configuration:', e);
        alert('Failed to load camera configuration. The saved data might be corrupted.');
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

  // Load orbit controls from cookie (after document is loaded)
  loadOrbitControlsFromCookie();

  // Apply initial camera mode from cookie
  if (!isPerspective) {
    // Need to switch to orthographic (default is perspective)
    toggleCameraMode();
  }

  // Apply initial people count from cookie
  peopleManager.setCount(initialPeopleCount);

  // Setup auto-save for orbit controls
  setupOrbitControlsSaving();
})();

fileFolder.add({ newDoc: newDocument }, 'newDoc').name('New Configuration');
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
          alert('Failed to import camera configuration. Invalid JSON file.');
          console.error(err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }
}, 'import').name('Import JSON');
importExportFolder.close(); // Collapsed by default

// NOTE: Cameras panel is created later in the code (around line 1918)
// but will be moved here via DOM manipulation

// Features Panel - Master enable/disable for major features
const featuresFolder = gui.addFolder('Features');

// Load feature states from cookies
const savedPeopleEnabled = getCookie('peopleEnabled');
const initialPeopleEnabled = savedPeopleEnabled !== null ? savedPeopleEnabled === 'true' : true;

const savedMidiEnabled = getCookie('midiEnabled');
const initialMidiEnabled = savedMidiEnabled !== null ? savedMidiEnabled === 'true' : true;

const savedFloorEnabled = getCookie('floorEnabled');
const initialFloorEnabled = savedFloorEnabled !== null ? savedFloorEnabled === 'true' : true;

const savedWebSocketEnabled = getCookie('webSocketEnabled');
const initialWebSocketEnabled = savedWebSocketEnabled !== null ? savedWebSocketEnabled === 'true' : true;

const featureSettings = {
  peopleEnabled: initialPeopleEnabled,
  midiEnabled: initialMidiEnabled,
  floorEnabled: initialFloorEnabled,
  webSocketEnabled: initialWebSocketEnabled
};

// Style the feature checkboxes in a 2x2 grid
const peopleController = featuresFolder.add(featureSettings, 'peopleEnabled').name('People').onChange((value) => {
  peopleManager.setEnabled(value);
  setCookie('peopleEnabled', value);
  console.log(`[Settings] Saved to cookie: peopleEnabled = ${value}`);

  // Show/hide People Simulation folder
  if (typeof peopleFolder !== 'undefined') {
    if (value) {
      peopleFolder.show();
    } else {
      peopleFolder.hide();
    }
  }
});

const midiController = featuresFolder.add(featureSettings, 'midiEnabled').name('MIDI').onChange(async (value) => {
  setCookie('midiEnabled', value);
  console.log(`[Settings] Saved to cookie: midiEnabled = ${value}`);

  if (!value) {
    // Destroy MIDI managers
    destroyMIDIManagers();
  } else {
    // Create MIDI managers
    await createMIDIManagers();
  }

  // Show/hide entire MIDI folder and related folders
  updateMIDIFoldersVisibility(value);

  // Update trigger zones with new managers (if trigger zones exist)
  if (triggerZones) {
    triggerZones.keyManager = keyManager;
    triggerZones.chordManager = chordManager;
  }
});

const floorController = featuresFolder.add(featureSettings, 'floorEnabled').name('Floor').onChange((value) => {
  floorEnabled = value;
  setCookie('floorEnabled', value);
  console.log(`[Settings] Saved to cookie: floorEnabled = ${value}`);

  if (!value) {
    // Destroy floor system
    destroyFloorSystem();
  } else {
    // Create floor system
    createFloorSystem();
  }

  // Show/hide entire Floor folder
  if (typeof floorFolder !== 'undefined') {
    if (value) {
      floorFolder.show();
    } else {
      floorFolder.hide();
    }
  }
});

const webSocketController = featuresFolder.add(featureSettings, 'webSocketEnabled').name('WebSocket').onChange((value) => {
  setCookie('webSocketEnabled', value);
  console.log(`[Settings] Saved to cookie: webSocketEnabled = ${value}`);

  // Start/stop WebSocket broadcasting
  if (value) {
    startWebSocketBroadcast();
  } else {
    stopWebSocketBroadcast();
  }

  // Show/hide WebSocket folder
  if (typeof wsFolder !== 'undefined') {
    if (value) {
      wsFolder.show();
    } else {
      wsFolder.hide();
    }
  }
});

// Apply grid layout to feature controllers (2x2 grid)
const featureControllers = [peopleController, midiController, floorController, webSocketController];

// Wait for DOM to be ready, then apply grid styling
setTimeout(() => {
  const featuresFolderElement = featuresFolder.domElement.querySelector('.children');
  if (featuresFolderElement) {
    // Apply CSS Grid to the container
    featuresFolderElement.style.display = 'grid';
    featuresFolderElement.style.gridTemplateColumns = '1fr 1fr';
    featuresFolderElement.style.gap = '0';
  }

  // Reset any individual styling
  featureControllers.forEach((controller) => {
    const element = controller.domElement.parentElement;
    element.style.display = '';
    element.style.width = '';
    element.style.float = '';
  });
}, 0);

featuresFolder.open();

// Start WebSocket broadcasting if enabled
if (featureSettings.webSocketEnabled) {
  startWebSocketBroadcast();
}

// People Simulation Panel
const peopleFolder = gui.addFolder('People Simulation');

// Initialize people enabled state from Features panel
peopleManager.setEnabled(initialPeopleEnabled);

// Load people count from cookie (defaults to 3)
const savedPeopleCount = getCookie('peopleCount');
const initialPeopleCount = savedPeopleCount !== null ? parseInt(savedPeopleCount, 10) : 3;
console.log(`[Settings] peopleCount initialized to: ${initialPeopleCount}`);

const savedLateralMovement = getCookie('lateralMovement');
const initialLateralMovement = savedLateralMovement !== null ? savedLateralMovement === 'true' : true;
console.log(`[Settings] lateralMovement initialized to: ${initialLateralMovement}`);

const peopleSettings = {
  count: initialPeopleCount,
  lateralMovement: initialLateralMovement
};

peopleFolder.add(peopleSettings, 'count', 0, 12, 1).name('Count').onChange((value) => {
  peopleManager.setCount(value);
  // Save to cookie (user preference, not document state)
  setCookie('peopleCount', value);
  console.log(`[Settings] Saved to cookie: peopleCount = ${value}`);
});

peopleFolder.add(peopleSettings, 'lateralMovement').name('Sideways Motion').onChange((value) => {
  peopleManager.setLateralMovement(value);
  setCookie('lateralMovement', value);
  console.log(`[Settings] Saved to cookie: lateralMovement = ${value}`);
});

peopleFolder.open();

// MIDI System Panel
const midiFolder = gui.addFolder('MIDI Output');

// Initialize MIDI manager with the state from Features panel (if it exists)
if (midiManager) {
  midiManager.setEnabled(initialMidiEnabled);
  console.log(`[Settings] midiEnabled initialized to: ${initialMidiEnabled}`);
}

const midiSettings = {
  status: 'Disconnected',
  output: 'None',
  testNote: () => {
    if (midiManager) {
      midiManager.sendTestNote();
    }
  }
};

// Status display (read-only)
const midiStatusController = midiFolder.add(midiSettings, 'status').name('Status').disable();

// Output selector dropdown
let midiOutputController = midiFolder.add(midiSettings, 'output', ['None']).name('MIDI Output');

// Update output dropdown when MIDI is initialized
function updateMIDIOutputDropdown() {
  // Skip if MIDI manager doesn't exist
  if (!midiManager) {
    console.log('[MIDI] Cannot update dropdown - MIDI manager not initialized');
    return;
  }

  const outputs = midiManager.getOutputNames();
  const choices = { 'None': 'None' };

  outputs.forEach(output => {
    choices[output.name] = output.id;
  });

  // Rebuild controller with new choices
  midiOutputController.destroy();
  midiOutputController = midiFolder.add(midiSettings, 'output', choices)
    .name('MIDI Output')
    .onChange((outputId) => {
      if (outputId !== 'None' && midiManager) {
        midiManager.connectToOutput(outputId);
      }
    });

  // Auto-select first output if available
  if (outputs.length > 0) {
    midiSettings.output = outputs[0].id;
    midiOutputController.updateDisplay();
  }
}

// Update dropdown after a brief delay to let MIDI initialize
setTimeout(updateMIDIOutputDropdown, 100);

// Panic button
midiSettings.panic = () => {
  if (midiManager) {
    midiManager.panic();
  }
};
const midiPanicController = midiFolder.add(midiSettings, 'panic').name('🚨 PANIC (All Notes Off)');

// Function to show/hide MIDI-related folders (MIDI Output, Clock, Key, Chord)
// Will be called after those folders are created
function updateMIDIFoldersVisibility(enabled) {
  // Hide/show the entire MIDI Output folder
  if (typeof midiFolder !== 'undefined') {
    if (enabled) {
      midiFolder.show();
    } else {
      midiFolder.hide();
    }
  }

  // Hide/show Clock & Timing folder
  if (typeof clockFolder !== 'undefined') {
    if (enabled) {
      clockFolder.show();
    } else {
      clockFolder.hide();
    }
  }

  // Hide/show Musical Key folder
  if (typeof keyFolder !== 'undefined') {
    if (enabled) {
      keyFolder.show();
    } else {
      keyFolder.hide();
    }
  }

  // Hide/show Chord Progression folder
  if (typeof chordFolder !== 'undefined') {
    if (enabled) {
      chordFolder.show();
    } else {
      chordFolder.hide();
    }
  }
}

// Update connection status in the GUI
setInterval(() => {
  if (midiManager) {
    const newStatus = midiManager.isConnected ? '✓ Connected' : '✗ Disconnected';
    if (midiSettings.status !== newStatus) {
      midiSettings.status = newStatus;
      midiStatusController.updateDisplay();
    }
  } else {
    if (midiSettings.status !== 'Disabled') {
      midiSettings.status = 'Disabled';
      midiStatusController.updateDisplay();
    }
  }
}, 500);

midiFolder.open();

// WebSocket Panel
const wsFolder = gui.addFolder('WebSocket Output');
const wsSettings = {
  status: 'Disconnected',
  url: 'ws://localhost:8080',
  broadcastRate: '~30 Hz'
};

// Status display (read-only)
const wsStatusController = wsFolder.add(wsSettings, 'status').name('Status').disable();

// URL display (read-only)
wsFolder.add(wsSettings, 'url').name('Server URL').disable();

// Broadcast rate display (read-only)
wsFolder.add(wsSettings, 'broadcastRate').name('Broadcast Rate').disable();

// Update connection status in the GUI
setInterval(() => {
  const newStatus = wsManager.isConnected() ? '✓ Connected' : '○ Connecting...';
  if (wsSettings.status !== newStatus) {
    wsSettings.status = newStatus;
    wsStatusController.updateDisplay();
  }
}, 500);

wsFolder.open();

// Floor FBO Panel
const floorFolder = gui.addFolder('Floor Visualization');

// Initialize floor state from Features panel
floorEnabled = initialFloorEnabled;
console.log(`[Settings] floorEnabled initialized to: ${initialFloorEnabled}`);

// You can add floor-specific settings here in the future
// (currently the floor doesn't have any additional settings)

floorFolder.open();

// Clock/Timing Panel
const clockFolder = gui.addFolder('Clock & Timing');

// Load clock settings from cookies
const savedAutoBPM = getCookie('autoBPMChange');
const savedQuantization = getCookie('quantization');
const savedBPM = getCookie('bpm');
const initialBPM = savedBPM !== null ? parseInt(savedBPM, 10) : 120;

const clockSettings = {
  running: true,
  bpm: initialBPM,
  autoBPMChange: savedAutoBPM !== null ? savedAutoBPM === 'true' : true,
  quantization: savedQuantization !== null ? savedQuantization : '16th',
  position: '1:1:1',
  metronome: '○',
  startStop: () => {
    if (!clockManager) return;

    if (clockManager.running) {
      clockManager.stop();
      clockSettings.running = false;
    } else {
      clockManager.start();
      clockSettings.running = true;
    }
  },
  reset: () => {
    if (clockManager) {
      clockManager.reset();
    }
  }
};

// Apply loaded settings to clock manager (if it exists)
if (clockManager) {
  clockManager.setAutoBPMEnabled(clockSettings.autoBPMChange);
  clockManager.setQuantization(clockSettings.quantization);
  // Apply saved BPM if auto-change is disabled
  if (!clockSettings.autoBPMChange) {
    clockManager.setBPM(clockSettings.bpm);
  }
}

// Auto BPM Change toggle
clockFolder.add(clockSettings, 'autoBPMChange').name('Auto BPM Change').onChange((value) => {
  if (clockManager) {
    clockManager.setAutoBPMEnabled(value);
  }
  // Update BPM controller label based on auto-change state
  bpmController.name(value ? 'BPM (auto-changing)' : 'BPM');
  // Save to cookie
  setCookie('autoBPMChange', value);
});

// BPM control (allows manual changes when auto-change is disabled)
const bpmController = clockFolder.add(clockSettings, 'bpm', 60, 200, 1)
  .name(clockSettings.autoBPMChange ? 'BPM (auto-changing)' : 'BPM')
  .listen()
  .onChange((value) => {
    // Only allow manual BPM changes when auto-change is disabled
    if (!clockSettings.autoBPMChange && clockManager) {
      clockManager.setBPM(value);
      setCookie('bpm', value);
      console.log(`[Settings] Saved to cookie: bpm = ${value}`);
    }
  });

// Quantization selector
clockFolder.add(clockSettings, 'quantization', ['16th', '8th', 'quarter'])
  .name('Quantization')
  .onChange((value) => {
    if (clockManager) {
      clockManager.setQuantization(value);
    }
    // Save to cookie
    setCookie('quantization', value);
  });

// Position display (read-only)
const positionController = clockFolder.add(clockSettings, 'position').name('Position (Bar:Beat:16th)').disable();

// Visual metronome (read-only)
const metronomeController = clockFolder.add(clockSettings, 'metronome').name('Metronome').disable();

// Start/Stop button
clockFolder.add(clockSettings, 'startStop').name('⏯ Start/Stop');

// Reset button
clockFolder.add(clockSettings, 'reset').name('⟲ Reset to 1:1:1');

// Update clock displays in real-time
let lastMetronomeBeat = -1;
setInterval(() => {
  if (!clockManager) return; // Skip if MIDI is disabled

  const pos = clockManager.getPosition();
  clockSettings.position = `${pos.bar}:${pos.beat}:${pos.sixteenth}`;
  positionController.updateDisplay();

  // Update BPM display (will change automatically if auto-change is enabled)
  if (clockSettings.bpm !== clockManager.bpm) {
    clockSettings.bpm = clockManager.bpm;
    bpmController.updateDisplay();
  }

  // Visual metronome - show which 16th note we're on
  const sixteenth = pos.sixteenth;
  const metronomeChars = ['●', '○', '○', '○'];
  metronomeChars[sixteenth - 1] = '●';
  clockSettings.metronome = metronomeChars.join(' ');
  metronomeController.updateDisplay();
}, 50);

clockFolder.open();

// Musical Key System Panel
const keyFolder = gui.addFolder('Musical Key (Camelot Wheel)');

// Load key settings from cookies
const savedAutoKeyChange = getCookie('autoKeyChange');
const savedKeyChangeInterval = getCookie('keyChangeInterval');
const initialKeyChangeInterval = savedKeyChangeInterval !== null ? parseInt(savedKeyChangeInterval, 10) : 16;

const keySettings = {
  currentKey: '8A - A minor',
  autoChange: savedAutoKeyChange !== null ? savedAutoKeyChange === 'true' : true,
  changeInterval: initialKeyChangeInterval,
  compatibleKeys: '',
  manualChange: () => {
    if (!keyManager) return;
    keyManager.changeToCompatibleKey();
    if (triggerZones) triggerZones.updateMIDINotes();
    updateKeyDisplay();
  }
};

// Apply loaded settings to key manager (if it exists)
if (keyManager) {
  keyManager.setAutoChangeEnabled(keySettings.autoChange);
  keyManager.setAutoChangeInterval(keySettings.changeInterval);
}

// Current key dropdown (all 24 keys)
const allKeys = keyManager ? keyManager.getAllKeys() : [];
const keyChoices = {};
allKeys.forEach(k => {
  keyChoices[k.label] = k.value;
});

const keyController = keyFolder.add(keySettings, 'currentKey', keyChoices)
  .name('Current Key')
  .onChange((value) => {
    if (!keyManager) return;
    keyManager.setKey(value);
    if (triggerZones) triggerZones.updateMIDINotes();
    updateKeyDisplay();
  });

// Auto change toggle
keyFolder.add(keySettings, 'autoChange').name('Auto Key Change').onChange((value) => {
  if (keyManager) {
    keyManager.setAutoChangeEnabled(value);
  }
  // Save to cookie
  setCookie('autoKeyChange', value);
});

// Change interval slider
keyFolder.add(keySettings, 'changeInterval', 4, 32, 4).name('Change Every (bars)').onChange((value) => {
  if (keyManager) {
    keyManager.setAutoChangeInterval(value);
  }
  setCookie('keyChangeInterval', value);
  console.log(`[Settings] Saved to cookie: keyChangeInterval = ${value}`);
});

// Manual change button
keyFolder.add(keySettings, 'manualChange').name('🎲 Change to Compatible Key');

// Compatible keys display (read-only)
const compatibleController = keyFolder.add(keySettings, 'compatibleKeys').name('Compatible Keys').disable();

// Update key display
function updateKeyDisplay() {
  // Skip update if managers don't exist
  if (!keyManager) return;

  const info = keyManager.getInfo();
  const keyInfo = keyManager.getCurrentKeyInfo();
  keySettings.currentKey = `${info.currentKey} - ${keyInfo.name}`;
  keyController.updateDisplay();

  keySettings.compatibleKeys = info.compatible.join(', ');
  compatibleController.updateDisplay();
}

// Update display periodically
setInterval(updateKeyDisplay, 200);

// Function to set up clock callbacks (called when managers are created)
function setupClockCallbacks() {
  if (!clockManager) return;

  // Master onBar callback that handles both key and chord changes
  clockManager.onBar = (barCount, pos) => {
    if (!keyManager || !chordManager) return;

    const oldKey = keyManager.currentKey;
    const oldChord = chordManager.getCurrentChord().name;

    // Call chord manager's callback (handles chord changes)
    if (chordManagerOnBar) chordManagerOnBar(barCount, pos);

    // Call key manager's callback (handles key changes)
    if (keyManagerOnBar) keyManagerOnBar(barCount, pos);

    // Check if chord changed and update patterns (only if triggerZones exist)
    const newChord = chordManager.getCurrentChord().name;
    if (oldChord !== newChord) {
      if (triggerZones) triggerZones.updateChordPatterns();
      updateChordDisplay();
      if (midiManager) showToast('Chord Change', `${newChord} in ${keyManager.currentKey}`, 'chord-change');
    }

    // Check if key changed and update notes (only if triggerZones exist)
    if (oldKey !== keyManager.currentKey) {
      if (triggerZones) triggerZones.updateMIDINotes();
      updateKeyDisplay();
      if (midiManager) showToast('Key Change', keyManager.currentKey, 'key-change');
    }
  };

  // BPM change callback
  clockManager.onBPMChange = (newBPM) => {
    if (midiManager) showToast('BPM Change', `${newBPM} BPM`, 'bpm-change');
  };
}

keyFolder.open();

// Chord Progression Panel
const chordFolder = gui.addFolder('Chord Progression');

// Load chord settings from cookies
const savedAutoChordChange = getCookie('autoChordChange');
const savedChordChangeInterval = getCookie('chordChangeInterval');
const initialChordChangeInterval = savedChordChangeInterval !== null ? parseInt(savedChordChangeInterval, 10) : 8;

const chordSettings = {
  progressionDisplay: 'I - V - vi - IV',
  progression: 'I-V-vi-IV',
  autoChange: savedAutoChordChange !== null ? savedAutoChordChange === 'true' : true,
  changeInterval: initialChordChangeInterval,
  manualNext: () => {
    if (!chordManager) return;
    chordManager.manualNextChord();
    if (triggerZones) triggerZones.updateChordPatterns();
    updateChordDisplay();
  }
};

// Apply loaded settings to chord manager (if it exists)
if (chordManager) {
  chordManager.setAutoChangeEnabled(chordSettings.autoChange);
  chordManager.setAutoChangeInterval(chordSettings.changeInterval);
}

// Progression with highlighted current chord (read-only)
const progressionDisplayController = chordFolder.add(chordSettings, 'progressionDisplay').name('Progression').disable();

// Progression selector
const progressionNames = chordManager ? chordManager.getProgressionNames() : [];
const progressionController = chordFolder.add(chordSettings, 'progression', progressionNames)
  .name('Progression')
  .onChange((value) => {
    if (!chordManager) return;
    chordManager.setProgression(value);
    if (triggerZones) triggerZones.updateChordPatterns();
    updateChordDisplay();
  });

// Auto-change toggle
chordFolder.add(chordSettings, 'autoChange').name('Auto Change').onChange((value) => {
  if (chordManager) {
    chordManager.setAutoChangeEnabled(value);
  }
  // Save to cookie
  setCookie('autoChordChange', value);
});

// Change interval slider
chordFolder.add(chordSettings, 'changeInterval', 4, 32, 4).name('Change Every (bars)').onChange((value) => {
  if (chordManager) {
    chordManager.setAutoChangeInterval(value);
  }
  setCookie('chordChangeInterval', value);
  console.log(`[Settings] Saved to cookie: chordChangeInterval = ${value}`);
});

// Manual next chord button
chordFolder.add(chordSettings, 'manualNext').name('→ Next Chord');

// Update chord display function
function updateChordDisplay() {
  // Skip update if managers don't exist
  if (!chordManager) return;

  const info = chordManager.getInfo();
  chordSettings.progressionDisplay = info.progressionDisplay;
  chordSettings.progression = info.progression;
  progressionDisplayController.updateDisplay();
  progressionController.updateDisplay();
}

// Update display periodically
setInterval(updateChordDisplay, 200);

chordFolder.open();

// Set initial visibility of all feature folders based on cookies
updateMIDIFoldersVisibility(initialMidiEnabled);

if (initialFloorEnabled) {
  floorFolder.show();
} else {
  floorFolder.hide();
}

if (initialPeopleEnabled) {
  peopleFolder.show();
} else {
  peopleFolder.hide();
}

if (initialWebSocketEnabled) {
  wsFolder.show();
} else {
  wsFolder.hide();
}

// Initial clock state is already handled in createMIDIManagers/destroyMIDIManagers
// No need for separate initialization here

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

    // Turn on "Show Camera Frustums" when model changes
    transformSettings.showFrustums = true;
    showFrustumsController.updateDisplay();

    // Apply frustum visibility to all cameras
    cameraManager.cameras.forEach(cam => {
      if (cam.frustumHelper) {
        cam.frustumHelper.visible = true;
      }
      if (cam.frustumMesh) {
        cam.frustumMesh.visible = true;
      }
    });

    // Save to cookie
    setCookie('showFrustums', true);
    console.log('[Settings] Camera model changed - enabled Show Camera Frustums');

    markDocumentDirty();
  });

// Depth Visualization Mode
// Load from cookies if available
const savedShowDepth = getCookie('showDepthVisualization');
console.log(`[Settings] Cookie 'showDepthVisualization' raw value: "${savedShowDepth}"`);

const depthSettings = {
  showDepthVisualization: savedShowDepth !== null ? savedShowDepth === 'true' : false
};

console.log(`[Settings] Show Depth Visualization initialized to: ${depthSettings.showDepthVisualization}`);

// Apply initial value to global state
depthVisualizationMode = depthSettings.showDepthVisualization;

camerasFolder.add(depthSettings, 'showDepthVisualization')
  .name('Depth View (Cameras)')
  .onChange((value) => {
    console.log(`[Settings] Show Depth Visualization changed to: ${value}`);
    depthVisualizationMode = value;
    // Save to cookie (user preference, not document state)
    setCookie('showDepthVisualization', value);
    console.log(`[Settings] Saved to cookie: showDepthVisualization = ${value}`);
  });

// Frustum and Raycast Visibility
// Load from cookies if available
const savedShowFrustums = getCookie('showFrustums');
const savedShowRaycasts = getCookie('showRaycasts');
console.log(`[Settings] Cookie 'showFrustums' raw value: "${savedShowFrustums}"`);
console.log(`[Settings] Cookie 'showRaycasts' raw value: "${savedShowRaycasts}"`);

const transformSettings = {
  showFrustums: savedShowFrustums !== null ? savedShowFrustums === 'true' : true,
  showRaycasts: savedShowRaycasts !== null ? savedShowRaycasts === 'true' : false
};

console.log(`[Settings] Show Frustums initialized to: ${transformSettings.showFrustums}`);
console.log(`[Settings] Show Raycasts initialized to: ${transformSettings.showRaycasts}`);

const showFrustumsController = camerasFolder.add(transformSettings, 'showFrustums')
  .name('Show Camera Frustums')
  .onChange((value) => {
    console.log(`[Settings] Show Frustums changed to: ${value}`);
    cameraManager.cameras.forEach(cam => {
      if (cam.frustumHelper) {
        cam.frustumHelper.visible = value;
      }
      if (cam.frustumMesh) {
        cam.frustumMesh.visible = value;
      }
    });
    // Save to cookie (user preference, not document state)
    setCookie('showFrustums', value);
    console.log(`[Settings] Saved to cookie: showFrustums = ${value}`);
  });

// Apply initial frustum visibility from cookie to all existing cameras
console.log(`[Settings] Applying frustum visibility (${transformSettings.showFrustums}) to ${cameraManager.cameras.length} cameras`);
cameraManager.cameras.forEach(cam => {
  if (cam.frustumHelper) {
    cam.frustumHelper.visible = transformSettings.showFrustums;
  }
  if (cam.frustumMesh) {
    cam.frustumMesh.visible = transformSettings.showFrustums;
  }
});

// Apply initial raycast visibility from cookie
console.log(`[Settings] Applying raycast visibility: ${transformSettings.showRaycasts}`);
setShowRays(transformSettings.showRaycasts);

camerasFolder.add(transformSettings, 'showRaycasts')
  .name('Show Raycasts')
  .onChange((value) => {
    console.log(`[Settings] Show Raycasts changed to: ${value}`);
    setShowRays(value);
    // Save to cookie (user preference, not document state)
    setCookie('showRaycasts', value);
    console.log(`[Settings] Saved to cookie: showRaycasts = ${value}`);
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

  // Only hide toolbar if it exists (may not be initialized yet during startup)
  if (typeof transformToolbar !== 'undefined' && transformToolbar) {
    transformToolbar.style.display = 'none';
  }

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

// Reorder GUI folders: Features first, then camera-related panels
// Features -> Camera Presets -> Cameras -> People -> etc.
requestAnimationFrame(() => {
  setTimeout(() => {
    const cameraPresetsFolderElement = fileFolder.domElement;
    const camerasFolderElement = camerasFolder.domElement;
    const featuresFolderElement = featuresFolder.domElement;

    console.log('[GUI] Attempting reorder...');
    console.log('[GUI] Camera Presets element:', cameraPresetsFolderElement);
    console.log('[GUI] Cameras element:', camerasFolderElement);
    console.log('[GUI] Features element:', featuresFolderElement);

    if (cameraPresetsFolderElement && camerasFolderElement && featuresFolderElement) {
      const parent = cameraPresetsFolderElement.parentElement;

      // Move Features to the top (before Camera Presets)
      parent.insertBefore(featuresFolderElement, cameraPresetsFolderElement);

      // Insert Cameras between Camera Presets and the next element
      // (We need to find what comes after Camera Presets now)
      const nextAfterPresets = cameraPresetsFolderElement.nextElementSibling;
      if (nextAfterPresets) {
        parent.insertBefore(camerasFolderElement, nextAfterPresets);
      }

      console.log('[GUI] ✓ Reordered: Features -> Camera Presets -> Cameras');
    } else {
      console.error('[GUI] ✗ Could not reorder - missing elements:', {
        cameraPresets: !!cameraPresetsFolderElement,
        cameras: !!camerasFolderElement,
        features: !!featuresFolderElement
      });
    }
  }, 200);
});

// ===== Perspective/Orthographic Toggle =====
const cameraModeBtn = document.getElementById('camera-mode');
const viewLabel = document.getElementById('view-label');

function toggleCameraMode() {
  isPerspective = !isPerspective;

  // Save to cookie (user preference, not document state)
  setCookie('isPerspective', isPerspective);
  console.log(`[Settings] Saved to cookie: isPerspective = ${isPerspective}`);

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
// Simulation update loop - triggered by Web Worker at 30Hz
// Using Web Worker to avoid browser throttling of background tabs

// Create Web Worker for reliable 30Hz timing
const simulationWorker = new Worker('simulation-timer-worker.js');

// Track simulation updates
let simUpdateCount = 0;
let lastSimUpdateLog = Date.now();

// Listen for tick messages from worker
simulationWorker.onmessage = (e) => {
  if (e.data.type === 'tick') {
    simUpdateCount++;

    // Log every second
    if (Date.now() - lastSimUpdateLog > 1000) {
      console.log(`[Main] Simulation update rate: ${simUpdateCount} updates/sec`);
      simUpdateCount = 0;
      lastSimUpdateLog = Date.now();
    }

    updateSimulation(e.data.deltaTime, e.data.timestamp);
  }
};

simulationWorker.onerror = (error) => {
  console.error('[Worker Sim] Simulation timer worker error:', error);
};

console.log('[Worker Sim] Simulation timer worker initialized');

function updateSimulation(deltaTime, now) {
  // Update clock system - only if MIDI is enabled and managers exist
  if (clockManager) {
    clockManager.update(now);
  }

  // Update people simulation (pass all systems including MIDI and clock)
  peopleManager.update(deltaTime, cameraManager.cameras, triggerZones, clockManager, midiManager);

  // Update cameras (for pulsing boundary violation lines)
  cameraManager.cameras.forEach(cam => cam.update(deltaTime));

  // Update FBO floor (with trigger animations) - only if enabled and floor exists
  if (floorEnabled && shaderFloor) {
    updateFBOFloor(shaderFloor, deltaTime);
  }

  // Send updated people data to WebSocket worker for broadcasting
  sendPeopleToWorker(peopleManager.people);
}

// Render loop - handles visual updates only (simulation runs separately from worker)
function animate() {
  requestAnimationFrame(animate);

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

      if (depthVisualizationMode) {
        // Render to depth render target first
        item.previewRenderer.setRenderTarget(item.depthRenderTarget);
        item.previewRenderer.render(scene, previewCam);
        item.previewRenderer.setRenderTarget(null);

        // Then render the depth visualization to the canvas
        item.previewRenderer.render(item.depthScene, item.depthQuadCamera);
      } else {
        // Render RGB from camera's perspective
        item.previewRenderer.render(scene, previewCam);
      }
    }
  });
}

// Wait for systems to initialize before starting animation
initializeSystems().then(() => {
  console.log('[Main] All systems initialized, starting animation');
  animate();
});
