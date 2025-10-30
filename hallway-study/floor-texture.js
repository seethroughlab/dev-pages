// ===== Wavy grid texture for floor projections =====
import * as THREE from 'three';

export let floorTextureCanvas, floorTextureCtx, floorTexture;

// Wave simulation state for elastic grid lines
export const lineState = {
  longLines: [], // Each line has displacement and velocity arrays
  shortLines: []
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

    return { x: canvasX, y: canvasY, velocity: velocityMagnitude };
  });

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

  // Render the displaced lines
  ctx.fillStyle = '#0f151c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(100, 150, 200, 0.6)';
  ctx.lineWidth = 1; // Very fine lines for dense grid

  // Draw long lines
  for (let i = 0; i < numLongLines; i++) {
    const line = lineState.longLines[i];
    const x = (i / (numLongLines - 1)) * canvas.width;

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

  // Draw short lines
  for (let i = 0; i < numShortLines; i++) {
    const line = lineState.shortLines[i];
    const y = (i / (numShortLines - 1)) * canvas.height;

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

  floorTexture.needsUpdate = true;
}
