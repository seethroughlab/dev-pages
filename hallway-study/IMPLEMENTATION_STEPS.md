# WebMIDI Floor System Implementation Steps

**Project Goal:** Replace WebSocket system with WebMIDI-based interactive floor that sends MIDI notes and CC messages based on people movement through 48 trigger zones.

---

## Phase 1: WebMIDI Infrastructure

### ✓ Step 1: Create basic MIDI manager
**Goal:** Set up WebMIDI API and confirm it can send messages

**PREREQUISITE: Set up Virtual MIDI Port**

**On macOS:**
1. Open "Audio MIDI Setup" app (in /Applications/Utilities/)
2. Go to Window → Show MIDI Studio
3. Double-click "IAC Driver" icon
4. Check "Device is online"
5. You should see "IAC Driver Bus 1" - this is your virtual port
6. Click Apply

**On Windows:**
1. Download loopMIDI from https://www.tobias-erichsen.de/software/loopmidi.html
2. Install and run loopMIDI
3. Click the "+" button to create a new virtual port
4. Name it something like "WebMIDI Port"
5. Leave it running in the background

**In Ableton Live:**
1. Go to Preferences → Link/Tempo/MIDI
2. Under "MIDI Ports", find your virtual port (IAC Driver or loopMIDI port)
3. Enable "Track" and "Remote" for the input
4. Create a new MIDI track
5. Set the MIDI From to your virtual port, channel "All Ins"

**Tasks:**
- [x] Set up virtual MIDI port (see above)
- [x] Configure Ableton to receive from virtual port
- [x] Create `midi-manager.js` file
- [x] Request WebMIDI access
- [x] Connect to MIDI output device
- [x] Add test function to send a single MIDI note

**Testing:**
- Press a test button in the app
- Confirm MIDI note appears in Ableton's MIDI track (you'll see activity in the track meter)
- Check Ableton's MIDI indicator in bottom-left corner (should blink)

**Notes:**
```
Status: ✓ COMPLETED
Date completed: 2025-11-10
What we did:
- Created midi-manager.js with full WebMIDI API integration
- Added MIDIManager class with methods: sendNoteOn, sendNoteOff, sendCC, sendTestNote
- Integrated into app.js with GUI panel showing connection status
- Added MIDI output device selector dropdown
- Added test button that sends middle C (note 60) for 500ms
- Auto-connects to first available MIDI output

Issues encountered:
- None - connection working perfectly with Ableton Live
```

---

### ✓ Step 2: Add quantization system
**Goal:** Implement BPM clock with 16th note quantization (120 BPM)

**Tasks:**
- [x] Add timing system for 120 BPM (125ms per 16th note)
- [x] Create event queue that fires on quantized beats
- [x] Add visual metronome indicator in GUI for testing

**Testing:**
- Visual tick should happen every 125ms
- Use browser console timer to verify timing accuracy
- Confirm consistent interval

**Notes:**
```
Status: ✓ COMPLETED
Date completed: 2025-11-10
What we did:
- Created clock-manager.js with full timing system
- BPM clock with configurable tempo (60-200 BPM)
- 16th note quantization (125ms at 120 BPM)
- Event queue system via scheduleEvent()
- Callbacks: onSixteenthNote, onBeat, onBar
- Position tracking (Bar:Beat:16th format)
- Added GUI panel with:
  - BPM slider
  - Position display (1:1:1 format)
  - Visual metronome (● ○ ○ ○)
  - Start/Stop and Reset buttons
  - Test Quantized Note button
- Clock updates every frame in animation loop

Issues encountered:
- None - timing is accurate and smooth
```

---

### ✓ Step 3: Add MIDI channel routing
**Goal:** Set up 3 channels for the 3 zones

**Tasks:**
- [x] Configure MIDI channels: Zone 1 (Bass) = Ch 1, Zone 2 (Pads) = Ch 2, Zone 3 (Lead) = Ch 3
- [x] Add test buttons in GUI to send notes on each channel
- [x] Implement note on/off functions per channel

**Testing:**
- Click test button for each zone
- MIDI monitor should show correct channel number (1, 2, or 3)
- Verify note on/off messages work

