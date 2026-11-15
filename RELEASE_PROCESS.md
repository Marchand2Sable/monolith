# RELEASE_PROCESS

## Travail quotidien (aucune release)

```bash
git switch -c ma-branche      # ou rester sur main si on travaille seul
git add -A
git commit -m "Improve the stairs level"
git push
```

Branche ≠ `main` ou pull request : `ci.yml` contrôle. Push sur `main` : `deploy-pages.yml` met à jour la **preview** GitHub Pages. Rien ne part sur itch.io.

## Publier une version

Pré-requis : dépôt GitHub créé, secret et variables itch.io saisis, réglages de `DEPLOYMENT.md` faits (sinon la GitHub Release se fait quand même et itch.io est sauté).

1. **Choisir la version** (voir `VERSIONING.md`) : `git log <dernier tag>..HEAD`, plus haut niveau de changement.
2. **Mettre à jour** `package.json` (`"version"`) et `CHANGELOG.md` (section `## [X.Y.Z] - AAAA-MM-JJ`, rédigée depuis les changements réels).
3. **Contrôler en local** : `npm run ci` (types, tests, build, vérification du build et de la version).
4. **Fusionner dans `main`** et attendre que la preview Pages passe au vert ; jouer la preview.
5. **Préparer le commit de release et le tag** :

```bash
git add -A
git commit -m "Prepare release 0.1.0"
git push
git tag -a v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

6. `release.yml` s'exécute : version/tag/changelog, tests, build, `verify-build`, zip, GitHub Release, puis (si configuré) itch.io après votre validation de l'environnement `itch-release`.
7. **Vérifier en ligne** : la page itch.io (bouton de lecture, version affichée dans Réglages = celle publiée, une partie jouée, sauvegarde après rechargement) et la GitHub Release (zip, notes).

Une préversion suit le même chemin avec un tag `v0.1.0-beta.1` (et `package.json` en `0.1.0-beta.1`). Elle ne va sur itch.io que si `ITCH_BETA_ENABLED=true`.

Un re-lancement du workflow pour le même tag reconstruit le même commit et remplace les fichiers de la même release ; il ne crée pas de nouvelle version.

## Si le contrôle de version échoue

| Message | Cause | Remède |
|---|---|---|
| `tag "vX" does not match package.json version` | tag et `package.json` diffèrent | **ne pas** déplacer le tag s'il a été poussé : corriger `package.json`, publier une nouvelle version |
| `CHANGELOG.md has no "## [X]" section` | changelog oublié | idem |
| `Tag … is not on main` | version stable posée hors de `main` | fusionner dans `main`, publier la version suivante |
| `The secret BUTLER_API_KEY is not set` | secret absent | l'ajouter dans les paramètres GitHub (jamais dans le chat), relancer le job |

## Rollback

On ne réécrit jamais l'historique et on ne réutilise jamais un tag.

1. **Identifier** la dernière version saine : `git tag --sort=-creatordate`, la page des Releases GitHub, l'historique des builds itch.io.
2. **Retrouver son commit** : `git rev-list -n 1 v1.1.0`.
3. **Comparer** : `git diff v1.1.0 v1.2.0 --stat`, puis le détail du fichier suspect.
4. **Reproduire** cette version si besoin : `git switch --detach v1.1.0 && npm ci && npm run ci`.
5. **Préparer une version corrective** : soit corriger le problème sur `main`, soit rétablir le contenu sain avec `git revert <commit fautif>` (un nouveau commit, historique intact).
6. **Publier** sous un **nouveau** numéro (`v1.2.0` défectueuse, `v1.1.0` saine → `v1.2.1`), avec une entrée de changelog qui dit ce qui est revenu en arrière et pourquoi, après validation de la preview.

Les sauvegardes des joueurs ne sont pas touchées par un rollback du jeu : voir `SAVE_SYSTEM.md` (un jeu plus ancien ne lit pas un schéma plus récent, il met la sauvegarde de côté sans l'effacer ; c'est une raison de ne changer `SAVE_SCHEMA` que pour une vraie raison).

## Premier envoi sur itch.io (une fois)

Le workflow s'en charge dès que la page, `ITCH_USER`, `ITCH_GAME` et `BUTLER_API_KEY` existent. En manuel, depuis un poste avec Butler installé et connecté (`butler login`, hors dépôt) :

```bash
npm run build && npm run verify:build
butler push dist compte/slug:html5 --userversion 0.1.0
```

(Remplacer `compte/slug` ; ne jamais écrire la clé dans un fichier du dépôt.) Zip pour un envoi à la main depuis l'interface web d'itch.io, `index.html` à la racine du zip, sous PowerShell : `Compress-Archive -Path dist\* -DestinationPath monolith-html5.zip`.
