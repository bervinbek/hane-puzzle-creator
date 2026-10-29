import {
  DEFAULT_TIDY,
  DRAWN_TIDY,
  OutlineExtractor,
  type CloseGaps,
  type OutlineResult,
  type TidyParams,
} from '../core/outline';
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
import { isUsableQuad, straighten, type Quad } from '../core/image/perspective';
import { couponInstructions, toleranceStl } from '../core/puzzle/coupon';
import {
  CLEARANCE_MM,
  MAGNET_FIT_MM,
  SIZE_MM,
  RELIEF_AMOUNTS,
  TAB_AMOUNTS,
  reliefFor,
  teacherParams,
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
import { PhotoError, imageToUrl, loadPhoto, photoErrorMessage, type LoadedPhoto } from './photo';
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
  photoSvg,
  sampleFishShape,
  piecePaths,
  type PieceDrift,
  shapeSvg,
  allGold,
  PRINT_COLOURS,
  sizedShape,
  type PreviewMode,
  type PuzzleShape,
} from './puzzlePreview';
import { ladderHtml, pieceRungs, printRungs } from './ladder';
import { CameraError, CameraSession, cameraErrorMessage, cameraSupported } from './camera';
import { SketchPad } from './sketchPad';
import { DEFAULT_PREFS, loadTeacher, saveTeacher, teacherIsOn, type TeacherPrefs } from './teacher';
import { STEPS, canVisit, nextStep, prevStep, stepIndex, type StepId } from './steps';

