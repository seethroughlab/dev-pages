/**
 * Shader-based Floor System
 *
 * Three distinct zones with different visual effects:
 * - Zone 1 (Bass): Guitar string pluck effect
 * - Zone 2 (Pads): Sustained glow rectangles
 * - Zone 3 (Lead): Piano hammer hit effect
 */

import * as THREE from 'three';

// Vertex shader
const vertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

// Fragment shader
const fragmentShader = `
  uniform float time;
  uniform float hallwayLength;
  uniform float hallwayWidth;

  // Trigger data (48 triggers)
  uniform float triggerStates[48]; // 0.0 = inactive, 1.0 = active
  uniform float triggerActivations[48]; // Time since activation
  uniform float triggerVelocities[48]; // MIDI velocity (0-127) normalized to 0.0-1.0
  uniform float triggerXPositions[48]; // X position (0.0-1.0) where person entered trigger

  varying vec2 vUv;
  varying vec3 vWorldPosition;

  // Zone boundaries (3 zones of 16 triggers each)
  const float ZONE_1_END = 0.333333; // First third
  const float ZONE_2_END = 0.666666; // Second third
  // Zone 3 is the rest

  const int TRIGGERS_PER_ZONE = 16;

  // Colors for each zone - complementary palette
  const vec3 ZONE_1_COLOR = vec3(1.0, 0.69, 0.23);   // Amber/Gold (Bass)
  const vec3 ZONE_2_COLOR = vec3(0.58, 0.44, 0.86);  // Mid Purple (Pads)
  const vec3 ZONE_3_COLOR = vec3(0.25, 0.88, 0.82);  // Teal/Cyan (Lead)

  // Get which zone we're in (0, 1, or 2)
  int getZone(float zNormalized) {
    if (zNormalized < ZONE_1_END) return 0;
    if (zNormalized < ZONE_2_END) return 1;
    return 2;
  }

  // Get trigger index (0-47) based on position
  int getTriggerIndex(float zNormalized) {
    return int(floor(zNormalized * 48.0));
  }

  // Bass zone effect: Guitar string pluck (in world space)
  vec3 bassZoneEffect(float zLocal, float xNormalized, int triggerIndex, float activation, float velocity, float zNormalized) {
    vec3 baseColor = vec3(0.0); // Black background

    // String position in WORLD coordinates
    float triggerSize = 1.0 / 48.0;
    float stringZPosition = (float(triggerIndex) + 0.5) * triggerSize; // Center of trigger in world space

    // Draw the string as a horizontal line across the trigger
    float stringThickness = 0.003; // Much thinner in world space (trigger is ~0.021 wide)
    float distanceFromString = abs(zNormalized - stringZPosition);

    vec3 stringColor = vec3(0.0);
    float stringLine = 0.0;

    if (triggerStates[triggerIndex] > 0.5) {
      // PLUCK ANIMATION
      // String vibrates with multiple harmonics
      float frequency = 20.0; // Base frequency (lower = wider waves)
      float speed = 12.0; // How fast the wave travels

      // Multiple harmonics for more realistic string vibration
      float wave1 = sin(xNormalized * frequency - activation * speed);
      float wave2 = sin(xNormalized * frequency * 2.0 - activation * speed * 1.5) * 0.5;
      float wave3 = sin(xNormalized * frequency * 3.0 - activation * speed * 2.0) * 0.25;

      float stringVibration = (wave1 + wave2 + wave3) / 1.75;

      // Decay over time (string dampens)
      float decay = exp(-activation * 2.5);
      stringVibration *= decay;

      // Displacement scaled for WORLD SPACE (trigger size is ~0.021)
      // Velocity ranges from 0.0 (slow) to 1.0 (fast)
      // Faster movement = bigger pluck
      float velocityScale = 0.5 + velocity * 2.0; // 0.5x to 2.5x based on velocity
      // Scale displacement to world space: max displacement = ~1/3 of trigger width
      float displacement = stringVibration * 0.007 * velocityScale; // ~1/3 of trigger size when fully plucked

      float vibratingStringDist = abs(zNormalized - (stringZPosition + displacement));

      // Make the string brighter and thicker when vibrating (reduced by half)
      stringLine = smoothstep(stringThickness * 1.5, 0.0, vibratingStringDist);

      // Brightness based on vibration amplitude AND velocity (reduced by half)
      float brightness = (abs(stringVibration) * 2.0 + 0.75) * (0.7 + velocity * 0.3);
      stringColor = ZONE_1_COLOR * brightness;

      // Add glow around vibrating string, scaled by velocity (reduced by half)
      float glow = exp(-vibratingStringDist * 16.0) * decay * (0.25 + velocity * 0.25);
      stringColor += vec3(glow);
    }
    // No static string when inactive - pure black

    // Combine base color with string
    vec3 finalColor = mix(baseColor, stringColor, stringLine);

    return finalColor;
  }

  // Simple pseudo-random function
  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  // Pads zone effect: Sustained glow with particles that overflows boundaries
  vec3 padsZoneEffect(float zLocal, float xNormalized, int triggerIndex, float activation, float zNormalized, float personXPos) {
    vec3 baseColor = vec3(0.0); // Black background

    if (triggerStates[triggerIndex] > 0.5) {
      // Center of the trigger in WORLD Z coordinates
      float triggerSize = 1.0 / 48.0;
      float triggerZCenter = (float(triggerIndex) + 0.5) * triggerSize;

      // Calculate distance in Z direction (along hallway) and X direction (across width)
      float zDist = abs(zNormalized - triggerZCenter);
      float xDist = abs(xNormalized - personXPos); // Center at person's X position

      // Glow grows over time - starts small, expands the longer someone stays
      float growthFactor = 1.0 - exp(-activation * 0.8); // 0 to ~1 over ~3 seconds

      // Gentle breathing effect
      float breathe = sin(time * 1.5) * 0.08 + 1.0;

      // ELLIPTICAL GLOW - large overflow in Z, wide in X (across width)
      // Note: trigger size is ~0.021 in world space (1.0/48)
      float zRadius = (0.04 + 0.1 * growthFactor) * breathe; // Can overflow 2-5 triggers
      float xRadius = (0.25 + 0.35 * growthFactor) * breathe; // Spreads across width

      // Elliptical distance
      float ellipseDist = sqrt((zDist * zDist) / (zRadius * zRadius) + (xDist * xDist) / (xRadius * xRadius));

      // Soft elliptical glow with falloff
      float glowIntensity = exp(-ellipseDist * 2.0);

      // Add softer outer halo that extends further
      float outerHalo = exp(-ellipseDist * 1.0) * 0.3;

      // PARTICLE EFFECTS DISABLED - too expensive for real-time shader
      // The loop was causing performance issues
      float particleContribution = 0.0;

      // Combine glows (no particles)
      float totalGlow = glowIntensity + outerHalo;

      // Brightness increases over time
      float brightnessBoost = 1.0 + (growthFactor * 0.7);

      vec3 glowColor = ZONE_2_COLOR * totalGlow * brightnessBoost;

      return mix(baseColor, glowColor, min(totalGlow, 1.0));
    }

    return baseColor;
  }

  // Lead zone effect: Piano hammer hit (in world space)
  vec3 leadZoneEffect(float zLocal, float xNormalized, int triggerIndex, float activation, float zNormalized) {
    vec3 baseColor = vec3(0.0); // Black background

    if (triggerStates[triggerIndex] > 0.5) {
      // Impact position in WORLD coordinates
      float triggerSize = 1.0 / 48.0;
      float impactZPosition = (float(triggerIndex) + 0.5) * triggerSize;

      // Piano hammer effect: strings that quickly expand and contract
      // Very fast attack, fast decay (piano characteristic)
      float attackTime = 0.08; // 80ms attack (slightly longer for more visible expansion)
      float decayTime = 0.5;   // 500ms decay

      float envelope;
      if (activation < attackTime) {
        // Attack phase: rapidly expand (cubic curve for more dramatic effect)
        float t = activation / attackTime;
        envelope = t * t * t; // Cubic easing for dramatic expansion
      } else {
        // Decay phase: fade out
        envelope = exp(-(activation - attackTime) * 4.0);
      }

      // Single horizontal line across the hallway (like a piano string)
      vec3 color = vec3(0.0);

      // Distance from impact line (horizontal line at impactZPosition)
      float distFromString = abs(zNormalized - impactZPosition);

      // EXAGGERATED thickness change: from almost invisible to very thick
      float baseThickness = 0.0005; // Super thin initially
      float maxThickness = 0.012;   // Very thick at peak (12x thicker!)
      float thickness = baseThickness + (maxThickness - baseThickness) * envelope;

      // String line intensity
      float stringLine = smoothstep(thickness, 0.0, distFromString);

      // Add brightness based on envelope
      float brightness = 2.0 + envelope * 3.0;
      color = ZONE_3_COLOR * stringLine * brightness * envelope;

      return color;
    }

    return baseColor;
  }

  void main() {
    // Convert world position to normalized coordinates
    // Assuming hallway is centered at origin, extends in Z direction
    float zPos = vWorldPosition.z + hallwayLength * 0.5; // 0 to hallwayLength
    float xPos = vWorldPosition.x + hallwayWidth * 0.5;  // 0 to hallwayWidth

    float zNormalized = clamp(zPos / hallwayLength, 0.0, 0.999);
    float xNormalized = clamp(xPos / hallwayWidth, 0.0, 1.0);

    // Determine zone and trigger
    int zone = getZone(zNormalized);
    int triggerIndex = getTriggerIndex(zNormalized);

    // Local Z position within trigger (0.0 to 1.0)
    float triggerSize = 1.0 / 48.0;
    float zLocal = mod(zNormalized, triggerSize) / triggerSize;

    // Get trigger activation time, velocity, and X position
    float activation = triggerActivations[triggerIndex];
    float velocity = triggerVelocities[triggerIndex];
    float personXPos = triggerXPositions[triggerIndex];

    // Apply zone-specific effect
    vec3 finalColor;
    if (zone == 0) {
      // Bass zone - check immediate neighbors for overflow
      finalColor = bassZoneEffect(zLocal, xNormalized, triggerIndex, activation, velocity, zNormalized);

      // Check previous and next triggers for overflow (within Bass zone: 0-15)
      if (triggerIndex > 0 && triggerStates[triggerIndex - 1] > 0.5) {
        vec3 neighborEffect = bassZoneEffect(zLocal, xNormalized, triggerIndex - 1, triggerActivations[triggerIndex - 1], triggerVelocities[triggerIndex - 1], zNormalized);
        finalColor = max(finalColor, neighborEffect);
      }
      if (triggerIndex < 15 && triggerStates[triggerIndex + 1] > 0.5) {
        vec3 neighborEffect = bassZoneEffect(zLocal, xNormalized, triggerIndex + 1, triggerActivations[triggerIndex + 1], triggerVelocities[triggerIndex + 1], zNormalized);
        finalColor = max(finalColor, neighborEffect);
      }
    } else if (zone == 1) {
      // Pads zone - check ALL triggers in zone to eliminate clipping
      finalColor = vec3(0.0);

      // Check all 16 triggers in Pads zone (16-31)
      for (int i = 16; i < 32; i++) {
        if (triggerStates[i] > 0.5) {
          vec3 effect = padsZoneEffect(zLocal, xNormalized, i, triggerActivations[i], zNormalized, triggerXPositions[i]);
          finalColor = max(finalColor, effect); // Take brightest
        }
      }
    } else {
      // Lead zone - check immediate neighbors for overflow
      finalColor = leadZoneEffect(zLocal, xNormalized, triggerIndex, activation, zNormalized);

      // Check previous and next triggers for overflow (within Lead zone: 32-47)
      if (triggerIndex > 32 && triggerStates[triggerIndex - 1] > 0.5) {
        vec3 neighborEffect = leadZoneEffect(zLocal, xNormalized, triggerIndex - 1, triggerActivations[triggerIndex - 1], zNormalized);
        finalColor = max(finalColor, neighborEffect);
      }
      if (triggerIndex < 47 && triggerStates[triggerIndex + 1] > 0.5) {
        vec3 neighborEffect = leadZoneEffect(zLocal, xNormalized, triggerIndex + 1, triggerActivations[triggerIndex + 1], zNormalized);
        finalColor = max(finalColor, neighborEffect);
      }
    }

    // Add subtle grid lines between triggers
    float gridLine = smoothstep(0.01, 0.0, abs(zLocal - 0.0));
    finalColor += vec3(gridLine * 0.1);

    // Add zone separator lines (crisp)
    float zoneSep1 = smoothstep(0.001, 0.0, abs(zNormalized - ZONE_1_END));
    float zoneSep2 = smoothstep(0.001, 0.0, abs(zNormalized - ZONE_2_END));
    finalColor += vec3((zoneSep1 + zoneSep2) * 0.6);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

/**
 * Create shader-based floor mesh
 */
export function createShaderFloor(hallway, triggerZones) {
  const { length_m, width_m } = hallway;

  // Create floor geometry
  const geometry = new THREE.PlaneGeometry(width_m, length_m, 100, 100);

  // Initialize uniform arrays for trigger states
  const triggerStates = new Float32Array(48).fill(0.0);
  const triggerActivations = new Float32Array(48).fill(0.0);
  const triggerVelocities = new Float32Array(48).fill(0.0);
  const triggerXPositions = new Float32Array(48).fill(0.5); // Default to center

  // Create shader material
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      time: { value: 0.0 },
      hallwayLength: { value: length_m },
      hallwayWidth: { value: width_m },
      triggerStates: { value: triggerStates },
      triggerActivations: { value: triggerActivations },
      triggerVelocities: { value: triggerVelocities },
      triggerXPositions: { value: triggerXPositions }
    },
    side: THREE.DoubleSide
  });

  // Create mesh
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2; // Rotate to horizontal
  mesh.position.y = 0;

  // Store trigger zones reference for updates
  mesh.userData.triggerZones = triggerZones;
  mesh.userData.activationTimes = new Map(); // Track when each trigger was activated
  mesh.userData.triggerVelocities = new Map(); // Track velocity for each trigger

  return mesh;
}

/**
 * Update shader floor uniforms
 * Call this every frame to update trigger states and animations
 */
export function updateShaderFloor(floorMesh, deltaTime) {
  if (!floorMesh || !floorMesh.material.uniforms) return;

  const uniforms = floorMesh.material.uniforms;
  const triggerZones = floorMesh.userData.triggerZones;
  const activationTimes = floorMesh.userData.activationTimes;
  const velocitiesMap = floorMesh.userData.triggerVelocities;

  // Update time uniform
  uniforms.time.value += deltaTime;

  // Update trigger states and activations
  if (triggerZones) {
    const currentTime = uniforms.time.value;

    for (let i = 0; i < 48; i++) {
      const trigger = triggerZones.triggers[i];
      const isActive = trigger.isActive;

      // Update state
      uniforms.triggerStates.value[i] = isActive ? 1.0 : 0.0;

      // Track activation time
      if (isActive) {
        if (!activationTimes.has(i)) {
          activationTimes.set(i, currentTime);
        }
        // Time since activation
        uniforms.triggerActivations.value[i] = currentTime - activationTimes.get(i);

        // Get velocity from trigger (stored by people.js when triggered)
        // Default to 0.5 (medium) if not set
        const velocity = trigger.lastVelocity !== undefined ? trigger.lastVelocity : 0.5;
        uniforms.triggerVelocities.value[i] = velocity;

        // Get X position from trigger (stored by people.js when triggered)
        // Default to 0.5 (center) if not set
        const xPosition = trigger.lastXPosition !== undefined ? trigger.lastXPosition : 0.5;
        uniforms.triggerXPositions.value[i] = xPosition;
      } else {
        // Reset when inactive
        activationTimes.delete(i);
        uniforms.triggerActivations.value[i] = 0.0;
        uniforms.triggerVelocities.value[i] = 0.0;
        uniforms.triggerXPositions.value[i] = 0.5; // Reset to center
      }
    }
  }
}
