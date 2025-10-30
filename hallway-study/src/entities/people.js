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

  updateAudioStatus('Initializing audio...', 'warning');

  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    // Check if context was created successfully
    if (!audioContext) {
      throw new Error('AudioContext creation failed');
    }

    console.log('AudioContext state:', audioContext.state);

    // Resume context if suspended (required on some browsers)
    if (audioContext.state === 'suspended') {
      audioContext.resume().then(() => {
        console.log('AudioContext resumed');
      });
    }

    masterGain = audioContext.createGain();

    // Start at zero and fade in over 2 seconds (faster)
    masterGain.gain.value = 0;
    const now = audioContext.currentTime;
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(0.3, now + 2.0); // 2 second fade-in

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

    // Set musical time start for quantization
    musicalTimeStart = audioContext.currentTime + 0.5; // Start 500ms from now

    updateAudioStatus('Audio active - fade in...', 'success');

    // Delay drum scheduler start by 500ms, let it fade in naturally
    setTimeout(() => {
      if (audioContext && audioContext.state === 'running') {
        startDrumScheduler();
        updateAudioStatus('🎵 Musical floor active', 'success');
        console.log('🎵 Audio initialized - musical floor activated!');
      } else {
        updateAudioStatus('Audio suspended - click to activate', 'error');
      }
    }, 500);

  } catch (e) {
    console.error('Failed to initialize audio:', e);
    updateAudioStatus('⚠️ Audio failed - ' + e.message, 'error');
  }
}

// Update status display
function updateAudioStatus(message, type = 'info') {
  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.className = 'status-' + type;
  }
}

// Update music info display (key and BPM)
export function updateMusicInfoDisplay() {
  const keyEl = document.getElementById('music-key');
  const bpmEl = document.getElementById('music-bpm');
  const musicInfoEl = document.querySelector('.music-info');

  if (keyEl && bpmEl) {
    // Update key display
    const currentScale = scales[currentScaleIndex];
    keyEl.textContent = currentScale.name;

    // Update BPM display
    bpmEl.textContent = Math.round(currentBPM);

    // Add active class when audio is running
    if (audioContext && audioContext.state === 'running' && musicInfoEl) {
      musicInfoEl.classList.add('active');
    } else if (musicInfoEl) {
      musicInfoEl.classList.remove('active');
    }
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
    console.log('🔊 User interaction detected - initializing audio...');
    initAudio();
    window.removeEventListener('click', initOnInteraction);
    window.removeEventListener('keydown', initOnInteraction);
  };
  window.addEventListener('click', initOnInteraction, { once: true });
  window.addEventListener('keydown', initOnInteraction, { once: true });

  console.log('🎧 Waiting for user interaction to start audio (click or keypress)...');

  // Show initial status after a brief delay (let page load)
  setTimeout(() => {
    updateAudioStatus('Click anywhere to start audio', 'info');
  }, 100);
}

// Musical scales following Camelot Wheel harmonic mixing
// Progression: 8A → 8B → 9B → 9A → 10A → 10B → 11B → 11A (smooth harmonic journey)
const scales = [
  {
    name: 'A Minor (8A)',
    camelot: '8A',
    notes: [220.00, 246.94, 261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25, 587.33, 659.25, 698.46, 783.99]
  },
  {
    name: 'C Major (8B)',
    camelot: '8B',
    notes: [130.81, 146.83, 164.81, 174.61, 196.00, 220.00, 246.94, 261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88]
  },
  {
    name: 'G Major (9B)',
    camelot: '9B',
    notes: [196.00, 220.00, 246.94, 261.63, 293.66, 329.63, 369.99, 392.00, 440.00, 493.88, 523.25, 587.33, 659.25, 739.99]
  },
  {
    name: 'E Minor (9A)',
    camelot: '9A',
    notes: [164.81, 185.00, 196.00, 220.00, 246.94, 261.63, 293.66, 329.63, 369.99, 392.00, 440.00, 493.88, 523.25, 587.33]
  },
  {
    name: 'B Minor (10A)',
    camelot: '10A',
    notes: [246.94, 277.18, 293.66, 329.63, 369.99, 392.00, 440.00, 493.88, 554.37, 587.33, 659.25, 739.99, 783.99, 880.00]
  },
  {
    name: 'D Major (10B)',
    camelot: '10B',
    notes: [146.83, 164.81, 185.00, 196.00, 220.00, 246.94, 277.18, 293.66, 329.63, 369.99, 392.00, 440.00, 493.88, 554.37]
  },
  {
    name: 'A Major (11B)',
    camelot: '11B',
    notes: [220.00, 246.94, 277.18, 293.66, 329.63, 369.99, 415.30, 440.00, 493.88, 554.37, 587.33, 659.25, 739.99, 830.61]
  },
  {
    name: 'F# Minor (11A)',
    camelot: '11A',
    notes: [185.00, 207.65, 220.00, 246.94, 277.18, 293.66, 329.63, 369.99, 415.30, 440.00, 493.88, 554.37, 587.33, 659.25]
  }
];

