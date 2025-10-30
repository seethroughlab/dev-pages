// ===== Auto-save to localStorage & Import/Export =====
import { defaults, peopleSettings, displaySettings } from '../core/config.js';
import { camera, controls, setDepthVisualizationMode } from '../core/scene.js';

// These will be set by main app
let camerasArray = null;
let projectorsArray = null;

export function setCamerasArray(cameras) {
  camerasArray = cameras;
}

export function setProjectorsArray(projectors) {
  projectorsArray = projectors;
}

export function saveSettings() {
  if (!camerasArray) return;

  const data = {
    heatmap: defaults.heatmap,
    people: peopleSettings,
    display: displaySettings,
    cameras: camerasArray.map(c=>({
      name: c.name,
      pos: [c.pos.x, c.pos.y, c.pos.z],
      yaw: c.yaw,
      pitch: c.pitch,
      roll: c.roll,
      end: c.end
    })),
    orbitCamera: {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z]
    }
  };
  localStorage.setItem('hallwayPlannerSettings', JSON.stringify(data));

  // Show brief save confirmation
  const status = document.getElementById('status');
  if (status) {
    status.textContent = '✓ Saved';
    setTimeout(() => { status.textContent = ''; }, 1500);
  }
}

export function loadSettings() {
  const saved = localStorage.getItem('hallwayPlannerSettings');
  if (!saved) return null;

  try {
    const data = JSON.parse(saved);

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

    return data; // Return data for cameras
  } catch(e) {
    console.error('Failed to load settings:', e);
  }

  return null;
}

export function exportJSON(){
  if (!camerasArray) return;

  const data = {
    heatmap: defaults.heatmap,
    people: peopleSettings,
    display: displaySettings,
    cameras: camerasArray.map(c=>({ name:c.name, pos:[c.pos.x,c.pos.y,c.pos.z], yaw:c.yaw, pitch:c.pitch, roll:c.roll, end:c.end })),
    orbitCamera: {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z]
    }
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'hallway_planner.json'; a.click();
}

export function importJSON(file, callbacks){
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);

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
        // Apply projector visibility (callback will handle this)
      }

      // Load orbit camera position and target
      if (data.orbitCamera) {
        camera.position.set(...data.orbitCamera.position);
        controls.target.set(...data.orbitCamera.target);
        controls.update();
      }

      // Call callbacks to rebuild scene with loaded data
      if (callbacks.rebuildCameras) {
        callbacks.rebuildCameras(data.cameras || []);
      }
      if (callbacks.buildHeatmap) {
        callbacks.buildHeatmap();
      }
      if (callbacks.createPeople) {
        callbacks.createPeople();
      }
      if (callbacks.updateHeatmap) {
        callbacks.updateHeatmap();
      }
      if (callbacks.applyProjectorVisibility) {
        callbacks.applyProjectorVisibility();
      }

      const status = document.getElementById('status');
      if (status) {
        status.textContent = '✓ Settings imported';
        setTimeout(() => { status.textContent = ''; }, 2000);
      }

      saveSettings(); // Save imported settings
    } catch(e){ alert('Invalid JSON'); }
  };
  reader.readAsText(file);
}
