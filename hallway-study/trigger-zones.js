/**
 * Trigger Zones - 48 triggers along hallway length, divided into 3 zones
 *
 * Zone 1 (Bass): Triggers 0-15, Channel 1
 * Zone 2 (Pads): Triggers 16-31, Channel 2
 * Zone 3 (Lead): Triggers 32-47, Channel 3
 */

export class TriggerZone {
  constructor(hallway, keyManager = null, chordManager = null) {
    this.hallway = hallway;
    this.keyManager = keyManager;
    this.chordManager = chordManager;

    // Constants
    this.TOTAL_TRIGGERS = 48;
    this.TRIGGERS_PER_ZONE = 16;
    this.NUM_ZONES = 3;

    // Zone definitions with octave offsets
    this.zones = [
      { id: 1, name: 'Zone 1 (Bass)', channel: 1, color: '#ff4466', octaveOffset: -1 },      // Red, lower octave
      { id: 2, name: 'Zone 2 (Pads)', channel: 2, color: '#44ff66', octaveOffset: 0 },       // Green, middle octave
      { id: 3, name: 'Zone 3 (Lead)', channel: 3, color: '#4466ff', octaveOffset: 1 }        // Blue, higher octave
    ];

    // Build trigger array
    this.triggers = this.buildTriggers();

    // Track active triggers (which people are currently in which triggers)
    this.activeTriggers = new Set(); // Set of trigger IDs that are currently active

    console.log(`[Triggers] Created ${this.TOTAL_TRIGGERS} triggers in ${this.NUM_ZONES} zones`);
    this.logChordToneDistribution();
  }

  /**
   * Build array of trigger objects with positions and zone info
   */
  buildTriggers() {
    const triggers = [];
    const { length_m, width_m } = this.hallway;

    const triggerLength = length_m / this.TOTAL_TRIGGERS;

    for (let i = 0; i < this.TOTAL_TRIGGERS; i++) {
      // Determine which zone this trigger belongs to
      const zoneIndex = Math.floor(i / this.TRIGGERS_PER_ZONE);
      const zone = this.zones[zoneIndex];
      const triggerIndexInZone = i % this.TRIGGERS_PER_ZONE;

      // Calculate position (Z is along hallway length)
      // Z position is measured from 0 to length_m
      const zStart = i * triggerLength;
      const zEnd = (i + 1) * triggerLength;
      const zCenter = (zStart + zEnd) / 2;

      // Triggers span the full width of the hallway
      const xMin = -width_m / 2;
      const xMax = width_m / 2;

      // MIDI note mapping using scale degrees from chord patterns
      // Get current chord patterns from ChordManager (or use defaults)
      let chordPatterns;
      let currentChord = null;
      if (this.chordManager) {
        const patterns = this.chordManager.getChordPatterns();
        currentChord = this.chordManager.getCurrentChord();
        chordPatterns = {
          1: patterns.bass,
          2: patterns.pads,
          3: patterns.lead
        };
      } else {
        // Fallback to static patterns if no chord manager
        chordPatterns = {
          1: [0, 4, 0, 4, 7, 4, 0, 7, 0, 4, 7, 0, 4, 7, 0, 4],  // Bass: Roots and fifths
          2: [0, 2, 4, 7, 0, 2, 4, 7, 8, 10, 12, 15, 8, 10, 12, 15],  // Pads: Full chord tones
          3: [2, 4, 7, 9, 11, 12, 14, 2, 4, 7, 9, 11, 12, 14, 4, 7]   // Lead: Melodic upper extensions
        };
      }

      const scaleDegree = chordPatterns[zone.id][triggerIndexInZone];
      const octaveOffset = zone.octaveOffset;

      // Determine chord tone type (root, third, fifth, seventh, ninth, etc.)
      let chordToneType = 'unknown';
      if (currentChord) {
        const normalizedDegree = scaleDegree % 8; // Normalize to single octave
        if (normalizedDegree === currentChord.root % 8) chordToneType = 'root';
        else if (normalizedDegree === currentChord.third % 8) chordToneType = '3rd';
        else if (normalizedDegree === currentChord.fifth % 8) chordToneType = '5th';
        else if (normalizedDegree === currentChord.seventh % 8) chordToneType = '7th';
        else if (normalizedDegree === currentChord.ninth % 8) chordToneType = '9th';
        else if (normalizedDegree === currentChord.eleventh % 8) chordToneType = '11th';
        else if (normalizedDegree === currentChord.thirteenth % 8) chordToneType = '13th';
      }

      // Get MIDI note from key manager (or use fallback if no key manager)
      let midiNote;
      if (this.keyManager) {
        midiNote = this.keyManager.getNote(scaleDegree, octaveOffset);
      } else {
        // Fallback to chromatic scale if no key manager
        const baseNote = 36 + (zoneIndex * 16);
        midiNote = baseNote + triggerIndexInZone;
      }

      triggers.push({
        id: i,
        zoneId: zone.id,
        zoneName: zone.name,
        channel: zone.channel,
        color: zone.color,
        indexInZone: triggerIndexInZone,

        // Spatial bounds
        zStart,
        zEnd,
        zCenter,
        xMin,
        xMax,

        // MIDI info
        scaleDegree,  // Store scale degree for chord updates
        midiNote,
        chordToneType,  // Type of chord tone (root, 3rd, 5th, 7th, 9th, 11th, 13th)

        // State
        isActive: false,
        peopleInside: new Set() // Set of person IDs currently in this trigger
      });
    }

    return triggers;
  }

