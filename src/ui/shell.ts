import {
  DEFAULT_TIDY,
  OutlineExtractor,
  type CloseGaps,
  type OutlineResult,
  type TidyParams,
} from '../core/outline';
import { usablePlateSize } from '../core/printer/a1mini';
import { applyComfort, loadComfort, saveComfort, type Comfort, type TextSize } from './comfort';
import { PhotoError, loadPhoto, photoErrorMessage, type LoadedPhoto } from './photo';
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
import {
  getPuzzle,
  makeShape,
  photoSvg,
  sampleFishShape,
  shapeSvg,
  type PreviewMode,
  type PuzzleShape,
} from './puzzlePreview';
import { STEPS, canVisit, nextStep, prevStep, stepIndex, type StepId } from './steps';

const icon = (path: string): string =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

const ICON = {
  puzzle: '<path d="M5 9h5a2.5 2.5 0 1 1 5 0h4v5a2.5 2.5 0 1 0 0 5v1H5z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/>',
  pencil: '<path d="M4 20l1-4L16 5l3 3L8 19z"/>',
  shuffle:
    '<path d="M4 7h3c4 0 6 10 10 10h3M4 17h3c1.5 0 2.6-1 3.6-2.4M14 9.4C15 8 16 7 17.5 7H20M17 4l3 3-3 3M17 14l3 3-3 3"/>',
  sliders:
    '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
};

type Source = 'none' | 'sample' | 'photo';

const GAP_CHOICES: readonly { id: CloseGaps; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'small', label: 'Small' },
  { id: 'big', label: 'Big' },
];

const cm = (mm: number): string => (mm / 10).toFixed(1);

