# Changelog

All notable changes to MONOLITH. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions: [Semantic Versioning](https://semver.org/) (see `VERSIONING.md`).

## [0.1.1] - 2026-11-18

Playtest feedback on the tutorial.

### Improved
- The tutorial is shorter: 5 steps instead of 9 (objective, place, stand the beam, simulate, done).
- A step that asks for a gesture now moves on by itself shortly after the gesture is made; "Suivant" is only needed on the explaining steps.
- The tutorial speaks of buttons when the player uses a finger and of keys when they use a keyboard.
- The tutorial dims the scene less, and the progress shows as five small bars.

### Fixed
- The tutorial card hid part of the level on phones and other small or low screens. The view now fits the goal and the build area into what the card leaves free, on portrait and landscape screens, and gives the whole screen back when the tutorial ends. On a low, wide screen the card becomes a narrow column at the left and the objectives step aside while it shows.

### Technical
- `OrbitCamera` can fit its scene into an inset of the screen; the dev UI flow checks at every tutorial step that the zone and the standing beam are on screen and not under the card.

## [0.1.0] - 2026-11-16

First published version. The itch.io page stays a draft until the online game has been checked in its iframe and on a phone.

### Added
- Web port of the Unity game MONOLITH (Three.js for the scene, Rapier for the physics, TypeScript, Vite): a quiet physics puzzle, pieces placed on a board, gravity judges.
- 17 campaign levels, a sandbox and an interactive tutorial (LEVEL 0). Every level has at least 3 known solutions and at least 1 trap, all replayed through the physics by the tests.
- Space turns the piece on the board; T (or Shift+Space) tips it onto a side or stands it on end: 24 orientations per piece. Buttons "Tourner" and "Coucher" on touch screens. Simulation moved to Enter and its button.
- Placement grid of 0.25; a turn that does not fit slides to the nearest valid spot instead of being refused.
- Achievements, three medals per level, five looks opened by medals, "level unlocked" feedback.
- Save export and import as a JSON file (settings), for moving progress between browsers and sites.
- Version, commit and channel of the build shown at the bottom of the settings and in the console.
- Studio pipeline: CI, GitHub Pages preview, itch.io release through Butler, version and build checks (`scripts/`), and the documents `DEPLOYMENT.md`, `VERSIONING.md`, `RELEASE_PROCESS.md`, `SAVE_SYSTEM.md`.

### Changed
- The save now lives under the studio key `tts:monolith:save:v1`. A save written under the earlier key `monolith3d.save.v1` is read and carried over; the earlier copy is left in place.
- A save that cannot be read (damaged, or from a newer game) is set aside under `<key>:unreadable` before a fresh start, instead of being overwritten.
- Campaign records are matched by level title, so the campaign can be reordered without moving a player's progress.

### Fixed
- Three levels (L'escalier, Les marches, Le gouffre) had shortcuts with the new orientations; they were added as official solutions and the "économe" par follows.

### Technical
- One source of version: `package.json`. The build injects version, commit, date and channel (`src/buildinfo.ts`).
- `base: './'`: relative paths, so the same build runs under a GitHub Pages sub-path and in the itch.io iframe.
