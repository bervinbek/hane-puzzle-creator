export type StepId = 'sketch' | 'puzzle' | 'print';

export interface Step {
  id: StepId;
  label: string;
  title: string;
  hint: string;
}

/** The three-step flow mirrors the rollout slide: sketch, print, (teacher awards offline). */
export const STEPS: readonly Step[] = [
  {
    id: 'sketch',
    label: 'Sketch',
    title: 'Draw your animal',
    hint: 'Upload a photo of the drawing, or draw it here. We will tidy the lines for you.',
  },
  {
    id: 'puzzle',
    label: 'Puzzle',
    title: 'Make it a puzzle',
    hint: 'Choose how many pieces you want. More pieces means a trickier puzzle.',
  },
  {
    id: 'print',
    label: 'Print',
    title: 'Print it',
    hint: 'Download the file for the 3D printer and watch a preview of it printing.',
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
