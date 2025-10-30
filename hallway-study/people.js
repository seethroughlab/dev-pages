// ===== People simulation =====
import * as THREE from 'three';
import { peopleSettings } from './config.js';
import { scene } from './scene.js';
import { hall } from './hallway.js';
import { isSliceVisibleToCamera } from './visibility.js';

let nextPersonId = 1;

// Simple Perlin-like noise
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

export class Person {
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

  update(deltaTime, cameras) {
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
      const sliceVisible = cameras.some(cam => isSliceVisibleToCamera(sliceWorldPos, slice, this, cam, people));
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

export const people = [];

let nextSpawnTime = 0;
const spawnInterval = 4; // Spawn a new person every 4 seconds on average (increased from 2)

export function createPeople() {
  // Clear existing
  people.forEach(p => p.remove());
  people.length = 0;

  if (!peopleSettings.enabled || !hall.bounds) return;

  // Spawn initial people
  for (let i = 0; i < peopleSettings.count; i++) {
    spawnPerson();
  }
}

export function updatePeople(deltaTime, cameras) {
  if (!peopleSettings.enabled || !hall.bounds) return;

  // Update existing people
  people.forEach(p => p.update(deltaTime, cameras));

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

export function spawnPerson() {
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

// Generate JSON tracking data for all people
export function generateTrackingJSON() {
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
