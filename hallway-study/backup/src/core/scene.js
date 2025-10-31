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
const canvasC = document.getElementById('camC-preview');

if (!canvasA || !canvasB || !canvasC) {
  console.error('Preview canvases not found!', canvasA, canvasB, canvasC);
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

export const previewRendererC = new THREE.WebGLRenderer({
  canvas: canvasC,
  antialias: true,
  alpha: false
});
previewRendererC.setPixelRatio(Math.min(2, window.devicePixelRatio));
previewRendererC.setSize(previewWidth, previewHeight, false);
previewRendererC.setClearColor(0x0b0f14, 1);

// ===== Depth render targets =====
// Create render targets with depth textures for both cameras
export const depthRenderTargetA = new THREE.WebGLRenderTarget(previewWidth, previewHeight, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  depthBuffer: true,
  stencilBuffer: false,
  generateMipmaps: false
});
depthRenderTargetA.depthTexture = new THREE.DepthTexture(previewWidth, previewHeight);
depthRenderTargetA.depthTexture.format = THREE.DepthFormat;
depthRenderTargetA.depthTexture.type = THREE.UnsignedIntType;
depthRenderTargetA.depthTexture.minFilter = THREE.NearestFilter;
depthRenderTargetA.depthTexture.magFilter = THREE.NearestFilter;

export const depthRenderTargetB = new THREE.WebGLRenderTarget(previewWidth, previewHeight, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  depthBuffer: true,
  stencilBuffer: false,
  generateMipmaps: false
});
depthRenderTargetB.depthTexture = new THREE.DepthTexture(previewWidth, previewHeight);
depthRenderTargetB.depthTexture.format = THREE.DepthFormat;
depthRenderTargetB.depthTexture.type = THREE.UnsignedIntType;
depthRenderTargetB.depthTexture.minFilter = THREE.NearestFilter;
depthRenderTargetB.depthTexture.magFilter = THREE.NearestFilter;

export const depthRenderTargetC = new THREE.WebGLRenderTarget(previewWidth, previewHeight, {
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  depthBuffer: true,
  stencilBuffer: false,
  generateMipmaps: false
});
depthRenderTargetC.depthTexture = new THREE.DepthTexture(previewWidth, previewHeight);
depthRenderTargetC.depthTexture.format = THREE.DepthFormat;
depthRenderTargetC.depthTexture.type = THREE.UnsignedIntType;
depthRenderTargetC.depthTexture.minFilter = THREE.NearestFilter;
depthRenderTargetC.depthTexture.magFilter = THREE.NearestFilter;

// ===== Depth visualization shader =====
// Oak-D style depth map: near = warm (red/orange), far = cool (blue/purple)
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

// Create depth visualization materials for both cameras
export const depthVisualizationMaterialA = new THREE.ShaderMaterial({
  vertexShader: depthVisualizationShader.vertexShader,
  fragmentShader: depthVisualizationShader.fragmentShader,
  uniforms: {
    tDepth: { value: depthRenderTargetA.depthTexture },
    cameraNear: { value: 0.7 },
    cameraFar: { value: 12 }
  }
});

export const depthVisualizationMaterialB = new THREE.ShaderMaterial({
  vertexShader: depthVisualizationShader.vertexShader,
  fragmentShader: depthVisualizationShader.fragmentShader,
  uniforms: {
    tDepth: { value: depthRenderTargetB.depthTexture },
    cameraNear: { value: 0.7 },
    cameraFar: { value: 12 }
  }
});

export const depthVisualizationMaterialC = new THREE.ShaderMaterial({
  vertexShader: depthVisualizationShader.vertexShader,
  fragmentShader: depthVisualizationShader.fragmentShader,
  uniforms: {
    tDepth: { value: depthRenderTargetC.depthTexture },
    cameraNear: { value: 0.7 },
    cameraFar: { value: 12 }
  }
});

// Create fullscreen quads for displaying depth visualization
const quadGeometry = new THREE.PlaneGeometry(2, 2);
export const depthQuadA = new THREE.Mesh(quadGeometry, depthVisualizationMaterialA);
export const depthQuadB = new THREE.Mesh(quadGeometry, depthVisualizationMaterialB);
export const depthQuadC = new THREE.Mesh(quadGeometry, depthVisualizationMaterialC);

// Create orthographic cameras for rendering the depth quads
export const depthQuadCameraA = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
export const depthQuadCameraB = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
export const depthQuadCameraC = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// Create scenes for the depth quads
export const depthSceneA = new THREE.Scene();
depthSceneA.add(depthQuadA);
export const depthSceneB = new THREE.Scene();
depthSceneB.add(depthQuadB);
export const depthSceneC = new THREE.Scene();
depthSceneC.add(depthQuadC);

// Depth visualization mode toggle (false = RGB, true = depth)
export let depthVisualizationMode = false;
export function setDepthVisualizationMode(enabled) {
  depthVisualizationMode = enabled;
}

// ===== Preview cameras =====
// Three.js PerspectiveCamera uses VERTICAL FOV, not horizontal
// OAK-D Pro PoE: hFOV=80°, vFOV=55° (calculated from 80° * (10/16) aspect)
// Near/far clipping: 0.7m (min depth) to 12m (max depth)
export const previewCameraA = new THREE.PerspectiveCamera(55, 16/10, 0.7, 12);
export const previewCameraB = new THREE.PerspectiveCamera(55, 16/10, 0.7, 12);
export const previewCameraC = new THREE.PerspectiveCamera(55, 16/10, 0.7, 12);

// Use layer 1 for camera/projector visualizations (excluded from preview renders)
// Layer 0 (default) for everything else
previewCameraA.layers.set(0); // Only see scene objects, not visualization
previewCameraB.layers.set(0);
previewCameraC.layers.set(0);

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
