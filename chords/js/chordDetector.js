/**
 * Chord detection module
 * Identifies chords from detected notes and provides progression suggestions
 */

import { chordTypes, chordProgressions } from './config.js';

export class ChordDetector {
    constructor() {
        this.lastDetectedChord = null;
    }

    /**
     * Identify chord from detected notes
     * @param {Array} notes - Array of note objects with noteIndex property
     * @returns {Object|null} Chord object with root, type, name, and confidence
     */
    identifyChord(notes) {
        if (notes.length < 2) return null;

        const noteIndices = notes.map(n => n.noteIndex);
        const uniqueIndices = [...new Set(noteIndices)].sort((a, b) => a - b);

        if (uniqueIndices.length < 2) return null;

        // Try each note as potential root
        for (let rootIdx of uniqueIndices) {
            for (let [chordName, intervals] of Object.entries(chordTypes)) {
                const chordNotes = intervals.map(interval => (rootIdx + interval) % 12);

                const matches = chordNotes.filter(cn =>
                    uniqueIndices.some(ui => ui === cn)
                );

                if (matches.length >= Math.min(3, intervals.length)) {
                    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
                    const rootNote = noteNames[rootIdx];
                    const confidence = (matches.length / intervals.length) * 100;

                    const chord = {
                        root: rootNote,
                        type: chordName,
                        name: this.formatChordName(rootNote, chordName),
                        confidence: confidence
                    };

                    this.lastDetectedChord = chord;
                    return chord;
                }
            }
        }

        return null;
    }

    /**
     * Format chord name from root and type
     */
    formatChordName(root, chordType) {
        if (chordType === 'major') {
            return root;
        } else if (chordType === 'minor') {
            return root + 'm';
        } else {
            return root + chordType;
        }
    }

    /**
     * Get chord progression suggestions for a given chord
     * @param {Object} chord - Chord object with name property
     * @returns {Array} Array of suggested chord names
     */
    getSuggestions(chord) {
        if (!chord) return [];

        const suggestions = chordProgressions[chord.name] || [];

        if (suggestions.length === 0) {
            // Generate generic suggestions based on music theory
            const root = chord.root;
            const isMinor = chord.type === 'minor';

            // Common progressions
            return isMinor ?
                [root, 'Relative Major', 'iv', 'V'] :
                [root, 'IV', 'V', 'vi', 'ii'];
        }

        return suggestions;
    }

    /**
     * Get last detected chord
     */
    getLastChord() {
        return this.lastDetectedChord;
    }
}
