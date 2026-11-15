# DEPLOYMENT_AUDIT — MONOLITH (état du 2026-11-15, avant la mise en place du pipeline)

Audit fait avant toute modification de l'infrastructure. Les faits viennent des fichiers du projet et de commandes exécutées sur la machine ; ce qui n'a pas pu être vérifié est dit comme tel.

## Architecture

| Élément | Constat |
|---|---|
| Projet | MONOLITH 3D, portage web du jeu Unity (dossier voisin `../MonolithUnity`, non concerné). |
| Technologies | TypeScript 5.7 (strict), Vite 6, Three.js 0.170 (rendu), Rapier 0.14 (`@dimforge/rapier3d-compat`, WASM embarqué en base64 dans le JS), Vitest 2. |
| Gestionnaire | npm, `package-lock.json` présent. Node 24 en local, README : « Node 20 ou plus ». |
| Point d'entrée | `index.html` → `src/main.ts`. |
| Scripts | `dev` (port 5174), `build` (`tsc --noEmit && vite build`), `preview`, `test`, `typecheck`, `check`. |
| Sortie | `dist/` : 5 fichiers (index.html, 1 CSS, 3 JS), 2,6 Mo, 761 Ko pour le moteur physique compressé. |
| Backend | Aucun. Aucun appel réseau (`fetch`, `XMLHttpRequest`, WebSocket : zéro occurrence dans `src/`). Aucune police ni image externe. |

## Fonctionnement

17 niveaux de campagne, un bac à sable, un tutoriel interactif (LEVEL 0), médailles, succès, 5 looks, réglages (son, volume, rotation de la vue, niveaux ouverts). Gameplay et direction artistique **ne sont pas touchés** par ce travail. Détails : `docs/GAMEPLAY.md`.

## Compatibilité de distribution

| Point | Constat |
|---|---|
| Hébergement statique | Oui. `vite.config.ts` : `base: './'`, chemins relatifs. `dist/index.html` n'a que des `./assets/...`. |
| GitHub Pages | Compatible sans changement de base (fonctionne sous `/<repo>/`). Pas de routeur : une seule page, pas de `404.html` nécessaire. |
| itch.io HTML5 | `index.html` à la racine de `dist/`, chemins relatifs, 5 fichiers. Très en dessous des limites documentées (voir `DEPLOYMENT.md`). Fonctionnement dans l'iframe d'itch.io : **non testé** (voir « Non vérifié »). |
| Mobile | Contrôles tactiles et mise en page à 375×812 vérifiés par émulation uniquement. Pas d'essai sur un vrai appareil. |
| Plein écran | Pas de bouton interne ; le plein écran d'itch.io enveloppe l'iframe. |
| Sauvegarde | `localStorage`, clé `monolith3d.save.v1` (avant ce travail). Un seul objet JSON, champ `version: 1`, validation et bornage à la lecture, magasin absent toléré. Lacunes relevées : clé non préfixée par le studio ; une sauvegarde illisible était écrasée sans copie ; aucune migration prévue ; aucun export. |
| Versionnage | `package.json` : `0.1.0`. Aucune injection dans le jeu, aucun changelog, aucun tag. |

## Git

| Élément | Constat |
|---|---|
| Dépôt | **Aucun.** `monolith3d/` n'était pas un dépôt git et aucun dossier parent non plus (le dossier parent regroupe le projet Unity, des maquettes et des notes). |
| Remote, branches, tags, releases, workflows | Aucun. |
| Fichiers à exclure | `node_modules/`, `dist/`, `*.log` étaient déjà ignorés ; ajoutés : secrets, clés, fichiers de release, dossiers d'éditeur. |
| Identité git | `user.name` et `user.email` non configurés sur la machine. |

## Outils

| Outil | État |
|---|---|
| git 2.56 | présent |
| Node 24 / npm | présents |
| GitHub CLI (`gh`) | **absent**, donc pas de connexion GitHub possible depuis cette session |
| Butler | **absent** (installé uniquement dans la CI, version figée) |
| Compte GitHub / compte itch.io | non connus : ni nom d'utilisateur ni slug ne sont devinés |

## Sécurité

Recherche de `.env`, `.pem`, `.key`, jetons et clés dans le dépôt de travail : aucun fichier de ce genre. `scripts/verify-build.mjs` refait la recherche sur le build avant chaque publication. Aucune donnée personnelle dans le code distribué.

## Stratégie retenue

1. Dépôt propre dans `monolith3d/` (et non dans le dossier parent) : un jeu, un dépôt, un historique.
2. Source unique de version : `package.json`, injecté dans le build avec le commit, la date et le canal.
3. Trois workflows : `ci.yml` (PR et branches), `deploy-pages.yml` (preview depuis `main`), `release.yml` (tag `vX.Y.Z` → GitHub Release → itch.io via Butler).
4. Sauvegarde : clé studio `tts:monolith:save:v1`, migration depuis l'ancienne clé, copie de sécurité d'une sauvegarde illisible, export/import JSON.
5. Contrôles automatiques avant toute publication : version/tag/changelog, tests, build, `verify-build`.

## Non vérifié à la date de l'audit

Voir la section dédiée de `DEPLOYMENT.md` : tout ce qui demande GitHub, itch.io ou un appareil réel.
