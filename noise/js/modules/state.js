/**
 * State management module - Handles global application state
 */

import { defaultValues } from './config.js';

// Create a state object with all values
const state = {
    isPlaying: false,
    
    // Noise levels
    whiteNoiseValue: 0.3,
    pinkNoiseValue: 0.5,
    brownNoiseValue: 0.2,
    
    // Effect parameters
    clipVolumeValue: defaultValues.clipVolume,
    reverbMixValue: defaultValues.reverbMix,
    delayTimeValue: defaultValues.delayTime,
    delayFeedbackValue: defaultValues.delayFeedback,
    delayMixValue: defaultValues.delayMix,
    
    // Wave effect
    waveEffectEnabled: false,
    waveSpeed: defaultValues.waveSpeed,
    
    // Melody parameters
    melodyVolumeValue: defaultValues.melodyVolume,
    bassVolumeValue: defaultValues.bassVolume,
    melodyAttackValue: defaultValues.melodyAttack,
    melodyDecayValue: defaultValues.melodyDecay,
    melodySustainValue: defaultValues.melodySustain,
    melodyReleaseValue: defaultValues.melodyRelease,
    
    // Melody effects
    melodyReverbMixValue: defaultValues.melodyReverbMix,
    melodyDelayTimeValue: defaultValues.melodyDelayTime,
    melodyDelayFeedbackValue: defaultValues.melodyDelayFeedback,
    melodyDelayMixValue: defaultValues.melodyDelayMix,
    
    // Timing parameters
    melodyMinDelay: defaultValues.melodyMinDelay,
    melodyMaxDelay: defaultValues.melodyMaxDelay,
    clipMinDelay: defaultValues.clipMinDelay,
    clipMaxDelay: defaultValues.clipMaxDelay,
    
    // Filter parameters (Cinematic Keys)
    filterCutoffValue: defaultValues.filterCutoff,
    filterResonanceValue: defaultValues.filterResonance,
    filterEnvAmountValue: defaultValues.filterEnvAmount,
    filterDecayValue: defaultValues.filterDecay,
    
    // Warm Pad parameters
    warmPadAttackValue: defaultValues.warmPadAttack,
    warmPadDecayValue: defaultValues.warmPadDecay,
    warmPadSustainValue: defaultValues.warmPadSustain,
    warmPadReleaseValue: defaultValues.warmPadRelease,
    warmPadCutoffValue: defaultValues.warmPadCutoff,
    warmPadResonanceValue: defaultValues.warmPadResonance,
    warmPadEnvAmountValue: defaultValues.warmPadEnvAmount,
    warmPadFilterDecayValue: defaultValues.warmPadFilterDecay,
    
    // Ethereal Strings parameters
    etherealStringsAttackValue: defaultValues.etherealStringsAttack,
    etherealStringsDecayValue: defaultValues.etherealStringsDecay,
    etherealStringsSustainValue: defaultValues.etherealStringsSustain,
    etherealStringsReleaseValue: defaultValues.etherealStringsRelease,
    etherealStringsCutoffValue: defaultValues.etherealStringsCutoff,
    etherealStringsResonanceValue: defaultValues.etherealStringsResonance,
    etherealStringsEnvAmountValue: defaultValues.etherealStringsEnvAmount,
    etherealStringsFilterDecayValue: defaultValues.etherealStringsFilterDecay,
    
    // Deep Bass Drone parameters
    deepBassAttackValue: defaultValues.deepBassAttack,
    deepBassDecayValue: defaultValues.deepBassDecay,
    deepBassSustainValue: defaultValues.deepBassSustain,
    deepBassReleaseValue: defaultValues.deepBassRelease,
    deepBassCutoffValue: defaultValues.deepBassCutoff,
    deepBassResonanceValue: defaultValues.deepBassResonance,
    deepBassEnvAmountValue: defaultValues.deepBassEnvAmount,
    deepBassFilterDecayValue: defaultValues.deepBassFilterDecay,
    
    // Master Effects parameters
    masterCompThresholdValue: defaultValues.masterCompThreshold,
    masterCompRatioValue: defaultValues.masterCompRatio,
    masterCompAttackValue: defaultValues.masterCompAttack,
    masterCompReleaseValue: defaultValues.masterCompRelease,
    masterLimiterThresholdValue: defaultValues.masterLimiterThreshold,
    masterLimiterReleaseValue: defaultValues.masterLimiterRelease,
    masterEQLowValue: defaultValues.masterEQLow,
    masterEQMidFreqValue: defaultValues.masterEQMidFreq,
    masterEQMidGainValue: defaultValues.masterEQMidGain,
    masterEQHighValue: defaultValues.masterEQHigh,
    masterStereoWidthValue: defaultValues.masterStereoWidth,
    masterReverbMixValue: defaultValues.masterReverbMix,
    masterReverbRoomValue: defaultValues.masterReverbRoom,
    masterReverbDampingValue: defaultValues.masterReverbDamping,
    
    // Heartbeat/Kick drum
    bpm: defaultValues.bpm,
    beatDuration: 60 / defaultValues.bpm,
    heartbeatVolumeValue: defaultValues.heartbeatVolume,
    kickAttackValue: defaultValues.kickAttack,
    
    // Ducking
    duckingAmount: defaultValues.duckingAmount,
    duckingAttack: defaultValues.duckingAttack,
    duckingRelease: defaultValues.duckingRelease,
    duckingEnabled: defaultValues.duckingEnabled,
    
    // Musical settings
    enabledScales: ['minor'],
    enabledComposers: ['mozart', 'debussy', 'sweelinck', 'aphextwin', 'cage', 'reich', 'glass', 'richter', 'part'],
    selectedInstrument: 'cinematic',
    
    // Stream settings
    enabledStreams: [0, 1, 2, 3, 4, 5, 6] // All streams enabled by default
};

