/**
 * Frequency range controls module
 * Handles mouse interaction for dragging and resizing frequency ranges
 */

import { EDGE_THRESHOLD } from './config.js';

export class RangeControls {
    constructor(canvasId, beatDetector) {
        this.canvas = document.getElementById(canvasId);
        this.beatDetector = beatDetector;
        this.isActive = false;

        // Drag state
        this.dragState = {
            isDragging: false,
            dragType: null, // 'kick', 'snare', 'hihat'
            dragEdge: null, // 'low', 'high', 'middle', 'threshold'
            startX: 0,
            startY: 0,
            startLow: 0,
            startHigh: 0,
            startThreshold: 0
        };

        // Bind event handlers
        this.handleMouseDown = this.handleMouseDown.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
        this.handleMouseLeave = this.handleMouseLeave.bind(this);
    }

    /**
     * Activate controls
     */
    activate() {
        this.isActive = true;
        this.canvas.addEventListener('mousedown', this.handleMouseDown);
        this.canvas.addEventListener('mousemove', this.handleMouseMove);
        this.canvas.addEventListener('mouseup', this.handleMouseUp);
        this.canvas.addEventListener('mouseleave', this.handleMouseLeave);
    }

    /**
     * Deactivate controls
     */
    deactivate() {
        this.isActive = false;
        this.canvas.removeEventListener('mousedown', this.handleMouseDown);
        this.canvas.removeEventListener('mousemove', this.handleMouseMove);
        this.canvas.removeEventListener('mouseup', this.handleMouseUp);
        this.canvas.removeEventListener('mouseleave', this.handleMouseLeave);
    }

    /**
     * Handle mouse down event
     */
    handleMouseDown(e) {
        if (!this.isActive) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const canvasWidth = rect.width;
        const canvasHeight = rect.height;
        const nyquist = this.beatDetector.getSampleRate() / 2;
        const settings = this.beatDetector.getRangeSettings();

        // Check which range we're clicking on
        const ranges = [
            { type: 'kick', ...settings.kick },
            { type: 'snare', ...settings.snare },
            { type: 'hihat', ...settings.hihat }
        ];

        for (const range of ranges) {
            const xStart = (range.low / nyquist) * canvasWidth;
            const xEnd = (range.high / nyquist) * canvasWidth;
            const thresholdY = canvasHeight - ((range.threshold - 1.0) / 1.0) * canvasHeight;

            // Check if clicking on threshold line
            if (x >= xStart && x <= xEnd && Math.abs(y - thresholdY) < EDGE_THRESHOLD) {
                this.dragState = {
                    isDragging: true,
                    dragType: range.type,
                    dragEdge: 'threshold',
                    startX: x,
                    startY: y,
                    startThreshold: range.threshold,
                    startLow: range.low,
                    startHigh: range.high
                };
                this.canvas.style.cursor = 'ns-resize';
                return;
            }
            // Check if clicking on low edge
            else if (Math.abs(x - xStart) < EDGE_THRESHOLD) {
                this.dragState = {
                    isDragging: true,
                    dragType: range.type,
                    dragEdge: 'low',
                    startX: x,
                    startY: y,
                    startLow: range.low,
                    startHigh: range.high
                };
                this.canvas.style.cursor = 'ew-resize';
                return;
            }
            // Check if clicking on high edge
            else if (Math.abs(x - xEnd) < EDGE_THRESHOLD) {
                this.dragState = {
                    isDragging: true,
                    dragType: range.type,
                    dragEdge: 'high',
                    startX: x,
                    startY: y,
                    startLow: range.low,
                    startHigh: range.high
                };
                this.canvas.style.cursor = 'ew-resize';
                return;
            }
            // Check if clicking inside the range
            else if (x >= xStart && x <= xEnd) {
                this.dragState = {
                    isDragging: true,
                    dragType: range.type,
                    dragEdge: 'middle',
                    startX: x,
                    startY: y,
                    startLow: range.low,
                    startHigh: range.high
                };
                this.canvas.style.cursor = 'move';
                return;
            }
        }
    }

