import { useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, RefreshCw, Sparkles, X } from 'lucide-react';
import { captureVideoFrame, compressImageFile } from '../services/mediaTools';

interface QuickSnapModalProps {
  onClose: () => void;
  onSend: (payload: { caption: string; viewOnce: boolean; mediaUrl?: string }) => void;
}

export function QuickSnapModal({ onClose, onSend }: QuickSnapModalProps) {
  const [caption, setCaption] = useState('');
  const [viewOnce, setViewOnce] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | undefined>(undefined);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraActive(false);
  };

  useEffect(() => {
    return () => stopCamera();
  }, []);

  const handleStartCamera = async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Kamera tidak tersedia di perangkat/browser ini.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      window.requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (err) {
      setCameraError(
        err instanceof Error ? err.message : 'Izin kamera ditolak. Kamu tetap bisa pilih foto dari galeri.'
      );
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current) return;
    setBusy(true);
    try {
      const { dataUrl } = await captureVideoFrame(videoRef.current);
      setPreviewUrl(dataUrl);
      stopCamera();
    } catch {
      setCameraError('Gagal mengambil gambar dari kamera.');
    } finally {
      setBusy(false);
    }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setCameraError(null);
    try {
      const { dataUrl } = await compressImageFile(file);
      setPreviewUrl(dataUrl);
      stopCamera();
    } catch {
      setCameraError('Gagal memproses file foto.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSend({
      caption: caption.trim() || 'Momen spontan • 24 jam',
      viewOnce,
      mediaUrl: previewUrl,
    });
    stopCamera();
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form
        className="modal-sheet"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="map-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} color="var(--accent-yellow)" />
            <h3>Kirim Quick Snap</h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="snap-capture-stage">
          {previewUrl ? (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              <img src={previewUrl} alt="Preview Quick Snap" className="snap-preview-img" />
              <button
                type="button"
                className="pill-action"
                style={{ position: 'absolute', top: 10, right: 10 }}
                onClick={() => setPreviewUrl(undefined)}
              >
                <RefreshCw size={12} /> Ganti
              </button>
            </div>
          ) : cameraActive ? (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              <video ref={videoRef} playsInline muted className="snap-preview-img" />
              <button
                type="button"
                className="shutter-btn"
                onClick={handleCapture}
                disabled={busy}
                aria-label="Ambil Foto"
              />
            </div>
          ) : (
            <div className="snap-empty-picker">
              <button
                type="button"
                className="pill-action primary"
                onClick={handleStartCamera}
              >
                <Camera size={14} /> Buka Kamera
              </button>
              <label className="pill-action" style={{ cursor: 'pointer' }}>
                <ImageIcon size={14} /> Pilih dari Galeri
                <input
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleFilePick}
                />
              </label>
              <span className="channel-meta">
                Foto otomatis dikompresi ringan &amp; kedaluwarsa 24 jam.
              </span>
            </div>
          )}
        </div>

        {cameraError && <div className="inline-error">{cameraError}</div>}

        <label className="field-label">
          Caption Momen
          <input
            className="field-input"
            placeholder="Mis: Kopi susu udah nyampe, buruan!"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </label>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13,
            color: 'var(--text-secondary)',
          }}
        >
          <input
            type="checkbox"
            checked={viewOnce}
            onChange={(e) => setViewOnce(e.target.checked)}
          />
          Aktifkan mode Sekali Lihat (View Once)
        </label>

        <div className="modal-actions">
          <button type="button" className="pill-action" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="pill-action primary" disabled={busy}>
            {busy ? 'Memproses...' : 'Kirim Snap'}
          </button>
        </div>
      </form>
    </div>
  );
}
