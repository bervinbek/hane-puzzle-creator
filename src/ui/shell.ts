import { DRAWN_TIDY, OutlineExtractor } from '../core/outline';
import { animalFileName } from '../core/export/fileName';
import {
  classCodeText,
  classFileName,
  classFolder,
  inboxBase,
  inboxJson,
} from '../core/export/classInbox';
import { puzzleStl } from '../core/export/bundle';
import { A1_MINI, PUZZLE_THICKNESS_MM, usablePlateSize } from '../core/printer/a1mini';
import { couponInstructions, toleranceStl } from '../core/puzzle/coupon';
import { engraveCouponStl } from '../core/puzzle/engraveCoupon';
import {
  CLEARANCE_MM,
  MAGNET_FIT_MM,
  SIZE_MM,
  ENGRAVE_DEPTHS,
  ENGRAVE_DEPTH_MM,
  RELIEF_AMOUNTS,
  TAB_AMOUNTS,
  reliefFor,
  teacherParams,
  type EngraveDepth,
  type ReliefAmount,
  type TabAmount,
} from '../core/puzzle/settings';
import { PRINT_SETS, formatDuration, printReport } from '../core/puzzle/report';
import { applyComfort, loadComfort, saveComfort, type Comfort, type TextSize } from './comfort';
import { downloadBytes } from './download';
import {
  inboxConfig,
  newSendJob,
  rememberClassCode,
  rememberedClassCode,
  renderPng,
  sendJob,
  type SendJob,
} from './inbox';
import type { Puzzle } from '../core/puzzle/generate';
import { revealOrder, tonesAfter, type Tone } from '../core/puzzle/reveal';
import type { SimSpeed, SimStatus } from '../render/simulation';
import type { PuzzleViewer } from '../render/viewer';
import {
  DEFAULT_PIECES,
  MAX_NAME,
  MAX_PIECES,
  MIN_PIECES,
  FILAMENTS,
  clampPieces,
} from './presets';
import {
  getPuzzle,
  makeShape,
  piecePaths,
  type PieceDrift,
  shapeSvg,
  allGold,
  PRINT_COLOURS,
  sizedShape,
  withEngraving,
  type PreviewMode,
  type PuzzleShape,
} from './puzzlePreview';
import { SketchPad } from './sketchPad';
import { SAMPLES } from './testSamples';
import { PEN_WIDTH } from './strokes';
import { DEFAULT_PREFS, loadTeacher, saveTeacher, teacherIsOn, type TeacherPrefs } from './teacher';
import { STEPS, canVisit, nextStep, prevStep, stepIndex, type StepId } from './steps';

const icon = (path: string): string =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

const ICON = {
  pencil: '<path d="M4 20l1-4L16 5l3 3L8 19z"/>',
  box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8"/>',
  shuffle:
    '<path d="M4 7h3c4 0 6 10 10 10h3M4 17h3c1.5 0 2.6-1 3.6-2.4M14 9.4C15 8 16 7 17.5 7H20M17 4l3 3-3 3M17 14l3 3-3 3"/>',
  cap: '<path d="M3 9l9-4 9 4-9 4zM7 11v4c0 1.5 2.2 3 5 3s5-1.5 5-3v-4"/>',
  dots: '<circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="9" r="2.5"/><circle cx="10" cy="17" r="2.5"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  replay: '<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>',
  sliders:
    '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
};

/** Layers in a whole print: 3 mm of plastic at 0.2 mm a layer. */
const SIM_LAYERS = Math.round(PUZZLE_THICKNESS_MM / A1_MINI.layerHeight);
const IDLE_SIM: SimStatus = {
  active: false,
  playing: false,
  layer: SIM_LAYERS,
  layers: SIM_LAYERS,
  run: PRINT_SETS,
  runs: PRINT_SETS,
  finished: false,
};

const cm = (mm: number): string => (mm / 10).toFixed(1);

