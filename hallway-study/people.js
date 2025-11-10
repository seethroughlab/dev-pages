// ===== People Simulation =====
import * as THREE from 'three';
import { isSliceVisibleToCamera } from './visibility.js';

let nextPersonId = 1;

export class Person {
  constructor(hallway, opts = {}) {
    const { startZ = 0, speed = 0.5, xOffset = 0 } = opts;

    this.id = nextPersonId++;
    this.hallway = hallway;

    // Random number of slices (4-8) determines height
    this.sliceCount = Math.floor(4 + Math.random() * 5); // 4, 5, 6, 7, or 8

    // Each slice is 0.25m tall
    const sliceHeight = 0.25;
    this.sliceHeight = sliceHeight;

    // Total height depends on number of slices
    this.height = this.sliceCount * sliceHeight; // 1.0m to 2.0m

    // Person radius (shoulder width) proportional to height
    // Shorter people are narrower, taller people are wider
    // Average adult: ~1.7m tall with ~0.225m radius (45cm shoulder width)
    // Scale radius based on height: radius = height * 0.132
    this.radius = this.height * 0.132; // Range: ~0.13m (short) to ~0.26m (tall)

    // Movement state
    this.speed = speed;
    this.xOffset = xOffset; // X position in hallway
    this.z = startZ; // Z position along hallway (0 = near end, L = far end)
    this.direction = 1; // 1 = forward (+Z), -1 = backward (-Z)
    this.shouldRemove = false;

    // Lateral (sideways) movement
    this.xVelocity = (Math.random() - 0.5) * 0.3; // Initial sideways velocity (-0.15 to 0.15 m/s)
    this.nextDirectionChange = 2 + Math.random() * 4; // Change direction every 2-6 seconds
    this.lateralMovementEnabled = true; // Can be toggled

    // Calculate initial opacity based on spawn position
    const fadeStartDistance = 1.0;
    const fadeEndDistance = 3.0;
    const length_m = this.hallway.length_m;

    let distanceOutside = 0;
    if (startZ > length_m) {
      distanceOutside = startZ - length_m;
    } else if (startZ < 0) {
      distanceOutside = -startZ;
    }

    // Start with appropriate opacity (0 if beyond fade distance, partial if in fade zone, 1 if inside)
    if (distanceOutside > fadeStartDistance) {
      const fadeProgress = (distanceOutside - fadeStartDistance) / (fadeEndDistance - fadeStartDistance);
      this.opacity = Math.max(0, 1.0 - fadeProgress);
    } else {
      this.opacity = 1.0;
    }

    // Dwelling behavior (stopping to look around)
    this.isDwelling = false;
    this.dwellTime = 0;
    this.nextDwellCheck = 3 + Math.random() * 5; // Check for dwelling every 3-8 seconds

    // Trigger collision tracking
    this.currentTrigger = null; // Current trigger the person is in (or null)

    // Active MIDI notes tracking (to prevent stuck notes)
    this.activeNotes = []; // Array of {note, channel} objects currently playing

    // Three.js group to hold all slices
    this.group = new THREE.Group();
    this.slices = [];

    // Create slices with initial opacity
    for (let i = 0; i < this.sliceCount; i++) {
      const geometry = new THREE.CylinderGeometry(
        this.radius,
        this.radius,
        sliceHeight * 0.95, // Slight gap between slices
        16
      );
      const material = new THREE.MeshStandardMaterial({
        color: 0xff4466,
        roughness: 0.7,
        metalness: 0.1,
        transparent: true,
        opacity: this.opacity // Use calculated initial opacity
      });

      const slice = new THREE.Mesh(geometry, material);
      slice.position.y = (i + 0.5) * sliceHeight;
      slice.castShadow = true;
      this.group.add(slice);
      this.slices.push(slice);
    }

    // Create label sprite
    this.label = this.createLabel();
    this.label.position.y = this.height + 0.3; // Above the person
    this.label.layers.set(1); // Hide from camera previews
    this.group.add(this.label);

    // Set initial position immediately to avoid flash at origin (use length_m declared above)
    this.group.position.set(this.xOffset, 0.005, this.z - length_m / 2);
  }

  createLabel() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = 1024; // Higher resolution for sharper text
    canvas.height = 128;

