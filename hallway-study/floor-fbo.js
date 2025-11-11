/**
 * FBO-based Floor System
 *
 * Uses 3 full-hallway-sized FBOs (one per zone) instead of 48 individual FBOs.
 * Each zone FBO is the size of the entire hallway and renders its 16 triggers
 * at their natural hallway positions. The 3 FBOs are then composited additively.
 *
 * This allows for:
 * - Temporal effects (accessing previous frame)
 * - Physics simulations (string vibration, fluid dynamics)
 * - Multi-pass effects
 * - Natural overlap between zones without complex mapping
 * - Stays within WebGL's 16 texture unit limit
 */

import * as THREE from 'three';

// Vertex shader for rendering to FBO
const fboVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Bass zone shader: Physics-based string simulation for all 16 triggers
const bassFragmentShader = `
  uniform sampler2D previousFrame;
  uniform float time;
  uniform float deltaTime;
  uniform float triggerStates[16]; // 0.0 or 1.0
  uniform float triggerActivations[16]; // Time since activation
  uniform float triggerVelocities[16]; // 0.0 to 1.0
  uniform float triggerXPositions[16]; // 0.0 to 1.0
  uniform float triggerXDirections[16]; // -1.0 to 1.0 (movement direction)
  uniform vec2 resolution;

  varying vec2 vUv;

  const vec3 BASS_COLOR = vec3(1.0, 0.69, 0.23);

  void main() {
    vec2 uv = vUv;

    // Get previous frame data for physics state
    // RGB = visual output, A = displacement
    vec4 prev = texture2D(previousFrame, uv);

    // Physics simulation parameters
    vec2 pixelSize = 1.0 / resolution;
    float waveSpeed = 8.0; // Faster wave propagation for visible vibration
    float damping = 0.998; // Higher damping = longer sustain

    // Sample neighbors for wave equation (from alpha channel)
    float left = texture2D(previousFrame, uv + vec2(-pixelSize.x, 0.0)).a;
    float right = texture2D(previousFrame, uv + vec2(pixelSize.x, 0.0)).a;
    float up = texture2D(previousFrame, uv + vec2(0.0, pixelSize.y)).a;
    float down = texture2D(previousFrame, uv + vec2(0.0, -pixelSize.y)).a;

    // Laplacian (curvature) for wave equation
    float laplacian = (left + right + up + down - 4.0 * prev.a);

    // Velocity is stored as a running calculation (not persisted)
    // This is a simplified physics model
    float velocityWave = laplacian * waveSpeed;

    // Update displacement
    float displacement = prev.a + velocityWave * deltaTime * damping;

    // Add energy from active triggers
    for (int i = 0; i < 16; i++) {
      if (triggerStates[i] < 0.5) continue;

      // Map trigger index to full hallway position
      // Bass zone has triggers 0-15, so global position is just i
      float stringV = (float(i) + 0.5) / 48.0;

      float activation = triggerActivations[i];
      float velocity = triggerVelocities[i];
      float personXPos = triggerXPositions[i];
      float xDirection = triggerXDirections[i]; // -1.0 to 1.0

      float pluckTime = 0.05; // Shorter pull time

      // Use actual movement direction (Z direction through hallway)
      float pluckDirection = xDirection;

      if (activation < pluckTime) {
        // PULL PHASE: Add smooth gaussian displacement WITH DIRECTION
        float pullProgress = activation / pluckTime;
        float distFromPluck = abs(uv.x - personXPos);
        float distFromString = abs(uv.y - stringV);

        // Only affect area near the string (scaled for full-hallway FBO)
        if (distFromString < 0.025) {
          // Smooth gaussian shape
          float pullWidth = 0.2;
          float gaussianShape = exp(-distFromPluck * distFromPluck / (pullWidth * pullWidth));
          float verticalFalloff = exp(-distFromString * 120.0);

          // Directional displacement - positive or negative based on movement direction
          displacement += pullProgress * gaussianShape * verticalFalloff * (0.3 + velocity * 0.5) * 0.01 * pluckDirection;
        }
      } else if (activation < pluckTime + 0.05) {
        // RELEASE PHASE: Strong energy impulse WITH DIRECTION
        float releaseTime = activation - pluckTime;
        float distFromPluck = abs(uv.x - personXPos);
        float distFromString = abs(uv.y - stringV);

        // Inject energy at pluck point (scaled for full-hallway FBO)
        if (distFromString < 0.025) {
          float spatialFalloff = exp(-distFromPluck * distFromPluck / 0.04);
          float timingPulse = exp(-releaseTime * 30.0); // Fast pulse

          displacement += spatialFalloff * timingPulse * velocity * 0.02 * pluckDirection;
        }
      }
    }

    // Light additional decay (most damping handled in wave equation)
    displacement *= 0.995;

    // Render visual output
    vec3 totalColor = vec3(0.0);

    for (int i = 0; i < 16; i++) {
      if (triggerStates[i] < 0.5) continue;

      // Map trigger index to full hallway position
      float stringV = (float(i) + 0.5) / 48.0;

      float activation = triggerActivations[i];
      float velocity = triggerVelocities[i];
      float personXPos = triggerXPositions[i];
      float xDirection = triggerXDirections[i];

      float pluckTime = 0.05;
      float visualDisplacement = 0.0;

      if (activation < pluckTime) {
        // PULL PHASE: Show direct visual feedback (smooth) WITH DIRECTION
        float pullProgress = activation / pluckTime;
        float distFromPluck = abs(uv.x - personXPos);
        float pullWidth = 0.2;

        // Smooth gaussian instead of triangle
        float gaussianShape = exp(-distFromPluck * distFromPluck / (pullWidth * pullWidth));

        // Smaller, smoother displacement in movement direction
        visualDisplacement = pullProgress * gaussianShape * (0.3 + velocity * 0.5) * 0.01 * xDirection;
      } else {
        // PHYSICS PHASE: Read from simulation (alpha channel)
        vec2 stringUV = vec2(uv.x, stringV);
        visualDisplacement = texture2D(previousFrame, stringUV).a * 2.0; // Amplify for visibility
      }

      // Draw string at displaced position
      float displacedV = stringV + visualDisplacement;
      float distFromDisplaced = abs(uv.y - displacedV);

      // CONSTANT thickness - scaled for full-hallway FBO
      float thickness = 0.0025;
      float stringLine = smoothstep(thickness, thickness * 0.5, distFromDisplaced);

      // Brightness - more dynamic range
      float brightness = 2.5 + abs(visualDisplacement) * 100.0;
      vec3 color = BASS_COLOR * stringLine * brightness;

      // Glow - scaled for full-hallway FBO
      float glow = exp(-distFromDisplaced * 240.0) * (0.4 + abs(visualDisplacement) * 50.0);
      color += BASS_COLOR * glow * 0.5;

      totalColor = max(totalColor, color);
    }

    // Store visual output in RGB, physics state in alpha (packed)
    gl_FragColor = vec4(totalColor, displacement);
  }
`;

