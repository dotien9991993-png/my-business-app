# Supabase Audit & Optimization Checklist

Hướng dẫn chi tiết để bạn check + tối ưu Supabase, đảm bảo Pro Plan ($25, 250GB) đủ dùng cả tháng.

## A. Kiểm tra ngay hôm nay (15 phút)

### A1. Egress hiện tại

`Dashboard → Settings → Usage` (hoặc sidebar trái → **Usage**)

**Cần screenshot và kiểm tra:**

- **Egress in current cycle**: số GB đã dùng / 250GB. Nếu chưa qua 1/3 cycle mà đã >100GB → có vấn đề.
- **Database Size**: nên < 1GB cho 1 công ty 20 nhân viên
- **Storage Size**: nếu app upload file qua Supabase Storage thì xem số GB
- **Realtime Concurrent Peak Connections**: < 50 là bình thường
- **Realtime Messages**: < 100K/tháng là bình thường

### A2. Top tables bị query nhiều nhất

`Dashboard → Reports → API` → tab **Tables**

Sắp xếp theo "Requests" hoặc "Bytes". Top 5 bảng nào tốn nhất gửi tôi screenshot.

**Bảng nào dự kiến top:**
- `tasks` — vì DataContext load + realtime + visibilitychange (đã giảm)
- `orders`
- `chat_messages` — nếu nhiều user chat nhiều
- `notifications` — mỗi event tạo 1 row
- `products` — nếu nhiều ảnh thumbnail trong DB

### A3. Slowest queries

`Dashboard → Reports → Query Performance` (hoặc Database → Query Performance)

Top 10 query chậm nhất. Query nào > 500ms cần index hoặc tối ưu.

### A4. DB size theo bảng

Vào **SQL Editor**, chạy query này:

```sql
SELECT
  schemaname,
  relname AS table_name,
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  pg_size_pretty(pg_relation_size(relid)) AS table_size,
  pg_size_pretty(pg_indexes_size(relid)) AS index_size,
  n_live_tup AS row_count
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC
LIMIT 30;
```

Bảng nào > 100MB = cần tối ưu. Bảng nào > 50K rows = cần thêm index hoặc cleanup.

### A5. Realtime subscriptions

`Dashboard → Database → Replication`

Xem table nào đang có realtime publication. Nếu thấy bảng không cần realtime mà vẫn enable → tắt để giảm event.

## B. Cài cleanup tự động (5 phút)

Mở `migrations/2026-05-cleanup-old-data.sql` → copy → paste vào SQL Editor → **Run**.

Sau đó:
- Activity logs > 90 ngày sẽ tự xóa
- Notifications cũ tự xóa
- Chat messages đã delete > 30 ngày tự dọn
- pg_cron tự chạy mỗi Chủ nhật 3h sáng

## C. Setup alerts (10 phút) — quan trọng

Vào `Dashboard → Settings → Notifications` (hoặc Project Settings → Alerts):

**Bật alerts:**
- Egress > 70% of plan limit → email
- Egress > 90% of plan limit → email + SMS
- Database CPU > 80% → email
- Database disk > 80% → email
- Connection > 80% of pool → email

Sẽ nhận email cảnh báo trước khi service bị restrict.

## D. Optimize Connection Pooling

Hiện tại bạn thấy `23/60 conns`. Nếu app scale lên 30+ nhân viên cùng dùng có thể full.

**Cách check:** Dashboard → Settings → **Connection Pooling**:

- **Pool Mode**: nên là **Transaction** (không phải Session)
- **Max Client Connections**: nếu nâng compute lên Micro/Small thì pool tự tăng

**Trong code:**

Kiểm tra `src/supabaseClient.js`:

```js
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(URL, KEY, {
  realtime: { params: { eventsPerSecond: 10 } }, // giới hạn realtime
  db: { schema: 'public' },
});
```

Nếu thiếu config trên thì thêm để giảm tải.

## E. Compute size

Hiện tại: `t4g.nano` (RAM 0.5GB, đang dùng 66%).

| Tier | RAM | Giá/tháng | Dùng cho |
|---|---|---|---|
| Nano | 0.5GB | Free (có Pro) | 1-10 user |
| Micro | 1GB | $10 | 10-30 user |
| Small | 2GB | $15 | 30-100 user |
| Medium | 4GB | $60 | 100-300 user |

**Quy luật:** RAM > 80% kéo dài 1-2 ngày = upgrade.

Hiện tại 66% là biên giới — theo dõi 3 ngày sau deploy:
- Nếu xuống 40-50% (do user mới quen app) → giữ Nano
- Nếu lên 75-85% → nâng Micro

## F. Region check (latency)

Hiện tại: **South Asia (Mumbai)** — xa Việt Nam.

**Test latency:**
```bash
ping YOUR_REF.supabase.co
```

- < 50ms → ổn
- 50-100ms → chấp nhận được
- > 100ms → nên migrate region

Migrate Mumbai → Singapore (ap-southeast-1):
- Latency từ VN: 100ms → 30ms
- Mất ~2-3 tiếng làm: backup → restore project mới → update env Vercel
- Nên làm vào tối Chủ nhật khi ít user

## G. Cấu hình kéo dài tốt

### G1. Kích hoạt PITR (Point-in-Time Recovery)

Pro Plan có **PITR**: backup mọi giây trong 7 ngày. Đáng giá khi xóa nhầm data.

`Settings → Add-ons → Point-in-Time Recovery` → Enable ($100/tháng — tùy chọn)

Hoặc ít nhất bật **Daily Backup** (free với Pro).

### G2. Read Replicas (chỉ cần khi user > 50)

Tách read query sang replica → giảm tải primary DB. Chưa cần ngay.

### G3. Compute Add-ons quanh hiệu năng

`Settings → Add-ons` → check có addon "Custom Domain", "PITR", "Compute upgrade" gì đang chạy không. Tắt cái không dùng để tiết kiệm.

## H. Code-level tối ưu (sẽ làm sau)

Còn 186 chỗ dùng `select('*')`. Trong số đó:
- Cần tối ưu: bảng có cột metadata/JSONB lớn (orders, tasks, chat_messages)
- Có thể giữ: bảng nhỏ < 100 rows (warehouses, departments, positions)

**Mức ưu tiên:**
1. **chat_messages** — đã pagination, nhưng có thể bỏ `attachments`, `metadata` khi list
2. **orders** — đã có filter ngày, có thể chỉ select cột cần khi list
3. **products** — nếu có cột `images` (array URL) hoặc `metadata` nặng

## I. Schedule monitoring

Đặt 1 reminder mỗi tuần (ví dụ thứ 2 sáng):
1. Vào Supabase Usage
2. Check egress vs cùng kỳ tuần trước
3. Nếu tăng đột ngột → check Reports → API xem bảng nào tốn

## TÓM TẮT — VIỆC LÀM TUẦN NÀY

- [ ] A1-A4: Audit dashboard, gửi screenshot top tables
- [ ] B: Chạy SQL cleanup
- [ ] C: Bật email alerts
- [ ] E: Theo dõi RAM 3 ngày sau deploy
- [ ] F: Test ping, đo latency
- [ ] G1: Bật Daily Backup nếu chưa

Sau khi xong A-G, gửi tôi data để tôi đề xuất tiếp.
