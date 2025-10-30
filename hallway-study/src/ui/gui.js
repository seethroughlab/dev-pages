// ===== GUI =====
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm';
import { defaults, peopleSettings, raycastSettings, displaySettings, FT } from '../core/config.js';
import { scene, setDepthVisualizationMode } from '../core/scene.js';

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
}

export function setupGUI() {
  gui = new GUI({ title: 'Hallway Planner (Three.js)' });

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
  f.add(cam.pos, 'x', -defaults.hallway.width_ft*FT/2, defaults.hallway.width_ft*FT/2, 0.05).name('X (m)').onChange(()=>{
    cam.build();
    if (updateHeatmapCallback) updateHeatmapCallback();
    if (saveSettingsCallback) saveSettingsCallback();
  });
  f.add(cam.pos, 'y', 0, defaults.hallway.height_ft*FT, 0.05).name('Y (m)').onChange(()=>{
    cam.build();
    if (updateHeatmapCallback) updateHeatmapCallback();
    if (saveSettingsCallback) saveSettingsCallback();
  });
  f.add(cam.pos, 'z', -5, 5, 0.05).name('Z offset (m)').onChange(()=>{
    cam.build();
    if (updateHeatmapCallback) updateHeatmapCallback();
    if (saveSettingsCallback) saveSettingsCallback();
  });
  f.add(cam, 'yaw', -180, 180, 1).name('Yaw').onChange(()=>{
    cam.build();
    if (updateHeatmapCallback) updateHeatmapCallback();
    if (saveSettingsCallback) saveSettingsCallback();
  });
  f.add(cam, 'pitch', -60, 30, 1).name('Pitch').onChange(()=>{
    cam.build();
    if (updateHeatmapCallback) updateHeatmapCallback();
    if (saveSettingsCallback) saveSettingsCallback();
  });
  f.add(cam, 'roll', -30, 30, 1).name('Roll').onChange(()=>{
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
    gui.removeFolder(f);
    if (saveSettingsCallback) saveSettingsCallback();
  } }, 'remove').name('Remove');
}
