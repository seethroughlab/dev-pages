// ===== People simulation =====
import * as THREE from 'three';
import { peopleSettings } from '../core/config.js';
import { scene } from '../core/scene.js';
import { hall } from './hallway.js';
import { isSliceVisibleToCamera } from '../systems/visibility.js';

let nextPersonId = 1;

// ===== Web Audio API for musical plucks =====
let audioContext = null;
let masterGain = null;
let reverbNode = null;

function initAudio() {
  if (audioContext) return;

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.3; // Soft volume
    masterGain.connect(audioContext.destination);

    // Create simple reverb using multiple delays
    reverbNode = createSimpleReverb();

    console.log('🎵 Audio initialized - musical floor activated!');
  } catch (e) {
    console.error('Failed to initialize audio:', e);
  }
}

function createSimpleReverb() {
  // Create input and output nodes
  const reverbInput = audioContext.createGain();
  const reverbOutput = audioContext.createGain();
  reverbOutput.connect(masterGain); // Connect to master gain for consistent volume

  // Create multiple delay taps for early reflections
  const delays = [0.029, 0.037, 0.053, 0.067, 0.079, 0.097];
  const gains = [0.8, 0.7, 0.6, 0.5, 0.4, 0.3];

  delays.forEach((delayTime, i) => {
    const delay = audioContext.createDelay();
    delay.delayTime.value = delayTime;

    const delayGain = audioContext.createGain();
    delayGain.gain.value = gains[i];

    reverbInput.connect(delay);
    delay.connect(delayGain);
    delayGain.connect(reverbOutput);
  });

  // Add a longer tail with feedback
  const tailDelay = audioContext.createDelay();
  tailDelay.delayTime.value = 0.13;
  const tailFeedback = audioContext.createGain();
  tailFeedback.gain.value = 0.3; // Safe feedback amount

  reverbInput.connect(tailDelay);
  tailDelay.connect(tailFeedback);
  tailFeedback.connect(tailDelay);
  tailFeedback.connect(reverbOutput);

  return reverbInput;
}

// Initialize audio on first user interaction
if (typeof window !== 'undefined') {
  const initOnInteraction = () => {
    initAudio();
    window.removeEventListener('click', initOnInteraction);
    window.removeEventListener('keydown', initOnInteraction);
  };
  window.addEventListener('click', initOnInteraction, { once: true });
  window.addEventListener('keydown', initOnInteraction, { once: true });
}

// C# Major scale frequencies (C#3 to C#5)
const cSharpScale = [
  138.59, // C#3
  155.56, // D#3
  174.61, // F3 (E#)
  185.00, // F#3
  207.65, // G#3
  233.08, // A#3
  261.63, // C4 (B#)
  277.18, // C#4
  311.13, // D#4
  349.23, // F4 (E#)
  369.99, // F#4
  415.30, // G#4
  466.16, // A#4
  523.25  // C5 (B#)
];

