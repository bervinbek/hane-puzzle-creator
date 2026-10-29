import type { RgbaImage } from '../core/image/gray';
import type { Vec2 } from '../core/geometry/polygon';
import { createPadGuide } from './padGuide';
import {
  PAD_SIZE,
  PEN_WIDTH,
  addPoint,
  closingSegments,
  smoothStroke,
  type Stroke,
} from './strokes';

const INK = '#1b1b1f';

/**
 * A square pad to draw an animal on with a finger, a pen or the mouse. Strokes are kept as data,
 * so Undo is exact and the picture can be redrawn smoothly. Nothing leaves the device.
 */
export class SketchPad {
  readonly canvas = document.createElement('canvas');
  private readonly ctx: CanvasRenderingContext2D;
  private strokes: Stroke[] = [];
  private active: Stroke | null = null;

  constructor(
    parent: HTMLElement,
    private readonly onChange: () => void,
  ) {
    const canvas = this.canvas;
    canvas.width = PAD_SIZE;
    canvas.height = PAD_SIZE;
    canvas.className = 'pad-canvas';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute(
      'aria-label',
      'Drawing pad. Draw with a finger, a pen or the mouse. It needs a pointer, so without one add a photo or use the sample fish.',
    );
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    parent.append(canvas);
    const guide = createPadGuide(parent);
    canvas.addEventListener('pointerdown', guide.dismiss, { once: true });
    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
    this.redraw();
  }

  hasInk(): boolean {
    return this.strokes.length > 0;
  }

  undo(): void {
    if (this.strokes.pop()) {
      this.redraw();
      this.onChange();
    }
  }

  clear(): void {
    if (this.strokes.length === 0) return;
    this.strokes = [];
    this.redraw();
    this.onChange();
  }

  /** True when the drawing is an open loop that `toImage` closes with a straight line. */
  closesGap(): boolean {
    return closingSegments(this.strokes).length > 0;
  }

  /**
   * The drawing as an image the outline finder can read (black line on white paper). An open loop
   * is closed in this copy only: what the student sees and the strokes stay as they drew them.
   */
  toImage(): RgbaImage {
    const segments = closingSegments(this.strokes);
    if (segments.length === 0) {
      const data = this.ctx.getImageData(0, 0, PAD_SIZE, PAD_SIZE);
      return { width: PAD_SIZE, height: PAD_SIZE, data: data.data };
    }
    const copy = document.createElement('canvas');
    copy.width = PAD_SIZE;
    copy.height = PAD_SIZE;
    const ctx = copy.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(this.canvas, 0, 0);
    ctx.strokeStyle = INK;
    ctx.lineWidth = this.strokes[0]!.width;
    ctx.lineCap = 'round';
    for (const [from, to] of segments) {
      ctx.beginPath();
      ctx.moveTo(from[0], from[1]);
      ctx.lineTo(to[0], to[1]);
      ctx.stroke();
    }
    const data = ctx.getImageData(0, 0, PAD_SIZE, PAD_SIZE);
    return { width: PAD_SIZE, height: PAD_SIZE, data: data.data };
  }

  /** The drawing as a picture address, to show under the traced outline. Revoke when replaced. */
  toUrl(): Promise<string> {
    return new Promise((resolve, reject) =>
      this.canvas.toBlob(
        (blob) => (blob ? resolve(URL.createObjectURL(blob)) : reject(new Error('no picture'))),
        'image/png',
      ),
    );
  }

  private point(e: PointerEvent): Vec2 {
    const box = this.canvas.getBoundingClientRect();
    return [
      ((e.clientX - box.left) / Math.max(1, box.width)) * PAD_SIZE,
      ((e.clientY - box.top) / Math.max(1, box.height)) * PAD_SIZE,
    ];
  }

  private down(e: PointerEvent): void {
    // One pen at a time: a resting palm or a second finger must not draw.
    if (this.active || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    const p = this.point(e);
    this.active = { width: PEN_WIDTH, points: [p] };
    this.dot(p, this.active.width);
  }

  private move(e: PointerEvent): void {
    const stroke = this.active;
    if (!stroke || !e.isPrimary) return;
    e.preventDefault();
    // Fast pens report several positions per frame; using them all keeps curves smooth.
    const events = e.getCoalescedEvents?.() ?? [];
    for (const event of events.length > 0 ? events : [e]) {
      const from = stroke.points[stroke.points.length - 1]!;
      const p = this.point(event);
      if (addPoint(stroke.points, p)) this.segment(from, p, stroke.width);
    }
  }

  private up(e: PointerEvent): void {
    const stroke = this.active;
    if (!stroke || !e.isPrimary) return;
    this.active = null;
    this.strokes.push(stroke);
    // Redraw the finished stroke as one smooth curve.
    this.redraw();
    this.onChange();
  }

  private segment(a: Vec2, b: Vec2, width: number): void {
    const ctx = this.ctx;
    ctx.strokeStyle = INK;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
  }

  private dot(p: Vec2, width: number): void {
    this.ctx.fillStyle = INK;
    this.ctx.beginPath();
    this.ctx.arc(p[0], p[1], width / 2, 0, Math.PI * 2);
    this.ctx.fill();
  }

  private redraw(): void {
    const ctx = this.ctx;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, PAD_SIZE, PAD_SIZE);
    for (const stroke of this.strokes) {
      if (stroke.points.length < 2) {
        this.dot(stroke.points[0]!, stroke.width);
        continue;
      }
      const { start, steps } = smoothStroke(stroke.points);
      ctx.strokeStyle = INK;
      ctx.lineWidth = stroke.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(start[0], start[1]);
      for (const s of steps) ctx.quadraticCurveTo(s.control[0], s.control[1], s.to[0], s.to[1]);
      ctx.stroke();
    }
  }
}
