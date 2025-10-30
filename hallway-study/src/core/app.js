// ===== Main App Entry Point =====
// Imports from modules
import * as THREE from 'three';
import { displaySettings } from './config.js';
import { renderer, scene, camera, controls, setupResizeHandler, previewCameraA, previewCameraB, previewRendererA, previewRendererB } from './scene.js';
import { updateWavyGridTexture } from '../systems/floor-texture.js';
import { hall, buildHall, setBuildHeatmapCallback, setCreatePeopleCallback } from '../entities/hallway.js';
import { buildHeatmap, updateHeatmap, updateHeatmapVisibility, setPointInFrustum2D, setCamerasArray as setHeatmapCameras } from '../systems/heatmap.js';
import { cameras, addCamera, seedCameras, setUpdateHeatmapCallback } from '../entities/camera-node.js';
import { projectors, createProjectors } from '../entities/projector-node.js';
import { pointInFrustum2D, updateRaycastVisualization } from '../systems/visibility.js';
import { people, createPeople, updatePeople, generateTrackingJSON } from '../entities/people.js';
import { setupGUI, setCallbacks as setGUICallbacks, addCameraToGUI, gui } from '../ui/gui.js';
import { saveSettings, loadSettings, exportJSON, importJSON, setCamerasArray as setStorageCameras, setProjectorsArray } from '../ui/storage.js';

// ===== Setup callbacks between modules =====
setBuildHeatmapCallback(buildHeatmap);
setCreatePeopleCallback(createPeople);
setUpdateHeatmapCallback(updateHeatmap);
setPointInFrustum2D(pointInFrustum2D);
setHeatmapCameras(cameras);
setStorageCameras(cameras);
setProjectorsArray(projectors);

// Auto-save camera position when user moves it (debounced)
let cameraMoveSaveTimeout;
controls.addEventListener('change', () => {
  clearTimeout(cameraMoveSaveTimeout);
  cameraMoveSaveTimeout = setTimeout(saveSettings, 1000); // Save 1 second after user stops moving
});

// ===== Setup GUI with callbacks =====
setGUICallbacks({
  cameras,
  projectors,
  saveSettings,
  buildHeatmap,
  updateHeatmap,
  updateHeatmapVisibility,
  createPeople,
  seedCameras,
  addCamera: addCameraToGUI
});
setupGUI();

// ===== Init =====
buildHall();
createProjectors(); // Add the 3 Epson projectors

// Try to load saved settings, otherwise load defaults from JSON
const loadedData = loadSettings();
if (loadedData && loadedData.cameras && loadedData.cameras.length > 0) {
  // Load cameras from saved settings (using hardcoded defaults for locked FOV properties)
  cameras.splice(0, cameras.length);
  loadedData.cameras.forEach(cfg => {
    addCamera({
      name: cfg.name,
      pos_m: cfg.pos,
      yawDeg: cfg.yaw,
      pitchDeg: cfg.pitch !== undefined ? cfg.pitch : -8,
      rollDeg: cfg.roll !== undefined ? cfg.roll : 0,
      hFovDeg: 80,   // Hardcoded - FOV locked to match OAK-D Pro PoE stereo cameras
      range_m: 12,   // Hardcoded - range locked
      end: cfg.end
    });
  });

  // Apply projector visibility from loaded settings
  projectors.forEach(proj => {
    proj.group.visible = displaySettings.showProjectors;
  });

  // Add cameras to GUI
  cameras.forEach(addCameraToGUI);
  updateHeatmap();
  createPeople(); // Create people if enabled in loaded settings

  // Update all GUI displays to reflect loaded values
  gui.controllersRecursive().forEach(c => c.updateDisplay());

  // Show load confirmation
  const status = document.getElementById('status');
  if (status) {
    status.textContent = '✓ Settings restored';
    setTimeout(() => { status.textContent = ''; }, 2000);
  }
} else {
  // No localStorage - load defaults from JSON file
  fetch('./default-settings.json')
    .then(response => response.json())
    .then(data => {
      if (window.loadDefaultSettings) {
        window.loadDefaultSettings(data);
      }
    })
    .catch(err => {
      console.error('Failed to load default settings, using hardcoded fallback:', err);
      seedCameras();
      cameras.forEach(addCameraToGUI);
      updateHeatmap();
      createPeople();
      gui.controllersRecursive().forEach(c => c.updateDisplay());
    });
}