function playPluck(frequency, xPos, zPos, hallwayWidth, hallwayLength) {
  if (!audioContext) initAudio();

  const now = audioContext.currentTime;

  // Normalize positions to 0-1 range
  const xRatio = (xPos + hallwayWidth / 2) / hallwayWidth; // 0 (left) to 1 (right)
  const zRatio = zPos / hallwayLength; // 0 (near end) to 1 (far end)

  // ===== X-AXIS: TIMBRE MORPHING =====
  // Left → Right: triangle → sawtooth → square, percussive → sustained, single → chorused

  // Waveform selection
  let waveType = 'triangle';
  if (xRatio > 0.66) {
    waveType = 'square';
  } else if (xRatio > 0.33) {
    waveType = 'sawtooth';
  }

  // Envelope timing (attack and decay based on X position)
  const attackTime = 0.005 + xRatio * 0.015; // 5ms (left) to 20ms (right)
  const decayTime = 0.3 + xRatio * 0.7; // 300ms (left) to 1000ms (right)
  const peakGain = 0.4 - xRatio * 0.1; // Slightly quieter on right due to longer sustain

  // Number of oscillators (harmonic richness)
  const numOscillators = Math.floor(1 + xRatio * 2); // 1 (left) to 3 (right)
  const detuneAmount = xRatio * 8; // 0 (left) to 8 cents (right)

  // ===== Z-AXIS: REVERB AMOUNT =====
  // More reverb in middle of hallway, less at ends
  const distanceFromCenter = Math.abs(zRatio - 0.5);
  const reverbAmount = 1 - (distanceFromCenter * 2); // 1 at center, 0 at ends
  const reverbMix = reverbAmount * 0.5; // Max 50% wet

  // ===== CREATE SOUND =====
  const oscillators = [];
  const gains = [];

  for (let i = 0; i < numOscillators; i++) {
    const osc = audioContext.createOscillator();
    osc.type = waveType;

    // Detune for chorus effect (right side only)
    const detune = i === 0 ? 0 : (i - 1) * detuneAmount * (i % 2 === 0 ? 1 : -1);
    osc.frequency.value = frequency;
    osc.detune.value = detune;

    // Individual envelope for this oscillator
    const env = audioContext.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(peakGain / numOscillators, now + attackTime);
    env.gain.exponentialRampToValueAtTime(0.001, now + decayTime);

    osc.connect(env);
    oscillators.push(osc);
    gains.push(env);
  }

  // Add subtle vibrato (less on left, more on right)
  const vibrato = audioContext.createOscillator();
  vibrato.frequency.value = 5;
  const vibratoGain = audioContext.createGain();
  vibratoGain.gain.value = 1 + xRatio * 2; // 1 cent (left) to 3 cents (right)

  vibrato.connect(vibratoGain);
  oscillators.forEach(osc => {
    vibratoGain.connect(osc.frequency);
  });

  // Create dry/wet mixer for reverb
  const dryGain = audioContext.createGain();
  const wetGain = audioContext.createGain();
  dryGain.gain.value = 1 - reverbMix;
  wetGain.gain.value = reverbMix;

  // Connect all oscillators to dry/wet paths
  gains.forEach(env => {
    env.connect(dryGain);
    env.connect(wetGain);
  });

  dryGain.connect(masterGain);
  wetGain.connect(reverbNode);

  // Start all oscillators
  const stopTime = now + decayTime + 0.1;
  oscillators.forEach(osc => {
    osc.start(now);
    osc.stop(stopTime);
  });
  vibrato.start(now);
  vibrato.stop(stopTime);
}

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
    this.crossedLines = new Set(); // Track which lines this person has crossed
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
    this.boundingBox.layers.set(1); // Hide from preview cameras
    this.group.add(this.boundingBox);

    // Create label sprite
    this.label = this.createLabel();
    this.label.position.y = this.height + 0.3; // Above the person
    this.label.layers.set(1); // Hide from preview cameras
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

    // Store previous Z position for line crossing detection
    const prevZ = this.z;
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

    // ===== MUSICAL LINE CROSSING DETECTION =====
    // Only play notes when person is moving (not dwelling)
    if (!this.isDwelling) {
      // Detect which horizontal lines were crossed
      const numLines = 270; // Matches numShortLines from floor-texture.js
      const lineSpacing = L / (numLines - 1);

      // Calculate which line indices were crossed
      const prevLineIdx = Math.floor(prevZ / lineSpacing);
      const currLineIdx = Math.floor(this.z / lineSpacing);

      // If we crossed one or more lines
      if (prevLineIdx !== currLineIdx) {
        const start = Math.min(prevLineIdx, currLineIdx);
        const end = Math.max(prevLineIdx, currLineIdx);

        // Play a note for each crossed line (only once per line)
        for (let lineIdx = start; lineIdx <= end; lineIdx++) {
          if (lineIdx >= 0 && lineIdx < numLines && !this.crossedLines.has(lineIdx)) {
            this.crossedLines.add(lineIdx);

            // Map line position to note in C# scale
            // Spread the notes across the hallway length
            const noteIdx = Math.floor((lineIdx / numLines) * cSharpScale.length);
            const frequency = cSharpScale[noteIdx];

            // Play the pluck sound with position-based timbre and reverb
            playPluck(frequency, this.xOffset, this.z, W, L);
          }
        }
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

  // Spawn initial people - spread them out at the hallway ends
  const peoplePerEnd = Math.ceil(peopleSettings.count / 2);

  for (let i = 0; i < peopleSettings.count; i++) {
    // Alternate spawning at near and far ends
    const spawnAtNear = (i % 2) === 0;
    spawnPersonAtEnd(spawnAtNear);
  }
}

// Spawn person at specific end
function spawnPersonAtEnd(atNearEnd) {
  if (!hall.bounds) return;

  const { W, L } = hall.bounds;

  // Spawn well outside the hallway (2-4m outside)
  const spawnDistance = 2 + Math.random() * 2;
  const startZ = atNearEnd ? -spawnDistance : L + spawnDistance;
  const direction = atNearEnd ? 1 : -1;

  // Random x position across hallway width
  const xOffset = (Math.random() - 0.5) * W * 0.8; // Stay within 80% of width
  const speed = 0.7 + Math.random() * 0.6; // More speed variation (0.7-1.3 m/s)

  const person = new Person({ startZ, speed, xOffset });
  person.direction = direction;
  people.push(person);
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
