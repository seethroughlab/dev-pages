# Preset Documents

This file explains how to edit the preset camera configurations in `presets.json`.

## Editing Presets Visually

1. **Load a preset** from the "Open Document" dropdown (e.g., "1. Side Entry Cameras")
2. **Use the transform controls** to position and rotate cameras:
   - Click a camera to select it
   - Use keyboard shortcuts: `T` (translate), `R` (rotate), `E` (scale)
   - Drag the gizmo handles to adjust position and rotation
3. **Export the updated preset** by clicking "📋 Copy as Preset JSON" in the File menu
4. **Update presets.json**:
   - Open `presets.json` in your text editor
   - Find the preset you want to update (by name)
   - Replace it with the JSON from your clipboard
   - Save the file
5. **Refresh the page** to load the updated preset

## Expression Format

Positions can use expressions with hallway dimensions:
- `width_m` - hallway width (2.0574m)
- `height_m` - hallway height (3.4538m)
- `length_m` - hallway length (13.1064m)

Examples:
- `"height_m"` - top of hallway (ceiling)
- `"-length_m / 2"` - start of hallway
- `"length_m / 2"` - end of hallway
- `"-width_m / 2"` - left wall

These expressions make presets adapt automatically if hallway dimensions change.

## Adding New Presets

Simply add a new object to the array in `presets.json` following the same format as existing presets.