// Track current scale and rotation
let currentScaleIndex = 0;
let scaleChangeTime = 0;
const SCALE_CHANGE_INTERVAL = 10; // seconds

// Metronome state
let metronomeInterval = null;
let currentBPM = 90; // Dynamic BPM based on movement
const MIN_BPM = 60;
const MAX_BPM = 140;
let BEAT_DURATION_SEC = 60 / currentBPM;
let SIXTEENTH_NOTE_SEC = BEAT_DURATION_SEC / 4;

// Musical time tracking
let musicalTimeStart = 0; // When audio started (audioContext time)
let currentBeat = 0;
let lastBeatTime = 0;

// Chord progressions for each scale (4 chords, each lasting 4 beats = 16 beats total)
// Each chord is defined as indices into the scale
const chordProgressions = [
  // A Minor (8A): i - iv - v - i
  [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 2, 4]],
  // C Major (8B): I - vi - IV - V (classic pop)
  [[0, 2, 4], [5, 7, 9], [3, 5, 7], [4, 6, 8]],
  // G Major (9B): I - V - vi - IV
  [[0, 2, 4], [4, 6, 8], [5, 7, 9], [3, 5, 7]],
  // E Minor (9A): i - VI - III - VII
  [[0, 2, 4], [5, 7, 9], [2, 4, 6], [6, 8, 10]],
  // B Minor (10A): i - iv - VII - III
  [[0, 2, 4], [3, 5, 7], [6, 8, 10], [2, 4, 6]],
  // D Major (10B): I - IV - V - I
  [[0, 2, 4], [3, 5, 7], [4, 6, 8], [0, 2, 4]],
  // A Major (11B): I - V - vi - IV
  [[0, 2, 4], [4, 6, 8], [5, 7, 9], [3, 5, 7]],
  // F# Minor (11A): i - VI - III - VII
  [[0, 2, 4], [5, 7, 9], [2, 4, 6], [6, 8, 10]]
];

// Get current chord tones based on musical time
function getCurrentChordTones() {
  if (!audioContext || musicalTimeStart === 0) return [0, 2, 4, 7, 9]; // Default pentatonic

  const currentTime = audioContext.currentTime - musicalTimeStart;

  // Safety check: if time is negative, return default
  if (currentTime < 0) return [0, 2, 4, 7, 9];

  const currentBeat = (currentTime / BEAT_DURATION_SEC) % 16; // 16 beat cycle (4 chords × 4 beats)
  const chordIndex = Math.floor(currentBeat / 4) % 4; // Which chord in the progression (ensure 0-3)

  // Safety checks
  if (!chordProgressions[currentScaleIndex]) {
    console.warn('Invalid scale index:', currentScaleIndex);
    return [0, 2, 4, 7, 9];
  }

  const progression = chordProgressions[currentScaleIndex];
  const chord = progression[chordIndex];

  if (!chord || !Array.isArray(chord)) {
    console.warn('Invalid chord:', chord, 'at index:', chordIndex);
    return [0, 2, 4, 7, 9];
  }

  // Return chord tones plus octave extensions for more note options
  return [...chord, ...chord.map(n => n + 7), ...chord.map(n => n + 3.5).map(Math.floor)];
}

