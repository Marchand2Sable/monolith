// LEVEL 0: the interactive tutorial. Each step highlights one thing, says one thing, and sometimes asks for a gesture before "Suivant" opens.
// The steps only read the game (they never drive it): the player does everything, and can skip it all at any time.
import { extents } from '../core/board';
import { layOf, yawOf } from '../core/orient';
import type { Game } from './game';

export interface TutorialStep {
  id: string;
  title: string;
  /** The explanation. `{key}` markers become key caps in the card. */
  text: string;
  /** What to highlight: 'zone' and 'fixed' are in the 3D scene, anything else is a CSS selector, '' highlights nothing. */
  target: string;
  /** A gesture to make: "Suivant" waits until it is made. */
  action?: string;
  until?: (g: Game) => boolean;
  /** A line that replaces the action while it is not done (what to try after a failed simulation, for instance). */
  waiting?: (g: Game) => string | null;
  /** Label of the main button (default: Suivant). */
  next?: string;
}

const beams = (g: Game) => g.board.pieces.filter((p) => p.kind === 'beam');

export const TUTORIAL: TutorialStep[] = [
  {
    id: 'goal',
    title: "L'objectif",
    text: "Amenez une pièce jusqu'à la zone en pointillés, à la hauteur indiquée. Le compteur au-dessus de la zone suit votre progression.",
    target: 'zone',
  },
  {
    id: 'read',
    title: 'Lire la scène',
    text: "La pièce grise est fixe : elle ne bouge pas, mais elle peut porter vos pièces. Faites glisser le fond pour tourner autour de la scène, molette pour zoomer.",
    target: 'fixed',
  },
  {
    id: 'pieces',
    title: 'Vos pièces',
    text: "Votre stock : chaque forme existe en nombre limité (×n). Le but est de réussir avec le moins de pièces possible.",
    target: '.tray',
  },
  {
    id: 'place',
    title: 'Placer une pièce',
    text: "Un fantôme blanc montre où la pièce ira ; rouge, l'emplacement est refusé. Relâchez pour poser.",
    action: 'Faites glisser la poutre sur la pièce grise.',
    target: '[data-kind="beam"]',
    until: (g) => beams(g).length > 0,
  },
  {
    id: 'rotate',
    title: 'Tourner : ESPACE',
    text: '{ESPACE} tourne la pièce sélectionnée de 90° sur le plateau (aussi pendant que vous la tenez). Sur écran tactile : le bouton Tourner.',
    action: 'Appuyez sur ESPACE : la poutre doit pivoter.',
    target: '[data-act="rotate"]',
    until: (g) => beams(g).some((p) => yawOf(p.rot) !== 0),
  },
  {
    id: 'lay',
    title: 'Coucher et dresser : T',
    text: '{T} (ou {MAJ}+{ESPACE}) bascule la pièce sur le côté ou la remet debout. Une poutre dressée monte de 3 au lieu de 1.',
    action: 'Dressez la poutre sur sa tranche.',
    target: '[data-act="lay"]',
    until: (g) => beams(g).some((p) => extents(p.kind, p.rot).y > 2.9 && layOf(p.rot) !== 0),
  },
  {
    id: 'rules',
    title: 'Les règles de construction',
    text: "Une pièce doit reposer sur un appui. Tout obéit à la gravité : pendant la simulation, rien ne doit bouger ni tomber. Annulez avec {CTRL}+{Z}, ou reprenez une pièce en la saisissant.",
    target: '.actions',
  },
  {
    id: 'validate',
    title: 'Valider : Simuler',
    text: 'La simulation lance la gravité : la zone doit être atteinte et la construction tenir debout.',
    action: 'Appuyez sur Simuler (ou {ENTRÉE}).',
    target: '[data-act="sim"]',
    until: (g) => g.state === 'done' && !!g.outcome?.won,
    waiting: (g) => (g.state === 'done' && !g.outcome?.won ? "Raté : touchez Modifier, ajustez la construction (la poutre debout atteint la zone) et relancez." : null),
  },
  {
    id: 'next',
    title: 'Le niveau suivant',
    text: 'Réussi. « Suivant » ouvre le premier vrai niveau. Chaque niveau offre trois médailles : réussir, réussir avec peu de pièces, saisir l\'éclat caché.',
    target: '#result .dialog',
    next: 'Terminer',
  },
];

/** Where the tutorial is: a step index, or null when it is not running. */
export interface TutorialState {
  step: number;
}

export function stepOf(g: Game): TutorialStep | null {
  return g.tutorial ? TUTORIAL[Math.min(g.tutorial.step, TUTORIAL.length - 1)] : null;
}

export function stepDone(g: Game, s: TutorialStep): boolean {
  return !s.until || s.until(g);
}