/** Mounts the app shell: Workshop glass layout, Sketchbook colours (docs/DESIGN.md). */
export function mountShell(root: HTMLElement): void {
  let current: StepId = 'sketch';
  /** The drawing pad: made once, and its strokes stay while the student visits the later steps. */
  let pad: SketchPad | null = null;
  let shape: PuzzleShape | null = null;
  /** Lines drawn inside the animal are engraved into the pieces (on at first, D-053). */
  let engrave = true;
  let pieces = DEFAULT_PIECES;
  let animalName = '';
  /** The class inbox this build can send to (D-049), or null: then nothing is ever sent. */
  const inbox = inboxConfig();
  let classCode = inbox ? rememberedClassCode() : '';
  let seed = 1;
  /** True once the 3D view could not start (no WebGL): the Print step then shows a flat picture. */
  let viewFailed = false;
  let viewer: PuzzleViewer | null = null;
  let viewerLoading: Promise<PuzzleViewer | null> | null = null;
  let shownPuzzle: Puzzle | null = null;
  let simStatus: SimStatus = IDLE_SIM;
  let simShown = false;
  /** The colour-change animation on the Puzzle step: how many upgrades are shown, and the timer. */
  let revealStep = Infinity;
  let revealTimer = 0;
  let revealKey = '';
  let previewStep: StepId | null = null;
  let autoplay = false;
  let comfort: Comfort = loadComfort();
  let teacher: TeacherPrefs = loadTeacher();
  // An older version kept a class batch of outlines in this tab. Nothing is kept now: clear it.
  try {
    sessionStorage.removeItem('hane.batch.v1');
  } catch {
    // Storage can be blocked; there is then nothing to clear.
  }
  applyComfort(comfort);

  root.innerHTML = `
    <a class="skip-link" href="#main" id="skip">Skip to the steps</a>

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
      <div class="topbar-tools">
        <button type="button" class="btn btn-glass btn-compact" id="teacher-open" aria-haspopup="dialog" title="Teacher options">
          ${icon(ICON.cap)} <span class="btn-label">Teacher<span class="on-pill" id="teacher-on" hidden>on</span></span>
        </button>
        <button type="button" class="btn btn-glass" id="comfort-open" aria-haspopup="dialog">
          ${icon(ICON.sliders)} <span class="btn-label">Comfort</span>
        </button>
      </div>
    </header>

    <main class="stage" id="main" tabindex="-1">
      <section class="panel glass" id="panel"></section>
      <section class="canvas-card glass" id="canvas-card" aria-label="Preview">
        <div class="bed">
          <span class="tag" id="bed-tag" hidden></span>
          <div class="viewer" id="viewer" hidden></div>
          <div class="pad" id="pad" hidden></div>
          <div class="bed-art" id="bed-art"></div>
          <p class="bed-note" id="bed-note"></p>
          <div class="bed-label" id="bed-label"></div>
          <span class="sim-note" id="sim-note" hidden>Illustrative preview</span>
          <span class="visually-hidden" id="reveal-status" aria-live="polite"></span>
        </div>
        <div class="pieces-control" id="pieces-control" role="group" aria-labelledby="pieces-label" hidden>
          <div class="label" id="pieces-label">How many pieces?</div>
          <div class="count">
            <button type="button" class="round" data-action="less" aria-label="Fewer pieces">−</button>
            <output class="count-num" id="count-num" for="pieces" aria-live="polite"></output>
            <button type="button" class="round" data-action="more" aria-label="More pieces">+</button>
          </div>
          <input type="range" id="pieces" class="slider" min="${MIN_PIECES}" max="${MAX_PIECES}" step="1"
            aria-labelledby="pieces-label">
        </div>
        <div class="preview-actions" id="preview-actions" hidden>
          <div class="picture-tools" id="picture-tools" hidden>
            <button type="button" class="btn btn-glass small" id="pad-undo">Undo</button>
            <button type="button" class="btn btn-glass small" id="pad-clear">Clear</button>
          </div>
          <div class="sim-controls" id="sim-controls" hidden>
            <button type="button" class="btn btn-primary small" id="sim-play"></button>
            <label class="sim-layer"><span id="sim-layer-text"></span>
              <input type="range" id="sim-layer" class="slider" min="1" max="${SIM_LAYERS}" step="1" value="${SIM_LAYERS}" aria-label="Layer">
            </label>
            <div class="segmented sim-speed" role="radiogroup" aria-label="How fast to watch">
              ${(['slow', 'normal', 'fast'] as const)
                .map(
                  (v) =>
                    `<label class="seg"><input type="radio" name="speed" value="${v}"${v === 'normal' ? ' checked' : ''}><span>${v[0]!.toUpperCase()}${v.slice(1)}</span></label>`,
                )
                .join('')}
            </div>
          </div>
          <div class="view-controls" id="view-controls" hidden>
            <button type="button" class="btn btn-glass small" id="view-top" aria-label="Top view, from above">Top</button>
            <button type="button" class="btn btn-glass small" id="view-angle" aria-label="Angle view">Angle</button>
            <button type="button" class="btn btn-glass small" id="view-printer" aria-label="See the whole printer">Printer</button>
          </div>
        </div>
      </section>
    </main>

    <footer class="actions">
      <button type="button" class="btn btn-glass" id="back">Back</button>
      <p class="next-help" id="next-help"></p>
      <button type="button" class="btn btn-primary" id="next" aria-describedby="next-help"></button>
    </footer>

    <dialog id="teacher-dialog" class="dialog dialog-tall glass" aria-labelledby="teacher-title">
      <form method="dialog">
        <h2 id="teacher-title">Teacher options</h2>
        <p class="hint">For printing. Children do not need these. They stay on this device.</p>
        <div class="slider-row">
          <label for="t-gap">Gap between pieces: <output id="t-gap-out"></output></label>
          <input type="range" id="t-gap" class="slider" min="${CLEARANCE_MM.min}" max="${CLEARANCE_MM.max}" step="${CLEARANCE_MM.step}">
          <small class="field-note">A bigger gap makes pieces easier to put together. Print one test first.</small>
        </div>
        <div class="slider-row">
          <label for="t-magnet">Magnet pocket fit: <output id="t-magnet-out"></output></label>
          <input type="range" id="t-magnet" class="slider" min="${MAGNET_FIT_MM.min}" max="${MAGNET_FIT_MM.max}" step="${MAGNET_FIT_MM.step}">
          <small class="field-note">How much wider than the 6 mm magnet its pocket is. Try the gap test first.</small>
        </div>
        <fieldset class="seg-field">
          <legend>Tabs</legend>
          <div class="segmented">
            ${TAB_AMOUNTS.map(
              (a) =>
                `<label class="seg"><input type="radio" name="tabs" value="${a}"><span>${a[0]!.toUpperCase()}${a.slice(1)}</span></label>`,
            ).join('')}
          </div>
        </fieldset>
        <div class="slider-row">
          <label for="t-size">Biggest size: <output id="t-size-out"></output></label>
          <input type="range" id="t-size" class="slider" min="${SIZE_MM.min / 10}" max="${SIZE_MM.max / 10}" step="${SIZE_MM.step / 10}">
          <small class="field-note">A bigger drawing is made smaller to fit. It is never made bigger.</small>
        </div>
        <fieldset class="seg-field">
          <legend>Bottom edge</legend>
          <div class="segmented">
            ${RELIEF_AMOUNTS.map(
              (a) =>
                `<label class="seg"><input type="radio" name="relief" value="${a}"><span>${a[0]!.toUpperCase()}${a.slice(1)}</span></label>`,
            ).join('')}
          </div>
          <small class="field-note">Pulls the first layer in a little so the bottom edge does not swell and fuse pieces together. Off is how every puzzle is made. Try it with the gap test first: print it once Off and once Small.</small>
        </fieldset>
        <fieldset class="seg-field">
          <legend>Engraving depth</legend>
          <div class="segmented">
            ${ENGRAVE_DEPTHS.map(
              (a) =>
                `<label class="seg"><input type="radio" name="engrave-depth" value="${a}"><span>${a[0]!.toUpperCase()}${a.slice(1)} ${ENGRAVE_DEPTH_MM[a]} mm</span></label>`,
            ).join('')}
          </div>
          <small class="field-note">How deep the lines you draw inside the animal are cut into the top of each piece. Print the engraving test first.</small>
        </fieldset>
        <div class="slider-row">
          <label for="t-seed">Cut number</label>
          <input type="number" id="t-seed" class="field-input" min="0" max="2147483647" step="1" inputmode="numeric">
          <small class="field-note">The same number always gives the same cut.</small>
        </div>
        <div class="slider-row">
          <span class="field-title">Test print</span>
          <button type="button" class="btn btn-glass" id="t-coupon">${icon(ICON.box)} Download a gap test</button>
          <small class="field-note">${couponInstructions()}</small>
          <small class="field-note" id="t-coupon-status" role="status"></small>
          <button type="button" class="btn btn-glass" id="t-engrave-test">${icon(ICON.box)} Download an engraving test</button>
          <small class="field-note">Five slabs with grooves 0.2 to 1.0 mm deep and six widths, and a small face. Print it flat and see which grooves read.</small>
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn btn-glass" id="t-reset">Standard settings</button>
          <button class="btn btn-primary" value="done">Done</button>
        </div>
      </form>
    </dialog>

    <dialog id="name-dialog" class="dialog glass" aria-labelledby="name-title">
      <form method="dialog">
        <h2 id="name-title">${inbox ? 'Publish your puzzle' : 'Name your animal'}</h2>
        <div class="field" ${inbox ? '' : 'hidden'}>
          <label class="label" for="code-input">Class code</label>
          <input type="text" id="code-input" class="field-input" maxlength="40" autocomplete="off" aria-describedby="name-file name-problem">
        </div>
        <div class="field">
          <label class="label" for="name-input">Animal name</label>
          <input type="text" id="name-input" class="field-input" maxlength="${MAX_NAME}" autocomplete="off" aria-describedby="name-file name-problem">
        </div>
        <p class="file-preview" id="name-file"></p>
        <p class="notice" id="name-problem" role="status"></p>
        ${inbox ? '<p class="hint small" id="name-send-note">Publish your art for your teacher to see.</p>' : ''}
        ${inbox ? '<label class="switch"><input type="checkbox" id="save-copy"><span><strong>Also save the puzzle file</strong><small>Keeps a copy on this device</small></span></label>' : ''}
        <div class="dialog-actions">
          <button type="button" class="btn btn-glass" id="name-cancel">Cancel</button>
          <button type="button" class="btn btn-primary" id="name-save" aria-disabled="true">${inbox ? 'Publish' : 'Save'}</button>
        </div>
      </form>
    </dialog>

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
  const viewerEl = $('#viewer');
  const padHost = $('#pad');
  const pictureTools = $('#picture-tools');
  const viewControls = $('#view-controls');
  const simPlay = $<HTMLButtonElement>('#sim-play');
  const simLayer = $<HTMLInputElement>('#sim-layer');
  const simLayerText = $('#sim-layer-text');
  const speeds = root.querySelectorAll<HTMLInputElement>('input[name="speed"]');
  const back = $<HTMLButtonElement>('#back');
  const next = $<HTMLButtonElement>('#next');
  const nextHelp = $('#next-help');
  const chips = root.querySelectorAll<HTMLButtonElement>('.step-chip');
  const dialog = $<HTMLDialogElement>('#comfort-dialog');
  const teacherDialog = $<HTMLDialogElement>('#teacher-dialog');
  const teacherButton = $<HTMLButtonElement>('#teacher-open');
  const tGap = $<HTMLInputElement>('#t-gap');
  const tMagnet = $<HTMLInputElement>('#t-magnet');
  const tSize = $<HTMLInputElement>('#t-size');
  const tSeed = $<HTMLInputElement>('#t-seed');
  const calm = $<HTMLInputElement>('#calm');
  const motion = $<HTMLInputElement>('#motion');
  const sizes = root.querySelectorAll<HTMLInputElement>('#text-size input');

  /** The animal's name above the picture, shown only when there is one. */
  function syncNameTag(): void {
    const name = animalName.trim();
    bedTag.hidden = current === 'sketch' || name === '';
    bedTag.textContent = name;
  }
  /** The colour the preview draws the plastic in (the first filament, gold). */
  const printHex = (): string => FILAMENTS[0]!.hex;
  /**
   * The STL's file name, or nothing while there is no usable name. With the class inbox it is the
   * class code then the animal ("6A Big Cat.stl"); without, just the animal ("Big Cat.stl").
   */
  const stlFile = (): string => {
    const name = inbox ? classFileName(classCode, animalName) : animalFileName(animalName);
    return name ? `${name}.stl` : '';
  };
  /** Something is on the pad: Next will trace it and carry on. */
  const hasInk = (): boolean => pad?.hasInk() === true;
  /** On the pad the way on is the ink; on the later steps it is the traced drawing. */
  const canLeave = (): boolean => (current === 'sketch' ? hasInk() : shape !== null);
  /** The drawing at the size the teacher allows (a smaller copy when it is too big). */
  const shown = (): PuzzleShape | null =>
    shape ? sizedShape(withEngraving(shape, engrave), teacher.maxSizeMm) : null;
  const currentPuzzle = (): Puzzle | null => {
    const s = shown();
    return s ? getPuzzle(s, pieces, seed, teacher) : null;
  };

  function setNotice(text: string): void {
    const el = panel.querySelector<HTMLElement>('#notice');
    if (el) el.textContent = text;
  }

  /** True when the device has no finger, pen or mouse to draw with. */
  const noPointer = (): boolean => window.matchMedia?.('(any-pointer: none)').matches === true;

  function sketchControls(): string {
    return `
      <div class="pad-tools">
        <p class="hint small pad-hint">${
          noPointer()
            ? 'This device has no finger, pen or mouse, so it cannot draw. Open the page on a tablet, a laptop or a phone.'
            : 'Draw a closed line around your animal, with no gaps. Drawing needs a finger, a pen or a mouse.'
        }</p>
      </div>
      <div class="samples" role="group" aria-labelledby="samples-label">
        <p class="label" id="samples-label">Try an example (for testing)</p>
        ${SAMPLES.map(
          (s, i) =>
            `<button type="button" class="btn btn-glass small" data-action="sample" data-sample="${i}" title="${s.tests}">${s.name}</button>`,
        ).join('')}
      </div>`;
  }

  function puzzleControls(): string {
    return `
      <div class="field field-inline">
        <label class="label" for="animal-name">Animal name</label>
        <input type="text" id="animal-name" class="field-input" maxlength="${MAX_NAME}" autocomplete="off" placeholder="Fish">
      </div>
      <div class="panel-buttons">
        <button type="button" class="btn btn-glass" data-action="shuffle">${icon(ICON.shuffle)} Shuffle the cuts</button>
        ${
          shape?.marks
            ? `<button type="button" class="btn btn-glass" data-action="engrave" aria-pressed="${engrave}">${icon(ICON.pencil)} Engrave my drawing: ${engrave ? 'On' : 'Off'}</button>`
            : ''
        }
      </div>`;
  }

  function printControls(): string {
    const puzzle = currentPuzzle();
    const report = puzzle ? printReport(puzzle) : null;
    const todo = [
      [
        'Publish your puzzle',
        puzzle?.pieces.some((p) => p.grooves.length > 0)
          ? `One file, made for the 3D printer. Your drawing is engraved ${puzzle.engraveDepthMm} mm deep.`
          : 'One file, made for the 3D printer.',
      ],
      ['Your teacher prints it three times', 'In Bambu Studio: white, tan, gold.'],
      [
        'Put the puzzle together',
        `6 × 2 mm magnet in each piece (${report?.totalMagnets ?? 0} in all).`,
      ],
    ];
    // The numbers matter little to a student: one quiet line under the to-do list, totals only.
    const facts = report
      ? `<p class="hint small print-facts">${cm(report.widthMm)} × ${cm(report.heightMm)} cm · about ${Math.round(report.totalGramsAtMost)} grams · ${formatDuration(report.totalMinutes)}</p>`
      : '';
    return `
      <ol class="todo">
        ${todo.map(([t, s]) => `<li><strong>${t}</strong><small>${s}</small></li>`).join('')}
      </ol>
      ${facts}
      `;
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
      ${step.hint ? `<p class="hint">${step.hint}</p>` : ''}
      ${body}
      ${
        current === 'print' && inbox
          ? '<div class="notice-row"><p class="notice" id="notice" role="status"></p><button type="button" class="btn btn-glass" data-action="send-again" id="send-again" hidden>Try again</button></div>'
          : '<p class="notice" id="notice" role="status"></p>'
      }`;
    if (current === 'puzzle') syncPuzzleControls();
  }

  function syncPuzzleControls(): void {
    $<HTMLOutputElement>('#count-num').value = String(pieces);
    $<HTMLInputElement>('#pieces').value = String(pieces);
    const nameBox = panel.querySelector<HTMLInputElement>('#animal-name');
    if (nameBox && nameBox.value !== animalName) nameBox.value = animalName;
  }

  /** One friendly line about the current cut: too many pieces, or fewer than asked for. */
  function showPuzzleNotice(): void {
    if (current !== 'puzzle') return;
    const puzzle = currentPuzzle();
    const noMagnet = puzzle?.issues.filter((i) => i.kind === 'no-magnet-room').length ?? 0;
    if (puzzle && puzzle.pieces.length < pieces) {
      setNotice(`Only ${puzzle.pieces.length} pieces fit this shape. Try fewer pieces.`);
    } else if (noMagnet > 0) {
      setNotice(
        `${noMagnet} ${noMagnet === 1 ? 'piece is' : 'pieces are'} too small for a magnet. Try fewer pieces.`,
      );
    } else {
      setNotice('');
    }
  }

  /** The 3D scene only shows the Print step: every piece in gold. */
  function pieceColours(puzzle: Puzzle): string[] {
    return puzzle.pieces.map(() => printHex());
  }

  const revealStatus = $('#reveal-status');
  const revealPlan = (count: number): number[] => revealOrder(count, seed);
  /** The colour of every piece right now on the Puzzle step. */
  function tonesNow(): Tone[] {
    const count = currentPuzzle()?.pieces.length ?? pieces;
    return revealStep === Infinity
      ? allGold(count)
      : tonesAfter(revealPlan(count), count, revealStep);
  }
  /** Redraws only the piece colours, so the animation costs almost nothing. */
  function paintTones(drift?: PieceDrift): void {
    const puzzle = currentPuzzle();
    const group = bedArt.querySelector('.cut-pieces');
    if (puzzle && group) group.innerHTML = piecePaths(puzzle, tonesNow(), drift);
  }
  function stopReveal(): void {
    clearInterval(revealTimer);
    revealTimer = 0;
  }
  /** Shows every piece gold at once and stops the animation. */
  function finishReveal(announce = false): void {
    stopReveal();
    revealStep = Infinity;
    paintTones();
    if (announce) revealStatus.textContent = `All ${tonesNow().length} pieces are gold.`;
  }
  /** Plays the white, tan, gold animation once from the start (or just shows gold with Reduce motion). */
  function startReveal(): void {
    stopReveal();
    revealStatus.textContent = '';
    if (comfort.reduceMotion) {
      finishReveal();
      return;
    }
    const count = currentPuzzle()?.pieces.length ?? pieces;
    const total = revealPlan(count).length;
    revealKey = `${count}:${seed}`;
    revealStep = 0;
    paintTones();
    const every = Math.min(300, Math.max(50, 4000 / total));
    const order = revealPlan(count);
    revealTimer = window.setInterval(() => {
      revealStep++;
      if (revealStep >= total) finishReveal(true);
      // The piece that just changed colour drifts out and back while the next one waits.
      else paintTones({ id: order[revealStep - 1]!, ms: every });
    }, every);
  }

  /** Shows where the print is up to: the Play button's words, the layer slider and its label. */
  function syncSim(status: SimStatus): void {
    simStatus = status;
    const text = `Layer ${status.layer} of ${status.layers}`;
    simLayerText.textContent = text;
    simLayer.max = String(status.layers);
    simLayer.value = String(status.layer);
    simLayer.setAttribute('aria-valuetext', text);
    const [path, label] = status.playing
      ? [ICON.pause, 'Pause']
      : status.finished
        ? [ICON.replay, 'Replay']
        : status.active
          ? [ICON.play, 'Play']
          : [ICON.play, 'Watch it print'];
    simPlay.innerHTML = `${icon(path)} ${label}`;
  }
  syncSim(IDLE_SIM);

  const chosenSpeed = (): SimSpeed =>
    ([...speeds].find((r) => r.checked)?.value as SimSpeed | undefined) ?? 'normal';

  /** Loads the 3D viewer the first time it is wanted (it is a separate download). */
  function ensureViewer(): Promise<PuzzleViewer | null> {
    if (viewer) return Promise.resolve(viewer);
    viewerLoading ??= (async () => {
      try {
        const mod = await import('../render/viewer');
        if (!mod.webglAvailable()) throw new Error('webgl');
        viewer = new mod.PuzzleViewer(viewerEl, {
          reduceMotion: comfort.reduceMotion,
          calm: comfort.calm,
        });
        viewer.onSimStatus(syncSim);
        viewer.simSetRuns(PRINT_COLOURS);
        viewer.simSetSpeed(chosenSpeed());
        return viewer;
      } catch {
        viewFailed = true;
        autoplay = false;
        viewerLoading = null;
        renderPreview();
        setNotice("3D view isn't available on this device. Here is the flat picture.");
        return null;
      }
    })();
    return viewerLoading;
  }

  function show3d(): void {
    const puzzle = currentPuzzle();
    if (!puzzle) return;
    const colours = pieceColours(puzzle);
    bedNote.textContent = viewer ? '' : 'Loading the 3D view…';
    bedNote.hidden = viewer !== null;
    void ensureViewer().then((v) => {
      if (!v || current !== 'print') {
        autoplay = false;
        return;
      }
      bedNote.hidden = true;
      if (shownPuzzle !== puzzle) {
        v.setPuzzle(puzzle, colours);
        shownPuzzle = puzzle;
      } else {
        v.setColours(colours);
      }
      v.resize();
      if (autoplay && current === 'print') {
        autoplay = false;
        v.simPlay();
      }
    });
  }

  function renderPreview(): void {
    const wants3d = current === 'print' && shape !== null && !viewFailed;
    // Coming to the Puzzle step plays the colour animation once; leaving it, or cutting again, ends it.
    if (current !== previewStep) {
      previewStep = current;
      // Coming to the Print step starts the printing, unless motion is reduced.
      if (current === 'print') autoplay = !comfort.reduceMotion;
      if (current === 'puzzle' && shape) startReveal();
      else finishReveal();
    } else if (revealTimer && revealKey !== `${currentPuzzle()?.pieces.length ?? pieces}:${seed}`) {
      finishReveal();
    }
    card.dataset.view = wants3d ? '3d' : 'flat';
    // The pad is the whole of step 1. Undo and Clear sit under it.
    const padOpen = current === 'sketch';
    pictureTools.hidden = !padOpen;
    stage.dataset.tools = String(padOpen);
    // Under the picture: Undo and Clear (step 1) or the printer controls (step 3). The
    // Puzzle step keeps only the piece count there; Shuffle is in the panel.
    $('#preview-actions').hidden = padOpen ? false : current === 'puzzle' || !wants3d;
    const onFlatPuzzle = current === 'puzzle' && shape !== null;
    $('#pieces-control').hidden = !onFlatPuzzle;
    viewControls.hidden = !wants3d;
    const watching = current === 'print' && wants3d;
    $('#sim-controls').hidden = !watching;
    $('#sim-note').hidden = !watching;
    if (!watching && simShown) {
      viewer?.simStop();
      syncSim(IDLE_SIM);
    }
    simShown = watching;
    viewerEl.hidden = !wants3d;
    padHost.hidden = !padOpen;
    bedArt.hidden = wants3d || padOpen;
    bedLabel.hidden = current === 'puzzle' || (wants3d && !watching) || padOpen;

    let art = '';
    if (!padOpen && shape && !wants3d) {
      const mode: PreviewMode = current === 'puzzle' ? 'pieces' : 'print';
      art = shapeSvg(shown()!, mode, pieces, seed, tonesNow(), teacher);
    }
    bedArt.innerHTML = art;
    syncNameTag();
    bedLabel.textContent = `Fits the printer · up to ${Math.round(usablePlateSize() / 10)} cm wide`;
    if (wants3d) {
      show3d();
    } else if (padOpen) {
      bedNote.hidden = pad?.hasInk() ?? false;
      bedNote.textContent = 'Draw your animal here';
    } else {
      bedNote.hidden = art !== '';
      bedNote.textContent = 'Draw your animal first';
    }
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
    stage.dataset.drawing = String(current === 'sketch');
    chips.forEach((chip, idx) => {
      const id = chip.dataset.step as StepId;
      const num = chip.querySelector('.step-num')!;
      num.textContent = idx < i ? '✓' : String(idx + 1);
      if (id === current) chip.setAttribute('aria-current', 'step');
      else chip.removeAttribute('aria-current');
      chip.setAttribute('aria-disabled', String(!canVisit(id, canLeave())));
    });
    back.disabled = current === 'sketch';
    next.textContent = step.nextLabel;
    const blocked = !canVisit(nextStep(current), canLeave());
    next.setAttribute('aria-disabled', String(blocked));
    nextHelp.textContent = blocked
      ? 'Draw your animal to continue'
      : current === 'print'
        ? stlFile()
        : '';
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
    if (!canVisit(id, canLeave())) {
      setNotice('Draw your animal first. Use a finger, a pen or the mouse.');
      return;
    }
    // Leaving the pad traces the drawing first, and stays here if no animal can be found.
    if (current === 'sketch' && id !== 'sketch' && !traceDrawing()) return;
    current = id;
    render(true);
  }

  // ---- The drawing pad -----------------------------------------------------------------------

  /** Greys Undo and Clear while there is nothing to undo. */
  function syncPad(): void {
    const empty = !pad?.hasInk();
    pictureTools
      .querySelectorAll<HTMLElement>('#pad-undo, #pad-clear')
      .forEach((b) => b.setAttribute('aria-disabled', String(empty)));
  }

  /**
   * Turns what is on the pad into an outline. True when an animal was found; otherwise the notice
   * says why and the student stays on the pad.
   */
  function traceDrawing(): boolean {
    if (!pad?.hasInk()) {
      setNotice('Draw your animal first. Use a finger, a pen or the mouse.');
      return false;
    }
    try {
      const found = new OutlineExtractor(pad.toImage(), PEN_WIDTH).run(DRAWN_TIDY);
      if (!found.ok) {
        setNotice(
          found.problem === 'tiny'
            ? 'The drawing is very small. Make it bigger.'
            : "I can't see a drawing. Draw a bigger line.",
        );
        return false;
      }
      shape = makeShape(found.outlineMm, undefined, 1, {
        rings: found.marksMm,
        penMm: found.penMm,
      });
      setNotice('');
      return true;
    } catch {
      setNotice("I couldn't read the drawing. Press Clear and try again.");
      return false;
    }
  }

  // A file dropped on the page would open in the tab and replace the app. Nothing is taken in
  // this way: the pad is the only way to make a drawing.
  for (const type of ['dragover', 'drop'] as const) {
    window.addEventListener(type, (e) => e.preventDefault());
  }

  // ---- Events -------------------------------------------------------------------------------

  /** Builds the files on this device and saves them. */
  function saveFile(): void {
    const puzzle = currentPuzzle();
    if (!puzzle) return;
    if (!puzzle.ok) {
      setNotice('Something is wrong with this cut. Go back and press Shuffle the cuts.');
      return;
    }
    const file = stlFile();
    // The file is named after the animal, so no name means asking for one first. With the class
    // inbox the dialog always opens (the class code is asked for at every Publish).
    if (!file || (inbox && !confirmedSave)) {
      openNameDialog();
      return;
    }
    const stl = puzzleStl(puzzle, undefined, reliefFor(teacher));
    // With the inbox the file is only saved on this device when the box in the dialog is ticked
    // (it starts unticked); without one the file is the only thing there is to make.
    const keepCopy = !inbox || saveCopyBox.checked;
    if (keepCopy) downloadBytes(stl, file, 'model/stl');
    if (inbox) {
      void sendCopy(puzzle, stl, file, keepCopy);
    } else {
      setNotice(`Saved ${file}. Give it to your teacher to print three times.`);
    }
  }

  // ---- Sending a copy to the class inbox (D-049) ----------------------------------------------

  /** True only while a name is being saved from the dialog, so saveFile does not ask again. */
  let confirmedSave = false;
  /** The files of the last Publish, so a second try carries on where the first stopped. */
  let pendingSend: { job: SendJob; file: string; kept: boolean } | null = null;

  function showSendAgain(on: boolean): void {
    const button = panel.querySelector<HTMLElement>('#send-again');
    if (button) button.hidden = !on;
  }

  /** Makes the 2D view and the JSON for this publish, then sends all three files. */
  async function sendCopy(
    puzzle: Puzzle,
    stl: Uint8Array,
    file: string,
    kept: boolean,
  ): Promise<void> {
    showSendAgain(false);
    setNotice(kept ? 'Saved. Publishing…' : 'Publishing…');
    try {
      const png = await renderPng(puzzle);
      const json = inboxJson({
        classCode: classCode.trim(),
        animal: animalName.trim(),
        fileName: file,
        pieces: puzzle.pieces.length,
        seed,
        gapMm: teacher.clearance,
        createdAt: new Date().toISOString(),
      });
      pendingSend = {
        job: newSendJob(classFolder(classCode), inboxBase(classCode, animalName), stl, png, json),
        file,
        kept,
      };
    } catch {
      pendingSend = null;
      setNotice(`${kept ? 'Saved. ' : ''}Not published. Tell your teacher.`);
      return;
    }
    await runSend();
  }

  /** Sends what is waiting (all of it, or what is left after a failed try) and says how it went. */
  async function runSend(): Promise<void> {
    const sending = pendingSend;
    if (!inbox || !sending) return;
    showSendAgain(false);
    const saved = sending.kept ? 'Saved. ' : '';
    setNotice(`${saved}Publishing…`);
    const outcome = await sendJob(inbox, sending.job);
    // A newer Publish took over while this one was on its way.
    if (sending !== pendingSend) return;
    switch (outcome) {
      case 'sent':
        pendingSend = null;
        setNotice(`${saved}Published. Your teacher can see it.`);
        break;
      case 'offline':
        setNotice(`${saved}Not published: offline.`);
        showSendAgain(true);
        break;
      case 'too-big':
        pendingSend = null;
        setNotice(`${saved}Too big to publish. Tell your teacher.`);
        break;
      default:
        setNotice(`${saved}Not published. Please try again.`);
        showSendAgain(true);
    }
  }

  // ---- Asking for the animal's name when the file has none ------------------------------------

  const nameDialog = $<HTMLDialogElement>('#name-dialog');
  const nameInput = $<HTMLInputElement>('#name-input');
  const codeInput = $<HTMLInputElement>('#code-input');
  const nameSave = $<HTMLButtonElement>('#name-save');
  /** Only there with the class inbox; the stand-in keeps saveFile simple without one. */
  const saveCopyBox =
    document.querySelector<HTMLInputElement>('#save-copy') ?? document.createElement('input');

  /** The file name (without ".stl") the dialog's boxes make, or nothing while one is unusable. */
  const dialogName = (): string =>
    inbox ? classFileName(codeInput.value, nameInput.value) : animalFileName(nameInput.value);

  /** Shows the file name the typed name makes, or says in words why it cannot be used. */
  function syncNameDialog(): void {
    const name = dialogName();
    $('#name-file').textContent = name ? `${name}.stl` : '';
    const codeBad =
      inbox !== null && codeInput.value.trim() !== '' && !classCodeText(codeInput.value);
    const nameBad = nameInput.value.trim() !== '' && !animalFileName(nameInput.value);
    $('#name-problem').textContent = codeBad
      ? 'Use some letters or numbers in the class code.'
      : nameBad
        ? 'Use some letters or numbers.'
        : '';
    nameSave.setAttribute('aria-disabled', String(!name));
  }

  function openNameDialog(): void {
    codeInput.value = classCode;
    nameInput.value = animalName;
    saveCopyBox.checked = false;
    syncNameDialog();
    nameDialog.showModal();
    (inbox && !classCodeText(classCode) ? codeInput : nameInput).focus();
  }

  /** Takes the typed name (and class code) as the animal's, then saves the file. */
  function saveNamed(): void {
    if (!dialogName()) return;
    animalName = nameInput.value.slice(0, MAX_NAME);
    if (inbox) {
      classCode = codeInput.value.slice(0, 40);
      rememberClassCode(classCode);
    }
    nameDialog.close();
    syncNameTag();
    renderChrome();
    confirmedSave = true;
    try {
      saveFile();
    } finally {
      confirmedSave = false;
    }
  }

  nameInput.addEventListener('input', syncNameDialog);
  codeInput.addEventListener('input', syncNameDialog);
  for (const box of [nameInput, codeInput]) {
    box.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      saveNamed();
    });
  }
  nameSave.addEventListener('click', saveNamed);
  $('#name-cancel').addEventListener('click', () => nameDialog.close());

  panel.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    switch (target.dataset.action) {
      case 'shuffle':
        seed += 1;
        schedulePreview();
        break;
      case 'engrave':
        engrave = !engrave;
        renderPanel();
        schedulePreview();
        panel.querySelector<HTMLElement>('[data-action="engrave"]')?.focus();
        break;
      case 'send-again':
        void runSend();
        break;
      case 'sample':
        pad?.load(SAMPLES[Number(target.dataset.sample)]?.strokes ?? []);
        break;
    }
  });

  panel.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'animal-name') {
      animalName = t.value.slice(0, MAX_NAME);
      syncNameTag();
    }
  });

  // The piece count sits under the preview, so it is not part of the panel's events.
  const piecesControl = $('#pieces-control');
  piecesControl.addEventListener('click', (e) => {
    const button = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!button) return;
    pieces = clampPieces(pieces + (button.dataset.action === 'more' ? 1 : -1));
    syncPuzzleControls();
    schedulePreview();
  });
  piecesControl.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id !== 'pieces') return;
    pieces = clampPieces(Number(t.value));
    syncPuzzleControls();
    schedulePreview();
  });

  $('#skip').addEventListener('click', (e) => {
    e.preventDefault();
    stage.focus();
  });
  for (const [id, act] of [
    ['#pad-undo', () => pad?.undo()],
    ['#pad-clear', () => pad?.clear()],
  ] as const) {
    $(id).addEventListener('click', (e) => {
      if ((e.currentTarget as HTMLElement).getAttribute('aria-disabled') !== 'true') act();
    });
  }
  simPlay.addEventListener('click', () => {
    if (!viewer) return;
    if (simStatus.playing) {
      viewer.simPause();
    } else {
      viewer.simPlay();
    }
  });
  simLayer.addEventListener('input', () => {
    viewer?.simSeekLayer(Number(simLayer.value));
  });
  speeds.forEach((r) =>
    r.addEventListener('change', () => {
      if (r.checked) viewer?.simSetSpeed(r.value as SimSpeed);
    }),
  );
  $('#view-top').addEventListener('click', () => viewer?.setView('top'));
  $('#view-angle').addEventListener('click', () => viewer?.setView('angled'));
  $('#view-printer').addEventListener('click', () => viewer?.setView('printer'));

  chips.forEach((chip) => chip.addEventListener('click', () => go(chip.dataset.step as StepId)));
  back.addEventListener('click', () => go(prevStep(current)));
  next.addEventListener('click', () => {
    if (current === 'print') {
      saveFile();
      return;
    }
    go(nextStep(current));
  });

  /** The header button says "on" (in words, and with a dot on a phone) while anything is not standard. */
  function syncTeacherChrome(): void {
    const on = teacherIsOn(teacher);
    $('#teacher-on').hidden = !on;
    teacherButton.dataset.on = String(on);
  }

  function syncTeacherDialog(): void {
    tGap.value = String(teacher.clearance);
    $('#t-gap-out').textContent = `${teacher.clearance.toFixed(2)} mm`;
    tMagnet.value = String(teacher.magnetFit);
    $('#t-magnet-out').textContent = `${teacher.magnetFit.toFixed(2)} mm`;
    tSize.value = String(teacher.maxSizeMm / 10);
    $('#t-size-out').textContent = `${cm(teacher.maxSizeMm)} cm`;
    tSeed.value = String(seed);
    teacherDialog.querySelectorAll<HTMLInputElement>('input[name="tabs"]').forEach((r) => {
      r.checked = r.value === teacher.tabAmount;
    });
    teacherDialog.querySelectorAll<HTMLInputElement>('input[name="relief"]').forEach((r) => {
      r.checked = r.value === teacher.relief;
    });
    teacherDialog.querySelectorAll<HTMLInputElement>('input[name="engrave-depth"]').forEach((r) => {
      r.checked = r.value === teacher.engraveDepth;
    });
  }

  /** Keeps the choice, remembers it and redraws what it changes. */
  function updateTeacher(patch: Partial<TeacherPrefs>): void {
    teacher = { ...teacher, ...patch };
    saveTeacher(teacher);
    syncTeacherChrome();
    syncTeacherDialog();
    schedulePreview();
  }

  teacherButton.addEventListener('click', () => {
    syncTeacherDialog();
    teacherDialog.showModal();
  });
  tGap.addEventListener('input', () => updateTeacher({ clearance: Number(tGap.value) }));
  tMagnet.addEventListener('input', () => updateTeacher({ magnetFit: Number(tMagnet.value) }));
  tSize.addEventListener('input', () => updateTeacher({ maxSizeMm: Number(tSize.value) * 10 }));
  teacherDialog.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'tabs') updateTeacher({ tabAmount: t.value as TabAmount });
    if (t.name === 'relief') updateTeacher({ relief: t.value as ReliefAmount });
    if (t.name === 'engrave-depth') updateTeacher({ engraveDepth: t.value as EngraveDepth });
  });
  tSeed.addEventListener('input', () => {
    const n = Math.floor(Number(tSeed.value));
    if (tSeed.value === '' || !Number.isFinite(n)) return;
    seed = Math.min(2 ** 31, Math.max(0, n));
    schedulePreview();
  });
  tSeed.addEventListener('change', () => syncTeacherDialog());
  $('#t-coupon').addEventListener('click', () => {
    const name = 'gap-test.stl';
    downloadBytes(
      toleranceStl(teacherParams(teacher).tabs, reliefFor(teacher), teacherParams(teacher).magnet),
      name,
      'model/stl',
    );
    $('#t-coupon-status').textContent = `Saved ${name}.`;
  });
  $('#t-engrave-test').addEventListener('click', () => {
    downloadBytes(engraveCouponStl(), 'engraving-test.stl', 'model/stl');
    $('#t-coupon-status').textContent = 'Saved engraving-test.stl.';
  });
  $('#t-reset').addEventListener('click', () => {
    updateTeacher({ ...DEFAULT_PREFS });
  });
  syncTeacherChrome();

  function syncDialog(): void {
    calm.checked = comfort.calm;
    motion.checked = comfort.reduceMotion;
    sizes.forEach((s) => (s.checked = s.value === comfort.textSize));
  }
  function updateComfort(patch: Partial<Comfort>): void {
    comfort = { ...comfort, ...patch };
    applyComfort(comfort);
    saveComfort(comfort);
    if (comfort.reduceMotion && revealTimer) finishReveal();
    renderPreview();
    viewer?.setReducedMotion(comfort.reduceMotion);
    viewer?.setCalm(comfort.calm);
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

  // Everyone starts on the drawing pad, and it is the only way to make a drawing.
  pad = new SketchPad(padHost, () => {
    syncPad();
    renderChrome();
    renderPreview();
  });
  syncPad();
  render();
}
