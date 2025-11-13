/**
 * Main entry point - Orchestrates all modules
 */

import { initAudioContext, closeAudioContext, resumeAudioContext } from './modules/audioContext.js';
import { initNoiseGenerators, updateNoiseLevels, startWaveEffect, stopWaveEffect, cleanupNoiseGenerators } from './modules/noiseGenerator.js';
import { playRandomStream, scheduleNextClip, stopCurrentStream } from './modules/audioStreaming.js';
import { startRecording, stopRecording, isRecording, downloadRecording, clearRecording } from './modules/recording.js';
import { getState, updateState, saveState, loadState } from './modules/state.js';
import { initKickDrum, startHeartbeatRhythm, stopHeartbeatRhythm, updateKickVolume, updateKickBPM, updateKickAttack } from './modules/kickDrum.js';
import { initMelodyInstruments, playMelody, stopMelodyPlayback, updateMelodyVolume, updateBassVolume, updateMelodyEffects } from './modules/melody.js';

// Get state reference
const state = getState();

// Status update function
function updateStatus(message) {
    document.getElementById('status').textContent = message;
}

/**
 * Initialize audio system
 */
async function initAudio() {
    try {
        updateStatus('Initializing audio...');
        
        // Initialize audio context
        await initAudioContext();
        
        // Load noise processor worklets
        const audioContext = (await import('./modules/audioContext.js')).getAudioContext();
        await audioContext.audioWorklet.addModule('noise-processors.js');
        
        // Initialize Tone.js if available
        if (typeof Tone !== 'undefined') {
            await Tone.start();
            console.log('Tone.js initialized');
            
            // Initialize kick drum
            const kickInitialized = await initKickDrum();
            console.log('Kick drum initialized:', kickInitialized);
            
            // Initialize melody instruments
            const melodyInitialized = await initMelodyInstruments();
            console.log('Melody instruments initialized:', melodyInitialized);
        }
        
        // Initialize noise generators
        await initNoiseGenerators(
            document.getElementById('whiteNoise').value / 100,
            document.getElementById('pinkNoise').value / 100,
            document.getElementById('brownNoise').value / 100
        );
        
        updateStatus('Audio initialized');
    } catch (error) {
        console.error('Error initializing audio:', error);
        updateStatus('Error initializing audio: ' + error.message);
    }
}

/**
 * Play next random clip
 */
async function playNextClip() {
    if (!state.isPlaying) return;
    
    try {
        await playRandomStream({
            clipVolume: state.clipVolumeValue,
            reverbMix: state.reverbMixValue,
            delayTime: state.delayTimeValue,
            delayFeedback: state.delayFeedbackValue,
            delayMix: state.delayMixValue
        });
        
        // Schedule next clip
        scheduleNextClip(state.clipMinDelay, state.clipMaxDelay, playNextClip);
    } catch (error) {
        console.error('Error playing clip:', error);
        // Try again after delay
        scheduleNextClip(state.clipMinDelay, state.clipMaxDelay, playNextClip);
    }
}

/**
 * Toggle audio playback
 */
async function togglePlay() {
    const button = document.getElementById('playButton');
    
    if (!state.isPlaying) {
        // Start playing
        const audioContext = (await import('./modules/audioContext.js')).getAudioContext();
        if (!audioContext) {
            await initAudio();
        }
        
        updateState({ isPlaying: true });
        button.textContent = 'Stop Audio';
        button.classList.add('playing');
        updateStatus('Playing ambient noise');
        
        // Start wave effect if enabled
        if (state.waveEffectEnabled) {
            startWaveEffect(state.waveSpeed);
        }
        
        // Resume audio context if needed
        await resumeAudioContext();
        
        // Ensure Tone.js context is running
        if (typeof Tone !== 'undefined' && Tone.context.state !== 'running') {
            await Tone.context.resume();
        }
        
        // Start playing clips after a short delay
        setTimeout(() => {
            if (state.isPlaying) {
                playNextClip();
            }
        }, 5000);
        
        // Start heartbeat rhythm
        console.log('Starting heartbeat rhythm from togglePlay');
        startHeartbeatRhythm();
        
        // Start melody generation after a delay
        setTimeout(() => {
            if (state.isPlaying) {
                console.log('Starting melody playback');
                playMelody();
            }
        }, 2000);
        
    } else {
        // Stop playing
        updateState({ isPlaying: false });
        button.textContent = 'Start Audio';
        button.classList.remove('playing');
        updateStatus('Audio stopped');
        
        // Stop current audio stream
        stopCurrentStream();
        
        // Stop wave effect
        stopWaveEffect();
        
        // Stop heartbeat rhythm
        console.log('Stopping heartbeat rhythm from togglePlay');
        stopHeartbeatRhythm();
        
        // Stop melody playback
        console.log('Stopping melody playback');
        stopMelodyPlayback();
        
        // Clean up audio context
        cleanupNoiseGenerators();
        await closeAudioContext();
    }
}

