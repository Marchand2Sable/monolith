# Changelog

All notable changes to MONOLITH. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions: [Semantic Versioning](https://semver.org/) (see `VERSIONING.md`).

## [0.1.0] - 2026-11-15

First version prepared for publication. Nothing has been released yet: no tag exists until the release in `RELEASE_PROCESS.md` is made. Update the date above on that day.

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
