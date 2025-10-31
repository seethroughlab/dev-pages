// ===== GUI =====
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm';
import { defaults, peopleSettings, raycastSettings, displaySettings } from '../core/config.js';
import { scene, setDepthVisualizationMode } from '../core/scene.js';
import { setActiveConfiguration, loadSettings, getSavedConfigurationNames } from './storage.js';

export let gui;
let camerasArray = null;
let projectorsArray = null;
let saveSettingsCallback = null;
let buildHeatmapCallback = null;
let updateHeatmapCallback = null;
let updateHeatmapVisibilityCallback = null;
let createPeopleCallback = null;
let seedCamerasCallback = null;
let addCameraCallback = null;
let clearCamerasCallback = null;
let addCameraNodeCallback = null;

// Track camera GUI folders
const cameraFolders = new Map();

// Current configuration name
let currentConfigName = 'Untitled';

export function setCallbacks(callbacks) {
  camerasArray = callbacks.cameras;
  projectorsArray = callbacks.projectors;
  saveSettingsCallback = callbacks.saveSettings;
  buildHeatmapCallback = callbacks.buildHeatmap;
  updateHeatmapCallback = callbacks.updateHeatmap;
  updateHeatmapVisibilityCallback = callbacks.updateHeatmapVisibility;
  createPeopleCallback = callbacks.createPeople;
  seedCamerasCallback = callbacks.seedCameras;
  addCameraCallback = callbacks.addCamera;
  clearCamerasCallback = callbacks.clearCameras;
  addCameraNodeCallback = callbacks.addCameraNode;
}

// Load a saved configuration
export function loadConfiguration(configName) {
  if (!configName) return;

  // Set active configuration
  setActiveConfiguration(configName);
  currentConfigName = configName;

  // Clear all existing camera GUI folders
  cameraFolders.forEach((folder, cam) => {
    folder.destroy();
  });
  cameraFolders.clear();

  // Clear cameras from scene and array
  if (clearCamerasCallback) {
    clearCamerasCallback();
  }

  // Load saved settings for this configuration
  const savedSettings = loadSettings(configName);
  if (savedSettings && savedSettings.cameras && savedSettings.cameras.length > 0) {
    savedSettings.cameras.forEach(cfg => {
      const camConfig = {
        name: cfg.name,
        pos_m: cfg.pos,
        yawDeg: cfg.yaw,
        pitchDeg: cfg.pitch !== undefined ? cfg.pitch : -8,
        rollDeg: cfg.roll !== undefined ? cfg.roll : 0,
        hFovDeg: 80,
        range_m: 12
      };

      if (camerasArray && window.addCameraFromConfig) {
        const cam = window.addCameraFromConfig(camConfig);
        if (cam && addCameraCallback) {
          addCameraCallback(cam);
        }
      }
    });
  }

  // Update heatmap
  if (updateHeatmapCallback) {
    updateHeatmapCallback();
  }

  // Update GUI to show current config name
  if (gui._configNameDisplay) {
    gui._configNameDisplay.updateDisplay();
  }
}

// Save current configuration with a name
export function saveConfigurationAs() {
  const name = prompt('Enter configuration name:', currentConfigName);
  if (!name) return;

  currentConfigName = name;
  setActiveConfiguration(name);

  // Save settings
  if (saveSettingsCallback) {
    saveSettingsCallback();
  }

  // Rebuild configuration dropdown
  rebuildConfigurationControls();

  alert(`Configuration "${name}" saved!`);
}

// Delete a configuration
export function deleteConfiguration(configName) {
  if (!configName || configName === currentConfigName) {
    alert('Cannot delete the currently loaded configuration.');
    return;
  }

  if (!confirm(`Delete configuration "${configName}"?`)) {
    return;
  }

  // Remove from localStorage
  const saved = localStorage.getItem('hallwayPlannerSettings');
  if (saved) {
    const settings = JSON.parse(saved);
    if (settings.configurations && settings.configurations[configName]) {
      delete settings.configurations[configName];
      localStorage.setItem('hallwayPlannerSettings', JSON.stringify(settings));
      rebuildConfigurationControls();
      alert(`Configuration "${configName}" deleted.`);
    }
  }
}

