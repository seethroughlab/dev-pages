/**
 * Chord Manager - Chord progression system independent of key changes
 *
 * Manages chord progressions (I, ii, iii, IV, V, vi, vii°) that change every N bars.
 * Works in conjunction with KeyManager to create harmonic movement:
 * - Chords change more frequently (e.g., every 8 bars)
 * - Keys change less frequently (e.g., every 12-24 bars)
 */

export class ChordManager {
  constructor(clockManager) {
    this.clockManager = clockManager;
    this.currentChordIndex = 0;
    this.autoChangeEnabled = true;
    this.barsUntilChange = 8; // Change chord every 8 bars by default
    this.currentBar = 0;

    // Define chord progressions with extended tones (7ths, 9ths, 11ths, 13ths)
    // Scale degrees in major/minor scale: 0=root, 1=2nd, 2=3rd, 3=4th, 4=5th, 5=6th, 6=7th, 7=octave
    this.progressions = {
      'I-V-vi-IV': [
        { name: 'I', root: 0, third: 2, fifth: 4, seventh: 6, ninth: 1, eleventh: 3, thirteenth: 5 },
        { name: 'V', root: 4, third: 6, fifth: 8, seventh: 10, ninth: 5, eleventh: 7, thirteenth: 9 },
        { name: 'vi', root: 5, third: 7, fifth: 9, seventh: 11, ninth: 6, eleventh: 8, thirteenth: 10 },
        { name: 'IV', root: 3, third: 5, fifth: 7, seventh: 9, ninth: 4, eleventh: 6, thirteenth: 8 }
      ],
      'I-IV-V-I': [
        { name: 'I', root: 0, third: 2, fifth: 4, seventh: 6, ninth: 1, eleventh: 3, thirteenth: 5 },
        { name: 'IV', root: 3, third: 5, fifth: 7, seventh: 9, ninth: 4, eleventh: 6, thirteenth: 8 },
        { name: 'V', root: 4, third: 6, fifth: 8, seventh: 10, ninth: 5, eleventh: 7, thirteenth: 9 },
        { name: 'I', root: 0, third: 2, fifth: 4, seventh: 6, ninth: 1, eleventh: 3, thirteenth: 5 }
      ],
      'I-vi-IV-V': [
        { name: 'I', root: 0, third: 2, fifth: 4, seventh: 6, ninth: 1, eleventh: 3, thirteenth: 5 },
        { name: 'vi', root: 5, third: 7, fifth: 9, seventh: 11, ninth: 6, eleventh: 8, thirteenth: 10 },
        { name: 'IV', root: 3, third: 5, fifth: 7, seventh: 9, ninth: 4, eleventh: 6, thirteenth: 8 },
        { name: 'V', root: 4, third: 6, fifth: 8, seventh: 10, ninth: 5, eleventh: 7, thirteenth: 9 }
      ],
      'I-IV-vi-V': [
        { name: 'I', root: 0, third: 2, fifth: 4, seventh: 6, ninth: 1, eleventh: 3, thirteenth: 5 },
        { name: 'IV', root: 3, third: 5, fifth: 7, seventh: 9, ninth: 4, eleventh: 6, thirteenth: 8 },
        { name: 'vi', root: 5, third: 7, fifth: 9, seventh: 11, ninth: 6, eleventh: 8, thirteenth: 10 },
        { name: 'V', root: 4, third: 6, fifth: 8, seventh: 10, ninth: 5, eleventh: 7, thirteenth: 9 }
      ],
      'I-V-IV-V': [
        { name: 'I', root: 0, third: 2, fifth: 4, seventh: 6, ninth: 1, eleventh: 3, thirteenth: 5 },
        { name: 'V', root: 4, third: 6, fifth: 8, seventh: 10, ninth: 5, eleventh: 7, thirteenth: 9 },
        { name: 'IV', root: 3, third: 5, fifth: 7, seventh: 9, ninth: 4, eleventh: 6, thirteenth: 8 },
        { name: 'V', root: 4, third: 6, fifth: 8, seventh: 10, ninth: 5, eleventh: 7, thirteenth: 9 }
      ]
    };

    this.currentProgressionName = 'I-V-vi-IV';
    this.currentProgression = this.progressions[this.currentProgressionName];

    // Set up clock callback for automatic chord changes
    if (this.clockManager) {
      this.clockManager.onBar = (barCount) => {
        this.currentBar = barCount;
        if (this.autoChangeEnabled && barCount % this.barsUntilChange === 0 && barCount > 0) {
          this.changeToNextChord();
        }
      };
    }

    console.log(`[Chord] Initialized with progression: ${this.currentProgressionName}`);
    console.log(`[Chord] Starting chord: ${this.getCurrentChord().name}`);
  }