    // Store for updates
    this.labelCanvas = canvas;
    this.labelContext = context;

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter; // Smoother filtering
    texture.magFilter = THREE.LinearFilter;

    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: this.opacity, // Use calculated initial opacity
      depthTest: false,
      depthWrite: false
    });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(0.8, 0.2, 1); // Smaller sprite

    return sprite;
  }

  updateLabel() {
    if (!this.labelCanvas || !this.labelContext) return;

    const ctx = this.labelContext;
    const canvas = this.labelCanvas;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Text
    ctx.fillStyle = 'white';
    ctx.font = 'Bold 48px monospace'; // Monospace font for technical aesthetic
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // ID and centroid position
    const centroidY = this.height / 2;
    const text = `ID: ${this.id}  •  [${this.xOffset.toFixed(2)}, ${centroidY.toFixed(2)}, ${this.z.toFixed(2)}]`;
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    this.label.material.map.needsUpdate = true;
  }

  update(deltaTime, cameras, allPeople, triggerZones = null, clockManager = null, midiManager = null) {
    const { width_m, length_m } = this.hallway;

    // Handle dwelling behavior (stopping to look around)
    if (this.isDwelling) {
      this.dwellTime -= deltaTime;
      if (this.dwellTime <= 0) {
        this.isDwelling = false;
        this.nextDwellCheck = 3 + Math.random() * 5; // Next dwell check in 3-8 seconds
      }
    } else {
      // Move person forward/backward
      this.z += this.speed * this.direction * deltaTime;

      // Move person sideways (lateral movement)
      if (this.lateralMovementEnabled) {
        this.xOffset += this.xVelocity * deltaTime;

        // Keep within hallway bounds with soft boundaries
        const maxX = width_m * 0.4; // Stay within 80% of width (±40%)
        if (this.xOffset > maxX) {
          this.xOffset = maxX;
          this.xVelocity = -Math.abs(this.xVelocity); // Reverse direction
        } else if (this.xOffset < -maxX) {
          this.xOffset = -maxX;
          this.xVelocity = Math.abs(this.xVelocity); // Reverse direction
        }

        // Randomly change lateral direction for natural meandering
        this.nextDirectionChange -= deltaTime;
        if (this.nextDirectionChange <= 0) {
          // Change sideways velocity to create meandering pattern
          this.xVelocity = (Math.random() - 0.5) * 0.4; // -0.2 to 0.2 m/s
          this.nextDirectionChange = 2 + Math.random() * 4; // Next change in 2-6 seconds
        }
      }

      // Check if it's time to start dwelling
      this.nextDwellCheck -= deltaTime;
      if (this.nextDwellCheck <= 0 && Math.random() < 0.3) { // 30% chance to dwell
        this.isDwelling = true;
        this.dwellTime = 1 + Math.random() * 3; // Dwell for 1-4 seconds
      }
    }

    // Fade out when exiting hallway (start fading at 1m outside, fully faded at 3m outside)
    const fadeStartDistance = 1.0; // Start fading at 1m outside hallway
    const fadeEndDistance = 3.0; // Fully faded at 3m outside hallway

    let distanceOutside = 0;
    if (this.z > length_m) {
      distanceOutside = this.z - length_m;
    } else if (this.z < 0) {
      distanceOutside = -this.z;
    }

    // Calculate opacity based on distance outside hallway
    const previousOpacity = this.opacity;
    if (distanceOutside > fadeStartDistance) {
      const fadeProgress = (distanceOutside - fadeStartDistance) / (fadeEndDistance - fadeStartDistance);
      this.opacity = Math.max(0, 1.0 - fadeProgress);
    } else {
      this.opacity = 1.0;
    }

    // Only update materials if opacity changed (performance optimization)
    if (this.opacity !== previousOpacity) {
      this.slices.forEach(slice => {
        slice.material.opacity = this.opacity;
      });

      // Also fade the label
      if (this.label && this.label.material) {
        this.label.material.opacity = this.opacity;
      }
    }

    // Mark for removal only when fully faded and far outside
    if (distanceOutside >= fadeEndDistance) {
      this.shouldRemove = true;
      return;
    }

    // Update group position (center of hallway is at x=0, z=0)
    this.group.position.set(this.xOffset, 0.005, this.z - length_m / 2);

    // ===== TRIGGER COLLISION DETECTION =====
    if (triggerZones) {
      // Check which trigger we're in (use Z position, which is already in 0 to length_m range)
      const trigger = triggerZones.getTriggerAtPosition(this.xOffset, this.z);

      // Check if we changed triggers
      if (trigger !== this.currentTrigger) {
        // Exited previous trigger
        if (this.currentTrigger !== null) {
          triggerZones.deactivateTrigger(this.currentTrigger.id, this.id);
          // console.log(`[Trigger] Person ${this.id} exited Zone ${this.currentTrigger.zoneId} Trigger ${this.currentTrigger.id} (${this.currentTrigger.zoneName})`);

          // Send NoteOff for Pads zone (Zone 2) when exiting
          if (this.currentTrigger.zoneId === 2 && midiManager && clockManager) {
            const note = this.currentTrigger.midiNote;
            const channel = this.currentTrigger.channel;

            // Schedule NoteOff on next 16th note
            clockManager.scheduleEvent(() => {
              midiManager.sendNoteOff(note, channel);
              // console.log(`[MIDI] Pads NoteOff: Ch${channel} Note${note} (Person ${this.id} exited)`);

              // Remove from active notes tracking
              this.activeNotes = this.activeNotes.filter(n => !(n.note === note && n.channel === channel));
            });
          }
        }

        // Entered new trigger
        if (trigger !== null) {
          // Highlight extensions (7th, 9th, 11th, 13th) in console
          const isExtension = ['7th', '9th', '11th', '13th'].includes(trigger.chordToneType);
          const chordToneLabel = isExtension ? `⭐ ${trigger.chordToneType}` : trigger.chordToneType;

          // console.log(`[Trigger] Person ${this.id} entered Zone ${trigger.zoneId} Trigger ${trigger.id} (${trigger.zoneName}) - Note ${trigger.midiNote} [${chordToneLabel}]`);

          // Calculate velocity and position NOW (before scheduling)
          // Person speed ranges from ~0.7 to 1.3 m/s (from PeopleManager spawn)
          // Dwelling people have speed but are stopped, so check isDwelling
          let velocityValue;
          let normalizedVelocity; // 0.0 to 1.0 for shader
          if (this.isDwelling) {
            velocityValue = 40; // Minimum velocity for dwelling/stopped people
            normalizedVelocity = 0.0; // Dwelling = minimal effect
          } else {
            // Map speed (0.5-1.5 m/s) to MIDI velocity (40-127)
            const minSpeed = 0.5;
            const maxSpeed = 1.5;
            const minVel = 40;
            const maxVel = 127;

            const normalizedSpeed = Math.max(0, Math.min(1, (this.speed - minSpeed) / (maxSpeed - minSpeed)));
            velocityValue = Math.round(minVel + (normalizedSpeed * (maxVel - minVel)));
            normalizedVelocity = normalizedSpeed; // 0.0 to 1.0
          }

          // Calculate normalized X position (0.0 to 1.0) for shader visualization
          let normalizedXPosition = 0.5; // Default to center
          if (typeof this.xOffset === 'number') {
            const hallwayWidth = trigger.xMax - trigger.xMin;
            if (hallwayWidth > 0) {
              const normalizedX = (this.xOffset - trigger.xMin) / hallwayWidth;
              normalizedXPosition = Math.max(0, Math.min(1, normalizedX));
              if (isNaN(normalizedXPosition)) normalizedXPosition = 0.5;
            }
          }

          // Schedule BOTH visual activation AND MIDI note on next 16th note (quantized together)
          if (midiManager && clockManager) {
            const note = trigger.midiNote;
            const channel = trigger.channel;
            const triggerId = trigger.id;
            const personId = this.id;
            const zoneId = trigger.zoneId;

            clockManager.scheduleEvent(() => {
              // Safety check: only trigger if person is still in this trigger
              // (they might have left before the quantized beat arrived)
              if (this.currentTrigger && this.currentTrigger.id === triggerId) {
                // ACTIVATE VISUAL (synced with MIDI)
                triggerZones.activateTrigger(triggerId, personId);

                // Store velocity and X position on trigger for shader visualization
                trigger.lastVelocity = normalizedVelocity;
                trigger.lastXPosition = normalizedXPosition;

                // SEND MIDI NOTE
                midiManager.sendNoteOn(note, velocityValue, channel);
                // console.log(`[MIDI] NoteOn: Ch${channel} Note${note} Vel${velocityValue} [${chordToneLabel}] (Zone ${zoneId}, Speed: ${this.speed.toFixed(2)})`);

                // Track active note (for Pads zone, which sustains)
                if (zoneId === 2) {
                  this.activeNotes.push({ note, channel });
                }

                // Auto NoteOff for Bass (Zone 1) and Lead (Zone 3)
                if (zoneId === 1 || zoneId === 3) {
                  // Bass and Lead have automatic NoteOff after a short duration
                  const duration = zoneId === 1 ? 500 : 300; // Bass: 500ms, Lead: 300ms
                  setTimeout(() => {
                    midiManager.sendNoteOff(note, channel);
                    // console.log(`[MIDI] Auto NoteOff: Ch${channel} Note${note} [${chordToneLabel}] (Zone ${zoneId})`);
                  }, duration);
                }
                // Pads (Zone 2) will send NoteOff when person exits (handled above)
              }
            });
          }
        }

        this.currentTrigger = trigger;
      }
    }

    // Check visibility for each slice from all cameras
    if (cameras && cameras.length > 0) {
      for (let i = 0; i < this.slices.length; i++) {
        const slice = this.slices[i];
        const sliceWorldPos = new THREE.Vector3();
        slice.getWorldPosition(sliceWorldPos);

        // Check if this slice is visible from any camera
        let sliceVisible = false;
        for (const cam of cameras) {
          if (isSliceVisibleToCamera(sliceWorldPos, slice, this, cam, allPeople)) {
            sliceVisible = true;
            break;
          }
        }

        // Update color based on visibility
        if (sliceVisible) {
          slice.material.color.setHex(0x22ff66); // Green if visible
        } else {
          slice.material.color.setHex(0xff4466); // Red if not visible
        }
      }
    } else {
      // No cameras - all slices are red (not visible)
      for (let i = 0; i < this.slices.length; i++) {
        this.slices[i].material.color.setHex(0xff4466);
      }
    }

    // Update label
    this.updateLabel();
  }

  remove(midiManager = null) {
    // Send NoteOff for all active notes before removing
    if (midiManager && this.activeNotes.length > 0) {
      console.log(`[MIDI] Person ${this.id} leaving - sending ${this.activeNotes.length} Note-Offs`);
      this.activeNotes.forEach(({ note, channel }) => {
        midiManager.sendNoteOff(note, channel);
        console.log(`[MIDI] Cleanup NoteOff: Ch${channel} Note${note} (Person ${this.id} removed)`);
      });
      this.activeNotes = [];
    }

    this.slices.forEach(slice => {
      slice.geometry.dispose();
      slice.material.dispose();
    });
  }
}

