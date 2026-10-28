# Alpenglow

A procedural Three.js flight through an imagined Swiss alpine valley. The current build is a **stylized work in progress**, not a photorealistic final render. The landscape, water, clouds, wildlife, aircraft, pilot, scarf and sound effects are generated in code without downloaded visual assets. The background score is the user-supplied recording in `assets/flight-to-the-light.wav`. Three.js is the sole runtime library.

## Preview

The current local preview is at [http://127.0.0.1:4173](http://127.0.0.1:4173). To run it again from this folder:

```sh
npm install
python3 server.py
```

Open the printed address in a WebGL-capable browser. The dependency is pinned to Three.js `0.186.1` (r186). On a machine without `npm`, use another Node package manager to install the dependency in `package.json`.

- **Watch the full film** starts the approximately 2:36 sequence from its night opening. The background stays in a peaceful cruise until you start playback. Use the pause button alongside the playback clock to pause or resume, and replay after the ending. At sunrise it flows into the 60-second chase: the two approaching pursuers cross at staggered heights, bank through wide turns, and settle behind the penguin on exchanged sides. They later overshoot below as the plane climbs. At the apex the harnessed pilot hangs inverted before rolling into a dive behind them. Incoming fire ends before the pull-up, and the penguin fires only after its flight path lines up with each target. Each explosion follows a projectile reaching its target, with a layered blast, sparks and a brief screen shake. Reduced-motion settings soften the shake and flash. Afterward, the plane approaches as the penguin raises the goggles and winks; the image holds with a motion echo, then the camera sweeps around in one continuous move as the plane climbs away. An end title fades in over the continuing departure with options to replay or explore.
- **Cinema mode** starts the film without labels or controls. The square icon in the footer also enters cinema mode during playback. Move the pointer or tap to reveal pause and exit controls temporarily; Space pauses or resumes and Escape restores the interface. The ending card still appears when the film finishes.
- **Explore the scene / Guided tour** opens twenty-two stops explaining the techniques, with short previews of the pilot's gesture, the wake, the pursuers' overshoot, an explosion, birds, dolphins, and the farewell. The main film pauses while the tour is open. **Watch the chase** jumps straight to the 60-second sequence. The stops advance automatically, or use the next/previous buttons and arrow keys. Escape closes the tour.
- The play controls start the supplied score alongside locally synthesized engine, wind, near misses, rapid gunfire and valley echoes, water impacts, and explosions. The score is gently time-fitted to the film, follows the chase shortcut and restart controls, and pauses with the film or guided tour. All sound, including the propeller, fades out at the end title. The music-note button mutes or enables sound, and an explicit mute is remembered for replay in the current page. A browser that blocks audio can use that button to retry. The music-generation prompt is in `SUNO_PROMPT.md`.
- The **Night–Sunrise** line is a scrubber. Restart returns to the beginning of the flight; the arrow button changes the camera angle, and the target button toggles the overhead view.
- The scenery repeats with matched terrain edges during a long flight. For development, `?time=314` starts the animation at that many seconds.
- The overhead lake view reveals a shallow glacial shoal with rocks, vegetation, fish and animated caustics. The water blends the lakebed with the reflected world according to depth and viewing angle. Dolphin breaches trigger foam, spray and wakes at their surface crossings; bullet strikes use shorter, finer jets and disturb the reflected water separately.
- The session meter is expandable. It reads aggregate records for this Codex chat locally, including cached input, and counts active turns while excluding gaps between turns. It may include tool wait time inside an active turn and updates as records are written. If the session records cannot be found, the meter reports unavailable.
- The dollar figure is a **standard API price equivalent**, not a Codex invoice. It applies the published GPT-6.1 Terra input, cached-input, 30-minute cache-write, and output rates, including the long-context adjustment per recorded request. It cannot know unrecorded service-tier, cache-retention, regional, tool, or tax charges. The API rates are documented at [OpenAI's model page](https://developers.openai.com/api/docs/models/gpt-6.1-terra).

## Progress captures

The `screenshots/` folder contains numbered images captured during development, including intermediate rendering mistakes, plus an animated time lapse assembled from them. The original PNGs are retained at full preview resolution.

## Further realism work

The current mountain surfaces, forest, water, cockpit, and plush character are procedural approximations. They would need additional geology and erosion, richer vegetation and lake depth, detailed aircraft construction, higher-fidelity cloth and fur, volumetric atmosphere, and more refined cinematic rendering to approach the requested ultra-realistic goal.

## Checks

With Node.js and Python installed, run `npm test` to check terrain and lakebed seams, surface crossings, the cloth simulation, the pursuers' crossing and camera framing, flight alignment and clearance, projectile travel and impact timing, score synchronization and streaming, sound events and mute behavior, usage aggregation, price calculations, and idle-gap handling.
