import {
  DEFAULT_TIDY,
  OutlineExtractor,
  type CloseGaps,
  type OutlineResult,
  type TidyParams,
} from '../core/outline';
import { MAX_BATCH, batchZip } from '../core/export/batch';
import { piecesZip, puzzleStl, safeName } from '../core/export/bundle';
import {
  MAX_PROJECT_BYTES,
  parseProject,
  projectErrorMessage,
  serializeProject,
  type Project,
} from '../core/project';
import { A1_MINI, PUZZLE_THICKNESS_MM, usablePlateSize } from '../core/printer/a1mini';
import { pointInPolygon, type Vec2 } from '../core/geometry/polygon';
import { isUsableQuad, straighten, type Quad } from '../core/image/perspective';
import { greedyColouring } from '../core/puzzle/colouring';
import { couponInstructions, toleranceStl } from '../core/puzzle/coupon';
import {
  CLEARANCE_MM,
  SIZE_MM,
  RELIEF_AMOUNTS,
  TAB_AMOUNTS,
  reliefFor,
  teacherParams,
  type ReliefAmount,
  type TabAmount,
  type TeacherSettings,
} from '../core/puzzle/settings';
import { formatDuration, printReport } from '../core/puzzle/report';
import { applyComfort, loadComfort, saveComfort, type Comfort, type TextSize } from './comfort';
import { downloadBytes } from './download';
import type { Puzzle } from '../core/puzzle/generate';
import type { SimSpeed, SimStatus } from '../render/simulation';
import type { PuzzleViewer } from '../render/viewer';
import { PhotoError, imageToUrl, loadPhoto, photoErrorMessage, type LoadedPhoto } from './photo';
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
  PASTELS,
  getPuzzle,
  makeShape,
  photoSvg,
  sampleFishShape,
  piecePaths,
  previewWidthMm,
  shapeSvg,
  sizedShape,
  type PreviewMode,
  type PuzzleShape,
} from './puzzlePreview';
import { loadBatch, saveBatch } from './batch';
import { CameraError, CameraSession, cameraErrorMessage, cameraSupported } from './camera';
import { SketchPad } from './sketchPad';
import {
  DEFAULT_FILE_NAME,
  DEFAULT_PREFS,
  cleanFileName,
  loadTeacher,
  saveTeacher,
  teacherIsOn,
  type TeacherPrefs,
} from './teacher';
import { STEPS, canVisit, nextStep, prevStep, stepIndex, type StepId } from './steps';
import type { PenSize } from './strokes';

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
  folder: '<path d="M3 7h6l2 2h10v10H3z"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  replay: '<path d="M4 12a8 8 0 1 0 3-6.2M4 4v4h4"/>',
  sliders:
    '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
};

type Source = 'none' | 'sample' | 'photo' | 'draw' | 'project';

