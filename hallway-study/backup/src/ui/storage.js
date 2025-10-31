// ===== Auto-save to localStorage & Import/Export =====
import { defaults, peopleSettings, displaySettings } from '../core/config.js';
import { camera, controls, setDepthVisualizationMode } from '../core/scene.js';

// These will be set by main app
let camerasArray = null;
let projectorsArray = null;
let activeConfiguration = 'End Cameras'; // Default configuration

export function setCamerasArray(cameras) {
  camerasArray = cameras;
}

export function setProjectorsArray(projectors) {
  projectorsArray = projectors;
}

export function setActiveConfiguration(configName) {
  activeConfiguration = configName;
}

export function getActiveConfiguration() {
  return activeConfiguration;
}

export function getSavedConfigurationNames() {
  const saved = localStorage.getItem('hallwayPlannerSettings');
  if (!saved) return [];

  try {
    const data = JSON.parse(saved);
    if (data.configurations) {
      return Object.keys(data.configurations);
    }
  } catch(e) {
    console.error('Failed to get configuration names:', e);
  }

  return [];
}

export function saveSettings() {
  if (!camerasArray) return;

  // Load existing settings structure
  const saved = localStorage.getItem('hallwayPlannerSettings');
  let allSettings = saved ? JSON.parse(saved) : { configurations: {} };

  // Ensure configurations object exists
  if (!allSettings.configurations) {
    allSettings.configurations = {};
  }

  // Save global settings
  allSettings.activeConfiguration = activeConfiguration;
  allSettings.heatmap = defaults.heatmap;
  allSettings.people = peopleSettings;
  allSettings.display = displaySettings;
  allSettings.orbitCamera = {
    position: [camera.position.x, camera.position.y, camera.position.z],
    target: [controls.target.x, controls.target.y, controls.target.z]
  };

  // Save camera settings for the active configuration
  allSettings.configurations[activeConfiguration] = {
    cameras: camerasArray.map(c=>({
      name: c.name,
      pos: [c.pos.x, c.pos.y, c.pos.z],
      yaw: c.yaw,
      pitch: c.pitch,
      roll: c.roll
    }))
  };

  localStorage.setItem('hallwayPlannerSettings', JSON.stringify(allSettings));

  // Show brief save confirmation
  const status = document.getElementById('status');
  if (status) {
    status.textContent = '✓ Saved';
    setTimeout(() => { status.textContent = ''; }, 1500);
  }
}

export function loadSettings(configName = null) {
  const saved = localStorage.getItem('hallwayPlannerSettings');
  if (!saved) return null;

  try {
    const data = JSON.parse(saved);

    // Determine which configuration to load
    const targetConfig = configName || data.activeConfiguration || 'End Cameras';
    activeConfiguration = targetConfig;

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
      // Sync depth visualization mode
      if (data.display.showDepthVisualization !== undefined) {
        setDepthVisualizationMode(data.display.showDepthVisualization);
      }
      // Apply projector visibility (will be done by main app)
    }

    // Load orbit camera position and target
    if (data.orbitCamera) {
      camera.position.set(...data.orbitCamera.position);
      controls.target.set(...data.orbitCamera.target);
      controls.update();
    }

    // Return camera data for the target configuration
    if (data.configurations && data.configurations[targetConfig]) {
      return {
        ...data,
        cameras: data.configurations[targetConfig].cameras,
        activeConfiguration: targetConfig
      };
    } else if (data.cameras) {
      // Legacy format - migrate to new structure
      return { ...data, activeConfiguration: targetConfig };
    }

    return { activeConfiguration: targetConfig };
  } catch(e) {
    console.error('Failed to load settings:', e);
  }

  return null;
}

export function exportJSON(){
  // Export the full settings structure from localStorage
  const saved = localStorage.getItem('hallwayPlannerSettings');
  if (!saved) {
    alert('No settings to export');
    return;
  }

  try {
    const data = JSON.parse(saved);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'hallway_planner.json';
    a.click();
  } catch(e) {
    alert('Failed to export settings: ' + e.message);
  }
}

export function importJSON(file){
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);

      // Save the imported data directly to localStorage (preserves per-config structure)
      localStorage.setItem('hallwayPlannerSettings', JSON.stringify(data));

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
        // Sync depth visualization mode
        if (data.display.showDepthVisualization !== undefined) {
          setDepthVisualizationMode(data.display.showDepthVisualization);
        }
      }

      // Load orbit camera position and target
      if (data.orbitCamera) {
        camera.position.set(...data.orbitCamera.position);
        controls.target.set(...data.orbitCamera.target);
        controls.update();
      }

      const status = document.getElementById('status');
      if (status) {
        status.textContent = '✓ Settings imported - reload page to apply';
        setTimeout(() => { status.textContent = ''; }, 3000);
      }

      // Prompt user to reload
      if (confirm('Settings imported successfully. Reload page to apply all configurations?')) {
        window.location.reload();
      }
    } catch(e){
      alert('Invalid JSON: ' + e.message);
    }
  };
  reader.readAsText(file);
}