// Rebuild configuration dropdown after save/delete
function rebuildConfigurationControls() {
  // This will be called to refresh the dropdown
  if (gui._configController) {
    const configNames = getSavedConfigurationNames();
    gui._configController.remove();

    if (configNames.length > 0) {
      const configSettings = { configuration: currentConfigName };
      gui._configController = gui._configFolder.add(configSettings, 'configuration', configNames)
        .name('Load Config')
        .onChange((value) => {
          loadConfiguration(value);
        });
    }
  }
}

export function setupGUI(initialConfig = null) {
  gui = new GUI({ title: 'Hallway Planner (Three.js)' });

  // Configuration Management
  const configFolder = gui.addFolder('Configuration');
  gui._configFolder = configFolder;

  // Display current configuration name
  const configNameSettings = { name: initialConfig || 'Untitled' };
  currentConfigName = configNameSettings.name;
  gui._configNameDisplay = configFolder.add(configNameSettings, 'name').name('Current').disable();

  // Save configuration button
  configFolder.add({ save: saveConfigurationAs }, 'save').name('Save As...');

  // Load configuration dropdown (if there are saved configs)
  const savedConfigs = getSavedConfigurationNames();
  if (savedConfigs.length > 0) {
    const loadSettings = { configuration: currentConfigName };
    gui._configController = configFolder.add(loadSettings, 'configuration', savedConfigs)
      .name('Load Config')
      .onChange((value) => {
        loadConfiguration(value);
        configNameSettings.name = value;
        gui._configNameDisplay.updateDisplay();
      });
  }

  // Delete configuration button
  configFolder.add({
    delete: () => {
      const configToDelete = prompt('Enter name of configuration to delete:');
      if (configToDelete) {
        deleteConfiguration(configToDelete);
      }
    }
  }, 'delete').name('Delete Config...');

  // Cameras section
  const camerasFolder = gui.addFolder('Cameras');

  // Add Camera button
  camerasFolder.add({
    addCamera: () => {
      if (addCameraNodeCallback) {
        addCameraNodeCallback();
      }
    }
  }, 'addCamera').name('Add Camera');

  const heatFolder = gui.addFolder('Heatmap');
  heatFolder.add(defaults.heatmap, 'cell', 0.1, 1.0, 0.05).name('Cell (m)').onChange(()=> {
    if (buildHeatmapCallback) buildHeatmapCallback();
    if (saveSettingsCallback) saveSettingsCallback();
  });

  const peopleFolder = gui.addFolder('People Simulation');
  peopleFolder.add(peopleSettings, 'enabled').name('Enable').onChange(()=>{
    if (createPeopleCallback) createPeopleCallback();
    if (saveSettingsCallback) saveSettingsCallback();
  });
  peopleFolder.add(peopleSettings, 'count', 1, 10, 1).name('Count').onChange(()=>{
    if (createPeopleCallback) createPeopleCallback();
    if (saveSettingsCallback) saveSettingsCallback();
  });

  const debugFolder = gui.addFolder('Debug');
  debugFolder.add(raycastSettings, 'showRays').name('Show Raycasts');

  const displayFolder = gui.addFolder('Display');
  displayFolder.add(displaySettings, 'showProjectors').name('Show Projectors').onChange((value) => {
    if (projectorsArray) {
      projectorsArray.forEach(proj => {
        proj.group.visible = value;
      });
    }
    if (saveSettingsCallback) saveSettingsCallback();
  });
  displayFolder.add(displaySettings, 'showCameraFOV').name('Show Camera FOV').onChange((value) => {
    if (camerasArray) {
      camerasArray.forEach(cam => {
        if (cam.updateFOVVisibility) {
          cam.updateFOVVisibility();
        }
      });
    }
    if (saveSettingsCallback) saveSettingsCallback();
  });
  displayFolder.add(displaySettings, 'showHeatmap').name('Show Heatmap').onChange((value) => {
    if (updateHeatmapVisibilityCallback) updateHeatmapVisibilityCallback();
    if (saveSettingsCallback) saveSettingsCallback();
  });
  displayFolder.add(displaySettings, 'showDepthVisualization').name('Depth View (Cameras)').onChange((value) => {
    setDepthVisualizationMode(value);
    if (saveSettingsCallback) saveSettingsCallback();
  });

  const settingsFolder = gui.addFolder('Settings');
  settingsFolder.add({exportSettings: ()=>{
    // Use the global exportJSON function
    if (window.exportJSON) {
      window.exportJSON();
    }
  }}, 'exportSettings').name('Export Settings');

  settingsFolder.add({importSettings: ()=>{
    // Create a file input element
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (file && window.importJSON) {
        window.importJSON(file);
      }
    };
    input.click();
  }}, 'importSettings').name('Import Settings');

  settingsFolder.add({loadDefaults: async ()=>{
    if (!confirm('Load default settings? This will reset all cameras and settings.')) return;

    try {
      const response = await fetch('./default-settings.json');
      const data = await response.json();

      // Use the global importJSON-like logic
      if (window.loadDefaultSettings) {
        window.loadDefaultSettings(data);
      }
    } catch(e) {
      alert('Failed to load defaults: ' + e.message);
    }
  }}, 'loadDefaults').name('Load Defaults');

  gui.add({reset: async ()=>{
    if (!confirm('Reset to default settings?')) return;

    try {
      const response = await fetch('./default-settings.json');
      const data = await response.json();

      // Use the global loadDefaultSettings function
      if (window.loadDefaultSettings) {
        window.loadDefaultSettings(data);
      }
    } catch(e) {
      alert('Failed to reset: ' + e.message);
    }
  }}, 'reset').name('Reset');

  return gui;
}

