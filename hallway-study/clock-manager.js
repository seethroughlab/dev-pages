/**
 * Clock Manager - BPM-based timing and quantization system
 *
 * Provides quantized timing for triggering MIDI events on 16th notes
 * at a global BPM (default 120 BPM).
 */

export class ClockManager {
  constructor(bpm = 120, midiManager = null) {
    this.bpm = bpm;
    this.running = false;
    this.midiManager = midiManager;

    // Sync mode: 'internal' or 'external' (MIDI Clock)
    this.syncMode = 'internal';

    // Web Audio API for high-precision timing that works in background
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    console.log(`[Clock] Web Audio API initialized (sample rate: ${this.audioContext.sampleRate}Hz)`);

    // Timing calculations
    this.msPerBeat = 60000 / this.bpm; // Milliseconds per quarter note
    this.msPerSixteenth = this.msPerBeat / 4; // 16th note duration
    this.msPerClockTick = this.msPerBeat / 24; // MIDI Clock tick (24 per quarter note)

    // Clock state
    this.startTime = null;
    this.currentTime = 0;
    this.lastSixteenthTime = 0;
    this.lastClockTickTime = 0;
    this.sixteenthCount = 0; // Total 16th notes since start
    this.beatCount = 0; // Total beats (quarter notes) since start
    this.barCount = 0; // Total bars (4 beats) since start
    this.clockTickCount = 0; // MIDI Clock ticks sent (24 per quarter note)

    // Dedicated timer for MIDI Clock ticks (for consistent timing)
    this.clockTickInterval = null;
    this.clockTickStartTime = null; // High-resolution start time for clock tick timing
    this.nextClockTickTime = 0;

    // External MIDI Clock sync state
    this.midiClockTickCount = 0; // MIDI Clock ticks (24 per quarter note, 6 per 16th)
    this.lastClockTickTime = null;
    this.clockTickTimes = []; // Rolling buffer for BPM calculation (last 24 ticks)
    this.externalBPM = null; // Calculated BPM from MIDI Clock

    // Automatic BPM changes
    this.autoBPMEnabled = true; // Enable automatic BPM changes
    this.bpmMin = 80; // Minimum BPM
    this.bpmMax = 130; // Maximum BPM
    this.nextBPMChangeBar = this.getRandomBPMChangeInterval(); // Random interval for next BPM change

    // Quantization setting
    this.quantization = '16th'; // Options: '16th', '8th', 'quarter'
    this.eighthCount = 0; // Track 8th notes

    // Event queue for quantized events
    this.eventQueue = [];

    // Callbacks
    this.onSixteenthNote = null; // Called every 16th note
    this.onEighthNote = null; // Called every 8th note (every 2 sixteenth notes)
    this.onBeat = null; // Called every quarter note
    this.onBar = null; // Called every bar (4 beats)
    this.onBPMChange = null; // Called when BPM changes

    console.log(`[Clock] Initialized at ${this.bpm} BPM (${this.syncMode} sync)`);
    console.log(`[Clock] Quarter note: ${this.msPerBeat.toFixed(2)}ms`);
    console.log(`[Clock] 16th note: ${this.msPerSixteenth.toFixed(2)}ms`);
  }

  /**
   * Start the clock
   */
  start() {
    if (this.running) return;

    this.running = true;
    // Use audio context time (in seconds) for consistent timing
    this.startTime = this.audioContext.currentTime;
    this.currentTime = 0;
    this.lastSixteenthTime = 0;
    this.lastClockTickTime = 0;
    this.sixteenthCount = 0;
    this.beatCount = 0;
    this.barCount = 0;
    this.clockTickCount = 0;

    // Send MIDI Start message and start dedicated clock tick timer
    if (this.midiManager) {
      console.log('[Clock] MIDI Manager found, sending Start and starting MIDI Clock timer');
      this.midiManager.sendStart();

      // Use Web Audio time for accurate background timing
      // Convert to seconds for audio context
      const secPerClockTick = this.msPerClockTick / 1000;
      this.clockTickStartTime = this.audioContext.currentTime;
      this.nextClockTickTime = 0;

      // Recursive scheduling function that uses Web Audio time
      const scheduleMIDIClockTicks = () => {
        if (!this.running || !this.midiManager) return;

        const currentAudioTime = this.audioContext.currentTime;
        const elapsed = currentAudioTime - this.clockTickStartTime;

        // Calculate how many ticks should have been sent by now
        const expectedTicks = Math.floor(elapsed / secPerClockTick);

        // Send any missed ticks (usually 0 or 1)
        while (this.clockTickCount < expectedTicks) {
          this.midiManager.sendClockTick();
          this.clockTickCount++;

          // Debug: Log every 24 ticks (1 beat)
          if (this.clockTickCount % 24 === 0) {
            const beat = Math.floor(this.clockTickCount / 24);
            console.log(`[MIDI Clock Debug] Beat ${beat} (${this.clockTickCount} total ticks) at ${this.bpm} BPM`);
          }
        }

        // Schedule next check - use setTimeout but reference audio time
        // Check every 5ms, but timing accuracy comes from audioContext.currentTime
        this.clockTickInterval = setTimeout(scheduleMIDIClockTicks, 5);
      };

      // Start the recursive scheduler
      scheduleMIDIClockTicks();

      console.log(`[Clock] MIDI Clock timer started: ${this.msPerClockTick.toFixed(2)}ms per tick (${this.bpm} BPM)`);
      console.log(`[Clock] Using Web Audio timing (works in background tabs)`);

      // Debug: Confirm timer is running
      setTimeout(() => {
        console.log(`[Clock Debug] Timer check - clockTickCount: ${this.clockTickCount}, running: ${this.running}`);
      }, 1000);
    } else {
      console.warn('[Clock] ⚠️ No MIDI Manager - cannot send MIDI Clock!');
    }

    console.log('[Clock] ▶ Started');
  }