  /**
   * Get current chord definition
   */
  getCurrentChord() {
    return this.currentProgression[this.currentChordIndex];
  }

  /**
   * Generate scale degree patterns for each zone based on current chord
   * Returns patterns for bass, pads, and lead zones (16 triggers each)
   * Now includes extended chord tones (7ths, 9ths, 11ths, 13ths) and 2+ octaves
   */
  getChordPatterns() {
    const chord = this.getCurrentChord();
    const { root, third, fifth, seventh, ninth, eleventh, thirteenth } = chord;

    // Create multiple octaves for variety
    const rootOct2 = root + 8;
    const thirdOct2 = third + 8;
    const fifthOct2 = fifth + 8;
    const seventhOct2 = seventh + 8;
    const ninthOct2 = ninth + 8;

    return {
      // BASS ZONE: Roots, fifths, octaves with some 7ths for color
      // More varied rhythm with octave jumps and walking bass feel
      bass: [
        root, fifth, root, seventh,         // Root-fifth with 7th color
        rootOct2, fifth, root, rootOct2,    // Octave jump pattern
        root, fifth, seventh, rootOct2,     // Walking up with 7th
        fifth, rootOct2, root, fifth        // Descending with octaves
      ],

      // PADS ZONE: Rich voicings with 7ths, 9ths, 11ths across 2 octaves
      // Sustaining pad sounds benefit from extended harmony
      pads: [
        root, third, fifth, seventh,        // Basic 7th chord
        ninth, fifth, seventh, rootOct2,    // Add 9th, move up
        thirdOct2, seventh, ninth, eleventh, // Upper extensions
        fifth, seventh, ninth, thirteenth,  // Rich 13th voicing
      ],

      // LEAD ZONE: Melodic lines using 3rds, 5ths, 7ths, 9ths, 11ths, 13ths
      // More melodic movement across 2+ octaves
      lead: [
        ninth, third, fifth, seventh,       // Start with color tone (9th)
        rootOct2, ninth, eleventh, seventh, // Extensions + octave
        thirteenth, ninthOct2, seventh, fifth, // Upper register descending
        eleventh, ninth, thirdOct2, rootOct2 // Back to chord tones higher
      ]
    };
  }

  /**
   * Change to the next chord in the progression
   */
  changeToNextChord() {
    this.currentChordIndex = (this.currentChordIndex + 1) % this.currentProgression.length;
    const chord = this.getCurrentChord();

    console.log(`[Chord] Changed to: ${chord.name} (${this.currentChordIndex + 1}/${this.currentProgression.length})`);
    console.log(`[Chord] Scale degrees - Root:${chord.root} 3rd:${chord.third} 5th:${chord.fifth} 7th:${chord.seventh}`);
    console.log(`[Chord] Extensions - 9th:${chord.ninth} 11th:${chord.eleventh} 13th:${chord.thirteenth}`);

    return chord;
  }

  /**
   * Manually advance to next chord
   */
  manualNextChord() {
    return this.changeToNextChord();
  }

  /**
   * Set the progression
   */
  setProgression(progressionName) {
    if (!this.progressions[progressionName]) {
      console.error(`[Chord] Unknown progression: ${progressionName}`);
      return false;
    }

    this.currentProgressionName = progressionName;
    this.currentProgression = this.progressions[progressionName];
    this.currentChordIndex = 0; // Reset to first chord

    console.log(`[Chord] Progression set to: ${progressionName}`);
    console.log(`[Chord] Starting with: ${this.getCurrentChord().name}`);

    return true;
  }

  /**
   * Set auto-change interval
   */
  setAutoChangeInterval(bars) {
    this.barsUntilChange = bars;
    console.log(`[Chord] Auto-change interval set to ${bars} bars`);
  }

  /**
   * Enable/disable auto chord changes
   */
  setAutoChangeEnabled(enabled) {
    this.autoChangeEnabled = enabled;
    console.log(`[Chord] Auto-change ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get all available progressions
   */
  getProgressionNames() {
    return Object.keys(this.progressions);
  }

  /**
   * Get info for display
   */
  getInfo() {
    const chord = this.getCurrentChord();
    const barsRemaining = this.autoChangeEnabled
      ? (this.barsUntilChange - (this.currentBar % this.barsUntilChange))
      : 'Off';

    return {
      currentChord: chord.name,
      chordPosition: `${this.currentChordIndex + 1}/${this.currentProgression.length}`,
      progression: this.currentProgressionName,
      barsUntilChange: barsRemaining,
      autoChangeEnabled: this.autoChangeEnabled
    };
  }
}
