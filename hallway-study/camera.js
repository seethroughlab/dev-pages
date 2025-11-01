// ===== OAK-D Pro PoE Camera Module =====
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';

// OAK-D Pro PoE Stereo Depth Camera Specs (OV9282)
const CAMERA_SPECS = {
  hFovDeg: 80,      // Horizontal field of view
  vFovDeg: 55,      // Vertical field of view
  aspectRatio: 16/10,
  minRange_m: 0.7,  // Ideal depth range starts at 70cm
  maxRange_m: 12,   // Ideal depth range ends at 12m
  baseline_m: 0.075 // Stereo baseline: 7.5cm
};

let nextCameraId = 1;

export class Camera {
  constructor(scene, hallway, renderer, opts = {}) {
    const {
      name = `Cam ${String.fromCharCode(64 + nextCameraId)}`,
      pos_m = [0, hallway.height_m - 0.5, 0],
      yawDeg = 0,
      pitchDeg = -10,
      rollDeg = 0
    } = opts;

    this.id = nextCameraId++;
    this.name = name;
    this.scene = scene;
    this.hallway = hallway;
    this.renderer = renderer;

    // Position
    this.pos = new THREE.Vector3(...pos_m);

    // Rotation (in degrees for easier GUI control)
    this.yaw = yawDeg;
    this.pitch = pitchDeg;
    this.roll = rollDeg;

    // Camera specs (locked to OAK-D Pro PoE)
    this.hFovDeg = CAMERA_SPECS.hFovDeg;
    this.vFovDeg = CAMERA_SPECS.vFovDeg;
    this.minRange_m = CAMERA_SPECS.minRange_m;
    this.maxRange_m = CAMERA_SPECS.maxRange_m;

    // Create 3D representation
    this.group = new THREE.Group();
    this.group.userData.camera = this; // Store reference for TransformControls
    this.createCameraGeometry();
    this.createFrustumHelper();

    // Put camera visualization on layer 1 (hide from camera previews)
    this.group.layers.set(1);
    this.group.traverse((child) => {
      child.layers.set(1);
    });

    // Build initial position
    this.build();

    scene.add(this.group);
  }