  /**
   * Stop the clock
   */
  stop() {
    if (!this.running) return;

    this.running = false;

    // Stop MIDI Clock timer and send MIDI Stop message
    if (this.clockTickInterval) {
      clearTimeout(this.clockTickInterval);
      this.clockTickInterval = null;
      console.log('[Clock] MIDI Clock timer stopped');
    }

    if (this.midiManager) {
      this.midiManager.sendStop();
    }

    console.log('[Clock] ■ Stopped');
  }

  /**
   * Reset the clock to beat 0
   */
  reset() {
    this.startTime = this.audioContext.currentTime;
    this.currentTime = 0;
    this.lastSixteenthTime = 0;
    this.sixteenthCount = 0;
    this.beatCount = 0;
    this.barCount = 0;
    this.eventQueue = [];

    console.log('[Clock] ⟲ Reset');
  }

  /**
   * Set BPM and recalculate timing
   */
  setBPM(bpm) {
    const oldMsPerSixteenth = this.msPerSixteenth;

    this.bpm = bpm;
    this.msPerBeat = 60000 / this.bpm;
    this.msPerSixteenth = this.msPerBeat / 4;
    this.msPerClockTick = this.msPerBeat / 24;

    // If running, adjust timing to maintain continuity of position
    if (this.running) {
      // Adjust the main clock start time to maintain current sixteenth position
      // Current position should remain the same, but future sixteenths will arrive at the new tempo
      const currentAudioTime = this.audioContext.currentTime;

      // Recalculate start time so that current sixteenth count is preserved
      // startTime = currentAudioTime - (currentTime at new tempo)
      // currentTime at new tempo = sixteenthCount * new msPerSixteenth
      this.startTime = currentAudioTime - ((this.sixteenthCount * this.msPerSixteenth) / 1000);

      // Also adjust MIDI clock tick timing
      const secPerClockTick = this.msPerClockTick / 1000;
      this.clockTickStartTime = currentAudioTime - (this.clockTickCount * secPerClockTick);

      console.log(`[Clock] Timing adjusted for new BPM: ${oldMsPerSixteenth.toFixed(2)}ms → ${this.msPerSixteenth.toFixed(2)}ms per 16th`);
    }

    console.log(`[Clock] BPM set to ${this.bpm} (16th note: ${this.msPerSixteenth.toFixed(2)}ms)`);
  }

  /**
   * Schedule an event to fire on the next 16th note
   * @param {Function} callback - Function to call on next 16th note
   * @param {*} data - Optional data to pass to callback
   */
  scheduleEvent(callback, data = null) {
    this.eventQueue.push({ callback, data });
  }

