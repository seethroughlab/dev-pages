// Fragment Shader for Logo Animation
// Handles color effects, lighting, generative noise, and layer blending

struct Uniforms {
    time: f32,
    mouseX: f32,
    mouseY: f32,
    aspectRatio: f32,
    noiseScale: f32,
    noiseStrength: f32,
    displacementAmount: f32,
    animationPhase: f32,
}

struct FragmentInput {
    @location(0) color: vec4<f32>,
    @location(1) layerIndex: f32,
    @location(2) shapeIndex: f32,
    @location(3) worldPos: vec2<f32>,
    @location(4) noise: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Simple 2D noise function (same as vertex shader)
fn noise2D(p: vec2<f32>) -> f32 {
    let K1 = 0.366025404;
    let K2 = 0.211324865;

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

// HSV to RGB conversion for dynamic color effects
fn hsv2rgb(c: vec3<f32>) -> vec3<f32> {
    let K = vec4<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    let p = abs(fract(vec3<f32>(c.x) + K.xyz) * 6.0 - vec3<f32>(K.w));
    return c.z * mix(vec3<f32>(K.x), clamp(p - vec3<f32>(K.x), vec3<f32>(0.0), vec3<f32>(1.0)), c.y);
}

// RGB to HSV conversion
fn rgb2hsv(c: vec3<f32>) -> vec3<f32> {
    let K = vec4<f32>(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    let p = mix(vec4<f32>(c.bg, K.wz), vec4<f32>(c.gb, K.xy), step(c.b, c.g));
    let q = mix(vec4<f32>(p.xyw, c.r), vec4<f32>(c.r, p.yzx), step(p.x, c.r));

    let d = q.x - min(q.w, q.y);
    let e = 1.0e-10;
    return vec3<f32>(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// Chromatic aberration effect
fn chromaticAberration(pos: vec2<f32>, amount: f32) -> vec3<f32> {
    let offset = amount * 0.01;
    let r = noise2D(pos + vec2<f32>(offset, 0.0));
    let g = noise2D(pos);
    let b = noise2D(pos - vec2<f32>(offset, 0.0));
    return vec3<f32>(r, g, b) * 0.5 + 0.5;
}

// Glow effect based on layer and noise
fn calculateGlow(layerIdx: f32, noiseVal: f32, time: f32) -> f32 {
    let layerGlow = sin(time * 2.0 + layerIdx * 1.5) * 0.5 + 0.5;
    let noiseGlow = smoothstep(0.3, 0.7, noiseVal);
    return layerGlow * 0.3 + noiseGlow * 0.2;
}

// Dynamic color shift based on layer and time
fn colorShift(baseColor: vec3<f32>, layerIdx: f32, time: f32, noiseVal: f32) -> vec3<f32> {
    var hsv = rgb2hsv(baseColor);

    // STRONG hue shift - cycle through rainbow colors
    let hueShift = sin(time * 0.8 + layerIdx * 1.5) * 0.3; // Tripled from 0.1
    hsv.x = fract(hsv.x + hueShift + noiseVal * 0.2); // Quadrupled noise influence

    // Strong saturation modulation
    let satMod = sin(time * 0.3) * 0.4 + 0.8; // Doubled variation
    hsv.y *= satMod;

    // Strong brightness modulation
    let brightMod = sin(time * 0.4 + layerIdx) * 0.3 + 1.0; // Doubled variation
    hsv.z *= brightMod;

    return hsv2rgb(hsv);
}

// Lighting effect with mouse position
fn calculateLighting(worldPos: vec2<f32>, mousePos: vec2<f32>) -> f32 {
    let toLight = mousePos - worldPos;
    let dist = length(toLight);
    // Much stronger, longer-range lighting
    let attenuation = 1.0 / (1.0 + dist * dist * 0.1); // Reduced falloff for wider range
    return attenuation * 4.0; // Doubled intensity
}

// Edge glow for layer separation
fn edgeGlow(layerIdx: f32, time: f32) -> f32 {
    return sin(time * 3.0 + layerIdx * 2.0) * 0.3 + 0.7;
}

@fragment
fn main(input: FragmentInput) -> @location(0) vec4<f32> {
    // Start with base color
    var finalColor = input.color.rgb;

    // --- CRT / SCANLINE EFFECT ---
    // Get screen-space position (0-1)
    let screenPos = input.position.xy;

    // Scanlines - horizontal lines across the screen
    let scanlineFreq = 800.0; // Number of scanlines
    let scanlineIntensity = 0.15; // How dark the lines are
    let scanline = sin(screenPos.y * scanlineFreq) * scanlineIntensity + (1.0 - scanlineIntensity);
    finalColor *= scanline;

    // CRT curvature vignette - darker at edges
    let screenCenter = vec2<f32>(960.0, 540.0); // Approximate center for 1920x1080
    let distFromCenter = length(screenPos - screenCenter) / 1000.0;
    let vignette = 1.0 - (distFromCenter * distFromCenter * 0.3);
    finalColor *= vignette;

    // RGB phosphor glow - subtle color separation
    let phosphorOffset = sin(screenPos.x * 3.0) * 0.02;
    finalColor.r *= 1.0 + phosphorOffset;
    finalColor.b *= 1.0 - phosphorOffset;

    // Flicker effect - very subtle
    let flicker = sin(uniforms.time * 60.0) * 0.01 + 0.99;
    finalColor *= flicker;

    // --- VORONOI / CELLULAR PATTERN ---
    // Subtle cellular noise overlay
    let cellScale = 20.0;
    let cellPos = input.worldPos * cellScale + vec2<f32>(uniforms.time * 0.1);
    let cellNoise = voronoi(cellPos);
    let cellPattern = smoothstep(0.4, 0.6, cellNoise) * 0.05; // Very subtle
    finalColor += vec3<f32>(cellPattern);

    return vec4<f32>(finalColor, 1.0);
}

// Voronoi/cellular noise function
fn voronoi(p: vec2<f32>) -> f32 {
    let n = floor(p);
    let f = fract(p);

    var minDist = 1.0;

    for (var j = -1; j <= 1; j++) {
        for (var i = -1; i <= 1; i++) {
            let neighbor = vec2<f32>(f32(i), f32(j));
            let point = random2(n + neighbor);
            let diff = neighbor + point - f;
            let dist = length(diff);
            minDist = min(minDist, dist);
        }
    }

    return minDist;
}

// Random 2D vector from 2D input
fn random2(p: vec2<f32>) -> vec2<f32> {
    return fract(sin(vec2<f32>(
        dot(p, vec2<f32>(127.1, 311.7)),
        dot(p, vec2<f32>(269.5, 183.3))
    )) * 43758.5453);
}

// Fract function
fn fract(x: vec2<f32>) -> vec2<f32> {
    return x - floor(x);
}

// Helper function for smoothstep
fn smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    let t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}
