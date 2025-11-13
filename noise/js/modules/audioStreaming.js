/**
 * Audio Streaming module - Handles playing random radio streams with effects
 */

import { getAudioContext, getMasterGain } from './audioContext.js';
import { streams } from './config.js';
import { getState } from './state.js';

let currentAudio = null;
let mediaSource = null;
let currentClipDuration = 0;
let scheduleTimeoutId = null;

/**
 * Get enabled streams based on state
 */
function getEnabledStreams() {
    const state = getState();
    const enabledStreams = [];
    
    // Get streams based on enabled indices from state
    state.enabledStreams.forEach(index => {
        if (streams[index]) {
            enabledStreams.push(streams[index]);
        }
    });
    
    return enabledStreams.length > 0 ? enabledStreams : [streams[0]]; // Fallback to first stream if none selected
}

/**
 * Play a random audio stream
 */
export async function playRandomStream(effectParams = {}) {
    const audioContext = getAudioContext();
    const masterGain = getMasterGain();
    
    try {
        // Stop current audio if exists (preserve schedule)
        stopCurrentStream(true);
        
        // Get enabled streams
        const enabledStreams = getEnabledStreams();
        
        // Choose a random stream and duration
        const randomStream = enabledStreams[Math.floor(Math.random() * enabledStreams.length)];
        currentClipDuration = Math.floor(Math.random() * 11) + 10; // Random 10-20 seconds
        
        console.log(`Loading stream: ${randomStream}`);
        
        // Update status
        const updateStatus = (message) => {
            const statusElement = document.getElementById('status');
            if (statusElement) {
                statusElement.textContent = message;
            }
        };
        
        updateStatus(`Loading stream...`);
        
        // Create audio element
        currentAudio = new Audio();
        currentAudio.crossOrigin = "anonymous";
        currentAudio.src = randomStream;
        
        // Wait for audio to be ready
        await new Promise((resolve, reject) => {
            currentAudio.addEventListener('canplay', resolve, { once: true });
            currentAudio.addEventListener('error', reject, { once: true });
            
            // Set a timeout in case the stream doesn't load
            setTimeout(() => reject(new Error('Timeout')), 5000);
        });
        
        // Start playing to buffer the stream
        currentAudio.play();
        
        // Mute during the skip period
        currentAudio.volume = 0;
        
        // Skip the first 10 seconds
        console.log('Skipping first 10 seconds of stream...');
        updateStatus('Skipping intro (10s)...');
        
        // Wait 10 seconds or until stopped
        await new Promise((resolve) => {
            const skipTimeout = setTimeout(resolve, 10000);
            
            // Store timeout ID so we can cancel if stream is stopped
            currentAudio._skipTimeout = skipTimeout;
        });
        
        // Check if audio was stopped during skip
        if (!currentAudio || currentAudio.paused) {
            console.log('Stream stopped during skip period');
            return;
        }
        
        // Create media source and connect through effects (after skip)
        mediaSource = audioContext.createMediaElementSource(currentAudio);
        
        // Apply effects to the stream
        const effectsChain = createStreamEffects(audioContext, effectParams);
        mediaSource.connect(effectsChain.input);
        effectsChain.output.connect(masterGain);
        
        // Restore volume (now handled by Web Audio gain)
        currentAudio.volume = 1;
        
        console.log(`Playing stream for ${currentClipDuration}s`);
        updateStatus(`Playing stream for ${currentClipDuration}s`);
        
        // Fade in over 2 seconds
        effectsChain.gainNode.gain.linearRampToValueAtTime(
            effectParams.clipVolume || 0.4, 
            audioContext.currentTime + 2
        );
        
        // Schedule fade out (4 seconds before clip ends)
        setTimeout(() => {
            if (currentAudio && !currentAudio.paused) {
                effectsChain.gainNode.gain.linearRampToValueAtTime(
                    0, 
                    audioContext.currentTime + 4
                );
            }
        }, (currentClipDuration - 4) * 1000);
        
        // Stop after clip duration (preserve schedule for next clip)
        setTimeout(() => {
            stopCurrentStream(true);
        }, currentClipDuration * 1000);
        
        return effectsChain;
        
    } catch (error) {
        console.error('Error playing stream:', error);
        throw error;
    }
}

/**
 * Create effects chain for stream
 */
function createStreamEffects(audioContext, params) {
    // Create gain node
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 0; // Start at 0 for fade in
    
    // Create delay
    const delay = audioContext.createDelay(1.0);
    delay.delayTime.value = params.delayTime || 0.15;
    
    const delayGain = audioContext.createGain();
    delayGain.gain.value = params.delayMix || 0.5;
    
    const delayFeedbackGain = audioContext.createGain();
    delayFeedbackGain.gain.value = params.delayFeedback || 0.45;
    
    // Create reverb using convolver (simplified)
    const wetGain = audioContext.createGain();
    wetGain.gain.value = params.reverbMix || 0.7;
    
    const dryGain = audioContext.createGain();
    dryGain.gain.value = 1 - (params.reverbMix || 0.7);
    
    // Create merger for output
    const merger = audioContext.createChannelMerger(2);
    
    // Connect the effects chain
    // Dry path
    gainNode.connect(dryGain);
    dryGain.connect(merger);
    
    // Delay path
    gainNode.connect(delay);
    delay.connect(delayGain);
    delay.connect(delayFeedbackGain);
    delayFeedbackGain.connect(delay);
    delayGain.connect(merger);
    
    // Wet path (simplified reverb)
    gainNode.connect(wetGain);
    wetGain.connect(merger);
    
    return {
        input: gainNode,
        output: merger,
        gainNode,
        delay,
        delayGain,
        wetGain,
        dryGain
    };
}

/**
 * Stop current stream
 */
export function stopCurrentStream(preserveSchedule = false) {
    if (currentAudio) {
        // Clear skip timeout if it exists
        if (currentAudio._skipTimeout) {
            clearTimeout(currentAudio._skipTimeout);
        }
        
        currentAudio.pause();
        currentAudio.src = '';
        if (mediaSource) {
            mediaSource.disconnect();
            mediaSource = null;
        }
        currentAudio = null;
    }
    
    // Only clear schedule if not preserving it
    if (!preserveSchedule && scheduleTimeoutId) {
        clearTimeout(scheduleTimeoutId);
        scheduleTimeoutId = null;
    }
}

/**
 * Schedule the next clip to play at a random interval
 */
export function scheduleNextClip(minDelay, maxDelay, callback) {
    const delay = Math.random() * (maxDelay - minDelay) + minDelay;
    console.log(`Scheduling next clip in ${delay.toFixed(1)}s`);
    
    scheduleTimeoutId = setTimeout(() => {
        if (callback) callback();
    }, delay * 1000);
}

/**
 * Check if a stream is currently playing
 */
export function isStreamPlaying() {
    return currentAudio && !currentAudio.paused;
}