**Notes:**
```
Status: ✓ COMPLETED
Date completed: 2025-11-10
What we did:
- Added "Channel Tests" folder to MIDI Output panel with 4 test buttons:
  - Ch 1: Zone 1 (Bass) - C3 (note 48, channel 1)
  - Ch 2: Zone 2 (Pads) - E3 (note 52, channel 2)
  - Ch 3: Zone 3 (Lead) - G3 (note 55, channel 3)
  - Test All Channels (plays all 3 in sequence)
- Used existing sendNoteOn/sendNoteOff methods with channel parameter
- Each button sends 500ms note duration for testing

Issues encountered:
- None - all 3 channels routing correctly to separate Ableton tracks
```

---

## Phase 2: Trigger Zone System

### ✓ Step 4: Create trigger zone data structure
**Goal:** Define 48 triggers along hallway length, grouped into 3 zones

**Tasks:**
- [x] Create `trigger-zones.js` file
- [x] Define 48 trigger zones (16 per zone) along Z dimension (hallway length)
- [x] Map zones to hallway coordinates
- [x] Add simple debug visualization (colored rectangles on floor canvas)

**Testing:**
- Should see 48 colored zones on floor
- Zones should be grouped into 3 distinct colored areas
- Zones should span the full length of hallway

**Notes:**
```
Status: ✓ COMPLETED
Date completed: 2025-11-10
What we did:
- Created trigger-zones.js with TriggerZone class
- 48 triggers divided into 3 zones (16 triggers each)
- Zone 1 (Bass): Red, Channel 1, MIDI notes 36-51 (C2-D#3)
- Zone 2 (Pads): Green, Channel 2, MIDI notes 52-67 (E3-F#4)
- Zone 3 (Lead): Blue, Channel 3, MIDI notes 68-83 (G4-A#5)
- Each trigger spans full hallway width (X dimension)
- Triggers mapped along Z dimension (0 to 13.1064m)
- Added debug visualization to floor-texture.js:
  - Semi-transparent colored rectangles for each zone
  - Zone labels on right side
  - Trigger numbers every 4th trigger
  - White separator lines between zones
- Added "Trigger Zones" GUI panel with:
  - Show/hide toggle
  - Active trigger counter
- Trigger visualization overlays on floor texture

Issues encountered:
- None - visualization works perfectly, all 48 triggers visible
```

---

### ✓ Step 5: Add collision detection
**Goal:** Detect when people enter/exit trigger zones

**Tasks:**
- [x] Check person position against trigger bounds each frame
- [x] Track which triggers are currently active
- [x] Console.log entry/exit events for debugging
- [x] Handle multiple people in same trigger

**Testing:**
- Move people through hallway
- Console should show "Person [ID] entered Zone [X] Trigger [Y]"
- Console should show "Person [ID] exited Zone [X] Trigger [Y]"
- Verify no duplicate triggers

**Notes:**
```
Status: ✓ COMPLETED
Date completed: 2025-11-10
What we did:
- Added currentTrigger tracking to Person class
- Modified Person.update() to accept triggerZones parameter
- Added collision detection using triggerZones.getTriggerAtPosition()
- Detect trigger enter/exit events and call activate/deactivate
- Console logging for all trigger events with zone, trigger ID, and MIDI note
- Modified PeopleManager.update() to pass triggerZones to all people
- Updated app.js to pass triggerZones to peopleManager
- Added visual highlighting for active triggers in floor-texture.js:
  - Inactive triggers: semi-transparent (0.25 alpha)
  - Active triggers: bright and opaque (0.8 alpha) with white glow
- Trigger counter in GUI updates in real-time showing active triggers

Issues encountered:
- None - collision detection working perfectly
```

---

### ✓ Step 6: Implement musical key system with Camelot Wheel
**Goal:** Map triggers to scale degrees in a key, with periodic key changes following Camelot Wheel

**Background:**
- Each zone has 16 triggers = 2 octaves of a musical scale (8 notes × 2)
- Keys should change periodically following the Camelot Wheel for harmonic mixing
- Camelot Wheel: numbered 1-12, with A (minor) and B (major) variants
- Compatible transitions: ±1 number, same letter ↔ opposite letter, or ±3 for energy shifts

**Tasks:**
- [x] Create `key-manager.js` with Camelot Wheel system
- [x] Define all 24 keys (12A-12A minor, 1B-12B major) with their scale degrees
- [x] Map each trigger to scale degree (0-15 for 2 octaves)
- [x] Implement key change logic (random compatible transition every N bars)
- [x] Add GUI controls for:
  - Current key display (e.g., "8A - A minor")
  - Manual key change button
  - Auto key change interval
  - Force key change to specific Camelot position