export class PeopleManager {
  constructor(scene, hallway) {
    this.scene = scene;
    this.hallway = hallway;
    this.people = [];
    this.enabled = false;
    this.count = 3; // Number of people to maintain

    this.nextSpawnTime = 0;
    this.spawnInterval = 4; // Spawn a new person every 4 seconds on average
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (enabled) {
      this.createInitialPeople();
    } else {
      this.removeAllPeople();
    }
  }

  setCount(count) {
    this.count = count;
  }

  setLateralMovement(enabled) {
    this.people.forEach(person => {
      person.lateralMovementEnabled = enabled;
    });
  }

  createInitialPeople() {
    // Spawn initial people - spread them out at the hallway ends
    const peoplePerEnd = Math.ceil(this.count / 2);

    for (let i = 0; i < this.count; i++) {
      // Alternate spawning at near and far ends
      const spawnAtNear = (i % 2) === 0;
      this.spawnPersonAtEnd(spawnAtNear);
    }
  }

  spawnPersonAtEnd(atNearEnd) {
    const { width_m, length_m } = this.hallway;

    // Spawn well outside the hallway (2-3m outside, beyond fade distance)
    const spawnDistance = 2.0 + Math.random() * 1.0;
    const startZ = atNearEnd ? -spawnDistance : length_m + spawnDistance;
    const direction = atNearEnd ? 1 : -1;

    // Random x position across hallway width
    const xOffset = (Math.random() - 0.5) * width_m * 0.8; // Stay within 80% of width
    const speed = 0.4 + Math.random() * 1.2; // Speed variation (0.4-1.6 m/s)

    const person = new Person(this.hallway, { startZ, speed, xOffset });
    person.direction = direction;

    this.people.push(person);
    this.scene.add(person.group);
  }

