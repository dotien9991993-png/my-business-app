# Sales + Warehouse — Hướng dẫn deploy bộ fix P0/P1

## Tóm tắt đã code

### 3 SQL migration mới

1. **`migrations/2026-05-batch1-foundation.sql`** — Foundation
   - 7 UNIQUE indexes (chống trùng số chứng từ ở DB level)
   - Bảng `document_counters` + RPC `next_doc_number` (sinh số atomic)
   - 7 wrapper RPC: `gen_order_number`, `gen_receipt_number`, `gen_stock_tx_number`, `gen_transfer_code`, `gen_stocktake_code`, `gen_supplier_return_code`, `gen_sku`
   - Thêm `tenant_id` vào `warehouse_stock` + auto-fill trigger

2. **`migrations/2026-05-batch2-atomic-rpcs.sql`** — Atomic flows
   - `transfer_stock_multi` (chuyển kho N SP atomic)
   - `approve_import_atomic` (duyệt nhập + cộng kho + WAC)
   - `approve_export_atomic` (duyệt xuất + trừ kho)
   - `confirm_supplier_return_atomic` (trả NCC + tạo công nợ ngược)
   - `merge_orders_atomic` (gộp đơn)

3. **`migrations/2026-05-batch3-stocktake-logs.sql`** — Stocktake + audit
   - `complete_stocktake_atomic` (SET tuyệt đối, fix bug sale-trong-stocktake)
   - Bảng + trigger `stocktake_locks` (khóa SP đang kiểm)
   - Trigger `log_order_status_change` (audit `order_status_logs`)
   - `confirm_cod_received_atomic` (xác nhận COD → phiếu thu + sổ quỹ)
   - `bulk_update_order_status`
   - Thêm cột `created_by_id`, `confirmed_at`, `shipped_at`,... vào `orders`

### Code client đã sửa

| File | Fix |
|---|---|
| `src/utils/validation.js` | Thêm `validatePrice`, `validateQuantity`, `validateOrder` |
| `src/utils/rpcHelpers.js` | **MỚI** — wrappers gọi tất cả RPC mới |
| `src/modules/sales/SalesOrdersView.jsx` | `genOrderNumber`, `genReceiptNumber` → gọi RPC atomic |
| `src/modules/warehouse/WarehouseImportView.jsx` | `generateTransactionNumber` → RPC + fix `product.stock → stock_quantity` |
| `src/modules/warehouse/WarehouseExportView.jsx` | `generateTransactionNumber` → RPC |
| `src/modules/warehouse/WarehouseTransferView.jsx` | `genTransferCode` → RPC |
| `src/modules/warehouse/WarehouseStocktakeView.jsx` | `genStocktakeCode` → RPC |
| `src/modules/warehouse/WarehouseInventoryView.jsx` | `generateSku` → RPC + barcode bớt va đập |
| `src/modules/warehouse/PurchaseOrderView.jsx` | Fix `product.stock → stock_quantity` |
| `src/modules/warehouse/WarehouseReportView.jsx` | Fix `product.stock → stock_quantity` |

---

## Thứ tự deploy

### Bước 1 — Chạy 3 SQL theo thứ tự

⚠️ **PHẢI ĐÚNG THỨ TỰ** (batch sau phụ thuộc batch trước):

1. Mở Supabase Dashboard → SQL Editor
2. Copy paste **`migrations/2026-05-batch1-foundation.sql`** → Run
   - Verify cuối SQL: 3 dòng `✅ OK` và 3 số đơn test tăng dần `DH-...001/002/003`
3. Copy paste **`migrations/2026-05-batch2-atomic-rpcs.sql`** → Run
   - Verify: 5 RPC mới đều `✅ created`
4. Copy paste **`migrations/2026-05-batch3-stocktake-logs.sql`** → Run
   - Verify: 5 RPC + trigger đều có

### Bước 2 — Test SQL nhanh (5 phút)

Trong SQL Editor, chạy:

