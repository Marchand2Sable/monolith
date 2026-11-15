# DEPLOYMENT — comment MONOLITH est publié

```
poste de travail ──push──▶ GitHub (source de vérité)
                              │
        branche ≠ main / PR ──┼──▶ ci.yml            contrôles seulement
        push sur main ────────┼──▶ deploy-pages.yml  contrôles → GitHub Pages  (PREVIEW)
        tag vX.Y.Z ───────────┴──▶ release.yml       contrôles → GitHub Release → itch.io (Butler)  (STABLE)
        tag vX.Y.Z-beta.N ─────────▶ release.yml     idem, GitHub pré-release → canal html5-beta si activé  (BETA)
```

Pages et itch.io sont indépendants : un échec de l'un n'arrête pas l'autre. Un simple push ne publie **jamais** sur itch.io.

## Canaux

| Canal | Déclencheur | Où | Version affichée dans Réglages |
|---|---|---|---|
| DEVELOPMENT | branche de travail | nulle part (CI seulement) | `… · ci` |
| PREVIEW | push sur `main` validé | GitHub Pages | `0.1.0 · a1b2c3d · preview` |
| BETA | tag `vX.Y.Z-beta.N` / `-rc.N` | GitHub pré-release ; itch.io `html5-beta` seulement si `ITCH_BETA_ENABLED=true` | `… · beta` |
| STABLE | tag `vX.Y.Z` sur un commit de `main` | GitHub Release ; itch.io `html5` | `… · stable` |

## Fichiers du pipeline

| Fichier | Rôle |
|---|---|
| `.github/workflows/ci.yml` | Pull request et branches : `npm ci`, types, tests, build, `verify-build`, `verify-version`. Rien n'est publié. |
| `.github/workflows/deploy-pages.yml` | Push sur `main` : mêmes contrôles, puis déploiement GitHub Pages (`upload-pages-artifact` + `deploy-pages`). Permissions minimales (`pages: write`, `id-token: write` sur le seul job de déploiement). |
| `.github/workflows/release.yml` | Tag de version : tag = version de `package.json` = section du changelog ; tag d'une version stable sur `main` ; tests ; build ; `verify-build` ; zip avec `index.html` à la racine (relu avec `unzip`) ; GitHub Release ; itch.io. |
| `scripts/check-version.mjs` | Vérifie le semver, la correspondance tag/version, la section du changelog ; écrit les notes de version ; donne le canal. |
| `scripts/verify-build.mjs` | Vérifie le build avant toute publication (voir plus bas). |

## Secrets et variables (à saisir dans GitHub, jamais dans le dépôt ni dans une conversation)

`Repository → Settings → Secrets and variables → Actions`

| Nom | Type | Valeur | Obligatoire pour |
|---|---|---|---|
| `BUTLER_API_KEY` | **Secret** | la clé API itch.io destinée à Butler (itch.io → Settings → API keys → *Generate new API key*) | publier sur itch.io |
| `ITCH_USER` | Variable | nom du compte itch.io (la partie avant `/` dans `compte/jeu`) | publier sur itch.io |
| `ITCH_GAME` | Variable | slug de la page du jeu | publier sur itch.io |
| `ITCH_BETA_ENABLED` | Variable | `true` seulement quand le canal bêta est prêt et voulu | pousser une bêta |

