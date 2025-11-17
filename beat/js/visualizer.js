/**
 * Spectrum visualizer module
 * Draws the frequency spectrum and frequency range rectangles
 */

import { DRUM_COLORS } from './config.js';

export class SpectrumVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.isRunning = false;
        this.animationId = null;
    }

    /**
     * Start visualization loop
     */
    start(beatDetector) {
        this.isRunning = true;
        this.beatDetector = beatDetector;
        this.visualize();
    }

    /**
     * Stop visualization
     */
    stop() {
        this.isRunning = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    /**
     * Main visualization loop
     */
    visualize() {
        if (!this.isRunning) return;

        const dataArray = this.beatDetector.getDataArray();
        const bufferLength = this.beatDetector.getBufferLength();
        const settings = this.beatDetector.getRangeSettings();
        const sampleRate = this.beatDetector.getSampleRate();

        // Set canvas size
        const rect = this.canvas.getBoundingClientRect();
        this.canvas.width = rect.width;
        this.canvas.height = rect.height;

        // Clear canvas
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw spectrum bars (white/gray)
        const barWidth = this.canvas.width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = (dataArray[i] / 255) * this.canvas.height;

            this.ctx.fillStyle = 'rgba(150, 150, 150, 0.6)';
            this.ctx.fillRect(x, this.canvas.height - barHeight, barWidth, barHeight);

            x += barWidth;
        }

        // Draw frequency range rectangles
        const nyquist = sampleRate / 2;

        // Draw each drum range
        this.drawRangeRect(settings.kick.low, settings.kick.high, DRUM_COLORS.kick, 'KICK', nyquist);
        this.drawRangeRect(settings.snare.low, settings.snare.high, DRUM_COLORS.snare, 'SNARE', nyquist);
        this.drawRangeRect(settings.hihat.low, settings.hihat.high, DRUM_COLORS.hihat, 'HI-HAT', nyquist);

        // Update energy bars
        const kickEnergy = this.beatDetector.getEnergyInRange(settings.kick.low, settings.kick.high);
        const snareEnergy = this.beatDetector.getEnergyInRange(settings.snare.low, settings.snare.high);
        const hihatEnergy = this.beatDetector.getEnergyInRange(settings.hihat.low, settings.hihat.high);

        document.getElementById('kickEnergy').style.width = `${(kickEnergy / 255) * 100}%`;
        document.getElementById('snareEnergy').style.width = `${(snareEnergy / 255) * 100}%`;
        document.getElementById('hihatEnergy').style.width = `${(hihatEnergy / 255) * 100}%`;

        // Analyze beats (triggers callbacks automatically)
        this.beatDetector.analyze();

        this.animationId = requestAnimationFrame(() => this.visualize());
    }

    /**
     * Draw frequency range rectangle with threshold line
     */
    drawRangeRect(lowFreq, highFreq, color, label, nyquist) {
        const xStart = (lowFreq / nyquist) * this.canvas.width;
        const xEnd = (highFreq / nyquist) * this.canvas.width;
        const width = xEnd - xStart;

        // Draw semi-transparent rectangle
        this.ctx.fillStyle = color;
        this.ctx.fillRect(xStart, 0, width, this.canvas.height);

        // Draw border
        this.ctx.strokeStyle = color.replace('0.2', '0.8');
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(xStart, 0, width, this.canvas.height);

        // Draw label
        this.ctx.fillStyle = 'white';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(label, xStart + width / 2, 20);

        // Draw frequency labels
        this.ctx.font = '11px Arial';
        this.ctx.fillText(`${lowFreq}Hz`, xStart + 5, this.canvas.height - 10);
        this.ctx.fillText(`${highFreq}Hz`, xEnd - 5, this.canvas.height - 10);

        // Get threshold for this range
        const drumType = label.toLowerCase().replace('-', '');
        const threshold = this.beatDetector.getRangeSettings()[drumType]?.threshold || 1.0;

        // Draw threshold line (energy threshold)
        // Threshold represents multiplier of average energy (e.g., 1.3 = 30% above average)
        // We'll map threshold range (1.0 - 2.0) to canvas height
        const thresholdY = this.canvas.height - ((threshold - 1.0) / 1.0) * this.canvas.height;

        this.ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
        this.ctx.lineWidth = 3;
        this.ctx.setLineDash([10, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(xStart, thresholdY);
        this.ctx.lineTo(xEnd, thresholdY);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Draw threshold label
        this.ctx.fillStyle = 'rgba(255, 255, 0, 0.9)';
        this.ctx.font = 'bold 11px Arial';
        this.ctx.textAlign = 'right';
        this.ctx.fillText(`${threshold.toFixed(2)}x`, xEnd - 5, thresholdY - 5);

        // Draw drag handle
        const handleX = xStart + width / 2;
        this.ctx.fillStyle = 'rgba(255, 255, 0, 0.9)';
        this.ctx.beginPath();
        this.ctx.arc(handleX, thresholdY, 5, 0, Math.PI * 2);
        this.ctx.fill();
    }
}
