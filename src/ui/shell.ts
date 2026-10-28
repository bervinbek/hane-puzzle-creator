import { A1_MINI, usablePlateSize } from '../core/printer/a1mini';
import { STEPS, nextStep, prevStep, stepIndex, type StepId } from './steps';

/** Mounts the empty three-step shell. Real step content arrives in M1+. */
export function mountShell(root: HTMLElement): void {
  let current: StepId = 'sketch';

  root.innerHTML = `
    <header class="topbar">
      <a class="wordmark" href="./" aria-label="Hane Puzzle Generator home">Hane <span>Puzzle</span></a>
      <nav aria-label="Steps">
        <ol class="stepper">
          ${STEPS.map(
            (s, i) => `
            <li>
              <button type="button" class="step-chip" data-step="${s.id}">
                <span class="step-num" aria-hidden="true">${i + 1}</span>
                <span class="step-label">${s.label}</span>
              </button>
            </li>`,
          ).join('')}
        </ol>
      </nav>
    </header>
    <main class="stage" id="main">
      <section class="panel" aria-live="polite">
        <h1 id="step-title"></h1>
        <p id="step-hint" class="hint"></p>
      </section>
      <section class="canvas-card" aria-label="Preview area">
        <div class="bed" role="img" aria-label="Outline of the 180 millimetre print bed">
          <span class="bed-label">${A1_MINI.buildVolume.x} × ${A1_MINI.buildVolume.y} mm bed
            · up to ${usablePlateSize()} mm puzzle</span>
        </div>
      </section>
    </main>
    <footer class="actions">
      <button type="button" class="btn btn-ghost" id="back">Back</button>
      <button type="button" class="btn btn-primary" id="next">Next</button>
    </footer>
  `;

  const title = root.querySelector<HTMLElement>('#step-title')!;
  const hint = root.querySelector<HTMLElement>('#step-hint')!;
  const back = root.querySelector<HTMLButtonElement>('#back')!;
  const next = root.querySelector<HTMLButtonElement>('#next')!;
  const chips = root.querySelectorAll<HTMLButtonElement>('.step-chip');

  function render(): void {
    const step = STEPS[stepIndex(current)]!;
    title.textContent = step.title;
    hint.textContent = step.hint;
    chips.forEach((chip) => {
      const active = chip.dataset.step === current;
      if (active) chip.setAttribute('aria-current', 'step');
      else chip.removeAttribute('aria-current');
    });
    back.disabled = current === 'sketch';
    next.disabled = current === 'print';
    document.title = `${step.label} · Hane Puzzle Generator`;
  }

  chips.forEach((chip) =>
    chip.addEventListener('click', () => {
      current = chip.dataset.step as StepId;
      render();
    }),
  );
  back.addEventListener('click', () => {
    current = prevStep(current);
    render();
  });
  next.addEventListener('click', () => {
    current = nextStep(current);
    render();
  });

  render();
}
