/**
 * Key Manager - Musical key system with Camelot Wheel for harmonic mixing
 *
 * Manages musical keys and automatic key changes following the Camelot Wheel
 * Each trigger zone uses 2 octaves of a musical scale (16 notes = 8 scale degrees × 2)
 */

export class KeyManager {
  constructor(clockManager) {
    this.clockManager = clockManager;
    this.currentKey = '8A'; // Start with A minor (8A)
    this.autoChangeEnabled = true;
    this.barsUntilChange = 16; // Change key every 16 bars by default
    this.currentBar = 0;

    // Define all 24 Camelot Wheel keys
    this.camelotWheel = {
      '1A': { name: 'Ab minor', root: 68, scale: 'minor' },  // Ab = G#
      '1B': { name: 'B major', root: 71, scale: 'major' },
      '2A': { name: 'Eb minor', root: 63, scale: 'minor' },
      '2B': { name: 'Gb major', root: 66, scale: 'major' },  // Gb = F#
      '3A': { name: 'Bb minor', root: 70, scale: 'minor' },
      '3B': { name: 'Db major', root: 61, scale: 'major' },  // Db = C#
      '4A': { name: 'F minor', root: 65, scale: 'minor' },
      '4B': { name: 'Ab major', root: 68, scale: 'major' },
      '5A': { name: 'C minor', root: 60, scale: 'minor' },
      '5B': { name: 'Eb major', root: 63, scale: 'major' },
      '6A': { name: 'G minor', root: 67, scale: 'minor' },
      '6B': { name: 'Bb major', root: 70, scale: 'major' },
      '7A': { name: 'D minor', root: 62, scale: 'minor' },
      '7B': { name: 'F major', root: 65, scale: 'major' },
      '8A': { name: 'A minor', root: 69, scale: 'minor' },  // C4 = 60, A3 = 57, A4 = 69
      '8B': { name: 'C major', root: 60, scale: 'major' },
      '9A': { name: 'E minor', root: 64, scale: 'minor' },
      '9B': { name: 'G major', root: 67, scale: 'major' },
      '10A': { name: 'B minor', root: 71, scale: 'minor' },
      '10B': { name: 'D major', root: 62, scale: 'major' },
      '11A': { name: 'F# minor', root: 66, scale: 'minor' },
      '11B': { name: 'A major', root: 69, scale: 'major' },
      '12A': { name: 'Db minor', root: 61, scale: 'minor' },  // Db = C#
      '12B': { name: 'E major', root: 64, scale: 'major' }
    };

    // Scale intervals in semitones from root
    this.scaleIntervals = {
      major: [0, 2, 4, 5, 7, 9, 11, 12],    // Major scale
      minor: [0, 2, 3, 5, 7, 8, 10, 12]     // Natural minor scale
    };

    // Set up clock callback for automatic key changes
    if (this.clockManager) {
      this.clockManager.onBar = (barCount) => {
        this.currentBar = barCount;
        if (this.autoChangeEnabled && barCount % this.barsUntilChange === 0 && barCount > 0) {
          this.changeToCompatibleKey();
        }
      };
    }

    console.log(`[Key] Initialized with key: ${this.currentKey} (${this.getCurrentKeyInfo().name})`);
  }

  /**
   * Get current key information
   */
  getCurrentKeyInfo() {
    return this.camelotWheel[this.currentKey];
  }

  /**
   * Get MIDI note number for a scale degree in the current key
   * @param {number} scaleDegree - Scale degree (0-15 for 2 octaves, where 0-7 is first octave, 8-15 is second)
   * @param {number} octaveOffset - Additional octave offset (default 0)
   * @returns {number} MIDI note number
   */
  getNote(scaleDegree, octaveOffset = 0) {
    const keyInfo = this.getCurrentKeyInfo();
    const scale = this.scaleIntervals[keyInfo.scale];

    // Determine which octave we're in
    const octave = Math.floor(scaleDegree / 8);
    const degreeInOctave = scaleDegree % 8;

    // Get the interval for this scale degree
    const interval = scale[degreeInOctave];

    // Calculate final MIDI note
    const midiNote = keyInfo.root + interval + (octave * 12) + (octaveOffset * 12);

    return midiNote;
  }

  /**
   * Set the current key
   */
  setKey(camelotPosition) {
    if (!this.camelotWheel[camelotPosition]) {
      console.error(`[Key] Invalid Camelot position: ${camelotPosition}`);
      return false;
    }

    const oldKey = this.currentKey;
    this.currentKey = camelotPosition;
    const keyInfo = this.getCurrentKeyInfo();

    console.log(`[Key] Changed: ${oldKey} → ${this.currentKey} (${keyInfo.name})`);

    return true;
  }

  /**
   * Get compatible keys for the current key (Camelot Wheel rules)
   */
  getCompatibleKeys() {
    const current = this.currentKey;
    const number = parseInt(current.substring(0, current.length - 1));
    const letter = current.charAt(current.length - 1);

    const compatible = [];

    // Same number, opposite letter (relative major/minor)
    const oppositeLetter = letter === 'A' ? 'B' : 'A';
    compatible.push(`${number}${oppositeLetter}`);

    // ±1 number, same letter (harmonic mixing)
    const prevNum = number === 1 ? 12 : number - 1;
    const nextNum = number === 12 ? 1 : number + 1;
    compatible.push(`${prevNum}${letter}`);
    compatible.push(`${nextNum}${letter}`);

    // ±3 for energy shifts (optional, more dramatic)
    const minus3 = number - 3 <= 0 ? number - 3 + 12 : number - 3;
    const plus3 = number + 3 > 12 ? number + 3 - 12 : number + 3;
    compatible.push(`${minus3}${letter}`);
    compatible.push(`${plus3}${letter}`);

    return compatible;
  }

  /**
   * Change to a random compatible key
   */
  changeToCompatibleKey() {
    const compatible = this.getCompatibleKeys();

    // Weighted selection - prefer ±1 and relative major/minor over ±3
    const weights = [3, 2, 2, 1, 1]; // First 3 are more common transitions
    const weightedList = [];

    compatible.forEach((key, index) => {
      for (let i = 0; i < weights[index]; i++) {
        weightedList.push(key);
      }
    });

    const randomKey = weightedList[Math.floor(Math.random() * weightedList.length)];
    this.setKey(randomKey);
  }

  /**
   * Get all Camelot positions for dropdown
   */
  getAllKeys() {
    return Object.keys(this.camelotWheel).map(key => ({
      value: key,
      label: `${key} - ${this.camelotWheel[key].name}`
    }));
  }

  /**
   * Set auto-change interval
   */
  setAutoChangeInterval(bars) {
    this.barsUntilChange = bars;
    console.log(`[Key] Auto-change interval set to ${bars} bars`);
  }

  /**
   * Enable/disable auto key changes
   */
  setAutoChangeEnabled(enabled) {
    this.autoChangeEnabled = enabled;
    console.log(`[Key] Auto-change ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get info for display
   */
  getInfo() {
    const keyInfo = this.getCurrentKeyInfo();
    const compatible = this.getCompatibleKeys();

    return {
      currentKey: this.currentKey,
      keyName: keyInfo.name,
      scale: keyInfo.scale,
      root: keyInfo.root,
      compatible: compatible,
      barsUntilChange: this.autoChangeEnabled ? (this.barsUntilChange - (this.currentBar % this.barsUntilChange)) : 'Off',
      autoChangeEnabled: this.autoChangeEnabled
    };
  }
}
