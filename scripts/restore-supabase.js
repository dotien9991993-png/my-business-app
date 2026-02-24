/**
 * Khôi phục dữ liệu Supabase từ file backup JSON
 * Chạy: npm run restore -- backups/backup-2026-01-01-120000.json
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

// Load env from .env.local
function loadEnv() {
  const envPath = resolve(rootDir, '.env.local');
  if (!existsSync(envPath)) {
    console.error('Không tìm thấy .env.local');
    process.exit(1);
  }
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    process.env[key] = val;
  }
}

loadEnv();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Thiếu VITE_SUPABASE_URL hoặc VITE_SUPABASE_ANON_KEY trong .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Thứ tự restore (bảng cha trước, bảng con sau) để tránh lỗi foreign key
const RESTORE_ORDER = [
  'tenants', 'departments', 'positions', 'users', 'user_permissions', 'employees',
  'system_settings',
  'products', 'product_combo_items', 'product_serials',
  'customers', 'customer_interactions',
  'suppliers',
  'warehouses', 'warehouse_stock', 'warehouse_transfers', 'warehouse_transfer_items',
  'stock_transactions', 'stock_transaction_items', 'stocktakes', 'stocktake_items',
  'orders', 'order_items', 'order_reconciliation',
  'receipts_payments', 'debts', 'cod_reconciliation',
  'salaries', 'media_salaries', 'payrolls',
  'tasks', 'technical_jobs', 'technician_bonuses',
  'work_shifts', 'attendances', 'hrm_attendances',
  'leave_requests', 'leave_balances',
  'kpi_templates', 'kpi_criteria', 'kpi_evaluations', 'kpi_evaluation_details',
  'notifications', 'activity_logs',
  'shipping_configs', 'shipping_tracking_events',
  'warranty_cards', 'warranty_repairs', 'warranty_requests',
  'chat_rooms', 'chat_room_members', 'chat_messages', 'chat_message_reactions',
  'zalo_config', 'zalo_conversations', 'zalo_messages', 'zalo_chat_messages',
  'zalo_internal_notes', 'zalo_quick_replies', 'zalo_templates',
];

const BATCH_SIZE = 500;

async function upsertTable(table, rows) {
  if (!rows || rows.length === 0) return { inserted: 0, error: null };

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase
      .from(table)
      .upsert(batch, { onConflict: 'id', ignoreDuplicates: false });

    if (error) {
      return { inserted, error: error.message };
    }
    inserted += batch.length;
  }
  return { inserted, error: null };
}

async function main() {
  const backupFile = process.argv[2];
  if (!backupFile) {
    console.error('Cách dùng: npm run restore -- backups/backup-YYYY-MM-DD-HHMMSS.json');
    process.exit(1);
  }

  const filepath = resolve(rootDir, backupFile);
  if (!existsSync(filepath)) {
    console.error(`Không tìm thấy file: ${backupFile}`);
    process.exit(1);
  }

  console.log(`📂 Đọc file backup: ${backupFile}`);
  const backup = JSON.parse(readFileSync(filepath, 'utf-8'));

  if (!backup.tables || !backup.metadata) {
    console.error('File backup không hợp lệ (thiếu tables hoặc metadata)');
    process.exit(1);
  }

  console.log(`📅 Backup tạo lúc: ${backup.metadata.created_at}`);
  console.log(`📊 ${Object.keys(backup.tables).length} bảng, ${backup.metadata.total_rows} dòng\n`);

  console.log('⚠️  CẢNH BÁO: Restore sẽ ghi đè dữ liệu hiện tại (upsert theo id).');
  console.log('   Nhấn Ctrl+C trong 5 giây để hủy...\n');
  await new Promise(r => setTimeout(r, 5000));

  console.log('🔄 Bắt đầu restore...\n');

  let totalRestored = 0;
  const errors = [];

  for (const table of RESTORE_ORDER) {
    const rows = backup.tables[table];
    if (!rows) {
      console.log(`  ⏭ ${table} — không có trong backup`);
      continue;
    }

    process.stdout.write(`  📤 ${table} (${rows.length} dòng)...`);
    const result = await upsertTable(table, rows);
    totalRestored += result.inserted;

    if (result.error) {
      errors.push({ table, error: result.error });
      process.stdout.write(` ❌ ${result.error}\n`);
    } else {
      process.stdout.write(` ✅\n`);
    }
  }

  // Restore các bảng có trong backup nhưng chưa có trong RESTORE_ORDER
  const restored = new Set(RESTORE_ORDER);
  for (const [table, rows] of Object.entries(backup.tables)) {
    if (restored.has(table)) continue;
    process.stdout.write(`  📤 ${table} (${rows.length} dòng)...`);
    const result = await upsertTable(table, rows);
    totalRestored += result.inserted;
    if (result.error) {
      errors.push({ table, error: result.error });
      process.stdout.write(` ❌ ${result.error}\n`);
    } else {
      process.stdout.write(` ✅\n`);
    }
  }

  console.log(`\n✅ Restore hoàn tất!`);
  console.log(`📊 Tổng: ${totalRestored} dòng đã khôi phục`);
  if (errors.length > 0) {
    console.log(`⚠ ${errors.length} bảng lỗi: ${errors.map(e => e.table).join(', ')}`);
  }
}

main().catch(err => {
  console.error('Lỗi restore:', err);
  process.exit(1);
});
