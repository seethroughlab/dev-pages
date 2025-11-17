/**
 * Audio System
 * Web Audio API with reverb for animation-synced sound effects
 */

export class AudioSystem {
    constructor() {
        this.audioContext = null;
        this.masterGain = null;
        this.reverbNode = null;
        this.reverbGain = null;
        this.dryGain = null;
        this.isInitialized = false;

        // Sound generation parameters
        this.soundTypes = [
            { freq: 220, duration: 0.3, type: 'sine' },
            { freq: 330, duration: 0.4, type: 'sine' },
            { freq: 440, duration: 0.5, type: 'triangle' },
            { freq: 550, duration: 0.3, type: 'sine' },
            { freq: 660, duration: 0.6, type: 'triangle' },
        ];

        this.lastSoundTime = 0;
        this.minSoundInterval = 0.5; // Minimum time between sounds
    }

    /**
     * Initialize Web Audio context
     * Must be called after user interaction
     */
    async initialize() {
        if (this.isInitialized) return;

        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Create master gain
            this.masterGain = this.audioContext.createGain();
            this.masterGain.gain.value = 0.3;
            this.masterGain.connect(this.audioContext.destination);

            // Create reverb chain
            await this.createReverb();

            // Create dry/wet mix
            this.dryGain = this.audioContext.createGain();
            this.dryGain.gain.value = 0.2; // 20% dry
            this.dryGain.connect(this.masterGain);

            this.reverbGain = this.audioContext.createGain();
            this.reverbGain.gain.value = 0.8; // 80% wet (lots of reverb!)
            this.reverbGain.connect(this.reverbNode);
            this.reverbNode.connect(this.masterGain);

            this.isInitialized = true;
            console.log('Audio system initialized');
        } catch (error) {
            console.error('Failed to initialize audio:', error);
        }
    }

    /**
     * Create reverb using convolver or custom reverb
     */
    async createReverb() {
        // Try to use ConvolverNode with impulse response
        this.reverbNode = this.audioContext.createConvolver();

        // Generate impulse response for reverb
        const sampleRate = this.audioContext.sampleRate;
        const duration = 3.0; // 3 second reverb
        const decay = 4.0; // Decay rate
        const length = sampleRate * duration;

        const impulse = this.audioContext.createBuffer(2, length, sampleRate);
        const leftChannel = impulse.getChannelData(0);
        const rightChannel = impulse.getChannelData(1);

        for (let i = 0; i < length; i++) {
            const t = i / sampleRate;
            const envelope = Math.exp(-t * decay);

            // Add some randomness for natural reverb
            leftChannel[i] = (Math.random() * 2 - 1) * envelope;
            rightChannel[i] = (Math.random() * 2 - 1) * envelope;
        }

        this.reverbNode.buffer = impulse;
    }

    /**
     * Handle animation events and trigger sounds
     */
    onAnimationEvent(eventType, data) {
        if (!this.isInitialized) return;

        const currentTime = this.audioContext.currentTime;

        // Prevent sounds from playing too frequently
        if (currentTime - this.lastSoundTime < this.minSoundInterval) {
            return;
        }

        switch (eventType) {
            case 'phase_complete':
                this.playTonalSound(data.phase % this.soundTypes.length);
                this.lastSoundTime = currentTime;
                break;

            case 'mouse_move':
                // Occasional sound on mouse movement
                if (Math.random() < 0.3) {
                    this.playClickSound();
                    this.lastSoundTime = currentTime;
                }
                break;
        }
    }

    /**
     * Play a tonal sound with reverb
     */
    playTonalSound(index = 0) {
        if (!this.isInitialized) return;

        const soundConfig = this.soundTypes[index % this.soundTypes.length];
        const now = this.audioContext.currentTime;

        // Create oscillator
        const osc = this.audioContext.createOscillator();
        osc.type = soundConfig.type;
        osc.frequency.value = soundConfig.freq;

        // Add slight frequency modulation
        const vibrato = this.audioContext.createOscillator();
        vibrato.frequency.value = 5;
        const vibratoGain = this.audioContext.createGain();
        vibratoGain.gain.value = 10;
        vibrato.connect(vibratoGain);
        vibratoGain.connect(osc.frequency);
        vibrato.start(now);
        vibrato.stop(now + soundConfig.duration);

        // Create envelope
        const envelope = this.audioContext.createGain();
        envelope.gain.value = 0;

        // ADSR envelope
        envelope.gain.setValueAtTime(0, now);
        envelope.gain.linearRampToValueAtTime(0.3, now + 0.05); // Attack
        envelope.gain.linearRampToValueAtTime(0.2, now + 0.1); // Decay
        envelope.gain.linearRampToValueAtTime(0.15, now + soundConfig.duration - 0.1); // Sustain
        envelope.gain.linearRampToValueAtTime(0, now + soundConfig.duration); // Release

        // Create filter for warmth
        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2000;
        filter.Q.value = 1;

        // Connect nodes
        osc.connect(envelope);
        envelope.connect(filter);
        filter.connect(this.dryGain);
        filter.connect(this.reverbGain);

        // Play
        osc.start(now);
        osc.stop(now + soundConfig.duration);
    }

    /**
     * Play a click/tick sound
     */
    playClickSound() {
        if (!this.isInitialized) return;

        const now = this.audioContext.currentTime;

        // Short noise burst
        const bufferSize = this.audioContext.sampleRate * 0.05;
        const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
        const data = buffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
        }

        const noise = this.audioContext.createBufferSource();
        noise.buffer = buffer;

        const noiseGain = this.audioContext.createGain();
        noiseGain.gain.value = 0.1;

        const filter = this.audioContext.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 1000;

        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(this.dryGain);
        noiseGain.connect(this.reverbGain);

        noise.start(now);
    }

    /**
     * Play a pad/drone sound (ambient background)
     */
    playPadSound(frequency = 110, duration = 4.0) {
        if (!this.isInitialized) return;

        const now = this.audioContext.currentTime;

        // Multiple detuned oscillators for richness
        const frequencies = [
            frequency,
            frequency * 1.01,
            frequency * 0.99,
            frequency * 1.5,
        ];

        frequencies.forEach((freq, i) => {
            const osc = this.audioContext.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = freq;

            const gain = this.audioContext.createGain();
            gain.gain.value = 0;
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.05, now + 0.5);
            gain.gain.linearRampToValueAtTime(0.03, now + duration - 0.5);
            gain.gain.linearRampToValueAtTime(0, now + duration);

            const filter = this.audioContext.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = 800 + i * 200;
            filter.Q.value = 2;

            osc.connect(gain);
            gain.connect(filter);
            filter.connect(this.reverbGain);

            osc.start(now);
            osc.stop(now + duration);
        });
    }

    /**
     * Set master volume
     */
    setVolume(volume) {
        if (this.masterGain) {
            this.masterGain.gain.value = Math.max(0, Math.min(1, volume));
        }
    }

    /**
     * Set reverb mix (0 = dry, 1 = wet)
     */
    setReverbMix(mix) {
        if (this.dryGain && this.reverbGain) {
            this.dryGain.gain.value = 1 - mix;
            this.reverbGain.gain.value = mix;
        }
    }

    /**
     * Resume audio context (for browsers that suspend it)
     */
    resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume();
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.audioContext) {
            this.audioContext.close();
        }
    }
}
