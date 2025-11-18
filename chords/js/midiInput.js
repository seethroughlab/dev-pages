/**
 * MIDI Input Handler
 * Handles Web MIDI API for receiving input from MIDI keyboards
 */

export class MidiInput {
    constructor() {
        this.midiAccess = null;
        this.activeNotes = new Map(); // Map of MIDI note number -> {note, octave, velocity}
        this.selectedInput = null;
        this.onNotesChange = null; // Callback for when notes change
    }

    /**
     * Initialize Web MIDI API
     */
    async initialize() {
        try {
            if (!navigator.requestMIDIAccess) {
                throw new Error('Web MIDI API not supported in this browser');
            }

            this.midiAccess = await navigator.requestMIDIAccess();
            console.log('MIDI Access initialized');

            // Listen for device connection changes
            this.midiAccess.onstatechange = (e) => {
                console.log('MIDI device state changed:', e.port.name, e.port.state);
            };

            return this.getInputDevices();
        } catch (error) {
            console.error('Failed to initialize MIDI:', error);
            throw error;
        }
    }

    /**
     * Get list of available MIDI input devices
     */
    getInputDevices() {
        if (!this.midiAccess) return [];

        const devices = [];
        this.midiAccess.inputs.forEach((input) => {
            devices.push({
                id: input.id,
                name: input.name,
                manufacturer: input.manufacturer,
                state: input.state
            });
        });

        return devices;
    }

    /**
     * Select and start listening to a MIDI input device
     */
    selectInput(deviceId) {
        // Stop current input if any
        if (this.selectedInput) {
            this.selectedInput.onmidimessage = null;
        }

        // Clear active notes
        this.activeNotes.clear();

        // Find and select new input
        const input = this.midiAccess.inputs.get(deviceId);
        if (!input) {
            console.error('MIDI input device not found:', deviceId);
            return false;
        }

        this.selectedInput = input;
        this.selectedInput.onmidimessage = (message) => this.handleMidiMessage(message);
        console.log('Selected MIDI input:', input.name);

        return true;
    }

    /**
     * Handle incoming MIDI messages
     */
    handleMidiMessage(message) {
        const [status, note, velocity] = message.data;
        const command = status & 0xf0;

        switch (command) {
            case 0x90: // Note On
                if (velocity > 0) {
                    this.noteOn(note, velocity);
                } else {
                    this.noteOff(note);
                }
                break;
            case 0x80: // Note Off
                this.noteOff(note);
                break;
        }
    }

    /**
     * Handle note on event
     */
    noteOn(midiNote, velocity) {
        const noteInfo = this.midiNoteToNoteName(midiNote);
        this.activeNotes.set(midiNote, {
            note: noteInfo.note,
            octave: noteInfo.octave,
            velocity: velocity
        });

        // Trigger callback if set
        if (this.onNotesChange) {
            this.onNotesChange(this.getActiveNotes());
        }
    }

    /**
     * Handle note off event
     */
    noteOff(midiNote) {
        this.activeNotes.delete(midiNote);

        // Trigger callback if set
        if (this.onNotesChange) {
            this.onNotesChange(this.getActiveNotes());
        }
    }

    /**
     * Convert MIDI note number to note name and octave
     */
    midiNoteToNoteName(midiNote) {
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        const octave = Math.floor(midiNote / 12) - 1;
        const noteName = noteNames[midiNote % 12];

        return {
            note: noteName,
            octave: octave
        };
    }

    /**
     * Get currently active notes in the format expected by ChordDetector
     */
    getActiveNotes() {
        return Array.from(this.activeNotes.values())
            .map(noteInfo => ({
                note: noteInfo.note,
                octave: noteInfo.octave
            }));
    }

    /**
     * Stop listening to MIDI input
     */
    stop() {
        if (this.selectedInput) {
            this.selectedInput.onmidimessage = null;
        }
        this.activeNotes.clear();
    }

    /**
     * Check if Web MIDI API is supported
     */
    static isSupported() {
        return !!navigator.requestMIDIAccess;
    }
}
