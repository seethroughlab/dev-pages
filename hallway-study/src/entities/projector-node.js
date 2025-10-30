// ===== Projector nodes =====
import * as THREE from 'three';
import { scene } from '../core/scene.js';
import { hall } from './hallway.js';

export class ProjectorNode {
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

export const projectors = [];

export function createProjectors(){
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
