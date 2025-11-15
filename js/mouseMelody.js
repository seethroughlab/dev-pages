/**
 * Mouse Melody System
 * Plays individual notes based on mouse movement
 */

import { scales, BASE_FREQ } from './config.js';

export class MouseMelody {
    constructor(audioContext, reverbNode) {
        this.audioContext = audioContext;
        this.reverbNode = reverbNode;

        // Current musical parameters
        this.currentScale = scales.minor;

        // Audio nodes
        this.mainGain = null;
        this.dryGain = null;
        this.wetGain = null;

        // Mouse state
        this.mouseX = 0.5;
        this.mouseY = 0.5;
        this.isActive = false;

        // Note triggering
        this.lastNoteTime = 0;
        this.minNoteInterval = 0.08; // Minimum time between notes (seconds)
        this.lastTriggeredNote = null;

        // Active notes tracking
        this.activeNotes = [];
    }

    /**
     * Initialize the melody system
     */
    async initialize() {
        if (!this.audioContext) {
            console.error('AudioContext not provided');
            return false;
        }

        // Create main gain (volume control)
        this.mainGain = this.audioContext.createGain();
        this.mainGain.gain.value = 0.25;

        // Create dry/wet mix for reverb
        this.dryGain = this.audioContext.createGain();
        this.dryGain.gain.value = 0.3; // 30% dry

        this.wetGain = this.audioContext.createGain();
        this.wetGain.gain.value = 0.7; // 70% wet (reverb)

        // Connect the chain
        this.mainGain.connect(this.dryGain);
        this.mainGain.connect(this.wetGain);
        this.dryGain.connect(this.audioContext.destination);

        if (this.reverbNode) {
            this.wetGain.connect(this.reverbNode);
        } else {
            this.wetGain.connect(this.audioContext.destination);
        }

        console.log('Mouse melody system initialized');
        return true;
    }

    /**
     * Map mouse position to musical note
     */
    mouseToNote(normalizedX, normalizedY) {
        // X position determines which note in the scale (0-1 maps to scale degrees)
        const scaleIndex = Math.floor(normalizedX * this.currentScale.length);
        const clampedIndex = Math.max(0, Math.min(this.currentScale.length - 1, scaleIndex));
        const semitone = this.currentScale[clampedIndex];

        // Y position determines octave (-1 to 2, spanning 3 octaves)
        // Top of screen = higher octaves
        const octave = Math.floor((1 - normalizedY) * 3) - 1; // Inverted Y (top = high)

        // Calculate frequency: f = BASE_FREQ * 2^(octave) * 2^(semitone/12)
        const frequency = BASE_FREQ * Math.pow(2, octave) * Math.pow(2, semitone / 12);

        return {
            frequency,
            octave,
            semitone,
            scaleIndex: clampedIndex
        };
    }

    /**
     * Trigger note when mouse moves
     */
    onMouseMove(x, y, canvasWidth, canvasHeight) {
        if (!this.audioContext || !this.isActive) return;

        // Normalize coordinates (0-1)
        this.mouseX = Math.max(0, Math.min(1, x / canvasWidth));
        this.mouseY = Math.max(0, Math.min(1, y / canvasHeight));

        // Get musical note from position
        const note = this.mouseToNote(this.mouseX, this.mouseY);

        const now = this.audioContext.currentTime;

        // Only trigger if enough time has passed and note has changed
        const noteChanged = !this.lastTriggeredNote ||
                           Math.abs(note.frequency - this.lastTriggeredNote.frequency) > 1;

        if (now - this.lastNoteTime >= this.minNoteInterval && noteChanged) {
            this.playNote(note.frequency, this.mouseY);
            this.lastNoteTime = now;
            this.lastTriggeredNote = note;
        }
    }