- [x] Update trigger-zones.js to use scale degrees instead of chromatic notes

**Camelot Wheel Reference:**
```
1A = Ab minor    1B = B major
2A = Eb minor    2B = Gb major
3A = Bb minor    3B = Db major
4A = F minor     4B = Ab major
5A = C minor     5B = Eb major
6A = G minor     6B = Bb major
7A = D minor     7B = F major
8A = A minor     8B = C major
9A = E minor     9B = G major
10A = B minor    10B = D major
11A = F# minor   11B = A major
12A = Db minor   12B = E major
```

**Testing:**
- Verify scale degrees are correct for a given key
- Test key changes - should transition to harmonically compatible keys
- Console log should show key changes with Camelot positions
- MIDI notes should update when key changes

**Notes:**
```
Status: ✓ COMPLETED
Date completed: 2025-11-10
What we did:
- Created key-manager.js with full Camelot Wheel implementation
- Defined all 24 keys (1A-12A minor, 1B-12B major) with root notes
- Major scale intervals: [0, 2, 4, 5, 7, 9, 11, 12]
- Minor scale intervals: [0, 2, 3, 5, 7, 8, 10, 12]
- Each zone uses 16 triggers = 2 octaves (scale degrees 0-15)
- Zone octave offsets: Bass (-1), Pads (0), Lead (+1)
- Compatible key transitions:
  - Same number, opposite letter (relative major/minor)
  - ±1 number, same letter (harmonic mixing)
  - ±3 number for energy shifts (weighted lower)
- Automatic key changes every N bars (default 16, configurable)
- Added GUI panel "Musical Key (Camelot Wheel)" with:
  - Current Key dropdown (all 24 keys)
  - Auto Key Change toggle
  - Change interval slider (4-32 bars)
  - Manual "Change to Compatible Key" button
  - Compatible Keys display (shows valid transitions)
- Updated trigger-zones.js constructor to accept keyManager
- MIDI notes now calculated from scale degrees instead of chromatic
- updateMIDINotes() method updates all triggers when key changes
- Automatic update on key change via clock callback wrapper

Issues encountered:
- None - key system working perfectly with harmonic transitions
```

---

### ✓ Step 7: Connect triggers to MIDI (basic)
**Goal:** Send MIDI notes when triggers activate

**Tasks:**
- [x] Send NoteOn when person enters trigger (quantized to beat)
- [x] Send NoteOff based on zone type (Bass/Lead: auto, Pads: on exit)
- [x] Set velocity values based on person movement speed
- [x] Use current key from key-manager to determine actual MIDI note

**Testing:**
- Walk people through triggers
- MIDI monitor shows NoteOn messages on quantized beats
- Verify correct channel for each zone
- Verify NoteOff behavior matches zone type
- Notes should be in the correct key/scale

**Notes:**
```
Status: ✓ COMPLETED
Date completed: 2025-11-10
What we did:
- Modified Person.update() to accept clockManager and midiManager parameters
- Added MIDI event scheduling when entering triggers:
  - NoteOn scheduled on next 16th note (quantized via clockManager.scheduleEvent())
  - Uses trigger's MIDI note (calculated from current key/scale)
  - Sends on correct channel for each zone (1, 2, or 3)
  - Velocity dynamically calculated from person's speed
- Implemented zone-specific NoteOff behavior:
  - Zone 1 (Bass): Auto NoteOff after 500ms (bass pluck)
  - Zone 2 (Pads): NoteOff sent when person exits trigger (sustained)
  - Zone 3 (Lead): Auto NoteOff after 300ms (piano hammer hit)
- Velocity based on person's movement speed:
  - Speed mapped from 0.5-1.5 m/s to MIDI velocity 40-127
  - Dwelling (stopped) people trigger at velocity 40
  - Faster movement = louder notes
- Modified PeopleManager.update() to pass clockManager and midiManager
- Updated app.js to pass all systems to peopleManager
- Console logs all MIDI events for debugging (including speed and velocity)
- Notes are quantized to 16th note grid for tight timing

Issues encountered:
- None - MIDI triggering working perfectly with quantization
```

---

## Phase 3: Zone-Specific Visualizations