  createCameraGeometry() {
    // Camera body (small box)
    const bodyGeometry = new THREE.BoxGeometry(0.1, 0.07, 0.03);
    this.bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a5a9a,
      roughness: 0.5,
      metalness: 0.3
    });
    this.body = new THREE.Mesh(bodyGeometry, this.bodyMaterial);
    this.body.castShadow = true;
    this.group.add(this.body);

    // Store original color for selection highlighting
    this.originalColor = 0x2a5a9a;
    this.selectedColor = 0xff6b35;

    // Invisible larger collision box for easier clicking (2x size)
    const clickBoxGeometry = new THREE.BoxGeometry(0.2, 0.14, 0.06);
    const clickBoxMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    this.clickBox = new THREE.Mesh(clickBoxGeometry, clickBoxMaterial);
    this.clickBox.layers.set(1); // On layer 1 for raycasting
    this.clickBox.userData.isClickBox = true; // Mark as click target
    this.group.add(this.clickBox);

    // Camera lenses (two small cylinders for stereo cameras)
    const lensGeometry = new THREE.CylinderGeometry(0.01, 0.01, 0.02, 8);
    const lensMaterial = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.2,
      metalness: 0.8
    });

    const leftLens = new THREE.Mesh(lensGeometry, lensMaterial);
    leftLens.rotation.x = Math.PI / 2;
    leftLens.position.set(-CAMERA_SPECS.baseline_m / 2, 0, -0.025);
    this.group.add(leftLens);

    const rightLens = new THREE.Mesh(lensGeometry, lensMaterial);
    rightLens.rotation.x = Math.PI / 2;
    rightLens.position.set(CAMERA_SPECS.baseline_m / 2, 0, -0.025);
    this.group.add(rightLens);

    // Direction indicator (small arrow pointing forward)
    const arrowHelper = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 0, -0.03),
      0.2,
      0xffffff, // White
      0.05,
      0.03
    );
    this.group.add(arrowHelper);

    // Boundary violation lines (will be created/updated in updateBoundsStatus)
    this.boundaryLines = {
      x: null,
      y: null,
      z: null
    };

    // Pulse animation state for violation lines
    this.pulseTime = 0;
  }

  createFrustumHelper() {
    // Create frustum visualization
    const aspect = CAMERA_SPECS.aspectRatio;
    const near = this.minRange_m;
    const far = this.maxRange_m;

    // Convert FOV to radians
    const vFovRad = THREE.MathUtils.degToRad(this.vFovDeg);
    const hFovRad = THREE.MathUtils.degToRad(this.hFovDeg);

    // Calculate frustum dimensions at near and far planes
    const nearHeight = 2 * Math.tan(vFovRad / 2) * near;
    const nearWidth = nearHeight * aspect;
    const farHeight = 2 * Math.tan(vFovRad / 2) * far;
    const farWidth = farHeight * aspect;

    // Create frustum mesh with very faint fill
    const frustumGeometry = new THREE.BufferGeometry();

    // Define 8 vertices (4 at near plane, 4 at far plane)
    const vertices = new Float32Array([
      // Near plane (closer to camera, looking down -Z)
      -nearWidth/2, nearHeight/2, -near,   // top-left
      nearWidth/2, nearHeight/2, -near,    // top-right
      nearWidth/2, -nearHeight/2, -near,   // bottom-right
      -nearWidth/2, -nearHeight/2, -near,  // bottom-left

      // Far plane
      -farWidth/2, farHeight/2, -far,      // top-left
      farWidth/2, farHeight/2, -far,       // top-right
      farWidth/2, -farHeight/2, -far,      // bottom-right
      -farWidth/2, -farHeight/2, -far      // bottom-left
    ]);

    // Define faces (triangles)
    const indices = new Uint16Array([
      // Near plane
      0, 1, 2,  0, 2, 3,
      // Far plane
      4, 6, 5,  4, 7, 6,
      // Left face
      0, 3, 7,  0, 7, 4,
      // Right face
      1, 5, 6,  1, 6, 2,
      // Top face
      0, 4, 5,  0, 5, 1,
      // Bottom face
      3, 2, 6,  3, 6, 7
    ]);

    frustumGeometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    frustumGeometry.setIndex(new THREE.BufferAttribute(indices, 1));
    frustumGeometry.computeVertexNormals();

    // Very faint blue fill
    const frustumMaterial = new THREE.MeshBasicMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false
    });

    this.frustumMesh = new THREE.Mesh(frustumGeometry, frustumMaterial);
    this.frustumMesh.raycast = () => {}; // Disable raycasting
    this.frustumMesh.layers.set(1); // Hide from camera previews
    this.group.add(this.frustumMesh);

    // Create a perspective camera for frustum line visualization
    this.frustumCamera = new THREE.PerspectiveCamera(
      this.vFovDeg,
      aspect,
      near,
      far
    );

    // Create frustum helper with muted color
    this.frustumHelper = new THREE.CameraHelper(this.frustumCamera);
    this.frustumHelper.visible = true;

    // Change the color of the frustum lines to a muted blue-gray
    // CameraHelper uses multiple materials, update them all
    this.frustumHelper.traverse((child) => {
      if (child.material) {
        child.material.color.setHex(0x5588aa);
      }
    });

    // Make sure frustum doesn't block raycasting to transform controls
    this.frustumHelper.raycast = () => {}; // Disable raycasting on frustum

    this.group.add(this.frustumHelper);
  }

  build() {
    // Apply position
    this.group.position.copy(this.pos);

    // Apply rotation (yaw, pitch, roll)
    const yawRad = THREE.MathUtils.degToRad(this.yaw);
    const pitchRad = THREE.MathUtils.degToRad(this.pitch);
    const rollRad = THREE.MathUtils.degToRad(this.roll);

    // Create rotation quaternion (order: YXZ for yaw, pitch, roll)
    const euler = new THREE.Euler(pitchRad, yawRad, rollRad, 'YXZ');
    this.group.quaternion.setFromEuler(euler);

    // Update frustum helper
    this.frustumHelper.update();

    // Update bounds status (LEDs and violation lines)
    this.updateBoundsStatus();
  }

  updateBoundsStatus() {
    const { width_m, height_m, length_m } = this.hallway;

    // Check each axis
    const xInBounds = this.pos.x >= -width_m / 2 && this.pos.x <= width_m / 2;
    const yInBounds = this.pos.y >= 0 && this.pos.y <= height_m;
    const zInBounds = this.pos.z >= -length_m / 2 && this.pos.z <= length_m / 2;

    // Update boundary violation lines (dashed lines)
    this.updateBoundaryLine('x', !xInBounds, 0xff0000);
    this.updateBoundaryLine('y', !yInBounds, 0x00ff00);
    this.updateBoundaryLine('z', !zInBounds, 0x0000ff);
  }

  updateBoundaryLine(axis, isViolated, color) {
    // Remove existing line if it exists
    if (this.boundaryLines[axis]) {
      this.scene.remove(this.boundaryLines[axis]);
      this.boundaryLines[axis].geometry.dispose();
      this.boundaryLines[axis].material.dispose();
      this.boundaryLines[axis] = null;
    }

    // Create new line if violated
    if (isViolated) {
      const { width_m, height_m, length_m } = this.hallway;
      const cameraPos = this.group.position.clone();
      let boundaryPos = new THREE.Vector3();

      // Calculate boundary point based on axis
      if (axis === 'x') {
        // Find which X boundary is violated
        const boundaryX = this.pos.x < -width_m / 2 ? -width_m / 2 : width_m / 2;
        boundaryPos.set(boundaryX, cameraPos.y, cameraPos.z);
      } else if (axis === 'y') {
        // Find which Y boundary is violated
        const boundaryY = this.pos.y < 0 ? 0 : height_m;
        boundaryPos.set(cameraPos.x, boundaryY, cameraPos.z);
      } else if (axis === 'z') {
        // Find which Z boundary is violated
        const boundaryZ = this.pos.z < -length_m / 2 ? -length_m / 2 : length_m / 2;
        boundaryPos.set(cameraPos.x, cameraPos.y, boundaryZ);
      }

      // Create thick dashed line using Line2
      const positions = [
        cameraPos.x, cameraPos.y, cameraPos.z,
        boundaryPos.x, boundaryPos.y, boundaryPos.z
      ];

      const lineGeometry = new LineGeometry();
      lineGeometry.setPositions(positions);

      const lineMaterial = new LineMaterial({
        color: color,
        linewidth: 4, // In pixels
        dashed: true,
        dashScale: 2,
        dashSize: 0.2,
        gapSize: 0.1,
        opacity: 0.8,
        transparent: true,
        resolution: new THREE.Vector2(
          this.renderer.domElement.width,
          this.renderer.domElement.height
        )
      });

      // Make the material store a reference to its color for pulsing
      lineMaterial.userData.baseColor = new THREE.Color(color);
      lineMaterial.userData.baseOpacity = 0.8;

      const line = new Line2(lineGeometry, lineMaterial);
      line.computeLineDistances();
      line.layers.set(1); // Hide from camera previews
      this.scene.add(line);
      this.boundaryLines[axis] = line;
    }
  }

  // Get the Three.js camera for preview rendering
  getPreviewCamera() {
    const camera = new THREE.PerspectiveCamera(
      this.vFovDeg,
      CAMERA_SPECS.aspectRatio,
      this.minRange_m,
      this.maxRange_m
    );

    // Position and orient the camera
    camera.position.copy(this.group.position);
    camera.quaternion.copy(this.group.quaternion);

    // Only render layer 0 (exclude UI elements on layer 1)
    camera.layers.set(0);

    return camera;
  }

  setSelected(selected) {
    if (selected) {
      this.bodyMaterial.color.setHex(this.selectedColor);
      this.bodyMaterial.emissive.setHex(0x442200);
      this.bodyMaterial.emissiveIntensity = 0.3;
    } else {
      this.bodyMaterial.color.setHex(this.originalColor);
      this.bodyMaterial.emissive.setHex(0x000000);
      this.bodyMaterial.emissiveIntensity = 0;
    }
  }

  update(deltaTime) {
    // Update flash animation for boundary violation lines
    this.pulseTime += deltaTime * 5; // Flash speed (faster)

    ['x', 'y', 'z'].forEach(axis => {
      const line = this.boundaryLines[axis];
      if (line && line.material) {
        const mat = line.material;
        const baseColor = mat.userData.baseColor;
        const baseOpacity = mat.userData.baseOpacity;

        // Flashing effect using sine wave (0 to 1 range)
        const flash = 0.5 + Math.sin(this.pulseTime) * 0.5;

        // Very intense brightness variation (0.5x to 3x brightness)
        const brightenFactor = 0.5 + flash * 2.5;
        mat.color.copy(baseColor).multiplyScalar(brightenFactor);

        // Flash opacity intensely (0.3 to 1.0)
        mat.opacity = baseOpacity * (0.3 + flash * 0.7);
      }
    });
  }

  remove() {
    this.scene.remove(this.group);
    this.body.geometry.dispose();
    this.body.material.dispose();

    // Dispose frustum mesh
    if (this.frustumMesh) {
      this.frustumMesh.geometry.dispose();
      this.frustumMesh.material.dispose();
    }

    // Remove boundary violation lines
    ['x', 'y', 'z'].forEach(axis => {
      if (this.boundaryLines[axis]) {
        this.scene.remove(this.boundaryLines[axis]);
        this.boundaryLines[axis].geometry.dispose();
        this.boundaryLines[axis].material.dispose();
      }
    });
  }
}

export class CameraManager {
  constructor(scene, hallway, renderer) {
    this.scene = scene;
    this.hallway = hallway;
    this.renderer = renderer;
    this.cameras = [];
  }

  addCamera(opts) {
    const camera = new Camera(this.scene, this.hallway, this.renderer, opts);
    this.cameras.push(camera);
    return camera;
  }

  removeCamera(camera) {
    const index = this.cameras.indexOf(camera);
    if (index >= 0) {
      camera.remove();
      this.cameras.splice(index, 1);
    }
  }

  removeAllCameras() {
    this.cameras.forEach(camera => camera.remove());
    this.cameras.length = 0;
  }
}
