/**
 * MIDI Manager - WebMIDI API interface for sending MIDI messages
 *
 * Connects to virtual MIDI ports (IAC Driver on Mac, loopMIDI on Windows)
 * and sends MIDI messages to Ableton Live or other DAWs.
 */

export class MIDIManager {
  constructor() {
    this.midiAccess = null;
    this.output = null;
    this.input = null;
    this.isConnected = false;
    this.selectedOutputId = null;
    this.selectedInputId = null;
    this.enabled = true; // Master enable/disable flag for all MIDI output

    // Callbacks for MIDI Clock sync (set by clock-manager)
    this.onClockTick = null;      // Called on each MIDI Clock message (0xF8)
    this.onStart = null;           // Called on MIDI Start (0xFA)
    this.onStop = null;            // Called on MIDI Stop (0xFC)
    this.onContinue = null;        // Called on MIDI Continue (0xFB)
  }

  /**
   * Initialize WebMIDI API and request access
   */
  async init() {
    if (!navigator.requestMIDIAccess) {
      console.error('[MIDI] WebMIDI API not supported in this browser');
      console.error('[MIDI] Try using Chrome, Edge, or Opera');
      return false;
    }

    try {
      console.log('[MIDI] Requesting MIDI access...');
      this.midiAccess = await navigator.requestMIDIAccess();
      console.log('[MIDI] ✓ MIDI access granted');

      // List available outputs and inputs
      this.listOutputs();
      this.listInputs();

      // Auto-connect to first available output
      const outputs = Array.from(this.midiAccess.outputs.values());
      if (outputs.length > 0) {
        this.connectToOutput(outputs[0].id);
      } else {
        console.warn('[MIDI] No MIDI outputs found. Make sure your virtual MIDI port is set up.');
        console.warn('[MIDI] macOS: Enable IAC Driver in Audio MIDI Setup');
        console.warn('[MIDI] Windows: Run loopMIDI and create a virtual port');
      }

      // List inputs but don't auto-connect (to avoid feedback loops)
      // User can manually connect if they want external clock sync
      const inputs = Array.from(this.midiAccess.inputs.values());
      if (inputs.length === 0) {
        console.warn('[MIDI] No MIDI inputs found. External clock sync will not be available.');
      } else {
        console.log('[MIDI] MIDI inputs available but not auto-connected (use GUI to enable external sync)');
      }

      // Listen for device changes
      this.midiAccess.onstatechange = (e) => {
        console.log(`[MIDI] Device ${e.port.name} ${e.port.state}`);
        this.listOutputs();

        // Reconnect if our output was disconnected
        if (e.port.id === this.selectedOutputId && e.port.state === 'disconnected') {
          this.isConnected = false;
          this.output = null;
        }
      };

      return true;
    } catch (error) {
      console.error('[MIDI] Failed to access MIDI devices:', error);
      return false;
    }
  }

  /**
   * List all available MIDI outputs
   */
  listOutputs() {
    if (!this.midiAccess) return [];

    const outputs = Array.from(this.midiAccess.outputs.values());
    console.log(`[MIDI] Available outputs (${outputs.length}):`);
    outputs.forEach((output, index) => {
      const marker = output.id === this.selectedOutputId ? '→' : ' ';
      console.log(`[MIDI] ${marker} ${index + 1}. ${output.name} (${output.manufacturer || 'Unknown'})`);
    });

    return outputs;
  }

  /**
   * Connect to a specific MIDI output by ID
   */
  connectToOutput(outputId) {
    if (!this.midiAccess) {
      console.error('[MIDI] MIDI not initialized. Call init() first.');
      return false;
    }

    const output = this.midiAccess.outputs.get(outputId);
    if (!output) {
      console.error(`[MIDI] Output with ID ${outputId} not found`);
      return false;
    }

    this.output = output;
    this.selectedOutputId = outputId;
    this.isConnected = true;

    console.log(`[MIDI] ✓ Connected to: ${output.name}`);
    return true;
  }

  /**
   * Get list of output names for GUI dropdown
   */
  getOutputNames() {
    if (!this.midiAccess) return [];

    const outputs = Array.from(this.midiAccess.outputs.values());
    return outputs.map(output => ({
      id: output.id,
      name: output.name
    }));
  }