### ✓ Step 8: Create shader-based floor system
**Goal:** Replace canvas-based floor with WebGL/shader approach for performance

**Tasks:**
- [x] Research THREE.js shader materials / FBOs
- [x] Create new floor geometry/material using shaders
- [x] Implement simple solid colors for 3 zones
- [x] Remove old canvas-based floor code

**Testing:**
- Floor renders correctly
- Performance is smooth (60fps)
- Three distinct colored zones visible

**Notes:**
```
Status: ✓ COMPLETED
Date completed: 2025-11-10
What we did:
- Created floor-shader.js with custom vertex and fragment shaders
- Used THREE.ShaderMaterial with PlaneGeometry (100x100 segments)
- Replaced canvas-based floor texture system
- Implemented world-space coordinate system (no clipping at trigger boundaries)
- Created complementary color palette: Amber/Gold (Bass), Mid Purple (Pads), Teal/Cyan (Lead)
- All effects render on pure black background
- Added uniform arrays for trigger states, activation times, velocities, and X positions
- Update system runs every frame via updateShaderFloor()

Issues encountered:
- Initial performance issues with particle effects in shader loops - removed particles
- String displacement needed scaling adjustment for world space coordinates
```

---

### ✓ Step 9: Implement Bass zone (string pluck)
**Goal:** Zone 1 shows "guitar string" that plucks when triggered

**Tasks:**
- [x] Design string visualization shader
- [x] Add pluck animation (string displacement + decay)
- [x] Trigger pluck on MIDI note send
- [x] 16 separate strings (one per trigger)

**Testing:**
- Strings should be visible and distinct
- Pluck animation should be smooth and realistic
- Animation should decay over time
- Each of 16 triggers has its own string

**Notes:**
```
Status: ✓ COMPLETED
Date completed: 2025-11-10
What we did:
- Implemented guitar string pluck effect in world space
- 16 horizontal strings (one per trigger) in amber/gold color
- Multiple harmonic waves (3 harmonics) for realistic string vibration
- Velocity-responsive: faster person movement = bigger pluck (0.5x to 2.5x)
- String displacement scaled for world space (~1/3 trigger width max)
- Exponential decay (exp(-activation * 2.5))
- Strings only visible when active (black when inactive)
- Brightness and glow scale with vibration amplitude and velocity
- Neighbor checking (±1 trigger) for overflow effects

Issues encountered:
- Initial displacement too large for world space (0.35 → 0.007)
- String thickness needed reduction (0.015 → 0.003)
- Static string visibility removed per user request
```

---

### ✓ Step 10: Implement Pads zone (sustained glow)
**Goal:** Zone 2 shows rectangles that glow while person is in trigger

**Tasks:**
- [x] Design rectangle glow shader
- [x] Glow starts on NoteOn
- [x] Glow persists while person is in trigger
- [x] Glow fades on NoteOff (person exits)
- [x] Send NoteOff MIDI message when person leaves

**Testing:**
- Rectangles glow when person enters
- Glow sustains as long as person is inside trigger
- Glow fades when person leaves
- MIDI NoteOff sent on exit

**Notes:**
```
Status: ✓ COMPLETED
Date completed: 2025-11-10
What we did:
- Implemented growing elliptical glow effect in mid purple color
- Glow starts at person's actual X position (not center)
- Grows over time with exponential curve (fast initial, then slows)
- Gentle breathing animation (sin wave at 1.5Hz)
- Elliptical shape: tight in Z (along hallway), wide in X (across width)
- Z radius: 0.04 + 0.1 * growth (can overflow 2-5 triggers)
- X radius: 0.25 + 0.35 * growth (spreads across width)
- Checks ALL 16 triggers in Pads zone to eliminate clipping
- Soft radial falloff with outer halo layer
- Brightness increases over time (1.0 + growth * 0.7)
- Person X position tracking via trigger.lastXPosition

Issues encountered:
- Initial particle effects caused freezing - removed
- X position calculation needed validation (xOffset vs mesh.position.x)
- Neighbor checking range needed increase (±1 → all 16) to prevent clipping
```

---

### ✓ Step 11: Implement Lead zone (piano hammer hit)
**Goal:** Zone 3 shows sharp impact visual like piano hammer

