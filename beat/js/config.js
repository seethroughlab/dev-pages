/**
 * Configuration and constants for beat detection
 */

export const HISTORY_SIZE = 40;
export const COOLDOWN_MS = 100;
export const EDGE_THRESHOLD = 10; // Pixels for edge detection when dragging

// Default frequency range settings for each drum type
export const DEFAULT_RANGES = {
    kick: { low: 20, high: 150, threshold: 1.3 },
    snare: { low: 150, high: 500, threshold: 1.2 },
    hihat: { low: 5000, high: 12000, threshold: 1.15 }
};

// Visual colors for each drum type
export const DRUM_COLORS = {
    kick: 'rgba(255, 68, 68, 0.2)',
    snare: 'rgba(68, 255, 68, 0.2)',
    hihat: 'rgba(68, 68, 255, 0.2)'
};

// FFT configuration
export const FFT_SIZE = 2048;
export const SMOOTHING_TIME_CONSTANT = 0.8;
