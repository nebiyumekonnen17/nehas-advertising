import type { TransitionEffect } from '../types';

export const TRANSITION_OPTIONS: Array<{ value: TransitionEffect; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'fade', label: 'Fade' },
  { value: 'slide-left', label: 'Slide left' },
  { value: 'slide-up', label: 'Slide up' },
  { value: 'zoom', label: 'Zoom' },
];

export function getTransitionClassName(effect: TransitionEffect | null | undefined): string {
  return effect && effect !== 'none' ? `signage-transition-${effect}` : '';
}
