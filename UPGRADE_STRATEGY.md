# Chiến lược nâng cấp toàn diện — Hoàng Nam Audio ERP

## Tóm tắt trạng thái hiện tại

### Đang có (foundation rất tốt)

**Module nghiệp vụ (10 modules):**
- Sales (đơn hàng, khách hàng, COD reconciliation, returns, coupons, loyalty)
- Warehouse (multi-warehouse, WAC, stocktake, transfers, supplier returns, product variants, combo)
- Technical (job/wage technician)
- Finance (receipts/payments, debts, cash book, salaries)
- HRM (employees, attendance, leave, KPI, payroll)
- Warranty (serial tracking, warranty cards, repairs, public check)
- Media (task management)
- Chat nội bộ + Zalo OA chat
- Dashboard/Reports

**Tích hợp đã có:**
- ✅ ViettelPost API (createOrder, tracking, fees, COD)
- ✅ Cloudinary (upload ảnh)
- ✅ Zalo OA (chat khách hàng, gửi notification)
- ✅ Facebook stats
- ✅ Haravan import (sync đơn từ Haravan)
- ✅ Push notification (đã code, cần Edge Function deploy)
- ✅ Capacitor iOS/Android app
- ✅ PWA

**Constants chứa nhưng CHƯA integrate:**
- GHN (Giao Hàng Nhanh)
- GHTK (Giao Hàng Tiết Kiệm)
- J&T Express
- Grab Express

### Gap chính

1. **Chỉ ViettelPost được integrate thực sự** — 5 carrier khác chỉ là dropdown lựa chọn
2. **Không có marketplace integration** (Shopee, Lazada, TikTok Shop)
3. **Không có POS** cho cửa hàng showroom offline
4. **Không có hóa đơn điện tử** (bắt buộc theo Luật quản lý thuế 2022)
5. **Không có public order tracking page** (khách phải hỏi staff)
6. **Không có payment gateway online** (VNPay, MoMo, ZaloPay)
7. **Không có module CRM marketing** (gửi SMS/Email/Zalo broadcast)
8. **Reports đơn giản**, chưa có cohort analysis, sales velocity, dead stock
9. **Auth chưa dùng Supabase Auth** (custom auth, có rủi ro)
10. **Tasks lưu user name thay vì user_id** (bug khi đổi tên)

---

## Roadmap theo Phase

Chia 4 phase, mỗi phase 1-2 tháng. ROI giảm dần từ Phase 1 → 4. Đi tuần tự để không dồn rủi ro.

### Phase 1 — Vận chuyển + Tracking (1 tháng)
**Mục tiêu:** Tăng tỷ lệ giao thành công, giảm thời gian xử lý đơn, tăng UX khách hàng.

### Phase 2 — Multi-channel sales + Payment (1-2 tháng)
**Mục tiêu:** Tăng doanh thu, đồng bộ đơn từ marketplace, nhận thanh toán online.

### Phase 3 — POS + Hóa đơn điện tử + Kế toán (1 tháng)
**Mục tiêu:** Đồng bộ showroom với online, tuân thủ pháp luật, kết nối phần mềm kế toán.

### Phase 4 — BI + CRM + AI (2 tháng)
**Mục tiêu:** Data-driven decision, retention khách hàng, automation thông minh.

---

## PHASE 1 — VẬN CHUYỂN & TRACKING (1 tháng)

### 1.1 Tích hợp đa carrier (GHN + GHTK + J&T)

**Tại sao:** ViettelPost không phải lúc nào cũng rẻ/nhanh. GHN rẻ hơn 10-20%, J&T phổ biến cho COD miền Tây, GHTK mạnh ở TP HCM.

**Việc cần làm:**

1. **GHN API:** Token + 5 endpoint chính:
   - `POST /shiip/public-api/v2/shipping-order/create` — tạo đơn
   - `POST /shiip/public-api/v2/shipping-order/fee` — tính phí
   - `POST /shiip/public-api/v2/master-data/province` — đọc danh sách tỉnh/huyện/xã
   - `POST /shiip/public-api/v2/shipping-order/cancel`
   - Webhook nhận status update
