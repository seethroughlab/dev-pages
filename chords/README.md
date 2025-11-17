# Piano Chord Analyzer

A modular JavaScript application for real-time chord detection and progression suggestions from audio input.

## Features

- Real-time audio analysis using Web Audio API
- Automatic chord detection (major, minor, diminished, augmented, suspended, 7th, etc.)
- Musical note identification with octave detection
- Chord progression suggestions based on music theory
- Interactive frequency spectrum visualization
- Detection confidence meter

## Architecture

The application is organized into modular ES6 modules:

```
chords/
├── index.html           # Main HTML page (56 lines, down from 562!)
├── styles.css           # Application styles
├── js/
│   ├── main.js          # Application entry point and coordinator
│   ├── config.js        # Configuration and constants
│   ├── audioAnalyzer.js # Audio analysis and note detection
│   ├── chordDetector.js # Chord identification engine
│   └── visualizer.js    # Spectrum visualization
└── README.md            # This file
```

## Modules

### config.js
Contains all configuration constants:
- Note frequency mappings (all 12 notes across 8 octaves)
- Chord type definitions (intervals from root)
- Chord progression database
- FFT settings
- Detection thresholds

### audioAnalyzer.js
`AudioAnalyzer` class handles:
- Audio context and analyser setup
- Microphone access and stream management
- Frequency data analysis
- Peak detection in frequency spectrum
- Frequency to musical note conversion

### chordDetector.js
`ChordDetector` class provides:
- Chord identification from detected notes
- Multiple chord type support
- Confidence scoring
- Chord progression suggestions
- Music theory-based recommendations

### visualizer.js
`SpectrumVisualizer` class renders:
- Real-time frequency spectrum
- Rainbow gradient visualization
- Smooth animation with trail effect

### main.js
`ChordAnalyzerApp` class coordinates:
- Module initialization
- UI event handling
- Analysis loop management
- Display updates

## Usage

1. Open `index.html` in a modern browser (Chrome, Edge, Firefox)
2. Allow microphone access when prompted
3. Click "Start Listening"
4. Play chords on your piano or other instrument
5. View detected notes, identified chord, and suggested progressions

## Supported Chords

- **Triads**: Major, Minor, Diminished, Augmented
- **Suspended**: sus2, sus4
- **Seventh**: Dominant 7th, Major 7th, Minor 7th
- **Sixth**: Major 6th, Minor 6th

## Browser Support

Requires a browser with:
- Web Audio API support
- ES6 modules support
- getUserMedia API support

## Development

The application uses ES6 modules loaded with `type="module"`. No build step is required.

To modify detection parameters, edit `js/config.js`:
- `FFT_SIZE`: FFT resolution (higher = better frequency resolution)
- `SMOOTHING_TIME_CONSTANT`: Analyser smoothing (0-1)
- `FREQUENCY_THRESHOLD`: Minimum amplitude for peak detection

## How It Works

1. **Audio Input**: Captures microphone audio through getUserMedia API
2. **Frequency Analysis**: Uses FFT to convert audio to frequency spectrum
3. **Peak Detection**: Identifies prominent frequencies in the spectrum
4. **Note Detection**: Converts frequencies to musical notes
5. **Chord Identification**: Matches detected notes against chord patterns
6. **Suggestions**: Provides next chord suggestions based on music theory

## License

See main repository license.
