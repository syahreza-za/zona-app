import { useState } from 'react';
import { Link2, Plus, Users, X } from 'lucide-react';
import { useZonaStore } from '@zona/shared';
import { zonaCloudSync } from '../services/cloudSync';

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
    const defaultChannelId = useZonaStore.getState().activeChannelId;
    void zonaCloudSync.syncCreateCircle(circle, defaultChannelId);
    onNotify(`Circle "${circle.name}" dibuat (${circle.inviteCode}).`);
    onClose();
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (zonaCloudSync.isActive()) {
      const cloudRes = await zonaCloudSync.syncJoinCircle(inviteCode);
      if (!cloudRes.ok) {
        setError(cloudRes.error ?? 'Kode undangan tidak ditemukan.');
        return;
      }
      onNotify(`Bergabung ke Circle (${inviteCode.toUpperCase()}).`);
      onClose();
      return;
    }
    const res = joinCircleByCode(inviteCode);
    if (!res.ok) {
      setError(res.error ?? 'Kode undangan tidak valid.');
      return;
    }
    onNotify(`Bergabung ke "${res.circle?.name}".`);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Users size={18} strokeWidth={1.75} color="var(--accent)" />
            <h3>Circle</h3>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Tutup">
            <X size={17} strokeWidth={1.75} />
          </button>
        </div>

        <div className="rsvp-segment" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <button
            type="button"
            className={`rsvp-choice ${tab === 'create' ? 'selected' : ''}`}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
            onClick={() => setTab('create')}
          >
            <Plus size={14} strokeWidth={1.75} />
            <span>Buat Baru</span>
          </button>
          <button
            type="button"
            className={`rsvp-choice ${tab === 'join' ? 'selected' : ''}`}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
            onClick={() => setTab('join')}
          >
            <Link2 size={14} strokeWidth={1.75} />
            <span>Gabung Kode</span>
          </button>
        </div>

        {tab === 'create' ? (
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label className="field-label">
              Nama Circle
              <input
                className="field-input"
                placeholder="Contoh: Geng Kosan Kemang"
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
              <button type="button" className="btn-secondary" onClick={onClose}>
                Batal
              </button>
              <button type="submit" className="btn-primary">
                Buat Circle
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label className="field-label">
              Kode Undangan
              <input
                className="field-input"
                placeholder="ZONA-KAMPUS07"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                required
                autoFocus
              />
            </label>
            {error && <div className="inline-error">{error}</div>}
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={onClose}>
                Batal
              </button>
              <button type="submit" className="btn-primary">
                Gabung
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