    /**
     * Play an individual note
     */
    playNote(frequency, normalizedY) {
        if (!this.audioContext) return;

        const now = this.audioContext.currentTime;
        const duration = 0.8; // Note duration

        // Create 3 detuned oscillators for richness
        const detuneValues = [0, -8, 8];
        const waveforms = ['triangle', 'sine', 'triangle'];

        for (let i = 0; i < 3; i++) {
            const osc = this.audioContext.createOscillator();
            osc.type = waveforms[i];
            osc.frequency.value = frequency;
            osc.detune.value = detuneValues[i];

            // Create envelope
            const envelope = this.audioContext.createGain();
            envelope.gain.value = 0;

            // ADSR envelope
            const attack = 0.02;
            const decay = 0.1;
            const sustain = 0.3;
            const release = 0.5;

            envelope.gain.setValueAtTime(0, now);
            envelope.gain.linearRampToValueAtTime(0.33, now + attack); // Attack
            envelope.gain.linearRampToValueAtTime(sustain * 0.33, now + attack + decay); // Decay to sustain
            envelope.gain.setValueAtTime(sustain * 0.33, now + duration - release); // Hold sustain
            envelope.gain.linearRampToValueAtTime(0, now + duration); // Release

            // Create filter (brightness based on Y position)
            const filter = this.audioContext.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 400 + (1 - normalizedY) * 3600; // 400Hz to 4000Hz
            filter.Q.value = 1 + normalizedY * 2;

            // Connect chain
            osc.connect(envelope);
            envelope.connect(filter);
            filter.connect(this.mainGain);

            // Play
            osc.start(now);
            osc.stop(now + duration);

            // Track active note
            this.activeNotes.push({ osc, envelope, filter });
        }

        // Clean up old notes
        this.cleanupNotes();
    }

    /**
     * Clean up finished notes
     */
    cleanupNotes() {
        const now = this.audioContext.currentTime;
        this.activeNotes = this.activeNotes.filter(note => {
            if (note.osc.context.currentTime > now + 1) {
                note.osc.disconnect();
                note.envelope.disconnect();
                note.filter.disconnect();
                return false;
            }
            return true;
        });
    }

    /**
     * Start playing the melody
     */
    start() {
        if (!this.audioContext || this.isActive) return;
        this.isActive = true;
        console.log('Mouse melody started');
    }

    /**
     * Stop playing the melody
     */
    stop() {
        if (!this.audioContext || !this.isActive) return;
        this.isActive = false;
        console.log('Mouse melody stopped');
    }

    /**
     * Change musical scale
     */
    setScale(scaleName) {
        if (scales[scaleName]) {
            this.currentScale = scales[scaleName];
            console.log(`Scale changed to: ${scaleName}`);
        }
    }

    /**
     * Set volume (0-1)
     */
    setVolume(volume) {
        if (!this.mainGain) return;
        const targetVolume = Math.max(0, Math.min(1, volume));
        this.mainGain.gain.value = targetVolume;
    }

    /**
     * Set minimum note interval (how fast notes can trigger)
     */
    setNoteInterval(seconds) {
        this.minNoteInterval = Math.max(0.01, Math.min(1, seconds));
    }

    /**
     * Set reverb mix (0 = dry, 1 = wet)
     */
    setReverbMix(mix) {
        if (!this.dryGain || !this.wetGain) return;

        const wetAmount = Math.max(0, Math.min(1, mix));
        const dryAmount = 1 - wetAmount;

        this.dryGain.gain.value = dryAmount;
        this.wetGain.gain.value = wetAmount;
    }

    /**
     * Cleanup
     */
    destroy() {
        this.stop();

        // Stop all active notes
        this.activeNotes.forEach(note => {
            if (note.osc) note.osc.disconnect();
            if (note.envelope) note.envelope.disconnect();
            if (note.filter) note.filter.disconnect();
        });
        this.activeNotes = [];

        if (this.mainGain) {
            this.mainGain.disconnect();
        }

        if (this.dryGain) {
            this.dryGain.disconnect();
        }

        if (this.wetGain) {
            this.wetGain.disconnect();
        }
    }
}
