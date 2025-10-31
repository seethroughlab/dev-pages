// ===== Camera Configuration Presets =====
import { defaults } from '../core/config.js';

// Camera configurations for different deployment scenarios
// All positions use absolute world coordinates (center of hallway is x=0, z=0)
export const cameraConfigurations = {
  'End Cameras': {
    description: 'Two cameras at each end of the hallway',
    cameras: [
      {
        name: 'Cam A',
        pos_m: [0, defaults.hallway.height_m - 0.5, -defaults.hallway.length_m / 2 + 0.5],
        yawDeg: 0,
        pitchDeg: -8,
        rollDeg: 0,
        hFovDeg: 80
      },
      {
        name: 'Cam B',
        pos_m: [0, defaults.hallway.height_m - 0.5, defaults.hallway.length_m / 2 - 0.5],
        yawDeg: 180,
        pitchDeg: -8,
        rollDeg: 0,
        hFovDeg: 80
      }
    ]
  },

  'Top-Down 3-Camera': {
    description: 'Three cameras equally spaced, looking straight down',
    cameras: [
      {
        name: 'Cam A',
        pos_m: [0, defaults.hallway.height_m - 0.3, -defaults.hallway.length_m / 2 + 2],
        yawDeg: 0,
        pitchDeg: 90,
        rollDeg: 90,
        hFovDeg: 80
      },
      {
        name: 'Cam B',
        pos_m: [0, defaults.hallway.height_m - 0.3, 0],
        yawDeg: 0,
        pitchDeg: 90,
        rollDeg: 90,
        hFovDeg: 80
      },
      {
        name: 'Cam C',
        pos_m: [0, defaults.hallway.height_m - 0.3, defaults.hallway.length_m / 2 - 2],
        yawDeg: 0,
        pitchDeg: 90,
        rollDeg: 90,
        hFovDeg: 80
      }
    ]
  },

  'Staggered Ceiling': {
    description: 'Three staggered cameras near ceiling, looking inward and pitched down',
    cameras: [
      {
        name: 'Cam A',
        pos_m: [defaults.hallway.width_m / 3, defaults.hallway.height_m - 0.4, -defaults.hallway.length_m / 3],
        yawDeg: -60,
        pitchDeg: 45,
        rollDeg: 0,
        hFovDeg: 80
      },
      {
        name: 'Cam B',
        pos_m: [-defaults.hallway.width_m / 3, defaults.hallway.height_m - 0.4, 0],
        yawDeg: 60,
        pitchDeg: 45,
        rollDeg: 0,
        hFovDeg: 80
      },
      {
        name: 'Cam C',
        pos_m: [defaults.hallway.width_m / 3, defaults.hallway.height_m - 0.4, defaults.hallway.length_m / 3],
        yawDeg: -60,
        pitchDeg: 45,
        rollDeg: 0,
        hFovDeg: 80
      }
    ]
  }
};

// Get list of configuration names
export function getConfigurationNames() {
  return Object.keys(cameraConfigurations);
}

// Get configuration by name
export function getConfiguration(name) {
  return cameraConfigurations[name];
}