// Instrument types organized by category for balanced orchestration
const instrumentTypes = {
  bass: [
    { name: 'Deep Bass', attack: 0.01, decay: 0.4, sustain: 0.6, release: 0.3, waveform: 'sawtooth' },
    { name: 'Sub Bass', attack: 0.005, decay: 0.3, sustain: 0.7, release: 0.2, waveform: 'sine' },
    { name: 'Synth Bass', attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.3, waveform: 'square' }
  ],
  percussion: [
    { name: 'Sharp Pluck', attack: 0.001, decay: 0.2, sustain: 0, release: 0.1, waveform: 'triangle' },
    { name: 'Percussive Hit', attack: 0.001, decay: 0.15, sustain: 0, release: 0.05, waveform: 'square' },
    { name: 'Glass Chime', attack: 0.001, decay: 1.2, sustain: 0, release: 0.2, waveform: 'sine' },
    { name: 'Marimba', attack: 0.002, decay: 0.5, sustain: 0, release: 0.3, waveform: 'triangle' }
  ],
  pads: [
    { name: 'Soft Pad', attack: 0.3, decay: 0.4, sustain: 0.6, release: 0.8, waveform: 'sine' },
    { name: 'Mellow Organ', attack: 0.05, decay: 0.3, sustain: 0.8, release: 0.7, waveform: 'triangle' },
    { name: 'String Pad', attack: 0.2, decay: 0.5, sustain: 0.7, release: 1.0, waveform: 'sawtooth' }
  ],
  leads: [
    { name: 'Synth Lead', attack: 0.01, decay: 0.2, sustain: 0.7, release: 0.3, waveform: 'sawtooth' },
    { name: 'Hollow Flute', attack: 0.05, decay: 0.5, sustain: 0.4, release: 0.6, waveform: 'sine' },
    { name: 'String Pluck', attack: 0.002, decay: 0.8, sustain: 0.1, release: 0.5, waveform: 'sawtooth' },
    { name: 'Bright Bell', attack: 0.005, decay: 0.6, sustain: 0.2, release: 0.4, waveform: 'square' }
  ]
};

// Track last category used for cycling
let lastCategoryIndex = -1;
const categories = ['bass', 'percussion', 'pads', 'leads'];

// Generate unique instrument for a person ID
function generateInstrument(personId) {
  // Cycle through categories to ensure balanced instrumentation
  lastCategoryIndex = (lastCategoryIndex + 1) % categories.length;
  const category = categories[lastCategoryIndex];
  const categoryInstruments = instrumentTypes[category];

  // Use person ID as seed for deterministic randomness
  const seed = personId * 2654435761; // Large prime for better distribution

  // Create a seeded random function
  const random = (min = 0, max = 1) => {
    const x = Math.sin(seed + min * 100 + max * 1000) * 10000;
    return min + (x - Math.floor(x)) * (max - min);
  };

  // Pick an instrument from the current category
  const instrumentIndex = Math.floor(random(0, categoryInstruments.length));
  const baseType = categoryInstruments[instrumentIndex];

  // Generate unique variations based on category
  const variations = {
    bass: {
      numOscillators: Math.floor(1 + random(0, 2)), // 1-2 for bass (keep it tight)
      detuneAmount: random(0, 5), // Minimal detune for bass
      filterFreq: random(80, 400), // Low frequencies
      baseVolume: random(0.4, 0.6) // Louder for foundation
    },
    percussion: {
      numOscillators: 1, // Single oscillator for clarity
      detuneAmount: 0, // No detune for percussion
      filterFreq: random(1000, 6000), // High frequencies
      baseVolume: random(0.3, 0.5)
    },
    pads: {
      numOscillators: Math.floor(2 + random(0, 2)), // 2-3 for richness
      detuneAmount: random(5, 15), // Lots of detune for width
      filterFreq: random(500, 3000), // Mid frequencies
      baseVolume: random(0.2, 0.35) // Quieter for background
    },
    leads: {
      numOscillators: Math.floor(1 + random(0, 3)), // 1-3 for variety
      detuneAmount: random(0, 10), // Moderate detune
      filterFreq: random(800, 5000), // Mid-high frequencies
      baseVolume: random(0.35, 0.5)
    }
  };

  const categoryVars = variations[category];

  // Build instrument with category-specific characteristics
  return {
    name: baseType.name,
    category: category,
    waveform: baseType.waveform,
    attack: baseType.attack * (0.5 + random(0, 1)),
    decay: baseType.decay * (0.5 + random(0, 1.5)),
    sustain: baseType.sustain,
    release: baseType.release * (0.5 + random(0, 1.5)),

    // Category-specific variations
    numOscillators: categoryVars.numOscillators,
    detuneAmount: categoryVars.detuneAmount,
    filterFreq: categoryVars.filterFreq,
    baseVolume: categoryVars.baseVolume,

    // Filter characteristics
    useFilter: random() > 0.5,
    filterQ: random(1, 10),

    // Vibrato
    vibratoRate: random(3, 8), // 3-8 Hz
    vibratoDepth: random(0.5, 4), // 0.5-4 cents

    // Brightness
    brightness: random(0.3, 1.0)
  };
}

