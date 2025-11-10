
This application was originally designed to study camera placement strategies. Now we're going to be focusing on the floor texture, and a system that sends WebMIDI signals out as the "people" move around. Let's start with the flooor texture. The current systems/floor-texture.js is created entirely with a canvas, but I believe we will have to use ThreeJS instancing and FBOs to make the new floor texture.

The floor should be divided into 48 "triggers" (you can also think of these as notes) along the long dimension of the hall, grouped into 3 "instruments" (16 triggers each).  For now, the instruments should be "bass", "pads", and "lead", but these categories might change, so don't use the names too much in the code itself. Just call them Zone 1, Zone 2, and Zone 3.

Each instrument will also have a slightly different visualizations. For the Bass instrument, each trigger will be a string - similar to a bass guitar string - that will be "plucked" when a person enters the trigger area. For Pads, each trigger will be a retangle that glows as the trigger is held. For the lead, it will also be a simple rectangle, but the glow will mimic the "hit" of a piano hamer on a piano string.

The whole thing should be quantized so that triggers are only activated on 16th notes, with a global BPM of 120. When a person walks over one of the triggers, it will send a MIDI note on a chanel (bass=channel 1, pads=channel 2, leads=channel 3). 

Bass: NoteOn and NoteOff should happen automatically
Pads: NoteOn sent when the note is triggered, and released when the person leaves the trigger
Lead: Same as Bass

If the length of the hallway is the Y dimension, then the users X dimension will also be sent as a continuous stream of MIDI CC messages that will control some kind of effect.

The floor texture will be projected by 3 projectors with a native resolution of 1920 x 1200 pixels overlaped by 154 pixels. So I believe that means the full texture will be 5452x1200. 