/**
 * Configuration module - Contains all constants and initial settings
 */

// Radio streams configuration
export const streams = [
    "http://ec2.yesstreaming.net:3540/stream",
    "http://c34.radioboss.fm:8204/autodj",
    "http://stream.radioinfoweb.net:8000/news",
    "http://c34.radioboss.fm:8204/autodj",
    "http://c3.radioboss.fm:8071/autodj",
    "http://radio.streemlion.com:3990/stream",
    "http://amp2.cesnet.cz:8000/cro-plus-256.ogg"
];

// Musical scales and composers
export const scales = {
    pentatonic: [0, 2, 4, 7, 9],
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10]
};

export const composers = {
    mozart: { name: 'Mozart', noteLength: [0.125, 0.25, 0.5], restChance: 0.1, octaveRange: [0, 1] },
    debussy: { name: 'Debussy', noteLength: [0.5, 1, 2], restChance: 0.3, octaveRange: [-1, 1] },
    sweelinck: { name: 'Sweelinck', noteLength: [0.25, 0.5, 1], restChance: 0.2, octaveRange: [0, 1] },
    aphextwin: { name: 'Aphex Twin', noteLength: [0.0625, 0.125, 0.25], restChance: 0.05, octaveRange: [-2, 2] },
    cage: { name: 'John Cage', noteLength: [1, 2, 4], restChance: 0.7, octaveRange: [-1, 2] },
    reich: { name: 'Steve Reich', noteLength: [0.125, 0.125, 0.25], restChance: 0.1, octaveRange: [0, 1] },
    glass: { name: 'Philip Glass', noteLength: [0.25, 0.25, 0.5], restChance: 0.15, octaveRange: [0, 1] },
    richter: { name: 'Max Richter', noteLength: [0.5, 1, 2], restChance: 0.25, octaveRange: [-1, 1] },
    part: { name: 'Arvo Pärt', noteLength: [1, 2, 3], restChance: 0.4, octaveRange: [-1, 0] }
};

export const BASE_FREQ = 261.63;

// Default effect values
export const defaultValues = {
    // Clip effects
    clipVolume: 0.4,
    reverbMix: 0.7,
    delayTime: 0.15,
    delayFeedback: 0.45,
    delayMix: 0.5,
    
    // Wave effect
    waveSpeed: 0.1,
    
    // Melody
    melodyVolume: 0.3,
    bassVolume: 0.4,
    melodyAttack: 0.1,
    melodyDecay: 0.2,
    melodySustain: 0.3,
    melodyRelease: 1.5,
    
    // Melody effects
    melodyReverbMix: 0.5,
    melodyDelayTime: 0.3,
    melodyDelayFeedback: 0.3,
    melodyDelayMix: 0.4,
    
    // Timing
    melodyMinDelay: 20,
    melodyMaxDelay: 60,
    clipMinDelay: 10,
    clipMaxDelay: 60,
    
    // Filter (Cinematic Keys)
    filterCutoff: 2000,
    filterResonance: 8,
    filterEnvAmount: 0.9,
    filterDecay: 0.5,
    
    // Warm Pad
    warmPadAttack: 0.15,
    warmPadDecay: 0.3,
    warmPadSustain: 0.4,
    warmPadRelease: 2.0,
    warmPadCutoff: 800,
    warmPadResonance: 2,
    warmPadEnvAmount: 0.7,
    warmPadFilterDecay: 0.6,
    
    // Ethereal Strings
    etherealStringsAttack: 0.5,
    etherealStringsDecay: 0.4,
    etherealStringsSustain: 0.7,
    etherealStringsRelease: 3.0,
    etherealStringsCutoff: 1200,
    etherealStringsResonance: 1,
    etherealStringsEnvAmount: 0.5,
    etherealStringsFilterDecay: 1.0,
    
    // Deep Bass Drone
    deepBassAttack: 0.8,
    deepBassDecay: 0.5,
    deepBassSustain: 0.8,
    deepBassRelease: 4.0,
    deepBassCutoff: 400,
    deepBassResonance: 3,
    deepBassEnvAmount: 0.4,
    deepBassFilterDecay: 1.5,
    
    // Master Effects
    masterCompThreshold: -24,
    masterCompRatio: 4,
    masterCompAttack: 0.003,
    masterCompRelease: 0.25,
    masterLimiterThreshold: -3,
    masterLimiterRelease: 0.1,
    masterEQLow: 0,
    masterEQMidFreq: 1000,
    masterEQMidGain: 0,
    masterEQHigh: 0,
    masterStereoWidth: 1.0,
    masterReverbMix: 0,
    masterReverbRoom: 0.5,
    masterReverbDamping: 0.5,
    
    // Heartbeat
    bpm: 60,
    heartbeatVolume: 0.5,
    kickAttack: 0.001,
    
    // Ducking
    duckingAmount: 0.5,
    duckingAttack: 0.005,
    duckingRelease: 0.15,
    duckingEnabled: true
};