/**
 * Sync UI controls with current state
 */
function syncUIWithState() {
    console.log('Syncing UI with loaded state...');
    
    // Noise controls
    const whiteValue = Math.round(state.whiteNoiseValue * 100);
    const pinkValue = Math.round(state.pinkNoiseValue * 100);
    const brownValue = Math.round(state.brownNoiseValue * 100);
    
    if (document.getElementById('whiteNoise')) {
        document.getElementById('whiteNoise').value = whiteValue;
        document.getElementById('whiteValue').textContent = whiteValue + '%';
    }
    if (document.getElementById('pinkNoise')) {
        document.getElementById('pinkNoise').value = pinkValue;
        document.getElementById('pinkValue').textContent = pinkValue + '%';
    }
    if (document.getElementById('brownNoise')) {
        document.getElementById('brownNoise').value = brownValue;
        document.getElementById('brownValue').textContent = brownValue + '%';
    }
    
    // Wave effect
    if (document.getElementById('waveEffect')) {
        document.getElementById('waveEffect').checked = state.waveEffectEnabled;
    }
    
    // Clip effects
    document.getElementById('clipVolume').value = Math.round(state.clipVolumeValue * 100);
    document.getElementById('clipVolumeValue').textContent = Math.round(state.clipVolumeValue * 100) + '%';
    
    document.getElementById('reverbMix').value = Math.round(state.reverbMixValue * 100);
    document.getElementById('reverbMixValue').textContent = Math.round(state.reverbMixValue * 100) + '%';
    
    document.getElementById('delayTime').value = Math.round(state.delayTimeValue * 1000);
    document.getElementById('delayTimeValue').textContent = Math.round(state.delayTimeValue * 1000) + 'ms';
    
    document.getElementById('delayFeedback').value = Math.round(state.delayFeedbackValue * 100);
    document.getElementById('delayFeedbackValue').textContent = Math.round(state.delayFeedbackValue * 100) + '%';
    
    document.getElementById('delayMix').value = Math.round(state.delayMixValue * 100);
    document.getElementById('delayMixValue').textContent = Math.round(state.delayMixValue * 100) + '%';
    
    // Kick drum controls
    document.getElementById('heartbeatVolume').value = Math.round(state.heartbeatVolumeValue * 100);
    document.getElementById('heartbeatVolumeValue').textContent = Math.round(state.heartbeatVolumeValue * 100) + '%';
    
    document.getElementById('heartbeatBPM').value = state.bpm;
    document.getElementById('heartbeatBPMValue').textContent = state.bpm + ' BPM';
    
    document.getElementById('kickAttack').value = Math.round(state.kickAttackValue * 1000);
    document.getElementById('kickAttackValue').textContent = Math.round(state.kickAttackValue * 1000) + 'ms';
    
    document.getElementById('duckingEnabled').checked = state.duckingEnabled;
    
    document.getElementById('duckingAmount').value = Math.round(state.duckingAmount * 100);
    document.getElementById('duckingAmountValue').textContent = Math.round(state.duckingAmount * 100) + '%';
    
    document.getElementById('duckingAttack').value = Math.round(state.duckingAttack * 1000);
    document.getElementById('duckingAttackValue').textContent = Math.round(state.duckingAttack * 1000) + 'ms';
    
    // Melody controls
    document.getElementById('melodyVolume').value = Math.round(state.melodyVolumeValue * 100);
    document.getElementById('melodyVolumeValue').textContent = Math.round(state.melodyVolumeValue * 100) + '%';
    
    document.getElementById('bassVolume').value = Math.round(state.bassVolumeValue * 100);
    document.getElementById('bassVolumeValue').textContent = Math.round(state.bassVolumeValue * 100) + '%';
    
    // Melody effects
    document.getElementById('melodyReverbMix').value = Math.round(state.melodyReverbMixValue * 100);
    document.getElementById('melodyReverbMixValue').textContent = Math.round(state.melodyReverbMixValue * 100) + '%';
    
    document.getElementById('melodyDelayTime').value = Math.round(state.melodyDelayTimeValue * 100);
    document.getElementById('melodyDelayTimeValue').textContent = Math.round(state.melodyDelayTimeValue * 1000) + 'ms';
    
    document.getElementById('melodyDelayFeedback').value = Math.round(state.melodyDelayFeedbackValue * 100);
    document.getElementById('melodyDelayFeedbackValue').textContent = Math.round(state.melodyDelayFeedbackValue * 100) + '%';
    
    document.getElementById('melodyDelayMix').value = Math.round(state.melodyDelayMixValue * 100);
    document.getElementById('melodyDelayMixValue').textContent = Math.round(state.melodyDelayMixValue * 100) + '%';
    
    // Scale selections - clear all first
    document.querySelectorAll('input[type="checkbox"][id^="scale"]').forEach(cb => cb.checked = false);
    state.enabledScales.forEach(scale => {
        const checkbox = document.getElementById('scale' + scale.charAt(0).toUpperCase() + scale.slice(1));
        if (checkbox) checkbox.checked = true;
    });
    
    // Composer selections - clear all first
    document.querySelectorAll('input[type="checkbox"][id^="composer"]').forEach(cb => cb.checked = false);
    state.enabledComposers.forEach(composer => {
        const checkbox = document.getElementById('composer' + composer.charAt(0).toUpperCase() + composer.slice(1));
        if (checkbox) checkbox.checked = true;
    });
    
    // Selected instrument
    document.querySelectorAll('.instrument-button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.instrument === state.selectedInstrument) {
            btn.classList.add('active');
        }
    });
    
    // Show correct instrument controls
    document.querySelectorAll('.instrument-controls').forEach(controls => {
        controls.style.display = 'none';
    });
    const instrumentControls = document.getElementById(`${state.selectedInstrument}Controls`);
    if (instrumentControls) {
        instrumentControls.style.display = 'block';
    }
    
    // Stream selections - clear all first then set enabled ones
    document.querySelectorAll('input[type="checkbox"][id^="stream"]').forEach((cb, index) => {
        cb.checked = state.enabledStreams.includes(index);
    });
    
    // Timing sliders (if nouislider is available)
    if (typeof noUiSlider !== 'undefined') {
        const clipTimingSlider = document.getElementById('clipTimingSlider');
        if (clipTimingSlider && clipTimingSlider.noUiSlider) {
            clipTimingSlider.noUiSlider.set([state.clipMinDelay, state.clipMaxDelay]);
        }
        
        const melodyTimingSlider = document.getElementById('melodyTimingSlider');
        if (melodyTimingSlider && melodyTimingSlider.noUiSlider) {
            melodyTimingSlider.noUiSlider.set([state.melodyMinDelay, state.melodyMaxDelay]);
        }
    }
    
    console.log('UI sync complete');
}