    /**
     * Handle mouse move event
     */
    handleMouseMove(e) {
        if (!this.isActive) return;

        const rect = this.canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const canvasWidth = rect.width;
        const canvasHeight = rect.height;
        const nyquist = this.beatDetector.getSampleRate() / 2;

        if (this.dragState.isDragging) {
            const type = this.dragState.dragType;

            if (this.dragState.dragEdge === 'threshold') {
                // Dragging threshold line
                const deltaY = this.dragState.startY - y; // Inverted: up increases threshold
                const deltaThreshold = (deltaY / canvasHeight) * 1.0; // Map to threshold range (1.0)

                let newThreshold = this.dragState.startThreshold + deltaThreshold;
                newThreshold = Math.max(1.0, Math.min(2.0, newThreshold)); // Clamp between 1.0 and 2.0

                this.beatDetector.updateThreshold(type, newThreshold);
            } else {
                // Existing frequency range dragging
                const deltaX = x - this.dragState.startX;
                const deltaFreq = (deltaX / canvasWidth) * nyquist;
                const maxFreq = nyquist;

                if (this.dragState.dragEdge === 'low') {
                let newLow = Math.max(0, this.dragState.startLow + deltaFreq);
                const currentHigh = this.beatDetector.getRangeSettings()[type].high;

                // Allow swapping if dragged past the high edge
                if (newLow > currentHigh) {
                    this.beatDetector.updateRange(type, Math.round(currentHigh), Math.round(Math.min(maxFreq, newLow)));
                } else {
                    this.beatDetector.updateRange(type, Math.round(newLow), currentHigh);
                }
            } else if (this.dragState.dragEdge === 'high') {
                let newHigh = Math.min(maxFreq, this.dragState.startHigh + deltaFreq);
                const currentLow = this.beatDetector.getRangeSettings()[type].low;

                // Allow swapping if dragged past the low edge
                if (newHigh < currentLow) {
                    this.beatDetector.updateRange(type, Math.round(Math.max(0, newHigh)), Math.round(currentLow));
                } else {
                    this.beatDetector.updateRange(type, currentLow, Math.round(newHigh));
                }
            } else if (this.dragState.dragEdge === 'middle') {
                const width = this.dragState.startHigh - this.dragState.startLow;
                let newLow = Math.max(0, this.dragState.startLow + deltaFreq);
                let newHigh = Math.min(maxFreq, this.dragState.startHigh + deltaFreq);

                // Keep width constant
                if (newLow < 0) {
                    newLow = 0;
                    newHigh = width;
                }
                if (newHigh > maxFreq) {
                    newHigh = maxFreq;
                    newLow = maxFreq - width;
                }

                this.beatDetector.updateRange(type, Math.round(newLow), Math.round(newHigh));
                }
            }
        } else {
            // Update cursor based on hover position
            const settings = this.beatDetector.getRangeSettings();
            const ranges = [
                { type: 'kick', ...settings.kick },
                { type: 'snare', ...settings.snare },
                { type: 'hihat', ...settings.hihat }
            ];

            let cursorSet = false;

            for (const range of ranges) {
                const xStart = (range.low / nyquist) * canvasWidth;
                const xEnd = (range.high / nyquist) * canvasWidth;
                const thresholdY = canvasHeight - ((range.threshold - 1.0) / 1.0) * canvasHeight;

                // Check if hovering over threshold line
                if (x >= xStart && x <= xEnd && Math.abs(y - thresholdY) < EDGE_THRESHOLD) {
                    this.canvas.style.cursor = 'ns-resize';
                    cursorSet = true;
                    break;
                }
                // Check if hovering over edges
                else if (Math.abs(x - xStart) < EDGE_THRESHOLD || Math.abs(x - xEnd) < EDGE_THRESHOLD) {
                    this.canvas.style.cursor = 'ew-resize';
                    cursorSet = true;
                    break;
                }
                // Check if hovering inside range
                else if (x >= xStart && x <= xEnd) {
                    this.canvas.style.cursor = 'move';
                    cursorSet = true;
                    break;
                }
            }

            if (!cursorSet) {
                this.canvas.style.cursor = 'crosshair';
            }
        }
    }

    /**
     * Handle mouse up event
     */
    handleMouseUp() {
        this.dragState.isDragging = false;
        this.dragState.dragType = null;
        this.dragState.dragEdge = null;
    }

    /**
     * Handle mouse leave event
     */
    handleMouseLeave() {
        this.dragState.isDragging = false;
        this.dragState.dragType = null;
        this.dragState.dragEdge = null;
        this.canvas.style.cursor = 'default';
    }
}
