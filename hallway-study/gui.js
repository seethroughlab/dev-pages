// ===== GUI =====
import GUI from 'https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm';
import { defaults, peopleSettings, raycastSettings, displaySettings, FT } from './config.js';
import { scene } from './scene.js';

export let gui;
let camerasArray = null;
let projectorsArray = null;
let saveSettingsCallback = null;
let buildHeatmapCallback = null;
let updateHeatmapCallback = null;
let createPeopleCallback = null;
let seedCamerasCallback = null;
let addCameraCallback = null;

export function setCallbacks(callbacks) {
  camerasArray = callbacks.cameras;
  projectorsArray = callbacks.projectors;
  saveSettingsCallback = callbacks.saveSettings;
  buildHeatmapCallback = callbacks.buildHeatmap;
  updateHeatmapCallback = callbacks.updateHeatmap;
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

  gui.add({reset: ()=>{
    // Reset to defaults (hallway settings are hardcoded)
    defaults.heatmap = { cell: 0.25 };
    peopleSettings.enabled = false;
    peopleSettings.count = 3;
    displaySettings.showProjectors = true;

    // Apply projector visibility
    if (projectorsArray) {
      projectorsArray.forEach(proj => {
        proj.group.visible = displaySettings.showProjectors;
      });
    }

    // Remove camera folders from GUI first (everything after Heatmap and People Simulation)
    const foldersToRemove = gui.folders.slice(2);
    foldersToRemove.forEach(fd => gui.removeFolder(fd));

    // Remove cameras from scene and clear array
    if (camerasArray) {
      camerasArray.slice().forEach(c => scene.remove(c.group));
      camerasArray.length = 0;
    }

    // Create new default cameras
    if (seedCamerasCallback) seedCamerasCallback();

    // Add camera GUI folders
    if (camerasArray && addCameraCallback) {
      camerasArray.forEach(cam => addCameraToGUI(cam));
    }

    // Rebuild scene elements
    if (updateHeatmapCallback) updateHeatmapCallback();
    if (createPeopleCallback) createPeopleCallback();
    if (saveSettingsCallback) saveSettingsCallback();

    // Refresh ALL GUI controllers to show reset values
    gui.controllersRecursive().forEach(c => c.updateDisplay());
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
