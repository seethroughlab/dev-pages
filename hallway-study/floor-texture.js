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

export function updateFloorTexture(time, deltaTime, hallway, people, triggerZones = null, showTriggers = false) {
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

  // ===== DRAW TRIGGER ZONES (if enabled) =====
  if (showTriggers && triggerZones) {
    // Draw inactive triggers (semi-transparent)
    ctx.globalAlpha = 0.25;

    for (const trigger of triggerZones.triggers) {
      if (trigger.isActive) continue; // Skip active triggers for now

      // Convert trigger Z coordinates to canvas Y coordinates
      const yStart = (trigger.zStart / length_m) * canvas.height;
      const yEnd = (trigger.zEnd / length_m) * canvas.height;
      const height = yEnd - yStart;

      // Full width
      const x = 0;
      const width = canvas.width;

      // Draw filled rectangle with zone color
      ctx.fillStyle = trigger.color;
      ctx.fillRect(x, yStart, width, height);
    }

    // Draw active triggers (bright and opaque)
    ctx.globalAlpha = 0.8; // Much more visible

    for (const trigger of triggerZones.triggers) {
      if (!trigger.isActive) continue; // Only draw active triggers

      const yStart = (trigger.zStart / length_m) * canvas.height;
      const yEnd = (trigger.zEnd / length_m) * canvas.height;
      const height = yEnd - yStart;

      // Draw bright filled rectangle
      ctx.fillStyle = trigger.color;
      ctx.fillRect(0, yStart, canvas.width, height);

      // Add a white glow effect for active triggers
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.fillRect(0, yStart, canvas.width, height);
    }

    ctx.globalAlpha = 1.0;

    // Draw X-position indicators for people in triggers
    for (const person of people) {
      if (person.opacity <= 0) continue; // Skip invisible people

      // Find which trigger this person is in
      const personZ = person.z;
      const personX = person.xOffset;

      // Check if person is in a trigger
      const trigger = triggerZones.getTriggerAtPosition(personX, personZ);
      if (trigger && trigger.isActive) {
        const yStart = (trigger.zStart / length_m) * canvas.height;
        const yEnd = (trigger.zEnd / length_m) * canvas.height;
        const yCenter = (yStart + yEnd) / 2;

        // Convert X position to canvas coordinates
        // personX ranges from -width_m/2 to +width_m/2
        const xCanvas = ((personX + width_m / 2) / width_m) * canvas.width;
        const ccValue = Math.round(((personX + width_m / 2) / width_m) * 127);

        // Draw horizontal gradient bar showing CC range (at bottom of trigger)
        const barHeight = 20;
        const barY = yEnd - barHeight - 5;
        const barMargin = 40;

        // Create gradient from left (blue) to center (white) to right (red)
        const gradient = ctx.createLinearGradient(barMargin, barY, canvas.width - barMargin, barY);
        gradient.addColorStop(0, '#4466ff');      // Blue (left)
        gradient.addColorStop(0.5, '#ffffff');    // White (center)
        gradient.addColorStop(1, '#ff4466');      // Red (right)

        // Draw gradient bar background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(barMargin, barY, canvas.width - barMargin * 2, barHeight);

        ctx.fillStyle = gradient;
        ctx.fillRect(barMargin, barY, canvas.width - barMargin * 2, barHeight);

        // Draw border around bar
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barMargin, barY, canvas.width - barMargin * 2, barHeight);

        // Draw position marker on the bar
        const markerX = barMargin + ((xCanvas - barMargin) / (canvas.width - barMargin * 2)) * (canvas.width - barMargin * 2);

        // Marker line
        ctx.strokeStyle = 'rgba(255, 255, 255, 1)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(markerX, barY - 5);
        ctx.lineTo(markerX, barY + barHeight + 5);
        ctx.stroke();

        // Marker triangle at top
        ctx.fillStyle = 'rgba(255, 255, 255, 1)';
        ctx.beginPath();
        ctx.moveTo(markerX, barY - 10);
        ctx.lineTo(markerX - 6, barY - 2);
        ctx.lineTo(markerX + 6, barY - 2);
        ctx.closePath();
        ctx.fill();

        // Draw CC value on the bar
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.font = 'bold 14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`CC ${ccValue}`, markerX, barY + barHeight / 2);

        // Draw vertical line showing X position through trigger
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
        ctx.lineWidth = 3;
        ctx.setLineDash([10, 5]); // Dashed line
        ctx.beginPath();
        ctx.moveTo(xCanvas, yStart);
        ctx.lineTo(xCanvas, barY - 15);
        ctx.stroke();
        ctx.setLineDash([]); // Reset to solid

        // Draw a circle at the center of trigger
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(xCanvas, yCenter, 12, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Draw person ID in the circle
        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`P${person.id}`, xCanvas, yCenter);
      }
    }

    // Draw borders between triggers (white lines, more visible)
    for (const trigger of triggerZones.triggers) {
      const yEnd = (trigger.zEnd / length_m) * canvas.height;

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)'; // White with some transparency
      ctx.lineWidth = 2; // Thicker lines
      ctx.beginPath();
      ctx.moveTo(0, yEnd);
      ctx.lineTo(canvas.width, yEnd);
      ctx.stroke();
    }

    // Draw trigger numbers
    for (const trigger of triggerZones.triggers) {
      const yStart = (trigger.zStart / length_m) * canvas.height;

      // Show trigger number for every trigger
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.font = '18px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`T${trigger.id}`, 10, yStart + 5);
    }

    // Draw zone labels on the side
    const zoneColors = ['#ff4466', '#44ff66', '#4466ff'];
    const zoneNames = ['ZONE 1 (BASS)', 'ZONE 2 (PADS)', 'ZONE 3 (LEAD)'];

    for (let i = 0; i < 3; i++) {
      const zoneStartTrigger = i * 16;
      const zoneEndTrigger = (i + 1) * 16 - 1;

      const trigger1 = triggerZones.triggers[zoneStartTrigger];
      const trigger2 = triggerZones.triggers[zoneEndTrigger];

      const yStart = (trigger1.zStart / length_m) * canvas.height;
      const yEnd = (trigger2.zEnd / length_m) * canvas.height;
      const yCenter = (yStart + yEnd) / 2;

      // Zone label
      ctx.fillStyle = zoneColors[i];
      ctx.font = 'bold 28px monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(zoneNames[i], canvas.width - 20, yCenter);

      // Zone separator line
      if (i < 2) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, yEnd);
        ctx.lineTo(canvas.width, yEnd);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }
    }
  }

  // Only draw wavy grid if triggers are hidden
  if (!showTriggers) {
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
  }

  floorTexture.needsUpdate = true;
}
