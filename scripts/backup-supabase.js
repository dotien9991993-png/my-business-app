/**
 * Backup toàn bộ dữ liệu Supabase ra file JSON
 * Chạy: npm run backup
 */
import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

// Load env from .env.local
function loadEnv() {
  const envPath = resolve(rootDir, '.env.local');
  if (!existsSync(envPath)) {
    console.error('Không tìm thấy .env.local. Tạo file .env.local với VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY');
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

const TABLES = [
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

const PAGE_SIZE = 1000;

async function fetchAllRows(table) {
  const allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.warn(`  ⚠ Lỗi table "${table}": ${error.message}`);
      return { table, rows: [], error: error.message };
    }
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { table, rows: allRows, error: null };
}

async function main() {
  console.log('🔄 Bắt đầu backup Supabase...');
  console.log(`📊 ${TABLES.length} bảng cần backup\n`);

  const backup = {
    metadata: {
      created_at: new Date().toISOString(),
      supabase_url: supabaseUrl,
      tables_count: TABLES.length,
    },
    tables: {},
  };

  let totalRows = 0;
  const errors = [];

  for (const table of TABLES) {
    process.stdout.write(`  📥 ${table}...`);
    const result = await fetchAllRows(table);
    backup.tables[table] = result.rows;
    totalRows += result.rows.length;

    if (result.error) {
      errors.push({ table, error: result.error });
      process.stdout.write(` ❌ ${result.error}\n`);
    } else {
      process.stdout.write(` ✅ ${result.rows.length} dòng\n`);
    }
  }

  backup.metadata.total_rows = totalRows;

  // Save
  const backupDir = resolve(rootDir, 'backups');
  mkdirSync(backupDir, { recursive: true });

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const filename = `backup-${dateStr}-${timeStr}.json`;
  const filepath = resolve(backupDir, filename);

  writeFileSync(filepath, JSON.stringify(backup, null, 2), 'utf-8');

  console.log(`\n✅ Backup hoàn tất!`);
  console.log(`📁 File: backups/${filename}`);
  console.log(`📊 Tổng: ${totalRows} dòng từ ${TABLES.length} bảng`);
  if (errors.length > 0) {
    console.log(`⚠ ${errors.length} bảng lỗi: ${errors.map(e => e.table).join(', ')}`);
  }
}

main().catch(err => {
  console.error('Lỗi backup:', err);
  process.exit(1);
});
