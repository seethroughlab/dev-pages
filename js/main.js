/**
 * Main Entry Point
 * Initializes and coordinates all modules
 */

import { checkWebGPUSupport } from './utils.js';
import { loadGeometryData } from './geometry-data.js';
import { WebGPURenderer } from './webgpuRenderer.js';
import { AnimationController } from './animationController.js';
import { AudioSystem } from './audioSystem.js';
import { MouseMelody } from './mouseMelody.js';

/**
 * Geometry stats helper
 */
function getGeometryStats(buffers) {
    const totalVertices = buffers.reduce((sum, buf) => sum + buf.vertexCount, 0);
    const totalIndices = buffers.reduce((sum, buf) => sum + buf.indexCount, 0);
    const totalTriangles = totalIndices / 3;

    return {
        bufferCount: buffers.length,
        totalVertices,
        totalIndices,
        totalTriangles
    };
}

class App {
    constructor() {
        this.canvas = document.getElementById('canvas');
        this.loadingEl = document.getElementById('loading');
        this.errorEl = document.getElementById('error');

        this.renderer = null;
        this.animationController = null;
        this.audioSystem = null;
        this.mouseMelody = null;
        this.audioInitialized = false;
    }

    /**
     * Initialize the application
     */
    async init() {
        try {
            this.showLoading('Checking WebGPU support...');

            // Check WebGPU support
            const support = await checkWebGPUSupport();
            if (!support.supported) {
                throw new Error(support.error);
            }

            this.showLoading('Loading geometry...');

            // Load pre-baked geometry data
            const buffers = loadGeometryData();
            console.log(`Loaded ${buffers.length} geometry buffers`);

            const stats = getGeometryStats(buffers);
            console.log('Geometry stats:', stats);

            this.showLoading('Initializing WebGPU...');

            // Initialize renderer
            this.renderer = new WebGPURenderer(this.canvas);
            await this.renderer.initialize();

            this.showLoading('Creating render pipeline...');

            // Create pipeline
            await this.renderer.createPipeline();

            this.showLoading('Uploading geometry...');

            // Upload geometry
            this.renderer.uploadGeometry(buffers);

            this.showLoading('Starting animation...');

            // Initialize animation controller
            this.animationController = new AnimationController(this.renderer, this.canvas);

            // Setup ripple effects on click
            this.setupRippleEffects();

            // Initialize audio system (but don't start until user interaction)
            this.audioSystem = new AudioSystem();

            // Setup audio initialization on first user interaction
            this.setupAudioInitialization();

            // Connect animation events to audio and effects
            const uniforms = this.renderer.getUniforms();
            uniforms.setParallaxStrength(0.25); // Enable parallax - move mouse to see layers shift

            uniforms.on('*', (eventType, data) => {
                if (this.audioSystem) {
                    this.audioSystem.onAnimationEvent(eventType, data);
                }
            });

            // Start animation
            this.animationController.start();

            // Hide loading
            this.hideLoading();

            console.log('Application initialized successfully');

        } catch (error) {
            this.showError(error.message);
            console.error('Initialization error:', error);
        }
    }

    /**
     * Setup audio initialization on first user interaction
     */
    setupAudioInitialization() {
        const initAudio = async () => {
            if (!this.audioInitialized) {
                await this.audioSystem.initialize();
                this.audioInitialized = true;
                console.log('Audio initialized on user interaction');

                // Initialize mouse melody system
                this.mouseMelody = new MouseMelody(
                    this.audioSystem.audioContext,
                    this.audioSystem.reverbNode
                );
                await this.mouseMelody.initialize();
                this.mouseMelody.start();

                // Setup visual sync for note playback
                this.mouseMelody.onNotePlayed((frequency, normalizedY) => {
                    // Pulse the logo when notes are played
                    const uniforms = this.renderer.getUniforms();
                    const pulseTo = 1.0 + (1.0 - normalizedY) * 0.12; // Pulse based on pitch (increased from 0.05)

                    // Quick pulse and return
                    uniforms.setScalePulse(pulseTo);
                    setTimeout(() => {
                        if (this.renderer) {
                            uniforms.setScalePulse(1.0);
                        }
                    }, 150); // Slightly longer pulse
                });

                // Setup mouse tracking for melody
                this.setupMouseMelody();

                // Play an initial pad sound
                this.audioSystem.playPadSound(110, 3.0);
            }
        };

        // Initialize on first click, touch, or key press
        document.addEventListener('click', initAudio, { once: true });
        document.addEventListener('touchstart', initAudio, { once: true });
        document.addEventListener('keydown', initAudio, { once: true });

        // Also try to initialize on mousemove after a delay
        let mouseMoveTimeout;
        const initOnMouseMove = () => {
            clearTimeout(mouseMoveTimeout);
            mouseMoveTimeout = setTimeout(initAudio, 1000);
        };
        document.addEventListener('mousemove', initOnMouseMove, { once: true });
    }

    /**
     * Setup mouse tracking for melody system
     */
    setupMouseMelody() {
        if (!this.canvas || !this.mouseMelody) return;

        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            this.mouseMelody.onMouseMove(x, y, this.canvas.width, this.canvas.height);
        });

        // Also handle touch for mobile
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const touch = e.touches[0];
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            this.mouseMelody.onMouseMove(x, y, this.canvas.width, this.canvas.height);
        }, { passive: false });

        console.log('Mouse melody tracking enabled');
    }

    /**
     * Setup ripple effects on click
     */
    setupRippleEffects() {
        if (!this.canvas || !this.renderer) return;

        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            // Convert to normalized coordinates (-1 to 1)
            const normalizedX = (x / this.canvas.width) * 2 - 1;
            const normalizedY = -((y / this.canvas.height) * 2 - 1); // Flip Y

            // Trigger ripple effect
            const uniforms = this.renderer.getUniforms();
            uniforms.triggerRipple(normalizedX, normalizedY);

            console.log(`Ripple triggered at (${normalizedX.toFixed(2)}, ${normalizedY.toFixed(2)})`);
        });

        // Also handle touch
        this.canvas.addEventListener('touchstart', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const touch = e.touches[0];
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;

            const normalizedX = (x / this.canvas.width) * 2 - 1;
            const normalizedY = -((y / this.canvas.height) * 2 - 1);

            const uniforms = this.renderer.getUniforms();
            uniforms.triggerRipple(normalizedX, normalizedY);
        });

        console.log('Ripple effects enabled');
    }

    /**
     * Show loading message
     */
    showLoading(message) {
        this.loadingEl.textContent = message;
        this.loadingEl.classList.remove('hidden');
    }

    /**
     * Hide loading
     */
    hideLoading() {
        this.loadingEl.classList.add('hidden');
    }

    /**
     * Show error message
     */
    showError(message) {
        this.errorEl.textContent = `Error: ${message}\n\nYour browser may not support WebGPU. Please try Chrome or Edge (version 113+).`;
        this.errorEl.classList.add('visible');
        this.loadingEl.classList.add('hidden');
    }

    /**
     * Cleanup
     */
    destroy() {
        if (this.animationController) {
            this.animationController.stop();
        }

        if (this.renderer) {
            this.renderer.destroy();
        }

        if (this.mouseMelody) {
            this.mouseMelody.destroy();
        }

        if (this.audioSystem) {
            this.audioSystem.destroy();
        }
    }
}

// Initialize app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        const app = new App();
        app.init();

        // Expose app to window for debugging
        window.app = app;
    });
} else {
    const app = new App();
    app.init();
    window.app = app;
}
