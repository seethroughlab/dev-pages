// ===== Wavy grid texture for floor projections =====
import * as THREE from 'three';
import { getFFTData } from '../entities/people.js';

export let floorTextureCanvas, floorTextureCtx, floorTexture;

// Wave simulation state for elastic grid lines
export const lineState = {
  longLines: [], // Each line has displacement and velocity arrays
  shortLines: []
};

// Particle trail system
export const particleState = {
  particles: [], // Array of {x, y, vx, vy, life, maxLife, color}
  enabled: true
};

export function createWavyGridTexture() {
  floorTextureCanvas = document.createElement('canvas');
  floorTextureCtx = floorTextureCanvas.getContext('2d');

  // Each projector: 1920x1200 WUXGA (landscape along hallway)
  // 3 projectors with ~15% overlap (288px) between adjacent projectors
  // Total combined: 5184 x 1200 (width x height along hallway length x width)
  // Half resolution: 2592 x 600
  // PlaneGeometry UV: width maps to X (hallway width), height maps to Z (hallway length)
  // So canvas: width = 600 (hallway width), height = 2592 (hallway length)
  floorTextureCanvas.width = 600;
  floorTextureCanvas.height = 2592;

  // Initialize line state for wave simulation
  // Calculate line counts to create square cells (6x original density)
  // Long lines run along the length, spaced across the width
  // Short lines run across the width, spaced along the length
  // With 48 long lines across 6.75ft width = 47 cells of ~0.14ft each
  // For square cells along 43ft length: 270 short lines = 269 cells of ~0.16ft each
  const numLongLines = 48;
  const numShortLines = 270;
  const pointsPerLine = 200; // Resolution for wave simulation

  lineState.longLines = [];
  for (let i = 0; i < numLongLines; i++) {
    lineState.longLines.push({
      displaceX: new Array(pointsPerLine).fill(0),
      displaceY: new Array(pointsPerLine).fill(0),
      velocityX: new Array(pointsPerLine).fill(0),
      velocityY: new Array(pointsPerLine).fill(0)
    });
  }

  lineState.shortLines = [];
  for (let i = 0; i < numShortLines; i++) {
    lineState.shortLines.push({
      displaceX: new Array(pointsPerLine).fill(0),
      displaceY: new Array(pointsPerLine).fill(0),
      velocityX: new Array(pointsPerLine).fill(0),
      velocityY: new Array(pointsPerLine).fill(0)
    });
  }

  floorTexture = new THREE.CanvasTexture(floorTextureCanvas);
  floorTexture.wrapS = THREE.RepeatWrapping;
  floorTexture.wrapT = THREE.RepeatWrapping;

  return floorTexture;
}

