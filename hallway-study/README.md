Musical Note Selection

Bass Zone (Triggers 0-15):
  - Emphasizes roots and fifths for harmonic foundation
  - Root notes weighted strongest (1.0), thirds weaker (0.6-0.8)
  - 25% rest probability creates breathing room
  - Quarter note duration for solid, grounded feel

Pads Zone (Triggers 16-31):
  - Simple triadic voicings: root, third, fifth
  - Cycles through chord inversions across two octaves
  - Balanced weights (0.7-1.0) for smooth harmony
  - 35% rest probability, sustains until person exits
  - Creates atmospheric, sustained harmonic bed

Lead Zone (Triggers 32-47):
  - Singable melodies with stepwise motion
  - Descending and ascending phrases for natural contour
  - Higher rest probability (40%) for phrasing
  - Eighth note duration for melodic agility

Chord Progressions:
  - 6 pop-friendly progressions using only I, IV, V, vi chords
  - Auto-changes every 8 bars (configurable)
  - Progressions include: I-V-vi-IV, vi-IV-I-V, I-IV-V-I, I-vi-IV-V, I-IV-vi-V, I-V-IV-V
  - All three zones update patterns when chord changes
  - Current chord highlighted in UI display

Key Changes:
  - 24 keys available via Camelot Wheel system
  - Auto-changes every 16 bars (configurable) to compatible keys
  - Compatible keys: same letter (A↔B), adjacent numbers (±1), or same number
  - Maintains harmonic relationships during transitions
  - All trigger MIDI notes recalculated on key change

Overall Design:
  - Weighted probability ensures stable tones play more often/louder
  - Rest probabilities prevent constant sound wall
  - Tempo-locked durations maintain musical timing
  - Random initialization of key and chord progression on load