```sql
-- Test 1: sinh 5 số đơn liên tiếp (phải tăng dần)
SELECT gen_order_number((SELECT id FROM tenants LIMIT 1)) FROM generate_series(1,5);

-- Test 2: warehouse_stock có tenant_id chưa
SELECT tenant_id, COUNT(*) FROM warehouse_stock GROUP BY tenant_id LIMIT 5;
-- Phải thấy mỗi tenant có số lượng rõ ràng (không NULL)

-- Test 3: trigger order_status_logs
UPDATE orders SET status = status WHERE id = (SELECT id FROM orders LIMIT 1);
-- Sau đó:
SELECT * FROM order_status_logs ORDER BY changed_at DESC LIMIT 1;
```

### Bước 3 — Deploy code

```bash
cd /Users/dotien/Desktop/hoangnam-backup
git add -A
git commit -m "P0/P1 batch 1-4: foundation RPCs, atomic flows, stocktake fix, validation"
git push origin main
```

Vercel tự deploy. Theo dõi Vercel Dashboard → Deployments.

### Bước 4 — Test app (15 phút)

Thử các luồng quan trọng:

1. **Tạo đơn mới** → check `order_number` mới (DH-YYYYMMDD-001 theo RPC)
2. **2 tab cùng tạo đơn cùng giây** → 2 số khác nhau (không trùng)
3. **Tạo phiếu nhập kho** → number `PN-...-0001` (4 số, theo RPC)
4. **Tạo SP mới không nhập SKU** → SKU `SP-YYYYMM-0001`
5. **Tạo phiếu kiểm kê** → mã `KK-YYYYMMDD-001`
6. **Đổi status đơn hàng** → check `SELECT * FROM order_status_logs` có log mới

---

## Việc CÒN LẠI — chưa code do rủi ro cao

Các luồng atomic dưới đây **RPC đã có ở DB**, nhưng client code **vẫn loop từng item**. Cần sửa client để gọi RPC mới. Tôi không sửa vì các file >1000 dòng dễ break — bạn nên test bộ hiện tại trước khi đụng tiếp.

### TODO 1 — WarehouseTransferView: dùng `transfer_stock_multi`

Hiện tại `handleConfirmTransit` (~line 202-235) và `handleReceive` (~line 237-283) loop `adjust_warehouse_stock` từng item. Thay bằng:

```js
import { transferStockMulti } from '../../utils/rpcHelpers';

// Trong handleSave (sau khi tạo phiếu transfer):
const transferId = await transferStockMulti(
  tenant.id,
  fromWarehouseId,
  toWarehouseId,
  validItems.map(it => ({
    product_id: it.product_id,
    quantity: parseInt(it.quantity),
    variant_id: it.variant_id || null,
  })),
  currentUser.name,
  formNote.trim()
);
```

Bỏ luôn việc tự INSERT `warehouse_transfers` + loop adjust — RPC tự làm hết.

### TODO 2 — WarehouseImportView/ExportView: dùng `approve_import_atomic`/`approve_export_atomic`

`handleApprove` hiện tại loop `adjust_warehouse_stock`. Thay bằng:

```js
import { approveImport } from '../../utils/rpcHelpers';
await approveImport(transactionId, currentUser.name);
```

### TODO 3 — SupplierReturnView: dùng `confirm_supplier_return_atomic`

`handleConfirm` hiện tại loop. Thay bằng:

```js
import { confirmSupplierReturn } from '../../utils/rpcHelpers';
await confirmSupplierReturn(returnId, currentUser.name);
```

### TODO 4 — WarehouseStocktakeView: dùng `complete_stocktake_atomic`

`handleComplete` (~line 447-455) hiện tính `delta = actual - snapshot` → bug khi có sale trong lúc kiểm. Thay bằng:

```js
import { completeStocktake } from '../../utils/rpcHelpers';
await completeStocktake(stocktakeId, currentUser.name);
```

RPC set stock TUYỆT ĐỐI (`stock = actual_qty`).

### TODO 5 — SalesCodView: dùng `confirm_cod_received_atomic`

