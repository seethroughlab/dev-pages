// Fullscreen background fragment shader with CRT effects

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

struct FragmentInput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@fragment
fn main(input: FragmentInput) -> @location(0) vec4<f32> {
    // Start with black background
    var finalColor = vec3<f32>(0.0, 0.0, 0.0);

    let screenPos = input.position.xy;

    // --- CRT / SCANLINE EFFECT ---
    // Scanlines - horizontal lines across the entire screen
    let scanlineFreq = 600.0;
    let scanlineIntensity = 0.5; // More visible on dark background
    let scanline = sin(screenPos.y * scanlineFreq) * scanlineIntensity + (1.0 - scanlineIntensity);

    // CRT curvature vignette - darker at edges
    let screenCenter = vec2<f32>(960.0, 540.0);
    let distFromCenter = length(screenPos - screenCenter) / 1000.0;
    let vignette = 1.0 - (distFromCenter * distFromCenter * 0.6);

    // RGB phosphor glow - color separation
    let phosphorOffset = sin(screenPos.x * 2.0 + uniforms.time * 0.5) * 0.15;
    let r = scanline * vignette * (0.02 + phosphorOffset * 0.01);
    let g = scanline * vignette * 0.01;
    let b = scanline * vignette * (0.02 - phosphorOffset * 0.01);

    finalColor = vec3<f32>(r, g, b);

    // Flicker effect
    let flicker = sin(uniforms.time * 60.0) * 0.04 + 0.96;
    finalColor *= flicker;

    return vec4<f32>(finalColor, 1.0);
}
