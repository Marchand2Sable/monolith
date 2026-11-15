# SAVE_SYSTEM

Code : `src/game/save.ts`. Tests : `tests/rules.test.ts` (« save and progression »).

## Où et comment

- `localStorage`, une seule entrée JSON, **clé `tts:monolith:save:v1`** (`tts:<id du jeu>:save:v<schéma>`). L'identifiant `monolith` est fixe : il ne suit pas le titre commercial.
- Pas d'IndexedDB : quelques centaines d'octets, pas de besoin.
- Pas de serveur, pas de compte, **pas de synchronisation**.

## Contenu

Niveaux (identifiant = titre du niveau, réussi, meilleur nombre de pièces, éclat), succès (bits), réglages (volume, son, rotation de la vue, niveaux ouverts), look choisi, tutoriel fait. Pas d'état de partie en cours.

## Deux versions indépendantes

| | Où | Aujourd'hui |
|---|---|---|
| Version du jeu | `package.json` | `0.1.0` |
| Schéma de sauvegarde | `SAVE_SCHEMA` (et champ `version` dans les données) | `1` |

On touche à `SAVE_SCHEMA` seulement quand la **forme** des données change, jamais pour une simple nouvelle version du jeu.

## Lecture (`Progress.load`)

1. Clé courante. Si vide : clés d'anciens builds (`LEGACY_KEYS` = `monolith3d.save.v1`). La progression est alors recopiée sous la clé courante au premier enregistrement ; **l'ancienne entrée n'est jamais supprimée**.
2. `migrate()` : refuse ce qui n'est pas un objet ou n'a pas de version entière valide, refuse une version **plus récente** que celle du jeu, applique les étapes `MIGRATIONS[n]` (n → n+1) pour une version plus ancienne.
3. `fit()` : rattache les niveaux par titre (les anciennes sauvegardes sans identifiant sont lues dans l'ancien ordre), borne volume, look, succès (une sauvegarde abîmée ne casse pas le jeu).
4. Illisible (JSON cassé, version inconnue ou trop récente) : le texte d'origine est mis de côté sous **`<clé>:unreadable`** *avant* le démarrage à neuf. Rien n'est écrasé sans copie. `Progress.recovered` vaut `true`.
5. Stockage indisponible (navigation privée, bloqué) : le jeu tourne, il ne se souvient pas.

## Écriture

Sauvegarde automatique à chaque victoire et à chaque réglage. Les erreurs de quota ou de blocage sont absorbées.

## Ajouter une migration (schéma 1 → 2)

1. `SAVE_SCHEMA = 2`, et la clé du studio `…:save:v2`. Garder `tts:monolith:save:v1` dans `LEGACY_KEYS` pour que `load()` aille la chercher.
2. `MIGRATIONS[1] = (d) => ({ ...d, nouveauChamp: valeurParDéfaut })`.
3. Ajouter un test : une sauvegarde v1 réelle (copier un export) chargée par le nouveau code garde ses données.
4. Un jeu plus ancien qui rencontre le schéma 2 met la sauvegarde de côté (`:unreadable`) au lieu de l'effacer.

## Export / import (Réglages → Sauvegarde)

- **Exporter** télécharge `monolith-save-AAAA-MM-JJ.json` : `{ format: "tts-save", game: "monolith", schema, exportedAt, data }`.
- **Importer** lit un tel fichier et remplace la progression. Refusé, sans rien changer : fichier de plus de 256 Ko, ni JSON, ni `tts-save`, autre jeu, schéma plus récent ou illisible. La progression remplacée est mise de côté sous **`<clé>:before-import`**. Les valeurs sont bornées comme pour toute sauvegarde.
- C'est le seul moyen de passer d'une origine à l'autre.

## GitHub Pages et itch.io

Deux origines web différentes : une sauvegarde créée sur l'une n'existe pas sur l'autre, ni sur un autre navigateur, ni sur un autre appareil. Le jeu ne le cache pas et ne promet pas de synchronisation. L'export/import est la passerelle manuelle.

## Limites

- Les entrées `:unreadable` et `:before-import` ne sont pas nettoyées automatiquement, et rien dans le jeu ne les relit (récupération à la main, depuis la console du navigateur).
- Un seul emplacement de sauvegarde.
- Le comportement dans l'iframe d'itch.io (stockage tiers bloqué, téléchargement de l'export) **n'a pas été testé** : si le stockage y est bloqué, le jeu fonctionne sans mémoire.
- Effacer les données du site efface la progression ; l'export est la sauvegarde de secours.
