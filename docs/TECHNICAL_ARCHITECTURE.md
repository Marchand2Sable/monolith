# MONOLITH 3D — architecture technique

TypeScript + Vite. Three.js pour le rendu, Rapier (WASM) pour la physique, DOM/CSS pour l'interface, Web Audio pour le son. Aucun framework.

## Principe

Les **règles** ne savent rien de l'écran ; la **physique** ne sait rien du rendu ; le **rendu** ne décide de rien. Le jeu (`Game`) relie les trois. C'est ce qui permet de rejouer tous les niveaux sous Node, sans navigateur.

```
src/
  core/        règles pures, aucune dépendance moteur
    math.ts      Vec3, Box, rng, clamp…
    kinds.ts     les 9 formes : boîtes, taille, volume, noms, teintes
    levels.ts    données des 14 niveaux + bac à sable
    board.ts     placement (plan / planAt), qualification, victoire (evaluate)
  physics/
    sim.ts       Rapier : un corps par pièce (celles du joueur et les fixes), pas fixe 1/100 s, verdict
  render/
    stage.ts     la scène Three.js : plateau, pièces, zone, éclat, effets, picking
    atmosphere.ts  6 ambiances, ciel, skyline, brume
    pieces.ts    maillages, matériaux, vignettes de la colonne
    orbit.ts     caméra orthographique orbitale
  game/
    game.ts      flux : états, glisser-déposer, undo/redo, simulation, médailles
    save.ts      progression, déblocage, accomplissements, looks (localStorage)
    audio.ts     sons procéduraux
  ui/
    ui.ts / style.css   pages, HUD, carte de résultat, pause
    debug.ts / e2e.ts / uiflow.ts   outils de développement uniquement
  main.ts      branchement canvas, pointeur, clavier, boucle d'images
  errors.ts    erreur WebGL visible, erreurs à l'exécution collectées
tests/        Vitest
```

Correspondance avec les systèmes demandés dans le brief : `GameEngine` → `main.ts` (boucle) + `Game.tick` ; `GameState` → `Game.state/page` ; `LevelManager` → `buildLevels` + `Game.startLevel` ; `GridSystem` → `snap` et `plan` dans `board.ts` ; `PieceSystem` → `kinds.ts` + `pieces.ts` ; `ConstructionSystem` → `Board.plan/planAt` + glisser-déposer de `Game` ; `PhysicsSystem` → `Sim` ; `ValidationSystem` → `Board.evaluate` ; `CameraSystem` → `OrbitCamera` ; `Renderer` → `Stage` ; `InputController` → `main.ts` + `Game.pointer*/key` ; `UIController` → `Ui` ; `AudioManager` → `Audio` ; `SaveSystem` → `Progress`. `LevelGenerator` n'existe pas : les niveaux sont faits main, comme dans le jeu Unity.

## Flux d'une partie

1. `Game.startLevel(i)` construit un `Board` vide et demande à `Stage.loadLevel` la scène.
2. Le joueur tire une pièce : `startDrag` → `updateDrag` (rayon sur la scène, `planAt`, fantôme vert/rouge) → `endDrag` (pose, annulation, anneau).
3. `startSim` : `new Sim(level, pièces)`. Les pièces fixes du niveau deviennent des corps dynamiques. `Stage.followSim` recopie chaque corps sur sa vue à chaque image.
4. `Game.tick` avance la physique par pas de 1/100 s (12 pas max par image). `Sim.finished` : immobile 2 s, ou 15 s, ou une pièce tombée depuis 1,5 s.
5. `Game.finish` → `Board.evaluate` sur les boîtes réelles → `conclude` (médailles, éclat, accomplissements, sons, éclats de victoire) → carte de résultat.

## Physique : réglages et choix

- Corps dynamiques sans mise en veille ; masse de chaque boîte = son volume (densité uniforme, comme sous Unity) ; prisme = enveloppe convexe de masse 0,5.
- Friction pièce 0,75, plateau 0,6 (Rapier fait la moyenne) ; restitution 0 ; amortissement léger.
- 40 itérations de solveur + 8 de friction pour garder les tours hautes en place.
- Une pièce fixe qui tombe sous −6 est gelée (elle ne prolonge pas la simulation) ; une pièce du joueur sous −2,5 compte comme tombée.
- Le déterminisme de Rapier fait que le verdict d'un test Node est celui du navigateur (vérifié : 247 contrôles dans la page).

## Sauvegarde

Une chaîne JSON dans `localStorage['monolith3d.save.v1']`. Une sauvegarde abîmée (JSON invalide, valeurs absurdes, look non débloqué) est ramenée dans les bornes ; un stockage indisponible (navigation privée) n'empêche pas de jouer.

## Mobile

Pointer Events (souris, doigt, stylet). Deux doigts = pincement (zoom) ; un doigt tire une pièce 90 px au-dessus du bout du doigt. Mise en page : colonne de pièces à droite sur écran large, bande horizontale en bas en portrait ; cartes de niveaux sur deux colonnes ; `touch-action: none` sur le canvas ; marges `safe-area`.

## Développement

`import.meta.env.DEV` charge le panneau de debug (touche `` ` `` ou `?debug`), expose `window.__monolith`, `window.__e2e.run()`, `window.__e2e.ui()` et `window.__pump(s)`. Rien de tout cela n'est dans le build de production (vérifié : `window.__monolith` y est `undefined`).
