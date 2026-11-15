# MONOLITH — audit de migration Unity → web

Ce document dit ce que contenait le projet Unity, ce qui a été gardé, adapté ou reconstruit, et ce qui a réellement été vérifié.

## 1. Point de départ (et un écart avec le brief)

Le brief demandait de « sortir de Unity ». En réalité le dépôt contenait **deux** projets :

| Dossier | Contenu | État |
|---|---|---|
| `../monolith` | Version web **2D** (TypeScript, Vite, planck.js/Box2D, Canvas 2D), v0.11.1, 16 niveaux générés, tests | Finie, **non touchée** |
| `../MonolithUnity` | Version **3D** (Unity 6, PhysX) : 14 niveaux faits main, médailles, 6 ambiances, sauvegarde, 9 formes, orbite à 360° | Source de ce portage, **non touchée** |

Décision (confirmée par l'utilisateur) : porter **le jeu Unity 3D** vers un nouveau projet web 3D, `../monolith3d`, sans déplacer ni supprimer les deux autres. Le brief proposait de renommer l'ancien projet en `legacy-unity/` ; ce n'est pas fait, pour ne rien casser (chemins, Unity Hub, raccourci du bureau). Les sources restent donc là où elles sont.

## 2. Ce que fait le jeu Unity (inventaire)

- **Règles** : on pose des pièces (cube, poutre, plaque, pilier, prisme, équerre, té, arche, escalier) sur un plateau 8×8 (10×10 en bac à sable), sur une grille de 0,5. Une pièce tombe sur la surface la plus haute sous elle ; elle ne peut pas flotter ni entrer dans une autre.
- **Pièces fixes** : chaque niveau place des pièces grises qui servent d'appui, et qui deviennent *dynamiques* quand la simulation démarre (une tour penchée tombe, ce qu'elle touche aussi).
- **Victoire** : le haut d'une pièce (de la forme demandée, si le niveau en nomme une) dont le centre est dans la zone atteint la hauteur voulue (tolérance 0,02), et la construction est immobile 2 s sans qu'une pièce soit tombée (limite 15 s).
- **Progression** : 14 niveaux, déblocage en chaîne (option « tous ouverts »), 3 médailles par niveau (réussi / économe = pas plus de pièces que la plus courte solution connue / éclat caché), 6 accomplissements, 5 looks débloqués par le nombre de médailles.
- **Ambiance** : 6 atmosphères (ciel, lumière, brume, skyline de tours/portiques/escaliers sans chevauchement), son 100 % procédural, intro de niveau, tutoriel de la première partie, effets (anneau, onde, éclats de victoire, tremblement).
- **Écrans** : titre, niveaux, réglages, récompenses, fin, pause, carte de résultat.
- **Contrôles** : glisser-déposer depuis la colonne, R, Espace, Ctrl+Z/Y, Suppr, flèches (±45°), Home, molette, clic droit pour déplacer, pincement, pièce tenue au-dessus du doigt au tactile.

## 3. Classement A / B / C

**A — conservé tel quel (logique, ré-écrite 1:1 en TypeScript)** : formes et leurs boîtes, algorithme de placement (`Plan`/`PlanAt`), règles de victoire, données des 14 niveaux (solutions, pièges, difficulté, ambiance, éclat, textes), règles de médailles/déblocage/accomplissements, 5 looks, six ambiances, recettes sonores, caméra isométrique orbitale, direction artistique.

**B — adapté** : interface (IMGUI → DOM/CSS, responsive), sauvegarde (PlayerPrefs → `localStorage`, tolérante aux erreurs), audio (`AudioClip` → Web Audio, déverrouillé au premier geste), entrées (souris/clavier/tactile → Pointer Events), rendu (URP → Three.js : lumière directionnelle, ombres douces, lignes épaisses pour la zone).

**C — reconstruit** : la physique (PhysX → **Rapier 3D** en WebAssembly), le build et le lancement (Unity → Vite), les tests (éditeur Unity → Vitest + vérification dans le navigateur).

## 4. Dépendances Unity et leur remplacement

| Unity | Web |
|---|---|
| PhysX, `Rigidbody`, `PhysicMaterial` | Rapier (`RigidBody`, friction 0,75, restitution 0, masse = volume, 40 itérations de solveur, pas de 1/100 s) |
| `Camera` orthographique + `OrbitCamera` | `THREE.OrthographicCamera` + `render/orbit.ts` |
| `OnGUI` / IMGUI | `ui/ui.ts` + `ui/style.css` |
| `PlayerPrefs` + `JsonUtility` | `localStorage` + `JSON` (`game/save.ts`) |
| `AudioClip.Create` | `AudioBuffer` calculés au démarrage (`game/audio.ts`) |
| `LineRenderer` pointillé | `LineSegments2` (lignes épaisses, tirets) |
| `ParticleSystem` | `THREE.Points` |

## 5. Risques de migration et ce qu'ils sont devenus

| Risque | Résultat |
|---|---|
| Deux moteurs physiques ne se comportent pas pareil : une solution marginale sous PhysX peut tomber sous Rapier | **Réel, un cas.** « Le pont brisé », solution 4 : le cube posé à 0,5 du centre de la poutre la faisait basculer sous Rapier. Corrigé en le centrant. Les 77 autres cas passent sans changement. |
| Les niveaux dépendent d'équilibres fins | Chaque solution connue (≥ 3 par niveau) et chaque piège est rejoué par la physique dans un test automatique |
| Image miroir (Unity est à gauche, Three à droite) | La disposition des niveaux est identique en chiffres ; l'image à l'écran est un miroir de celle de Unity. Sans conséquence sur le jeu |
| Poids du build | 79 Ko de jeu, 498 Ko Three.js, 2,0 Mo Rapier (WASM inclus, 761 Ko compressé) |

## 6. À préserver absolument (vérifié)

Zone en boîte d'une unité dont le haut est à la hauteur voulue (verte quand le but est tenu) · pièces grises qui tombent · économe = nombre de pièces ≤ solution la plus courte · éclat = pièce qui l'englobe (marge 0,24) · déblocage progressif · plusieurs solutions par niveau.

## 7. Ce qui n'est pas porté

- Les outils d'éditeur Unity (captures, bot de test aléatoire `GameDev`, `LabLevels`) — remplacés par les tests listés dans le README.
- Aucun son enregistré (il n'y en avait pas) ; aucune bibliothèque de polices (police système).
