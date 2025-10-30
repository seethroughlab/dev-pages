// ===== Camera nodes & FOV wedges =====
import * as THREE from 'three';
import { defaults, displaySettings, FT } from '../core/config.js';
import { scene } from '../core/scene.js';
import { hall } from './hallway.js';

export class CamNode {
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
    this.updateFOVVisibility();
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

  updateFOVVisibility() {
    if (this.fov) {
      this.fov.visible = displaySettings.showCameraFOV;
    }
  }
}

export const cameras = [];

// This will be set by heatmap module
let updateHeatmapCallback = null;

export function setUpdateHeatmapCallback(callback) {
  updateHeatmapCallback = callback;
}

export function addCamera(opts){
  const c = new CamNode(opts);
  cameras.push(c);
  if (updateHeatmapCallback) updateHeatmapCallback();
  return c;
}

// default two end cameras
export function seedCameras(){
  cameras.splice(0, cameras.length);
  const camHeight = defaults.hallway.height_ft * FT - 0.5; // 0.5m below ceiling
  addCamera({ name: 'Cam A', pos_m: [0, camHeight, 0.2], yawDeg: 0, pitchDeg: -8, hFovDeg: 80, end: 'near' });
  addCamera({ name: 'Cam B', pos_m: [0, camHeight, -0.2], yawDeg: 180, pitchDeg: -8, hFovDeg: 80, end: 'far' });
}
