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
let analyserNode = null;
let fftData = null;

function initAudio() {
  if (audioContext) return;

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.3; // Soft volume

    // Create analyser for FFT visualization
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 512; // 256 frequency bins
    analyserNode.smoothingTimeConstant = 0.8; // Smooth out the data
    fftData = new Uint8Array(analyserNode.frequencyBinCount);

    // Connect: masterGain -> analyser -> destination
    masterGain.connect(analyserNode);
    analyserNode.connect(audioContext.destination);

    // Create simple reverb using multiple delays
    reverbNode = createSimpleReverb();

    // Initialize analysers for any existing people
    people.forEach(person => {
      if (!person.analyser) {
        person.analyser = audioContext.createAnalyser();
        person.analyser.fftSize = 64;
        person.analyser.smoothingTimeConstant = 0.7;
        person.fftData = new Uint8Array(person.analyser.frequencyBinCount);
      }
    });

    // Start metronome
    startMetronome();

    console.log('🎵 Audio initialized - musical floor activated with FFT analyzer!');
  } catch (e) {
    console.error('Failed to initialize audio:', e);
  }
}

// Export FFT data getter
export function getFFTData() {
  if (!analyserNode || !fftData) return null;
  analyserNode.getByteFrequencyData(fftData);
  return fftData;
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

// Musical scales - different keys and modes for variety
const scales = [
  {
    name: 'C# Major',
    notes: [138.59, 155.56, 174.61, 185.00, 207.65, 233.08, 261.63, 277.18, 311.13, 349.23, 369.99, 415.30, 466.16, 523.25]
  },
  {
    name: 'D Minor (Natural)',
    notes: [146.83, 164.81, 174.61, 196.00, 220.00, 233.08, 261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 466.16, 523.25]
  },
  {
    name: 'E Major',
    notes: [164.81, 185.00, 207.65, 220.00, 246.94, 277.18, 311.13, 329.63, 369.99, 415.30, 440.00, 493.88, 554.37, 622.25]
  },
  {
    name: 'F# Minor (Harmonic)',
    notes: [185.00, 207.65, 220.00, 246.94, 277.18, 293.66, 349.23, 369.99, 415.30, 440.00, 493.88, 554.37, 587.33, 698.46]
  },
  {
    name: 'A Major',
    notes: [220.00, 246.94, 277.18, 293.66, 329.63, 369.99, 415.30, 440.00, 493.88, 554.37, 587.33, 659.25, 739.99, 830.61]
  },
  {
    name: 'C Major Pentatonic',
    notes: [130.81, 146.83, 164.81, 196.00, 220.00, 261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 783.99]
  },
  {
    name: 'Bb Major',
    notes: [116.54, 130.81, 146.83, 155.56, 174.61, 196.00, 220.00, 233.08, 261.63, 293.66, 311.13, 349.23, 392.00, 440.00]
  },
  {
    name: 'G Minor (Melodic)',
    notes: [196.00, 220.00, 233.08, 261.63, 293.66, 329.63, 369.99, 392.00, 440.00, 466.16, 523.25, 587.33, 659.25, 739.99]
  }
];

// Track current scale and rotation
let currentScaleIndex = 0;
let scaleChangeTime = 0;
const SCALE_CHANGE_INTERVAL = 10; // seconds

// Metronome state
let metronomeInterval = null;
const METRONOME_BPM = 90;
const METRONOME_INTERVAL_MS = (60 / METRONOME_BPM) * 1000;

// Instrument types with different characteristics
const instrumentTypes = [
  { name: 'Sharp Pluck', attack: 0.001, decay: 0.2, sustain: 0, release: 0.1, waveform: 'triangle' },
  { name: 'Soft Pad', attack: 0.3, decay: 0.4, sustain: 0.6, release: 0.8, waveform: 'sine' },
  { name: 'Bright Bell', attack: 0.005, decay: 0.6, sustain: 0.2, release: 0.4, waveform: 'square' },
  { name: 'Warm Bass', attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.3, waveform: 'sawtooth' },
  { name: 'Hollow Flute', attack: 0.05, decay: 0.5, sustain: 0.4, release: 0.6, waveform: 'sine' },
  { name: 'Percussive Hit', attack: 0.001, decay: 0.15, sustain: 0, release: 0.05, waveform: 'square' },
  { name: 'String Pluck', attack: 0.002, decay: 0.8, sustain: 0.1, release: 0.5, waveform: 'sawtooth' },
  { name: 'Synth Lead', attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3, waveform: 'sawtooth' },
  { name: 'Mellow Organ', attack: 0.05, decay: 0.3, sustain: 0.8, release: 0.7, waveform: 'triangle' },
  { name: 'Glass Chime', attack: 0.001, decay: 1.2, sustain: 0, release: 0.2, waveform: 'sine' }
];

// Generate unique instrument for a person ID
function generateInstrument(personId) {
  // Use person ID as seed for deterministic randomness
  const seed = personId * 2654435761; // Large prime for better distribution

  // Create a seeded random function
  const random = (min = 0, max = 1) => {
    const x = Math.sin(seed + min * 100 + max * 1000) * 10000;
    return min + (x - Math.floor(x)) * (max - min);
  };

  // Pick a base instrument type
  const baseType = instrumentTypes[personId % instrumentTypes.length];

  // Generate unique variations
  return {
    name: baseType.name,
    waveform: baseType.waveform,
    attack: baseType.attack * (0.5 + random(0, 1)),
    decay: baseType.decay * (0.5 + random(0, 1.5)),
    sustain: baseType.sustain,
    release: baseType.release * (0.5 + random(0, 1.5)),

    // Harmonic complexity
    numOscillators: Math.floor(1 + random(0, 3)), // 1-3 oscillators
    detuneAmount: random(0, 15), // 0-15 cents detune

    // Filter characteristics
    useFilter: random() > 0.5,
    filterFreq: random(300, 4000),
    filterQ: random(1, 10),

    // Vibrato
    vibratoRate: random(3, 8), // 3-8 Hz
    vibratoDepth: random(0.5, 4), // 0.5-4 cents

    // Volume and brightness
    brightness: random(0.3, 1.0), // Affects harmonic content
    baseVolume: random(0.3, 0.5)
  };
}

function playPluck(frequency, xPos, zPos, hallwayWidth, hallwayLength, instrument, personAnalyser) {
  if (!audioContext) initAudio();

  const now = audioContext.currentTime;

  // Normalize positions to 0-1 range
  const xRatio = (xPos + hallwayWidth / 2) / hallwayWidth; // 0 (left) to 1 (right)
  const zRatio = zPos / hallwayLength; // 0 (near end) to 1 (far end)

  // ===== Z-AXIS: REVERB AMOUNT =====
  // More reverb in middle of hallway, less at ends
  const distanceFromCenter = Math.abs(zRatio - 0.5);
  const reverbAmount = 1 - (distanceFromCenter * 2); // 1 at center, 0 at ends
  const reverbMix = reverbAmount * 0.5; // Max 50% wet

  // ===== X-AXIS: SUBTLE TIMBRE MODULATION =====
  // Modulate instrument characteristics slightly based on X position
  const xModulation = (xRatio - 0.5) * 2; // -1 (left) to 1 (right)

  // ===== CREATE SOUND USING PERSON'S UNIQUE INSTRUMENT =====
  const oscillators = [];
  const gains = [];

  for (let i = 0; i < instrument.numOscillators; i++) {
    const osc = audioContext.createOscillator();
    osc.type = instrument.waveform;

    // Detune for chorus effect
    const detune = i === 0 ? 0 : (i - 1) * instrument.detuneAmount * (i % 2 === 0 ? 1 : -1);
    osc.frequency.value = frequency;
    osc.detune.value = detune + xModulation * 5; // Slight X-axis pitch bend

    // Create envelope based on instrument ADSR
    const env = audioContext.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(instrument.baseVolume / instrument.numOscillators, now + instrument.attack);

    if (instrument.sustain > 0) {
      // ADSR envelope (with sustain)
      env.gain.linearRampToValueAtTime(instrument.sustain * instrument.baseVolume / instrument.numOscillators, now + instrument.attack + instrument.decay);
      env.gain.linearRampToValueAtTime(0.001, now + instrument.attack + instrument.decay + instrument.release);
    } else {
      // AR envelope (no sustain - percussive)
      env.gain.exponentialRampToValueAtTime(0.001, now + instrument.attack + instrument.decay);
    }

    osc.connect(env);
    oscillators.push(osc);
    gains.push(env);
  }

  // Apply filter if instrument uses one
  let filterNode = null;
  if (instrument.useFilter) {
    filterNode = audioContext.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.value = instrument.filterFreq * (1 + xModulation * 0.3); // X-axis modulates filter
    filterNode.Q.value = instrument.filterQ;
  }

  // Add vibrato based on instrument characteristics
  const vibrato = audioContext.createOscillator();
  vibrato.frequency.value = instrument.vibratoRate;
  const vibratoGain = audioContext.createGain();
  vibratoGain.gain.value = instrument.vibratoDepth;

  vibrato.connect(vibratoGain);
  oscillators.forEach(osc => {
    vibratoGain.connect(osc.frequency);
  });

  // Create person-specific gain node for FFT analysis
  const personGain = audioContext.createGain();
  personGain.gain.value = 1.0;

  // Create dry/wet mixer for reverb
  const dryGain = audioContext.createGain();
  const wetGain = audioContext.createGain();
  dryGain.gain.value = 1 - reverbMix;
  wetGain.gain.value = reverbMix;

  // Connect signal path through person's analyser
  gains.forEach(env => {
    if (filterNode) {
      env.connect(filterNode);
    } else {
      env.connect(personGain);
    }
  });

  if (filterNode) {
    filterNode.connect(personGain);
  }

  // Connect person gain to their analyser (if available) and then to dry/wet
  if (personAnalyser) {
    personGain.connect(personAnalyser);
  }
  personGain.connect(dryGain);
  personGain.connect(wetGain);

  dryGain.connect(masterGain);
  wetGain.connect(reverbNode);

  // Calculate total duration
  const totalDuration = instrument.attack + instrument.decay + instrument.release;
  const stopTime = now + totalDuration + 0.1;

  // Start all oscillators
  oscillators.forEach(osc => {
    osc.start(now);
    osc.stop(stopTime);
  });
  vibrato.start(now);
  vibrato.stop(stopTime);
}

// Metronome beat function
function playMetronomeBeat(beatNumber) {
  if (!audioContext) return;

  const now = audioContext.currentTime;

  // Different sound for downbeat (1) vs offbeats (2, 3, 4)
  const isDownbeat = beatNumber % 4 === 1;

  if (isDownbeat) {
    // Kick drum sound (downbeat)
    const kickOsc = audioContext.createOscillator();
    kickOsc.frequency.setValueAtTime(150, now);
    kickOsc.frequency.exponentialRampToValueAtTime(40, now + 0.1);

    const kickEnv = audioContext.createGain();
    kickEnv.gain.setValueAtTime(0.4, now);
    kickEnv.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

    kickOsc.connect(kickEnv);
    kickEnv.connect(masterGain);

    kickOsc.start(now);
    kickOsc.stop(now + 0.15);
  } else {
    // Soft click (offbeats)
    const clickOsc = audioContext.createOscillator();
    clickOsc.frequency.value = 800;
    clickOsc.type = 'square';

    const clickEnv = audioContext.createGain();
    clickEnv.gain.setValueAtTime(0.08, now);
    clickEnv.gain.exponentialRampToValueAtTime(0.01, now + 0.03);

    clickOsc.connect(clickEnv);
    clickEnv.connect(masterGain);

    clickOsc.start(now);
    clickOsc.stop(now + 0.03);
  }
}

// Start metronome
function startMetronome() {
  if (metronomeInterval) return; // Already running

  let beatCount = 1;
  playMetronomeBeat(beatCount); // Play first beat immediately

  metronomeInterval = setInterval(() => {
    beatCount++;
    playMetronomeBeat(beatCount);
  }, METRONOME_INTERVAL_MS);

  console.log('🥁 Metronome started at ' + METRONOME_BPM + ' BPM');
}

// Stop metronome
function stopMetronome() {
  if (metronomeInterval) {
    clearInterval(metronomeInterval);
    metronomeInterval = null;
  }
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
    this.instrument = generateInstrument(this.id); // Generate unique instrument for this person
    console.log(`🎹 Person ${this.id} created with instrument: ${this.instrument.name} (${this.instrument.numOscillators} osc, filter: ${this.instrument.useFilter})`);

    // Create personal audio analyser for FFT visualization
    this.analyser = null;
    this.fftData = null;
    if (audioContext) {
      this.analyser = audioContext.createAnalyser();
      this.analyser.fftSize = 64; // 32 frequency bins (small for compact display)
      this.analyser.smoothingTimeConstant = 0.7;
      this.fftData = new Uint8Array(this.analyser.frequencyBinCount);
    }

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
    ctx.font = 'Bold 20px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const worldZ = origin.z + this.z;
    const boxWidth = this.radius * 2;
    const boxHeight = this.height;
    const boxDepth = this.radius * 2;

    const text = `ID:${this.id} • ${this.instrument.name}`;
    ctx.fillText(text, 10, 5);

    // Position info on second line
    ctx.font = '16px monospace';
    const posText = `[${this.xOffset.toFixed(2)},${worldZ.toFixed(2)}] [${boxWidth.toFixed(2)}×${boxHeight.toFixed(2)}×${boxDepth.toFixed(2)}]`;
    ctx.fillText(posText, 10, 28);

    // ===== DRAW PERSONAL FFT SPECTRUM =====
    if (this.analyser && this.fftData) {
      this.analyser.getByteFrequencyData(this.fftData);

      const numBars = this.fftData.length; // 32 bins
      const barWidth = (canvas.width - 20) / numBars; // Leave 10px margin on each side
      const maxBarHeight = 40; // 40px max height
      const startY = 50; // Position below text
      const baseY = startY + maxBarHeight;

      // Draw FFT bars
      for (let i = 0; i < numBars; i++) {
        const value = this.fftData[i] / 255.0; // Normalize to 0-1
        const barHeight = value * maxBarHeight;
        const x = 10 + i * barWidth;
        const y = baseY - barHeight;

        // Color based on frequency (same scheme as floor)
        let r, g, b;
        if (i < numBars / 3) {
          // Low frequencies: Red to Orange
          const t = (i / (numBars / 3));
          r = 255;
          g = Math.floor(t * 150);
          b = 50;
        } else if (i < 2 * numBars / 3) {
          // Mid frequencies: Cyan
          const t = ((i - numBars / 3) / (numBars / 3));
          r = Math.floor(100 + t * 70);
          g = Math.floor(200 + t * 55);
          b = 255;
        } else {
          // High frequencies: Magenta to White
          const t = ((i - 2 * numBars / 3) / (numBars / 3));
          r = Math.floor(200 + t * 55);
          g = Math.floor(100 + t * 155);
          b = 255;
        }

        // Draw bar
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.8})`;
        ctx.fillRect(x, y, barWidth - 1, barHeight);

        // Add glow on top
        if (value > 0.1) {
          const glowGradient = ctx.createRadialGradient(
            x + barWidth / 2, y, 0,
            x + barWidth / 2, y, barWidth * 1.5
          );
          glowGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.6 * value})`);
          glowGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

          ctx.fillStyle = glowGradient;
          ctx.fillRect(x - barWidth / 2, y - 5, barWidth * 2, 10);
        }
      }

      // Draw baseline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(10, baseY);
      ctx.lineTo(canvas.width - 10, baseY);
      ctx.stroke();
    }

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

            // Map line position to note in current scale
            // Spread the notes across the hallway length
            const currentScale = scales[currentScaleIndex].notes;
            const noteIdx = Math.floor((lineIdx / numLines) * currentScale.length);
            const frequency = currentScale[noteIdx];

            // Play the pluck sound with position-based timbre, reverb, and unique instrument
            playPluck(frequency, this.xOffset, this.z, W, L, this.instrument, this.analyser);
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

  // Update scale rotation timer
  scaleChangeTime += deltaTime;
  if (scaleChangeTime >= SCALE_CHANGE_INTERVAL) {
    scaleChangeTime = 0;
    currentScaleIndex = (currentScaleIndex + 1) % scales.length;
    console.log(`🎵 Scale changed to: ${scales[currentScaleIndex].name}`);

    // Clear all crossed lines so people can trigger notes again in the new scale
    people.forEach(p => p.crossedLines.clear());
  }

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
