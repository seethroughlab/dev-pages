/**
 * Configuration - Musical scales and parameters
 */

// Musical scales (semitone offsets from root note)
export const scales = {
    pentatonic: [0, 2, 4, 7, 9],
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10]
};

// Composer styles define note characteristics
export const composers = {
    mozart: { name: 'Mozart', noteLength: [0.125, 0.25, 0.5], restChance: 0.1, octaveRange: [0, 1] },
    debussy: { name: 'Debussy', noteLength: [0.5, 1, 2], restChance: 0.3, octaveRange: [-1, 1] },
    sweelinck: { name: 'Sweelinck', noteLength: [0.25, 0.5, 1], restChance: 0.2, octaveRange: [0, 1] },
    aphextwin: { name: 'Aphex Twin', noteLength: [0.0625, 0.125, 0.25], restChance: 0.05, octaveRange: [-2, 2] },
    cage: { name: 'John Cage', noteLength: [1, 2, 4], restChance: 0.7, octaveRange: [-1, 2] },
    reich: { name: 'Steve Reich', noteLength: [0.125, 0.125, 0.25], restChance: 0.1, octaveRange: [0, 1] },
    glass: { name: 'Philip Glass', noteLength: [0.25, 0.25, 0.5], restChance: 0.15, octaveRange: [0, 1] },
    richter: { name: 'Max Richter', noteLength: [0.5, 1, 2], restChance: 0.25, octaveRange: [-1, 1] },
    part: { name: 'Arvo Pärt', noteLength: [1, 2, 3], restChance: 0.4, octaveRange: [-1, 0] }
};

// Base frequency (C4 = middle C)
export const BASE_FREQ = 261.63;