Sans `ITCH_USER` et `ITCH_GAME`, `release.yml` crée quand même la GitHub Release et **saute** le job itch.io (il n'échoue pas).
Le workflow n'écrit jamais la clé dans un fichier ni dans le build ; GitHub masque les secrets dans les journaux.

## Réglages GitHub à faire une fois (manuel)

1. **Pages** : `Settings → Pages → Build and deployment → Source : GitHub Actions`. Pour un dépôt **privé**, Pages dépend de l'offre du compte : à vérifier.
2. **Environnement `itch-release`** : `Settings → Environments → New environment`, puis *Required reviewers* = vous. Le push itch.io attendra alors votre validation (« publication contrôlée »).
3. **Tags immuables** : `Settings → Rules → Rulesets → New tag ruleset`, motif `v*`, cocher *Restrict updates* et *Restrict deletions*. Cela empêche de déplacer ou supprimer une version publiée.
4. **Protection de `main`** (recommandé) : exiger que le job `check` de `ci.yml` passe avant fusion.

## Page itch.io (manuel, rien n'est créé automatiquement)

1. Créer le projet : *Kind of project : HTML*. Garder la page en **Draft** ou *Restricted* tant que rien n'est vérifié.
2. Choisir le slug, le reporter dans `ITCH_GAME`. Le compte va dans `ITCH_USER`.
3. Faire un premier envoi (voir `RELEASE_PROCESS.md`). **Un nom de canal n'active pas le jeu dans le navigateur** : sur la page du projet, le fichier envoyé doit être coché *This file will be played in the browser*. Après la première publication Butler, ouvrir la page, cocher cette case sur le fichier qui vient d'apparaître, et vérifier que le bouton de lecture fonctionne. Je n'ai pas pu confirmer ce comportement depuis cette machine.
4. *Embed options* : choisir une taille de départ (par exemple 960×600) et activer le bouton plein écran. Ne cocher **Mobile friendly** qu'après un vrai test sur téléphone.
5. Compléter titre, description, contrôles (voir `README.md`), captures d'écran **réelles** (à faire depuis le jeu), crédits (Three.js, Rapier : MIT/Apache-2.0).
6. Publier la page (la rendre publique) : action volontaire, à ne faire qu'après le test en ligne.

## Ce que `verify-build` contrôle

`index.html` à la racine ; aucune adresse externe, absolue ou « racine » (`/assets/…`) dans `index.html` ; chaque fichier référencé existe, **avec la même casse** ; aucune référence à `localhost`, `file://` ou un chemin local ; aucune forme de secret (jeton GitHub, clé privée, clé AWS, jeton Slack, nom du secret Butler) ; aucun `.map`, `.ts`, `.md`, `.log`, `.env` ; les limites d'itch.io pour un jeu HTML : 1000 fichiers, 500 Mo au total, 200 Mo par fichier, chemins de 240 caractères au plus (valeurs relevées dans la documentation et les forums d'itch.io, que la plateforme peut changer : à reconfirmer sur <https://itch.io/docs/creators/html5>). Le build actuel : 5 fichiers, 2,6 Mo.

## Butler

Installé dans la CI à partir de `https://broth.itch.zone/butler/linux-amd64/<version>/archive/default`, version figée dans `release.yml` (`BUTLER_VERSION`, 15.24.0). Commande de publication :

```
butler push dist "$ITCH_USER/$ITCH_GAME:html5" --userversion 0.1.0
butler status "$ITCH_USER/$ITCH_GAME"
```

Je n'utilise pas `butler push-preview` : je n'ai pas pu confirmer son existence. Le contrôle avant envoi est `verify-build` plus l'approbation de l'environnement `itch-release`.

## Sauvegardes entre plateformes

GitHub Pages et itch.io sont deux origines différentes : le `localStorage` de l'une n'est pas visible de l'autre, et aucune synchronisation n'existe. Le jeu propose **Exporter / Importer** (Réglages) pour déplacer une progression à la main. Voir `SAVE_SYSTEM.md`.

## Non vérifié (à ce jour)

- Aucun workflow n'a encore tourné : il n'y a pas de dépôt GitHub. La syntaxe a été relue à la main (pas d'outil de validation YAML sur cette machine) ; GitHub la validera au premier push.
- Butler : jamais exécuté ici (outil absent). Le téléchargement `broth.itch.zone` répond (redirection 307), l'installation et le push n'ont pas été essayés.
- Jeu dans l'iframe d'itch.io, dans l'export (téléchargement de fichier depuis un iframe) et l'import : non testés ; ils dépendent des permissions de l'iframe.
- Aucun jeu n'a été publié sur GitHub Pages ni sur itch.io.
- Téléphone réel, Safari, Firefox : non testés.