const icon = (path: string): string =>
  `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;

const ICON = {
  puzzle: '<path d="M5 9h5a2.5 2.5 0 1 1 5 0h4v5a2.5 2.5 0 1 0 0 5v1H5z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"/>',
  pencil: '<path d="M4 20l1-4L16 5l3 3L8 19z"/>',
  box: '<path d="M4 8l8-4 8 4v8l-8 4-8-4zM4 8l8 4 8-4M12 12v8"/>',
  shuffle:
    '<path d="M4 7h3c4 0 6 10 10 10h3M4 17h3c1.5 0 2.6-1 3.6-2.4M14 9.4C15 8 16 7 17.5 7H20M17 4l3 3-3 3M17 14l3 3-3 3"/>',
  cap: '<path d="M3 9l9-4 9 4-9 4zM7 11v4c0 1.5 2.2 3 5 3s5-1.5 5-3v-4"/>',
  dots: '<circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="9" r="2.5"/><circle cx="10" cy="17" r="2.5"/>',
  crop: '<path d="M7 3v14h14M3 7h14v14"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  replay: '<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>',
  sliders:
    '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
};

type Source = 'none' | 'sample' | 'photo' | 'draw';

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
  /** True while the drawing pad is open. */
  let drawing = false;
  let pad: SketchPad | null = null;
  /** A picture tool that is open: the live camera, or the four corners for straightening a photo. */
  let tool: 'camera' | 'straighten' | null = null;
  let camera: CameraSession | null = null;
  let quad: Quad | null = null;
  let draggingCorner = -1;
  let shape: PuzzleShape | null = null;
  let photo: LoadedPhoto | null = null;
  let extractor: OutlineExtractor | null = null;
  let result: OutlineResult | null = null;
  let tidy: TidyParams = { ...DEFAULT_TIDY };
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
          <video class="camera" id="camera" playsinline muted hidden></video>
          <div class="bed-art" id="bed-art"></div>
          <p class="bed-note" id="bed-note"></p>
          <div class="bed-label" id="bed-label"></div>
          <span class="sim-note" id="sim-note" hidden>Illustrative preview</span>
          <span class="visually-hidden" id="reveal-status" aria-live="polite"></span>
        </div>
        <div class="ladder-row" id="ladder-row" hidden></div>
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
            <button type="button" class="btn btn-glass small" id="tool-camera">${icon(ICON.camera)} Use the camera</button>
            <button type="button" class="btn btn-glass small" id="tool-straighten">${icon(ICON.crop)} Straighten the picture</button>
            <button type="button" class="btn btn-primary small" id="tool-take">${icon(ICON.camera)} Take photo</button>
            <button type="button" class="btn btn-primary small" id="tool-apply">Apply</button>
            <button type="button" class="btn btn-glass small" id="tool-reset">Reset corners</button>
            <button type="button" class="btn btn-glass small" id="tool-cancel">Cancel</button>
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

    <input type="file" id="file" accept="image/*" hidden>

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
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn btn-glass" id="t-reset">Standard settings</button>
          <button class="btn btn-primary" value="done">Done</button>
        </div>
      </form>
    </dialog>

    <dialog id="name-dialog" class="dialog glass" aria-labelledby="name-title">
      <form method="dialog">
        <h2 id="name-title">${inbox ? 'Download your puzzle' : 'Name your animal'}</h2>
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
        ${inbox ? '<p class="hint small" id="name-send-note">The puzzle shape and a flat picture of it are saved online for your teacher. Your drawing and photo stay on this device. Please do not type your own name.</p>' : ''}
        <div class="dialog-actions">
          <button type="button" class="btn btn-glass" id="name-cancel">Cancel</button>
          <button type="button" class="btn btn-primary" id="name-save" aria-disabled="true">${inbox ? 'Download and send' : 'Save'}</button>
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
  const ladderRow = $('#ladder-row');
  const viewerEl = $('#viewer');
  const padHost = $('#pad');
  const cameraEl = $<HTMLVideoElement>('#camera');
  const pictureTools = $('#picture-tools');
  const viewControls = $('#view-controls');
  const simPlay = $<HTMLButtonElement>('#sim-play');
  const simLayer = $<HTMLInputElement>('#sim-layer');
  const simLayerText = $('#sim-layer-text');
  const speeds = root.querySelectorAll<HTMLInputElement>('input[name="speed"]');
  const back = $<HTMLButtonElement>('#back');
  const next = $<HTMLButtonElement>('#next');
  const nextHelp = $('#next-help');
  const fileInput = $<HTMLInputElement>('#file');
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
  const hasDrawing = (): boolean => shape !== null && !drawing && tool === null;
  /** Something is on the pad: Next will trace it and carry on. */
  const hasInk = (): boolean => drawing && tool === null && pad?.hasInk() === true;
  const canLeave = (): boolean => hasDrawing() || hasInk();
  /** The drawing at the size the teacher allows (a smaller copy when it is too big). */
  const shown = (): PuzzleShape | null => (shape ? sizedShape(shape, teacher.maxSizeMm) : null);
  const currentPuzzle = (): Puzzle | null => {
    const s = shown();
    return s ? getPuzzle(s, pieces, seed, teacher) : null;
  };
  const traced = (): boolean => source === 'photo' || source === 'draw';

  function setNotice(text: string): void {
    const el = panel.querySelector<HTMLElement>('#notice');
    if (el) el.textContent = text;
  }

  function padTools(): string {
    return `
      <div class="pad-tools">
        <div class="pad-buttons">
          <button type="button" class="btn btn-glass" data-action="undo" id="pad-undo">Undo</button>
          <button type="button" class="btn btn-glass" data-action="clear" id="pad-clear">Clear</button>
        </div>
        <p class="hint small pad-hint">Draw a closed line around your animal, with no gaps. Drawing needs a finger, a pen or a mouse. Without one, add a photo or use the sample fish.</p>
      </div>`;
  }

  function sketchControls(): string {
    const chosen = source !== 'none' || drawing;
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
      traced() && !drawing && tool === null
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
        ${option('draw', ICON.pencil, 'Draw on screen', source === 'draw' && !drawing ? 'Tap to keep drawing' : 'With a finger, pen or mouse', source === 'draw' || drawing)}
      </div>
      ${tidyControls}${drawing ? padTools() : ''}`;
  }

  function puzzleControls(): string {
    return `
      <div class="field field-inline">
        <label class="label" for="animal-name">Animal name</label>
        <input type="text" id="animal-name" class="field-input" maxlength="${MAX_NAME}" autocomplete="off" placeholder="Fish">
      </div>
      <div class="panel-buttons">
        <button type="button" class="btn btn-glass" data-action="shuffle">${icon(ICON.shuffle)} Shuffle the cuts</button>
      </div>`;
  }

  function printControls(): string {
    const puzzle = currentPuzzle();
    const report = puzzle ? printReport(puzzle) : null;
    const todo = [
      ['Download the file', 'One file, made for the 3D printer.'],
      ['Your teacher prints it three times', 'In Bambu Studio: white, tan, gold.'],
      [
        'Put the puzzle together',
        `6 × 2 mm magnet in each piece (${report?.totalMagnets ?? 0} in all).`,
      ],
    ];
    const stats = report
      ? `
      <ul class="stats">
        <li><span>Pieces</span><strong>${report.pieceCount}</strong></li>
        <li><span>Size</span><strong>${cm(report.widthMm)} × ${cm(report.heightMm)} cm</strong></li>
        <li><span>Plastic</span><strong>up to ${Math.round(report.gramsAtMost)} g each · ${Math.round(report.totalGramsAtMost)} g in all</strong></li>
        <li><span>Print time</span><strong>${formatDuration(report.minutes)} each · ${formatDuration(report.totalMinutes).replace('about ', '')} in all</strong></li>
      </ul>
      <p class="hint small team-note">One file, printed ${report.sets} times. Estimates only.</p>`
      : '';
    return `
      ${stats}
      <ol class="todo">
        ${todo.map(([t, s]) => `<li><strong>${t}</strong><small>${s}</small></li>`).join('')}
      </ol>
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
          ? '<div class="notice-row"><p class="notice" id="notice" role="status"></p><button type="button" class="btn btn-glass" data-action="send-again" id="send-again" hidden>Send again</button></div>'
          : '<p class="notice" id="notice" role="status"></p>'
      }`;
    if (current === 'puzzle') syncPuzzleControls();
    if (current === 'sketch') showSketchStatus();
  }

  /** The one friendly sentence under the sketch controls. */
  function showSketchStatus(): void {
    if (source === 'sample') {
      setNotice('Nice choice! Press Next to cut it into pieces.');
    } else if (traced() && result) {
      if (result.ok) {
        // Any gap was closed for the student: they only judge the blue line.
        const closed =
          result.closeRadius > 0 ||
          result.bridges > 0 ||
          (source === 'draw' && pad?.closesGap() === true);
        setNotice(
          closed
            ? 'Found your animal! I closed a gap in the line. Press Next if the blue line looks right.'
            : 'Found your animal! Press Next if the blue line looks right.',
        );
      } else if (result.problem === 'tiny') {
        setNotice(
          source === 'draw'
            ? 'The drawing is very small. Tap Draw on screen and make it bigger.'
            : 'The drawing is very small. Move closer and take the photo again.',
        );
      } else {
        setNotice(
          source === 'draw'
            ? "I can't see a drawing. Tap Draw on screen and draw a bigger line."
            : "I can't see a drawing. Try a darker pen and a bright, flat photo.",
        );
      }
    }
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
  /** Redraws only the piece colours (and the counts), so the animation costs almost nothing. */
  function paintTones(drift?: PieceDrift): void {
    const puzzle = currentPuzzle();
    const group = bedArt.querySelector('.cut-pieces');
    if (puzzle && group) group.innerHTML = piecePaths(puzzle, tonesNow(), drift);
    syncRevealLabel();
  }
  /** Says in words how many pieces are in each colour, so colour is never the only signal. */
  function syncRevealLabel(): void {
    ladderRow.hidden = current !== 'puzzle' || !shape;
    if (ladderRow.hidden) return;
    const tones = tonesNow();
    const order = revealPlan(tones.length);
    // The step the animation is on is the colour the last changed piece went to.
    const active: Tone =
      revealStep === Infinity ? 2 : revealStep === 0 ? 0 : (tones[order[revealStep - 1]!] ?? 2);
    ladderRow.innerHTML = ladderHtml(pieceRungs(tones, active), {
      caption: 'Pieces',
      unit: 'pieces',
    });
  }
  /** The same ladder on the Print step, for the three prints. */
  function syncPrintLadder(): void {
    if (current !== 'print' || bedLabel.hidden) return;
    bedLabel.innerHTML = ladderHtml(printRungs(simStatus.active ? simStatus.run : 0), {
      caption: 'Prints',
      unit: 'print number',
    });
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
    syncPrintLadder();
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
    const toolsOn = current === 'sketch' && !drawing;
    const showTool = (id: string, on: boolean): void => {
      $(id).hidden = !on;
    };
    // The camera is offered under the pad too, since the pad is where everyone starts.
    showTool('#tool-camera', current === 'sketch' && tool === null && cameraSupported());
    showTool('#tool-straighten', toolsOn && tool === null && source === 'photo' && photo !== null);
    showTool('#tool-take', toolsOn && tool === 'camera');
    showTool('#tool-apply', toolsOn && tool === 'straighten');
    showTool('#tool-reset', toolsOn && tool === 'straighten');
    showTool('#tool-cancel', toolsOn && tool !== null);
    const anyTool = [...pictureTools.children].some((b) => !(b as HTMLElement).hidden);
    pictureTools.hidden = !anyTool;
    stage.dataset.tools = String(anyTool);
    // Under the picture: the picture tools (step 1) or the printer controls (step 3). The
    // Puzzle step keeps only the piece count there; Shuffle is in the panel.
    $('#preview-actions').hidden =
      current === 'sketch' ? !anyTool : current === 'puzzle' || !wants3d;
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
    const padOpen = drawing && current === 'sketch';
    padHost.hidden = !padOpen;
    const cameraOpen = tool === 'camera' && current === 'sketch';
    cameraEl.hidden = !cameraOpen;
    bedArt.hidden = wants3d || padOpen || cameraOpen;
    // The ladder of colours sits under the picture on the Puzzle step (its own row) and over the
    // printer on the Print step.
    bedLabel.hidden =
      current === 'puzzle' ||
      (wants3d && !watching) ||
      padOpen ||
      cameraOpen ||
      tool === 'straighten';

    let art = '';
    if (current === 'sketch') {
      if (tool === 'straighten' && photo && quad) {
        art = straightenSvg(photo, quad);
      } else if (traced() && photo) {
        art = photoSvg(photo.url, photo.width, photo.height, result?.ok ? result.outlinePx : null);
      } else if (source === 'sample' && shape) {
        art = shapeSvg(shown()!, 'outline', pieces, seed, undefined, teacher);
      }
    } else if (shape && !wants3d) {
      const mode: PreviewMode = current === 'puzzle' ? 'pieces' : 'print';
      art = shapeSvg(shown()!, mode, pieces, seed, tonesNow(), teacher);
    }
    bedArt.innerHTML = art;
    syncNameTag();
    bedLabel.textContent = `Fits the printer · up to ${Math.round(usablePlateSize() / 10)} cm wide`;
    syncRevealLabel();
    syncPrintLadder();
    if (wants3d) {
      show3d();
    } else {
      if (cameraOpen) {
        bedNote.hidden = true;
      } else if (padOpen) {
        bedNote.hidden = pad?.hasInk() ?? false;
        bedNote.textContent = 'Draw your animal here';
      } else {
        bedNote.hidden = art !== '';
        bedNote.textContent = 'Pick a drawing, or drop a photo here';
      }
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
    stage.dataset.source = source;
    stage.dataset.drawing = String(drawing);
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
      ? tool
        ? 'Finish the picture to continue'
        : drawing
          ? 'Draw your animal to continue'
          : 'Pick a drawing to continue'
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

  async function go(id: StepId): Promise<void> {
    if (!canVisit(id, canLeave())) {
      if (drawing && tool === null) {
        setNotice('Draw your animal first. Use a finger, a pen or the mouse.');
        return;
      }
      setNotice('Pick a drawing first. Then you can go on.');
      panel.querySelector<HTMLElement>('[data-action="photo"]')?.focus();
      return;
    }
    // Leaving the pad with a drawing on it traces the drawing first, like picking a photo does.
    if (hasInk() && !(await confirmDrawing())) return;
    current = id;
    render(true);
  }

  // ---- Choosing a drawing -------------------------------------------------------------------

  function dropPhoto(): void {
    endTool();
    if (photo) URL.revokeObjectURL(photo.url);
    photo = null;
    extractor = null;
    result = null;
  }

  function useSample(): void {
    dropPhoto();
    drawing = false;
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
      drawing = false;
      renderPanel();
      runTidy();
    } catch (e) {
      setNotice(photoErrorMessage(e instanceof PhotoError ? e.kind : 'unreadable'));
    }
  }

  // ---- Picture tools: the camera and straightening -------------------------------------------

  const CORNERS = [
    'Top left corner',
    'Top right corner',
    'Bottom right corner',
    'Bottom left corner',
  ] as const;

  /** Closes whichever tool is open (and turns the camera off). Does not redraw. */
  function endTool(): void {
    camera?.stop();
    camera = null;
    tool = null;
    quad = null;
    draggingCorner = -1;
  }

  function afterTool(): void {
    renderChrome();
    renderPanel();
    renderPreview();
    showSketchStatus();
  }

  const quadPoints = (q: Quad): string =>
    q.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const quadShade = (q: Quad, w: number, h: number): string =>
    `M0 0H${w}V${h}H0Z M${q.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}Z`;

  /** The photo with a shaded outside, the four corners and a dot on each to drag. */
  function straightenSvg(p: LoadedPhoto, q: Quad): string {
    // Rings 48 px across on screen, whatever size the photo is shown at: big enough for a finger.
    const shown = bedArt.getBoundingClientRect().width;
    const r = (24 * p.width) / (shown > 0 ? shown : 400);
    return `<svg class="photo straighten" viewBox="0 0 ${p.width} ${p.height}" role="group" aria-label="Your photo, with four corner dots to move onto the corners of the page">
      <image href="${p.url}" width="${p.width}" height="${p.height}"/>
      <path class="quad-shade" fill-rule="evenodd" d="${quadShade(q, p.width, p.height)}"/>
      <polygon class="quad-line" points="${quadPoints(q)}"/>
      ${q
        .map(
          (c, i) =>
            `<circle class="corner" data-corner="${i}" cx="${c[0].toFixed(1)}" cy="${c[1].toFixed(1)}" r="${r.toFixed(1)}" tabindex="0" role="button" aria-label="${CORNERS[i]}. Drag it, or use the arrow keys."/>`,
        )
        .join('')}
    </svg>`;
  }

  function defaultQuad(p: LoadedPhoto): Quad {
    const [x0, y0, x1, y1] = [p.width * 0.06, p.height * 0.06, p.width * 0.94, p.height * 0.94];
    return [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
    ];
  }

  function startStraighten(): void {
    if (!photo || tool !== null) return;
    tool = 'straighten';
    quad = defaultQuad(photo);
    renderChrome();
    renderPanel();
    renderPreview();
    setNotice('Drag the four dots onto the four corners of the page, then press Apply.');
  }

  /** Moves one corner (clamped to the photo) and updates the drawing without redrawing it all. */
  function moveCorner(i: number, x: number, y: number): void {
    if (!quad || !photo) return;
    const next = quad.map((c, k) =>
      k === i
        ? [Math.min(photo!.width, Math.max(0, x)), Math.min(photo!.height, Math.max(0, y))]
        : c,
    ) as unknown as Quad;
    quad = next;
    const svg = bedArt.querySelector('svg.straighten');
    if (!svg) return;
    svg.querySelector('.quad-shade')!.setAttribute('d', quadShade(next, photo.width, photo.height));
    svg.querySelector('.quad-line')!.setAttribute('points', quadPoints(next));
    const dot = svg.querySelector(`[data-corner="${i}"]`)!;
    dot.setAttribute('cx', next[i]![0].toFixed(1));
    dot.setAttribute('cy', next[i]![1].toFixed(1));
  }

  async function applyStraighten(): Promise<void> {
    if (!photo || !quad) return;
    if (!isUsableQuad(quad, photo.width * photo.height * 0.05)) {
      setNotice(
        'The corners cross over or are too close. Drag them so they make a box around the page.',
      );
      return;
    }
    setNotice('Straightening…');
    try {
      const flat = straighten(photo.image, quad);
      const url = await imageToUrl(flat);
      dropPhoto();
      photo = { image: flat, url, width: flat.width, height: flat.height };
      extractor = new OutlineExtractor(flat);
      tidy = { ...DEFAULT_TIDY };
      source = 'photo';
      renderChrome();
      renderPanel();
      runTidy();
    } catch {
      setNotice("I couldn't straighten that picture. Press Cancel and try again.");
    }
  }

  async function startCamera(): Promise<void> {
    if (tool !== null) return;
    drawing = false;
    tool = 'camera';
    const session = new CameraSession(cameraEl);
    camera = session;
    renderChrome();
    renderPanel();
    renderPreview();
    setNotice('Starting the camera…');
    try {
      await session.start();
      // Cancelled while it was starting: turn it straight off again.
      if (camera !== session) {
        session.stop();
        return;
      }
      setNotice('Hold your drawing up to the camera. Press Take photo when it fills the picture.');
    } catch (e) {
      if (camera !== session) return;
      endTool();
      afterTool();
      setNotice(cameraErrorMessage(e instanceof CameraError ? e.kind : 'failed'));
    }
  }

  async function takePhoto(): Promise<void> {
    const session = camera;
    if (!session) return;
    try {
      const file = await session.capture();
      endTool();
      afterTool();
      await useFile(file);
    } catch {
      endTool();
      afterTool();
      setNotice(cameraErrorMessage('failed'));
    }
  }

  /** Opens the drawing pad (a new one the first time; later the strokes are still there). */
  function openPad(): void {
    endTool();
    pad ??= new SketchPad(padHost, () => {
      syncPad();
      renderChrome();
      renderPreview();
    });
    drawing = true;
    renderChrome();
    renderPanel();
    renderPreview();
    syncPad();
  }

  /** Greys Undo and Clear while there is nothing to undo. */
  function syncPad(): void {
    const empty = !pad?.hasInk();
    panel
      .querySelectorAll<HTMLElement>('#pad-undo, #pad-clear')
      .forEach((b) => b.setAttribute('aria-disabled', String(empty)));
  }

  /**
   * Turns the drawing into an outline, exactly as a photo would be. True when an animal was
   * found; otherwise the notice says why and the student stays here.
   */
  async function confirmDrawing(): Promise<boolean> {
    if (!pad?.hasInk()) {
      setNotice('Draw your animal first. Use a finger, a pen or the mouse.');
      return false;
    }
    setNotice('Looking at your drawing…');
    try {
      const image = pad.toImage();
      const url = await pad.toUrl();
      // Coming back to add more strokes keeps the sliders where the student put them.
      const keepTidy = source === 'draw';
      dropPhoto();
      photo = { image, url, width: image.width, height: image.height };
      extractor = new OutlineExtractor(image);
      if (!keepTidy) tidy = { ...DRAWN_TIDY };
      source = 'draw';
      drawing = false;
      renderPanel();
      runTidy();
      return result?.ok === true;
    } catch {
      setNotice("I couldn't read the drawing. Press Clear and try again.");
      return false;
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
    // inbox the dialog always opens (the class code is asked for at every Download).
    if (!file || (inbox && !confirmedSave)) {
      openNameDialog();
      return;
    }
    const stl = puzzleStl(puzzle, undefined, reliefFor(teacher));
    downloadBytes(stl, file, 'model/stl');
    if (inbox) {
      void sendCopy(puzzle, stl, file);
    } else {
      setNotice(`Saved ${file}. Give it to your teacher to print three times.`);
    }
  }

  // ---- Sending a copy to the class inbox (D-049) ----------------------------------------------

  /** True only while a name is being saved from the dialog, so saveFile does not ask again. */
  let confirmedSave = false;
  /** The files of the last Download, so a second try carries on where the first stopped. */
  let pendingSend: { job: SendJob; file: string } | null = null;

  function showSendAgain(on: boolean): void {
    const button = panel.querySelector<HTMLElement>('#send-again');
    if (button) button.hidden = !on;
  }

  /** Makes the 2D view and the JSON for this download, then sends all three files. */
  async function sendCopy(puzzle: Puzzle, stl: Uint8Array, file: string): Promise<void> {
    showSendAgain(false);
    setNotice('Saved. Sending it to your teacher…');
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
      };
    } catch {
      pendingSend = null;
      setNotice('Saved. Not sent. Tell your teacher.');
      return;
    }
    await runSend();
  }

  /** Sends what is waiting (all of it, or what is left after a failed try) and says how it went. */
  async function runSend(): Promise<void> {
    const sending = pendingSend;
    if (!inbox || !sending) return;
    showSendAgain(false);
    setNotice('Saved. Sending it to your teacher…');
    const outcome = await sendJob(inbox, sending.job);
    // A newer Download took over while this one was on its way.
    if (sending !== pendingSend) return;
    const saved = 'Saved.';
    switch (outcome) {
      case 'sent':
        pendingSend = null;
        setNotice(`${saved} Sent to your teacher.`);
        break;
      case 'offline':
        setNotice(`${saved} Not sent: no connection.`);
        showSendAgain(true);
        break;
      case 'too-big':
        pendingSend = null;
        setNotice(`${saved} Too big to send. Tell your teacher.`);
        break;
      default:
        setNotice(`${saved} Not sent. Please try again.`);
        showSendAgain(true);
    }
  }

  // ---- Asking for the animal's name when the file has none ------------------------------------

  const nameDialog = $<HTMLDialogElement>('#name-dialog');
  const nameInput = $<HTMLInputElement>('#name-input');
  const codeInput = $<HTMLInputElement>('#code-input');
  const nameSave = $<HTMLButtonElement>('#name-save');

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
      case 'photo':
        fileInput.click();
        break;
      case 'sample':
        useSample();
        break;
      case 'draw':
        openPad();
        break;
      case 'shuffle':
        seed += 1;
        schedulePreview();
        break;
      case 'send-again':
        void runSend();
        break;
      case 'undo':
      case 'clear':
        if (target.getAttribute('aria-disabled') === 'true') break;
        if (target.dataset.action === 'undo') pad?.undo();
        else pad?.clear();
        break;
    }
  });

  let tidyFrame = 0;
  const scheduleTidy = (): void => {
    cancelAnimationFrame(tidyFrame);
    tidyFrame = requestAnimationFrame(runTidy);
  };

  panel.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'animal-name') {
      animalName = t.value.slice(0, MAX_NAME);
      syncNameTag();
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
  $('#tool-camera').addEventListener('click', () => void startCamera());
  $('#tool-take').addEventListener('click', () => void takePhoto());
  $('#tool-straighten').addEventListener('click', startStraighten);
  $('#tool-apply').addEventListener('click', () => void applyStraighten());
  $('#tool-reset').addEventListener('click', () => {
    if (!photo) return;
    quad = defaultQuad(photo);
    renderPreview();
  });
  $('#tool-cancel').addEventListener('click', () => {
    endTool();
    afterTool();
  });
  bedArt.addEventListener('pointerdown', (e) => {
    const dot = (e.target as Element).closest<SVGCircleElement>('[data-corner]');
    if (!dot || tool !== 'straighten') return;
    e.preventDefault();
    draggingCorner = Number(dot.dataset.corner);
    dot.setPointerCapture(e.pointerId);
    dot.focus();
  });
  bedArt.addEventListener('pointermove', (e) => {
    if (draggingCorner < 0 || tool !== 'straighten') return;
    const svg = bedArt.querySelector<SVGSVGElement>('svg.straighten');
    const matrix = svg?.getScreenCTM();
    if (!matrix) return;
    const at = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    moveCorner(draggingCorner, at.x, at.y);
  });
  const letGo = (): void => {
    draggingCorner = -1;
  };
  bedArt.addEventListener('pointerup', letGo);
  bedArt.addEventListener('pointercancel', letGo);
  bedArt.addEventListener('keydown', (e) => {
    const dot = (e.target as Element).closest<SVGCircleElement>('[data-corner]');
    if (!dot || tool !== 'straighten' || !quad || !photo) return;
    const step = (Math.max(photo.width, photo.height) / 200) * (e.shiftKey ? 5 : 1);
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = move[e.key];
    if (!delta) return;
    e.preventDefault();
    const i = Number(dot.dataset.corner);
    moveCorner(i, quad[i]![0] + delta[0], quad[i]![1] + delta[1]);
  });
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

  chips.forEach((chip) =>
    chip.addEventListener('click', () => void go(chip.dataset.step as StepId)),
  );
  back.addEventListener('click', () => void go(prevStep(current)));
  next.addEventListener('click', () => {
    if (current === 'print') {
      saveFile();
      return;
    }
    void go(nextStep(current));
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

  // Everyone starts on the drawing pad; the photo and the sample fish stay in the options row.
  openPad();
  render();
}
