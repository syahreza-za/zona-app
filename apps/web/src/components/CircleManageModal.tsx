import { useState } from 'react';
import { Link2, PlusCircle, Users, X } from 'lucide-react';
import { useZonaStore } from '@zona/shared';

interface CircleManageModalProps {
  onClose: () => void;
  onNotify: (msg: string) => void;
}

export function CircleManageModal({ onClose, onNotify }: CircleManageModalProps) {
  const createCircle = useZonaStore((s) => s.createCircle);
  const joinCircleByCode = useZonaStore((s) => s.joinCircleByCode);

  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [shortCode, setShortCode] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const circle = createCircle(name, shortCode);
    onNotify(`Circle "${circle.name}" dibuat! Kode undangan: ${circle.inviteCode}`);
    onClose();
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = joinCircleByCode(inviteCode);
    if (!res.ok) {
      setError(res.error ?? 'Gagal bergabung ke Circle.');
      return;
    }
    onNotify(`Berhasil bergabung ke "${res.circle?.name}"!`);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="map-header-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={18} color="var(--accent-yellow)" />
            <h3>Circles</h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="privacy-segment" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button
            type="button"
            className={`privacy-btn ${tab === 'create' ? 'active fuzzy' : ''}`}
            onClick={() => setTab('create')}
          >
            <PlusCircle size={13} /> Buat Circle
          </button>
          <button
            type="button"
            className={`privacy-btn ${tab === 'join' ? 'active exact' : ''}`}
            onClick={() => setTab('join')}
          >
            <Link2 size={13} /> Gabung Kode
          </button>
        </div>

        {tab === 'create' ? (
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label className="field-label">
              Nama Circle
              <input
                className="field-input"
                placeholder="Mis: Geng Kosan Kemang"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </label>
            <label className="field-label">
              Inisial Ikon (2 huruf, opsional)
              <input
                className="field-input"
                placeholder="KM"
                maxLength={2}
                value={shortCode}
                onChange={(e) => setShortCode(e.target.value.toUpperCase())}
              />
            </label>
            <div className="modal-actions">
              <button type="button" className="pill-action" onClick={onClose}>
                Batal
              </button>
              <button type="submit" className="pill-action primary">
                Buat Circle &amp; Kode Undangan
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label className="field-label">
              Kode Undangan Circle
              <input
                className="field-input"
                placeholder="ZONA-KAMPUS07"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                required
                autoFocus
              />
            </label>
            <span className="channel-meta">
              Contoh kode aktif: <strong>ZONA-KAMPUS07</strong> atau <strong>ZONA-MABAR99</strong>
            </span>
            {error && <div className="inline-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="pill-action" onClick={onClose}>
                Batal
              </button>
              <button type="submit" className="pill-action primary">
                Gabung Sekarang
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
