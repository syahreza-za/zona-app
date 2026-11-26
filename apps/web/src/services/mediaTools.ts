export interface RecordedVoiceNote {
  blob: Blob;
  dataUrl: string;
  durationSec: number;
  waveformPeaks: number[];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Real browser MediaRecorder + Web Audio API analyser that records genuine audio
 * and computes live amplitude peaks for the WhatsApp-style waveform.
 */
export class VoiceNoteRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private chunks: Blob[] = [];
  private peaks: number[] = [];
  private rafId: number | null = null;
  private startedAt = 0;

  async start(onLevel?: (level: number) => void): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      throw new Error('Browser tidak mendukung rekaman mikrofon.');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.peaks = [];
    this.startedAt = Date.now();

    const preferredMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

    this.mediaRecorder = preferredMime
      ? new MediaRecorder(this.stream, { mimeType: preferredMime })
      : new MediaRecorder(this.stream);

    this.mediaRecorder.ondataavailable = (evt) => {
      if (evt.data.size > 0) this.chunks.push(evt.data);
    };
    this.mediaRecorder.start(150);

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtx();
      const source = this.audioCtx.createMediaStreamSource(this.stream);
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const sample = () => {
        analyser.getByteFrequencyData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i += 1) sum += buffer[i];
        const avg = sum / buffer.length;
        const normalized = Math.max(6, Math.min(24, Math.round((avg / 140) * 24)));
        this.peaks.push(normalized);
        onLevel?.(normalized);
        this.rafId = window.requestAnimationFrame(sample);
      };
      this.rafId = window.requestAnimationFrame(sample);
    } catch {
      // Waveform sampling is optional if AudioContext is blocked
    }
  }

  async stop(): Promise<RecordedVoiceNote> {
    const recorder = this.mediaRecorder;
    if (!recorder) {
      throw new Error('Perekaman belum dimulai.');
    }

    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorder.stop();
    });

    this.cleanup();

    const durationSec = Math.max(1, Math.round((Date.now() - this.startedAt) / 1000));
    const sampledPeaks = downsamplePeaks(this.peaks, 16);
    const dataUrl = await blobToDataUrl(blob);

    return {
      blob,
      dataUrl,
      durationSec,
      waveformPeaks: sampledPeaks,
    };
  }

  cancel(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
    this.mediaRecorder = null;
  }
}

function downsamplePeaks(raw: number[], targetCount: number): number[] {
  if (raw.length === 0) {
    return [9, 14, 18, 12, 22, 16, 11, 19, 15, 21, 13, 17, 10, 16, 12, 9];
  }
  const result: number[] = [];
  const step = raw.length / targetCount;
  for (let i = 0; i < targetCount; i += 1) {
    const idx = Math.min(raw.length - 1, Math.floor(i * step));
    result.push(raw[idx]);
  }
  return result;
}

/**
 * Compresses a user-selected image file to lightweight WebP/JPEG (max 1080px).
 */
export async function compressImageFile(file: File, maxDim = 1080): Promise<{ dataUrl: string; blob: Blob }> {
  const bitmapUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = bitmapUrl;
    });
    return compressImageElement(img, img.naturalWidth, img.naturalHeight, maxDim);
  } finally {
    URL.revokeObjectURL(bitmapUrl);
  }
}

export async function captureVideoFrame(
  video: HTMLVideoElement,
  maxDim = 1080
): Promise<{ dataUrl: string; blob: Blob }> {
  return compressImageElement(video, video.videoWidth || 720, video.videoHeight || 960, maxDim);
}

async function compressImageElement(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxDim: number
): Promise<{ dataUrl: string; blob: Blob }> {
  const scale = Math.min(1, maxDim / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas tidak tersedia');
  ctx.drawImage(source, 0, 0, targetW, targetH);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Gagal kompresi gambar'))),
      'image/jpeg',
      0.82
    );
  });

  const dataUrl = await blobToDataUrl(blob);
  return { dataUrl, blob };
}
