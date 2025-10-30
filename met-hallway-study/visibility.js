// ===== Frustum test (3D rectangular pyramid) & Visibility checks =====
import * as THREE from 'three';
import { raycastSettings } from './config.js';
import { scene } from './scene.js';

export const raycaster = new THREE.Raycaster();
export const successfulRaycasts = []; // Store successful raycasts for visualization
export const failedRaycasts = []; // Store failed raycasts for visualization

export const raycastLines = new THREE.Group();
scene.add(raycastLines);

export function pointInFrustum3D(p, cam){
  // p: world pos. cam: CamNode
  // transform p into cam local space
  const m = new THREE.Matrix4();
  m.compose(cam.group.position, cam.group.quaternion, new THREE.Vector3(1,1,1));
  const inv = new THREE.Matrix4().copy(m).invert();
  const pl = p.clone().applyMatrix4(inv);

  // Check depth (must be beyond minimum depth and within maximum range)
  if (pl.z < cam.minRange || pl.z > cam.range) return false;

  // Check horizontal angle
  const angH = Math.abs(Math.atan2(pl.x, pl.z)) * THREE.MathUtils.RAD2DEG;
  if (angH > cam.hfov * 0.5) return false;

  // Check vertical angle
  const vfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.hfov/2)) * cam.vaspect) * THREE.MathUtils.RAD2DEG;
  const angV = Math.abs(Math.atan2(pl.y, pl.z)) * THREE.MathUtils.RAD2DEG;
  if (angV > vfov * 0.5) return false;

  return true;
}

// Legacy 2D check for heatmap (floor only)
export function pointInFrustum2D(p, cam){
  return pointInFrustum3D(p, cam);
}

// ===== Visibility check with occlusion (per-slice) =====
export function isSliceVisibleToCamera(sliceWorldPos, sliceMesh, person, cam, people) {
  const cameraPos = cam.group.position.clone();

  // Check if slice center is in camera 3D frustum first
  // But account for slice radius (0.225m) - check a slightly expanded frustum
  const sliceRadius = 0.225; // Person cylinder radius

  // Simple approach: check if center is within frustum OR close enough to the edge
  // that the cylinder volume might intersect
  const centerVisible = pointInFrustum3D(sliceWorldPos, cam);

  if (!centerVisible) {
    // Center is outside frustum - check if it's close enough that the cylinder edges might be visible
    // For now, just reject it. We could do a more sophisticated bounding sphere check later.
    if (raycastSettings.showRays) {
      failedRaycasts.push({
        start: cameraPos.clone(),
        end: sliceWorldPos.clone()
      });
    }
    return false;
  }

  // Check for occlusion by other slices
  // Cast ray from camera to slice center
  const direction = new THREE.Vector3().subVectors(sliceWorldPos, cameraPos).normalize();
  const distance = cameraPos.distanceTo(sliceWorldPos);

  raycaster.set(cameraPos, direction);
  raycaster.far = distance - sliceRadius; // Don't include the target slice itself (account for radius)

  // Get all slices from OTHER people only (exclude all slices from this person)
  const otherSlices = [];
  for (const otherPerson of people) {
    if (otherPerson !== person) {
      for (const slice of otherPerson.slices) {
        otherSlices.push(slice);
      }
    }
  }

  // Check for intersections
  const intersects = raycaster.intersectObjects(otherSlices, false);

  // If there's an intersection closer than the slice, it's occluded
  const isVisible = intersects.length === 0;

  // Record raycast for visualization
  if (raycastSettings.showRays) {
    if (isVisible) {
      successfulRaycasts.push({
        start: cameraPos.clone(),
        end: sliceWorldPos.clone()
      });
    } else {
      failedRaycasts.push({
        start: cameraPos.clone(),
        end: sliceWorldPos.clone()
      });
    }
  }

  return isVisible;
}

export function updateRaycastVisualization() {
  // Clear previous lines
  while (raycastLines.children.length > 0) {
    const line = raycastLines.children[0];
    line.geometry.dispose();
    line.material.dispose();
    raycastLines.remove(line);
  }

  // Draw new lines if enabled
  if (raycastSettings.showRays) {
    // Green lines for successful raycasts
    const greenMaterial = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.3
    });

    for (const ray of successfulRaycasts) {
      const geometry = new THREE.BufferGeometry().setFromPoints([ray.start, ray.end]);
      const line = new THREE.Line(geometry, greenMaterial);
      raycastLines.add(line);
    }

    // Red lines for failed raycasts
    const redMaterial = new THREE.LineBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.2
    });

    for (const ray of failedRaycasts) {
      const geometry = new THREE.BufferGeometry().setFromPoints([ray.start, ray.end]);
      const line = new THREE.Line(geometry, redMaterial);
      raycastLines.add(line);
    }
  }

  // Clear for next frame
  successfulRaycasts.length = 0;
  failedRaycasts.length = 0;
}
