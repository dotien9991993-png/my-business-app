import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useApp } from '../../contexts/AppContext';

export default function CompanySettings({ tenant }) {
  const { reloadTenant, currentUser } = useApp();
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [backingUp, setBackingUp] = useState(false);
  const [backupProgress, setBackupProgress] = useState('');

  const [form, setForm] = useState({
    name: '', slogan: '', address: '', phone: '', email: '', website: '',
    tax_code: '', logo_url: '', bank_name: '', bank_account: '', bank_holder: '',
    invoice_footer: ''
  });

  useEffect(() => {
    if (tenant) {
      setForm({
        name: tenant.name || '',
        slogan: tenant.slogan || '',
        address: tenant.address || '',
        phone: tenant.phone || '',
        email: tenant.email || '',
        website: tenant.website || '',
        tax_code: tenant.tax_code || '',
        logo_url: tenant.logo_url || '',
        bank_name: tenant.bank_name || '',
        bank_account: tenant.bank_account || '',
        bank_holder: tenant.bank_holder || '',
        invoice_footer: tenant.invoice_footer || ''
      });
    }
  }, [tenant]);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSave = async () => {
    if (!form.name.trim()) return alert('Tên công ty không được để trống');
    setSaving(true);
    try {
      const { error } = await supabase.from('tenants').update({
        name: form.name.trim(),
        slogan: form.slogan.trim() || null,
        address: form.address.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        tax_code: form.tax_code.trim() || null,
        logo_url: form.logo_url.trim() || null,
        bank_name: form.bank_name.trim() || null,
        bank_account: form.bank_account.trim() || null,
        bank_holder: form.bank_holder.trim() || null,
        invoice_footer: form.invoice_footer.trim() || null
      }).eq('id', tenant.id);
      if (error) throw error;
      await reloadTenant();
      showToast('Đã lưu thông tin công ty!');
    } catch (err) {
      console.error(err);
      alert('Lỗi: ' + err.message);
    } finally { setSaving(false); }
  };

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const isAdmin = currentUser?.role === 'admin';

  const BACKUP_TABLES = [
    'tenants', 'users', 'user_permissions', 'departments', 'positions', 'employees',
    'products', 'product_combo_items', 'product_serials',
    'customers', 'customer_interactions',
    'orders', 'order_items', 'order_reconciliation',
    'warehouses', 'warehouse_stock', 'warehouse_transfers', 'warehouse_transfer_items',
    'stock_transactions', 'stock_transaction_items', 'stocktakes', 'stocktake_items',
    'suppliers',
    'receipts_payments', 'debts', 'cod_reconciliation',
    'salaries', 'media_salaries', 'payrolls',
    'tasks', 'technical_jobs', 'technician_bonuses',
    'attendances', 'hrm_attendances', 'work_shifts',
    'leave_requests', 'leave_balances',
    'kpi_templates', 'kpi_criteria', 'kpi_evaluations', 'kpi_evaluation_details',
    'notifications', 'activity_logs', 'system_settings',
    'shipping_configs', 'shipping_tracking_events',
    'warranty_cards', 'warranty_repairs', 'warranty_requests',
    'chat_rooms', 'chat_room_members', 'chat_messages', 'chat_message_reactions',
    'zalo_config', 'zalo_conversations', 'zalo_messages', 'zalo_chat_messages',
    'zalo_internal_notes', 'zalo_quick_replies', 'zalo_templates',
  ];

  const handleBackup = async () => {
    if (backingUp) return;
    setBackingUp(true);
    setBackupProgress('Đang chuẩn bị...');
    try {
      const backup = {
        metadata: {
          created_at: new Date().toISOString(),
          tenant_id: tenant?.id,
          tenant_name: tenant?.name,
          tables_count: BACKUP_TABLES.length,
        },
        tables: {},
      };

      let totalRows = 0;
      for (let i = 0; i < BACKUP_TABLES.length; i++) {
        const table = BACKUP_TABLES[i];
        setBackupProgress(`${i + 1}/${BACKUP_TABLES.length}: ${table}...`);

        const allRows = [];
        let from = 0;
        const PAGE_SIZE = 1000;
        while (true) {
          const { data, error } = await supabase
            .from(table)
            .select('*')
            .range(from, from + PAGE_SIZE - 1);
          if (error) {
            console.warn(`Lỗi backup "${table}":`, error.message);
            break;
          }
          if (!data || data.length === 0) break;
          allRows.push(...data);
          if (data.length < PAGE_SIZE) break;
          from += PAGE_SIZE;
        }
        backup.tables[table] = allRows;
        totalRows += allRows.length;
      }

      backup.metadata.total_rows = totalRows;

      // Download as JSON
      const json = JSON.stringify(backup, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10);
      const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
      a.href = url;
      a.download = `backup-${dateStr}-${timeStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setBackupProgress('');
      showToast(`Backup thành công! ${totalRows} dòng từ ${BACKUP_TABLES.length} bảng`);
    } catch (err) {
      console.error('Lỗi backup:', err);
      showToast('Lỗi backup: ' + err.message, 'error');
    } finally {
      setBackingUp(false);
      setBackupProgress('');
    }
  };

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-4">
      <h2 className="text-xl md:text-2xl font-bold">🏢 Thông Tin Công Ty</h2>

      {/* Company info */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-bold text-gray-800">Thông tin chung</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Tên công ty *</label>
            <input value={form.name} onChange={e => updateField('name', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Slogan</label>
            <input value={form.slogan} onChange={e => updateField('slogan', e.target.value)}
              placeholder="VD: Làm việc hăng say, tiền ngay về túi"
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Địa chỉ</label>
            <input value={form.address} onChange={e => updateField('address', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Số điện thoại</label>
            <input value={form.phone} onChange={e => updateField('phone', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Email</label>
            <input type="email" value={form.email} onChange={e => updateField('email', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Website</label>
            <input value={form.website} onChange={e => updateField('website', e.target.value)}
              placeholder="https://..."
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Mã số thuế</label>
            <input value={form.tax_code} onChange={e => updateField('tax_code', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      {/* Logo */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-bold text-gray-800">Logo</h3>
        <div className="flex items-center gap-4">
          {form.logo_url && (
            <img src={form.logo_url} alt="Logo" className="w-16 h-16 rounded-lg object-contain border"
              onError={e => { e.target.style.display = 'none'; }} />
          )}
          <div className="flex-1">
            <label className="text-sm font-medium text-gray-600 mb-1 block">URL Logo</label>
            <input value={form.logo_url} onChange={e => updateField('logo_url', e.target.value)}
              placeholder="https://... hoặc /logo.png"
              className="w-full border rounded-lg px-3 py-2 text-sm" />
            <p className="text-xs text-gray-400 mt-1">Nhập URL hình ảnh logo. Hỗ trợ PNG, JPG, SVG.</p>
          </div>
        </div>
      </div>

      {/* Bank info */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-bold text-gray-800">Tài khoản ngân hàng</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Tên ngân hàng</label>
            <input value={form.bank_name} onChange={e => updateField('bank_name', e.target.value)}
              placeholder="VD: Vietcombank" className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Số tài khoản</label>
            <input value={form.bank_account} onChange={e => updateField('bank_account', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600 mb-1 block">Chủ tài khoản</label>
            <input value={form.bank_holder} onChange={e => updateField('bank_holder', e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      {/* Invoice footer */}
      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-bold text-gray-800">Hóa đơn</h3>
        <div>
          <label className="text-sm font-medium text-gray-600 mb-1 block">Chân trang hóa đơn</label>
          <textarea value={form.invoice_footer} onChange={e => updateField('invoice_footer', e.target.value)}
            rows={2} placeholder="VD: Cảm ơn quý khách đã mua hàng!"
            className="w-full border rounded-lg px-3 py-2 text-sm" />
          <p className="text-xs text-gray-400 mt-1">Nội dung này sẽ hiển thị ở cuối hóa đơn khi in.</p>
        </div>
      </div>

      {/* Backup - chỉ Admin */}
      {isAdmin && (
        <div className="bg-white rounded-xl border p-4 space-y-3">
          <h3 className="font-bold text-gray-800">💾 Sao lưu dữ liệu</h3>
          <p className="text-sm text-gray-500">
            Tạo bản sao lưu toàn bộ dữ liệu hệ thống ({BACKUP_TABLES.length} bảng) dưới dạng file JSON.
            File sẽ được tải về máy tính của bạn.
          </p>
          <div className="flex items-center gap-3">
            <button onClick={handleBackup} disabled={backingUp}
              className={`px-5 py-2.5 rounded-lg font-medium text-sm text-white flex items-center gap-2 ${backingUp ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
              {backingUp ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Đang backup...
                </>
              ) : 'Tạo backup ngay'}
            </button>
            {backupProgress && (
              <span className="text-sm text-gray-500">{backupProgress}</span>
            )}
          </div>
          <p className="text-xs text-gray-400">
            Khôi phục bằng CLI: <code className="bg-gray-100 px-1.5 py-0.5 rounded">npm run restore -- backups/file.json</code>
          </p>
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving}
          className={`px-6 py-2.5 rounded-lg font-medium text-sm text-white ${saving ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}>
          {saving ? 'Đang lưu...' : 'Lưu thông tin'}
        </button>
      </div>

      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