// Create a proxy to track state changes
const stateProxy = new Proxy(state, {
    set(target, property, value) {
        const oldValue = target[property];
        target[property] = value;
        
        // Dispatch custom event for state changes
        window.dispatchEvent(new CustomEvent('stateChange', {
            detail: { property, oldValue, newValue: value }
        }));
        
        return true;
    }
});

/**
 * Get the current state
 */
export function getState() {
    return stateProxy;
}

/**
 * Update multiple state values at once
 */
export function updateState(updates) {
    Object.entries(updates).forEach(([key, value]) => {
        if (key in state) {
            stateProxy[key] = value;
        }
    });
}

/**
 * Save state to localStorage
 */
export function saveState() {
    const stateToSave = { ...state };
    // Remove non-serializable properties if any
    localStorage.setItem('ambientNoiseState', JSON.stringify(stateToSave));
    console.log('[State] Saved state to localStorage:', Object.keys(stateToSave).length, 'properties');
}

/**
 * Load state from localStorage
 */
export function loadState() {
    const savedState = localStorage.getItem('ambientNoiseState');
    if (savedState) {
        try {
            const parsed = JSON.parse(savedState);
            console.log('[State] Loading state from localStorage:', Object.keys(parsed).length, 'properties');
            updateState(parsed);
            console.log('[State] State loaded successfully');
        } catch (error) {
            console.error('[State] Error loading saved state:', error);
        }
    } else {
        console.log('[State] No saved state found in localStorage');
    }
}

/**
 * Reset state to defaults
 */
export function resetState() {
    Object.entries(defaultValues).forEach(([key, value]) => {
        const stateKey = key + 'Value';
        if (stateKey in state) {
            stateProxy[stateKey] = value;
        } else if (key in state) {
            stateProxy[key] = value;
        }
    });
    
    // Reset arrays to defaults
    stateProxy.enabledScales = ['minor'];
    stateProxy.enabledComposers = ['mozart', 'debussy', 'sweelinck', 'aphextwin', 'cage', 'reich', 'glass', 'richter', 'part'];
    stateProxy.selectedInstrument = 'cinematic';
    stateProxy.waveEffectEnabled = false;
}