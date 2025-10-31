// ===== Main App Entry Point =====
// Imports from modules
import * as THREE from 'three';
import { displaySettings } from './config.js';
import { renderer, scene, camera, controls, setupResizeHandler, previewCameraA, previewCameraB, previewCameraC, previewRendererA, previewRendererB, previewRendererC, depthRenderTargetA, depthRenderTargetB, depthRenderTargetC, depthVisualizationMode, depthSceneA, depthSceneB, depthSceneC, depthQuadCameraA, depthQuadCameraB, depthQuadCameraC } from './scene.js';
// import { updateWavyGridTexture } from '../systems/floor-texture.js'; // COMMENTED OUT: Distracting visuals
import { hall, buildHall, setBuildHeatmapCallback, setCreatePeopleCallback } from '../entities/hallway.js';
import { buildHeatmap, updateHeatmap, updateHeatmapVisibility, setPointInFrustum2D, setCamerasArray as setHeatmapCameras } from '../systems/heatmap.js';
import { cameras, addCamera, seedCameras, clearCameras, setUpdateHeatmapCallback } from '../entities/camera-node.js';
import { projectors, createProjectors } from '../entities/projector-node.js';
import { pointInFrustum2D, updateRaycastVisualization } from '../systems/visibility.js';
import { people, createPeople, updatePeople, generateTrackingJSON /*, updateMusicInfoDisplay, toggleAudio, isAudioEnabled */ } from '../entities/people.js'; // COMMENTED OUT: Audio features
import { setupGUI, setCallbacks as setGUICallbacks, addCameraToGUI, gui } from '../ui/gui.js';
import { saveSettings, loadSettings, exportJSON, importJSON, setCamerasArray as setStorageCameras, setProjectorsArray, setActiveConfiguration, getActiveConfiguration } from '../ui/storage.js';

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

// Helper function to add camera from configuration
window.addCameraFromConfig = function(camConfig) {
  const cam = addCamera(camConfig);
  return cam;
};

// Function to add a new camera to the scene
function addNewCamera() {
  // Generate unique camera name
  const existingNames = cameras.map(c => c.name);
  let newIndex = cameras.length + 1;
  let newName = `Cam ${String.fromCharCode(64 + newIndex)}`;

  // Make sure name is unique
  while (existingNames.includes(newName)) {
    newIndex++;
    newName = `Cam ${String.fromCharCode(64 + newIndex)}`;
  }

  // Create camera at center, near ceiling
  const cam = addCamera({
    name: newName,
    pos_m: [0, defaults.hallway.height_m - 0.5, 0],
    yawDeg: 0,
    pitchDeg: -10,
    rollDeg: 0,
    hFovDeg: 80,
    range_m: 12
  });

  // Add to GUI
  addCameraToGUI(cam);

  // Update heatmap
  updateHeatmap();

  // Save settings
  saveSettings();

  return cam;
}

// ===== Init =====
buildHall();
createProjectors(); // Add the 3 Epson projectors

// Try to load saved settings first to get the active configuration
const loadedData = loadSettings();
const activeConfig = loadedData?.activeConfiguration || 'Untitled';

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
  addCamera: addCameraToGUI,
  clearCameras,
  addCameraNode: addNewCamera
});
setupGUI(activeConfig); // Pass the active configuration to GUI

// Load settings and cameras
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
      range_m: 12    // Hardcoded - range locked
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
  // No localStorage - start with empty scene
  // User can add cameras using the "Add Camera" button
  console.log('No saved configuration found. Use "Add Camera" button to add cameras.');

  // Update GUI displays
  gui.controllersRecursive().forEach(c => c.updateDisplay());
}

// ===== Camera preview updates =====
function updateCameraPreviews() {
  if (cameras.length === 0) return; // No cameras yet

  // Find cameras A, B, and C
  const camA = cameras.find(c => c.name === 'Cam A');
  const camB = cameras.find(c => c.name === 'Cam B');
  const camC = cameras.find(c => c.name === 'Cam C');

  // Helper function to render a camera preview
  function renderCameraPreview(cam, previewCam, previewRenderer, depthRenderTarget, depthScene, depthQuadCamera) {
    if (!cam || !cam.group) return;

    // Update world matrices
    scene.updateMatrixWorld();
    cam.group.updateMatrixWorld(true);

    // Set preview camera position to match simulated camera
    previewCam.position.copy(cam.group.position);

    // Calculate a point in front of the camera based on its forward direction
    const forward = new THREE.Vector3(0, 0, 1); // Local forward direction
    forward.applyQuaternion(cam.group.quaternion); // Transform to world space
    const lookAtTarget = new THREE.Vector3().addVectors(cam.group.position, forward);

    // Use lookAt to set the camera orientation
    previewCam.lookAt(lookAtTarget);
    previewCam.updateMatrixWorld();

    if (depthVisualizationMode) {
      // Render to depth render target first
      previewRenderer.setRenderTarget(depthRenderTarget);
      previewRenderer.render(scene, previewCam);
      previewRenderer.setRenderTarget(null);

      // Then render the depth visualization to the canvas
      previewRenderer.render(depthScene, depthQuadCamera);
    } else {
      // Render RGB from camera's perspective
      previewRenderer.render(scene, previewCam);
    }
  }

  // Render all cameras
  renderCameraPreview(camA, previewCameraA, previewRendererA, depthRenderTargetA, depthSceneA, depthQuadCameraA);
  renderCameraPreview(camB, previewCameraB, previewRendererB, depthRenderTargetB, depthSceneB, depthQuadCameraB);
  renderCameraPreview(camC, previewCameraC, previewRendererC, depthRenderTargetC, depthSceneC, depthQuadCameraC);
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

// ===== Audio Toggle Button ===== COMMENTED OUT: Audio distracting from camera placement study
// const audioToggleBtn = document.getElementById('audio-toggle');
// if (audioToggleBtn) {
//   audioToggleBtn.addEventListener('click', () => {
//     const enabled = toggleAudio();
//     audioToggleBtn.textContent = enabled ? 'Disable Audio' : 'Enable Audio';
//     audioToggleBtn.classList.toggle('enabled', enabled);
//   });
// }

// ===== Render loop =====
let lastTime = performance.now();
function animate(){
  const now = performance.now();
  const deltaTime = Math.min((now - lastTime) / 1000, 0.1); // Cap at 0.1s to prevent huge jumps
  lastTime = now;

  // updateWavyGridTexture(now / 1000, deltaTime, hall, people); // COMMENTED OUT: Distracting floor visuals
  updatePeople(deltaTime, cameras);
  // updateMusicInfoDisplay(); // COMMENTED OUT: Audio features - Update key and BPM display
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
