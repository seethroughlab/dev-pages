/**
 * Configuration and constants for chord analyzer
 */

// Note frequency mapping (A4 = 440Hz)
// Each note has frequencies across multiple octaves
export const noteFrequencies = {
    'C': [16.35, 32.70, 65.41, 130.81, 261.63, 523.25, 1046.50, 2093.00],
    'C#': [17.32, 34.65, 69.30, 138.59, 277.18, 554.37, 1108.73, 2217.46],
    'D': [18.35, 36.71, 73.42, 146.83, 293.66, 587.33, 1174.66, 2349.32],
    'D#': [19.45, 38.89, 77.78, 155.56, 311.13, 622.25, 1244.51, 2489.02],
    'E': [20.60, 41.20, 82.41, 164.81, 329.63, 659.25, 1318.51, 2637.02],
    'F': [21.83, 43.65, 87.31, 174.61, 349.23, 698.46, 1396.91, 2793.83],
    'F#': [23.12, 46.25, 92.50, 185.00, 369.99, 739.99, 1479.98, 2959.96],
    'G': [24.50, 49.00, 98.00, 196.00, 392.00, 783.99, 1567.98, 3135.96],
    'G#': [25.96, 51.91, 103.83, 207.65, 415.30, 830.61, 1661.22, 3322.44],
    'A': [27.50, 55.00, 110.00, 220.00, 440.00, 880.00, 1760.00, 3520.00],
    'A#': [29.14, 58.27, 116.54, 233.08, 466.16, 932.33, 1864.66, 3729.31],
    'B': [30.87, 61.74, 123.47, 246.94, 493.88, 987.77, 1975.53, 3951.07]
};

// Chord definitions (intervals from root in semitones)
export const chordTypes = {
    'major': [0, 4, 7],
    'minor': [0, 3, 7],
    'dim': [0, 3, 6],
    'aug': [0, 4, 8],
    'sus2': [0, 2, 7],
    'sus4': [0, 5, 7],
    '7': [0, 4, 7, 10],
    'maj7': [0, 4, 7, 11],
    'min7': [0, 3, 7, 10],
    '6': [0, 4, 7, 9],
    'min6': [0, 3, 7, 9]
};

// Common chord progressions for suggestions
// Each progression includes the chord and the emotional feeling it creates
export const chordProgressions = {
    'C': [
        { chord: 'F', feeling: 'warm and stable' },
        { chord: 'G', feeling: 'bright and resolved' },
        { chord: 'Am', feeling: 'melancholic' },
        { chord: 'Dm', feeling: 'contemplative' },
        { chord: 'Em', feeling: 'bittersweet' }
    ],
    'Cm': [
        { chord: 'Fm', feeling: 'deeper darkness' },
        { chord: 'Gm', feeling: 'tense and yearning' },
        { chord: 'Ab', feeling: 'hopeful relief' },
        { chord: 'Bb', feeling: 'lifting spirit' },
        { chord: 'Eb', feeling: 'warm embrace' }
    ],
    'D': [
        { chord: 'G', feeling: 'bright and open' },
        { chord: 'A', feeling: 'triumphant' },
        { chord: 'Bm', feeling: 'wistful longing' },
        { chord: 'Em', feeling: 'gentle sadness' },
        { chord: 'F#m', feeling: 'mysterious' }
    ],
    'Dm': [
        { chord: 'Gm', feeling: 'brooding depth' },
        { chord: 'Am', feeling: 'somber reflection' },
        { chord: 'Bb', feeling: 'comforting warmth' },
        { chord: 'C', feeling: 'hopeful emergence' },
        { chord: 'F', feeling: 'peaceful resolution' }
    ],
    'E': [
        { chord: 'A', feeling: 'powerful and bold' },
        { chord: 'B', feeling: 'soaring energy' },
        { chord: 'C#m', feeling: 'passionate longing' },
        { chord: 'F#m', feeling: 'introspective' },
        { chord: 'G#m', feeling: 'dramatic tension' }
    ],
    'Em': [
        { chord: 'Am', feeling: 'deepening sorrow' },
        { chord: 'Bm', feeling: 'wistful nostalgia' },
        { chord: 'C', feeling: 'gentle comfort' },
        { chord: 'D', feeling: 'emerging hope' },
        { chord: 'G', feeling: 'bright resolution' }
    ],
    'F': [
        { chord: 'Bb', feeling: 'rich and full' },
        { chord: 'C', feeling: 'uplifting' },
        { chord: 'Dm', feeling: 'tender yearning' },
        { chord: 'Gm', feeling: 'dramatic depth' },
        { chord: 'Am', feeling: 'sweet sadness' }
    ],
    'Fm': [
        { chord: 'Bbm', feeling: 'heavy melancholy' },
        { chord: 'Cm', feeling: 'somber mood' },
        { chord: 'Db', feeling: 'ethereal beauty' },
        { chord: 'Eb', feeling: 'warm light' },
        { chord: 'Ab', feeling: 'smooth comfort' }
    ],
    'G': [
        { chord: 'C', feeling: 'classic and stable' },
        { chord: 'D', feeling: 'confident stride' },
        { chord: 'Em', feeling: 'romantic melancholy' },
        { chord: 'Am', feeling: 'thoughtful turn' },
        { chord: 'Bm', feeling: 'introspective' }
    ],
    'Gm': [
        { chord: 'Cm', feeling: 'deeper sadness' },
        { chord: 'Dm', feeling: 'brooding intensity' },
        { chord: 'Eb', feeling: 'comforting glow' },
        { chord: 'F', feeling: 'hopeful lift' },
        { chord: 'Bb', feeling: 'resolving warmth' }
    ],
    'A': [
        { chord: 'D', feeling: 'strong and clear' },
        { chord: 'E', feeling: 'energetic drive' },
        { chord: 'F#m', feeling: 'sweet melancholy' },
        { chord: 'Bm', feeling: 'contemplative' },
        { chord: 'C#m', feeling: 'passionate depth' }
    ],
    'Am': [
        { chord: 'Dm', feeling: 'deeper introspection' },
        { chord: 'Em', feeling: 'quiet sadness' },
        { chord: 'F', feeling: 'gentle warmth' },
        { chord: 'G', feeling: 'hopeful rise' },
        { chord: 'C', feeling: 'peaceful return' }
    ],
    'B': [
        { chord: 'E', feeling: 'bright and bold' },
        { chord: 'F#', feeling: 'intense energy' },
        { chord: 'G#m', feeling: 'passionate drama' },
        { chord: 'C#m', feeling: 'deep emotion' },
        { chord: 'D#m', feeling: 'mysterious allure' }
    ],
    'Bm': [
        { chord: 'Em', feeling: 'gentle sorrow' },
        { chord: 'F#m', feeling: 'wistful beauty' },
        { chord: 'G', feeling: 'comforting resolve' },
        { chord: 'A', feeling: 'confident lift' },
        { chord: 'D', feeling: 'bright resolution' }
    ]
};

// Analyser configuration
export const FFT_SIZE = 4096;
export const SMOOTHING_TIME_CONSTANT = 0.8;

// Detection thresholds
export const FREQUENCY_THRESHOLD = 0.3; // Minimum amplitude to consider a frequency
export const NOTE_CONFIDENCE_THRESHOLD = 0.6; // Minimum confidence for note detection
