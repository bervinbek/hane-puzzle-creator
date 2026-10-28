export type StepId = 'sketch' | 'puzzle' | 'print';

export interface Step {
  id: StepId;
  label: string;
  /** Short verb phrase shown after "Step N of 3". */
  action: string;
  title: string;
  hint: string;
  /** Text of the main action button. */
  nextLabel: string;
}

/** The three-step flow mirrors the rollout slide: sketch, print, (teacher awards offline). */
export const STEPS: readonly Step[] = [
  {
    id: 'sketch',
    label: 'Sketch',
    action: 'Pick a drawing',
    title: 'Pick your animal',
    hint: 'Choose how to add your drawing. We will tidy the lines for you.',
    nextLabel: 'Next: make the puzzle',
  },
  {
    id: 'puzzle',
    label: 'Puzzle',
    action: 'Choose the pieces',
    title: 'Cut it into pieces',
    hint: 'More pieces make a trickier puzzle. Move the slider and watch the pieces change.',
    nextLabel: 'Next: print it',
  },
  {
    id: 'print',
    label: 'Print',
    action: 'Get it printed',
    title: 'Ready to print',
    hint: 'Your puzzle is ready. Here is what happens next.',
    nextLabel: 'Download file',
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

/** A step is open once the drawing is picked; the first step is always open. */
export function canVisit(id: StepId, hasDrawing: boolean): boolean {
  return id === 'sketch' || hasDrawing;
}