function playPluck(frequency, xPos, zPos, hallwayWidth, hallwayLength, instrument, personAnalyser, scheduledTime = null) {
  if (!audioContext) initAudio();

  const now = scheduledTime !== null ? scheduledTime : audioContext.currentTime;

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

// Kick drum sound
function playKick(time, volumeMultiplier = 1.0) {
  if (!audioContext) return;

  const now = time || audioContext.currentTime;

  // Oscillator: 150Hz -> 40Hz (punchy low end)
  const kickOsc = audioContext.createOscillator();
  kickOsc.frequency.setValueAtTime(150, now);
  kickOsc.frequency.exponentialRampToValueAtTime(40, now + 0.5);

  // Envelope: quick attack, medium decay
  const kickEnv = audioContext.createGain();
  kickEnv.gain.setValueAtTime(0.6 * volumeMultiplier, now);
  kickEnv.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

  // Add some punch with noise
  const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.05, audioContext.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) {
    noiseData[i] = Math.random() * 2 - 1;
  }

  const noise = audioContext.createBufferSource();
  noise.buffer = noiseBuffer;

  const noiseFilter = audioContext.createBiquadFilter();
  noiseFilter.type = 'lowpass';
  noiseFilter.frequency.value = 100;

  const noiseEnv = audioContext.createGain();
  noiseEnv.gain.setValueAtTime(0.2 * volumeMultiplier, now);
  noiseEnv.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseEnv);
  noiseEnv.connect(masterGain);

  kickOsc.connect(kickEnv);
  kickEnv.connect(masterGain);

  kickOsc.start(now);
  kickOsc.stop(now + 0.5);
  noise.start(now);
}

// Snare drum sound
function playSnare(time) {
  if (!audioContext) return;

  const now = time || audioContext.currentTime;

  // Noise for snare body
  const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 0.2, audioContext.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) {
    noiseData[i] = Math.random() * 2 - 1;
  }

  const noise = audioContext.createBufferSource();
  noise.buffer = noiseBuffer;

  const noiseFilter = audioContext.createBiquadFilter();
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.value = 1000;

  const noiseEnv = audioContext.createGain();
  noiseEnv.gain.setValueAtTime(0.3, now);
  noiseEnv.gain.exponentialRampToValueAtTime(0.01, now + 0.2);

  // Tonal component (gives snare its pitch)
  const toneOsc = audioContext.createOscillator();
  toneOsc.type = 'triangle';
  toneOsc.frequency.value = 200;

  const toneEnv = audioContext.createGain();
  toneEnv.gain.setValueAtTime(0.15, now);
  toneEnv.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

  noise.connect(noiseFilter);
  noiseFilter.connect(noiseEnv);
  noiseEnv.connect(masterGain);

  toneOsc.connect(toneEnv);
  toneEnv.connect(masterGain);

  noise.start(now);
  toneOsc.start(now);
  toneOsc.stop(now + 0.1);
}

// Calculate average movement speed of all people
function getAverageMovementSpeed() {
  if (people.length === 0) return 0;

  let totalSpeed = 0;
  let movingPeople = 0;

  for (const person of people) {
    if (!person.isDwelling && Math.abs(person.speed) > 0.1) {
      totalSpeed += Math.abs(person.speed);
      movingPeople++;
    }
  }

  return movingPeople > 0 ? totalSpeed / movingPeople : 0;
}

