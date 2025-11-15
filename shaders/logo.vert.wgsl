// Vertex Shader for Logo Animation
// Handles displacement, mouse interaction, and layer effects

struct Uniforms {
    time: f32,
    mouseX: f32,
    mouseY: f32,
    aspectRatio: f32,
    noiseScale: f32,
    noiseStrength: f32,
    displacementAmount: f32,
    animationPhase: f32,
    rippleX: f32,
    rippleY: f32,
    rippleTime: f32,
    rippleStrength: f32,
    scalePulse: f32,
    parallaxStrength: f32,
    padding1: f32,
    padding2: f32,
}

struct VertexInput {
    @location(0) position: vec2<f32>,
    @location(1) layerIndex: f32,
    @location(2) shapeIndex: f32,
    @location(3) color: vec4<f32>,
}

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) color: vec4<f32>,
    @location(1) layerIndex: f32,
    @location(2) shapeIndex: f32,
    @location(3) worldPos: vec2<f32>,
    @location(4) noise: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Simple 2D noise function
fn noise2D(p: vec2<f32>) -> f32 {
    let K1 = 0.366025404; // (sqrt(3)-1)/2
    let K2 = 0.211324865; // (3-sqrt(3))/6

    let i = floor(p + (p.x + p.y) * K1);
    let a = p - i + (i.x + i.y) * K2;
    let o = select(vec2<f32>(0.0, 1.0), vec2<f32>(1.0, 0.0), a.x > a.y);
    let b = a - o + K2;
    let c = a - 1.0 + 2.0 * K2;

    let h = max(0.5 - vec3<f32>(dot(a, a), dot(b, b), dot(c, c)), vec3<f32>(0.0));
    let n = h * h * h * h * vec3<f32>(
        dot(a, vec2<f32>(sin(i.x), cos(i.y))),
        dot(b, vec2<f32>(sin(i.x + o.x), cos(i.y + o.y))),
        dot(c, vec2<f32>(sin(i.x + 1.0), cos(i.y + 1.0)))
    );

    return dot(n, vec3<f32>(70.0));
}

// Fractal Brownian Motion for richer noise
fn fbm(p: vec2<f32>, octaves: i32) -> f32 {
    var value = 0.0;
    var amplitude = 0.5;
    var frequency = 1.0;
    var pos = p;

    for (var i = 0; i < octaves; i = i + 1) {
        value += amplitude * noise2D(pos * frequency);
        frequency *= 2.0;
        amplitude *= 0.5;
        pos = pos * 2.0 + vec2<f32>(1.3, 1.7);
    }

    return value;
}

// Smooth layer separation based on index
fn layerOffset(layerIdx: f32, time: f32) -> vec2<f32> {
    // Each layer moves in a different circular pattern
    let angle = layerIdx * 1.2 + time * 0.3;
    let radius = layerIdx * 0.08 * (sin(time * 0.4) * 0.5 + 1.0);

    // Add some variation to make movement more organic
    let offsetX = cos(angle) * radius + sin(time * 0.2 + layerIdx) * 0.03;
    let offsetY = sin(angle) * radius + cos(time * 0.25 + layerIdx * 0.7) * 0.03;

    return vec2<f32>(offsetX, offsetY);
}

@vertex
fn main(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    // Start with original position
    var pos = input.position;

    // Calculate noise-based displacement
    let noisePos = pos * uniforms.noiseScale + vec2<f32>(uniforms.time * 0.1);
    let noiseValue = fbm(noisePos, 3);

    // Layer-based displacement (creates depth/parallax)
    let layerDisplacement = layerOffset(input.layerIndex, uniforms.time);

    // Combine displacements
    let noiseDisplacement = vec2<f32>(
        noise2D(pos + vec2<f32>(0.0, uniforms.time * 0.2)) * uniforms.displacementAmount,
        noise2D(pos + vec2<f32>(100.0, uniforms.time * 0.2)) * uniforms.displacementAmount
    );

    // Apply all displacements
    pos += noiseDisplacement * uniforms.noiseStrength;
    pos += layerDisplacement;

    // --- RIPPLE EFFECT ---
    // Check if there's an active ripple (rippleTime >= 0 and recent)
    let timeSinceRipple = uniforms.time - uniforms.rippleTime;
    if (timeSinceRipple >= 0.0 && timeSinceRipple < 2.0) {
        let rippleCenter = vec2<f32>(uniforms.rippleX, uniforms.rippleY);
        let distToRipple = length(pos - rippleCenter);

        // Expanding wave pattern
        let rippleSpeed = 0.8;
        let rippleRadius = timeSinceRipple * rippleSpeed;
        let rippleWidth = 0.3;

        // Wave intensity based on distance from wave front
        let distFromWave = abs(distToRipple - rippleRadius);
        let rippleIntensity = smoothstep(rippleWidth, 0.0, distFromWave);

        // Decay over time
        let rippleDecay = 1.0 - (timeSinceRipple / 2.0);

        // Apply ripple displacement
        if (distToRipple > 0.01) {
            let rippleDir = normalize(pos - rippleCenter);
            let rippleAmount = rippleIntensity * rippleDecay * uniforms.rippleStrength;
            pos += rippleDir * rippleAmount * sin(distToRipple * 10.0 - timeSinceRipple * 5.0);
        }
    }

    // --- PARALLAX EFFECT ---
    // Mouse-based parallax (layers at different depths move differently)
    let parallaxOffset = vec2<f32>(uniforms.mouseX, uniforms.mouseY) *
                         uniforms.parallaxStrength *
                         (input.layerIndex * 0.3);
    pos += parallaxOffset;

    // --- SCALE PULSING ---
    // Uniform scale based on audio or other triggers
    pos *= uniforms.scalePulse;

    // Apply aspect ratio correction to prevent distortion
    // Logo's natural aspect ratio is ~1.49:1
    let logoAspect = 1.49;
    let windowAspect = uniforms.aspectRatio;

    if (windowAspect > logoAspect) {
        // Window is wider than logo - compress X
        pos.x = pos.x * (logoAspect / windowAspect);
    } else {
        // Window is taller than logo - compress Y
        pos.y = pos.y * (windowAspect / logoAspect);
    }

    // Output
    output.position = vec4<f32>(pos, 0.0, 1.0);
    output.color = input.color;
    output.layerIndex = input.layerIndex;
    output.shapeIndex = input.shapeIndex;
    output.worldPos = input.position;
    output.noise = noiseValue;

    return output;
}

// Helper function for smoothstep
fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}
