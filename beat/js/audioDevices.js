/**
 * Audio device management module
 * Handles enumeration and selection of audio input devices
 */

export class AudioDeviceManager {
    constructor(selectElementId) {
        this.selectElement = document.getElementById(selectElementId);
    }

    /**
     * Initialize and populate audio devices list
     */
    async initialize() {
        try {
            // Request microphone permission first to get device labels and IDs
            await navigator.mediaDevices.getUserMedia({ audio: true })
                .then(stream => {
                    // Stop the stream immediately - we just needed permission
                    stream.getTracks().forEach(track => track.stop());
                });

            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(device => device.kind === 'audioinput');

            this.selectElement.innerHTML = '<option value="">Select audio source...</option>';

            audioInputs.forEach(device => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.textContent = device.label || `Microphone ${this.selectElement.options.length}`;
                this.selectElement.appendChild(option);
            });

            console.log(`Found ${audioInputs.length} audio input devices`);
        } catch (error) {
            console.error('Error enumerating devices:', error);
            alert('Error accessing audio devices. Please check permissions.');
            throw error;
        }
    }

    /**
     * Get the currently selected device ID
     */
    getSelectedDeviceId() {
        return this.selectElement.value;
    }

    /**
     * Check if a device is selected
     */
    hasSelection() {
        return this.selectElement.value !== '';
    }
}