/** Mounts the app shell: Workshop glass layout, Sketchbook colours (docs/DESIGN.md). */
export function mountShell(root: HTMLElement): void {
  let current: StepId = 'sketch';
  let source: Source = 'none';
  let shape: PuzzleShape | null = null;
  let photo: LoadedPhoto | null = null;
  let extractor: OutlineExtractor | null = null;
  let result: OutlineResult | null = null;
  let tidy: TidyParams = { ...DEFAULT_TIDY };
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
      <section class="canvas-card glass" id="canvas-card" aria-label="Preview">
        <div class="bed">
          <span class="tag" id="bed-tag" hidden></span>
          <div class="bed-art" id="bed-art"></div>
          <p class="bed-note" id="bed-note"></p>
          <span class="bed-label" id="bed-label"></span>
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

    <input type="file" id="file" accept="image/*" hidden>

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
  const card = $('#canvas-card');
  const bedArt = $('#bed-art');
  const bedNote = $('#bed-note');
  const bedTag = $('#bed-tag');
  const bedLabel = $('#bed-label');
  const back = $<HTMLButtonElement>('#back');
  const next = $<HTMLButtonElement>('#next');
  const nextHelp = $('#next-help');
  const fileInput = $<HTMLInputElement>('#file');
  const chips = root.querySelectorAll<HTMLButtonElement>('.step-chip');
  const dialog = $<HTMLDialogElement>('#comfort-dialog');
  const calm = $<HTMLInputElement>('#calm');
  const motion = $<HTMLInputElement>('#motion');
  const sizes = root.querySelectorAll<HTMLInputElement>('#text-size input');

  const teamName = (): string => TEAMS.find((t) => t.id === team)?.name ?? '';
  const teamHex = (): string => TEAMS.find((t) => t.id === team)?.hex ?? '#ffc93c';
  const hasDrawing = (): boolean => shape !== null;

  function setNotice(text: string): void {
    const el = panel.querySelector<HTMLElement>('#notice');
    if (el) el.textContent = text;
  }

  function sketchControls(): string {
    const chosen = source !== 'none';
    const option = (
      action: string,
      iconPath: string,
      title: string,
      sub: string,
      selected: boolean,
      badge = '',
    ): string => `
      <button type="button" class="option" data-action="${action}" aria-pressed="${selected}">
        <span class="option-icon">${icon(iconPath)}</span>
        <span class="option-text"><strong>${title}</strong><small>${sub}</small></span>
        ${selected ? '<span class="tick" aria-hidden="true">✓</span>' : badge}
      </button>`;
    const tidyControls =
      source === 'photo'
        ? `
      <div class="tidy">
        <fieldset class="field">
          <legend class="label">Gaps in the line</legend>
          <div class="segmented">
            ${GAP_CHOICES.map(
              (g) =>
                `<label class="seg"><input type="radio" name="gaps" value="${g.id}"${
                  tidy.closeGaps === g.id ? ' checked' : ''
                }><span>${g.label}</span></label>`,
            ).join('')}
          </div>
        </fieldset>
        <div class="slider-row">
          <label for="strength">Pick up faint lines</label>
          <input type="range" id="strength" class="slider" min="0" max="100" step="1" value="${tidy.lineStrength}">
        </div>
        <div class="slider-row">
          <label for="smooth">Smooth the wobbles</label>
          <input type="range" id="smooth" class="slider" min="0" max="100" step="1" value="${tidy.smoothness}">
        </div>
      </div>`
        : '';
    return `
      <div class="options${chosen ? ' compact' : ''}" role="group" aria-label="Ways to add a drawing">
        ${option('photo', ICON.camera, 'Add a photo', 'Take one or pick one', source === 'photo')}
        ${option('sample', ICON.puzzle, 'Use the sample fish', 'Try it out first', source === 'sample')}
        ${option('soon', ICON.pencil, 'Draw on screen', 'With a finger or a mouse', false, '<span class="badge">Soon</span>')}
      </div>
      ${tidyControls}`;
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
        <p class="hint small team-note">Your puzzle will print in this colour.</p>
      </fieldset>`;
  }

  function printControls(): string {
    const todo = [
      ['Download the file', 'It is made for the 3D printer.'],
      ['Your teacher prints it', 'It takes a little while.'],
      ['Put the puzzle together', 'Look for the tabs that fit.'],
    ];
    return `
      <p class="summary"><strong>${shape ? getPuzzle(shape, pieces, seed).pieces.length : pieces} pieces</strong> · ${teamName()} team</p>
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
    panel.innerHTML = `
      <div class="kicker">Step ${i + 1} of ${STEPS.length} · ${step.action}</div>
      <h1 id="step-title" tabindex="-1">${step.title}</h1>
      <p class="hint">${step.hint}</p>
      ${body}
      <p class="notice" id="notice" role="status"></p>`;
    if (current === 'puzzle') syncPuzzleControls();
    if (current === 'sketch') showSketchStatus();
  }

  /** The one friendly sentence under the sketch controls. */
  function showSketchStatus(): void {
    if (source === 'sample') {
      setNotice('Nice choice! Press Next to cut it into pieces.');
    } else if (source === 'photo' && result) {
      if (result.ok) {
        setNotice(
          result.closeRadius > 0 && tidy.closeGaps === 'auto'
            ? 'Found your animal! I closed a gap in the line. Press Next if the blue line looks right.'
            : 'Found your animal! Press Next if the blue line looks right.',
        );
      } else if (result.problem === 'open') {
        setNotice(
          tidy.closeGaps === 'auto'
            ? "The line has a gap I can't close. Draw over the gap with a pen and take the photo again."
            : 'The line has a gap. Try Gaps: Auto, or Big.',
        );
      } else if (result.problem === 'tiny') {
        setNotice('The drawing is very small. Move closer and take the photo again.');
      } else {
        setNotice("I can't see a drawing. Try a darker pen and a bright, flat photo.");
      }
    }
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
  }

  /** One friendly line about the current cut: too many pieces, or fewer than asked for. */
  function showPuzzleNotice(): void {
    if (current !== 'puzzle') return;
    const puzzle = shape ? getPuzzle(shape, pieces, seed) : null;
    if (puzzle && puzzle.pieces.length < pieces) {
      setNotice(`Only ${puzzle.pieces.length} pieces fit this shape. Try fewer pieces.`);
    } else if (pieces > MANY_PIECES) {
      setNotice('That is a lot of small pieces. They are harder to print and to hold.');
    } else {
      setNotice('');
    }
  }

  function renderPreview(): void {
    let art = '';
    if (current === 'sketch') {
      if (source === 'photo' && photo) {
        art = photoSvg(photo.url, photo.width, photo.height, result?.ok ? result.outlinePx : null);
      } else if (source === 'sample' && shape) {
        art = shapeSvg(shape, 'outline', pieces, seed, teamHex());
      }
    } else if (shape) {
      const mode: PreviewMode = current === 'puzzle' ? 'pieces' : 'print';
      art = shapeSvg(shape, mode, pieces, seed, teamHex());
    }
    bedArt.innerHTML = art;
    bedNote.hidden = art !== '';
    bedNote.textContent = 'Pick a drawing, or drop a photo here';
    bedTag.hidden = current === 'sketch';
    bedTag.innerHTML = `<i style="background:${teamHex()}"></i>${teamName()} team`;
    bedLabel.textContent = shape
      ? `Your puzzle: ${cm(shape.widthMm)} × ${cm(shape.heightMm)} cm`
      : `Fits the printer · up to ${Math.round(usablePlateSize() / 10)} cm wide`;
    showPuzzleNotice();
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
    stage.dataset.source = source;
    $('#preview-actions').hidden = current !== 'puzzle';
    chips.forEach((chip, idx) => {
      const id = chip.dataset.step as StepId;
      const num = chip.querySelector('.step-num')!;
      num.textContent = idx < i ? '✓' : String(idx + 1);
      if (id === current) chip.setAttribute('aria-current', 'step');
      else chip.removeAttribute('aria-current');
      chip.setAttribute('aria-disabled', String(!canVisit(id, hasDrawing())));
    });
    back.disabled = current === 'sketch';
    next.textContent = step.nextLabel;
    const blocked = !canVisit(nextStep(current), hasDrawing());
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
    if (!canVisit(id, hasDrawing())) {
      setNotice('Pick a drawing first. Then you can go on.');
      panel.querySelector<HTMLElement>('[data-action="photo"]')?.focus();
      return;
    }
    current = id;
    render(true);
  }

  // ---- Choosing a drawing -------------------------------------------------------------------

  function dropPhoto(): void {
    if (photo) URL.revokeObjectURL(photo.url);
    photo = null;
    extractor = null;
    result = null;
  }

  function useSample(): void {
    dropPhoto();
    source = 'sample';
    shape = sampleFishShape();
    renderChrome();
    renderPanel();
    renderPreview();
    panel.querySelector<HTMLElement>('[data-action="sample"]')?.focus();
  }

  /** Re-traces the outline after a control changed. Cheap enough to run on every tick. */
  function runTidy(): void {
    if (!extractor) return;
    result = extractor.run(tidy);
    shape = result.ok ? makeShape(result.outlineMm) : null;
    renderChrome();
    showSketchStatus();
    renderPreview();
  }

  async function useFile(file: File): Promise<void> {
    if (current !== 'sketch') return;
    setNotice('Looking at your picture…');
    try {
      const loaded = await loadPhoto(file);
      dropPhoto();
      photo = loaded;
      extractor = new OutlineExtractor(loaded.image);
      tidy = { ...DEFAULT_TIDY };
      source = 'photo';
      renderPanel();
      runTidy();
    } catch (e) {
      setNotice(photoErrorMessage(e instanceof PhotoError ? e.kind : 'unreadable'));
    }
  }

  const firstImage = (files: FileList | null | undefined): File | undefined =>
    files ? ([...files].find((f) => f.type.startsWith('image/')) ?? files[0]) : undefined;

  fileInput.addEventListener('change', () => {
    const file = firstImage(fileInput.files);
    fileInput.value = '';
    if (file) void useFile(file);
  });

  card.addEventListener('dragover', (e) => {
    if (current !== 'sketch') return;
    e.preventDefault();
    card.classList.add('dragging');
  });
  card.addEventListener('dragleave', () => card.classList.remove('dragging'));
  card.addEventListener('drop', (e) => {
    card.classList.remove('dragging');
    if (current !== 'sketch') return;
    e.preventDefault();
    const file = firstImage(e.dataTransfer?.files);
    if (file) void useFile(file);
  });
  document.addEventListener('paste', (e) => {
    const file = firstImage(e.clipboardData?.files);
    if (file) void useFile(file);
  });

  // ---- Events -------------------------------------------------------------------------------

  panel.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    switch (target.dataset.action) {
      case 'photo':
        fileInput.click();
        break;
      case 'sample':
        useSample();
        break;
      case 'soon':
        setNotice('That one is coming soon. Add a photo or try the sample fish.');
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

  let tidyFrame = 0;
  const scheduleTidy = (): void => {
    cancelAnimationFrame(tidyFrame);
    tidyFrame = requestAnimationFrame(runTidy);
  };

  panel.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'pieces') {
      pieces = clampPieces(Number(t.value));
      syncPuzzleControls();
      schedulePreview();
    } else if (t.id === 'strength') {
      tidy = { ...tidy, lineStrength: Number(t.value) };
      scheduleTidy();
    } else if (t.id === 'smooth') {
      tidy = { ...tidy, smoothness: Number(t.value) };
      scheduleTidy();
    }
  });

  panel.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'gaps') {
      tidy = { ...tidy, closeGaps: t.value as CloseGaps };
      scheduleTidy();
      return;
    }
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