  /**
   * Check if a position (x, z) is inside a trigger
   * @param {number} x - X position in hallway coordinates
   * @param {number} z - Z position in hallway coordinates (0 to length_m)
   * @returns {object|null} - Trigger object if inside one, null otherwise
   */
  getTriggerAtPosition(x, z) {
    for (const trigger of this.triggers) {
      if (x >= trigger.xMin && x <= trigger.xMax &&
          z >= trigger.zStart && z < trigger.zEnd) {
        return trigger;
      }
    }
    return null;
  }

  /**
   * Get all triggers in a specific zone
   * @param {number} zoneId - Zone ID (1, 2, or 3)
   */
  getTriggersInZone(zoneId) {
    return this.triggers.filter(t => t.zoneId === zoneId);
  }

  /**
   * Get zone info by ID
   */
  getZone(zoneId) {
    return this.zones.find(z => z.id === zoneId);
  }

  /**
   * Mark a trigger as active (person entered)
   */
  activateTrigger(triggerId, personId) {
    const trigger = this.triggers[triggerId];
    if (!trigger) return;

    trigger.peopleInside.add(personId);
    trigger.isActive = true;
    this.activeTriggers.add(triggerId);
  }

  /**
   * Mark a trigger as inactive (person left)
   */
  deactivateTrigger(triggerId, personId) {
    const trigger = this.triggers[triggerId];
    if (!trigger) return;

    trigger.peopleInside.delete(personId);

    // Only mark as inactive if no one is inside
    if (trigger.peopleInside.size === 0) {
      trigger.isActive = false;
      this.activeTriggers.delete(triggerId);
    }
  }

  /**
   * Update MIDI notes for all triggers based on current key
   * Call this when the key changes (keeps same scale degrees, changes pitches)
   */
  updateMIDINotes() {
    if (!this.keyManager) return;

    for (const trigger of this.triggers) {
      const zoneIndex = trigger.zoneId - 1;
      const zone = this.zones[zoneIndex];
      const scaleDegree = trigger.scaleDegree; // Use stored scale degree
      const octaveOffset = zone.octaveOffset;

      trigger.midiNote = this.keyManager.getNote(scaleDegree, octaveOffset);
    }

    console.log('[Triggers] MIDI notes updated for new key');
  }

  /**
   * Update chord patterns for all triggers based on current chord
   * Call this when the chord changes (changes scale degrees, then recalculates pitches)
   */
  updateChordPatterns() {
    if (!this.chordManager) return;

    // Get new chord patterns and current chord
    const patterns = this.chordManager.getChordPatterns();
    const currentChord = this.chordManager.getCurrentChord();
    const chordPatterns = {
      1: patterns.bass,
      2: patterns.pads,
      3: patterns.lead
    };

    // Update each trigger's scale degree, MIDI note, and chord tone type
    for (const trigger of this.triggers) {
      const zoneIndex = trigger.zoneId - 1;
      const zone = this.zones[zoneIndex];
      const triggerIndexInZone = trigger.indexInZone;

      // Update scale degree from new chord pattern
      const scaleDegree = chordPatterns[zone.id][triggerIndexInZone];
      trigger.scaleDegree = scaleDegree;

      // Determine chord tone type
      const normalizedDegree = scaleDegree % 8;
      if (normalizedDegree === currentChord.root % 8) trigger.chordToneType = 'root';
      else if (normalizedDegree === currentChord.third % 8) trigger.chordToneType = '3rd';
      else if (normalizedDegree === currentChord.fifth % 8) trigger.chordToneType = '5th';
      else if (normalizedDegree === currentChord.seventh % 8) trigger.chordToneType = '7th';
      else if (normalizedDegree === currentChord.ninth % 8) trigger.chordToneType = '9th';
      else if (normalizedDegree === currentChord.eleventh % 8) trigger.chordToneType = '11th';
      else if (normalizedDegree === currentChord.thirteenth % 8) trigger.chordToneType = '13th';
      else trigger.chordToneType = 'unknown';

      // Recalculate MIDI note with new scale degree
      const octaveOffset = zone.octaveOffset;
      if (this.keyManager) {
        trigger.midiNote = this.keyManager.getNote(scaleDegree, octaveOffset);
      }
    }

    console.log('[Triggers] Chord patterns updated for new chord');
    this.logChordToneDistribution();
  }

  /**
   * Log chord tone distribution for each zone
   */
  logChordToneDistribution() {
    console.log('[Triggers] Chord Tone Distribution:');

    for (const zone of this.zones) {
      const zoneTriggers = this.getTriggersInZone(zone.id);
      const distribution = {};

      zoneTriggers.forEach(trigger => {
        const type = trigger.chordToneType;
        distribution[type] = (distribution[type] || 0) + 1;
      });

      const sortedTypes = Object.entries(distribution).sort((a, b) => b[1] - a[1]);
      const summary = sortedTypes.map(([type, count]) => `${type}(${count})`).join(', ');

      console.log(`  ${zone.name}: ${summary}`);
    }
  }

  /**
   * Get debug info for display
   */
  getDebugInfo() {
    return {
      totalTriggers: this.TOTAL_TRIGGERS,
      activeTriggers: this.activeTriggers.size,
      zones: this.zones.map(zone => ({
        id: zone.id,
        name: zone.name,
        activeCount: this.getTriggersInZone(zone.id).filter(t => t.isActive).length
      }))
    };
  }
}