// ===== Camera preview updates =====
function updateCameraPreviews() {
  if (cameras.length === 0) return; // No cameras yet

  // Find Camera A and B
  const camA = cameras.find(c => c.name === 'Cam A');
  const camB = cameras.find(c => c.name === 'Cam B');

  if (camA && camA.group) {
    // Update world matrices
    scene.updateMatrixWorld();
    camA.group.updateMatrixWorld(true);

    // Set preview camera position to match simulated camera
    previewCameraA.position.copy(camA.group.position);

    // Calculate a point in front of the camera based on its forward direction
    const forward = new THREE.Vector3(0, 0, 1); // Local forward direction
    forward.applyQuaternion(camA.group.quaternion); // Transform to world space
    const lookAtTarget = new THREE.Vector3().addVectors(camA.group.position, forward);

    // Use lookAt to set the camera orientation
    previewCameraA.lookAt(lookAtTarget);
    previewCameraA.updateMatrixWorld();

    // Render from Camera A's perspective
    previewRendererA.render(scene, previewCameraA);
  }

  if (camB && camB.group) {
    // Update world matrices
    scene.updateMatrixWorld();
    camB.group.updateMatrixWorld(true);

    // Set preview camera position to match simulated camera
    previewCameraB.position.copy(camB.group.position);

    // Calculate a point in front of the camera based on its forward direction
    const forward = new THREE.Vector3(0, 0, 1); // Local forward direction
    forward.applyQuaternion(camB.group.quaternion); // Transform to world space
    const lookAtTarget = new THREE.Vector3().addVectors(camB.group.position, forward);

    // Use lookAt to set the camera orientation
    previewCameraB.lookAt(lookAtTarget);
    previewCameraB.updateMatrixWorld();

    // Render from Camera B's perspective
    previewRendererB.render(scene, previewCameraB);
  }
}

// ===== Sidebar Panel Toggles =====
function savePanelStates() {
  const panelStates = {};
  document.querySelectorAll('.panel[data-panel-id]').forEach(panel => {
    const id = panel.getAttribute('data-panel-id');
    panelStates[id] = panel.classList.contains('collapsed');
  });
  localStorage.setItem('panelStates', JSON.stringify(panelStates));
}

function loadPanelStates() {
  const saved = localStorage.getItem('panelStates');
  if (!saved) return;

  try {
    const panelStates = JSON.parse(saved);
    document.querySelectorAll('.panel[data-panel-id]').forEach(panel => {
      const id = panel.getAttribute('data-panel-id');
      if (id in panelStates) {
        if (panelStates[id]) {
          panel.classList.add('collapsed');
        } else {
          panel.classList.remove('collapsed');
        }
      }
    });
  } catch(e) {
    console.error('Failed to load panel states:', e);
  }
}

// Load panel states on page load
loadPanelStates();

// Add toggle listeners
document.querySelectorAll('.panel-toggle').forEach(toggle => {
  toggle.addEventListener('click', () => {
    const panel = toggle.closest('.panel');
    panel.classList.toggle('collapsed');
    savePanelStates();
  });
});

// ===== Render loop =====
let lastTime = performance.now();
function animate(){
  const now = performance.now();
  const deltaTime = Math.min((now - lastTime) / 1000, 0.1); // Cap at 0.1s to prevent huge jumps
  lastTime = now;

  updateWavyGridTexture(now / 1000, deltaTime, hall, people);
  updatePeople(deltaTime, cameras);
  updateRaycastVisualization(); // Draw raycast lines after visibility checks
  controls.update();
  renderer.render(scene, camera);

  // Render camera previews
  updateCameraPreviews();

  requestAnimationFrame(animate);
}
animate();

// ===== Tracking JSON Update (24fps) =====
const trackingJsonElement = document.getElementById('tracking-json');
let lastTrackingUpdate = 0;
const trackingFPS = 24;
const trackingInterval = 1000 / trackingFPS; // ~41.67ms

