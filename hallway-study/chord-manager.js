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

    // Define chord progressions - Pop/Accessible style
    // Only the most popular and recognizable pop progressions using I, IV, V, vi
    // Scale degrees in major/minor scale: 0=root, 1=2nd, 2=3rd, 3=4th, 4=5th, 5=6th, 6=7th, 7=octave
    this.progressions = {
      'I-V-vi-IV': [
        { name: 'I', root: 0, third: 2, fifth: 4, seventh: 6, ninth: 1, eleventh: 3, thirteenth: 5 },
        { name: 'V', root: 4, third: 6, fifth: 8, seventh: 10, ninth: 5, eleventh: 7, thirteenth: 9 },
        { name: 'vi', root: 5, third: 7, fifth: 9, seventh: 11, ninth: 6, eleventh: 8, thirteenth: 10 },
        { name: 'IV', root: 3, third: 5, fifth: 7, seventh: 9, ninth: 4, eleventh: 6, thirteenth: 8 }
      ],
      'vi-IV-I-V': [
        { name: 'vi', root: 5, third: 7, fifth: 9, seventh: 11, ninth: 6, eleventh: 8, thirteenth: 10 },
        { name: 'IV', root: 3, third: 5, fifth: 7, seventh: 9, ninth: 4, eleventh: 6, thirteenth: 8 },
        { name: 'I', root: 0, third: 2, fifth: 4, seventh: 6, ninth: 1, eleventh: 3, thirteenth: 5 },
        { name: 'V', root: 4, third: 6, fifth: 8, seventh: 10, ninth: 5, eleventh: 7, thirteenth: 9 }
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

    // Start with random progression and random chord within it
    const progressionNames = Object.keys(this.progressions);
    this.currentProgressionName = progressionNames[Math.floor(Math.random() * progressionNames.length)];
    this.currentProgression = this.progressions[this.currentProgressionName];
    this.currentChordIndex = Math.floor(Math.random() * this.currentProgression.length);

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
   * Pop/Accessible style: Clear melodies, simple harmonies, emphasize roots and 5ths
   *
   * Each pattern also includes:
   * - weight: probability multiplier (0.0-1.0) for each note
   * - restChance: probability this trigger doesn't fire (creates musical space)
   */
  getChordPatterns() {
    const chord = this.getCurrentChord();
    const { root, third, fifth } = chord;

    // Create second octave for variety
    const rootOct2 = root + 8;
    const thirdOct2 = third + 8;
    const fifthOct2 = fifth + 8;

    return {
      // BASS ZONE: Strong roots and fifths, walking bass lines
      // Pop style: Emphasize root on downbeats, fifths for movement
      bass: {
        notes: [
          root, root, fifth, root,           // Root emphasis (beats 1-4)
          root, fifth, root, fifth,           // Root-fifth alternation (beats 5-8)
          root, third, fifth, fifth,          // Walk up to fifth (beats 9-12)
          fifth, root, root, root             // Resolve to root (beats 13-16)
        ],
        weights: [
          1.0, 0.9, 0.8, 0.9,                 // Strong roots
          1.0, 0.7, 0.9, 0.7,                 // Alternate strength
          1.0, 0.6, 0.8, 0.8,                 // Third is subtle
          0.7, 0.9, 1.0, 1.0                  // Strong resolution
        ],
        restChance: 0.25  // 25% chance of rest for breathing room
      },

      // PADS ZONE: Simple triads, sustaining harmonies
      // Pop style: Root, third, fifth - classic major/minor triads
      pads: {
        notes: [
          root, third, fifth, third,          // Basic triad (beats 1-4)
          fifth, root, third, fifth,          // Triad inversion (beats 5-8)
          rootOct2, fifth, third, root,       // Upper voicing (beats 9-12)
          fifth, thirdOct2, fifth, root       // Return to root (beats 13-16)
        ],
        weights: [
          1.0, 0.8, 0.9, 0.8,                 // Balanced triad
          0.9, 1.0, 0.8, 0.9,                 // Root strong
          0.8, 0.9, 0.8, 1.0,                 // Upper register
          0.9, 0.7, 0.9, 1.0                  // Resolve to root
        ],
        restChance: 0.35  // 35% chance of rest - pads need space
      },

      // LEAD ZONE: Melodic stepwise lines, singable melodies
      // Pop style: Memorable hooks, stepwise motion, clear contour
      lead: {
        notes: [
          fifth, fifth, third, root,          // Descending melody (beats 1-4)
          third, fifth, fifth, third,         // Up and down (beats 5-8)
          fifth, fifthOct2, fifth, third,     // Octave jump (beats 9-12)
          root, third, fifth, rootOct2        // Ascending resolution (beats 13-16)
        ],
        weights: [
          0.9, 0.8, 0.9, 1.0,                 // Clear descending line
          0.8, 0.9, 0.7, 0.8,                 // Movement
          0.8, 0.6, 0.8, 0.9,                 // Octave as ornament
          1.0, 0.8, 0.9, 0.7                  // Resolve strong to root
        ],
        restChance: 0.40  // 40% chance of rest - melodies need space
      }
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

    // Build progression string with active chord highlighted
    const progressionWithHighlight = this.currentProgression
      .map((c, i) => i === this.currentChordIndex ? `[${c.name}]` : c.name)
      .join(' - ');

    return {
      currentChord: chord.name,
      chordPosition: `${this.currentChordIndex + 1}/${this.currentProgression.length}`,
      progressionDisplay: progressionWithHighlight,
      progression: this.currentProgressionName,
      barsUntilChange: barsRemaining,
      autoChangeEnabled: this.autoChangeEnabled
    };
  }
}
