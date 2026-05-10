import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { useApp } from '../../contexts/AppContext';

// Bảng có cột tenant_id — backup chỉ data của tenant hiện tại
const BACKUP_TABLES_WITH_TENANT = [
  'users', 'user_permissions', 'departments', 'positions', 'employees',
  'products', 'product_combo_items', 'product_serials',
  'customers',
  'orders',
  'warehouses', 'warehouse_transfers',
  'stock_transactions', 'stocktakes',
  'suppliers',
  'receipts_payments', 'debts', 'cod_reconciliation',
  'salaries', 'media_salaries', 'payrolls',
  'tasks', 'technical_jobs', 'technician_bonuses',
  'attendances', 'hrm_attendances', 'work_shifts',
  'leave_requests', 'leave_balances',
  'kpi_templates', 'kpi_evaluations',
  'notifications', 'activity_logs', 'system_settings',
  'shipping_configs',
  'warranty_cards', 'warranty_repairs', 'warranty_requests',
  'chat_rooms', 'chat_messages',
  'zalo_config', 'zalo_conversations', 'zalo_messages', 'zalo_chat_messages',
  'zalo_internal_notes', 'zalo_quick_replies', 'zalo_templates',
];

// Bảng con (không có tenant_id, ràng buộc qua FK đến parent) — RLS sẽ chặn cross-tenant
const BACKUP_TABLES_CHILD = [
  'customer_interactions', 'order_items', 'order_reconciliation',
  'warehouse_stock', 'warehouse_transfer_items',
  'stock_transaction_items', 'stocktake_items',
  'kpi_criteria', 'kpi_evaluation_details',
  'shipping_tracking_events',
  'chat_room_members', 'chat_message_reactions',
];

const BACKUP_TABLES = [...BACKUP_TABLES_WITH_TENANT, ...BACKUP_TABLES_CHILD];
const TABLES_WITH_TENANT_SET = new Set(BACKUP_TABLES_WITH_TENANT);

export default function BackupSettings({ tenant }) {
  const { currentUser: _currentUser } = useApp();
  const [backingUp, setBackingUp] = useState(false);
  const [backupProgress, setBackupProgress] = useState('');
  const [toast, setToast] = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

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
        const hasTenantCol = TABLES_WITH_TENANT_SET.has(table);
        while (true) {
          // FIX bảo mật: chỉ backup data thuộc tenant hiện tại.
          // Bảng có tenant_id → filter trực tiếp.
          // Bảng con (không có tenant_id) → dựa vào RLS để cách ly.
          let query = supabase.from(table).select('*');
          if (hasTenantCol && tenant?.id) {
            query = query.eq('tenant_id', tenant.id);
          }
          const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
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
      <h2 className="text-xl md:text-2xl font-bold">💾 Sao Lưu Dữ Liệu</h2>

      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-bold text-gray-800">Tạo bản sao lưu</h3>
        <p className="text-sm text-gray-500">
          Xuất toàn bộ dữ liệu hệ thống ({BACKUP_TABLES.length} bảng) dưới dạng file JSON.
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
      </div>

      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-bold text-gray-800">Khôi phục dữ liệu</h3>
        <p className="text-sm text-gray-500">
          Để khôi phục dữ liệu từ file backup, sử dụng lệnh CLI:
        </p>
        <div className="bg-gray-50 rounded-lg p-3">
          <code className="text-sm text-gray-700">npm run restore -- backups/backup-YYYY-MM-DD-HHMMSS.json</code>
        </div>
        <p className="text-xs text-gray-400">
          Lệnh restore sẽ upsert (ghi đè theo id) dữ liệu từ file JSON vào database.
          Có 5 giây chờ để hủy trước khi bắt đầu.
        </p>
      </div>

      <div className="bg-white rounded-xl border p-4 space-y-3">
        <h3 className="font-bold text-gray-800">Danh sách bảng được sao lưu</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-1">
          {BACKUP_TABLES.map(t => (
            <span key={t} className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">{t}</span>
          ))}
        </div>
      </div>

      {toast && (
        <div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