Khi confirm COD, hiện chỉ update status. Thay bằng:

```js
import { confirmCodReceived } from '../../utils/rpcHelpers';
await confirmCodReceived(reconciliationId, currentUser.name);
```

RPC tự tạo phiếu thu + sổ quỹ + update đơn paid_amount/payment_status.

### TODO 6 — SalesOrdersView: dùng `merge_orders_atomic`

`handleConfirmMerge` (~line 1825-1945) là 6 bước không atomic. Thay bằng:

```js
import { mergeOrders } from '../../utils/rpcHelpers';
const newOrderId = await mergeOrders(
  tenant.id,
  selectedOrdersToMerge.map(o => o.id),
  newOrderData,
  newItems,
  warehouseId,
  currentUser.name
);
```

### TODO 7 — Áp dụng `validateOrder` trong `handleCreateOrder`

```js
import { validateOrder } from '../../utils/validation';

// Trước khi insert:
const validation = validateOrder({
  items: cartItems,
  total_amount: totalAmount,
  customer_id: customerId,
  customer_phone: customerPhone,
  payment_method: paymentMethod,
});
if (!validation.valid) {
  alert('Lỗi:\n• ' + validation.errors.join('\n• '));
  return;
}
```

### TODO 8 — Bulk status change dùng RPC

Hiện `handleBulkConfirm`/`handleBulkCancel` đã có nhưng dùng update tay. Đổi sang RPC `bulk_update_order_status` để có atomicity + auto-fill timestamp + log:

```js
import { bulkUpdateOrderStatus } from '../../utils/rpcHelpers';
const count = await bulkUpdateOrderStatus(
  tenant.id,
  selectedIds,
  'confirmed',
  currentUser.name
);
```

---

## Test cuối

Sau khi áp dụng các TODO trên, test thử các edge case:

1. **Race condition test** (cần 2 trình duyệt cùng login):
   - Đồng thời tạo đơn → 2 số khác nhau
   - Đồng thời transfer cùng SP từ cùng kho → 1 thành công, 1 báo lỗi (chứ không bán âm)

2. **Stocktake test:**
   - Tạo phiếu kiểm 1 SP
   - Trong lúc kiểm, ở tab khác bán SP đó
   - Hoàn tất phiếu → stock được SET = số đếm (đúng), không phải số đếm − số bán

3. **COD test:**
   - Xác nhận nhận COD 1 đơn
   - Vào sổ quỹ thấy 1 dòng thu mới
   - Vào báo cáo đơn thấy `paid_amount` đã cộng

4. **Audit log test:**
   - Đổi status nhiều đơn
   - Vào `order_status_logs` thấy mỗi đổi đều có log

---

## Còn lại — chưa làm trong session này (lưu ý)

Các vấn đề quan trọng từ audit nhưng cần thay đổi sâu (kế hoạch riêng):

| # | Vấn đề | Vì sao chưa làm |
|---|---|---|
| P0-1 | RLS `tenant_id IS NOT NULL` quá hở | Cần migrate Supabase Auth — việc lớn |
| P0-2 | Mật khẩu plaintext | Cần force reset toàn bộ user — coordinate với HR |
| P0-8 | Báo cáo doanh thu chỉ 90 ngày | Phải refactor `SalesReportView` tự query — dài |
| H-15 | `order_status_logs` chưa ghi | ✅ ĐÃ FIX (trigger trong batch 3) |
| H-24 | `created_by` lưu name | ✅ Đã thêm cột `created_by_id` (batch 3). Code chưa update — TODO riêng |

---

## Sau khi deploy xong và stable 1 tuần

Mở "Phase 1" của UPGRADE_STRATEGY.md để tiếp:
- Public order tracking page (2 ngày)
- Sentry monitoring (1 ngày)
- GHN integration (3 ngày)
- VNPay/ZaloPay (3 ngày)
- Metabase setup (2 ngày)

Hoặc bắt đầu PoC React Native cho mobile native app.
