export type StepId = 'sketch' | 'puzzle' | 'print';

export interface Step {
  id: StepId;
  label: string;
  title: string;
  hint: string;
  /** Text of the main action button; the last step has no next step. */
  nextLabel: string;
  /** Placeholder shown on the plate until the real preview exists. */
  previewNote: string;
}

/** The three-step flow mirrors the rollout slide: sketch, print, (teacher awards offline). */
export const STEPS: readonly Step[] = [
  {
    id: 'sketch',
    label: 'Sketch',
    title: 'Draw your animal',
    hint: 'Upload a photo of the drawing, or draw it here. We will tidy the lines for you.',
    nextLabel: 'Next: make the puzzle',
    previewNote: 'Your drawing will show here',
  },
  {
    id: 'puzzle',
    label: 'Puzzle',
    title: 'Make it a puzzle',
    hint: 'More pieces make a trickier puzzle. Pick what fits your team.',
    nextLabel: 'Next: print it',
    previewNote: 'Your puzzle pieces will show here',
  },
  {
    id: 'print',
    label: 'Print',
    title: 'Print it',
    hint: 'Download the file for the 3D printer and watch a preview of it printing.',
    nextLabel: 'Download file (coming soon)',
    previewNote: 'The printer preview will show here',
  },
];

export function stepIndex(id: StepId): number {
  return STEPS.findIndex((s) => s.id === id);
}

/** Next step id, clamped at the last step. */
export function nextStep(id: StepId): StepId {
  const next = STEPS[Math.min(stepIndex(id) + 1, STEPS.length - 1)];
  return (next ?? STEPS[0]!).id;
}

/** Previous step id, clamped at the first step. */
export function prevStep(id: StepId): StepId {
  const prev = STEPS[Math.max(stepIndex(id) - 1, 0)];
  return (prev ?? STEPS[0]!).id;
}
