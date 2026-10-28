import { A1_MINI, usablePlateSize } from '../core/printer/a1mini';
import { applyComfort, loadComfort, saveComfort, type Comfort, type TextSize } from './comfort';
import {
  DEFAULT_PIECES,
  DIFFICULTIES,
  TEAMS,
  clampPieces,
  difficultyFor,
  type DifficultyId,
  type TeamId,
} from './presets';
import { STEPS, nextStep, prevStep, stepIndex, type StepId } from './steps';

const icon = (path: string): string =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

/** Mounts the Workshop glass shell (docs/DESIGN.md). Real step content arrives in M1+. */
export function mountShell(root: HTMLElement): void {
  let current: StepId = 'sketch';
  let pieces = DEFAULT_PIECES;
  let team: TeamId = 'yellow';
  let comfort: Comfort = loadComfort();
  applyComfort(comfort);

  root.innerHTML = `
    <div class="backdrop" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <header class="topbar">
      <a class="wordmark" href="./" aria-label="Hane Puzzle Generator home">Hane <span>Puzzle</span></a>
      <nav aria-label="Steps">
        <ol class="stepper glass">
          ${STEPS.map(
            (s, i) => `
            <li>
              <button type="button" class="step-chip" data-step="${s.id}">
                <span class="step-num" aria-hidden="true">${i + 1}</span>
                <span>${s.label}</span>
              </button>
            </li>`,
          ).join('')}
        </ol>
      </nav>
      <button type="button" class="btn btn-glass" id="comfort-open" aria-haspopup="dialog">
        ${icon('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>')}
        Comfort
      </button>
    </header>

    <main class="stage" id="main">
      <section class="panel glass" id="panel" aria-live="polite"></section>
      <section class="canvas-card glass" aria-label="Preview">
        <div class="bed">
          <p class="bed-note" id="preview-note"></p>
          <span class="bed-label">${A1_MINI.buildVolume.x} mm print bed · puzzles up to ${usablePlateSize()} mm</span>
        </div>
      </section>
    </main>

    <footer class="actions">
      <button type="button" class="btn btn-glass" id="back">Back</button>
      <button type="button" class="btn btn-primary" id="next"></button>
    </footer>

    <dialog id="comfort-dialog" class="dialog glass" aria-labelledby="comfort-title">
      <form method="dialog">
        <h2 id="comfort-title">Comfort</h2>
        <p class="hint">Saved on this device.</p>
        <label class="switch"><input type="checkbox" id="calm">
          <span><strong>Calm mode</strong><small>Softer colours, plain background, no blur</small></span></label>
        <label class="switch"><input type="checkbox" id="motion">
          <span><strong>Reduce motion</strong><small>No animations, nothing moves on its own</small></span></label>
        <fieldset class="seg-field">
          <legend>Text size</legend>
          <div class="segmented" id="text-size">
            ${(['small', 'medium', 'large'] as const)
              .map(
                (s) =>
                  `<label class="seg"><input type="radio" name="size" value="${s}"><span>${s[0]!.toUpperCase()}${s.slice(1)}</span></label>`,
              )
              .join('')}
          </div>
        </fieldset>
        <button class="btn btn-primary" value="done">Done</button>
      </form>
    </dialog>
  `;

  const panel = root.querySelector<HTMLElement>('#panel')!;
  const note = root.querySelector<HTMLElement>('#preview-note')!;
  const back = root.querySelector<HTMLButtonElement>('#back')!;
  const next = root.querySelector<HTMLButtonElement>('#next')!;
  const chips = root.querySelectorAll<HTMLButtonElement>('.step-chip');
  const dialog = root.querySelector<HTMLDialogElement>('#comfort-dialog')!;
  const calm = root.querySelector<HTMLInputElement>('#calm')!;
  const motion = root.querySelector<HTMLInputElement>('#motion')!;
  const sizes = root.querySelectorAll<HTMLInputElement>('#text-size input');

  function puzzleControls(): string {
    const level: DifficultyId = difficultyFor(pieces);
    const teamName = TEAMS.find((t) => t.id === team)?.name ?? '';
    return `
      <div class="field">
        <div class="label" id="pieces-label">How many pieces?</div>
        <div class="count" role="group" aria-labelledby="pieces-label">
          <button type="button" class="round" data-action="less" aria-label="Fewer pieces">−</button>
          <output class="count-num" aria-live="polite">${pieces}</output>
          <button type="button" class="round" data-action="more" aria-label="More pieces">+</button>
        </div>
      </div>
      <div class="segmented" role="radiogroup" aria-label="Difficulty">
        ${DIFFICULTIES.map(
          (d) => `
          <button type="button" role="radio" class="seg-btn" aria-checked="${d.id === level}"
            data-action="difficulty" data-value="${d.id}">${d.id === level ? '✓ ' : ''}${d.label}</button>`,
        ).join('')}
      </div>
      <div class="field">
        <div class="label" id="team-label">Team colour: ${teamName}</div>
        <div class="swatches" role="radiogroup" aria-labelledby="team-label">
          ${TEAMS.map(
            (t) => `
            <button type="button" role="radio" class="swatch" style="--swatch:${t.hex}"
              aria-checked="${t.id === team}" aria-label="${t.name}"
              data-action="team" data-value="${t.id}">${t.id === team ? '✓' : ''}</button>`,
          ).join('')}
        </div>
      </div>`;
  }

  function renderPanel(): void {
    const i = stepIndex(current);
    const step = STEPS[i]!;
    panel.innerHTML = `
      <div class="kicker">Step ${i + 1} of ${STEPS.length} · You can go back any time</div>
      <h1>${step.title}</h1>
      <p class="hint">${step.hint}</p>
      ${step.id === 'puzzle' ? puzzleControls() : ''}`;
  }

  function render(): void {
    const step = STEPS[stepIndex(current)]!;
    renderPanel();
    note.textContent = step.previewNote;
    next.textContent = step.nextLabel;
    chips.forEach((chip) => {
      if (chip.dataset.step === current) chip.setAttribute('aria-current', 'step');
      else chip.removeAttribute('aria-current');
    });
    back.disabled = current === 'sketch';
    next.disabled = current === 'print';
    document.title = `${step.label} · Hane Puzzle Generator`;
  }

  panel.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    const { action, value } = target.dataset;
    if (action === 'less') pieces = clampPieces(pieces - 1);
    else if (action === 'more') pieces = clampPieces(pieces + 1);
    else if (action === 'difficulty') {
      pieces = DIFFICULTIES.find((d) => d.id === value)?.pieces ?? pieces;
    } else if (action === 'team') team = (value as TeamId | undefined) ?? team;
    renderPanel();
    // Re-rendering drops focus; put it back on the control the user just used.
    const again = value
      ? panel.querySelector<HTMLElement>(`[data-action="${action}"][data-value="${value}"]`)
      : panel.querySelector<HTMLElement>(`[data-action="${action}"]`);
    again?.focus();
  });

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

  function syncDialog(): void {
    calm.checked = comfort.calm;
    motion.checked = comfort.reduceMotion;
    sizes.forEach((s) => (s.checked = s.value === comfort.textSize));
  }
  function updateComfort(patch: Partial<Comfort>): void {
    comfort = { ...comfort, ...patch };
    applyComfort(comfort);
    saveComfort(comfort);
  }
  root.querySelector('#comfort-open')!.addEventListener('click', () => {
    syncDialog();
    dialog.showModal();
  });
  calm.addEventListener('change', () => updateComfort({ calm: calm.checked }));
  motion.addEventListener('change', () => updateComfort({ reduceMotion: motion.checked }));
  sizes.forEach((s) =>
    s.addEventListener('change', () => {
      if (s.checked) updateComfort({ textSize: s.value as TextSize });
    }),
  );

  render();
}
