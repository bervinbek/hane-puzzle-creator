import { usablePlateSize } from '../core/printer/a1mini';
import { applyComfort, loadComfort, saveComfort, type Comfort, type TextSize } from './comfort';
import {
  DEFAULT_PIECES,
  DIFFICULTIES,
  MANY_PIECES,
  MAX_PIECES,
  MIN_PIECES,
  TEAMS,
  clampPieces,
  difficultyFor,
  type TeamId,
} from './presets';
import { fishSvg, type PreviewMode } from './puzzlePreview';
import { STEPS, canVisit, nextStep, prevStep, stepIndex, type StepId } from './steps';

const icon = (path: string): string =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

const ICON = {
  puzzle: '<path d="M5 9h5a2.5 2.5 0 1 1 5 0h4v5a2.5 2.5 0 1 0 0 5v1H5z"/>',
  upload: '<path d="M12 16V5m0 0l-4 4m4-4l4 4M5 19h14"/>',
  pencil: '<path d="M4 20l1-4L16 5l3 3L8 19z"/>',
  shuffle:
    '<path d="M4 7h3c4 0 6 10 10 10h3M4 17h3c1.5 0 2.6-1 3.6-2.4M14 9.4C15 8 16 7 17.500 7H20M17 4l3 3-3 3M17 14l3 3-3 3"/>',
  sliders:
    '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
};

