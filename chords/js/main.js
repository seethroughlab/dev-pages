/**
 * Main application entry point
 * Coordinates audio analysis, chord detection, and visualization
 */

import { AudioAnalyzer } from './audioAnalyzer.js';
import { ChordDetector } from './chordDetector.js';
import { SpectrumVisualizer } from './visualizer.js';

class ChordAnalyzerApp {
    constructor() {
        // Initialize modules
        this.audioAnalyzer = new AudioAnalyzer();
        this.chordDetector = new ChordDetector();
        this.visualizer = null;

        // UI elements
        this.startBtn = document.getElementById('startBtn');
        this.status = document.getElementById('status');
        this.currentChordEl = document.getElementById('currentChord');
        this.notesDetectedEl = document.getElementById('notesDetected');
        this.suggestionsEl = document.getElementById('suggestions');
        this.confidenceBar = document.getElementById('confidenceBar');

        // Analysis state
        this.isListening = false;
        this.animationId = null;

        // Bind event handlers
        this.startBtn.addEventListener('click', () => this.toggleListening());
    }

    /**
     * Initialize application
     */
    async init() {
        // Initialize visualizer
        this.visualizer = new SpectrumVisualizer('spectrumCanvas', this.audioAnalyzer);
        console.log('Chord analyzer app initialized');
    }

    /**
     * Toggle listening state
     */
    async toggleListening() {
        if (!this.isListening) {
            await this.startListening();
        } else {
            this.stopListening();
        }
    }

    /**
     * Start listening to microphone
     */
    async startListening() {
        try {
            this.status.textContent = 'Requesting microphone access...';

            // Initialize audio analyzer
            await this.audioAnalyzer.initialize();

            // Start visualization
            this.visualizer.start();

            // Update UI
            this.isListening = true;
            this.startBtn.textContent = 'Stop Listening';
            this.startBtn.classList.add('active');
            this.status.textContent = '🎤 Listening... Play some chords!';

            // Start analysis loop
            this.analyze();
        } catch (error) {
            console.error('Error starting listening:', error);
            this.status.textContent = 'Error: Could not access microphone';
        }
    }

    /**
     * Stop listening
     */
    stopListening() {
        // Stop audio analyzer
        this.audioAnalyzer.stop();

        // Stop visualization
        this.visualizer.stop();

        // Cancel animation loop
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }

        // Update UI
        this.isListening = false;
        this.startBtn.textContent = 'Start Listening';
        this.startBtn.classList.remove('active');
        this.status.textContent = 'Stopped';
    }

    /**
     * Main analysis loop
     */
    analyze() {
        if (!this.isListening) return;

        // Draw spectrum
        this.visualizer.draw();

        // Detect notes
        const detectedNotes = this.audioAnalyzer.detectNotes();

        // Update notes display
        this.updateNotesDisplay(detectedNotes);

        // Identify chord if enough notes detected
        if (detectedNotes.length >= 2) {
            const chord = this.chordDetector.identifyChord(detectedNotes);
            if (chord) {
                this.updateChordDisplay(chord);
                this.updateSuggestions(chord);
            }
        } else {
            if (detectedNotes.length === 0) {
                this.currentChordEl.textContent = '—';
                this.confidenceBar.style.width = '0%';
                this.confidenceBar.textContent = '0%';
            }
        }

        // Continue loop
        this.animationId = requestAnimationFrame(() => this.analyze());
    }

    /**
     * Update notes display
     */
    updateNotesDisplay(notes) {
        if (notes.length === 0) {
            this.notesDetectedEl.innerHTML = '<div style="opacity: 0.5; padding: 10px;">No notes detected</div>';
            return;
        }

        this.notesDetectedEl.innerHTML = notes
            .map(n => `<span class="note-badge">${n.note}${n.octave}</span>`)
            .join('');
    }

    /**
     * Update chord display
     */
    updateChordDisplay(chord) {
        this.currentChordEl.textContent = chord.name;
        const confidence = Math.round(chord.confidence);
        this.confidenceBar.style.width = confidence + '%';
        this.confidenceBar.textContent = confidence + '%';
    }

    /**
     * Update chord suggestions
     */
    updateSuggestions(chord) {
        const suggestions = this.chordDetector.getSuggestions(chord);

        if (suggestions.length === 0) {
            this.suggestionsEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; opacity: 0.6; padding: 20px;">No suggestions available</div>';
        } else {
            this.suggestionsEl.innerHTML = suggestions
                .map(s => `<div class="suggestion-chip">${s}</div>`)
                .join('');
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    const app = new ChordAnalyzerApp();
    await app.init();
});
