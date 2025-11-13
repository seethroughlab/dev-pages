/**
 * Recording module - Handles audio recording functionality
 */

import { getAudioContext, getMasterGain } from './audioContext.js';

let mediaRecorder = null;
let recordedChunks = [];
let recordingStartTime = null;
let recordingInterval = null;
let recordedBlob = null;

/**
 * Start recording audio
 */
export async function startRecording() {
    const audioContext = getAudioContext();
    const masterGain = getMasterGain();
    
    if (!audioContext) {
        throw new Error('Audio context not initialized');
    }
    
    try {
        // Create a destination node to capture all audio
        const dest = audioContext.createMediaStreamDestination();
        
        // Connect master gain to the destination
        if (masterGain) {
            masterGain.connect(dest);
        }
        
        // Also connect Tone.js master output if available
        if (typeof Tone !== 'undefined' && Tone.Destination) {
            Tone.connect(Tone.Destination, dest);
        }
        
        // Create MediaRecorder
        mediaRecorder = new MediaRecorder(dest.stream, {
            mimeType: 'audio/webm'
        });
        
        recordedChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };
        
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'audio/webm' });
            recordedBlob = blob;
            
            // Calculate duration
            const duration = (Date.now() - recordingStartTime) / 1000;
            
            // Dispatch custom event with recording data
            const event = new CustomEvent('recordingComplete', {
                detail: {
                    blob,
                    duration,
                    url: URL.createObjectURL(blob)
                }
            });
            window.dispatchEvent(event);
        };
        
        // Start recording
        mediaRecorder.start();
        recordingStartTime = Date.now();
        
        // Start timer
        recordingInterval = setInterval(() => {
            const event = new CustomEvent('recordingProgress', {
                detail: {
                    elapsed: (Date.now() - recordingStartTime) / 1000
                }
            });
            window.dispatchEvent(event);
        }, 100);
        
        return true;
        
    } catch (error) {
        console.error('Error starting recording:', error);
        throw error;
    }
}

/**
 * Stop recording audio
 */
export function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        
        // Clear timer
        if (recordingInterval) {
            clearInterval(recordingInterval);
            recordingInterval = null;
        }
        
        return true;
    }
    return false;
}

/**
 * Check if currently recording
 */
export function isRecording() {
    return mediaRecorder && mediaRecorder.state === 'recording';
}

/**
 * Download the recorded audio
 */
export function downloadRecording(filename = 'ambient-noise-recording.wav') {
    if (!recordedBlob) {
        throw new Error('No recording available');
    }
    
    // Convert webm to wav
    convertToWav(recordedBlob).then(wavBlob => {
        const url = URL.createObjectURL(wavBlob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
}

/**
 * Convert webm blob to wav
 */
async function convertToWav(webmBlob) {
    const audioContext = getAudioContext();
    const arrayBuffer = await webmBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // Calculate length and create buffer
    const length = audioBuffer.length * audioBuffer.numberOfChannels * 2;
    const buffer = new ArrayBuffer(44 + length);
    const view = new DataView(buffer);
    
    // Write WAV header
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, audioBuffer.numberOfChannels, true);
    view.setUint32(24, audioBuffer.sampleRate, true);
    view.setUint32(28, audioBuffer.sampleRate * audioBuffer.numberOfChannels * 2, true);
    view.setUint16(32, audioBuffer.numberOfChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length, true);
    
    // Write audio data
    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
            const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
            view.setInt16(offset, sample * 0x7FFF, true);
            offset += 2;
        }
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
}

/**
 * Clear the current recording
 */
export function clearRecording() {
    recordedBlob = null;
    recordedChunks = [];
}