import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../supabaseClient';
import { useApp } from '../../contexts/AppContext';
import { isAdmin as isAdminRole } from '../../utils/permissionUtils';

export default function EkipManagementView() {
  const { tenant, allUsers, currentUser } = useApp();

  const [ekips, setEkips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingEkip, setEditingEkip] = useState(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formCrewIds, setFormCrewIds] = useState([]);
  const [formActorIds, setFormActorIds] = useState([]);

  const loadEkips = useCallback(async () => {
    if (!tenant?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('ekips')
      .select('*')
      .eq('tenant_id', tenant.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    setEkips(data || []);
    setLoading(false);
  }, [tenant?.id]);

  useEffect(() => {
    loadEkips();
  }, [loadEkips]);

  const resolveNames = (ids) => {
    if (!ids || !Array.isArray(ids)) return [];
    return ids.map(id => {
      const user = allUsers.find(u => u.id === id);
      return user ? user.name : '(Đã xóa)';
    });
  };

  const openCreateForm = () => {
    setEditingEkip(null);
    setFormName('');
    setFormDescription('');
    setFormCrewIds([]);
    setFormActorIds([]);
    setShowForm(true);
  };

  const openEditForm = (ekip) => {
    setEditingEkip(ekip);
    setFormName(ekip.name);
    setFormDescription(ekip.description || '');
    // Gộp camera_ids + editor_ids thành crew
    const crewIds = [...new Set([...(ekip.camera_ids || []), ...(ekip.editor_ids || [])])];
    setFormCrewIds(crewIds);
    setFormActorIds(ekip.actor_ids || []);
    setShowForm(true);
  };

  const toggleCrewId = (userId) => {
    setFormCrewIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const toggleActorId = (userId) => {
    setFormActorIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const saveEkip = async () => {
    if (!formName.trim()) return alert('Vui lòng nhập tên ekip');
    setSaving(true);

    const payload = {
      tenant_id: tenant.id,
      name: formName.trim(),
      description: formDescription.trim(),
      camera_ids: formCrewIds,
      editor_ids: formCrewIds,
      actor_ids: formActorIds,
      updated_at: new Date().toISOString(),
    };

    if (editingEkip) {
      await supabase.from('ekips').update(payload).eq('id', editingEkip.id);
    } else {
      payload.created_by = currentUser.id;
      await supabase.from('ekips').insert(payload);
    }

    setSaving(false);
    setShowForm(false);
    loadEkips();
  };

  const deleteEkip = async (ekip) => {
    if (!confirm(`Xóa ekip "${ekip.name}"?`)) return;
    await supabase.from('ekips').update({ is_active: false }).eq('id', ekip.id);
    loadEkips();
  };

  const canEdit = (ekip) => isAdminRole(currentUser) || currentUser.id === ekip.created_by;
  const canDelete = () => isAdminRole(currentUser);

  const getCreatorName = (ekip) => {
    if (!ekip.created_by) return null;
    const user = allUsers.find(u => u.id === ekip.created_by);
    return user ? user.name : null;
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Quản lý Ekip</h1>
          <p className="text-gray-500 text-sm mt-1">Tạo sẵn nhóm Quay & Dựng + Diễn viên để chọn nhanh khi tạo video</p>
        </div>
        <button
          onClick={openCreateForm}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm flex items-center gap-2"
        >
          <span>+</span> Tạo Ekip
        </button>
      </div>

      {/* Ekip List */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Đang tải...</div>
      ) : ekips.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
          <div className="text-5xl mb-4">👥</div>
          <h3 className="text-lg font-semibold text-gray-600 mb-2">Chưa có ekip nào</h3>
          <p className="text-gray-400 mb-4">Tạo ekip để chọn nhanh nhóm quay & dựng khi tạo video</p>
          <button
            onClick={openCreateForm}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm"
          >
            + Tạo Ekip đầu tiên
          </button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {ekips.map(ekip => {
            const crewIds = [...new Set([...(ekip.camera_ids || []), ...(ekip.editor_ids || [])])];
            const crewNames = resolveNames(crewIds);
            const actorNames = resolveNames(ekip.actor_ids);
            return (
              <div key={ekip.id} className="bg-white border rounded-xl p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-bold text-gray-800 text-lg">{ekip.name}</h3>
                    {ekip.description && (
                      <p className="text-gray-500 text-sm mt-0.5">{ekip.description}</p>
                    )}
                    {getCreatorName(ekip) && (
                      <p className="text-gray-400 text-xs mt-0.5">Tạo bởi: {getCreatorName(ekip)}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {canEdit(ekip) && (
                      <button
                        onClick={() => openEditForm(ekip)}
                        className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg text-sm"
                        title="Sửa"
                      >
                        ✏️
                      </button>
                    )}
                    {canDelete() && (
                      <button
                        onClick={() => deleteEkip(ekip)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                        title="Xóa"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>

                {/* Crew */}
                <div className="mb-2">
                  <span className="text-xs font-semibold text-gray-500">🎬 Quay & Dựng ({crewNames.length})</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {crewNames.length > 0 ? crewNames.map(name => (
                      <span key={name} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">{name}</span>
                    )) : (
                      <span className="text-xs text-gray-400">Chưa chọn</span>
                    )}
                  </div>
                </div>

                {/* Actors */}
                <div>
                  <span className="text-xs font-semibold text-gray-500">🎭 Diễn viên ({actorNames.length})</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {actorNames.length > 0 ? actorNames.map(name => (
                      <span key={name} className="px-2 py-0.5 bg-pink-100 text-pink-700 rounded-full text-xs">{name}</span>
                    )) : (
                      <span className="text-xs text-gray-400">Chưa chọn</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b flex items-center justify-between">
              <h2 className="text-lg font-bold">{editingEkip ? 'Sửa Ekip' : 'Tạo Ekip Mới'}</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
            </div>

            <div className="p-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium mb-1">Tên Ekip *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="VD: Ekip chính, Ekip sự kiện..."
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium mb-1">Mô tả</label>
                <input
                  type="text"
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  placeholder="Ghi chú về ekip..."
                  className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Crew (Quay & Dựng) */}
              <div>
                <label className="block text-sm font-medium mb-2">🎬 Quay & Dựng</label>
                <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-1">
                  {allUsers.map(user => (
                    <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1.5 rounded">
                      <input
                        type="checkbox"
                        checked={formCrewIds.includes(user.id)}
                        onChange={() => toggleCrewId(user.id)}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm">{user.name} <span className="text-gray-400">- {user.team}</span></span>
                    </label>
                  ))}
                </div>
                {formCrewIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {formCrewIds.map(id => {
                      const user = allUsers.find(u => u.id === id);
                      return (
                        <span key={id} className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center gap-1">
                          🎬 {user?.name || '?'}
                          <button onClick={() => toggleCrewId(id)} className="hover:text-red-600">×</button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Actors */}
              <div>
                <label className="block text-sm font-medium mb-2">🎭 Diễn viên</label>
                <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-1">
                  {allUsers.map(user => (
                    <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1.5 rounded">
                      <input
                        type="checkbox"
                        checked={formActorIds.includes(user.id)}
                        onChange={() => toggleActorId(user.id)}
                        className="w-4 h-4 text-pink-600"
                      />
                      <span className="text-sm">{user.name} <span className="text-gray-400">- {user.team}</span></span>
                    </label>
                  ))}
                </div>
                {formActorIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {formActorIds.map(id => {
                      const user = allUsers.find(u => u.id === id);
                      return (
                        <span key={id} className="px-2 py-1 bg-pink-100 text-pink-700 rounded-full text-xs flex items-center gap-1">
                          🎭 {user?.name || '?'}
                          <button onClick={() => toggleActorId(id)} className="hover:text-red-600">×</button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t flex justify-end gap-3">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
              >
                Hủy
              </button>
              <button
                onClick={saveEkip}
                disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 font-medium"
              >
                {saving ? 'Đang lưu...' : editingEkip ? 'Cập nhật' : 'Tạo Ekip'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
