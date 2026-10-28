/** Live camera for taking a picture of a drawing. Nothing is recorded or sent anywhere. */

export type CameraProblem = 'denied' | 'none' | 'busy' | 'failed';

export class CameraError extends Error {
  constructor(readonly kind: CameraProblem) {
    super(kind);
  }
}

/** The sentence shown for each way the camera can fail. Each points at the photo option instead. */
export function cameraErrorMessage(kind: CameraProblem): string {
  switch (kind) {
    case 'denied':
      return "I can't use the camera. Allow it in your browser, or add a photo instead.";
    case 'none':
      return "I can't find a camera on this device. Add a photo instead.";
    case 'busy':
      return 'The camera is being used by something else. Close it there, or add a photo instead.';
    case 'failed':
      return "The camera didn't start. Try again, or add a photo instead.";
  }
}

/** Sorts the browser's error names into the few things we can tell a child. */
export function cameraProblemFor(error: unknown): CameraProblem {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'none';
  if (name === 'NotReadableError' || name === 'AbortError') return 'busy';
  return 'failed';
}

/** True when this page can ask for a camera (not on plain http, and not in very old browsers). */
export function cameraSupported(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

/** Longest side of a captured picture. Plenty to trace from, and it is made smaller again later. */
const CAPTURE_MAX_SIDE = 1600;

export class CameraSession {
  private stream: MediaStream | null = null;

  constructor(private readonly video: HTMLVideoElement) {}

  /** Starts the camera (the back one on a tablet or phone) and shows it in the video element. */
  async start(): Promise<void> {
    if (!cameraSupported()) throw new CameraError('none');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play();
    } catch (e) {
      this.stop();
      throw new CameraError(cameraProblemFor(e));
    }
  }

  /** The picture the camera sees right now, as a JPEG file ready for the photo path. */
  capture(): Promise<File> {
    const { videoWidth: w, videoHeight: h } = this.video;
    if (!w || !h) return Promise.reject(new CameraError('failed'));
    const scale = Math.min(1, CAPTURE_MAX_SIDE / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    canvas.getContext('2d')!.drawImage(this.video, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(new File([blob], 'camera.jpg', { type: 'image/jpeg' }))
            : reject(new CameraError('failed')),
        'image/jpeg',
        0.92,
      ),
    );
  }

  /** Turns the camera off (its light goes out). Safe to call more than once. */
  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
  }
}
