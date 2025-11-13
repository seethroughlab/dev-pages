/**
 * Kick Drum module - Handles heartbeat bass drum rhythm
 */

import { getAudioContext, getMasterGain } from './audioContext.js';
import { getState } from './state.js';

let toneBassDrum = null;
let bassDrumGain = null;
let bassDrumSchedulerId = null;
let beatCount = 0;

/**
 * Initialize the bass drum synth
 */
export async function initKickDrum() {
    console.log('[KickDrum] Initializing kick drum...');
    
    if (typeof Tone === 'undefined') {
        console.error('[KickDrum] Tone.js not loaded');
        return false;
    }
    
    try {
        const state = getState();
        
        // Create Bass Drum synth for heartbeat rhythm
        toneBassDrum = new Tone.MembraneSynth({
            pitchDecay: 0.008,
            octaves: 4,
            oscillator: {
                type: "sine"
            },
            envelope: {
                attack: state.kickAttackValue,
                decay: 0.1,
                sustain: 0,
                release: 0.05,
                attackCurve: "exponential"
            }
        });
        
        // Create a dedicated gain for the bass drum with boost
        bassDrumGain = new Tone.Gain(state.heartbeatVolumeValue * 2.0);
        toneBassDrum.connect(bassDrumGain);
        
        // Connect to Tone.js master output
        bassDrumGain.toDestination();
        
        // Tune the bass drum to be low and punchy
        toneBassDrum.set({
            frequency: 60
        });
        
        console.log('[KickDrum] Kick drum initialized successfully');
        return true;
    } catch (error) {
        console.error('[KickDrum] Error initializing kick drum:', error);
        return false;
    }
}

/**
 * Start the heartbeat bass drum rhythm
 */
export function startHeartbeatRhythm() {
    const state = getState();
    
    if (!toneBassDrum) {
        console.error('[KickDrum] Bass drum not initialized');
        return;
    }
    
    if (bassDrumSchedulerId) {
        console.log('[KickDrum] Heartbeat already running');
        return;
    }
    
    console.log('[KickDrum] Starting heartbeat rhythm at', state.bpm, 'BPM');
    beatCount = 0;
    
    const scheduleHeartbeat = () => {
        if (!state.isPlaying) {
            console.log('[KickDrum] Stopping heartbeat - isPlaying is false');
            stopHeartbeatRhythm();
            return;
        }
        
        const now = Tone.now();
        const isStrongBeat = beatCount % 2 === 0;
        
        // Play the bass drum with different velocities for lub-dub effect
        const note = isStrongBeat ? "C1" : "A0";
        const velocity = isStrongBeat ? 0.9 : 0.6;
        
        console.log(`[KickDrum] Beat ${beatCount}: ${isStrongBeat ? 'STRONG' : 'weak'} - Note: ${note}, Velocity: ${velocity}`);
        
        // Trigger the bass drum
        toneBassDrum.triggerAttackRelease(note, "16n", now, velocity);
        
        // TODO: Apply ducking if enabled
        // if (state.duckingEnabled) {
        //     applyDucking();
        // }
        
        beatCount++;
        
        // Schedule next beat
        const beatDuration = 60 / state.bpm;
        bassDrumSchedulerId = setTimeout(scheduleHeartbeat, beatDuration * 1000);
    };
    
    // Start the heartbeat
    scheduleHeartbeat();
}

/**
 * Stop the heartbeat rhythm
 */
export function stopHeartbeatRhythm() {
    console.log('[KickDrum] Stopping heartbeat rhythm');
    
    if (bassDrumSchedulerId) {
        clearTimeout(bassDrumSchedulerId);
        bassDrumSchedulerId = null;
        beatCount = 0;
    }
}

/**
 * Update kick drum volume
 */
export function updateKickVolume(volume) {
    console.log('[KickDrum] Updating volume to:', volume);
    
    if (bassDrumGain) {
        bassDrumGain.gain.value = volume * 2.0; // Apply 2x boost
    }
}

/**
 * Update kick drum BPM
 */
export function updateKickBPM(newBPM) {
    const state = getState();
    const wasPlaying = bassDrumSchedulerId !== null;
    
    console.log('[KickDrum] Updating BPM from', state.bpm, 'to', newBPM);
    
    // Update state
    state.bpm = newBPM;
    state.beatDuration = 60 / newBPM;
    
    // If heartbeat is playing, restart it with new tempo
    if (wasPlaying) {
        stopHeartbeatRhythm();
        startHeartbeatRhythm();
    }
}

/**
 * Update kick attack time
 */
export function updateKickAttack(attackTime) {
    console.log('[KickDrum] Updating attack time to:', attackTime);
    
    if (toneBassDrum) {
        toneBassDrum.envelope.attack = attackTime;
    }
}

/**
 * Check if kick drum is initialized
 */
export function isKickDrumInitialized() {
    return toneBassDrum !== null;
}