export function addCameraToGUI(cam){
  const f = gui.addFolder(cam.name);

  // Track this folder for cleanup
  cameraFolders.set(cam, f);

  f.add(cam.pos, 'x', -defaults.hallway.width_m/2, defaults.hallway.width_m/2, 0.05).name('X (m)').onChange(()=>{
    cam.build();
    if (updateHeatmapCallback) updateHeatmapCallback();
    if (saveSettingsCallback) saveSettingsCallback();
  });
  f.add(cam.pos, 'y', 0, defaults.hallway.height_m, 0.05).name('Y (m)').onChange(()=>{
    cam.build();
    if (updateHeatmapCallback) updateHeatmapCallback();
    if (saveSettingsCallback) saveSettingsCallback();
  });
  // Allow 2m outside hallway on each end
  const zMin = -defaults.hallway.length_m/2 - 2;
  const zMax = defaults.hallway.length_m/2 + 2;
  f.add(cam.pos, 'z', zMin, zMax, 0.05).name('Z (m)').onChange(()=>{
    cam.build();
    if (updateHeatmapCallback) updateHeatmapCallback();
    if (saveSettingsCallback) saveSettingsCallback();
  });
  f.add(cam, 'yaw', -180, 180, 1).name('Yaw').onChange(()=>{
    cam.build();
    if (updateHeatmapCallback) updateHeatmapCallback();
    if (saveSettingsCallback) saveSettingsCallback();
  });
  f.add(cam, 'pitch', -90, 90, 1).name('Pitch').onChange(()=>{
    cam.build();
    if (updateHeatmapCallback) updateHeatmapCallback();
    if (saveSettingsCallback) saveSettingsCallback();
  });
  f.add(cam, 'roll', -180, 180, 1).name('Roll').onChange(()=>{
    cam.build();
    if (updateHeatmapCallback) updateHeatmapCallback();
    if (saveSettingsCallback) saveSettingsCallback();
  });
  f.add({ remove: ()=>{
    scene.remove(cam.group);
    if (camerasArray) {
      const i = camerasArray.indexOf(cam);
      if(i>=0) camerasArray.splice(i,1);
    }
    if (updateHeatmapCallback) updateHeatmapCallback();
    cameraFolders.delete(cam);
    f.destroy();
    if (saveSettingsCallback) saveSettingsCallback();
  } }, 'remove').name('Remove');
}
