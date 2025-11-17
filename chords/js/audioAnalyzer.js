/**
 * Audio analysis module
 * Handles microphone input, frequency analysis, and note detection
 */

import { FFT_SIZE, SMOOTHING_TIME_CONSTANT, FREQUENCY_THRESHOLD } from './config.js';

export class AudioAnalyzer {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.stream = null;
        this.dataArray = null;
        this.bufferLength = 0;
        this.isRunning = false;
    }

    /**
     * Initialize audio context and start listening
     */
    async initialize() {
        try {
            // Request microphone access
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            // Create audio context and analyser
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = FFT_SIZE;
            this.analyser.smoothingTimeConstant = SMOOTHING_TIME_CONSTANT;

            this.bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(this.bufferLength);

            // Connect microphone to analyser
            this.microphone = this.audioContext.createMediaStreamSource(this.stream);
            this.microphone.connect(this.analyser);

            this.isRunning = true;

            console.log('Audio analyzer initialized');
            console.log(`Sample rate: ${this.audioContext.sampleRate}Hz`);
            console.log(`Buffer length: ${this.bufferLength}`);

            return true;
        } catch (error) {
            console.error('Error initializing audio analyzer:', error);
            throw error;
        }
    }

    /**
     * Get current frequency data
     */
    getFrequencyData() {
        if (!this.analyser) return null;
        this.analyser.getByteFrequencyData(this.dataArray);
        return this.dataArray;
    }

    /**
     * Convert frequency to musical note
     */
    frequencyToNote(frequency) {
        const A4 = 440;
        const C0 = A4 * Math.pow(2, -4.75);
        const halfSteps = Math.round(12 * Math.log2(frequency / C0));
        const octave = Math.floor(halfSteps / 12);
        const noteIndex = halfSteps % 12;
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        return {
            note: notes[noteIndex],
            octave: octave,
            noteIndex: noteIndex
        };
    }

    /**
     * Detect peaks in frequency data and convert to notes
     */
    detectNotes() {
        if (!this.analyser || !this.isRunning) return [];

        const dataArray = this.getFrequencyData();
        const sampleRate = this.audioContext.sampleRate;
        const peaks = [];

        // Find peaks in frequency data
        for (let i = 2; i < this.bufferLength - 2; i++) {
            if (dataArray[i] > FREQUENCY_THRESHOLD &&
                dataArray[i] > dataArray[i - 1] &&
                dataArray[i] > dataArray[i + 1] &&
                dataArray[i] > dataArray[i - 2] &&
                dataArray[i] > dataArray[i + 2]) {

                const frequency = i * sampleRate / (this.analyser.fftSize * 2);

                // Piano range roughly 80Hz to 2000Hz
                if (frequency >= 80 && frequency <= 2000) {
                    peaks.push({ frequency, amplitude: dataArray[i] });
                }
            }
        }

        // Sort by amplitude and take top peaks
        peaks.sort((a, b) => b.amplitude - a.amplitude);
        const topPeaks = peaks.slice(0, 6);

        // Convert frequencies to notes and remove duplicates
        const notes = topPeaks
            .map(peak => this.frequencyToNote(peak.frequency))
            .filter((note, index, self) =>
                index === self.findIndex(n => n.note === note.note)
            );

        return notes;
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
     * Check if analyzer is running
     */
    getIsRunning() {
        return this.isRunning;
    }

    /**
     * Stop analyzer and cleanup
     */
    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }

        if (this.microphone) {
            this.microphone.disconnect();
        }

        if (this.audioContext) {
            this.audioContext.close();
        }

        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.stream = null;
        this.dataArray = null;
        this.isRunning = false;

        console.log('Audio analyzer stopped');
    }
}
