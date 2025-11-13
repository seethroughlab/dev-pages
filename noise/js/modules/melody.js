/**
 * Melody module - Handles melody generation and playback
 */

import { getState } from './state.js';
import { scales, composers, BASE_FREQ } from './config.js';

// Tone.js synth instances
let toneCinematicKeys = null;
let toneWarmPad = null;
let toneEtherealStrings = null;
let toneDeepBassDrone = null;
let toneMelodyEffects = null;
let toneBassLine = null;

// Filter references
let toneFilters = {};

// Melody tracking
let melodyInstrumentCounter = 0;
let melodyScheduleTimeoutId = null;

/**
 * Initialize Tone.js instruments
 */
export async function initMelodyInstruments() {
    console.log('[Melody] Initializing melody instruments...');
    
    if (typeof Tone === 'undefined') {
        console.error('[Melody] Tone.js not loaded');
        return false;
    }
    
    try {
        const state = getState();
        
        // Create melody effects chain
        const melodyReverb = new Tone.Reverb({
            decay: 3,
            wet: state.melodyReverbMixValue
        });
        
        const melodyDelayNode = new Tone.FeedbackDelay({
            delayTime: state.melodyDelayTimeValue,
            feedback: state.melodyDelayFeedbackValue,
            wet: state.melodyDelayMixValue
        });
        
        // Chain melody effects
        toneMelodyEffects = new Tone.Gain(state.melodyVolumeValue);
        melodyDelayNode.connect(melodyReverb);
        melodyReverb.toDestination();
        toneMelodyEffects.connect(melodyDelayNode);
        
        // Store effect references
        window.toneEffects = {
            melodyReverb,
            melodyDelay: melodyDelayNode
        };
        
        // Create Cinematic Keys synth
        toneCinematicKeys = new Tone.PolySynth(Tone.Synth, {
            oscillator: {
                type: "triangle"
            },
            envelope: {
                attack: state.melodyAttackValue,
                decay: state.melodyDecayValue,
                sustain: state.melodySustainValue * 0.7,
                release: state.melodyReleaseValue
            },
            filterEnvelope: {
                attack: state.melodyAttackValue,
                decay: state.filterDecayValue,
                sustain: 0.3,
                release: state.melodyReleaseValue,
                baseFrequency: 150,
                octaves: 2.5,
                exponent: 2
            },
            volume: -6
        }).connect(toneMelodyEffects);
        
        // Create filter for Cinematic Keys
        const cinematicFilter = new Tone.Filter({
            frequency: Math.min(state.filterCutoffValue, 1500),
            type: "lowpass",
            Q: Math.min(state.filterResonanceValue, 5),
            rolloff: -24
        });
        toneCinematicKeys.disconnect();
        toneCinematicKeys.chain(cinematicFilter, toneMelodyEffects);
        toneFilters.cinematic = cinematicFilter;
        
        // Create Warm Pad synth
        toneWarmPad = new Tone.PolySynth(Tone.Synth, {
            oscillator: {
                type: "sine"
            },
            envelope: {
                attack: state.warmPadAttackValue,
                decay: state.warmPadDecayValue,
                sustain: state.warmPadSustainValue,
                release: state.warmPadReleaseValue
            },
            filterEnvelope: {
                attack: state.warmPadAttackValue,
                decay: state.warmPadFilterDecayValue,
                sustain: 0.5,
                release: state.warmPadReleaseValue,
                baseFrequency: 100,
                octaves: 2.5,
                exponent: 2
            }
        }).connect(toneMelodyEffects);
        
        // Create filters for Warm Pad
        const warmLowpass = new Tone.Filter({
            frequency: state.warmPadCutoffValue,
            type: "lowpass",
            Q: state.warmPadResonanceValue
        });
        const warmHighpass = new Tone.Filter({
            frequency: 80,
            type: "highpass",
            Q: 0.7
        });
        toneWarmPad.disconnect();
        toneWarmPad.chain(warmLowpass, warmHighpass, toneMelodyEffects);
        toneFilters.warmLowpass = warmLowpass;
        toneFilters.warmHighpass = warmHighpass;
        
        // Create Ethereal Strings synth
        toneEtherealStrings = new Tone.PolySynth(Tone.Synth, {
            oscillator: {
                type: "sawtooth"
            },
            envelope: {
                attack: state.etherealStringsAttackValue,
                decay: state.etherealStringsDecayValue,
                sustain: state.etherealStringsSustainValue,
                release: state.etherealStringsReleaseValue
            },
            filterEnvelope: {
                attack: state.etherealStringsAttackValue,
                decay: state.etherealStringsFilterDecayValue,
                sustain: 0.6,
                release: state.etherealStringsReleaseValue,
                baseFrequency: 150,
                octaves: 3.5,
                exponent: 2
            }
        }).connect(toneMelodyEffects);
        
        // Create filter for Ethereal Strings
        const etherealFilter = new Tone.Filter({
            frequency: state.etherealStringsCutoffValue,
            type: "lowpass",
            Q: state.etherealStringsResonanceValue
        });
        toneEtherealStrings.disconnect();
        toneEtherealStrings.chain(etherealFilter, toneMelodyEffects);
        toneFilters.ethereal = etherealFilter;
        
        // Create Deep Bass Drone synth
        toneDeepBassDrone = new Tone.PolySynth(Tone.Synth, {
            oscillator: {
                type: "triangle"
            },
            envelope: {
                attack: state.deepBassAttackValue,
                decay: state.deepBassDecayValue,
                sustain: state.deepBassSustainValue,
                release: state.deepBassReleaseValue
            },
            filterEnvelope: {
                attack: state.deepBassAttackValue,
                decay: state.deepBassFilterDecayValue,
                sustain: 0.7,
                release: state.deepBassReleaseValue,
                baseFrequency: 50,
                octaves: 2,
                exponent: 3
            }
        }).connect(toneMelodyEffects);
        
        // Create filters for Deep Bass Drone
        const bassLowpass = new Tone.Filter({
            frequency: state.deepBassCutoffValue,
            type: "lowpass",
            Q: state.deepBassResonanceValue
        });
        const bassHighpass = new Tone.Filter({
            frequency: 30,
            type: "highpass",
            Q: 0.5
        });
        toneDeepBassDrone.disconnect();
        toneDeepBassDrone.chain(bassLowpass, bassHighpass, toneMelodyEffects);
        toneFilters.bassLowpass = bassLowpass;
        toneFilters.bassHighpass = bassHighpass;
        
        // Create Bass Line synth
        toneBassLine = new Tone.MonoSynth({
            oscillator: {
                type: "sawtooth"
            },
            envelope: {
                attack: 0.05,
                decay: 0.1,
                sustain: 0.9,
                release: 0.3
            },
            filterEnvelope: {
                attack: 0.001,
                decay: 0.2,
                sustain: 0.5,
                release: 0.3,
                baseFrequency: 100,
                octaves: 3
            }
        });
        
        // Create bass line volume control
        const bassLineGain = new Tone.Gain(state.bassVolumeValue);
        const bassLineFilter = new Tone.Filter({
            frequency: 300,
            type: "lowpass",
            Q: 2
        });
        toneBassLine.chain(bassLineFilter, toneMelodyEffects);
        toneFilters.bassLine = bassLineFilter;
        
        console.log('[Melody] Melody instruments initialized successfully');
        return true;
    } catch (error) {
        console.error('[Melody] Error initializing melody instruments:', error);
        return false;
    }
}