  /**
   * List all available MIDI inputs
   */
  listInputs() {
    if (!this.midiAccess) return [];

    const inputs = Array.from(this.midiAccess.inputs.values());
    console.log(`[MIDI] Available inputs (${inputs.length}):`);
    inputs.forEach((input, index) => {
      const marker = input.id === this.selectedInputId ? '→' : ' ';
      console.log(`[MIDI] ${marker} ${index + 1}. ${input.name} (${input.manufacturer || 'Unknown'})`);
    });

    return inputs;
  }

  /**
   * Connect to a specific MIDI input by ID
   */
  connectToInput(inputId) {
    if (!this.midiAccess) {
      console.error('[MIDI] MIDI not initialized. Call init() first.');
      return false;
    }

    const input = this.midiAccess.inputs.get(inputId);
    if (!input) {
      console.error(`[MIDI] Input with ID ${inputId} not found`);
      return false;
    }

    // Disconnect previous input if any
    if (this.input) {
      this.input.onmidimessage = null;
    }

    this.input = input;
    this.selectedInputId = inputId;

    // Set up message handler for incoming MIDI
    this.input.onmidimessage = (event) => this.handleMIDIMessage(event);

    console.log(`[MIDI] ✓ Connected to input: ${input.name}`);
    return true;
  }

  /**
   * Handle incoming MIDI messages (for clock sync)
   */
  handleMIDIMessage(event) {
    const [status, data1, data2] = event.data;

    // MIDI Clock messages (System Real-Time)
    switch (status) {
      case 0xF8: // Timing Clock (24 per quarter note)
        if (this.onClockTick) {
          this.onClockTick(event.timeStamp);
        }
        break;

      case 0xFA: // Start
        console.log('[MIDI Clock] Start received');
        if (this.onStart) {
          this.onStart();
        }
        break;

      case 0xFC: // Stop
        console.log('[MIDI Clock] Stop received');
        if (this.onStop) {
          this.onStop();
        }
        break;

      case 0xFB: // Continue
        console.log('[MIDI Clock] Continue received');
        if (this.onContinue) {
          this.onContinue();
        }
        break;

      case 0xFE: // Active Sensing (ignore)
        break;

      default:
        // Log other messages for debugging (optional)
        // console.log(`[MIDI In] ${status.toString(16)} ${data1} ${data2}`);
        break;
    }
  }

  /**
   * Get list of input names for GUI dropdown
   */
  getInputNames() {
    if (!this.midiAccess) return [];

    const inputs = Array.from(this.midiAccess.inputs.values());
    return inputs.map(input => ({
      id: input.id,
      name: input.name
    }));
  }

  /**
   * Send a MIDI Note On message
   * @param {number} note - MIDI note number (0-127)
   * @param {number} velocity - Note velocity (0-127)
   * @param {number} channel - MIDI channel (1-16)
   */
  sendNoteOn(note, velocity = 100, channel = 1) {
    if (!this.enabled) return; // Skip if MIDI is disabled

    if (!this.isConnected || !this.output) {
      console.warn('[MIDI] Not connected to any output');
      return;
    }

    // MIDI channels are 0-15 internally, but 1-16 for users
    const channelIndex = Math.max(0, Math.min(15, channel - 1));
    const noteOnStatus = 0x90 + channelIndex; // Note On = 144 (0x90) + channel

    const message = [noteOnStatus, note, velocity];
    this.output.send(message);

    console.log(`[MIDI] NoteOn: Ch${channel} Note${note} Vel${velocity}`);
  }

  /**
   * Send a MIDI Note Off message
   * @param {number} note - MIDI note number (0-127)
   * @param {number} channel - MIDI channel (1-16)
   */
  sendNoteOff(note, channel = 1) {
    if (!this.enabled) return; // Skip if MIDI is disabled

    if (!this.isConnected || !this.output) {
      console.warn('[MIDI] Not connected to any output');
      return;
    }

    const channelIndex = Math.max(0, Math.min(15, channel - 1));
    const noteOffStatus = 0x80 + channelIndex; // Note Off = 128 (0x80) + channel

    const message = [noteOffStatus, note, 0];
    this.output.send(message);

    console.log(`[MIDI] NoteOff: Ch${channel} Note${note}`);
  }

