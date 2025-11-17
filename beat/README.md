# Real-Time Beat Detector

A modular JavaScript application for real-time beat detection from audio input.

## Features

- Real-time audio analysis using Web Audio API
- Beat detection for kick, snare, and hi-hat
- Interactive frequency range visualization
- Draggable frequency ranges for customization
- Support for multiple audio input sources

## Architecture

The application is organized into modular ES6 modules:

```
beat/
├── index.html           # Main HTML page
├── styles.css          # Application styles
├── js/
│   ├── main.js         # Application entry point
│   ├── config.js       # Configuration and constants
│   ├── audioDevices.js # Audio device management
│   ├── beatDetector.js # Beat detection engine
│   ├── visualizer.js   # Spectrum visualization
│   └── rangeControls.js # Frequency range interactions
└── index.old.html      # Backup of original monolithic version
```

## Modules

### config.js
Contains all configuration constants:
- History size for beat detection
- Cooldown periods
- Default frequency ranges
- Visual colors
- FFT settings

### audioDevices.js
`AudioDeviceManager` class handles:
- Enumerating audio input devices
- Requesting microphone permissions
- Device selection management

### beatDetector.js
`BeatDetector` class provides:
- Audio context and analyser setup
- Frequency energy calculation
- Beat detection algorithm
- Configurable frequency ranges
- Beat callbacks

### visualizer.js
`SpectrumVisualizer` class renders:
- Frequency spectrum bars
- Frequency range overlays
- Energy indicators
- Real-time visualization loop

### rangeControls.js
`RangeControls` class enables:
- Mouse-based range dragging
- Edge resizing
- Range movement
- Cursor feedback

### main.js
`BeatDetectorApp` class coordinates:
- Module initialization
- UI event handling
- Application state management

## Usage

1. Open `index.html` in a modern browser (Chrome, Edge, Firefox)
2. Allow microphone access when prompted
3. Select your audio input source from the dropdown
4. Click "Start Detection"
5. **Adjust frequency ranges** by dragging the colored rectangles:
   - Drag the **edges** to resize a range
   - Drag the **middle** to move the entire range
6. **Adjust detection thresholds** by dragging the **yellow dashed lines** up/down:
   - Higher threshold = less sensitive (fewer false positives)
   - Lower threshold = more sensitive (more beats detected)
   - Threshold values range from 1.0x to 2.0x average energy

## Browser Support

Requires a browser with:
- Web Audio API support
- ES6 modules support
- getUserMedia API support

## Development

The application uses ES6 modules loaded with `type="module"`. No build step is required.

To modify beat detection parameters, edit `js/config.js`.

## License

See main repository license.