/**
 * Generate a random melody
 */
async function generateMelody() {
    const state = getState();
    
    // Ensure we have enabled scales and composers
    if (!state.enabledScales || state.enabledScales.length === 0) {
        console.error('[Melody] No enabled scales');
        return { melody: [], bassLine: [], selectedComposer: null, selectedScale: 'minor', selectedForm: 'AABA' };
    }
    
    if (!state.enabledComposers || state.enabledComposers.length === 0) {
        console.error('[Melody] No enabled composers');
        return { melody: [], bassLine: [], selectedComposer: null, selectedScale: 'minor', selectedForm: 'AABA' };
    }
    
    const selectedScaleName = state.enabledScales[Math.floor(Math.random() * state.enabledScales.length)];
    const selectedComposerKey = state.enabledComposers[Math.floor(Math.random() * state.enabledComposers.length)];
    const selectedComposer = composers[selectedComposerKey];
    
    if (!selectedComposer) {
        console.error(`[Melody] Composer not found: ${selectedComposerKey}`);
        return { melody: [], bassLine: [], selectedComposer: null, selectedScale: selectedScaleName, selectedForm: 'AABA' };
    }
    
    console.log(`[Melody] Generating melody in style of ${selectedComposerKey} using ${selectedScaleName} scale`);
    
    const selectedScale = scales[selectedScaleName];
    if (!selectedScale) {
        console.error(`[Melody] Scale not found: ${selectedScaleName}`);
        return { melody: [], bassLine: [], selectedComposer, selectedScale: selectedScaleName, selectedForm: 'AABA' };
    }
    
    // Musical structure parameters
    const notesPerBar = 4;
    const barsPerPhrase = 4;
    const notesPerPhrase = notesPerBar * barsPerPhrase;
    
    // Generate structured melody with AABA or ABAB form
    const forms = ['AABA', 'ABAB'];
    const selectedForm = forms[Math.floor(Math.random() * forms.length)];
    
    // Generate phrase themes
    const phraseA = [];
    const phraseB = [];
    
    // Helper function to generate a phrase
    const generatePhrase = (theme = null) => {
        const phrase = [];
        let lastNote = Math.floor(Math.random() * selectedScale.length);
        
        // Ensure lastNote starts as a valid index
        if (isNaN(lastNote) || lastNote < 0 || lastNote >= selectedScale.length) {
            lastNote = 0;
        }
        
        for (let i = 0; i < notesPerPhrase; i++) {
            if (Math.random() < selectedComposer.restChance) {
                phrase.push({ rest: true, duration: selectedComposer.noteLength[Math.floor(Math.random() * selectedComposer.noteLength.length)] });
            } else {
                // Musical movement logic
                let movement = 0;
                if (theme && i < theme.length && theme[i] && typeof theme[i].movement === 'number') {
                    // Follow the theme with slight variations
                    movement = theme[i].movement + (Math.random() < 0.3 ? Math.floor(Math.random() * 3) - 1 : 0);
                } else {
                    // Create new movement
                    const movementType = Math.random();
                    if (movementType < 0.3) {
                        movement = 0; // Repeat
                    } else if (movementType < 0.6) {
                        movement = Math.floor(Math.random() * 3) - 1; // Step
                    } else if (movementType < 0.8) {
                        movement = Math.floor(Math.random() * 5) - 2; // Skip
                    } else {
                        movement = Math.floor(Math.random() * 7) - 3; // Leap
                    }
                }
                
                // Ensure movement is a valid number
                if (isNaN(movement)) {
                    movement = 0;
                }
                
                // Calculate new note position and ensure it's valid
                const newNote = lastNote + movement;
                lastNote = Math.max(0, Math.min(selectedScale.length - 1, newNote));
                
                // Double-check lastNote is valid
                if (isNaN(lastNote) || lastNote < 0 || lastNote >= selectedScale.length) {
                    console.error(`[Melody] Invalid lastNote after movement: ${lastNote}, movement: ${movement}, newNote: ${newNote}`);
                    lastNote = 0; // Reset to safe value
                }
                const octave = selectedComposer.octaveRange[0] + 
                    Math.floor(Math.random() * (selectedComposer.octaveRange[1] - selectedComposer.octaveRange[0] + 1));
                
                // Debug frequency calculation
                const scaleNote = selectedScale[lastNote];
                if (scaleNote === undefined) {
                    console.error(`[Melody] Invalid scale note: lastNote=${lastNote}, scale=${selectedScaleName}, scaleLength=${selectedScale.length}`);
                    continue;
                }
                
                const frequency = BASE_FREQ * Math.pow(2, octave) * Math.pow(2, scaleNote / 12);
                const duration = selectedComposer.noteLength[Math.floor(Math.random() * selectedComposer.noteLength.length)];
                const velocity = 0.3 + Math.random() * 0.4;
                
                // Only log debug info if there's an issue
                // console.log(`[Melody] Generated note: freq=${frequency}Hz, octave=${octave}, scaleNote=${scaleNote}, duration=${duration}`);
                
                if (isNaN(frequency) || frequency <= 0) {
                    console.error(`[Melody] Invalid frequency calculated: ${frequency}`);
                    continue;
                }
                
                // Occasionally add harmony
                if (Math.random() < 0.15) {
                    const harmonyNote = (lastNote + 2) % selectedScale.length;
                    const harmonyFreq = BASE_FREQ * Math.pow(2, octave) * Math.pow(2, selectedScale[harmonyNote] / 12);
                    phrase.push({
                        isChord: true,
                        frequencies: [frequency, harmonyFreq],
                        duration,
                        velocity,
                        movement: movement || 0
                    });
                } else {
                    phrase.push({ frequency, duration, velocity, movement: movement || 0 });
                }
            }
        }
        return phrase;
    };
    
    // Generate initial phrases
    const phraseANotes = generatePhrase();
    const phraseBNotes = generatePhrase();
    
    // Construct the form
    const melody = [];
    const formPattern = selectedForm.split('');
    formPattern.forEach(section => {
        if (section === 'A') {
            melody.push(...generatePhrase(phraseANotes));
        } else {
            melody.push(...generatePhrase(phraseBNotes));
        }
    });
    
    // Generate bass line
    const bassLine = [];
    const bassPattern = [0, 4, 2, 4]; // Root, fifth, third, fifth
    melody.forEach((note, index) => {
        if (!note.rest && index % 4 === 0) {
            const bassIndex = bassPattern[(index / 4) % bassPattern.length];
            const bassNote = selectedScale[bassIndex % selectedScale.length];
            const bassFreq = BASE_FREQ * Math.pow(2, -1) * Math.pow(2, bassNote / 12);
            bassLine.push({
                frequency: bassFreq,
                duration: 1,
                velocity: 0.6
            });
        }
    });
    
    return { melody, bassLine, selectedComposer, selectedScale: selectedScaleName, selectedForm };
}

