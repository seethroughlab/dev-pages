// ===== Interactive wavy grid texture for floor =====
import * as THREE from 'three';

export let floorTextureCanvas, floorTextureCtx, floorTexture;

// Wave simulation state for elastic grid lines
export const lineState = {
  longLines: [], // Each line has displacement and velocity arrays
  shortLines: []
};


export function createFloorTexture(hallway) {
  floorTextureCanvas = document.createElement('canvas');
  floorTextureCtx = floorTextureCanvas.getContext('2d', {
    alpha: false,
    desynchronized: true
  });

  floorTextureCtx.imageSmoothingEnabled = true;
  floorTextureCtx.imageSmoothingQuality = 'high';

  // Canvas dimensions match hallway proportions
  // width = hallway width in pixels, height = hallway length in pixels
  const pixelsPerMeter = 300; // Resolution (increased for better detail when zoomed in)
  floorTextureCanvas.width = Math.floor(hallway.width_m * pixelsPerMeter);
  floorTextureCanvas.height = Math.floor(hallway.length_m * pixelsPerMeter);

  // Initialize line state for wave simulation
  const numLongLines = 48; // Lines running along length
  const numShortLines = Math.floor(numLongLines * (hallway.length_m / hallway.width_m)); // Maintain aspect
  const pointsPerLine = 200;

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
  floorTexture.wrapS = THREE.ClampToEdgeWrapping;
  floorTexture.wrapT = THREE.ClampToEdgeWrapping;

  // Anti-aliasing settings
  floorTexture.minFilter = THREE.LinearMipmapLinearFilter;
  floorTexture.magFilter = THREE.LinearFilter;
  floorTexture.generateMipmaps = true;
  floorTexture.anisotropy = 16;

  return floorTexture;
}

