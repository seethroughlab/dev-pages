/**
 * Main entry point for Beat Detector application
 * Coordinates all modules and handles UI interactions
 */

import { AudioDeviceManager } from './audioDevices.js';
import { BeatDetector } from './beatDetector.js';
import { SpectrumVisualizer } from './visualizer.js';
import { RangeControls } from './rangeControls.js';

class BeatDetectorApp {
    constructor() {
        // Modules
        this.deviceManager = new AudioDeviceManager('audioSource');
        this.beatDetector = new BeatDetector();
        this.visualizer = new SpectrumVisualizer('spectrum');
        this.rangeControls = null; // Created after beat detector initializes

        // State
        this.isRunning = false;

        // UI elements
        this.startButton = document.getElementById('startBtn');
        this.stopButton = document.getElementById('stopBtn');

        // Bind event handlers
        this.handleStart = this.handleStart.bind(this);
        this.handleStop = this.handleStop.bind(this);

        // Setup
        this.setupUI();
        this.setupBeatCallbacks();
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            await this.deviceManager.initialize();
            console.log('Application initialized');
        } catch (error) {
            console.error('Initialization error:', error);
        }
    }

    /**
     * Setup UI event listeners
     */
    setupUI() {
        this.startButton.addEventListener('click', this.handleStart);
        this.stopButton.addEventListener('click', this.handleStop);
    }

    /**
     * Setup beat detection callbacks
     */
    setupBeatCallbacks() {
        // Register callbacks for beat indicators
        this.beatDetector.onBeat('kick', () => {
            const indicator = document.getElementById('kickIndicator');
            indicator.classList.add('active');
            setTimeout(() => indicator.classList.remove('active'), 100);
        });

        this.beatDetector.onBeat('snare', () => {
            const indicator = document.getElementById('snareIndicator');
            indicator.classList.add('active');
            setTimeout(() => indicator.classList.remove('active'), 100);
        });

        this.beatDetector.onBeat('hihat', () => {
            const indicator = document.getElementById('hihatIndicator');
            indicator.classList.add('active');
            setTimeout(() => indicator.classList.remove('active'), 100);
        });
    }

    /**
     * Start beat detection
     */
    async handleStart() {
        if (!this.deviceManager.hasSelection()) {
            alert('Please select an audio source first');
            return;
        }

        try {
            const deviceId = this.deviceManager.getSelectedDeviceId();

            // Initialize beat detector
            await this.beatDetector.initialize(deviceId);

            // Initialize range controls
            this.rangeControls = new RangeControls('spectrum', this.beatDetector);
            this.rangeControls.activate();

            // Start visualization
            this.visualizer.start(this.beatDetector);

            // Update UI
            this.isRunning = true;
            this.startButton.disabled = true;
            this.stopButton.disabled = false;

            console.log('Detection started');
        } catch (error) {
            console.error('Error starting detection:', error);
            alert('Error starting detection: ' + error.message);
        }
    }

    /**
     * Stop beat detection
     */
    handleStop() {
        // Stop visualization
        this.visualizer.stop();

        // Deactivate range controls
        if (this.rangeControls) {
            this.rangeControls.deactivate();
            this.rangeControls = null;
        }

        // Stop beat detector
        this.beatDetector.stop();

        // Clear indicators
        document.getElementById('kickIndicator').classList.remove('active');
        document.getElementById('snareIndicator').classList.remove('active');
        document.getElementById('hihatIndicator').classList.remove('active');

        // Reset energy bars
        document.getElementById('kickEnergy').style.width = '0%';
        document.getElementById('snareEnergy').style.width = '0%';
        document.getElementById('hihatEnergy').style.width = '0%';

        // Update UI
        this.isRunning = false;
        this.startButton.disabled = false;
        this.stopButton.disabled = true;

        console.log('Detection stopped');
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const app = new BeatDetectorApp();
        app.init();
        window.beatApp = app; // Expose for debugging
    });
} else {
    const app = new BeatDetectorApp();
    app.init();
    window.beatApp = app;
}
