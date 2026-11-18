// LEVEL 0: the interactive tutorial. Five short steps: each highlights one thing, says one thing, and the ones that ask for a gesture
// move on by themselves a moment after the gesture is made. The steps only read the game (they never drive it): the player does
// everything, and can skip it all at any time.
import { extents } from '../core/board';
import { layOf } from '../core/orient';
import type { Game } from './game';

/** A line that depends on how the player plays: a finger and buttons, or a keyboard. */
export type Say = string | ((g: Game) => string);

export interface TutorialStep {
  id: string;
  title: string;
  /** The explanation. `{key}` markers become key caps in the card. */
  text: Say;
  /** What to highlight: 'zone' and 'fixed' are in the 3D scene, anything else is a CSS selector, '' highlights nothing. */
  target: string;
  /** A gesture to make: the step ends by itself shortly after it is made ("Suivant" also works at once). */
  action?: Say;
  until?: (g: Game) => boolean;
  /** A line that replaces the action while it is not done (what to try after a failed simulation, for instance). */
  waiting?: (g: Game) => string | null;
  /** Label of the main button (default: Suivant). */
  next?: string;
}

export const say = (s: Say, g: Game): string => (typeof s === 'function' ? s(g) : s);

const beams = (g: Game) => g.board.pieces.filter((p) => p.kind === 'beam');

export const TUTORIAL: TutorialStep[] = [
  {
    id: 'goal',
    title: "L'objectif",
    text: "Amenez une pièce à la hauteur de la zone en pointillés, puis faites tenir la construction. La pièce grise est fixe : elle porte vos pièces.",
    target: 'zone',
  },
  {
    id: 'place',
    title: 'Poser une pièce',
    text: 'Un fantôme blanc montre où elle ira (rouge : refusé). Vos pièces sont en nombre limité : moins vous en posez, mieux c\'est.',
    action: 'Glissez la poutre sur la pièce grise.',
    target: '[data-kind="beam"]',
    until: (g) => beams(g).length > 0,
  },
  {
    id: 'stand',
    title: 'Dresser la poutre',
    text: (g) =>
      g.usesTouch
        ? 'Le bouton en surbrillance couche ou dresse la pièce : debout, la poutre monte de 3 au lieu de 1. « Tourner » la fait pivoter à plat.'
        : '{T} dresse la poutre sur sa tranche : elle monte de 3 au lieu de 1. {ESPACE} la fait pivoter à plat.',
    action: (g) => (g.usesTouch ? 'Touchez le bouton en surbrillance.' : 'Dressez la poutre : {T}.'),
    target: '[data-act="lay"]',
    until: (g) => beams(g).some((p) => extents(p.kind, p.rot).y > 2.9 && layOf(p.rot) !== 0),
  },
  {
    id: 'validate',
    title: 'Simuler',
    text: 'La gravité tranche : la zone doit être atteinte et la construction tenir debout.',
    action: (g) => (g.usesTouch ? 'Touchez Simuler.' : 'Appuyez sur Simuler (ou {ENTRÉE}).'),
    target: '[data-act="sim"]',
    until: (g) => g.state === 'done' && !!g.outcome?.won,
    waiting: (g) => (g.state === 'done' && !g.outcome?.won ? 'Raté : touchez Modifier, ajustez (la poutre debout atteint la zone) et relancez.' : null),
  },
  {
    id: 'next',
    title: 'Réussi',
    text: "Chaque niveau offre trois médailles : réussir, réussir avec peu de pièces, saisir l'éclat caché. « Terminer » ouvre le premier niveau.",
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
