import { useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, RefreshCw, X } from 'lucide-react';
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
        throw new Error('Kamera tidak tersedia di perangkat ini.');
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
        err instanceof Error
          ? err.message
          : 'Izin kamera tidak diberikan. Pilih foto dari galeri sebagai alternatif.'
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
      setCameraError('Gagal memproses gambar.');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSend({
      caption: caption.trim() || 'Momen spontan · 24 jam',
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
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Camera size={18} strokeWidth={1.75} color="var(--accent)" />
            <h3>Quick Snap</h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            <X size={17} strokeWidth={1.75} />
          </button>
        </div>

        <div className="snap-stage">
          {previewUrl ? (
            <>
              <img src={previewUrl} alt="Pratinjau foto" className="snap-preview-media" />
              <button
                type="button"
                className="map-glass-pill"
                style={{ position: 'absolute', top: 10, right: 10, height: 32 }}
                onClick={() => setPreviewUrl(undefined)}
              >
                <RefreshCw size={13} strokeWidth={1.75} />
                <span>Ganti</span>
              </button>
            </>
          ) : cameraActive ? (
            <>
              <video ref={videoRef} playsInline muted className="snap-preview-media" />
              <button
                type="button"
                className="shutter-btn"
                onClick={handleCapture}
                disabled={busy}
                aria-label="Ambil foto"
              />
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: 16 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn-primary" onClick={handleStartCamera}>
                  <Camera size={15} strokeWidth={1.75} />
                  <span>Kamera</span>
                </button>
                <label className="btn-secondary" style={{ cursor: 'pointer' }}>
                  <ImageIcon size={15} strokeWidth={1.75} />
                  <span>Galeri</span>
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={handleFilePick}
                  />
                </label>
              </div>
              <span className="meta-text">Foto otomatis hilang setelah 24 jam.</span>
            </div>
          )}
        </div>

        {cameraError && <div className="inline-error">{cameraError}</div>}

        <label className="field-label">
          Keterangan
          <input
            className="field-input"
            placeholder="Tambahkan keterangan singkat"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
          />
        </label>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 13.5,
            color: 'var(--text-secondary)',
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={viewOnce}
            onChange={(e) => setViewOnce(e.target.checked)}
          />
          <span>Sekali lihat (View Once)</span>
        </label>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? 'Memproses...' : 'Kirim'}
          </button>
        </div>
      </form>
    </div>
  );
}