// Update BPM based on movement
function updateBPM() {
  const avgSpeed = getAverageMovementSpeed();

  // Map speed (0-1.3 m/s) to BPM (60-140)
  // Slower movement = slower tempo, faster movement = faster tempo
  const targetBPM = MIN_BPM + (avgSpeed / 1.3) * (MAX_BPM - MIN_BPM);

  // Smooth BPM changes (don't jump abruptly)
  currentBPM = currentBPM * 0.95 + targetBPM * 0.05;

  // Update derived timing values
  BEAT_DURATION_SEC = 60 / currentBPM;
  SIXTEENTH_NOTE_SEC = BEAT_DURATION_SEC / 4;
}

// Drum patterns (K = kick, S = snare, - = rest, k = softer kick)
const drumPatterns = [
  {
    name: 'Basic 4/4',
    pattern: ['K', 'S', 'K', 'S'] // Classic four-on-floor
  },
  {
    name: 'Breakbeat',
    pattern: ['K', '-', 'S', '-', 'k', '-', 'S', 'k'] // 2-bar breakbeat
  },
  {
    name: 'Double Kick',
    pattern: ['K', 'k', 'S', '-', 'K', '-', 'S', 'k'] // 2-bar with double kicks
  },
  {
    name: 'Half-Time',
    pattern: ['K', '-', '-', '-', 'S', '-', '-', '-'] // 2-bar slow groove
  },
  {
    name: 'Shuffle',
    pattern: ['K', '-', 'k', 'S', '-', 'k', 'K', 'S'] // 2-bar shuffle feel
  },
  {
    name: 'Boom-Bap',
    pattern: ['K', '-', 'S', 'k', 'K', '-', 'S', '-'] // 2-bar hip-hop
  }
];

let currentPatternIndex = 0;
let patternChangeCounter = 0;
const BARS_PER_PATTERN = 8; // Switch pattern every 8 bars (32 beats)

// Drum scheduler (runs continuously, schedules beats ahead)
let nextBeatTime = 0;
let isSchedulerRunning = false;
const scheduleAheadTime = 0.1; // Schedule 100ms ahead

function scheduleDrums() {
  if (!audioContext || !isSchedulerRunning) return;

  const currentTime = audioContext.currentTime;

  // Schedule all beats that should happen in the next scheduleAheadTime
  while (nextBeatTime < currentTime + scheduleAheadTime) {
    // Only play drums if people are present
    if (people.length > 0) {
      const beatInBar = currentBeat % 4; // 0-3 (beat in 4-beat bar)
      const currentPattern = drumPatterns[currentPatternIndex].pattern;
      const patternLength = currentPattern.length;
      const patternIndex = currentBeat % patternLength;

      // Play drum based on pattern
      const hit = currentPattern[patternIndex];
      if (hit === 'K') {
        playKick(nextBeatTime);
      } else if (hit === 'k') {
        // Softer kick (ghost note)
        playKick(nextBeatTime, 0.4); // 40% volume
      } else if (hit === 'S') {
        playSnare(nextBeatTime);
      }
      // '-' = rest, don't play anything

      // Log chord changes and pattern switches (every 4 beats)
      if (beatInBar === 0) {
        const chordNum = Math.floor(currentBeat / 4) % 4;
        const chordNames = ['I', 'II', 'III', 'IV'];

        // Check if we should switch pattern
        const barNum = Math.floor(currentBeat / 4);
        if (barNum > 0 && barNum % BARS_PER_PATTERN === 0 && beatInBar === 0) {
          // Switch to random pattern (different from current)
          const oldIndex = currentPatternIndex;
          do {
            currentPatternIndex = Math.floor(Math.random() * drumPatterns.length);
          } while (currentPatternIndex === oldIndex && drumPatterns.length > 1);

          console.log(`🥁 Pattern: ${drumPatterns[currentPatternIndex].name} | Chord: ${chordNames[chordNum]} | BPM: ${Math.round(currentBPM)}`);
        } else {
          console.log(`🎵 Chord: ${chordNames[chordNum]} | BPM: ${Math.round(currentBPM)}`);
        }
      }
    }

    nextBeatTime += BEAT_DURATION_SEC;
    currentBeat++;

    // Update BPM every beat based on movement
    updateBPM();
  }

  // Schedule next check
  setTimeout(scheduleDrums, 25); // Check every 25ms
}