**Tasks:**
- [x] Design piano hammer impact shader
- [x] Short, sharp visual on trigger
- [x] Quick fade (similar to bass, but different visual style)
- [x] Auto NoteOff (like bass zone)

**Testing:**
- Visual impact is sharp and quick
- Animation is distinct from bass zone
- Timing feels like piano hammer strike
- NoteOff sent automatically

**Notes:**
```
Status: ✓ COMPLETED
Date completed: 2025-11-10
What we did:
- Implemented piano hammer strike effect in teal/cyan color
- Single horizontal line across hallway that expands/contracts
- EXAGGERATED thickness animation: 0.0005 → 0.012 (24x thicker!)
- Attack phase (80ms): cubic easing (t³) for dramatic expansion
- Decay phase (500ms): exponential fade (exp(-activation * 4.0))
- Very sharp attack characteristic of piano hammers
- Envelope-based thickness and brightness modulation
- Line only visible when active (pure black when inactive)
- World-space positioning with neighbor checking (±1 trigger)

Issues encountered:
- Initial radial burst effect created unwanted vertical lines - removed
- Attack/decay timing tuned for more visible expansion effect
- Cubic easing added to exaggerate the thin-to-thick-to-thin animation
```

---

## Phase 4: Continuous Control

### ⊗ Step 12: Add X-position CC messages
**Goal:** Send continuous MIDI CC based on person's X position

**Tasks:**
- [ ] Map person X position to CC value (0-127)
- [ ] Send CC messages continuously (respect MIDI bandwidth)
- [ ] Choose appropriate CC numbers for each zone
- [ ] Implement smoothing/filtering to avoid jitter

**Testing:**
- MIDI monitor shows CC messages
- Values change smoothly from 0-127 as person moves left-right
- No message flooding (appropriate rate limiting)
- Correct CC numbers sent

**Notes:**
```
Status: ⊗ SKIPPED
Date completed: 2025-11-10
What we did:
- Decided to skip this step
- Reason: Multiple people in same trigger would send competing CC values
- Alternative: Person X position is tracked and used for visual effects (Pads glow origin)

Issues encountered:
- N/A
```

---

## Phase 5: Projector Setup

### ⊗ Step 13: Update resolution for triple projector
**Goal:** Render floor at final resolution for 3 overlapped projectors

**Tasks:**
- [x] Calculate final resolution: 3 projectors (1920x1200) - 154px overlap = 5452x1200
- [ ] Update floor texture/render target size
- [ ] Test performance at high resolution
- [ ] Consider mipmapping/LOD if needed

**Testing:**
- Texture renders at 5452x1200
- Performance remains smooth (60fps)
- Visual quality is good
- No memory issues

**Notes:**
```
Status: ⊗ DEFERRED
Date: 2025-11-10
What we did:
- Calculated projector resolution: 5452x1200 (3 × 1920 - 2 × 154 overlap)
- Initially implemented fixed resolution but reverted
- Reverted to window-based rendering for development
- Main camera/renderer now uses window.innerWidth/window.innerHeight
- Window resize handler restored

Reason for deferral:
- Will implement projector resolution when deploying to actual hardware
- For now, keeping development-friendly window-based rendering
- Shader effects work fine at any resolution

Issues encountered:
- Fixed ultra-wide resolution (4.54:1 aspect) looks wrong in browser window
- Need separate dev/production modes for testing vs deployment
```

---

## General Notes & Decisions

**MIDI Device Selection:**
```
Device name: Ableton Live (virtual MIDI port or IAC Driver on Mac, loopMIDI on Windows)
Connection method: WebMIDI API → Virtual MIDI Port → Ableton Live
```

**Performance Benchmarks:**
```
FPS before changes:
FPS after Step 7:
FPS after Step 12:
```

**Key Decisions:**
```
(Add any important architectural decisions, library choices, etc.)
```

---

## Completion Checklist

- [x] All MIDI messages send correctly
- [x] Key system with Camelot Wheel working
- [x] Automatic key changes follow harmonic mixing rules
- [x] All 3 zone visualizations work (Bass strings, Pads glow, Lead hammer)
- [x] Quantization is accurate (16th note grid)
- [x] Visual effects sync with MIDI (both quantized to 16th note grid)
- [x] Performance is good at window resolution
- [ ] Projector resolution configured (deferred until deployment)
- [x] Code is documented
- [x] Old WebSocket code fully removed