export function updateFloorTexture(time, deltaTime, hallway, people) {
  if (!floorTextureCtx || lineState.longLines.length === 0) return;

  const canvas = floorTextureCanvas;
  const ctx = floorTextureCtx;
  const { width_m, length_m } = hallway;

  // Convert people positions to canvas coordinates
  const peopleInCanvas = people.map(person => {
    const canvasX = ((person.xOffset + width_m/2) / width_m) * canvas.width;
    const canvasY = (person.z / length_m) * canvas.height;

    // Calculate velocity
    const velocityMagnitude = person.isDwelling ? 0 : Math.abs(person.speed);

    return { x: canvasX, y: canvasY, velocity: velocityMagnitude, person };
  });

  // Physics parameters
  const stiffness = 5.0;
  const restoring = 12.0;
  const damping = 0.85;
  const pushRadius = 300; // Scaled with resolution (was 100 at 100px/m, now 300 at 300px/m)
  const pushForce = 15000; // Increased proportionally for higher resolution
  const dt = Math.min(deltaTime, 0.033);

  // Helper to apply force from people
  function applyPeopleForce(canvasPos, forceArray, index, isXDirection) {
    let totalForce = 0;

    for (const person of peopleInCanvas) {
      if (person.velocity < 0.01) continue;

      const dx = canvasPos.x - person.x;
      const dy = canvasPos.y - person.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < pushRadius && dist > 0.1) {
        const t = 1 - (dist / pushRadius);
        const smoothT = t * t * (3 - 2 * t);
        const force = smoothT * pushForce * person.velocity;
        totalForce += isXDirection ? (dx / dist) * force : (dy / dist) * force;
      }
    }

    forceArray[index] = totalForce;
  }

  // Update long lines (vertical)
  const numLongLines = lineState.longLines.length;
  const pointsPerLine = lineState.longLines[0].displaceX.length;

  for (let i = 0; i < numLongLines; i++) {
    const line = lineState.longLines[i];
    const x = (i / (numLongLines - 1)) * canvas.width;
    const forces = new Array(pointsPerLine).fill(0);

    for (let j = 0; j < pointsPerLine; j++) {
      const y = (j / (pointsPerLine - 1)) * canvas.height;
      applyPeopleForce({ x, y }, forces, j, true);
    }

    for (let j = 0; j < pointsPerLine; j++) {
      let springForceX = 0;

      if (j > 0) {
        springForceX += (line.displaceX[j - 1] - line.displaceX[j]) * stiffness;
      }
      if (j < pointsPerLine - 1) {
        springForceX += (line.displaceX[j + 1] - line.displaceX[j]) * stiffness;
      }

      const restoringForceX = -line.displaceX[j] * restoring;

      line.velocityX[j] += (springForceX + restoringForceX + forces[j]) * dt;
      line.velocityX[j] *= damping;
      line.displaceX[j] += line.velocityX[j] * dt;
    }
  }

  // Update short lines (horizontal)
  const numShortLines = lineState.shortLines.length;

  for (let i = 0; i < numShortLines; i++) {
    const line = lineState.shortLines[i];
    const y = (i / (numShortLines - 1)) * canvas.height;
    const forces = new Array(pointsPerLine).fill(0);

    for (let j = 0; j < pointsPerLine; j++) {
      const x = (j / (pointsPerLine - 1)) * canvas.width;
      applyPeopleForce({ x, y }, forces, j, false);
    }

    for (let j = 0; j < pointsPerLine; j++) {
      let springForceY = 0;

      if (j > 0) {
        springForceY += (line.displaceY[j - 1] - line.displaceY[j]) * stiffness;
      }
      if (j < pointsPerLine - 1) {
        springForceY += (line.displaceY[j + 1] - line.displaceY[j]) * stiffness;
      }

      const restoringForceY = -line.displaceY[j] * restoring;

      line.velocityY[j] += (springForceY + restoringForceY + forces[j]) * dt;
      line.velocityY[j] *= damping;
      line.displaceY[j] += line.velocityY[j] * dt;
    }
  }

  // Render background
  ctx.fillStyle = '#0f151c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Helper to get color based on activity (monochrome cyan with orange accent)
  function getLineColor(velocity, displacement) {
    let activity = Math.min(1, Math.abs(velocity) * 50.0 + Math.abs(displacement) * 2.0);

    // Sharper stepped transitions instead of smooth gradients
    if (activity < 0.2) {
      // Low activity: dark cyan
      return 'rgb(30, 80, 100)';
    } else if (activity < 0.5) {
      // Medium activity: bright cyan
      return 'rgb(80, 180, 220)';
    } else if (activity < 0.8) {
      // High activity: very bright cyan
      return 'rgb(150, 230, 255)';
    } else {
      // Very high activity: orange accent
      return 'rgb(255, 140, 0)';
    }
  }

  // Draw grid lines
  ctx.lineWidth = 0.5;
  ctx.globalAlpha = 0.5;

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

  ctx.globalAlpha = 1.0;

  // ===== CROSSHAIR MARKERS AT INTERSECTIONS =====
  ctx.strokeStyle = 'rgba(100, 180, 220, 0.6)';
  ctx.lineWidth = 0.3;
  ctx.globalAlpha = 0.7;

  for (let i = 0; i < numLongLines; i++) {
    for (let j = 0; j < numShortLines; j++) {
      // Skip some intersections for a sparser look (every 3rd)
      if (i % 3 !== 0 || j % 3 !== 0) continue;

      const x = (i / (numLongLines - 1)) * canvas.width;
      const y = (j / (numShortLines - 1)) * canvas.height;

      const longLine = lineState.longLines[i];
      const shortLine = lineState.shortLines[j];
      const longIdx = Math.floor((y / canvas.height) * (pointsPerLine - 1));
      const shortIdx = Math.floor((x / canvas.width) * (pointsPerLine - 1));

      const displaceX = longLine.displaceX[longIdx] || 0;
      const displaceY = shortLine.displaceY[shortIdx] || 0;

      const finalX = x + displaceX;
      const finalY = y + displaceY;

      const crosshairSize = 4;

      // Draw crosshair
      ctx.beginPath();
      ctx.moveTo(finalX - crosshairSize, finalY);
      ctx.lineTo(finalX + crosshairSize, finalY);
      ctx.moveTo(finalX, finalY - crosshairSize);
      ctx.lineTo(finalX, finalY + crosshairSize);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1.0;

  // ===== MEASUREMENT INDICATORS =====
  ctx.fillStyle = 'rgba(100, 180, 220, 0.5)';
  ctx.font = 'bold 30px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Measurements along top edge (every 1 meter)
  for (let m = 0; m <= width_m; m += 1) {
    const x = (m / width_m) * canvas.width;
    const label = `${m.toFixed(1)}m`;
    ctx.fillText(label, x, 30);

    // Tick mark
    ctx.beginPath();
    ctx.moveTo(x, 45);
    ctx.lineTo(x, 60);
    ctx.strokeStyle = 'rgba(100, 180, 220, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Measurements along left edge (every 2 meters)
  ctx.textAlign = 'right';
  for (let m = 0; m <= length_m; m += 2) {
    const y = (m / length_m) * canvas.height;
    const label = `${m.toFixed(1)}m`;
    ctx.fillText(label, 120, y);

    // Tick mark
    ctx.beginPath();
    ctx.moveTo(135, y);
    ctx.lineTo(150, y);
    ctx.strokeStyle = 'rgba(100, 180, 220, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  floorTexture.needsUpdate = true;
}
