/**
 * Beat detection module
 * Analyzes audio frequency data and detects beats for kick, snare, and hi-hat
 */

import { HISTORY_SIZE, COOLDOWN_MS, FFT_SIZE, SMOOTHING_TIME_CONSTANT, DEFAULT_RANGES } from './config.js';

export class BeatDetector {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.bufferLength = 0;
        this.source = null;
        this.stream = null;

        // Range settings
        this.rangeSettings = JSON.parse(JSON.stringify(DEFAULT_RANGES)); // Deep copy

        // Beat detection state
        this.beatState = {
            kick: { history: [], lastBeat: 0 },
            snare: { history: [], lastBeat: 0 },
            hihat: { history: [], lastBeat: 0 }
        };

        // Beat callbacks
        this.beatCallbacks = {
            kick: [],
            snare: [],
            hihat: []
        };
    }

    /**
     * Initialize audio context and analyser
     */
    async initialize(deviceId) {
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Get user media with selected device
            const constraints = {
                audio: {
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);

            // Create analyser
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = FFT_SIZE;
            this.analyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;

            this.bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(this.bufferLength);

            // Connect source to analyser
            this.source = this.audioContext.createMediaStreamSource(this.stream);
            this.source.connect(this.analyser);

            console.log('Beat detector initialized');
            console.log(`Sample rate: ${this.audioContext.sampleRate}Hz`);
            console.log(`Buffer length: ${this.bufferLength}`);

            return true;
        } catch (error) {
            console.error('Error initializing beat detector:', error);
            throw error;
        }
    }

    /**
     * Get frequency bin index from Hz
     */
    freqToIndex(freq) {
        const nyquist = this.audioContext.sampleRate / 2;
        return Math.round(freq / nyquist * this.bufferLength);
    }

    /**
     * Calculate energy in frequency range
     */
    getEnergyInRange(lowFreq, highFreq) {
        const lowIndex = this.freqToIndex(lowFreq);
        const highIndex = this.freqToIndex(highFreq);

        let sum = 0;
        for (let i = lowIndex; i <= highIndex && i < this.dataArray.length; i++) {
            sum += this.dataArray[i];
        }

        return sum / (highIndex - lowIndex + 1);
    }

    /**
     * Detect beat using energy history
     */
    detectBeat(type, energy, threshold) {
        const state = this.beatState[type];
        const now = Date.now();

        // Add to history
        state.history.push(energy);
        if (state.history.length > HISTORY_SIZE) {
            state.history.shift();
        }

        // Need enough history
        if (state.history.length < HISTORY_SIZE) {
            return false;
        }

        // Cooldown period
        if (now - state.lastBeat < COOLDOWN_MS) {
            return false;
        }

        // Calculate average energy
        const avg = state.history.reduce((a, b) => a + b, 0) / state.history.length;

        // Detect if current energy is significantly higher than average
        if (energy > avg * threshold) {
            state.lastBeat = now;
            return true;
        }

        return false;
    }

    /**
     * Analyze audio and detect beats
     */
    analyze() {
        if (!this.analyser) return;

        this.analyser.getByteFrequencyData(this.dataArray);

        const settings = this.rangeSettings;
        const detections = {
            kick: false,
            snare: false,
            hihat: false
        };

        // Check each drum type
        ['kick', 'snare', 'hihat'].forEach(type => {
            const range = settings[type];
            const energy = this.getEnergyInRange(range.low, range.high);
            const detected = this.detectBeat(type, energy, range.threshold);

            if (detected) {
                detections[type] = true;
                this.triggerBeat(type);
            }
        });

        return detections;
    }

    /**
     * Register a callback for beat detection
     */
    onBeat(type, callback) {
        if (this.beatCallbacks[type]) {
            this.beatCallbacks[type].push(callback);
        }
    }

    /**
     * Trigger beat callbacks
     */
    triggerBeat(type) {
        if (this.beatCallbacks[type]) {
            this.beatCallbacks[type].forEach(callback => callback(type));
        }
    }

    /**
     * Update frequency range for a drum type
     */
    updateRange(type, low, high) {
        if (this.rangeSettings[type]) {
            this.rangeSettings[type].low = low;
            this.rangeSettings[type].high = high;
        }
    }

    /**
     * Update threshold for a drum type
     */
    updateThreshold(type, threshold) {
        if (this.rangeSettings[type]) {
            this.rangeSettings[type].threshold = threshold;
        }
    }

    /**
     * Get current range settings
     */
    getRangeSettings() {
        return this.rangeSettings;
    }

    /**
     * Get analyser data array
     */
    getDataArray() {
        return this.dataArray;
    }

    /**
     * Get buffer length
     */
    getBufferLength() {
        return this.bufferLength;
    }

    /**
     * Get sample rate
     */
    getSampleRate() {
        return this.audioContext?.sampleRate || 0;
    }

    /**
     * Stop detection and cleanup
     */
    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }

        if (this.source) {
            this.source.disconnect();
        }

        if (this.audioContext) {
            this.audioContext.close();
        }

        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.source = null;
        this.stream = null;

        console.log('Beat detector stopped');
    }
}
