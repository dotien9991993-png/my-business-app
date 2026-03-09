import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';

export default function EkipSelector({ tenant, allUsers, onApplyEkip, disabled }) {
  const [ekips, setEkips] = useState([]);
  const [selectedEkipId, setSelectedEkipId] = useState('');
  const [loading, setLoading] = useState(true);

  const loadEkips = useCallback(async () => {
    if (!tenant?.id) return;
    const { data } = await supabase
      .from('ekips')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('name');
    setEkips(data || []);
    setLoading(false);
  }, [tenant?.id]);

  useEffect(() => {
    loadEkips();
  }, [loadEkips]);

  const resolveNames = (ids) => {
    if (!ids || !Array.isArray(ids)) return [];
    return ids
      .map(id => allUsers.find(u => u.id === id)?.name)
      .filter(Boolean);
  };

  const handleSelect = (ekipId) => {
    setSelectedEkipId(ekipId);
    if (!ekipId) return;

    const ekip = ekips.find(e => e.id === ekipId);
    if (!ekip) return;

    const cameramenNames = resolveNames(ekip.camera_ids);
    const editorNames = resolveNames(ekip.editor_ids);
    const actorNames = resolveNames(ekip.actor_ids);

    onApplyEkip({ cameramen: cameramenNames, editors: editorNames, actors: actorNames });
  };

  if (loading || ekips.length === 0) return null;

  const selectedEkip = ekips.find(e => e.id === selectedEkipId);

  return (
    <div className="mb-3">
      <label className="block text-sm font-medium mb-1">👥 Chọn Ekip nhanh</label>
      <select
        value={selectedEkipId}
        onChange={(e) => handleSelect(e.target.value)}
        disabled={disabled}
        className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 text-sm"
      >
        <option value="">-- Tùy chỉnh (chọn tay) --</option>
        {ekips.map(ekip => (
          <option key={ekip.id} value={ekip.id}>{ekip.name}</option>
        ))}
      </select>
      {selectedEkip && (
        <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded-lg text-xs space-y-1">
          <div>
            <span className="font-semibold text-blue-700">🎬 Quay phim:</span>{' '}
            {resolveNames(selectedEkip.camera_ids).join(', ') || 'Chưa có'}
          </div>
          <div>
            <span className="font-semibold text-purple-700">✂️ Dựng phim:</span>{' '}
            {resolveNames(selectedEkip.editor_ids).join(', ') || 'Chưa có'}
          </div>
          <div>
            <span className="font-semibold text-pink-700">🎭 Diễn viên:</span>{' '}
            {resolveNames(selectedEkip.actor_ids).join(', ') || 'Chưa có'}
          </div>
        </div>
      )}
    </div>
  );
}