/** Layers in a whole print: 3 mm of plastic at 0.2 mm a layer. */
const SIM_LAYERS = Math.round(PUZZLE_THICKNESS_MM / A1_MINI.layerHeight);
const IDLE_SIM: SimStatus = {
  active: false,
  playing: false,
  layer: SIM_LAYERS,
  layers: SIM_LAYERS,
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
  /** A sentence to show once, the next time the Puzzle step is drawn (e.g. after opening a project). */
  let pendingNotice = '';
  let pad: SketchPad | null = null;
  /** A picture tool that is open: the live camera, or the four corners for straightening a photo. */
  let tool: 'camera' | 'straighten' | null = null;
  let camera: CameraSession | null = null;
  let quad: Quad | null = null;
  let draggingCorner = -1;
  let pen: PenSize = 'medium';
  let shape: PuzzleShape | null = null;
  let photo: LoadedPhoto | null = null;
  let extractor: OutlineExtractor | null = null;
  let result: OutlineResult | null = null;
  let tidy: TidyParams = { ...DEFAULT_TIDY };
  let pieces = DEFAULT_PIECES;
  let team: TeamId = 'yellow';
  let seed = 1;
  let view: 'flat' | '3d' = 'flat';
  let viewer: PuzzleViewer | null = null;
  let viewerLoading: Promise<PuzzleViewer | null> | null = null;
  let shownPuzzle: Puzzle | null = null;
  let simStatus: SimStatus = IDLE_SIM;
  let simShown = false;
  let autoplay = false;
  let comfort: Comfort = loadComfort();
  let teacher: TeacherPrefs = loadTeacher();
  /** Puzzles collected for a class, to download together. Kept in this tab. */
  let batch: Project[] = loadBatch();
  /** Cut points the user moved, in the drawing's own millimetres; null while the cuts are automatic. */
  let customSeeds: Vec2[] | null = null;
  /** True while the cut points can be dragged. */
  let steering = false;
  let draggingSeed = -1;
  let steerFrame = 0;
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
        <button type="button" class="btn btn-glass btn-compact" id="project-open" aria-haspopup="dialog" title="Save or open a project">
          ${icon(ICON.folder)} <span class="btn-label">Project</span>
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
          <div class="segmented view-toggle" id="view-toggle" role="radiogroup" aria-label="How to look at your puzzle" hidden>
            <label class="seg"><input type="radio" name="view" value="flat" checked><span>Flat</span></label>
            <label class="seg"><input type="radio" name="view" value="3d"><span>3D</span></label>
          </div>
          <div class="bed-art" id="bed-art"></div>
          <p class="bed-note" id="bed-note"></p>
          <span class="bed-label" id="bed-label"></span>
          <button type="button" class="btn btn-primary small watch" id="watch" hidden>
            ${icon(ICON.play)} Watch it print
          </button>
          <span class="sim-note" id="sim-note" hidden>Illustrative preview</span>
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
          <button type="button" class="btn btn-glass" id="steer">${icon(ICON.dots)} Move the cut points</button>
          <button type="button" class="btn btn-primary" id="steer-done">Done moving</button>
          <button type="button" class="btn btn-glass" id="steer-reset">Automatic cuts</button>
          <button type="button" class="btn btn-glass" id="shuffle">
            ${icon(ICON.shuffle)} Shuffle the cuts
          </button>
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
            <label class="pull" id="pull">Pull apart
              <input type="range" id="explode" class="slider" min="0" max="100" step="1" value="0">
            </label>
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

    <input type="file" id="project-file" accept=".json,application/json" hidden>

    <dialog id="project-dialog" class="dialog dialog-tall glass" aria-labelledby="project-title">
      <form method="dialog">
        <h2 id="project-title">Your project</h2>
        <p class="hint">Save your puzzle to a file and open it again later. The file keeps the shape, the number of pieces, the cut and the team colour. Your photo or drawing is not saved.</p>
        <button type="button" class="btn btn-glass wide" id="project-save">${icon(ICON.box)} Save my project</button>
        <button type="button" class="btn btn-glass wide" id="project-load">${icon(ICON.folder)} Open a saved project</button>
        <p class="notice" id="project-notice" role="status"></p>
        <section class="batch" aria-labelledby="batch-title">
          <h3 id="batch-title" class="field-title">Class batch</h3>
          <p class="field-note">Add each team's puzzle, then download them all in one zip. Kept until you close this tab.</p>
          <button type="button" class="btn btn-glass wide" id="batch-add">Add this puzzle to the batch</button>
          <ul class="batch-list" id="batch-list"></ul>
          <p class="field-note" id="batch-status" role="status"></p>
          <div class="pad-buttons">
            <button type="button" class="btn btn-glass" id="batch-zip">Download (.zip)</button>
            <button type="button" class="btn btn-glass" id="batch-clear">Clear batch</button>
          </div>
        </section>
        <div class="dialog-actions dialog-actions-one">
          <button class="btn btn-primary" value="done">Done</button>
        </div>
      </form>
    </dialog>

    <dialog id="teacher-dialog" class="dialog dialog-tall glass" aria-labelledby="teacher-title">
      <form method="dialog">
        <h2 id="teacher-title">Teacher options</h2>
        <p class="hint">For printing. Children do not need these. They stay on this device and are saved in a project file.</p>
        <div class="slider-row">
          <label for="t-gap">Gap between pieces: <output id="t-gap-out"></output></label>
          <input type="range" id="t-gap" class="slider" min="${CLEARANCE_MM.min}" max="${CLEARANCE_MM.max}" step="${CLEARANCE_MM.step}">
          <small class="field-note">A bigger gap makes pieces easier to put together. Print one test first.</small>
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
          <label for="t-name">File name</label>
          <input type="text" id="t-name" class="field-input" maxlength="40" autocomplete="off" spellcheck="false">
          <small class="field-note" id="t-name-note"></small>
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
  const cameraEl = $<HTMLVideoElement>('#camera');
  const pictureTools = $('#picture-tools');
  const viewToggle = $('#view-toggle');
  const viewControls = $('#view-controls');
  const explodeSlider = $<HTMLInputElement>('#explode');
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
  const projectDialog = $<HTMLDialogElement>('#project-dialog');
  const projectFile = $<HTMLInputElement>('#project-file');
  const projectNotice = $('#project-notice');
  const projectSave = $<HTMLButtonElement>('#project-save');
  const teacherDialog = $<HTMLDialogElement>('#teacher-dialog');
  const teacherButton = $<HTMLButtonElement>('#teacher-open');
  const tGap = $<HTMLInputElement>('#t-gap');
  const tSize = $<HTMLInputElement>('#t-size');
  const tSeed = $<HTMLInputElement>('#t-seed');
  const tName = $<HTMLInputElement>('#t-name');
  const calm = $<HTMLInputElement>('#calm');
  const motion = $<HTMLInputElement>('#motion');
  const sizes = root.querySelectorAll<HTMLInputElement>('#text-size input');

  const teamName = (): string => TEAMS.find((t) => t.id === team)?.name ?? '';
  const teamHex = (): string => TEAMS.find((t) => t.id === team)?.hex ?? '#ffc93c';
  const hasDrawing = (): boolean => shape !== null && !drawing && tool === null;
  const teacherSettings = (): TeacherSettings => ({
    clearance: teacher.clearance,
    tabAmount: teacher.tabAmount,
    maxSizeMm: teacher.maxSizeMm,
    relief: teacher.relief,
  });
  /** The drawing at the size the teacher allows (a smaller copy when it is too big). */
  const shown = (): PuzzleShape | null => (shape ? sizedShape(shape, teacher.maxSizeMm) : null);
  /** The user's cut points at the size the drawing is shown. */
  const scaledSeeds = (s: PuzzleShape): Vec2[] | undefined =>
    customSeeds?.map(([x, y]): Vec2 => [x * s.scale, y * s.scale]);
  const currentPuzzle = (): Puzzle | null => {
    const s = shown();
    return s ? getPuzzle(s, pieces, seed, teacher, scaledSeeds(s)) : null;
  };
  const traced = (): boolean => source === 'photo' || source === 'draw';

  function setNotice(text: string): void {
    const el = panel.querySelector<HTMLElement>('#notice');
    if (el) el.textContent = text;
  }

  function padTools(): string {
    const sizes: readonly PenSize[] = ['thin', 'medium', 'thick'];
    return `
      <div class="pad-tools">
        <fieldset class="field">
          <legend class="label">Pen</legend>
          <div class="segmented">
            ${sizes
              .map(
                (p) =>
                  `<label class="seg"><input type="radio" name="pen" value="${p}"${p === pen ? ' checked' : ''}><span>${p[0]!.toUpperCase()}${p.slice(1)}</span></label>`,
              )
              .join('')}
          </div>
        </fieldset>
        <div class="pad-buttons">
          <button type="button" class="btn btn-glass" data-action="undo" id="pad-undo">Undo</button>
          <button type="button" class="btn btn-glass" data-action="clear" id="pad-clear">Clear</button>
        </div>
        <button type="button" class="btn btn-primary wide" data-action="use-drawing">Use my drawing</button>
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
    const puzzle = currentPuzzle();
    const report = puzzle ? printReport(puzzle) : null;
    const todo = [
      ['Download the file', 'It is made for the 3D printer.'],
      ['Your teacher prints it', 'Open it in Bambu Studio.'],
      ['Put the puzzle together', 'Look for the tabs that fit.'],
    ];
    const stats = report
      ? `
      <ul class="stats">
        <li><span>Pieces</span><strong>${report.pieceCount}</strong></li>
        <li><span>Size</span><strong>${cm(report.widthMm)} × ${cm(report.heightMm)} cm</strong></li>
        <li><span>Plastic</span><strong>up to ${Math.round(report.gramsAtMost)} g</strong></li>
        <li><span>Print time</span><strong>${formatDuration(report.minutes)}</strong></li>
      </ul>
      <p class="hint small team-note">These are estimates. Bambu Studio shows the exact time.</p>`
      : '';
    return `
      ${stats}
      <ol class="todo">
        ${todo.map(([t, s]) => `<li><strong>${t}</strong><small>${s}</small></li>`).join('')}
      </ol>
      <button type="button" class="btn btn-glass wide" data-action="zip">
        ${icon(ICON.box)} Download each piece (.zip)
      </button>`;
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
    if (source === 'project') {
      setNotice('Opened your project. Press Next to carry on.');
    } else if (source === 'sample') {
      setNotice('Nice choice! Press Next to cut it into pieces.');
    } else if (traced() && result) {
      if (result.ok) {
        setNotice(
          result.closeRadius > 0 && tidy.closeGaps === 'auto'
            ? 'Found your animal! I closed a gap in the line. Press Next if the blue line looks right.'
            : 'Found your animal! Press Next if the blue line looks right.',
        );
      } else if (result.problem === 'open') {
        setNotice(
          tidy.closeGaps === 'auto'
            ? source === 'draw'
              ? "The line has a gap I can't close. Tap Draw on screen and join the line up."
              : "The line has a gap I can't close. Draw over the gap with a pen and take the photo again."
            : 'The line has a gap. Try Gaps: Auto, or Big.',
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
    if (pendingNotice) {
      setNotice(pendingNotice);
      pendingNotice = '';
      return;
    }
    const puzzle = currentPuzzle();
    if (puzzle && puzzle.pieces.length < pieces) {
      setNotice(`Only ${puzzle.pieces.length} pieces fit this shape. Try fewer pieces.`);
    } else if (pieces > MANY_PIECES) {
      setNotice('That is a lot of small pieces. They are harder to print and to hold.');
    } else {
      setNotice('');
    }
  }

  /** Pastel colours by piece in the puzzle step; the team's plastic colour in the print step. */
  function pieceColours(puzzle: Puzzle): string[] {
    if (current === 'print') return puzzle.pieces.map(() => teamHex());
    const palette = greedyColouring(puzzle.neighbours, PASTELS.length);
    return puzzle.pieces.map((_, i) => PASTELS[palette[i] ?? 0]!);
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
        viewer.simSetSpeed(chosenSpeed());
        return viewer;
      } catch {
        view = 'flat';
        autoplay = false;
        viewerLoading = null;
        root.querySelector<HTMLInputElement>('input[name="view"][value="flat"]')!.checked = true;
        renderPreview();
        setNotice("3D view isn't available on this device. The flat view still works.");
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
      if (!v || view !== '3d' || current === 'sketch') {
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
        explodeSlider.value = '0';
        v.simPlay();
      }
    });
  }

  function renderPreview(): void {
    const wants3d = view === '3d' && current !== 'sketch' && shape !== null;
    card.dataset.view = wants3d ? '3d' : 'flat';
    const toolsOn = current === 'sketch' && !drawing;
    const showTool = (id: string, on: boolean): void => {
      $(id).hidden = !on;
    };
    showTool('#tool-camera', toolsOn && tool === null && cameraSupported());
    showTool('#tool-straighten', toolsOn && tool === null && source === 'photo' && photo !== null);
    showTool('#tool-take', toolsOn && tool === 'camera');
    showTool('#tool-apply', toolsOn && tool === 'straighten');
    showTool('#tool-reset', toolsOn && tool === 'straighten');
    showTool('#tool-cancel', toolsOn && tool !== null);
    const anyTool = [...pictureTools.children].some((b) => !(b as HTMLElement).hidden);
    pictureTools.hidden = !anyTool;
    stage.dataset.tools = String(anyTool);
    $('#preview-actions').hidden =
      current === 'sketch' ? !anyTool : current !== 'puzzle' && !wants3d;
    // The cut points can only be moved on the flat picture of the Puzzle step.
    const onFlatPuzzle = current === 'puzzle' && !wants3d && shape !== null;
    if (!onFlatPuzzle) steering = false;
    $('#shuffle').hidden = current !== 'puzzle' || steering;
    $('#steer').hidden = !onFlatPuzzle || steering;
    $('#steer-done').hidden = !(onFlatPuzzle && steering);
    $('#steer-reset').hidden = !(onFlatPuzzle && steering);
    viewToggle.hidden = current === 'sketch' || shape === null;
    viewControls.hidden = !wants3d;
    const watching = current === 'print' && wants3d;
    $('#sim-controls').hidden = !watching;
    $('#sim-note').hidden = !watching;
    $('#pull').hidden = current === 'print';
    $('#watch').hidden = !(current === 'print' && !wants3d && shape !== null);
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
    bedLabel.hidden = wants3d || padOpen || cameraOpen || tool === 'straighten';

    let art = '';
    if (current === 'sketch') {
      if (tool === 'straighten' && photo && quad) {
        art = straightenSvg(photo, quad);
      } else if (traced() && photo) {
        art = photoSvg(photo.url, photo.width, photo.height, result?.ok ? result.outlinePx : null);
      } else if ((source === 'sample' || source === 'project') && shape) {
        art = shapeSvg(shown()!, 'outline', pieces, seed, teamHex(), teacher);
      }
    } else if (shape && !wants3d) {
      const mode: PreviewMode = current === 'puzzle' ? 'pieces' : 'print';
      const here = shown()!;
      const handles =
        steering && mode === 'pieces'
          ? { radius: (22 * previewWidthMm(here)) / (bedArt.getBoundingClientRect().width || 400) }
          : undefined;
      art = shapeSvg(here, mode, pieces, seed, teamHex(), teacher, scaledSeeds(here), handles);
    }
    bedArt.innerHTML = art;
    bedTag.hidden = current === 'sketch';
    bedTag.innerHTML = `<i style="background:${teamHex()}"></i><span>${teamName()} team</span>`;
    bedLabel.textContent = shape
      ? `Your puzzle: ${cm(shown()!.widthMm)} × ${cm(shown()!.heightMm)} cm`
      : `Fits the printer · up to ${Math.round(usablePlateSize() / 10)} cm wide`;
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
      chip.setAttribute('aria-disabled', String(!canVisit(id, hasDrawing())));
    });
    back.disabled = current === 'sketch';
    next.textContent = step.nextLabel;
    const blocked = !canVisit(nextStep(current), hasDrawing());
    next.setAttribute('aria-disabled', String(blocked));
    nextHelp.textContent = blocked
      ? tool
        ? 'Finish the picture to continue'
        : drawing
          ? 'Press Use my drawing to continue'
          : 'Pick a drawing to continue'
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
    customSeeds = null;
    steering = false;
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
    customSeeds = null;
    steering = false;
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

  // ---- Moving the cut points -----------------------------------------------------------------

  /** A different number of pieces means the moved cut points no longer fit: back to automatic. */
  function piecesChanged(): void {
    if (!customSeeds || customSeeds.length === pieces) return;
    customSeeds = null;
    steering = false;
    pendingNotice = 'The cut points went back to automatic because the number of pieces changed.';
  }

  function startSteering(): void {
    const puzzle = currentPuzzle();
    const s = shown();
    if (!puzzle || !s) return;
    // Start from the cut points the automatic cut used, so nothing jumps.
    customSeeds ??= puzzle.seeds.map(([x, y]): Vec2 => [x / s.scale, y / s.scale]);
    pieces = customSeeds.length;
    steering = true;
    pendingNotice =
      'Drag the dots to move the cuts, or use the arrow keys. Press Done moving when you like it.';
    renderPuzzleStep();
    root.querySelector<HTMLElement>('.cut-dot')?.focus();
  }

  function stopSteering(note = ''): void {
    steering = false;
    pendingNotice = note;
    renderPuzzleStep();
    $('#steer').focus();
  }

  /** Redraws the panel and the picture after the steering state changed. */
  function renderPuzzleStep(): void {
    syncPuzzleControls();
    renderPreview();
  }

  /** Puts one cut point at a new place (in the size the drawing is shown), if that is inside the shape. */
  function moveSeed(i: number, x: number, y: number): void {
    const s = shown();
    if (!s || !customSeeds || !customSeeds[i]) return;
    if (!pointInPolygon(x, y, s.points)) return;
    customSeeds = customSeeds.map((c, k): Vec2 => (k === i ? [x / s.scale, y / s.scale] : c));
    const dot = bedArt.querySelector(`[data-seed="${i}"]`);
    dot?.setAttribute('cx', x.toFixed(2));
    dot?.setAttribute('cy', y.toFixed(2));
    // Cutting takes a moment, so keep up with the finger and cut once per frame.
    if (steerFrame) return;
    steerFrame = requestAnimationFrame(() => {
      steerFrame = 0;
      const puzzle = currentPuzzle();
      const group = bedArt.querySelector('.cut-pieces');
      if (puzzle && group) {
        group.innerHTML = piecePaths(puzzle, 'pieces', teamHex());
        showPuzzleNotice();
      }
    });
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
      renderPreview();
    });
    pad.setPen(pen);
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

  /** Turns the drawing into an outline, exactly as a photo would be. */
  async function useDrawing(): Promise<void> {
    if (!pad?.hasInk()) {
      setNotice('Draw your animal first. Use a finger, a pen or the mouse.');
      return;
    }
    setNotice('Looking at your drawing…');
    try {
      const image = pad.toImage();
      const url = await pad.toUrl();
      dropPhoto();
      photo = { image, url, width: image.width, height: image.height };
      extractor = new OutlineExtractor(image);
      tidy = { ...DEFAULT_TIDY };
      source = 'draw';
      drawing = false;
      renderPanel();
      runTidy();
      panel.querySelector<HTMLElement>('[data-action="draw"]')?.focus();
    } catch {
      setNotice("I couldn't read the drawing. Press Clear and try again.");
    }
  }

  // ---- Saving and opening a project ----------------------------------------------------------

  function currentProject(): Project | null {
    if (!shape) return null;
    return {
      outline: [...shape.points],
      ...(shape.eye ? { eye: shape.eye } : {}),
      pieces,
      seed,
      team,
      settings: teacherSettings(),
      ...(customSeeds ? { seeds: customSeeds } : {}),
    };
  }

  const batchList = $('#batch-list');
  const batchStatus = $('#batch-status');
  const batchZipButton = $<HTMLButtonElement>('#batch-zip');
  const batchClearButton = $<HTMLButtonElement>('#batch-clear');
  const batchAddButton = $<HTMLButtonElement>('#batch-add');

  /** The list of collected puzzles, and which buttons make sense. */
  function renderBatch(): void {
    batchList.innerHTML = batch
      .map((p, i) => {
        const t = TEAMS.find((x) => x.id === p.team);
        const name = t ? `${t.name} team` : 'A team';
        return `<li><i class="dot" style="background:${t?.hex ?? '#cccccc'}"></i><span>${name} · ${p.pieces} pieces</span><button type="button" class="btn btn-glass small" data-remove="${i}" aria-label="Remove ${name}, ${p.pieces} pieces, from the batch">Remove</button></li>`;
      })
      .join('');
    const empty = batch.length === 0;
    batchZipButton.setAttribute('aria-disabled', String(empty));
    batchClearButton.setAttribute('aria-disabled', String(empty));
    batchZipButton.textContent = empty
      ? 'Download (.zip)'
      : `Download ${batch.length} puzzle${batch.length === 1 ? '' : 's'} (.zip)`;
  }

  function addToBatch(): void {
    const project = currentProject();
    const puzzle = currentPuzzle();
    if (!project || !puzzle) {
      batchStatus.textContent = 'Pick a drawing first, then you can add it.';
    } else if (!puzzle.ok) {
      batchStatus.textContent =
        'This cut has a problem. Close this, press Shuffle the cuts, and try again.';
    } else if (batch.length >= MAX_BATCH) {
      batchStatus.textContent = `A batch holds up to ${MAX_BATCH} puzzles.`;
    } else {
      batch = [...batch, project];
      saveBatch(batch);
      renderBatch();
      batchStatus.textContent = `Added ${teamName()} team, ${pieces} pieces. The batch has ${batch.length}.`;
    }
  }

  async function downloadBatch(): Promise<void> {
    if (batch.length === 0) return;
    batchStatus.textContent = 'Making the zip…';
    // Let that sentence show before the page is busy cutting every puzzle.
    await new Promise((resolve) => setTimeout(resolve, 30));
    const result = batchZip(batch, teacher.fileName);
    if (result.included.length === 0) {
      batchStatus.textContent =
        'None of these puzzles can be printed. Remove them and add them again.';
      return;
    }
    const name = `${teacher.fileName}-batch.zip`;
    downloadBytes(result.bytes, name, 'application/zip');
    const left =
      result.skipped.length > 0
        ? ` Left out: ${result.skipped.map((x) => x.name).join(', ')}.`
        : '';
    batchStatus.textContent = `Saved ${name} with ${result.included.length} puzzle${result.included.length === 1 ? '' : 's'}.${left}`;
  }

  batchAddButton.addEventListener('click', addToBatch);
  batchZipButton.addEventListener('click', () => {
    if (batchZipButton.getAttribute('aria-disabled') !== 'true') void downloadBatch();
  });
  batchClearButton.addEventListener('click', () => {
    if (batchClearButton.getAttribute('aria-disabled') === 'true') return;
    batch = [];
    saveBatch(batch);
    renderBatch();
    batchStatus.textContent = 'The batch is empty.';
  });
  batchList.addEventListener('click', (e) => {
    const remove = (e.target as HTMLElement).closest<HTMLElement>('[data-remove]');
    if (!remove) return;
    batch = batch.filter((_, i) => i !== Number(remove.dataset.remove));
    saveBatch(batch);
    renderBatch();
    batchStatus.textContent = `Removed. The batch has ${batch.length}.`;
    batchAddButton.focus();
  });
  renderBatch();

  function syncProjectDialog(): void {
    batchStatus.textContent = '';
    projectSave.setAttribute('aria-disabled', String(shape === null));
    projectNotice.textContent = shape ? '' : 'Pick a drawing first, then you can save it.';
  }

  function saveProject(): void {
    const project = currentProject();
    if (!project) {
      projectNotice.textContent = 'Pick a drawing first, then you can save it.';
      return;
    }
    const name = `${safeName([
      teacher.fileName === DEFAULT_FILE_NAME ? 'hane-project' : teacher.fileName,
      teamName(),
      pieces,
      'pieces',
    ])}.json`;
    downloadBytes(new TextEncoder().encode(serializeProject(project)), name, 'application/json');
    projectNotice.textContent = `Saved ${name}. Keep it somewhere you can find it.`;
  }

  /** Puts a loaded project in place of whatever was there, and shows the Puzzle step. */
  function applyProject(project: Project): void {
    dropPhoto();
    drawing = false;
    source = 'project';
    shape = makeShape(project.outline, project.eye);
    pieces = clampPieces(project.pieces);
    seed = project.seed;
    steering = false;
    customSeeds = project.seeds && project.seeds.length === pieces ? project.seeds : null;
    const known = TEAMS.find((t) => t.id === project.team);
    if (known) team = known.id;
    teacher = { ...teacher, ...project.settings };
    saveTeacher(teacher);
    syncTeacherChrome();
    current = 'puzzle';
    pendingNotice = `Opened your project: ${teamName()} team, ${pieces} pieces.`;
    projectDialog.close();
    render(true);
  }

  async function openProject(file: File): Promise<void> {
    if (file.size > MAX_PROJECT_BYTES) {
      projectNotice.textContent = projectErrorMessage('too-large');
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      projectNotice.textContent = projectErrorMessage('damaged');
      return;
    }
    const result = parseProject(text);
    if (result.ok) applyProject(result.project);
    else projectNotice.textContent = projectErrorMessage(result.problem);
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
  function saveFile(kind: 'stl' | 'zip'): void {
    const puzzle = currentPuzzle();
    if (!puzzle) return;
    if (!puzzle.ok) {
      setNotice('Something is wrong with this cut. Go back and press Shuffle the cuts.');
      return;
    }
    const base = safeName([teacher.fileName, teamName(), puzzle.pieces.length, 'pieces']);
    if (kind === 'stl') {
      downloadBytes(puzzleStl(puzzle, undefined, reliefFor(teacher)), `${base}.stl`, 'model/stl');
      setNotice(`Saved ${base}.stl. Give it to your teacher to print.`);
    } else {
      downloadBytes(
        piecesZip(puzzle, base, undefined, reliefFor(teacher)),
        `${base}.zip`,
        'application/zip',
      );
      setNotice(`Saved ${base}.zip with one file for each piece.`);
    }
  }

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
      case 'undo':
      case 'clear':
        if (target.getAttribute('aria-disabled') === 'true') break;
        if (target.dataset.action === 'undo') pad?.undo();
        else pad?.clear();
        break;
      case 'use-drawing':
        void useDrawing();
        break;
      case 'zip':
        saveFile('zip');
        break;
      case 'less':
      case 'more':
        pieces = clampPieces(pieces + (target.dataset.action === 'more' ? 1 : -1));
        piecesChanged();
        syncPuzzleControls();
        schedulePreview();
        break;
    }
  });

  $('#shuffle').addEventListener('click', () => {
    seed += 1;
    customSeeds = null;
    steering = false;
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
      piecesChanged();
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
    if (t.name === 'pen') {
      pen = t.value as PenSize;
      pad?.setPen(pen);
      return;
    }
    if (t.name === 'gaps') {
      tidy = { ...tidy, closeGaps: t.value as CloseGaps };
      scheduleTidy();
      return;
    }
    if (t.name === 'level') {
      pieces = DIFFICULTIES.find((d) => d.id === t.value)?.pieces ?? pieces;
      piecesChanged();
    } else if (t.name === 'team') {
      team = t.value as TeamId;
    } else return;
    syncPuzzleControls();
    schedulePreview();
  });

  viewToggle.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name !== 'view') return;
    view = t.value === '3d' ? '3d' : 'flat';
    renderPreview();
  });
  explodeSlider.addEventListener('input', () =>
    viewer?.setExplode(Number(explodeSlider.value) / 100),
  );
  $('#steer').addEventListener('click', startSteering);
  $('#steer-done').addEventListener('click', () => stopSteering());
  $('#steer-reset').addEventListener('click', () => {
    customSeeds = null;
    stopSteering('The cuts are automatic again.');
  });
  bedArt.addEventListener('pointerdown', (e) => {
    const dot = (e.target as Element).closest<SVGCircleElement>('[data-seed]');
    if (!dot || !steering) return;
    e.preventDefault();
    draggingSeed = Number(dot.dataset.seed);
    dot.setPointerCapture(e.pointerId);
    dot.focus();
  });
  bedArt.addEventListener('pointermove', (e) => {
    if (draggingSeed < 0 || !steering) return;
    const dot = bedArt.querySelector<SVGCircleElement>(`[data-seed="${draggingSeed}"]`);
    const matrix = dot?.getScreenCTM();
    if (!matrix) return;
    const at = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
    moveSeed(draggingSeed, at.x, at.y);
  });
  const dropSeed = (): void => {
    draggingSeed = -1;
  };
  bedArt.addEventListener('pointerup', dropSeed);
  bedArt.addEventListener('pointercancel', dropSeed);
  bedArt.addEventListener('keydown', (e) => {
    const dot = (e.target as Element).closest<SVGCircleElement>('[data-seed]');
    const s = shown();
    if (!dot || !steering || !customSeeds || !s) return;
    const step = e.shiftKey ? 5 : 1;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, step],
      ArrowDown: [0, -step],
    };
    const delta = move[e.key];
    if (!delta) return;
    e.preventDefault();
    const i = Number(dot.dataset.seed);
    const at = customSeeds[i]!;
    moveSeed(i, at[0] * s.scale + delta[0], at[1] * s.scale + delta[1]);
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
  $('#watch').addEventListener('click', () => {
    autoplay = true;
    view = '3d';
    root.querySelector<HTMLInputElement>('input[name="view"][value="3d"]')!.checked = true;
    renderPreview();
  });
  simPlay.addEventListener('click', () => {
    if (!viewer) return;
    if (simStatus.playing) {
      viewer.simPause();
    } else {
      explodeSlider.value = '0';
      viewer.simPlay();
    }
  });
  simLayer.addEventListener('input', () => {
    explodeSlider.value = '0';
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
      saveFile('stl');
      return;
    }
    go(nextStep(current));
  });

  $('#project-open').addEventListener('click', () => {
    syncProjectDialog();
    projectDialog.showModal();
  });
  projectSave.addEventListener('click', saveProject);
  $('#project-load').addEventListener('click', () => projectFile.click());
  projectFile.addEventListener('change', () => {
    const file = projectFile.files?.[0];
    projectFile.value = '';
    if (file) void openProject(file);
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
    tSize.value = String(teacher.maxSizeMm / 10);
    $('#t-size-out').textContent = `${cm(teacher.maxSizeMm)} cm`;
    tSeed.value = String(seed);
    tName.value = teacher.fileName === DEFAULT_FILE_NAME ? '' : teacher.fileName;
    tName.placeholder = DEFAULT_FILE_NAME;
    $('#t-name-note').textContent =
      `Files are named like ${teacher.fileName}-${team}-${pieces}-pieces.stl.`;
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
  tName.addEventListener('input', () => {
    // Typing is left alone; the cleaned name is used for the files and shown in the note.
    teacher = {
      ...teacher,
      fileName: tName.value.trim() === '' ? DEFAULT_FILE_NAME : cleanFileName(tName.value),
    };
    saveTeacher(teacher);
    syncTeacherChrome();
    $('#t-name-note').textContent =
      `Files are named like ${teacher.fileName}-${team}-${pieces}-pieces.stl.`;
  });
  tName.addEventListener('change', () => syncTeacherDialog());
  $('#t-coupon').addEventListener('click', () => {
    const name = `${teacher.fileName}-gap-test.stl`;
    downloadBytes(toleranceStl(teacherParams(teacher).tabs, reliefFor(teacher)), name, 'model/stl');
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

  render();
}