// Start drum scheduler
function startDrumScheduler() {
  if (isSchedulerRunning) return;

  isSchedulerRunning = true;
  nextBeatTime = audioContext.currentTime;
  currentBeat = 0;

  scheduleDrums();
  console.log('🥁 Drum scheduler started');
}

// Stop drum scheduler
function stopDrumScheduler() {
  isSchedulerRunning = false;
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
    console.log(`🎹 Person ${this.id} [${this.instrument.category.toUpperCase()}]: ${this.instrument.name} (${this.instrument.numOscillators} osc, vol: ${this.instrument.baseVolume.toFixed(2)})`);

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

    // Hide initially until first position update to prevent flash at origin
    this.group.visible = false;
    this.isFirstUpdate = true;

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

    const text = `ID:${this.id} • ${this.instrument.name} [${this.instrument.category.toUpperCase()}]`;
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
            // Only trigger on every 6th line (reduces note density 6x)
            if (lineIdx % 6 === 0) {
              this.crossedLines.add(lineIdx);

              // ===== QUANTIZE TO NEAREST 16TH NOTE =====
              if (!audioContext || musicalTimeStart === 0) continue;

              const currentTime = audioContext.currentTime;
              const timeSinceStart = currentTime - musicalTimeStart;
              const currentSixteenth = timeSinceStart / SIXTEENTH_NOTE_SEC;
              const nextSixteenth = Math.ceil(currentSixteenth);
              const quantizedTime = musicalTimeStart + (nextSixteenth * SIXTEENTH_NOTE_SEC);

              // Only schedule if less than 1 beat away (prevent huge delays)
              if (quantizedTime - currentTime > BEAT_DURATION_SEC) continue;

              // ===== MAP TO CHORD TONES FOR HARMONY =====
              const currentScale = scales[currentScaleIndex].notes;
              const chordTones = getCurrentChordTones();

              // Use X position to select chord tone (root, third, fifth, etc.)
              // Use Z position to select octave/register
              const xNorm = (this.xOffset + W/2) / W; // 0-1 across width
              const zNorm = lineIdx / numLines; // 0-1 along length

              // Map X position to chord degree (creates harmonies across width)
              // 3 main chord tones: root (0), third (1), fifth (2)
              const chordDegree = Math.floor(xNorm * 3); // 0, 1, or 2
              const baseChordTone = chordTones[chordDegree] || chordTones[0];

              // Map Z position to octave shift (so movement creates register changes, not linear scale)
              // Bass instruments stay in lower register
              let octaveShift;
              if (this.instrument.category === 'bass') {
                octaveShift = 0; // Bass always plays root octave
              } else if (this.instrument.category === 'percussion') {
                octaveShift = Math.floor(zNorm * 2) + 1; // Mid-high register (1-2 octaves up)
              } else if (this.instrument.category === 'pads') {
                octaveShift = Math.floor(zNorm * 2); // Low-mid register (0-1 octaves up)
              } else { // leads
                octaveShift = Math.floor(zNorm * 3); // Full range (0-2 octaves up)
              }

              const scaleIdx = (baseChordTone + octaveShift * 7) % currentScale.length;
              let frequency = currentScale[scaleIdx];

              // Further octave shift for bass (play an octave down)
              if (this.instrument.category === 'bass' && frequency > 200) {
                frequency = frequency / 2;
              }

              // Schedule the note at the quantized time
              playPluck(frequency, this.xOffset, this.z, W, L, this.instrument, this.analyser, quantizedTime);
            }
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

    // Make visible after first position update (prevents flash at origin)
    if (this.isFirstUpdate) {
      this.group.visible = true;
      this.isFirstUpdate = false;
    }

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
    const scale = scales[currentScaleIndex];
    console.log(`🎵 Key change: ${scale.name} [${scale.camelot}]`);

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