  update(deltaTime, cameras = [], triggerZones = null, clockManager = null, midiManager = null) {
    if (!this.enabled) return;

    // Update existing people (pass all required systems)
    this.people.forEach(person => person.update(deltaTime, cameras, this.people, triggerZones, clockManager, midiManager));

    // Remove people who have exited
    for (let i = this.people.length - 1; i >= 0; i--) {
      if (this.people[i].shouldRemove) {
        this.people[i].remove(midiManager); // Pass midiManager to send Note-Offs
        this.scene.remove(this.people[i].group);
        this.people.splice(i, 1);
      }
    }

    // Spawn new people to maintain population
    this.nextSpawnTime -= deltaTime;
    if (this.nextSpawnTime <= 0 && this.people.length < this.count) {
      // Randomly choose to spawn at near end or far end
      const spawnAtNear = Math.random() < 0.5;
      this.spawnPersonAtEnd(spawnAtNear);
      this.nextSpawnTime = this.spawnInterval * (0.7 + Math.random() * 0.6); // 2.8-5.2s
    }
  }

  removeAllPeople(midiManager = null) {
    this.people.forEach(person => {
      person.remove(midiManager); // Pass midiManager to send Note-Offs
      this.scene.remove(person.group);
    });
    this.people.length = 0;
  }
}
