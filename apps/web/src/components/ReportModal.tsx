import { useState } from 'react';
import { Flag, X } from 'lucide-react';

interface ReportModalProps {
  targetLabel: string;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}

const REASONS = [
  'Spam atau pesan mengganggu',
  'Pelecehan atau ujaran kebencian',
  'Konten tidak pantas',
  'Penipuan atau akun palsu',
];

export function ReportModal({ targetLabel, onClose, onSubmit }: ReportModalProps) {
  const [selected, setSelected] = useState(REASONS[0]);
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const combined = notes.trim() ? `${selected}: ${notes.trim()}` : selected;
    onSubmit(combined);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-sheet" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Flag size={17} strokeWidth={1.75} color="var(--danger)" />
            <h3>Laporkan {targetLabel}</h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            <X size={17} strokeWidth={1.75} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {REASONS.map((reason) => (
            <label
              key={reason}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 8,
                background: selected === reason ? 'var(--bg-selected)' : 'var(--bg-input)',
                fontSize: 13.5,
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="report-reason"
                checked={selected === reason}
                onChange={() => setSelected(reason)}
              />
              <span>{reason}</span>
            </label>
          ))}
        </div>

        <label className="field-label">
          Catatan tambahan (opsional)
          <input
            className="field-input"
            placeholder="Jelaskan singkat kejadiannya"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <div className="modal-actions">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn-danger">
            Kirim Laporan
          </button>
        </div>
      </form>
    </div>
  );
}