/**
 * Initialize stream list with actual URLs
 */
function initStreamList() {
    const streamElements = document.querySelectorAll('.stream-item');
    const streamUrls = [
        "http://ec2.yesstreaming.net:3540/stream",
        "http://c34.radioboss.fm:8204/autodj",
        "http://stream.radioinfoweb.net:8000/news",
        "http://c34.radioboss.fm:8204/autodj",
        "http://c3.radioboss.fm:8071/autodj",
        "http://radio.streemlion.com:3990/stream",
        "http://amp2.cesnet.cz:8000/cro-plus-256.ogg"
    ];
    
    streamElements.forEach((element, index) => {
        const urlSpan = element.querySelector('.stream-url');
        if (urlSpan && streamUrls[index]) {
            urlSpan.textContent = streamUrls[index];
            urlSpan.title = streamUrls[index]; // Full URL on hover
        }
    });
}

/**
 * Initialize UI event listeners
 */
function initUI() {
    // Initialize stream list
    initStreamList();
    // Play button
    document.getElementById('playButton').addEventListener('click', togglePlay);
    
    // Noise level controls
    document.getElementById('whiteNoise').addEventListener('input', (e) => {
        const value = e.target.value / 100;
        document.getElementById('whiteValue').textContent = e.target.value + '%';
        updateNoiseLevels(
            value,
            document.getElementById('pinkNoise').value / 100,
            document.getElementById('brownNoise').value / 100
        );
    });
    
    document.getElementById('pinkNoise').addEventListener('input', (e) => {
        const value = e.target.value / 100;
        document.getElementById('pinkValue').textContent = e.target.value + '%';
        updateNoiseLevels(
            document.getElementById('whiteNoise').value / 100,
            value,
            document.getElementById('brownNoise').value / 100
        );
    });
    
    document.getElementById('brownNoise').addEventListener('input', (e) => {
        const value = e.target.value / 100;
        document.getElementById('brownValue').textContent = e.target.value + '%';
        updateNoiseLevels(
            document.getElementById('whiteNoise').value / 100,
            document.getElementById('pinkNoise').value / 100,
            value
        );
    });
    
    // Wave effect checkbox
    document.getElementById('waveEffect').addEventListener('change', (e) => {
        updateState({ waveEffectEnabled: e.target.checked });
        if (e.target.checked) {
            document.getElementById('noiseControls').style.display = 'none';
            document.getElementById('waveNotice').style.display = 'block';
            if (state.isPlaying) {
                startWaveEffect(state.waveSpeed);
            }
        } else {
            document.getElementById('noiseControls').style.display = 'block';
            document.getElementById('waveNotice').style.display = 'none';
            stopWaveEffect();
            // Restore manual control values
            updateNoiseLevels(
                document.getElementById('whiteNoise').value / 100,
                document.getElementById('pinkNoise').value / 100,
                document.getElementById('brownNoise').value / 100
            );
        }
    });
    
    // Clip volume control
    document.getElementById('clipVolume').addEventListener('input', (e) => {
        const value = e.target.value / 100;
        updateState({ clipVolumeValue: value });
        document.getElementById('clipVolumeValue').textContent = e.target.value + '%';
    });
    
    // Clip effects controls
    document.getElementById('reverbMix').addEventListener('input', (e) => {
        const value = e.target.value / 100;
        updateState({ reverbMixValue: value });
        document.getElementById('reverbMixValue').textContent = e.target.value + '%';
    });
    
    document.getElementById('delayTime').addEventListener('input', (e) => {
        const value = e.target.value / 1000;
        updateState({ delayTimeValue: value });
        document.getElementById('delayTimeValue').textContent = e.target.value + 'ms';
    });
    
    document.getElementById('delayFeedback').addEventListener('input', (e) => {
        const value = e.target.value / 100;
        updateState({ delayFeedbackValue: value });
        document.getElementById('delayFeedbackValue').textContent = e.target.value + '%';
    });
    
    document.getElementById('delayMix').addEventListener('input', (e) => {
        const value = e.target.value / 100;
        updateState({ delayMixValue: value });
        document.getElementById('delayMixValue').textContent = e.target.value + '%';
    });
    
    // Kick drum controls
    document.getElementById('heartbeatVolume').addEventListener('input', (e) => {
        const value = e.target.value / 100;
        updateState({ heartbeatVolumeValue: value });
        document.getElementById('heartbeatVolumeValue').textContent = e.target.value + '%';
        updateKickVolume(value);
    });
    
    document.getElementById('heartbeatBPM').addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        updateKickBPM(value);
        document.getElementById('heartbeatBPMValue').textContent = value + ' BPM';
    });
    
    document.getElementById('kickAttack').addEventListener('input', (e) => {
        const value = e.target.value / 1000; // Convert ms to seconds
        updateState({ kickAttackValue: value });
        document.getElementById('kickAttackValue').textContent = e.target.value + 'ms';
        updateKickAttack(value);
    });
    
    document.getElementById('duckingEnabled').addEventListener('change', (e) => {
        updateState({ duckingEnabled: e.target.checked });
    });
    
    document.getElementById('duckingAmount').addEventListener('input', (e) => {
        const value = e.target.value / 100;
        updateState({ duckingAmount: value });
        document.getElementById('duckingAmountValue').textContent = e.target.value + '%';
    });
    
    document.getElementById('duckingAttack').addEventListener('input', (e) => {
        const value = e.target.value / 1000;
        updateState({ duckingAttack: value });
        document.getElementById('duckingAttackValue').textContent = e.target.value + 'ms';
    });
    
    // Melody controls
    document.getElementById('melodyVolume').addEventListener('input', (e) => {
        const value = e.target.value / 100;
        updateState({ melodyVolumeValue: value });
        document.getElementById('melodyVolumeValue').textContent = e.target.value + '%';
        updateMelodyVolume(value);
    });
    
    document.getElementById('bassVolume').addEventListener('input', (e) => {
        const value = e.target.value / 100;
        updateState({ bassVolumeValue: value });
        document.getElementById('bassVolumeValue').textContent = e.target.value + '%';
        updateBassVolume(value);
    });
    
    // Melody effects controls
    document.getElementById('melodyReverbMix').addEventListener('input', (e) => {
        const value = e.target.value / 100;
        updateState({ melodyReverbMixValue: value });
        document.getElementById('melodyReverbMixValue').textContent = e.target.value + '%';
        updateMelodyEffects({ reverbMix: value });
    });
    
    document.getElementById('melodyDelayTime').addEventListener('input', (e) => {
        const value = e.target.value / 100; // Convert to seconds
        updateState({ melodyDelayTimeValue: value });
        document.getElementById('melodyDelayTimeValue').textContent = e.target.value * 10 + 'ms';
        updateMelodyEffects({ delayTime: value });
    });
    
    document.getElementById('melodyDelayFeedback').addEventListener('input', (e) => {
        const value = e.target.value / 100;
        updateState({ melodyDelayFeedbackValue: value });
        document.getElementById('melodyDelayFeedbackValue').textContent = e.target.value + '%';
        updateMelodyEffects({ delayFeedback: value });
    });
    
    document.getElementById('melodyDelayMix').addEventListener('input', (e) => {
        const value = e.target.value / 100;
        updateState({ melodyDelayMixValue: value });
        document.getElementById('melodyDelayMixValue').textContent = e.target.value + '%';
        updateMelodyEffects({ delayMix: value });
    });
    
    // Scale selection checkboxes
    document.querySelectorAll('input[type="checkbox"][id^="scale"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const enabledScales = [];
            if (document.getElementById('scalePentatonic').checked) enabledScales.push('pentatonic');
            if (document.getElementById('scaleMajor').checked) enabledScales.push('major');
            if (document.getElementById('scaleMinor').checked) enabledScales.push('minor');
            if (document.getElementById('scaleDorian').checked) enabledScales.push('dorian');
            
            if (enabledScales.length === 0) {
                // Ensure at least one scale is selected
                document.getElementById('scaleMinor').checked = true;
                enabledScales.push('minor');
            }
            
            updateState({ enabledScales });
        });
    });
    
    // Composer selection checkboxes
    document.querySelectorAll('input[type="checkbox"][id^="composer"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const enabledComposers = [];
            document.querySelectorAll('input[type="checkbox"][id^="composer"]:checked').forEach(cb => {
                const composerName = cb.value;
                if (composerName) enabledComposers.push(composerName);
            });
            
            if (enabledComposers.length === 0) {
                // Ensure at least one composer is selected
                document.getElementById('composerMozart').checked = true;
                enabledComposers.push('mozart');
            }
            
            updateState({ enabledComposers });
        });
    });
    
    // Instrument selection buttons
    document.querySelectorAll('.instrument-button').forEach(button => {
        button.addEventListener('click', function() {
            const instrument = this.dataset.instrument;
            
            // Update active states
            document.querySelectorAll('.instrument-button').forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            // Update state
            updateState({ selectedInstrument: instrument });
            
            // Show/hide instrument controls
            document.querySelectorAll('.instrument-controls').forEach(controls => {
                controls.style.display = 'none';
            });
            document.getElementById(`${instrument}Controls`).style.display = 'block';
        });
    });
    
    // Stream selection controls
    document.querySelectorAll('input[type="checkbox"][id^="stream"]').forEach((checkbox, index) => {
        checkbox.addEventListener('change', () => {
            const enabledStreams = [];
            document.querySelectorAll('input[type="checkbox"][id^="stream"]:checked').forEach(cb => {
                const streamIndex = parseInt(cb.value);
                if (!isNaN(streamIndex)) {
                    enabledStreams.push(streamIndex);
                }
            });
            
            if (enabledStreams.length === 0) {
                // Ensure at least one stream is selected
                document.getElementById('stream0').checked = true;
                enabledStreams.push(0);
            }
            
            updateState({ enabledStreams });
        });
    });
    
    document.getElementById('selectAllStreams').addEventListener('click', () => {
        const enabledStreams = [];
        document.querySelectorAll('input[type="checkbox"][id^="stream"]').forEach((cb, index) => {
            cb.checked = true;
            enabledStreams.push(index);
        });
        updateState({ enabledStreams });
    });
    
    document.getElementById('deselectAllStreams').addEventListener('click', () => {
        // Keep at least the first stream selected
        document.querySelectorAll('input[type="checkbox"][id^="stream"]').forEach((cb, index) => {
            cb.checked = index === 0;
        });
        updateState({ enabledStreams: [0] });
    });
    
    // Recording controls
    document.getElementById('recordButton').addEventListener('click', async () => {
        if (isRecording()) {
            stopRecording();
            document.getElementById('recordButton').textContent = 'Start Recording';
            document.getElementById('recordButton').classList.remove('recording');
            document.getElementById('recordingStatus').style.display = 'none';
            updateStatus('Recording stopped');
        } else {
            try {
                await startRecording();
                document.getElementById('recordButton').textContent = 'Stop Recording';
                document.getElementById('recordButton').classList.add('recording');
                document.getElementById('recordingStatus').style.display = 'flex';
                document.getElementById('recordingResults').style.display = 'none';
                updateStatus('Recording started');
            } catch (error) {
                updateStatus('Error starting recording: ' + error.message);
            }
        }
    });
    
    document.getElementById('downloadButton').addEventListener('click', () => {
        try {
            downloadRecording();
        } catch (error) {
            updateStatus('Error downloading recording: ' + error.message);
        }
    });
    
    document.getElementById('newRecordingButton').addEventListener('click', () => {
        clearRecording();
        document.getElementById('recordingResults').style.display = 'none';
        updateStatus('Ready to record');
    });
    
    // Tab navigation
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            
            // Update active states
            document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
            
            this.classList.add('active');
            document.getElementById(`${tabName}-tab`).classList.add('active');
        });
    });
    
    // Listen for recording events
    window.addEventListener('recordingComplete', (e) => {
        const { blob, duration, url } = e.detail;
        
        document.getElementById('recordingResults').style.display = 'block';
        document.getElementById('recordingPlayback').src = url;
        
        const minutes = Math.floor(duration / 60);
        const seconds = Math.floor(duration % 60);
        document.getElementById('recordingDuration').textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    });
    
    window.addEventListener('recordingProgress', (e) => {
        const elapsed = e.detail.elapsed;
        const minutes = Math.floor(elapsed / 60);
        const seconds = Math.floor(elapsed % 60);
        document.getElementById('recordingTime').textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    });
    
    // Initialize timing sliders if nouislider is available
    if (typeof noUiSlider !== 'undefined') {
        // Clip timing slider
        const clipTimingSlider = document.getElementById('clipTimingSlider');
        if (clipTimingSlider) {
            noUiSlider.create(clipTimingSlider, {
                start: [state.clipMinDelay, state.clipMaxDelay],
                connect: true,
                range: {
                    'min': 5,
                    'max': 120
                },
                step: 1
            });
            
            clipTimingSlider.noUiSlider.on('update', (values) => {
                const min = parseInt(values[0]);
                const max = parseInt(values[1]);
                updateState({ clipMinDelay: min, clipMaxDelay: max });
                document.getElementById('clipTimingValue').textContent = `${min}s - ${max}s`;
            });
        }
        
        // Melody timing slider
        const melodyTimingSlider = document.getElementById('melodyTimingSlider');
        if (melodyTimingSlider) {
            noUiSlider.create(melodyTimingSlider, {
                start: [state.melodyMinDelay, state.melodyMaxDelay],
                connect: true,
                range: {
                    'min': 10,
                    'max': 180
                },
                step: 1
            });
            
            melodyTimingSlider.noUiSlider.on('update', (values) => {
                const min = parseInt(values[0]);
                const max = parseInt(values[1]);
                updateState({ melodyMinDelay: min, melodyMaxDelay: max });
                document.getElementById('melodyTimingValue').textContent = `${min}s - ${max}s`;
            });
        }
    }
    
    // Load saved settings
    loadState();
    
    // Update UI controls with loaded state (with small delay to ensure DOM is ready)
    setTimeout(() => {
        syncUIWithState();
    }, 100);
    
    // Save settings on state change
    let saveTimeout;
    window.addEventListener('stateChange', (e) => {
        // Debounce saves to avoid too many writes
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveState();
        }, 500);
    });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
} else {
    initUI();
}