export function updateWavyGridTexture(time, deltaTime, hall, people) {
  if (!floorTextureCtx || !hall.bounds || lineState.longLines.length === 0) return;

  const canvas = floorTextureCanvas;
  const ctx = floorTextureCtx;
  const { W, L } = hall.bounds;
  const origin = hall.origin;

  // Convert people positions to canvas coordinates
  // Only apply force based on velocity (movement), not position
  const peopleInCanvas = people.map(person => {
    const canvasX = ((person.xOffset + W/2) / W) * canvas.width;
    const canvasY = (person.z / L) * canvas.height;

    // Calculate velocity in canvas space
    const velocityMagnitude = person.isDwelling ? 0 : Math.abs(person.speed);

    return { x: canvasX, y: canvasY, velocity: velocityMagnitude, person };
  });

  // ===== PARTICLE TRAILS =====
  if (particleState.enabled) {
    // Spawn particles from moving people
    for (const p of peopleInCanvas) {
      if (p.velocity < 0.1) continue;

      // Spawn rate based on velocity (1-3 particles per frame when moving)
      const spawnChance = p.velocity * 2;
      if (Math.random() < spawnChance) {
        const hue = (p.y / canvas.height + time * 0.1) % 1.0;
        particleState.particles.push({
          x: p.x,
          y: p.y,
          vx: (Math.random() - 0.5) * 20,
          vy: p.person.direction * -30 + (Math.random() - 0.5) * 20, // Trail behind
          life: 1.0,
          maxLife: 0.8 + Math.random() * 0.4,
          hue: hue
        });
      }
    }

    // Update particles
    for (let i = particleState.particles.length - 1; i >= 0; i--) {
      const particle = particleState.particles[i];
      particle.x += particle.vx * deltaTime;
      particle.y += particle.vy * deltaTime;
      particle.vx *= 0.95; // Slow down
      particle.vy *= 0.95;
      particle.life -= deltaTime / particle.maxLife;

      if (particle.life <= 0) {
        particleState.particles.splice(i, 1);
      }
    }

    // Limit particle count
    if (particleState.particles.length > 500) {
      particleState.particles.splice(0, particleState.particles.length - 500);
    }
  }

  // Physics parameters for wave simulation
  const stiffness = 2.5; // Spring constant between points (higher = faster wave speed)
  const restoring = 2.4; // Force pulling points back to rest position (4x faster snapback)
  const damping = 0.88; // Energy loss per frame (lower = faster settling)
  const pushRadius = 100; // Pixels
  const pushForce = 5000; // Force strength (higher = more extreme displacement)
  const dt = Math.min(deltaTime, 0.033); // Cap timestep for stability

  // Helper to apply force from people (only when moving)
  function applyPeopleForce(canvasPos, forceArray, index, isXDirection) {
    let totalForce = 0;

    for (const person of peopleInCanvas) {
      // Only apply force if person is moving
      if (person.velocity < 0.01) continue;

      const dx = canvasPos.x - person.x;
      const dy = canvasPos.y - person.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < pushRadius && dist > 0.1) {
        const t = 1 - (dist / pushRadius);
        const smoothT = t * t * (3 - 2 * t);
        // Force scales with velocity - faster movement = stronger force
        const force = smoothT * pushForce * person.velocity;
        totalForce += isXDirection ? (dx / dist) * force : (dy / dist) * force;
      }
    }

    forceArray[index] = totalForce;
  }

  // Update long lines (vertical - varying in Y)
  const numLongLines = lineState.longLines.length;
  const pointsPerLine = lineState.longLines[0].displaceX.length;

  for (let i = 0; i < numLongLines; i++) {
    const line = lineState.longLines[i];
    const x = (i / (numLongLines - 1)) * canvas.width;
    const forces = new Array(pointsPerLine).fill(0);

    // Apply forces from people
    for (let j = 0; j < pointsPerLine; j++) {
      const y = (j / (pointsPerLine - 1)) * canvas.height;
      applyPeopleForce({ x, y }, forces, j, true);
    }

    // Wave propagation via spring forces between adjacent points
    for (let j = 0; j < pointsPerLine; j++) {
      let springForceX = 0;

      // Couple with neighbors
      if (j > 0) {
        springForceX += (line.displaceX[j - 1] - line.displaceX[j]) * stiffness;
      }
      if (j < pointsPerLine - 1) {
        springForceX += (line.displaceX[j + 1] - line.displaceX[j]) * stiffness;
      }

      // Restoring force - pulls point back to original position
      const restoringForceX = -line.displaceX[j] * restoring;

      // Update velocity and position
      line.velocityX[j] += (springForceX + restoringForceX + forces[j]) * dt;
      line.velocityX[j] *= damping;
      line.displaceX[j] += line.velocityX[j] * dt;
    }
  }

  // Update short lines (horizontal - varying in X)
  const numShortLines = lineState.shortLines.length;

  for (let i = 0; i < numShortLines; i++) {
    const line = lineState.shortLines[i];
    const y = (i / (numShortLines - 1)) * canvas.height;
    const forces = new Array(pointsPerLine).fill(0);

    // Apply forces from people
    for (let j = 0; j < pointsPerLine; j++) {
      const x = (j / (pointsPerLine - 1)) * canvas.width;
      applyPeopleForce({ x, y }, forces, j, false);
    }

    // Wave propagation
    for (let j = 0; j < pointsPerLine; j++) {
      let springForceY = 0;

      if (j > 0) {
        springForceY += (line.displaceY[j - 1] - line.displaceY[j]) * stiffness;
      }
      if (j < pointsPerLine - 1) {
        springForceY += (line.displaceY[j + 1] - line.displaceY[j]) * stiffness;
      }

      // Restoring force - pulls point back to original position
      const restoringForceY = -line.displaceY[j] * restoring;

      line.velocityY[j] += (springForceY + restoringForceY + forces[j]) * dt;
      line.velocityY[j] *= damping;
      line.displaceY[j] += line.velocityY[j] * dt;
    }
  }

  // Render the displaced lines with dark background
  ctx.fillStyle = '#0f151c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ===== REACTIVE NEON GRID WITH DYNAMIC COLORS =====

  // Get FFT data for audio reactivity
  const fftData = getFFTData();
  let audioEnergyBoost = 0;
  if (fftData) {
    // Calculate overall audio energy
    let totalEnergy = 0;
    for (let i = 0; i < fftData.length; i++) {
      totalEnergy += fftData[i];
    }
    audioEnergyBoost = (totalEnergy / fftData.length / 255.0) * 0.5; // 0-0.5 boost
  }

  // Helper to get color based on activity (velocity magnitude) and audio
  function getLineColor(velocity, displacement) {
    // EXTREMELY sensitive - amplify the activity heavily
    let activity = Math.min(1, Math.abs(velocity) * 50.0 + Math.abs(displacement) * 2.0);

    // Boost activity based on audio energy
    activity = Math.min(1, activity + audioEnergyBoost);

    // Color gradient: calm (deep blue) -> active (bright cyan -> white)
    if (activity < 0.15) {
      // Deep blue (calm)
      const t = activity / 0.15;
      const r = Math.floor(15 + t * 65);
      const g = Math.floor(25 + t * 105);
      const b = Math.floor(80 + t * 120);
      return `rgb(${r}, ${g}, ${b})`;
    } else if (activity < 0.4) {
      // Blue to bright cyan (active)
      const t = (activity - 0.15) / 0.25;
      const r = Math.floor(80 + t * 90);
      const g = Math.floor(130 + t * 110);
      const b = Math.floor(200 + t * 55);
      return `rgb(${r}, ${g}, ${b})`;
    } else {
      // Bright cyan to white (very active - GLOW!)
      const t = (activity - 0.4) / 0.6;
      const r = Math.floor(170 + t * 85);
      const g = Math.floor(240 + t * 15);
      const b = 255;
      return `rgb(${r}, ${g}, ${b})`;
    }
  }

  // Draw glow layer (wider, more transparent)
  ctx.lineWidth = 0.75;
  ctx.globalAlpha = 0.1;

  // Draw long lines - glow
  for (let i = 0; i < numLongLines; i++) {
    const line = lineState.longLines[i];
    const x = (i / (numLongLines - 1)) * canvas.width;

    // Sample velocity at middle for color
    const midIdx = Math.floor(pointsPerLine / 2);
    const avgVel = Math.abs(line.velocityX[midIdx]);
    const avgDisp = Math.abs(line.displaceX[midIdx]);
    ctx.strokeStyle = getLineColor(avgVel, avgDisp);

    ctx.beginPath();
    for (let j = 0; j < pointsPerLine; j++) {
      const y = (j / (pointsPerLine - 1)) * canvas.height;
      const finalX = x + line.displaceX[j];
      const finalY = y;

      if (j === 0) {
        ctx.moveTo(finalX, finalY);
      } else {
        ctx.lineTo(finalX, finalY);
      }
    }
    ctx.stroke();
  }

  // Draw short lines - glow
  for (let i = 0; i < numShortLines; i++) {
    const line = lineState.shortLines[i];
    const y = (i / (numShortLines - 1)) * canvas.height;

    // Sample velocity at middle for color
    const midIdx = Math.floor(pointsPerLine / 2);
    const avgVel = Math.abs(line.velocityY[midIdx]);
    const avgDisp = Math.abs(line.displaceY[midIdx]);
    ctx.strokeStyle = getLineColor(avgVel, avgDisp);

    ctx.beginPath();
    for (let j = 0; j < pointsPerLine; j++) {
      const x = (j / (pointsPerLine - 1)) * canvas.width;
      const finalX = x;
      const finalY = y + line.displaceY[j];

      if (j === 0) {
        ctx.moveTo(finalX, finalY);
      } else {
        ctx.lineTo(finalX, finalY);
      }
    }
    ctx.stroke();
  }

  // Draw main lines (sharp, brighter)
  ctx.lineWidth = 0.25;
  ctx.globalAlpha = 0.65;

  // Draw long lines - main
  for (let i = 0; i < numLongLines; i++) {
    const line = lineState.longLines[i];
    const x = (i / (numLongLines - 1)) * canvas.width;

    const midIdx = Math.floor(pointsPerLine / 2);
    const avgVel = Math.abs(line.velocityX[midIdx]);
    const avgDisp = Math.abs(line.displaceX[midIdx]);
    ctx.strokeStyle = getLineColor(avgVel, avgDisp);

    ctx.beginPath();
    for (let j = 0; j < pointsPerLine; j++) {
      const y = (j / (pointsPerLine - 1)) * canvas.height;
      const finalX = x + line.displaceX[j];
      const finalY = y;

      if (j === 0) {
        ctx.moveTo(finalX, finalY);
      } else {
        ctx.lineTo(finalX, finalY);
      }
    }
    ctx.stroke();
  }

  // Draw short lines - main
  for (let i = 0; i < numShortLines; i++) {
    const line = lineState.shortLines[i];
    const y = (i / (numShortLines - 1)) * canvas.height;

    const midIdx = Math.floor(pointsPerLine / 2);
    const avgVel = Math.abs(line.velocityY[midIdx]);
    const avgDisp = Math.abs(line.displaceY[midIdx]);
    ctx.strokeStyle = getLineColor(avgVel, avgDisp);

    ctx.beginPath();
    for (let j = 0; j < pointsPerLine; j++) {
      const x = (j / (pointsPerLine - 1)) * canvas.width;
      const finalX = x;
      const finalY = y + line.displaceY[j];

      if (j === 0) {
        ctx.moveTo(finalX, finalY);
      } else {
        ctx.lineTo(finalX, finalY);
      }
    }
    ctx.stroke();
  }

  // Reset alpha
  ctx.globalAlpha = 1.0;

  // ===== RENDER FFT SPECTRUM ANALYZER =====
  if (fftData) {
    const numBars = Math.min(128, fftData.length); // Use first 128 bins
    const barWidth = canvas.width / numBars;
    const maxBarHeight = canvas.height * 0.15; // Max 15% of canvas height

    // Draw spectrum at the bottom of the canvas
    ctx.globalAlpha = 0.6;

    for (let i = 0; i < numBars; i++) {
      const value = fftData[i] / 255.0; // Normalize to 0-1
      const barHeight = value * maxBarHeight;
      const x = i * barWidth;
      const y = canvas.height - barHeight;

      // Color based on frequency (low = red, mid = cyan, high = magenta)
      let r, g, b;
      if (i < numBars / 3) {
        // Low frequencies: Red to Orange
        const t = (i / (numBars / 3));
        r = 255;
        g = Math.floor(t * 150);
        b = 50;
      } else if (i < 2 * numBars / 3) {
        // Mid frequencies: Cyan
        const t = ((i - numBars / 3) / (numBars / 3));
        r = Math.floor(100 + t * 70);
        g = Math.floor(200 + t * 55);
        b = 255;
      } else {
        // High frequencies: Magenta to White
        const t = ((i - 2 * numBars / 3) / (numBars / 3));
        r = Math.floor(200 + t * 55);
        g = Math.floor(100 + t * 155);
        b = 255;
      }

      // Draw bar with gradient
      const gradient = ctx.createLinearGradient(x, y, x, canvas.height);
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.8 * value})`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${0.3 * value})`);

      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barWidth - 1, barHeight);
    }

    // Add glow effect on top
    ctx.globalAlpha = 0.3;
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < numBars; i++) {
      const value = fftData[i] / 255.0;
      const barHeight = value * maxBarHeight;
      const x = i * barWidth;
      const y = canvas.height - barHeight;

      // Glow color
      let r, g, b;
      if (i < numBars / 3) {
        r = 255; g = 150; b = 50;
      } else if (i < 2 * numBars / 3) {
        r = 170; g = 255; b = 255;
      } else {
        r = 255; g = 255; b = 255;
      }

      const glowGradient = ctx.createRadialGradient(
        x + barWidth / 2, y, 0,
        x + barWidth / 2, y, barWidth * 2
      );
      glowGradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${0.6 * value})`);
      glowGradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

      ctx.fillStyle = glowGradient;
      ctx.fillRect(x - barWidth, y - 20, barWidth * 3, 30);
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1.0;

    // Use overall audio energy to modulate grid brightness
    let totalEnergy = 0;
    for (let i = 0; i < fftData.length; i++) {
      totalEnergy += fftData[i];
    }
    const avgEnergy = totalEnergy / fftData.length / 255.0;

    // Add energy-reactive overlay to grid
    if (avgEnergy > 0.1) {
      ctx.globalAlpha = avgEnergy * 0.15;
      ctx.fillStyle = `rgb(170, 240, 255)`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1.0;
    }
  }

  // ===== RENDER PARTICLES =====
  if (particleState.enabled && particleState.particles.length > 0) {
    ctx.globalCompositeOperation = 'lighter'; // Additive blending for glow

    for (const particle of particleState.particles) {
      const alpha = particle.life;
      const size = 4 + (1 - particle.life) * 6; // Grow as they fade

      // Convert hue to RGB (cyan to magenta gradient)
      const r = Math.floor((Math.sin(particle.hue * Math.PI * 2) * 0.5 + 0.5) * 134 + 100);
      const g = Math.floor((Math.sin((particle.hue + 0.33) * Math.PI * 2) * 0.5 + 0.5) * 150 + 100);
      const b = 255;

      // Draw particle glow
      const gradient = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, size);
      gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha * 0.8})`);
      gradient.addColorStop(0.5, `rgba(${r}, ${g}, ${b}, ${alpha * 0.4})`);
      gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

      ctx.fillStyle = gradient;
      ctx.fillRect(particle.x - size, particle.y - size, size * 2, size * 2);
    }

    ctx.globalCompositeOperation = 'source-over'; // Reset blend mode
  }

  floorTexture.needsUpdate = true;
}
