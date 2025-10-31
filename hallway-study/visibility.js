// ===== Visibility Detection System =====
import * as THREE from 'three';

const raycaster = new THREE.Raycaster();

// Raycast visualization
export const successfulRaycasts = []; // Store successful raycasts for visualization
export const failedRaycasts = []; // Store failed raycasts for visualization
export let showRays = false; // Toggle for raycast visualization

export function setShowRays(value) {
  showRays = value;
}

export function updateRaycastVisualization(raycastLinesGroup) {
  // Clear previous lines
  while (raycastLinesGroup.children.length > 0) {
    const line = raycastLinesGroup.children[0];
    line.geometry.dispose();
    line.material.dispose();
    raycastLinesGroup.remove(line);
  }

  // Draw new lines if enabled
  if (showRays) {
    // Green lines for successful raycasts (visible)
    const greenMaterial = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.3
    });

    for (const ray of successfulRaycasts) {
      const geometry = new THREE.BufferGeometry().setFromPoints([ray.start, ray.end]);
      const line = new THREE.Line(geometry, greenMaterial);
      line.layers.set(1); // Hide from camera previews
      raycastLinesGroup.add(line);
    }

    // Red lines for failed raycasts (occluded or outside frustum)
    const redMaterial = new THREE.LineBasicMaterial({
      color: 0xff0000,
      transparent: true,
      opacity: 0.2
    });

    for (const ray of failedRaycasts) {
      const geometry = new THREE.BufferGeometry().setFromPoints([ray.start, ray.end]);
      const line = new THREE.Line(geometry, redMaterial);
      line.layers.set(1); // Hide from camera previews
      raycastLinesGroup.add(line);
    }
  }

  // Clear for next frame
  successfulRaycasts.length = 0;
  failedRaycasts.length = 0;
}

// Check if a 3D point is within a camera's frustum
export function pointInFrustum3D(worldPos, camera) {
  // Transform point into camera local space
  const m = new THREE.Matrix4();
  m.compose(camera.group.position, camera.group.quaternion, new THREE.Vector3(1, 1, 1));
  const inv = new THREE.Matrix4().copy(m).invert();
  const localPos = worldPos.clone().applyMatrix4(inv);

  // In Three.js camera space, the camera looks down the -Z axis
  // So points in front have negative Z values
  const depth = -localPos.z;

  // Check depth (must be beyond minimum depth and within maximum range)
  if (depth < camera.minRange_m || depth > camera.maxRange_m) return false;

  // Check horizontal angle (use depth for atan2)
  const angH = Math.abs(Math.atan2(localPos.x, -localPos.z)) * THREE.MathUtils.RAD2DEG;
  if (angH > camera.hFovDeg * 0.5) return false;

  // Check vertical angle (use depth for atan2)
  const angV = Math.abs(Math.atan2(localPos.y, -localPos.z)) * THREE.MathUtils.RAD2DEG;
  if (angV > camera.vFovDeg * 0.5) return false;

  return true;
}

// Check if a person slice is visible to a camera (with occlusion detection)
export function isSliceVisibleToCamera(sliceWorldPos, sliceMesh, person, camera, allPeople) {
  const cameraPos = camera.group.position.clone();

  // Check if slice center is in camera 3D frustum first
  const centerVisible = pointInFrustum3D(sliceWorldPos, camera);

  if (!centerVisible) {
    // Record failed raycast for visualization (outside frustum)
    if (showRays) {
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
  raycaster.far = distance - person.radius; // Don't include the target slice itself

  // Get all slices from OTHER people only (exclude all slices from this person)
  const otherSlices = [];
  for (const otherPerson of allPeople) {
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
  if (showRays) {
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