  /**
   * Send a MIDI Control Change (CC) message
   * @param {number} controller - CC number (0-127)
   * @param {number} value - CC value (0-127)
   * @param {number} channel - MIDI channel (1-16)
   */
  sendCC(controller, value, channel = 1) {
    if (!this.enabled) return; // Skip if MIDI is disabled

    if (!this.isConnected || !this.output) {
      console.warn('[MIDI] Not connected to any output');
      return;
    }

    const channelIndex = Math.max(0, Math.min(15, channel - 1));
    const ccStatus = 0xB0 + channelIndex; // CC = 176 (0xB0) + channel

    const message = [ccStatus, controller, value];
    this.output.send(message);

    // Only log occasionally to avoid spam
    if (Math.random() < 0.05) {
      console.log(`[MIDI] CC: Ch${channel} CC${controller} Val${value}`);
    }
  }

  /**
   * Send a test note (middle C for 500ms)
   */
  sendTestNote() {
    const middleC = 60;
    const velocity = 100;
    const channel = 1;

    console.log('[MIDI] Sending test note (C4, 500ms)...');
    this.sendNoteOn(middleC, velocity, channel);

    // Auto send note off after 500ms
    setTimeout(() => {
      this.sendNoteOff(middleC, channel);
    }, 500);
  }

  /**
   * MIDI Panic - send Note-Off for all notes on all channels
   * Use this to stop any stuck notes
   */
  panic() {
    if (!this.enabled) {
      console.log('[MIDI] Panic skipped - MIDI is disabled');
      return;
    }

    if (!this.isConnected || !this.output) {
      console.warn('[MIDI] Not connected to any output');
      return;
    }

    console.log('[MIDI] 🚨 PANIC - Sending All Notes Off on all channels');

    // Temporarily enable MIDI for panic (to send NoteOffs)
    const wasEnabled = this.enabled;
    this.enabled = true;

    // Send Note-Off for all 128 MIDI notes on channels 1, 2, and 3
    const channels = [1, 2, 3];
    channels.forEach(channel => {
      for (let note = 0; note < 128; note++) {
        this.sendNoteOff(note, channel);
      }
    });

    // Restore previous state
    this.enabled = wasEnabled;

    console.log('[MIDI] ✓ Panic complete - all notes silenced');
  }

  /**
   * Send MIDI Clock tick (0xF8) - should be sent 24 times per quarter note
   */
  sendClockTick() {
    if (!this.enabled) return; // Skip if MIDI is disabled
    if (!this.isConnected || !this.output) return;
    this.output.send([0xF8]);

    // Debug: Log occasionally to confirm clock is sending
    if (Math.random() < 0.001) { // ~1 in 1000 ticks
      console.log('[MIDI Clock] Sending clock ticks...');
    }
  }

  /**
   * Send MIDI Start (0xFA)
   */
  sendStart() {
    if (!this.enabled) return; // Skip if MIDI is disabled
    if (!this.isConnected || !this.output) return;
    console.log('[MIDI Clock] Sending Start');
    this.output.send([0xFA]);
  }

  /**
   * Send MIDI Stop (0xFC)
   */
  sendStop() {
    if (!this.enabled) return; // Skip if MIDI is disabled
    if (!this.isConnected || !this.output) return;
    console.log('[MIDI Clock] Sending Stop');
    this.output.send([0xFC]);
  }

  /**
   * Send MIDI Continue (0xFB)
   */
  sendContinue() {
    if (!this.enabled) return; // Skip if MIDI is disabled
    if (!this.isConnected || !this.output) return;
    console.log('[MIDI Clock] Sending Continue');
    this.output.send([0xFB]);
  }

  /**
   * Enable or disable all MIDI output
   * @param {boolean} enabled - True to enable, false to disable
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log(`[MIDI] ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  /**
   * Disconnect from MIDI
   */
  disconnect() {
    this.output = null;
    this.isConnected = false;
    this.selectedOutputId = null;
    console.log('[MIDI] Disconnected');
  }
}
