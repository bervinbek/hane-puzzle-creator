import { describe, expect, it } from 'vitest';
import { STEPS, nextStep, prevStep } from './steps';

describe('step navigation', () => {
  it('has the three steps in slide order', () => {
    expect(STEPS.map((s) => s.id)).toEqual(['sketch', 'puzzle', 'print']);
  });

  it('moves forward and clamps at the last step', () => {
    expect(nextStep('sketch')).toBe('puzzle');
    expect(nextStep('puzzle')).toBe('print');
    expect(nextStep('print')).toBe('print');
  });

  it('moves back and clamps at the first step', () => {
    expect(prevStep('print')).toBe('puzzle');
    expect(prevStep('puzzle')).toBe('sketch');
    expect(prevStep('sketch')).toBe('sketch');
  });
});
