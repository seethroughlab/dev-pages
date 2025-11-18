/**
 * Main application entry point
 * Coordinates audio analysis, chord detection, and visualization
 */

import { AudioAnalyzer } from './audioAnalyzer.js';
import { ChordDetector } from './chordDetector.js';
import { SpectrumVisualizer } from './visualizer.js';
import { MidiInput } from './midiInput.js';

class ChordAnalyzerApp {
    constructor() {
        // Initialize modules
        this.audioAnalyzer = new AudioAnalyzer();
        this.midiInput = new MidiInput();
        this.chordDetector = new ChordDetector();
        this.visualizer = null;

        // UI elements
        this.startBtn = document.getElementById('startBtn');
        this.status = document.getElementById('status');
        this.currentChordEl = document.getElementById('currentChord');
        this.notesDetectedEl = document.getElementById('notesDetected');
        this.suggestionsEl = document.getElementById('suggestions');
        this.confidenceBar = document.getElementById('confidenceBar');
        this.inputSourceRadios = document.querySelectorAll('input[name="inputSource"]');
        this.midiDeviceSection = document.getElementById('midiDeviceSection');
        this.midiDeviceSelect = document.getElementById('midiDevice');

        // Analysis state
        this.isListening = false;
        this.animationId = null;
        this.inputSource = 'microphone'; // 'microphone' or 'midi'
        this.currentMidiNotes = [];

        // Bind event handlers
        this.startBtn.addEventListener('click', () => this.toggleListening());
        this.inputSourceRadios.forEach(radio => {
            radio.addEventListener('change', (e) => this.handleInputSourceChange(e.target.value));
        });
        this.midiDeviceSelect.addEventListener('change', (e) => this.handleMidiDeviceChange(e.target.value));
    }

    /**
     * Initialize application
     */
    async init() {
        // Initialize visualizer
        this.visualizer = new SpectrumVisualizer('spectrumCanvas', this.audioAnalyzer);

        // Check for MIDI support
        if (MidiInput.isSupported()) {
            try {
                await this.midiInput.initialize();
                console.log('MIDI support available');
            } catch (error) {
                console.error('Failed to initialize MIDI:', error);
                // Disable MIDI option if initialization fails
                const midiRadio = document.querySelector('input[name="inputSource"][value="midi"]');
                if (midiRadio) {
                    midiRadio.disabled = true;
                    midiRadio.parentElement.style.opacity = '0.5';
                    midiRadio.parentElement.title = 'MIDI not available';
                }
            }
        } else {
            // Disable MIDI option if not supported
            const midiRadio = document.querySelector('input[name="inputSource"][value="midi"]');
            if (midiRadio) {
                midiRadio.disabled = true;
                midiRadio.parentElement.style.opacity = '0.5';
                midiRadio.parentElement.title = 'MIDI not supported in this browser';
            }
        }

        console.log('Chord analyzer app initialized');
    }

    /**
     * Handle input source change
     */
    handleInputSourceChange(source) {
        this.inputSource = source;

        // Show/hide MIDI device selector
        if (source === 'midi') {
            this.midiDeviceSection.style.display = 'block';
            this.loadMidiDevices();
        } else {
            this.midiDeviceSection.style.display = 'none';
        }
    }

    /**
     * Load available MIDI devices
     */
    loadMidiDevices() {
        const devices = this.midiInput.getInputDevices();

        // Clear existing options (except first one)
        this.midiDeviceSelect.innerHTML = '<option value="">Select a MIDI device...</option>';

        // Add device options
        devices.forEach(device => {
            const option = document.createElement('option');
            option.value = device.id;
            option.textContent = device.name;
            this.midiDeviceSelect.appendChild(option);
        });

        if (devices.length === 0) {
            this.status.textContent = 'No MIDI devices found. Please connect a MIDI keyboard.';
        }
    }

    /**
     * Handle MIDI device selection
     */
    handleMidiDeviceChange(deviceId) {
        if (deviceId) {
            this.midiInput.selectInput(deviceId);
            this.status.textContent = 'MIDI device selected. Click "Start Listening" to begin.';
        }
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
     * Start listening to selected input source
     */
    async startListening() {
        try {
            if (this.inputSource === 'microphone') {
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
            } else if (this.inputSource === 'midi') {
                // Check if MIDI device is selected
                if (!this.midiDeviceSelect.value) {
                    this.status.textContent = 'Please select a MIDI device first';
                    return;
                }

                // Set up MIDI note callback
                this.midiInput.onNotesChange = (notes) => {
                    this.currentMidiNotes = notes;
                    this.updateNotesDisplay(notes);

                    // Identify chord if enough notes
                    if (notes.length >= 2) {
                        const chord = this.chordDetector.identifyChord(notes);
                        if (chord) {
                            this.updateChordDisplay(chord);
                            this.updateSuggestions(chord);
                        }
                    } else {
                        this.currentChordEl.textContent = '—';
                        this.confidenceBar.style.width = '0%';
                        this.confidenceBar.textContent = '0%';
                    }
                };

                // Update UI
                this.isListening = true;
                this.startBtn.textContent = 'Stop Listening';
                this.startBtn.classList.add('active');
                this.status.textContent = '🎹 Listening to MIDI... Play some chords!';
            }
        } catch (error) {
            console.error('Error starting listening:', error);
            this.status.textContent = `Error: ${error.message}`;
        }
    }

    /**
     * Stop listening
     */
    stopListening() {
        if (this.inputSource === 'microphone') {
            // Stop audio analyzer
            this.audioAnalyzer.stop();

            // Stop visualization
            this.visualizer.stop();

            // Cancel animation loop
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
            }
        } else if (this.inputSource === 'midi') {
            // Stop MIDI input
            this.midiInput.stop();
            this.midiInput.onNotesChange = null;
            this.currentMidiNotes = [];
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
                .map(s => {
                    // Handle both object format (with feeling) and string format
                    if (typeof s === 'object') {
                        return `<div class="suggestion-chip">
                            <div class="chord-name">${s.chord}</div>
                            <div class="chord-feeling">${s.feeling}</div>
                        </div>`;
                    } else {
                        return `<div class="suggestion-chip">${s}</div>`;
                    }
                })
                .join('');
        }
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    const app = new ChordAnalyzerApp();
    await app.init();
});