// Pads zone shader: Particle/fluid system for all 16 triggers
const padsFragmentShader = `
  uniform sampler2D previousFrame;
  uniform float time;
  uniform float deltaTime;
  uniform float triggerStates[16];
  uniform float triggerActivations[16];
  uniform float triggerVelocities[16];
  uniform float triggerXPositions[16];
  uniform vec2 resolution;
  uniform float zoneAspectRatio; // width / height of hallway

  varying vec2 vUv;

  const vec3 PADS_COLOR = vec3(0.58, 0.44, 0.86);

  // Simple pseudo-random for dithering
  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  void main() {
    vec2 uv = vUv;
    vec4 prev = texture2D(previousFrame, uv);

    // Aspect-corrected UV coordinates for circular shapes
    vec2 aspectUV = vec2(uv.x * zoneAspectRatio, uv.y);

    vec3 totalColor = vec3(0.0);
    float breathe = sin(time * 1.5) * 0.05 + 1.0;

    // Accumulate effects from all 16 triggers
    for (int i = 0; i < 16; i++) {
      if (triggerStates[i] < 0.5) continue;

      // Map trigger index to full hallway position
      // Pads zone has triggers 16-31, so global position is 16 + i
      float triggerV = (float(16 + i) + 0.5) / 48.0;

      float activation = triggerActivations[i];
      float velocity = triggerVelocities[i];
      float personXPos = triggerXPositions[i];

      vec3 color = vec3(0.0);

      // LAYER 1: IMMEDIATE FLASH/PING (0-200ms)
      // Provides instant feedback on trigger
      if (activation < 0.2) {
        float flashProgress = activation / 0.2; // 0 to 1 over 200ms

        // Fast attack, fast decay
        float flashEnvelope = (1.0 - flashProgress) * (1.0 - flashProgress); // Quadratic decay

        // Bright ping at entry point (aspect-corrected)
        vec2 pingCenter = vec2(personXPos * zoneAspectRatio, triggerV);
        float distFromPing = length(aspectUV - pingCenter);

        // Expanding ripple (scaled for full-hallway FBO)
        float rippleRadius = 0.01 + flashProgress * 0.05; // Expands quickly
        float rippleThickness = 0.007;
        float ripple = exp(-abs(distFromPing - rippleRadius) * 150.0) * flashEnvelope;

        // Bright center flash
        float centerFlash = exp(-distFromPing * 75.0) * flashEnvelope;

        // Bright, punchy color for the flash (brighter version of pad color)
        vec3 flashColor = PADS_COLOR * 3.0; // 3x brighter
        vec3 flashResult = flashColor * (ripple * 0.6 + centerFlash);

        // Add strong dithering to the final flash color to prevent banding
        // This breaks up smooth gradients in 8-bit color space
        float dither = (random(uv * 1000.0 + activation * 100.0) - 0.5) / 255.0;
        flashResult += dither;

        color += flashResult;
      }

      // LAYER 2: SLOW-GROWING ATMOSPHERIC GLOW (100ms+)
      // Traditional pad aesthetic
      if (activation > 0.1) {
        float glowActivation = activation - 0.1; // Start after 100ms
        float growthFactor = 1.0 - exp(-glowActivation * 0.8);

        // Circular glow centered on entry point (aspect-corrected)
        vec2 glowCenter = vec2(personXPos * zoneAspectRatio, triggerV);
        float distFromCenter = length(aspectUV - glowCenter);

        // Growing circular radius (scaled for full-hallway FBO)
        float radius = (0.013 + 0.067 * growthFactor) * breathe;

        // Smooth falloff
        float glow = exp(-distFromCenter * distFromCenter / (radius * radius) * 4.0);
        float outerGlow = exp(-distFromCenter / radius * 2.0) * 0.3;

        float totalGlow = glow + outerGlow;

        // Fade in the glow over first 500ms to blend smoothly
        float fadeIn = min(glowActivation * 5.0, 1.0);
        float brightnessBoost = (1.0 + growthFactor * 0.7) * fadeIn;

        color += PADS_COLOR * totalGlow * brightnessBoost;
      }

      totalColor = max(totalColor, color);
    }

    // Blend with previous frame (creates trails for the glow)
    vec3 finalColor = max(totalColor, prev.rgb * 0.98);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// Lead zone shader: Piano hammer hit for all 16 triggers
const leadFragmentShader = `
  uniform sampler2D previousFrame;
  uniform float time;
  uniform float deltaTime;
  uniform float triggerStates[16];
  uniform float triggerActivations[16];
  uniform float triggerVelocities[16];
  uniform float triggerXPositions[16];
  uniform vec2 resolution;

  varying vec2 vUv;

  const vec3 LEAD_COLOR = vec3(0.25, 0.88, 0.82);

  void main() {
    vec2 uv = vUv;
    vec4 prev = texture2D(previousFrame, uv);

    vec3 totalColor = vec3(0.0);

    // Accumulate effects from all 16 triggers
    for (int i = 0; i < 16; i++) {
      if (triggerStates[i] < 0.5) continue;

      // Map trigger index to full hallway position
      // Lead zone has triggers 32-47, so global position is 32 + i
      float stringV = (float(32 + i) + 0.5) / 48.0;

      float activation = triggerActivations[i];

      // Attack/decay envelope
      float attackTime = 0.08;

      float envelope;
      if (activation < attackTime) {
        float t = activation / attackTime;
        envelope = t * t * t; // Cubic easing
      } else {
        envelope = exp(-(activation - attackTime) * 4.0);
      }

      // Distance from impact line
      float distFromString = abs(uv.y - stringV);

      // Thickness varies dramatically (scaled for full-hallway FBO)
      float baseThickness = 0.00015;
      float maxThickness = 0.005;
      float thickness = baseThickness + (maxThickness - baseThickness) * envelope;

      float stringLine = smoothstep(thickness, 0.0, distFromString);

      float brightness = 2.0 + envelope * 3.0;
      vec3 color = LEAD_COLOR * stringLine * brightness * envelope;

      totalColor = max(totalColor, color);
    }

    // Blend with previous (allows for reverb-like trails)
    vec3 finalColor = max(totalColor, prev.rgb * 0.9);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// Compositing vertex shader (renders FBOs onto floor)
const compositeVertexShader = `
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

// Compositing fragment shader - simplified for full-hallway FBOs
const compositeFragmentShader = `
  uniform sampler2D bassTexture;
  uniform sampler2D padsTexture;
  uniform sampler2D leadTexture;
  uniform float hallwayLength;
  uniform float hallwayWidth;

  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    // Convert world position to normalized coordinates
    float zPos = vWorldPosition.z + hallwayLength * 0.5;
    float xPos = vWorldPosition.x + hallwayWidth * 0.5;

    float zNormalized = clamp(zPos / hallwayLength, 0.0, 0.999);
    float xNormalized = clamp(xPos / hallwayWidth, 0.0, 1.0);

    // All FBOs are full-hallway sized, so sample at same UV coordinates
    vec2 sampleUV = vec2(xNormalized, zNormalized);

    vec3 bassColor = texture2D(bassTexture, sampleUV).rgb;
    vec3 padsColor = texture2D(padsTexture, sampleUV).rgb;
    vec3 leadColor = texture2D(leadTexture, sampleUV).rgb;

    // Blend zones using max (brightest wins)
    vec3 finalColor = max(bassColor, max(padsColor, leadColor));

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

/**
 * Create FBO-based floor system - 3 zone FBOs
 */
export function createFBOFloor(hallway, triggerZones, renderer) {
  const { length_m, width_m } = hallway;

  // FBO resolution (in pixels) - full hallway size for all zones
  const fboWidth = 512;   // Across hallway width
  const fboHeight = 1536; // Full hallway length (3x zone height for simpler math)

  // Calculate aspect ratio for circular shapes
  const zoneAspectRatio = width_m / length_m;

  // Create 3 zone FBOs (one per zone)
  const zoneFBOs = [];
  const shaders = [bassFragmentShader, padsFragmentShader, leadFragmentShader];
  const zoneNames = ['Bass', 'Pads', 'Lead'];

  for (let zoneIndex = 0; zoneIndex < 3; zoneIndex++) {
    // Create double-buffered render targets
    const targetA = new THREE.WebGLRenderTarget(fboWidth, fboHeight, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType // Float for physics/state data
    });

    const targetB = new THREE.WebGLRenderTarget(fboWidth, fboHeight, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.FloatType
    });

    // Initialize uniform arrays for 16 triggers
    const triggerStates = new Float32Array(16).fill(0.0);
    const triggerActivations = new Float32Array(16).fill(0.0);
    const triggerVelocities = new Float32Array(16).fill(0.0);
    const triggerXPositions = new Float32Array(16).fill(0.5);
    const triggerXDirections = new Float32Array(16).fill(0.0);

    // Base uniforms for all zones
    const uniforms = {
      previousFrame: { value: targetA.texture },
      time: { value: 0.0 },
      deltaTime: { value: 0.016 },
      triggerStates: { value: triggerStates },
      triggerActivations: { value: triggerActivations },
      triggerVelocities: { value: triggerVelocities },
      triggerXPositions: { value: triggerXPositions },
      triggerXDirections: { value: triggerXDirections }, // Only used by bass zone
      resolution: { value: new THREE.Vector2(fboWidth, fboHeight) }
    };

    // Add aspect ratio for pads zone (zone 1)
    if (zoneIndex === 1) {
      uniforms.zoneAspectRatio = { value: zoneAspectRatio };
    }

    // Create material with zone shader
    const material = new THREE.ShaderMaterial({
      vertexShader: fboVertexShader,
      fragmentShader: shaders[zoneIndex],
      uniforms: uniforms
    });

    // Create scene for rendering to FBO
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(quad);

    zoneFBOs.push({
      targetA,
      targetB,
      material,
      scene,
      camera,
      currentTarget: 0, // Ping-pong between A and B
      zoneIndex,
      zoneName: zoneNames[zoneIndex]
    });
  }

  // Create floor geometry
  const geometry = new THREE.PlaneGeometry(width_m, length_m, 100, 100);

  // Create composite material with 3 textures
  const compositeMaterial = new THREE.ShaderMaterial({
    vertexShader: compositeVertexShader,
    fragmentShader: compositeFragmentShader,
    uniforms: {
      bassTexture: { value: zoneFBOs[0].targetA.texture },
      padsTexture: { value: zoneFBOs[1].targetA.texture },
      leadTexture: { value: zoneFBOs[2].targetA.texture },
      hallwayLength: { value: length_m },
      hallwayWidth: { value: width_m }
    },
    side: THREE.DoubleSide
  });

  // Create floor mesh
  const mesh = new THREE.Mesh(geometry, compositeMaterial);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0;

  // Store FBO data
  mesh.userData.zoneFBOs = zoneFBOs;
  mesh.userData.triggerZones = triggerZones;
  mesh.userData.renderer = renderer;
  mesh.userData.activationTimes = new Map();

  const totalMemoryMB = (3 * fboWidth * fboHeight * 16 * 2 / 1024 / 1024).toFixed(2);
  console.log(`[FBO Floor] Created 3 full-hallway FBOs (${fboWidth}x${fboHeight} each)`);
  console.log(`[FBO Floor] Each zone renders to full hallway, composited additively`);
  console.log(`[FBO Floor] Total GPU memory: ~${totalMemoryMB} MB`);
  console.log('[FBO Floor] Zone 0 (Bass): Physics-based strings, triggers 0-15');
  console.log('[FBO Floor] Zone 1 (Pads): Atmospheric glow, triggers 16-31');
  console.log('[FBO Floor] Zone 2 (Lead): Piano hammers, triggers 32-47');

  return mesh;
}

