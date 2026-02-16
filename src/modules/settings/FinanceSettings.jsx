import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { receiptCategories as defaultCategories } from '../../constants/financeConstants';

export default function FinanceSettings({ tenant, currentUser, getSettingValue, loadSettingsData }) {
  const [thuList, setThuList] = useState([]);
  const [chiList, setChiList] = useState([]);
  const [newThu, setNewThu] = useState('');
  const [newChi, setNewChi] = useState('');
  const [editIdx, setEditIdx] = useState({ type: null, idx: -1 });
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const dbThu = getSettingValue('finance', 'receipt_categories_thu', null);
    const dbChi = getSettingValue('finance', 'receipt_categories_chi', null);
    setThuList(dbThu || [...defaultCategories.thu]);
    setChiList(dbChi || [...defaultCategories.chi]);
  }, [getSettingValue]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const saveCategories = async (type, list) => {
    setSaving(true);
    try {
      const { error } = await supabase.from('system_settings').upsert({
        tenant_id: tenant.id,
        category: 'finance',
        key: `receipt_categories_${type}`,
        value: list,
        updated_by: currentUser.name,
        updated_at: new Date().toISOString()
      }, { onConflict: 'tenant_id,category,key' });
      if (error) throw error;
      await loadSettingsData();
      showToast(`Đã lưu danh mục ${type === 'thu' ? 'thu' : 'chi'}!`);
    } catch (err) { alert('Lỗi: ' + err.message); }
    finally { setSaving(false); }
  };

  const addItem = (type) => {
    const value = type === 'thu' ? newThu.trim() : newChi.trim();
    if (!value) return;
    const list = type === 'thu' ? thuList : chiList;
    if (list.includes(value)) return alert('Danh mục đã tồn tại');
    const newList = [...list, value];
    if (type === 'thu') { setThuList(newList); setNewThu(''); }
    else { setChiList(newList); setNewChi(''); }
    saveCategories(type, newList);
  };

  const removeItem = (type, idx) => {
    if (!window.confirm('Xóa danh mục này?')) return;
    const list = type === 'thu' ? [...thuList] : [...chiList];
    list.splice(idx, 1);
    if (type === 'thu') setThuList(list);
    else setChiList(list);
    saveCategories(type, list);
  };

  const startEdit = (type, idx) => {
    const list = type === 'thu' ? thuList : chiList;
    setEditIdx({ type, idx });
    setEditValue(list[idx]);
  };

  const saveEdit = () => {
    if (!editValue.trim()) return;
    const { type, idx } = editIdx;
    const list = type === 'thu' ? [...thuList] : [...chiList];
    list[idx] = editValue.trim();
    if (type === 'thu') setThuList(list);
    else setChiList(list);
    setEditIdx({ type: null, idx: -1 });
    saveCategories(type, list);
  };

  const moveItem = (type, idx, dir) => {
    const list = type === 'thu' ? [...thuList] : [...chiList];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= list.length) return;
    [list[idx], list[newIdx]] = [list[newIdx], list[idx]];
    if (type === 'thu') setThuList(list);
    else setChiList(list);
    saveCategories(type, list);
  };

  const resetToDefault = (type) => {
    if (!window.confirm('Khôi phục danh mục mặc định? Tất cả thay đổi sẽ bị mất.')) return;
    const defaults = type === 'thu' ? [...defaultCategories.thu] : [...defaultCategories.chi];
    if (type === 'thu') setThuList(defaults);
    else setChiList(defaults);
    saveCategories(type, defaults);
  };

  const CategoryList = ({ type, list, newValue, setNewValue }) => (
    <div className="bg-white rounded-xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-gray-800">
          {type === 'thu' ? '📥 Danh mục THU' : '📤 Danh mục CHI'}
        </h3>
        <button onClick={() => resetToDefault(type)}
          className="text-xs text-gray-400 hover:text-red-500">Khôi phục mặc định</button>
      </div>

      <div className="space-y-1.5">
        {list.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2 group">
            <div className="flex flex-col">
              <button onClick={() => moveItem(type, idx, -1)} disabled={idx === 0}
                className={`text-[10px] leading-none ${idx === 0 ? 'text-gray-200' : 'text-gray-400 hover:text-gray-600'}`}>▲</button>
              <button onClick={() => moveItem(type, idx, 1)} disabled={idx === list.length - 1}
                className={`text-[10px] leading-none ${idx === list.length - 1 ? 'text-gray-200' : 'text-gray-400 hover:text-gray-600'}`}>▼</button>
            </div>
            {editIdx.type === type && editIdx.idx === idx ? (
              <div className="flex-1 flex gap-1">
                <input value={editValue} onChange={e => setEditValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveEdit()}
                  className="flex-1 border rounded px-2 py-1 text-sm" autoFocus />
                <button onClick={saveEdit} className="px-2 py-1 bg-green-500 text-white rounded text-xs">OK</button>
                <button onClick={() => setEditIdx({ type: null, idx: -1 })} className="px-2 py-1 bg-gray-200 rounded text-xs">Hủy</button>
              </div>
            ) : (
              <>
                <span className="flex-1 text-sm py-1">{item}</span>
                <button onClick={() => startEdit(type, idx)}
                  className="opacity-0 group-hover:opacity-100 text-xs text-blue-500 hover:text-blue-700">Sửa</button>
                <button onClick={() => removeItem(type, idx)}
                  className="opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-600">Xóa</button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-2 border-t">
        <input value={newValue} onChange={e => setNewValue(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem(type)}
          placeholder="Thêm danh mục mới..."
          className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
        <button onClick={() => addItem(type)} disabled={saving}
          className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">
          + Thêm
        </button>
      </div>

      <div className="text-xs text-gray-400">{list.length} danh mục</div>
    </div>
  );

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4">
      <h2 className="text-xl md:text-2xl font-bold">💰 Cấu Hình Tài Chính</h2>
      <p className="text-sm text-gray-500">Quản lý danh mục thu/chi. Thay đổi sẽ áp dụng ngay cho tạo phiếu thu/chi mới.</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CategoryList type="thu" list={thuList} newValue={newThu} setNewValue={setNewThu} />
        <CategoryList type="chi" list={chiList} newValue={newChi} setNewValue={setNewChi} />
      </div>

      {toast && (
        <div className="fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-medium bg-green-600 text-white">
          {toast}
        </div>
      )}
    </div>
  );
}
