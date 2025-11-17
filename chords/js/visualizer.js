/**
 * Spectrum visualization module
 * Renders frequency spectrum on canvas
 */

export class SpectrumVisualizer {
    constructor(canvasId, audioAnalyzer) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.audioAnalyzer = audioAnalyzer;
        this.isActive = false;

        // Set canvas size with device pixel ratio for crisp rendering
        this.canvas.width = this.canvas.offsetWidth * window.devicePixelRatio;
        this.canvas.height = 150 * window.devicePixelRatio;
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    /**
     * Draw frequency spectrum
     */
    draw() {
        if (!this.isActive || !this.audioAnalyzer.getIsRunning()) return;

        const dataArray = this.audioAnalyzer.getDataArray();
        const bufferLength = this.audioAnalyzer.getBufferLength();

        const width = this.canvas.offsetWidth;
        const height = 150;

        // Semi-transparent background for trail effect
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
        this.ctx.fillRect(0, 0, width, height);

        const barWidth = width / bufferLength * 2;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * height;

            // Rainbow gradient based on frequency
            const hue = (i / bufferLength) * 240;
            this.ctx.fillStyle = `hsl(${hue}, 70%, 60%)`;
            this.ctx.fillRect(x, height - barHeight, barWidth, barHeight);

            x += barWidth;
        }
    }

    /**
     * Start visualization
     */
    start() {
        this.isActive = true;
    }

    /**
     * Stop visualization
     */
    stop() {
        this.isActive = false;

        // Clear canvas
        const width = this.canvas.offsetWidth;
        const height = 150;
        this.ctx.fillStyle = 'rgba(0, 0, 0, 1)';
        this.ctx.fillRect(0, 0, width, height);
    }
}
