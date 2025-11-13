/**
 * Noise Generator module - Handles white, pink, and brown noise generation
 */

import { getAudioContext, getMasterGain } from './audioContext.js';

let whiteNoiseNode = null;
let pinkNoiseNode = null;
let brownNoiseNode = null;
let whiteGain = null;
let pinkGain = null;
let brownGain = null;

/**
 * Create white noise generator using AudioWorklet
 */
async function createWhiteNoise() {
    const audioContext = getAudioContext();
    try {
        const whiteNoise = new AudioWorkletNode(audioContext, 'white-noise-processor');
        return whiteNoise;
    } catch (error) {
        console.error('Failed to create white noise worklet:', error);
        return null;
    }
}

/**
 * Create pink noise generator using AudioWorklet
 */
async function createPinkNoise() {
    const audioContext = getAudioContext();
    try {
        const pinkNoise = new AudioWorkletNode(audioContext, 'pink-noise-processor');
        return pinkNoise;
    } catch (error) {
        console.error('Failed to create pink noise worklet:', error);
        return null;
    }
}

/**
 * Create brown noise generator using AudioWorklet
 */
async function createBrownNoise() {
    const audioContext = getAudioContext();
    try {
        const brownNoise = new AudioWorkletNode(audioContext, 'brown-noise-processor');
        return brownNoise;
    } catch (error) {
        console.error('Failed to create brown noise worklet:', error);
        return null;
    }
}

/**
 * Initialize all noise generators with specified volumes
 */
export async function initNoiseGenerators(whiteValue = 0.06, pinkValue = 0.1, brownValue = 0.04) {
    const audioContext = getAudioContext();
    const masterGain = getMasterGain();
    
    // White noise
    whiteNoiseNode = await createWhiteNoise();
    if (whiteNoiseNode) {
        whiteGain = audioContext.createGain();
        whiteGain.gain.value = whiteValue;
        whiteNoiseNode.connect(whiteGain);
        whiteGain.connect(masterGain);
    }
    
    // Pink noise
    pinkNoiseNode = await createPinkNoise();
    if (pinkNoiseNode) {
        pinkGain = audioContext.createGain();
        pinkGain.gain.value = pinkValue;
        pinkNoiseNode.connect(pinkGain);
        pinkGain.connect(masterGain);
    }
    
    // Brown noise
    brownNoiseNode = await createBrownNoise();
    if (brownNoiseNode) {
        brownGain = audioContext.createGain();
        brownGain.gain.value = brownValue;
        brownNoiseNode.connect(brownGain);
        brownGain.connect(masterGain);
    }
}

/**
 * Update noise levels
 */
export function updateNoiseLevels(whiteValue, pinkValue, brownValue) {
    if (whiteGain) whiteGain.gain.value = whiteValue;
    if (pinkGain) pinkGain.gain.value = pinkValue;
    if (brownGain) brownGain.gain.value = brownValue;
}

/**
 * Start wave effect
 */
let waveAnimationFrame = null;
let wavePhase = 0;
let lastWaveUpdate = 0;

export function startWaveEffect(waveSpeed = 0.1) {
    const animate = (currentTime) => {
        if (!lastWaveUpdate) lastWaveUpdate = currentTime;
        
        const deltaTime = (currentTime - lastWaveUpdate) / 1000;
        lastWaveUpdate = currentTime;
        
        wavePhase += deltaTime / waveSpeed;
        
        // Calculate wave values
        const waveValue = (Math.sin(wavePhase) + 1) / 2;
        const antiWaveValue = (Math.sin(wavePhase + Math.PI) + 1) / 2;
        
        // Update gains with wave effect
        if (whiteGain) whiteGain.gain.value = waveValue * 0.08;
        if (pinkGain) pinkGain.gain.value = antiWaveValue * 0.12;
        if (brownGain) brownGain.gain.value = waveValue * 0.06;
        
        waveAnimationFrame = requestAnimationFrame(animate);
    };
    
    waveAnimationFrame = requestAnimationFrame(animate);
}

/**
 * Stop wave effect
 */
export function stopWaveEffect() {
    if (waveAnimationFrame) {
        cancelAnimationFrame(waveAnimationFrame);
        waveAnimationFrame = null;
        lastWaveUpdate = 0;
        wavePhase = 0;
    }
}

/**
 * Clean up noise generators
 */
export function cleanupNoiseGenerators() {
    if (whiteNoiseNode) {
        whiteNoiseNode.disconnect();
        whiteNoiseNode = null;
    }
    if (pinkNoiseNode) {
        pinkNoiseNode.disconnect();
        pinkNoiseNode = null;
    }
    if (brownNoiseNode) {
        brownNoiseNode.disconnect();
        brownNoiseNode = null;
    }
    whiteGain = null;
    pinkGain = null;
    brownGain = null;
    stopWaveEffect();
}