  /**
   * Update the clock (call this every frame)
   * @param {number} currentTime - Current performance.now() time (not used, we use audio time)
   */
  update(currentTime) {
    if (!this.running) return;

    // Use Web Audio time for consistency with MIDI Clock
    // Convert to milliseconds to match existing code
    this.currentTime = (this.audioContext.currentTime - this.startTime) * 1000;

    // Check if we've passed a 16th note boundary
    const currentSixteenth = Math.floor(this.currentTime / this.msPerSixteenth);

    if (currentSixteenth > this.sixteenthCount) {
      // We've crossed one or more 16th note boundaries
      const missedSixteenths = currentSixteenth - this.sixteenthCount;

      // Process each missed 16th note (usually just 1, but could be more if frame dropped)
      for (let i = 0; i < missedSixteenths; i++) {
        this.sixteenthCount++;
        this.lastSixteenthTime = this.currentTime;

        // Fire 16th note callback
        if (this.onSixteenthNote) {
          this.onSixteenthNote(this.sixteenthCount, this.getPosition());
        }

        // Check for 8th note boundary (every 2 sixteenth notes)
        if (this.sixteenthCount % 2 === 0) {
          this.eighthCount++;

          if (this.onEighthNote) {
            this.onEighthNote(this.eighthCount, this.getPosition());
          }
        }

        // Process event queue based on quantization setting
        let shouldProcessQueue = false;
        if (this.quantization === '16th') {
          shouldProcessQueue = true; // Every 16th note
        } else if (this.quantization === '8th') {
          shouldProcessQueue = (this.sixteenthCount % 2 === 0); // Every 8th note
        } else if (this.quantization === 'quarter') {
          shouldProcessQueue = (this.sixteenthCount % 4 === 0); // Every quarter note
        }

        if (shouldProcessQueue) {
          while (this.eventQueue.length > 0) {
            const event = this.eventQueue.shift();
            event.callback(event.data);
          }
        }

        // Check for beat boundary (every 4 sixteenth notes)
        if (this.sixteenthCount % 4 === 0) {
          this.beatCount++;

          if (this.onBeat) {
            this.onBeat(this.beatCount, this.getPosition());
          }

          // Check for bar boundary (every 4 beats = 16 sixteenth notes)
          if (this.beatCount % 4 === 0) {
            this.barCount++;

            // Check for automatic BPM change
            if (this.autoBPMEnabled && this.barCount >= this.nextBPMChangeBar && this.barCount > 0) {
              this.changeBPMAutomatically();
            }

            if (this.onBar) {
              this.onBar(this.barCount, this.getPosition());
            }
          }
        }
      }
    }
  }

  /**
   * Get the current position in the song
   * @returns {Object} Position info: bar, beat, sixteenth
   */
  getPosition() {
    const currentBar = Math.floor(this.beatCount / 4) + 1;
    const currentBeat = (this.beatCount % 4) + 1;
    const currentSixteenth = (this.sixteenthCount % 4) + 1;

    return {
      bar: currentBar,
      beat: currentBeat,
      sixteenth: currentSixteenth,
      totalSixteenths: this.sixteenthCount,
      totalBeats: this.beatCount,
      totalBars: this.barCount
    };
  }

  /**
   * Get time until next 16th note (in milliseconds)
   */
  getTimeUntilNext16th() {
    if (!this.running) return 0;

    const nextSixteenthTime = (this.sixteenthCount + 1) * this.msPerSixteenth;
    return Math.max(0, nextSixteenthTime - this.currentTime);
  }

  /**
   * Get a visual indicator for where we are in the current beat (0.0 - 1.0)
   * Useful for animating a metronome
   */
  getBeatProgress() {
    if (!this.running) return 0;

    const beatProgress = (this.currentTime % this.msPerBeat) / this.msPerBeat;
    return beatProgress;
  }

  /**
   * Get a random interval (in bars) for the next BPM change (4-12 bars)
   */
  getRandomBPMChangeInterval() {
    return 4 + Math.floor(Math.random() * 9); // Random between 4 and 12
  }

  /**
   * Change BPM automatically to a new random value
   */
  changeBPMAutomatically() {
    if (!this.autoBPMEnabled) return;

    // Generate new random BPM within range
    const oldBPM = this.bpm;
    const newBPM = this.bpmMin + Math.floor(Math.random() * (this.bpmMax - this.bpmMin + 1));

    console.log(`[Clock] 🔄 Auto BPM change: ${oldBPM} → ${newBPM} BPM (at bar ${this.barCount})`);

    this.setBPM(newBPM);

    // Call BPM change callback
    if (this.onBPMChange) {
      this.onBPMChange(newBPM, oldBPM);
    }

    // Set next change interval
    this.nextBPMChangeBar = this.barCount + this.getRandomBPMChangeInterval();
    console.log(`[Clock] Next BPM change in ${this.nextBPMChangeBar - this.barCount} bars (bar ${this.nextBPMChangeBar})`);
  }