2. **GHTK API:** tương tự, đơn giản hơn
3. **J&T API:** phức tạp hơn, cần kết nối qua đối tác

**Architecture:** tạo `src/utils/shippingProviders/` với adapter pattern:

```js
// src/utils/shippingProviders/index.js
export const providers = {
  viettel_post: require('./viettelPostAdapter'),
  ghn: require('./ghnAdapter'),
  ghtk: require('./ghtkAdapter'),
  jt: require('./jtAdapter'),
};

// Mỗi adapter implement cùng interface:
// - calculateFee(from, to, weight, value)
// - createOrder(orderData)
// - getTracking(trackingNumber)
// - cancelOrder(trackingNumber)
```

→ Khi user chọn carrier trong UI, app gọi đúng adapter.

**Effort:** GHN 3 ngày, GHTK 2 ngày, J&T 4 ngày. Tổng ~2 tuần.

### 1.2 Auto-suggest carrier theo rule

**Tại sao:** Nhân viên không cần tự chọn carrier. App tự gợi ý dựa trên:
- Khoảng cách (cùng tỉnh → Grab Express; liên tỉnh → VTP/GHN)
- Trọng lượng (nhẹ → GHN; nặng > 10kg → VTP)
- Giá trị đơn (cao → carrier có bảo hiểm)
- Giờ đặt đơn (chiều tối → carrier có giao sáng mai)

**Implementation:**
```js
// settings có shipping_rules JSON
{
  rules: [
    { if: "same_province && weight < 5", carrier: "grab_express" },
    { if: "weight > 10", carrier: "viettel_post", service: "VCN" },
    { if: "to.region === 'south' && cod", carrier: "ghtk" },
  ],
  fallback: "viettel_post"
}
```

UI: dropdown "Carrier" có icon ⭐ ở option được gợi ý.

**Effort:** 2 ngày.

### 1.3 Public order tracking page

**Tại sao:** Khách hiện tại phải gọi/nhắn staff hỏi đơn. Page public tracking → giảm 30-50% workload chăm sóc khách.

**Implementation:**
- URL: `https://in.hoangnamaudio.vn/#track/HN12345`
- Hoặc đẹp hơn: `https://track.hoangnamaudio.vn/HN12345`
- Public, không cần login
- Hiện: tên KH (ẩn 1 phần), trạng thái đơn, lịch sử shipping events (từ webhook), expected delivery date
- Có nút "Gọi shop", "Chat Zalo"

**Effort:** 2 ngày (đã có sẵn schema `shipping_tracking_events`).

### 1.4 Webhook 2 chiều cho tất cả carrier

**Tại sao:** Hiện tại check-shipping cron mỗi 8h/lần (Hobby plan giới hạn). Webhook = realtime.

**Implementation:**
- Mỗi carrier có endpoint riêng:
  - `/api/webhooks/vtp` (đã có)
  - `/api/webhooks/ghn` (mới)
  - `/api/webhooks/ghtk` (mới)
  - `/api/webhooks/jt` (mới)
- Verify signature từ carrier
- Update order status + insert vào `shipping_tracking_events`
- Trigger Supabase Realtime → app tự cập nhật UI

**Effort:** 2 ngày.

### 1.5 SMS/Zalo notification cho khách

**Tại sao:** Khách thích nhận tin nhắn cập nhật.

**Trigger:** mỗi khi order status đổi (qua webhook):
- "Đơn HN12345 đã được giao cho ViettelPost. Tracking: VTP123ABC"
- "Đơn HN12345 đang giao, dự kiến đến trong hôm nay"
- "Đơn HN12345 đã giao thành công. Cảm ơn quý khách!"

**Channel:**
- Zalo OA (đã có) — miễn phí, ưu tiên
- SMS (eSMS, VnSky, Stringee) — fallback nếu khách chưa follow OA, ~300-500 VNĐ/SMS

**Effort:** 3 ngày.

