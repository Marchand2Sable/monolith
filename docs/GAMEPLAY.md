# MONOLITH — gameplay overhaul (audit, rules, level intentions)

## Audit (before the overhaul)

| Finding | Consequence |
|---|---|
| Space started the simulation; rotation was `R` only | Space now turns the piece; simulate moved to Enter (and the button). |
| Rotation was a single quarter turn on the vertical axis | A beam could never stand on end, an arch never be flipped. Now 24 orientations. |
| Placement snapped to a 0.5 grid; a turn that did not fit was refused | Grid is 0.25; a turn that does not fit slides to the nearest spot that does (`Board.planNear`). |
| One scripted first-time line on level 1 | Replaced by LEVEL 0, an interactive tutorial. |
| 14 levels designed for flat pieces only | Re-explored with the new orientations (random + exhaustive search through the real physics): shortcuts found on L'escalier, Les marches and Le gouffre were turned into official solutions (par follows). Three levels added. |

## Controls

| Action | Desktop | Touch |
|---|---|---|
| Turn on the board (90°) | Space, R (Shift+R: other way) | Tourner |
| Tip onto a side / stand on end | T or Shift+Space (Shift+T: other way) | Coucher |
| Simulate / back to building | Enter (Space goes back from a run) | Simuler |
| Undo / redo / delete | Ctrl+Z / Ctrl+Y / Delete | buttons |

Space/T work on the piece in hand (while dragging) or on the selected piece. A press that would not change what the piece looks like (a cube, a pillar turned half a turn) is skipped, so every press shows something.

## Orientation model (`src/core/orient.ts`)

`rot = pose * 4 + yaw`. `yaw` (0..3) is the quarter turn on the board; `pose` (0..5) is how the piece lies first: standing, tipped forward, upside down, tipped back, on either side. That is exactly the 24 rotations of a cube. Orientations 0..3 are the old ones, so every earlier solution still means the same thing. `turn`, `turnSize`, `quatOf` come from one table, so the planner, the scene and Rapier cannot disagree (`tests/orient.test.ts` checks it for 9 shapes × 24 orientations, including a settle test).

## Validation

Winning is judged by the physics only (height of the pieces that count over the zone + everything still and nothing fallen). Any build that satisfies it wins; the lists of solutions are what the tests replay, not what the game requires. Placement refuses only: nothing under the piece, overlap, too high.

## LEVEL 0 (tutorial) — `src/game/tutorial.ts`

Five steps (goal, place, stand the beam, simulate, done). A step that asks for a gesture (place the beam, stand it with T or the button, simulate) moves on by itself 0.9 s after the gesture; "Suivant" stays closed until then and opens it at once. The text follows the input: buttons for a finger, keys for a keyboard (`Game.usesTouch`). Highlights follow the 3D scene or a UI element (`Ui.targetRect`), the dimming is light (0.34), explaining steps freeze the board. "Précédent", "Passer le tutoriel", replay from the title and from the level list. It earns no medal and takes no part in the campaign.

**The card never hides the level.** While a step is shown, the interface hands the camera the room the card leaves (`OrbitCamera.inset`) and what has to stay in view (`focus`: the goal, the fixed pieces and 1.6 around them). The camera measures where that box falls, slides the view (and shrinks it only if it does not fit) so the box sits in the free part, eased. Portrait: scene above the card. Landscape phone (low and wide): the card is a column at the left under the pause button, the objectives step aside, the scene takes the middle and right. The dev flow (`__e2e.ui()`) checks at each step that the zone and a beam stood on the pillar are on screen and not under the card; run at 1100×720, 390×800, 360×640 and 740×360.

## Levels (17 + sandbox + LEVEL 0)

Each has one idea; ratings never go down.

| # | Level | Rating | Idea |
|---|---|---|---|
| 1 | Premier pas | 1 | build on the grey pieces |
| 2 | L'escalier | 2 | any flat top carries a piece, even high; **a beam stood on end does it alone** (par 1) |
| 3 | La clef de voûte | 2 | an arch needs a foot on each side |
| 4 | Sous l'arche | 3 | a shape is required at the top |
| 5 | **Sur la tranche** (new) | 3 | flat, the whole stock makes 7.5 of the 8: a long piece must stand on end |
| 6 | Les marches | 3 | stairs are a base, high on one side |
| 7 | La tour de Pise | 4 | what overhangs falls: prop it |
| 8 | L'équerre | 4 | prop under a tilting beam |
| 9 | Le gouffre | 5 | a long piece links two supports (or a plate on edge) |
| 10 | Le pont brisé | 6 | a cantilever needs a column under its end or a weight behind |
| 11 | **Le linteau** (new) | 6 | span the gap between two posts first, or raise the posts |
| 12 | Le surplomb | 7 | a slab holds alone, loaded it tips |
| 13 | Le té | 7 | a wide bar loads what carries it |
| 14 | Le balancier | 8 | support the far end of a loose beam |
| 15 | L'éboulement | 8 | watch where things fall, use it |
| 16 | Les ruines | 9 | everything at once |
| 17 | **Le monolithe** (new) | 10 | height 12 from a stock that only makes it standing |

Every level has ≥ 3 solutions and ≥ 1 trap, all replayed through Rapier by `npm test`; `__e2e.run()` replays them in the real page.

## Tools

* `npm run check` — types, tests (160), build.
* `EXPLORE=1 npx vitest run tests/explore.test.ts` — random explorer: counts winning builds per level, tipped vs flat (`EXPLORE_TRIALS`, `EXPLORE_ONLY`, `EXPLORE_FAMILIES`).
* `EXPLORE=1 EXPLORE_MODE=short EXPLORE_MAX=2 EXPLORE_BUDGET=120 …` — exhaustive search of builds of ≤ n pieces around the goal: finds the short ways to win a designer would miss.
* In the dev page: `__e2e.run()` (all solutions and traps), `__e2e.ui()` (89 checks: real clicks, drags, keys, touch, the whole tutorial), `__pump(s)` to advance a hidden pane.

## Not verified

A real touch device (only emulated viewports), sound audibility, Safari/Firefox, and the random explorer cannot prove that the hardest levels have no unexpected shortcut — only that none was found in the searched space.