/**
 * Play a melody
 */
export async function playMelody() {
    const state = getState();
    
    if (!toneCinematicKeys || !toneWarmPad || !toneEtherealStrings || !toneDeepBassDrone || !toneBassLine || !state.isPlaying) {
        console.log('[Melody] Instruments not initialized or not playing');
        return;
    }
    
    console.log('[Melody] Starting melody generation...');
    const { melody, bassLine, selectedComposer, selectedScale, selectedForm } = await generateMelody();
    console.log(`[Melody] Generated ${melody.length} notes, form: ${selectedForm}`);
    
    // Determine which instrument to use based on selected instrument
    let instrument, instrumentName;
    const selectedInstrument = state.selectedInstrument;
    
    switch (selectedInstrument) {
        case 'cinematic':
            instrument = toneCinematicKeys;
            instrumentName = 'Cinematic Keys';
            break;
        case 'warm':
            instrument = toneWarmPad;
            instrumentName = 'Warm Pad';
            break;
        case 'ethereal':
            instrument = toneEtherealStrings;
            instrumentName = 'Ethereal Strings';
            break;
        case 'deep':
            instrument = toneDeepBassDrone;
            instrumentName = 'Deep Bass Drone';
            break;
        default:
            // Cycle through instruments
            const instrumentIndex = melodyInstrumentCounter % 4;
            switch (instrumentIndex) {
                case 0:
                    instrument = toneCinematicKeys;
                    instrumentName = 'Cinematic Keys';
                    break;
                case 1:
                    instrument = toneWarmPad;
                    instrumentName = 'Warm Pad';
                    break;
                case 2:
                    instrument = toneEtherealStrings;
                    instrumentName = 'Ethereal Strings';
                    break;
                case 3:
                    instrument = toneDeepBassDrone;
                    instrumentName = 'Deep Bass Drone';
                    break;
            }
            melodyInstrumentCounter++;
    }
    
    console.log(`[Melody] Playing with ${instrumentName}, volume: ${state.melodyVolumeValue}`);
    
    // Schedule notes
    const now = Tone.now();
    let currentTime = 0;
    
    // Schedule melody notes
    melody.forEach((note, index) => {
        if (!note || note.rest) {
            // Skip rests
            if (note && note.duration) {
                currentTime += note.duration;
            }
            return;
        }
        
        try {
            if (note.isChord && note.frequencies) {
                // Filter out invalid frequencies
                const validFreqs = note.frequencies.filter(freq => freq && !isNaN(freq) && freq > 0);
                if (validFreqs.length > 0) {
                    const noteNames = validFreqs.map(freq => Tone.Frequency(freq, "hz").toNote());
                    // console.log(`[Melody] Playing chord: ${noteNames.join(', ')}`);
                    instrument.triggerAttackRelease(noteNames, note.duration, now + currentTime, note.velocity);
                }
            } else if (note.frequency && !isNaN(note.frequency) && note.frequency > 0) {
                const noteName = Tone.Frequency(note.frequency, "hz").toNote();
                // console.log(`[Melody] Playing note: ${noteName}, freq: ${note.frequency}Hz`);
                instrument.triggerAttackRelease(noteName, note.duration, now + currentTime, note.velocity);
            } else {
                console.warn(`[Melody] Invalid note at index ${index}:`, note);
            }
        } catch (error) {
            console.error(`[Melody] Error playing note at index ${index}:`, error, note);
        }
        
        currentTime += note.duration || 0.25; // Default duration if missing
    });
    
    // Schedule bass line
    let bassTime = 0;
    bassLine.forEach((note, index) => {
        if (!note || !note.frequency || isNaN(note.frequency) || note.frequency <= 0) {
            console.warn(`[Melody] Invalid bass note at index ${index}:`, note);
            return;
        }
        
        try {
            const noteName = Tone.Frequency(note.frequency, "hz").toNote();
            // console.log(`[Melody] Playing bass note: ${noteName}, freq: ${note.frequency}Hz`);
            toneBassLine.triggerAttackRelease(noteName, note.duration, now + bassTime, note.velocity);
            bassTime += note.duration || 1;
        } catch (error) {
            console.error(`[Melody] Error playing bass note at index ${index}:`, error, note);
        }
    });
    
    // Schedule next melody
    scheduleNextMelody(currentTime);
}

