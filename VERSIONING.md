# VERSIONING

## Convention

[Semantic Versioning](https://semver.org/) : `MAJOR.MINOR.PATCH`, préversion en suffixe.

| Changement | Incrémente | Exemples pour un jeu |
|---|---|---|
| Rupture : une sauvegarde ancienne ne se lit plus, des commandes changent de sens, refonte du gameplay | MAJOR | changer le sens d'une touche, supprimer des niveaux |
| Contenu ou fonction compatible | MINOR | nouveaux niveaux, nouvelle pièce, nouveau réglage |
| Correction ou retouche mineure | PATCH | bug de collision, texte, équilibrage sans effet sur les médailles |
| Avant la publication | préversion | `0.5.0-beta.1`, `1.0.0-rc.1` |

La version n'est **pas** choisie à l'envie : on lit `git log <dernier tag>..HEAD` et le `CHANGELOG.md`, et on prend le plus haut niveau de changement rencontré. Avant `1.0.0`, la bascule vers `1.0.0` marque « le jeu est prêt à être présenté publiquement ».

Version actuelle : **0.1.0** (aucune release faite). Suggestion pour la première publication : `v0.1.0-beta.1` sur le canal bêta, puis `v0.1.0` quand le test en ligne et sur téléphone est fait. Décision du studio.

## Une seule source

`package.json` → `"version"`. Rien d'autre ne contient le numéro à la main.

| Qui lit la version | Comment |
|---|---|
| Le jeu | `src/buildinfo.ts` (valeurs injectées par `vite.config.ts` : version, commit, date, canal). Affiché en bas des Réglages et dans la console (`MONOLITH 0.1.0 · a1b2c3d · stable`), jamais sur l'écran de jeu. |
| Le build | `vite.config.ts` lit `package.json` ; le commit vient de `GITHUB_SHA` ou de `git rev-parse` ; le canal de `BUILD_CHANNEL` (`ci`, `preview`, `beta`, `stable`, ou `local`). |
| GitHub Actions / Butler | `scripts/check-version.mjs` : `--userversion` reçoit la version de `package.json`, après contrôle qu'elle égale le tag sans le `v`. |
| La documentation | `CHANGELOG.md`, section `## [version]`. |

## Tags

- Un tag = une version : `vX.Y.Z` ou `vX.Y.Z-préversion`, annoté (`git tag -a`).
- Posé sur un commit de `main` pour une version stable ; `release.yml` refuse sinon.
- Jamais déplacé, jamais réutilisé, jamais supprimé après publication (règle de tags GitHub : voir `DEPLOYMENT.md`). Une erreur se corrige par une **nouvelle** version.
- `check-version.mjs` refuse un tag qui n'égale pas `v` + la version de `package.json`.

## Changelog

`CHANGELOG.md`, format Keep a Changelog : `Added`, `Changed`, `Fixed`, `Improved`, `Removed`, `Technical`. Une section par version, rédigée **depuis les modifications réelles**. `release.yml` en extrait les notes de la GitHub Release ; une section vide fait échouer le contrôle.

## Version du jeu ≠ version de la sauvegarde

Deux numéros indépendants. La version du jeu est dans `package.json`. La version du schéma de sauvegarde est `SAVE_SCHEMA` dans `src/game/save.ts` (aujourd'hui 1) : voir `SAVE_SYSTEM.md`. Une nouvelle version du jeu ne touche pas au schéma tant que la forme des données ne change pas.