/** Mounts the app shell: Workshop glass layout, Sketchbook colours (docs/DESIGN.md). */
export function mountShell(root: HTMLElement): void {
  let current: StepId = 'sketch';
  let hasDrawing = false;
  let pieces = DEFAULT_PIECES;
  let team: TeamId = 'yellow';
  let seed = 1;
  let comfort: Comfort = loadComfort();
  applyComfort(comfort);

  root.innerHTML = `
    <div class="backdrop" aria-hidden="true">
      <i></i><i></i><i></i><i></i>
      <svg viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M1090 700l8-20 8 20-20-12h24z"/>
        <path d="M120 740c10-14 20 14 30 0s20 14 30 0 20 14 30 0"/>
        <path d="M1030 40l6 14 15 2-11 10 3 15-13-8-13 8 3-15-11-10 15-2z"/>
      </svg>
    </div>

    <header class="topbar">
      <a class="wordmark" href="./" aria-label="Hane Puzzle Generator home">Hane <span>Puzzle</span></a>
      <nav aria-label="Steps">
        <ol class="stepper glass">
          ${STEPS.map(
            (s) => `
            <li>
              <button type="button" class="step-chip" data-step="${s.id}">
                <span class="step-num" aria-hidden="true"></span>
                <span class="step-text">${s.label}</span>
              </button>
            </li>`,
          ).join('')}
        </ol>
      </nav>
      <button type="button" class="btn btn-glass" id="comfort-open" aria-haspopup="dialog">
        ${icon(ICON.sliders)} Comfort
      </button>
    </header>

    <main class="stage" id="main">
      <section class="panel glass" id="panel"></section>
      <section class="canvas-card glass" aria-label="Preview">
        <div class="bed">
          <span class="tag" id="bed-tag" hidden></span>
          <div class="bed-art" id="bed-art"></div>
          <p class="bed-note" id="bed-note"></p>
          <span class="bed-label">Fits the printer · up to ${Math.round(usablePlateSize() / 10)} cm wide</span>
        </div>
        <div class="preview-actions" id="preview-actions" hidden>
          <button type="button" class="btn btn-glass" id="shuffle">
            ${icon(ICON.shuffle)} Shuffle the cuts
          </button>
        </div>
      </section>
    </main>

    <footer class="actions">
      <button type="button" class="btn btn-glass" id="back">Back</button>
      <p class="next-help" id="next-help"></p>
      <button type="button" class="btn btn-primary" id="next" aria-describedby="next-help"></button>
    </footer>

    <dialog id="comfort-dialog" class="dialog glass" aria-labelledby="comfort-title">
      <form method="dialog">
        <h2 id="comfort-title">Comfort</h2>
        <p class="hint">Make this page easier on your eyes. Saved on this device.</p>
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

  const $ = <T extends HTMLElement>(sel: string): T => root.querySelector<T>(sel)!;
  const stage = $('#main');
  const panel = $('#panel');
  const bedArt = $('#bed-art');
  const bedNote = $('#bed-note');
  const bedTag = $('#bed-tag');
  const back = $<HTMLButtonElement>('#back');
  const next = $<HTMLButtonElement>('#next');
  const nextHelp = $('#next-help');
  const chips = root.querySelectorAll<HTMLButtonElement>('.step-chip');
  const dialog = $<HTMLDialogElement>('#comfort-dialog');
  const calm = $<HTMLInputElement>('#calm');
  const motion = $<HTMLInputElement>('#motion');
  const sizes = root.querySelectorAll<HTMLInputElement>('#text-size input');

  const teamName = (): string => TEAMS.find((t) => t.id === team)?.name ?? '';
  const teamHex = (): string => TEAMS.find((t) => t.id === team)?.hex ?? '#ffc93c';

  function setNotice(text: string): void {
    const el = panel.querySelector<HTMLElement>('#notice');
    if (el) el.textContent = text;
  }

  function puzzleControls(): string {
    return `
      <div class="field">
        <div class="label" id="pieces-label">How many pieces?</div>
        <div class="count">
          <button type="button" class="round" data-action="less" aria-label="Fewer pieces">−</button>
          <output class="count-num" id="count-num" for="pieces" aria-live="polite"></output>
          <button type="button" class="round" data-action="more" aria-label="More pieces">+</button>
        </div>
        <input type="range" id="pieces" class="slider" min="${MIN_PIECES}" max="${MAX_PIECES}" step="1"
          aria-labelledby="pieces-label">
      </div>
      <fieldset class="field">
        <legend class="label">Or pick how tricky</legend>
        <div class="segmented">
          ${DIFFICULTIES.map(
            (d) =>
              `<label class="seg"><input type="radio" name="level" value="${d.id}"><span>${d.label}</span></label>`,
          ).join('')}
        </div>
        <p class="hint small" id="level-blurb"></p>
      </fieldset>
      <fieldset class="field">
        <legend class="label" id="team-label"></legend>
        <div class="swatches">
          ${TEAMS.map(
            (t) =>
              `<label class="swatch-wrap"><input type="radio" name="team" value="${t.id}" aria-label="${t.name}"><span class="swatch" style="--swatch:${t.hex}"></span></label>`,
          ).join('')}
        </div>
        <p class="hint small">Your puzzle will print in this colour.</p>
      </fieldset>`;
  }

  function sketchControls(): string {
    const picked = hasDrawing;
    return `
      <div class="options" role="group" aria-label="Ways to add a drawing">
        <button type="button" class="option" data-action="sample" aria-pressed="${picked}">
          <span class="option-icon">${icon(ICON.puzzle)}</span>
          <span class="option-text"><strong>Use the sample fish</strong><small>Try it out first</small></span>
          ${picked ? '<span class="tick" aria-hidden="true">✓</span>' : ''}
        </button>
        <button type="button" class="option" data-action="soon" data-what="photo">
          <span class="option-icon">${icon(ICON.upload)}</span>
          <span class="option-text"><strong>Upload a photo</strong><small>From a camera or a file</small></span>
          <span class="badge">Soon</span>
        </button>
        <button type="button" class="option" data-action="soon" data-what="draw">
          <span class="option-icon">${icon(ICON.pencil)}</span>
          <span class="option-text"><strong>Draw on screen</strong><small>With a finger or a mouse</small></span>
          <span class="badge">Soon</span>
        </button>
      </div>`;
  }

  function printControls(): string {
    const todo = [
      ['Download the file', 'It is made for the 3D printer.'],
      ['Your teacher prints it', 'It takes a little while.'],
      ['Put the puzzle together', 'Look for the tabs that fit.'],
    ];
    return `
      <p class="summary"><strong>${pieces} pieces</strong> · ${teamName()} team</p>
      <ol class="todo">
        ${todo.map(([t, s]) => `<li><strong>${t}</strong><small>${s}</small></li>`).join('')}
      </ol>`;
  }

  function renderPanel(): void {
    const i = stepIndex(current);
    const step = STEPS[i]!;
    const body =
      current === 'sketch'
        ? sketchControls()
        : current === 'puzzle'
          ? puzzleControls()
          : printControls();
    const sketchDone = current === 'sketch' && hasDrawing;
    panel.innerHTML = `
      <div class="kicker">Step ${i + 1} of ${STEPS.length} · ${step.action}</div>
      <h1 id="step-title" tabindex="-1">${step.title}</h1>
      <p class="hint">${step.hint}</p>
      ${body}
      <p class="notice" id="notice" role="status">${sketchDone ? 'Nice choice! Press Next to cut it into pieces.' : ''}</p>`;
    if (current === 'puzzle') syncPuzzleControls();
  }

  function syncPuzzleControls(): void {
    const level = difficultyFor(pieces);
    panel.querySelector<HTMLOutputElement>('#count-num')!.value = String(pieces);
    panel.querySelector<HTMLInputElement>('#pieces')!.value = String(pieces);
    panel.querySelectorAll<HTMLInputElement>('input[name="level"]').forEach((r) => {
      r.checked = r.value === level;
    });
    panel.querySelectorAll<HTMLInputElement>('input[name="team"]').forEach((r) => {
      r.checked = r.value === team;
    });
    panel.querySelector('#level-blurb')!.textContent =
      DIFFICULTIES.find((d) => d.id === level)?.blurb ?? '';
    panel.querySelector('#team-label')!.textContent = `Team colour: ${teamName()}`;
    setNotice(
      pieces > MANY_PIECES
        ? 'That is a lot of small pieces. They are harder to print and to hold.'
        : '',
    );
  }

  function renderPreview(): void {
    const mode: PreviewMode | null =
      current === 'sketch'
        ? hasDrawing
          ? 'outline'
          : null
        : current === 'puzzle'
          ? 'pieces'
          : 'print';
    bedArt.innerHTML = mode ? fishSvg(mode, pieces, seed, teamHex()) : '';
    bedNote.textContent = mode ? '' : 'Pick a drawing and it will show up here';
    bedNote.hidden = mode !== null;
    bedTag.hidden = current === 'sketch';
    bedTag.innerHTML = `<i style="background:${teamHex()}"></i>${teamName()} team`;
  }

  let frame = 0;
  function schedulePreview(): void {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(renderPreview);
  }

  function renderChrome(): void {
    const i = stepIndex(current);
    const step = STEPS[i]!;
    stage.dataset.step = current;
    $('#preview-actions').hidden = current !== 'puzzle';
    chips.forEach((chip, idx) => {
      const id = chip.dataset.step as StepId;
      const num = chip.querySelector('.step-num')!;
      num.textContent = idx < i ? '✓' : String(idx + 1);
      if (id === current) chip.setAttribute('aria-current', 'step');
      else chip.removeAttribute('aria-current');
      chip.setAttribute('aria-disabled', String(!canVisit(id, hasDrawing)));
    });
    back.disabled = current === 'sketch';
    next.textContent = step.nextLabel;
    const blocked = !canVisit(nextStep(current), hasDrawing);
    next.setAttribute('aria-disabled', String(blocked));
    nextHelp.textContent = blocked ? 'Pick a drawing to continue' : '';
    document.title = `${step.label} · Hane Puzzle Generator`;
  }

  function render(focusTitle = false): void {
    renderChrome();
    renderPanel();
    renderPreview();
    if (focusTitle) {
      root.querySelector<HTMLElement>('#step-title')?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    }
  }

  function go(id: StepId): void {
    if (!canVisit(id, hasDrawing)) {
      setNotice('Pick a drawing first. Then you can go on.');
      panel.querySelector<HTMLElement>('[data-action="sample"]')?.focus();
      return;
    }
    current = id;
    render(true);
  }

  panel.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    switch (target.dataset.action) {
      case 'sample':
        hasDrawing = true;
        renderChrome();
        renderPanel();
        renderPreview();
        panel.querySelector<HTMLElement>('[data-action="sample"]')?.focus();
        break;
      case 'soon':
        setNotice('That one is coming soon. Try the sample fish for now.');
        break;
      case 'less':
      case 'more':
        pieces = clampPieces(pieces + (target.dataset.action === 'more' ? 1 : -1));
        syncPuzzleControls();
        schedulePreview();
        break;
    }
  });

  $('#shuffle').addEventListener('click', () => {
    seed += 1;
    schedulePreview();
  });

  panel.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id !== 'pieces') return;
    pieces = clampPieces(Number(t.value));
    syncPuzzleControls();
    schedulePreview();
  });

  panel.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'level') {
      pieces = DIFFICULTIES.find((d) => d.id === t.value)?.pieces ?? pieces;
    } else if (t.name === 'team') {
      team = t.value as TeamId;
    } else return;
    syncPuzzleControls();
    schedulePreview();
  });

  chips.forEach((chip) => chip.addEventListener('click', () => go(chip.dataset.step as StepId)));
  back.addEventListener('click', () => go(prevStep(current)));
  next.addEventListener('click', () => {
    if (current === 'print') {
      setNotice('Downloads arrive in the next update. For now this is a preview.');
      return;
    }
    go(nextStep(current));
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
  $('#comfort-open').addEventListener('click', () => {
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