/**
 * Update FBO floor system - 3 zone FBOs
 */
export function updateFBOFloor(floorMesh, deltaTime) {
  if (!floorMesh || !floorMesh.userData.zoneFBOs) return;

  const zoneFBOs = floorMesh.userData.zoneFBOs;
  const renderer = floorMesh.userData.renderer;
  const triggerZones = floorMesh.userData.triggerZones;
  const activationTimes = floorMesh.userData.activationTimes;

  const currentTime = performance.now() / 1000.0;

  // Update each of the 3 zone FBOs
  for (let zoneIndex = 0; zoneIndex < 3; zoneIndex++) {
    const zoneFBO = zoneFBOs[zoneIndex];
    const startTrigger = zoneIndex * 16;

    // Update trigger state arrays for this zone's 16 triggers
    for (let i = 0; i < 16; i++) {
      const triggerIndex = startTrigger + i;
      const trigger = triggerZones.triggers[triggerIndex];
      const isActive = trigger.isActive;

      // Update state
      zoneFBO.material.uniforms.triggerStates.value[i] = isActive ? 1.0 : 0.0;

      if (isActive) {
        // Track activation time
        if (!activationTimes.has(triggerIndex)) {
          activationTimes.set(triggerIndex, currentTime);
        }
        const activation = currentTime - activationTimes.get(triggerIndex);
        zoneFBO.material.uniforms.triggerActivations.value[i] = activation;
        zoneFBO.material.uniforms.triggerVelocities.value[i] = trigger.lastVelocity || 0.5;
        zoneFBO.material.uniforms.triggerXPositions.value[i] = trigger.lastXPosition || 0.5;

        // Only bass zone (zone 0) uses X direction
        if (zoneIndex === 0) {
          zoneFBO.material.uniforms.triggerXDirections.value[i] = trigger.lastXDirection || 0.0;
        }
      } else {
        // Reset when inactive
        activationTimes.delete(triggerIndex);
        zoneFBO.material.uniforms.triggerActivations.value[i] = 0.0;
        zoneFBO.material.uniforms.triggerVelocities.value[i] = 0.0;
        zoneFBO.material.uniforms.triggerXPositions.value[i] = 0.5;

        // Only bass zone (zone 0) uses X direction
        if (zoneIndex === 0) {
          zoneFBO.material.uniforms.triggerXDirections.value[i] = 0.0;
        }
      }
    }

    // Update time uniforms
    zoneFBO.material.uniforms.time.value = currentTime;
    zoneFBO.material.uniforms.deltaTime.value = deltaTime;

    // Ping-pong rendering
    const readTarget = zoneFBO.currentTarget === 0 ? zoneFBO.targetA : zoneFBO.targetB;
    const writeTarget = zoneFBO.currentTarget === 0 ? zoneFBO.targetB : zoneFBO.targetA;

    // Update previousFrame texture
    zoneFBO.material.uniforms.previousFrame.value = readTarget.texture;

    // Render to write target
    renderer.setRenderTarget(writeTarget);
    renderer.render(zoneFBO.scene, zoneFBO.camera);

    // Swap targets
    zoneFBO.currentTarget = 1 - zoneFBO.currentTarget;

    // Update composite material with latest texture
    if (zoneIndex === 0) {
      floorMesh.material.uniforms.bassTexture.value = writeTarget.texture;
    } else if (zoneIndex === 1) {
      floorMesh.material.uniforms.padsTexture.value = writeTarget.texture;
    } else {
      floorMesh.material.uniforms.leadTexture.value = writeTarget.texture;
    }
  }

  // Reset render target to screen
  renderer.setRenderTarget(null);
}