  /**
   * Enable or disable automatic BPM changes
   */
  setAutoBPMEnabled(enabled) {
    this.autoBPMEnabled = enabled;
    console.log(`[Clock] Auto BPM changes ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Set quantization resolution
   */
  setQuantization(quantization) {
    if (quantization !== '16th' && quantization !== '8th' && quantization !== 'quarter') {
      console.error(`[Clock] Invalid quantization: ${quantization}`);
      return;
    }

    this.quantization = quantization;
    console.log(`[Clock] Quantization set to: ${quantization} notes`);
  }

  /**
   * Set sync mode: 'internal' or 'external'
   */
  setSyncMode(mode) {
    if (mode !== 'internal' && mode !== 'external') {
      console.error(`[Clock] Invalid sync mode: ${mode}`);
      return;
    }

    this.syncMode = mode;
    console.log(`[Clock] Sync mode set to: ${mode}`);

    // Reset clock state when switching modes
    if (this.running) {
      this.reset();
    }
  }

  /**
   * Handle incoming MIDI Clock tick (0xF8)
   * Called by MIDIManager when external sync is active
   */
  handleMIDIClockTick(timeStamp) {
    if (this.syncMode !== 'external' || !this.running) return;

    // Track timing for BPM calculation
    if (this.lastClockTickTime !== null) {
      const timeSinceLastTick = timeStamp - this.lastClockTickTime;
      this.clockTickTimes.push(timeSinceLastTick);

      // Keep only last 24 ticks (1 quarter note) for BPM calculation
      if (this.clockTickTimes.length > 24) {
        this.clockTickTimes.shift();
      }

      // Calculate BPM from average tick interval
      if (this.clockTickTimes.length >= 24) {
        const avgTickInterval = this.clockTickTimes.reduce((a, b) => a + b, 0) / this.clockTickTimes.length;
        // 24 ticks per quarter note, so: BPM = 60000 / (avgTickInterval * 24)
        this.externalBPM = Math.round(60000 / (avgTickInterval * 24));

        // Update internal BPM for display
        if (this.externalBPM !== this.bpm) {
          this.bpm = this.externalBPM;
          this.msPerBeat = 60000 / this.bpm;
          this.msPerSixteenth = this.msPerBeat / 4;
        }
      }
    }

    this.lastClockTickTime = timeStamp;
    this.midiClockTickCount++;

    // Every 6 ticks = 1 sixteenth note (24 ticks per quarter note / 4)
    if (this.midiClockTickCount % 6 === 0) {
      this.sixteenthCount++;
      this.lastSixteenthTime = this.audioContext.currentTime * 1000;

      // Fire 16th note callback
      if (this.onSixteenthNote) {
        this.onSixteenthNote(this.sixteenthCount, this.getPosition());
      }

      // Process event queue
      while (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift();
        event.callback(event.data);
      }

      // Check for beat boundary (every 4 sixteenth notes = 24 clock ticks)
      if (this.midiClockTickCount % 24 === 0) {
        this.beatCount++;

        if (this.onBeat) {
          this.onBeat(this.beatCount, this.getPosition());
        }

        // Check for bar boundary (every 4 beats = 96 clock ticks)
        if (this.midiClockTickCount % 96 === 0) {
          this.barCount++;

          if (this.onBar) {
            this.onBar(this.barCount, this.getPosition());
          }
        }
      }
    }
  }

  /**
   * Handle MIDI Start message (0xFA)
   */
  handleMIDIStart() {
    if (this.syncMode !== 'external') return;

    console.log('[Clock] ▶ Started (MIDI Start)');
    this.running = true;
    this.startTime = this.audioContext.currentTime;
    this.currentTime = 0;
    this.lastSixteenthTime = 0;
    this.sixteenthCount = 0;
    this.beatCount = 0;
    this.barCount = 0;
    this.midiClockTickCount = 0;
    this.lastClockTickTime = null;
    this.clockTickTimes = [];
  }

  /**
   * Handle MIDI Stop message (0xFC)
   */
  handleMIDIStop() {
    if (this.syncMode !== 'external') return;

    console.log('[Clock] ■ Stopped (MIDI Stop)');
    this.running = false;
  }

  /**
   * Handle MIDI Continue message (0xFB)
   */
  handleMIDIContinue() {
    if (this.syncMode !== 'external') return;

    console.log('[Clock] ▶ Continued (MIDI Continue)');
    this.running = true;
    this.lastClockTickTime = null; // Reset timing for BPM calculation
  }

  /**
   * Get info for debugging/display
   */
  getInfo() {
    const pos = this.getPosition();
    return {
      running: this.running,
      bpm: this.syncMode === 'external' && this.externalBPM ? this.externalBPM : this.bpm,
      syncMode: this.syncMode,
      position: `${pos.bar}:${pos.beat}:${pos.sixteenth}`,
      totalSixteenths: this.sixteenthCount,
      msPerSixteenth: this.msPerSixteenth.toFixed(2),
      timeUntilNext: this.getTimeUntilNext16th().toFixed(0)
    };
  }
}