/**
 * Schedule the next melody
 */
function scheduleNextMelody(currentMelodyDuration = 0) {
    const state = getState();
    const pauseBetweenMelodies = Math.random() * (state.melodyMaxDelay - state.melodyMinDelay) + state.melodyMinDelay;
    const totalDelay = currentMelodyDuration + pauseBetweenMelodies;
    
    console.log(`[Melody] Scheduling next melody in ${totalDelay.toFixed(1)}s`);
    
    melodyScheduleTimeoutId = setTimeout(() => {
        if (state.isPlaying) {
            playMelody();
        }
    }, totalDelay * 1000);
}

/**
 * Stop melody playback
 */
export function stopMelodyPlayback() {
    console.log('[Melody] Stopping melody playback');
    if (melodyScheduleTimeoutId) {
        clearTimeout(melodyScheduleTimeoutId);
        melodyScheduleTimeoutId = null;
    }
}

/**
 * Update melody volume
 */
export function updateMelodyVolume(volume) {
    console.log('[Melody] Updating melody volume to:', volume);
    if (toneMelodyEffects) {
        toneMelodyEffects.gain.value = volume;
    }
}

/**
 * Update bass volume
 */
export function updateBassVolume(volume) {
    console.log('[Melody] Updating bass volume to:', volume);
    // TODO: Update bass line gain when properly connected
}

/**
 * Update melody effects
 */
export function updateMelodyEffects(params) {
    if (!window.toneEffects) return;
    
    if (params.reverbMix !== undefined && window.toneEffects.melodyReverb) {
        window.toneEffects.melodyReverb.wet.value = params.reverbMix;
    }
    
    if (params.delayTime !== undefined && window.toneEffects.melodyDelay) {
        window.toneEffects.melodyDelay.delayTime.value = params.delayTime;
    }
    
    if (params.delayFeedback !== undefined && window.toneEffects.melodyDelay) {
        window.toneEffects.melodyDelay.feedback.value = params.delayFeedback;
    }
    
    if (params.delayMix !== undefined && window.toneEffects.melodyDelay) {
        window.toneEffects.melodyDelay.wet.value = params.delayMix;
    }
}