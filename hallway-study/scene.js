// ===== Three.js Scene Setup =====
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ===== Main renderer =====
export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

// ===== Camera preview renderers =====
export const previewWidth = 960; // 2x larger preview size
export const previewHeight = 600; // 16:10 aspect ratio to match OAK-D Pro PoE stereo cameras

const canvasA = document.getElementById('camA-preview');
const canvasB = document.getElementById('camB-preview');

if (!canvasA || !canvasB) {
  console.error('Preview canvases not found!', canvasA, canvasB);
}

export const previewRendererA = new THREE.WebGLRenderer({
  canvas: canvasA,
  antialias: true,
  alpha: false
});
previewRendererA.setPixelRatio(Math.min(2, window.devicePixelRatio));
previewRendererA.setSize(previewWidth, previewHeight, false);
previewRendererA.setClearColor(0x0b0f14, 1);

export const previewRendererB = new THREE.WebGLRenderer({
  canvas: canvasB,
  antialias: true,
  alpha: false
});
previewRendererB.setPixelRatio(Math.min(2, window.devicePixelRatio));
previewRendererB.setSize(previewWidth, previewHeight, false);
previewRendererB.setClearColor(0x0b0f14, 1);

// ===== Preview cameras =====
// Three.js PerspectiveCamera uses VERTICAL FOV, not horizontal
// OAK-D Pro PoE: hFOV=80°, vFOV=55° (calculated from 80° * (10/16) aspect)
// Near/far clipping: 0.7m (min depth) to 12m (max depth)
export const previewCameraA = new THREE.PerspectiveCamera(55, 16/10, 0.7, 12);
export const previewCameraB = new THREE.PerspectiveCamera(55, 16/10, 0.7, 12);

// Use layer 1 for camera/projector visualizations (excluded from preview renders)
// Layer 0 (default) for everything else
previewCameraA.layers.set(0); // Only see scene objects, not visualization
previewCameraB.layers.set(0);

// ===== Scene =====
export const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0f14, 10, 120);

// ===== Main camera and controls =====
export const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 500);
camera.position.set(8, 6, 16);
camera.layers.enableAll(); // Main camera sees all layers (0 and 1)

export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// ===== Lights =====
export const light = new THREE.HemisphereLight(0xcad7ff, 0x0a0e12, 0.9);
scene.add(light);

export const dir = new THREE.DirectionalLight(0xffffff, 0.35);
dir.position.set(5,10,2);
scene.add(dir);

// ===== Resize handler =====
export function setupResizeHandler() {
  window.addEventListener('resize', ()=>{
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
