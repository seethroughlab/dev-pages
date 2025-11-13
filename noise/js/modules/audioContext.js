/**
 * Audio Context module - Manages the Web Audio API context and master gain
 */

let audioContext = null;
let masterGain = null;

/**
 * Initialize the audio context and master gain
 */
export async function initAudioContext() {
    if (audioContext) {
        return { audioContext, masterGain };
    }
    
    // Create audio context
    audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 48000
    });
    
    // Create master gain
    masterGain = audioContext.createGain();
    masterGain.connect(audioContext.destination);
    
    return { audioContext, masterGain };
}

/**
 * Get the current audio context
 */
export function getAudioContext() {
    return audioContext;
}

/**
 * Get the master gain node
 */
export function getMasterGain() {
    return masterGain;
}

/**
 * Close and clean up the audio context
 */
export async function closeAudioContext() {
    if (audioContext) {
        await audioContext.close();
        audioContext = null;
        masterGain = null;
    }
}

/**
 * Resume audio context if suspended
 */
export async function resumeAudioContext() {
    if (audioContext && audioContext.state === 'suspended') {
        await audioContext.resume();
    }
}