# MONOLITH 3D — la version web

Un puzzle de physique calme, en 3D, dans le navigateur. Posez des pièces géométriques sur un plateau, atteignez la zone, puis lancez la simulation : la gravité juge. C'est le portage web du jeu Unity (`../MonolithUnity`) ; la version web 2D plus ancienne (`../monolith`) reste intacte. Two Tone — *less decoration, more contrast*.

## Lancer

Node 20 ou plus.

```bash
npm install
npm run dev        # serveur de développement : http://localhost:5174
npm run build      # vérifie les types, puis écrit le site statique dans dist/
npm run preview    # sert dist/ en local (http://localhost:4173)
npm test           # tests Vitest (règles, sauvegarde, tous les niveaux rejoués par la physique)
npm run check      # types + tests + build
npm run ci         # check + vérification du build + vérification de la version (ce que lance la CI)
```

`dist/` est un site statique à chemins relatifs : à envoyer tel quel (itch.io HTML5, GitHub Pages, n'importe quel serveur). Pas de serveur de jeu, pas de compte. La progression est dans `localStorage` (clé `tts:monolith:save:v1`), liée au navigateur, à l'appareil et au site ; Réglages → Exporter / Importer la déplace à la main.

## Versions et publication

| Quoi | Où |
|---|---|
| Version actuelle | `package.json` (source unique), affichée en bas des Réglages |
| Historique des changements | `CHANGELOG.md` |
| Convention, tags, rollback | `VERSIONING.md`, `RELEASE_PROCESS.md` |
| Pipeline GitHub Pages / itch.io, secrets, réglages | `DEPLOYMENT.md` (audit initial : `DEPLOYMENT_AUDIT.md`) |
| Sauvegarde, migrations, export | `SAVE_SYSTEM.md` |

Un push sur `main` met à jour la preview GitHub Pages ; un tag `vX.Y.Z` lance la release (GitHub Release, puis itch.io via Butler). Un simple push ne publie jamais sur itch.io.

## Jouer

| Geste | Effet |
|---|---|
| Glisser une pièce de la colonne vers le plateau | La poser (fantôme blanc = possible, rouge = refusé) |
| Glisser une pièce posée | La déplacer (la lâcher sur l'interface l'annule) |
| Glisser le fond | Tourner la vue (360°, inclinable) · clic droit : déplacer · molette / pincement : zoom |
| **Espace** (ou **R**) · **Suppr** | Tourner de 90° sur le plateau / retirer la pièce sélectionnée |
| **T** (ou **Maj+Espace**) | Coucher la pièce sur un côté, ou la dresser (24 orientations) |
| **Ctrl+Z / Ctrl+Y** | Annuler / rétablir |
| **Entrée** | Simuler, puis revenir à la construction |
| **← →** · **Home** | Tourner la vue de 45° · revenir à l'isométrique |
| **Échap** | Pause |

But : amener le haut d'une pièce (de la forme demandée, s'il y en a une) dans la boîte en pointillés, puis que la construction tienne 2 s. Les pièces grises sont fixes avant la simulation — mais elles tombent si elles sont instables. Trois médailles par niveau : réussi, économe (pas plus de pièces que la plus courte solution connue), éclat (un éclat flotte sur le plateau). Les niveaux s'ouvrent dans l'ordre (réglage « tous ouverts » disponible). Cinq looks pour les pièces s'ouvrent avec les médailles.

Sur mobile : un doigt tire la pièce 90 px au-dessus du bout du doigt ; deux doigts zooment.

## Outils de développement

Seulement avec `npm run dev` (absents du build joueur) :

- **Panneau de debug** : touche `` ` `` ou `?debug` — choisir un niveau, rejouer une solution connue, forcer réussite/échec, voir les coordonnées, les pièces et les erreurs.
- `?nosplash` / `?splash` — cacher / montrer l'écran d'ouverture du studio.
- Dans la console : `__e2e.run()` rejoue toutes les solutions et tous les pièges dans la page (rendu, physique et sauvegarde réels) ; `__e2e.ui()` fait cliquer l'interface (clics DOM, touches, glisser depuis la colonne, tactile, pincement, pause, réglages) ; `__pump(secondes)` fait avancer le jeu à la main quand l'onglet est caché (un onglet caché ne reçoit pas d'images d'animation).

## Ce qui a été vérifié (et comment)

| Élément | Vérification | Résultat |
|---|---|---|
| Règles de placement, victoire, données des niveaux, sauvegarde | `npm test` (Vitest) | 28 tests |
| 14 niveaux : ≥ 3 solutions chacun gagnent, les pièges échouent, rien posé n'est pas une victoire | `npm test`, sous Node avec Rapier | 78 tests |
| Les mêmes solutions dans la page, avec le vrai rendu et la vraie sauvegarde | `__e2e.run()` | 247 contrôles, 0 échec |
| Interface : clics, touches, glisser-déposer, tactile, pincement, pause, réglages, effacement, victoire → suivant | `__e2e.ui()` | 43 contrôles, 0 échec |
| Build de production : démarre, console vide, outils de debug absents | `npm run preview` + navigateur | oui |
| Écrans (titre, niveau, victoire, échec, réglages, récompenses), mise en page mobile 375×812 | Captures d'écran regardées | oui |

## Limites connues — à lire

- **Pas testé sur un vrai téléphone ni un vrai écran tactile.** Le tactile est vérifié par des événements de pointeur simulés (type `touch`) et par l'émulation d'écran 375×812 du navigateur intégré.
- **Les sons n'ont pas été écoutés** (aucune sortie audio dans l'environnement de test). Ce sont les mêmes recettes que le jeu Unity, déjà adoucies à la demande de l'utilisateur ; Web Audio ne démarre qu'après un premier geste.
- **Performances non mesurées** sur une machine ou un navigateur réels (une seule mesure ponctuelle, plus de 100 images/s dans le volet d'aperçu).- **Écran d'ouverture** : la séquence de titre et le passage au menu ont été vérifiés, pas son animation à l'œil dans une fenêtre visible.
- **Pas de Playwright** : il aurait fallu télécharger un navigateur ; les tests de page tournent dans le navigateur intégré (`__e2e`), sans automate externe. Ils ne sont pas lancés par `npm test`.
- **Navigateurs** : seul Chromium a servi aux essais. Safari et Firefox : non testés.
- **Physique** : Rapier n'est pas PhysX. Un cas a dû être corrigé (voir `docs/MIGRATION_AUDIT.md`) ; d'autres équilibres très fins pourraient réagir autrement selon la façon dont une personne pose une pièce.
- Le rendu est l'image miroir de celui de Unity (convention de handedness) ; le jeu est identique.
- Une pièce plus haute que la zone gagne aussi (elle recouvre la boîte), comme dans la version Unity.
- Le poids du site est dominé par le moteur physique (2 Mo, 761 Ko compressé).

## Documentation

- `docs/MIGRATION_AUDIT.md` — ce que contenait le projet Unity, A/B/C, risques.
- `docs/TECHNICAL_ARCHITECTURE.md` — modules, flux, réglages physiques, mobile.
- `docs/GAMEPLAY.md` — audit du gameplay, orientations, tutoriel, intention de chaque niveau.