### Tổng Phase 1
- **Thời gian:** 3-4 tuần
- **Chi phí dev:** thuê freelancer/contractor ~10-20tr VNĐ
- **ROI:** 
  - Tăng tỷ lệ giao thành công 5-10% (chọn được carrier tốt hơn)
  - Tiết kiệm phí ship ~10% (so sánh giá real-time)
  - Giảm 50% workload chăm sóc khách hỏi đơn
  - Tăng NPS khách hàng

---

## PHASE 2 — MULTI-CHANNEL + PAYMENT ONLINE (1-2 tháng)

### 2.1 Tích hợp marketplace

Đa số shop audio Việt Nam bán đa kênh:
- **Shopee Open Platform** (https://open.shopee.com) — đơn lớn nhất VN
- **Lazada Open Platform**
- **TikTok Shop API** (mới, đang tăng nhanh)
- **Facebook Shop** (qua Catalog API)

**Architecture:** giống shipping — adapter pattern:

```
src/integrations/marketplaces/
  shopee/
    auth.js
    orders.js  // pull orders, push tracking
    inventory.js  // sync stock
    webhooks.js
  lazada/
    ...
  tiktok/
    ...
```

**Flow chính:**
1. **Pull orders** từ marketplace mỗi 5-10 phút (cron) hoặc webhook
2. **Auto-map** sản phẩm marketplace ↔ products của bạn (qua SKU hoặc UPC)
3. **Sync stock**: khi xuất kho ở ERP, tự giảm stock trên 3 marketplace cùng lúc
4. **Push shipping info**: khi assign carrier, tự update tracking lên marketplace

**Effort:**
- Shopee: 5-7 ngày (API phức tạp)
- Lazada: 4-5 ngày
- TikTok Shop: 5-7 ngày (mới, doc ít hơn)

Tổng ~3-4 tuần.

**Lưu ý:** Mỗi marketplace cần đăng ký App Developer (free). Có thể dùng dịch vụ trung gian như **Sapo Omni, KiotViet, Haravan, Pancake** — họ làm sẵn, trả phí ~500K-2tr/tháng.

**Quyết định:**
- DIY: tốn 1-2 tháng dev nhưng kiểm soát hoàn toàn
- Dùng dịch vụ trung gian: nhanh nhưng phụ thuộc + phí dài hạn

→ Khuyến nghị: **dùng Pancake hoặc Haravan** cho 6 tháng đầu, sau đó DIY nếu volume lớn.

### 2.2 Payment gateway online

**Lý do:** Hiện chỉ COD + chuyển khoản tay. Khách thanh toán online ngay → giảm hủy đơn, tăng cashflow.

**Cổng phổ biến VN:**
| Cổng | Phí giao dịch | Có QR | Tích hợp |
|---|---|---|---|
| **VNPay** | 1.5% | ✓ | Dễ |
| **MoMo** | 1.8-2% | ✓ | Dễ |
| **ZaloPay** | 1.5% | ✓ | Đã có Zalo SDK |
| **Payoo** | 1.7% | ✓ | Doanh nghiệp lớn |
| **Stripe** | 4.4% | ✗ | Cho khách quốc tế |

**Implementation:**
- Tạo bảng `payment_transactions` (đã có ✓)
- Endpoint webhook `/api/webhooks/vnpay`, `/api/webhooks/momo`, `/api/webhooks/zalopay`
- UI checkout: chọn cổng → redirect → callback verify → đánh dấu đơn `paid`

**Effort:** mỗi cổng 2-3 ngày. Khuyến nghị triển khai 2 cổng đầu (VNPay + ZaloPay) — đa số khách dùng. Tổng ~1 tuần.

### 2.3 QR thanh toán động (VietQR)

**Lý do:** Hiện check chuyển khoản phải so sánh nội dung CK với mã đơn → khi nào không khớp phải kiểm tra tay.

**Solution:** dùng VietQR + Casso/Bank API:
- Khi tạo đơn, sinh QR có nội dung "HN12345"
- Casso (https://casso.vn) tự sync giao dịch ngân hàng (VPBank, MBBank, ACB, VCB...)
- Khi có CK với nội dung khớp → tự đánh dấu đơn paid

**Effort:** 3 ngày. Casso free 100 giao dịch/tháng, sau đó 200K/tháng cho không giới hạn.

### Tổng Phase 2
- **Thời gian:** 4-8 tuần
- **Chi phí:** 0 dev (nếu dùng Pancake/Haravan ~1-2tr/tháng) hoặc 20-40tr (DIY full)
- **ROI:**
  - Tăng doanh thu 30-50% (mở thêm 3 sàn)
  - Giảm 80% time đối soát thanh toán
  - Giảm 20% tỷ lệ hủy đơn (do thanh toán ngay)

---

## PHASE 3 — POS + HÓA ĐƠN ĐIỆN TỬ + KẾ TOÁN (1 tháng)

### 3.1 POS module cho showroom

**Lý do:** Nếu có cửa hàng vật lý, nhân viên hiện phải:
- Bán → ghi giấy → sau đó nhập lại vào ERP
- Hoặc bán qua KiotViet/Sapo → tách biệt với ERP → conflict tồn kho

**Solution:** thêm tab POS trong module Sales:
- UI tối ưu cho touchscreen iPad/POS
- Quick add product (gõ tên / scan barcode)
- Hỗ trợ chiết khấu nhanh
- In hóa đơn (kết nối máy in nhiệt qua Capacitor)
- Tích hợp ngay với inventory hiện có

**Effort:** 1-2 tuần.

### 3.2 Hóa đơn điện tử (Thông tư 78)

**Bắt buộc** theo luật từ 7/2022. Bạn đã không nộp HĐĐT chính thức = vi phạm + bị phạt.

**Options:**
- **VNPT Invoice** (vnpt-invoice.com.vn)
- **Viettel SInvoice**
- **MISA meInvoice**
- **EasyInvoice** (CMC TS)
- **CyberInvoice**

**Architecture:**
- Khi đơn hàng hoàn thành → tự generate hóa đơn qua API
- Lưu PDF + mã tra cứu vào order
- Gửi email/Zalo cho khách
- Tự sync với Cơ quan thuế

**Effort:** 1 tuần (chọn 1 cổng + tích hợp).

**Chi phí:** ~500K-1tr/tháng + 50-200đ/hóa đơn.

### 3.3 Sync với phần mềm kế toán

Bạn có 2 options:
- **MISA AMIS / MISA SME** — phổ biến nhất với SME VN
- **FAST Accounting**
- **BRAVO 8**

Tích hợp qua API hoặc export Excel theo template.

**Effort:** 3-5 ngày.

### Tổng Phase 3
- **Thời gian:** 3-4 tuần
- **Chi phí:** ~1-2tr/tháng phí dịch vụ + 10-15tr dev
- **ROI:**
  - Tuân thủ pháp luật (tránh phạt 4-50 triệu)
  - Showroom + online sync → không bán âm/dư stock
  - Tự động hóa kế toán → tiết kiệm 1 vị trí kế toán

---

## PHASE 4 — BI + CRM + AI (2 tháng)

### 4.1 Báo cáo nâng cao

Thêm vào Reports module:

**Cho Sales:**
- Sales velocity per SKU (số sp bán/ngày, tốc độ thay đổi)
- Cohort analysis (khách mới tháng 1 mua lại bao nhiêu tháng 2...)
- Customer lifetime value
- Repurchase rate
- Average order value theo segment

**Cho Warehouse:**
- Inventory turnover (vòng quay tồn kho)
- Days of stock (còn bao nhiêu ngày trước hết)
- Dead stock (sp không bán trong 90 ngày)
- ABC analysis (sp nào mang 80% doanh thu)
- Reorder point auto-calculation

**Tool:**
- Tự code với Recharts (đã dùng) — 1 tuần
- Hoặc embed **Metabase** (open source, free) — 2 ngày setup
- Hoặc **PowerBI** (Microsoft, $9.99/user/tháng)

**Khuyến nghị:** Metabase — connect thẳng Supabase, free, nhiều template sẵn.

### 4.2 CRM & Marketing Automation

Hiện app có `customer_interactions` nhưng chưa có marketing.

**Tính năng cần:**
- Customer segmentation (theo total spend, frequency, recency — RFM analysis)
- Auto campaign:
  - Khách 30 ngày không mua → gửi Zalo "Tặng voucher 100K"
  - Khách mua amply → 2 tháng sau gửi gợi ý mua loa subwoofer phù hợp
  - Sinh nhật khách → tặng voucher
- Email/Zalo/SMS broadcast với template
- A/B test campaign

**Tool:**
- DIY trong app (đã có Zalo OA + có thể thêm email service Sendgrid)
- Hoặc Mailchimp, Klaviyo

**Effort:** 2-3 tuần DIY.

### 4.3 AI features

- **Customer support chatbot** dùng GPT-4 / Gemini trả lời câu hỏi qua Zalo OA
- **Demand forecasting**: predict tồn kho 7/30 ngày tới dựa trên history
- **Product recommendation**: "Khách mua amply X thường mua loa Y" 
- **Image search**: KH gửi ảnh sản phẩm → tự tìm sp tương đương trong kho

**Effort:** 2-4 tuần tùy phạm vi.

**Chi phí:** OpenAI API ~$50-200/tháng tùy traffic.

### Tổng Phase 4
- **Thời gian:** 6-8 tuần
- **ROI:**
  - Tăng repeat purchase 20-30%
  - Giảm tồn kho dead 30-50%
  - Customer support tự động 50% câu hỏi

---

## Tổng chi phí + thời gian (DIY)

| Phase | Thời gian | Dev cost ước tính | ROI/tháng |
|---|---|---|---|
| Phase 1 — Shipping | 3-4 tuần | 10-20tr | +20-50tr (tiết kiệm + giao thành công) |
| Phase 2 — Multi-channel + Payment | 4-8 tuần | 20-40tr | +50-200tr (doanh thu mới) |
| Phase 3 — POS + HĐĐT | 3-4 tuần | 10-15tr | Tuân thủ + tránh phạt |
| Phase 4 — BI + CRM + AI | 6-8 tuần | 30-50tr | +30-100tr (retention) |
| **TỔNG** | **4-6 tháng** | **70-125tr** | **+100-350tr/tháng** |

---

## Kiến trúc kỹ thuật cần upgrade song song

### A. Authentication

**Hiện:** custom auth (bcrypt + localStorage), không có session expiry, không refresh token.

**Cần:** migrate sang Supabase Auth:
- Session tự refresh, expire after N giờ
- Magic link / OTP qua email/SMS
- Sign in with Google (cho nhân viên dùng Google Workspace)
- RLS policy thật sự dùng `auth.uid()`

**Effort:** 1-2 tuần migration + test.

### B. Data layer

**Hiện:** 597 query inline trong components.

**Cần:** tạo `src/data/` layer:
```
src/data/
  orders.js     // getOrders, getOrderById, createOrder, ...
  products.js
  customers.js
  ...
```
Dùng React Query / SWR cho cache + auto refetch + optimistic update.

**Effort:** 3-4 tuần (làm dần theo module).

### C. Schema refactor

- Tasks/jobs đang lưu `user.name` → đổi sang `user_id` (UUID FK)
- Một số bảng thiếu index → review query performance

**Effort:** 1-2 tuần.

### D. Testing

**Hiện:** không có test.

**Cần:**
- Unit tests cho utils (Vitest)
- E2E test cho 3 flow quan trọng nhất (Playwright):
  - Tạo đơn hàng → giao cho carrier → done
  - Chấm công + tính lương
  - Tạo + duyệt đơn nghỉ phép

**Effort:** 2 tuần setup + viết test.

### E. Monitoring

- **Sentry** (free tier 5K errors/tháng) — track lỗi production
- **PostHog** hoặc **Plausible** — analytics user behavior
- **Better Stack** — uptime monitoring

**Effort:** 2-3 ngày.

---

## Khuyến nghị thực thi

### Option A — DIY toàn bộ (control 100%, tốn time)

- Thuê 1 dev FE/FS contractor 6 tháng
- Cost: ~15-20tr/tháng × 6 = 90-120tr
- Tổng chi phí dev + service: ~150-180tr
- Bạn được sản phẩm khớp 100% nghiệp vụ

### Option B — Hybrid (khuyến nghị)

- **Phase 1 (Shipping):** DIY, vì có VTP làm mẫu rồi
- **Phase 2 (Multi-channel):** dùng **Pancake** hoặc **Haravan** (1-2tr/tháng) → tiết kiệm 1 tháng dev
- **Phase 2 (Payment):** DIY VNPay + ZaloPay (đơn giản)
- **Phase 3 (HĐĐT):** dùng **MISA meInvoice** hoặc **VNPT** (1tr/tháng)
- **Phase 4:** dùng **Metabase** cho BI (free) + DIY CRM

→ Chi phí dev ~80-100tr, chi phí service 3-5tr/tháng, được sản phẩm trong 4 tháng thay vì 6.

### Option C — Outsource hoàn toàn (nhanh nhưng đắt)

Thuê công ty làm như Pancake, Sapo, KiotViet, Haravan — họ làm sẵn ERP cho ngành audio. Cost ~5-10tr/tháng nhưng không custom được.

---

## Đề xuất bắt đầu

**Tuần này-tuần sau:** Hoàn tất deploy P0+P1 (đã làm)

**2 tuần tới:**
1. Audit Supabase chi tiết (theo SUPABASE_AUDIT_CHECKLIST.md) — đảm bảo stable
2. Test app với 10 nhân viên thật → ghi nhận pain point
3. Phỏng vấn 5 khách hàng → hỏi: "Bạn muốn app này có gì?"

**Tháng tới:** chọn Option A/B/C và bắt đầu Phase 1.

→ Mạnh dạn đề xuất Option B + bắt đầu với **Phase 1.1 (GHN integration)** trước vì:
- ROI rõ ràng (tiết kiệm phí ship 10-20%)
- Đã có VTP làm mẫu, refactor nhanh
- Không phụ thuộc bên thứ 3
- Có thể test ngay với đơn hàng thật

---

## Decision matrix — đâu làm trước?

Sắp xếp theo (Impact × Urgency / Effort):

| # | Việc | Impact | Urgency | Effort | Score |
|---|---|---|---|---|---|
| 1 | GHN integration | 9 | 7 | 3 | 21 |
| 2 | Public order tracking | 8 | 8 | 2 | 32 |
| 3 | VNPay payment | 8 | 6 | 3 | 16 |
| 4 | Hóa đơn điện tử | 6 | 10 | 5 | 12 |
| 5 | Shopee integration | 10 | 5 | 7 | 7 |
| 6 | Multi-carrier auto-suggest | 7 | 5 | 4 | 9 |
| 7 | POS module | 6 | 4 | 5 | 5 |
| 8 | Metabase BI | 7 | 3 | 2 | 11 |
| 9 | Supabase Auth migration | 7 | 8 | 6 | 9 |
| 10 | Sentry monitoring | 5 | 6 | 1 | 30 |

**Top 5 nên làm ngay sau khi P0/P1 stable:**

1. **Public order tracking page** (2 ngày) — KH tự tra cứu, giảm workload CSKH
2. **Sentry monitoring** (1 ngày) — biết khi nào app lỗi
3. **GHN integration** (3 ngày) — option vận chuyển rẻ hơn
4. **VNPay/ZaloPay** (3 ngày) — thanh toán online
5. **Metabase setup** (2 ngày) — báo cáo nâng cao

→ Tổng ~2 tuần, ROI rất cao, ít rủi ro.

---

**Bước tiếp theo:** sau khi deploy P0/P1 ổn định 1 tuần, chọn 1 trong 5 việc trên để bắt đầu. Tôi sẽ viết code + hướng dẫn chi tiết khi bạn quyết định.