function updateTrackingJSON() {
  const now = performance.now();

  if (now - lastTrackingUpdate >= trackingInterval) {
    lastTrackingUpdate = now;

    const trackingData = generateTrackingJSON();
    if (trackingJsonElement) {
      trackingJsonElement.textContent = JSON.stringify(trackingData, null, 2);
    }
  }

  requestAnimationFrame(updateTrackingJSON);
}
updateTrackingJSON();

// ===== Setup resize handler =====
setupResizeHandler();

// ===== Export functions for use in HTML =====
window.exportJSON = exportJSON;
window.importJSON = (file) => {
  importJSON(file, {
    rebuildCameras: (cameraConfigs) => {
      // Clear existing cameras
      cameras.slice().forEach(c => scene.remove(c.group));
      cameras.length = 0;

      // Remove camera folders from GUI (keep Heatmap, People Simulation, Debug, Display, Settings)
      const foldersToRemove = gui.folders.slice(5);
      foldersToRemove.forEach(fd => gui.removeFolder(fd));

      // Load cameras with hardcoded defaults for locked FOV properties
      cameraConfigs.forEach(cfg => {
        const cam = addCamera({
          name: cfg.name,
          pos_m: cfg.pos,
          yawDeg: cfg.yaw,
          pitchDeg: cfg.pitch !== undefined ? cfg.pitch : -8,
          rollDeg: cfg.roll !== undefined ? cfg.roll : 0,
          hFovDeg: 80,   // Hardcoded - FOV locked to match OAK-D Pro PoE stereo cameras
          range_m: 12,   // Hardcoded - range locked
          end: cfg.end
        });
        addCameraToGUI(cam);
      });

      // Refresh ALL GUI controllers to show imported values
      gui.controllersRecursive().forEach(c => c.updateDisplay());
    },
    buildHeatmap,
    createPeople,
    updateHeatmap,
    applyProjectorVisibility: () => {
      projectors.forEach(proj => {
        proj.group.visible = displaySettings.showProjectors;
      });
    }
  });
};

window.loadDefaultSettings = (data) => {
  // Load heatmap settings
  if (data.heatmap) {
    Object.assign(defaults.heatmap, data.heatmap);
  }

  // Load people settings
  if (data.people) {
    Object.assign(peopleSettings, data.people);
  }

  // Load display settings
  if (data.display) {
    Object.assign(displaySettings, data.display);
  }

  // Load orbit camera position and target
  if (data.orbitCamera) {
    camera.position.set(...data.orbitCamera.position);
    controls.target.set(...data.orbitCamera.target);
    controls.update();
  }

  // Clear existing cameras
  cameras.slice().forEach(c => scene.remove(c.group));
  cameras.length = 0;

  // Remove camera folders from GUI (keep Heatmap, People Simulation, Debug, Display, Settings)
  const foldersToRemove = gui.folders.slice(5);
  foldersToRemove.forEach(fd => gui.removeFolder(fd));

  // Load cameras with hardcoded defaults for locked FOV properties
  if (data.cameras) {
    data.cameras.forEach(cfg => {
      const cam = addCamera({
        name: cfg.name,
        pos_m: cfg.pos,
        yawDeg: cfg.yaw,
        pitchDeg: cfg.pitch !== undefined ? cfg.pitch : -8,
        rollDeg: cfg.roll !== undefined ? cfg.roll : 0,
        hFovDeg: 80,   // Hardcoded - FOV locked to match OAK-D Pro PoE stereo cameras
        range_m: 12,   // Hardcoded - range locked
        end: cfg.end
      });
      addCameraToGUI(cam);
    });
  }

  // Apply projector visibility
  projectors.forEach(proj => {
    proj.group.visible = displaySettings.showProjectors;
  });

  // Rebuild scene elements
  buildHeatmap();
  updateHeatmap();
  createPeople();

  // Refresh ALL GUI controllers to show loaded values
  gui.controllersRecursive().forEach(c => c.updateDisplay());

  // Save the loaded settings
  saveSettings();

  // Show confirmation
  const status = document.getElementById('status');
  if (status) {
    status.textContent = '✓ Defaults loaded';
    setTimeout(() => { status.textContent = ''; }, 2000);
  }
};
