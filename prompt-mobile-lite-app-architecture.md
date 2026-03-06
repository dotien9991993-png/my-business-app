# PROMPT: MOBILE LITE APP — KIẾN TRÚC & HƯỚNG DẪN TRIỂN KHAI

> Ngày tạo: 05/03/2026
> Dùng cho: Chuyển context sang chat mới khi làm mobile UI

---

## TỔNG QUAN

### Mục tiêu
Xây dựng **giao diện mobile độc lập** (Mobile Lite App) cho nhân viên Hoàng Nam Audio, chạy song song với desktop. Mobile chỉ gồm các chức năng **thiết yếu** mà nhân viên cần dùng hàng ngày trên điện thoại.

### Nguyên tắc cốt lõi
1. **Data dùng chung** — cùng Supabase, cùng tables, cùng RLS policies
2. **UI hoàn toàn độc lập** — mobile viết riêng từ đầu, KHÔNG sửa code desktop
3. **Desktop KHÔNG bị ảnh hưởng** — nhân viên đang sử dụng hàng ngày
4. **Tối giản** — chỉ 5 tab, mỗi module chỉ có chức năng cần thiết nhất
5. **File mới 100%** — tạo file trong `src/mobile/`, không import component desktop

### Tech stack
- React + Vite + Tailwind CSS (chung với desktop)
- Supabase (chung database + realtime)
- Capacitor (wrap thành iOS app)
- Cloudinary (upload ảnh/file)

---

## KIẾN TRÚC THƯ MỤC

```
src/
├── App.jsx                        ← Thêm: if(isMobile) return <MobileApp />
├── hooks/useMobile.js             ← ĐÃ CÓ: detect mobile (< 768px hoặc Capacitor)
│
├── mobile/                        ← THƯ MỤC MỚI — toàn bộ mobile code ở đây
│   ├── MobileApp.jsx              ← Shell: auth check → header + content + bottom nav
│   ├── styles/
│   │   └── mobile.css             ← CSS riêng cho mobile (scoped, không ảnh hưởng desktop)
│   │
│   ├── hooks/                     ← Logic riêng cho mobile, query thẳng Supabase
│   │   ├── useMobileAuth.js       ← Auth: login, currentUser, tenant_id, logout
│   │   ├── useMobileChat.js       ← Chat: rooms, messages, send, realtime
│   │   ├── useMobileAttendance.js ← Chấm công: check-in/out, lịch sử
│   │   ├── useMobileOrders.js     ← Đơn hàng: danh sách, chi tiết, filter
│   │   ├── useMobileMedia.js      ← Video tasks: danh sách, cập nhật tiến trình
│   │   └── useMobileProfile.js    ← Profile: thông tin cá nhân, lương, đơn từ
│   │
│   ├── components/                ← Shared components dùng chung giữa các module
│   │   ├── MobileHeader.jsx       ← Header 48px: title + actions
│   │   ├── MobileBottomNav.jsx    ← 5 tab cố định dưới cùng
│   │   ├── MobileLoading.jsx      ← Skeleton / spinner
│   │   ├── MobileEmpty.jsx        ← Empty state
│   │   ├── MobileAvatar.jsx       ← Avatar user
│   │   ├── MobilePullRefresh.jsx  ← Kéo xuống refresh
│   │   └── MobileSearchBar.jsx    ← Thanh tìm kiếm
│   │
│   ├── pages/                     ← 5 trang chính, mỗi trang = 1 tab
│   │   ├── chat/                  ← TAB 1: Chat nội bộ
│   │   │   ├── ChatPage.jsx       ← Entry: room list hoặc conversation
│   │   │   ├── ChatRoomList.jsx   ← Danh sách phòng chat + search
│   │   │   ├── ChatConversation.jsx ← Màn hình chat (tin nhắn + input)
│   │   │   ├── ChatMessage.jsx    ← Bubble tin nhắn (text, ảnh, file)
│   │   │   ├── ChatInput.jsx      ← Input: text + attach ảnh + send
│   │   │   ├── ChatHeader.jsx     ← Header trong conversation
│   │   │   └── ChatNewGroup.jsx   ← Tạo nhóm mới
│   │   │
│   │   ├── attendance/            ← TAB 2: Chấm công
│   │   │   ├── AttendancePage.jsx ← Entry: nút chấm công + lịch sử
│   │   │   ├── CheckInButton.jsx  ← Nút lớn check-in / check-out
│   │   │   ├── AttendanceCalendar.jsx ← Lịch tháng (màu theo trạng thái)
│   │   │   └── AttendanceDetail.jsx   ← Chi tiết 1 ngày
│   │   │
│   │   ├── orders/                ← TAB 3: Đơn hàng
│   │   │   ├── OrdersPage.jsx     ← Entry: danh sách đơn + filter
│   │   │   ├── OrderCard.jsx      ← Card đơn hàng (mã, KH, tổng tiền, trạng thái)
│   │   │   ├── OrderDetail.jsx    ← Chi tiết đơn (sản phẩm, thanh toán, VVC)
│   │   │   └── OrderFilters.jsx   ← Lọc: trạng thái, ngày, tìm kiếm
│   │   │
│   │   ├── media/                 ← TAB 4: Video tasks
│   │   │   ├── MediaPage.jsx      ← Entry: danh sách task
│   │   │   ├── TaskCard.jsx       ← Card task (tên, deadline, progress, assignee)
│   │   │   ├── TaskDetail.jsx     ← Chi tiết task + cập nhật tiến trình
│   │   │   └── TaskComments.jsx   ← Comments trong task
│   │   │
│   │   └── profile/               ← TAB 5: Tôi
│   │       ├── ProfilePage.jsx    ← Entry: menu các mục cá nhân
│   │       ├── MyInfo.jsx         ← Thông tin cá nhân (tên, SĐT, ảnh)
│   │       ├── MyPayroll.jsx      ← Xem phiếu lương theo tháng
│   │       ├── MyLeaveRequests.jsx ← Đơn xin nghỉ (tạo + lịch sử)
│   │       └── MySettings.jsx     ← Cài đặt (đổi mật khẩu, thông báo)
│   │
│   └── utils/
│       ├── formatters.js          ← Format tiền VND, ngày giờ
│       └── constants.js           ← Màu sắc, breakpoints, config
│
├── components/                    ← Desktop components — KHÔNG SỬA
├── pages/                         ← Desktop pages — KHÔNG SỬA
└── ...
```

---

## ĐIỂM KẾT NỐI DUY NHẤT VỚI DESKTOP

### App.jsx — Thêm 3 dòng duy nhất
```javascript
import { useMobile } from './hooks/useMobile';
import MobileApp from './mobile/MobileApp';

function App() {
  const isMobile = useMobile();

  // ĐÂY LÀ DÒNG DUY NHẤT THÊM VÀO — desktop code phía dưới giữ nguyên 100%
  if (isMobile) return <MobileApp />;

  // ... toàn bộ desktop code giữ nguyên ...
}
```

### Supabase client — Import từ file có sẵn
```javascript
// Mobile hooks import supabase client từ file đã có
import { supabase } from '../../supabaseClient';
```

### Dùng chung gì từ desktop?
| Được dùng chung | KHÔNG dùng chung |
|-----------------|------------------|
| `supabaseClient.js` (client instance) | Components UI |
| `useMobile.js` (hook detect) | Context/Provider phức tạp |
| Cloudinary config (env vars) | CSS desktop |
| Auth logic cơ bản (nếu đã tách hook) | State management desktop |

---

## 5 MODULE CHI TIẾT

---

### MODULE 1: CHAT NỘI BỘ 💬

**Mục đích**: Nhân viên nhắn tin nội bộ trên điện thoại

**Màn hình chính**:
- **Room List**: Danh sách phòng chat, sắp theo tin nhắn mới nhất, badge unread count, avatar nhóm/người
- **Conversation**: Tin nhắn dạng bubble, scroll infinite, auto-scroll khi có tin mới

**Chức năng**:
| Chức năng | Mô tả | Ưu tiên |
|-----------|-------|---------|
| Xem danh sách chat | Rooms + unread count + last message | P0 |
| Gửi/nhận tin nhắn text | Realtime qua Supabase | P0 |
| Gửi ảnh | Upload Cloudinary → gửi URL | P0 |
| Tìm kiếm phòng chat | Search by room name | P1 |
| Reply tin nhắn | Swipe hoặc long-press → reply | P1 |
| @Mention | Gõ @ → danh sách thành viên | P1 |
| Tạo nhóm chat | Chọn thành viên → đặt tên → tạo | P2 |
| Gửi file | Upload file → gửi link | P2 |
| Xem ảnh fullscreen | Tap ảnh → zoom | P1 |

**Supabase tables liên quan**:
```
chat_rooms — id, name, type (direct/group), tenant_id
chat_room_members — room_id, user_id, last_read_at
chat_messages — id, room_id, sender_id, content, type, reply_to, created_at
```

**Realtime**: Subscribe channel `mobile-chat-{tenant_id}-{userId}` — filter theo rooms user tham gia

**Hook `useMobileChat.js` cần expose**:
```javascript
{
  rooms,              // Danh sách phòng, sorted by last message
  messages,           // Messages của room đang mở
  unreadCounts,       // Map: room_id → count
  loading,
  sendMessage(roomId, content, type),
  sendImage(roomId, file),
  markAsRead(roomId),
  fetchMoreMessages(roomId, before),
  searchRooms(query),
  createGroup(name, memberIds),
}
```

**Lưu ý quan trọng**:
- Realtime channel phải KHÁC TÊN với desktop để không conflict
- iOS keyboard: dùng `visualViewport` API để sync input position
- Long-press context menu: reply, copy, delete (nếu là tin của mình)
- Date separator giữa các ngày khác nhau

---

### MODULE 2: CHẤM CÔNG ✅

**Mục đích**: Nhân viên check-in/out hàng ngày trên điện thoại

**Màn hình chính**:
- **Trang chấm công**: Nút lớn ở giữa (Check-in hoặc Check-out), trạng thái hôm nay, giờ vào/ra
- **Lịch tháng**: Calendar view, mỗi ngày tô màu theo trạng thái (đủ công/thiếu/nghỉ/trễ)

**Chức năng**:
| Chức năng | Mô tả | Ưu tiên |
|-----------|-------|---------|
| Check-in | Nút lớn, ghi timestamp + location (optional) | P0 |
| Check-out | Nút lớn, ghi timestamp | P0 |
| Xem trạng thái hôm nay | Đã check-in chưa, giờ vào, giờ ra | P0 |
| Lịch tháng | Calendar tô màu, tap xem chi tiết ngày | P1 |
| Tổng kết tháng | Số ngày công, số giờ, trễ, nghỉ | P1 |
| Ghi chú check-in | Lý do trễ, ghi chú đặc biệt | P2 |

**Supabase tables liên quan**:
```
attendance — id, user_id, tenant_id, date, check_in, check_out, status, note
```

**Hook `useMobileAttendance.js` cần expose**:
```javascript
{
  todayRecord,        // Record chấm công hôm nay (hoặc null)
  monthRecords,       // Tất cả records trong tháng đang xem
  monthSummary,       // { totalDays, lateDays, absentDays, totalHours }
  loading,
  checkIn(note?),
  checkOut(note?),
  fetchMonth(year, month),
}
```

**UI gợi ý**:
- Nút check-in: hình tròn lớn, màu xanh lá (#15803d), icon ✓
- Nút check-out: hình tròn lớn, màu đỏ, icon ✕
- Đã check-in rồi → hiện giờ vào + nút check-out
- Chưa check-in → hiện nút check-in
- Calendar: ô xanh = đủ công, ô vàng = trễ, ô đỏ = nghỉ không phép, ô xám = nghỉ có phép

---

### MODULE 3: ĐƠN HÀNG 📦

**Mục đích**: Xem nhanh tình trạng đơn hàng (chủ yếu read-only, có thể cập nhật trạng thái)

**Màn hình chính**:
- **Danh sách đơn**: Cards, filter theo trạng thái, search theo mã đơn/tên KH
- **Chi tiết đơn**: Thông tin KH, sản phẩm, thanh toán, vận chuyển, trạng thái

**Chức năng**:
| Chức năng | Mô tả | Ưu tiên |
|-----------|-------|---------|
| Xem danh sách đơn hàng | Cards + trạng thái + tổng tiền | P0 |
| Filter theo trạng thái | Mới / Đang xử lý / Đang giao / Hoàn thành / Huỷ | P0 |
| Tìm kiếm đơn | Theo mã đơn, tên KH, SĐT | P0 |
| Xem chi tiết đơn | Sản phẩm, giá, thanh toán, VVC | P0 |
| Cập nhật trạng thái đơn | Chuyển trạng thái (nếu có quyền) | P1 |
| Gọi điện KH | Tap SĐT → mở dialer | P1 |
| Xem đơn hôm nay | Quick filter đơn trong ngày | P1 |

**Supabase tables liên quan**:
```
orders — id, order_code, customer_id, status, total, payment_status, shipping_status, created_at
order_items — order_id, product_id, quantity, unit_price, serial_numbers
customers — id, name, phone, address
payment_transactions — order_id, method, amount, status
```

**Hook `useMobileOrders.js` cần expose**:
```javascript
{
  orders,             // Danh sách đơn (paginated)
  selectedOrder,      // Chi tiết đơn đang xem
  filters,            // { status, search, dateRange }
  loading,
  fetchOrders(filters, page),
  fetchOrderDetail(orderId),
  updateOrderStatus(orderId, newStatus),
  todayStats,         // { count, totalRevenue }
}
```

**UI gợi ý**:
- Card đơn hàng: mã đơn (bold), tên KH, tổng tiền (highlight), trạng thái (badge màu)
- Filter: horizontal scroll chips ở trên cùng
- Chi tiết: accordion sections (KH / Sản phẩm / Thanh toán / Vận chuyển)
- Tap SĐT khách hàng → `tel:` link mở dialer

---

### MODULE 4: VIDEO TASKS 🎬

**Mục đích**: Nhân viên media xem task được giao, cập nhật tiến trình sản xuất video

**Màn hình chính**:
- **Danh sách task**: Cards, filter "Của tôi" / "Tất cả", sort theo deadline
- **Chi tiết task**: Thông tin, tiến trình, comments, cập nhật trạng thái

**Chức năng**:
| Chức năng | Mô tả | Ưu tiên |
|-----------|-------|---------|
| Xem task được giao | Danh sách task "Của tôi" | P0 |
| Xem chi tiết task | Tên, mô tả, deadline, assignee, trạng thái | P0 |
| Cập nhật tiến trình | Chuyển trạng thái (Quay xong / Dựng xong / Review...) | P0 |
| Xem tất cả tasks | Danh sách toàn bộ (nếu có quyền) | P1 |
| Comment trong task | Ghi chú, trao đổi | P1 |
| Xem deadline | Highlight task sắp hết hạn (đỏ) | P1 |
| Đính kèm file/ảnh | Upload kết quả vào task | P2 |

**Supabase tables liên quan**:
```
video_tasks — id, title, description, status, deadline, assignee_id, created_by, tenant_id
video_task_members — task_id, user_id, role (director/editor/cameraman...)
video_task_comments — task_id, user_id, content, created_at
video_task_progress — task_id, stage, completed_at
```

**Hook `useMobileMedia.js` cần expose**:
```javascript
{
  myTasks,            // Tasks được giao cho user hiện tại
  allTasks,           // Tất cả tasks (nếu có quyền)
  selectedTask,       // Chi tiết task đang xem
  loading,
  fetchMyTasks(filters),
  fetchTaskDetail(taskId),
  updateTaskStatus(taskId, newStatus),
  addComment(taskId, content),
  uploadAttachment(taskId, file),
}
```

**UI gợi ý**:
- Card task: tên video (bold), deadline (đỏ nếu sắp hết), progress bar, avatar assignees
- Trạng thái: chips màu (Chờ quay → Đang quay → Dựng → Review → Xong)
- Chi tiết: timeline tiến trình ở trên, comments ở dưới
- Nút cập nhật trạng thái: nổi bật ở cuối màn hình

---

### MODULE 5: TÔI 👤

**Mục đích**: Thông tin cá nhân, lương, đơn từ, cài đặt — tất cả liên quan đến bản thân nhân viên

**Màn hình chính**:
- **Profile menu**: Avatar + tên + chức vụ ở trên, menu list bên dưới

**Chức năng hiện tại**:
| Chức năng | Mô tả | Ưu tiên |
|-----------|-------|---------|
| Thông tin cá nhân | Tên, SĐT, email, phòng ban, ảnh đại diện | P0 |
| Xem phiếu lương | Phiếu lương theo tháng (read-only) | P0 |
| Đăng xuất | Logout | P0 |
| Đổi mật khẩu | Đổi password | P1 |
| Đổi ảnh đại diện | Upload ảnh mới | P1 |

**Chức năng mở rộng sau**:
| Chức năng | Mô tả | Ưu tiên |
|-----------|-------|---------|
| Đơn xin nghỉ | Tạo đơn nghỉ phép + lịch sử + trạng thái duyệt | P1 |
| Đơn công tác | Đơn đi công tác | P2 |
| Đơn tăng ca | Đơn làm thêm giờ | P2 |
| Lịch sử KPI | Xem điểm KPI theo tháng | P2 |
| Thông báo | Cài đặt nhận thông báo | P2 |

**Supabase tables liên quan**:
```
profiles — id, full_name, phone, email, department, avatar_url, role
payroll — id, user_id, month, year, base_salary, allowances, deductions, net_salary, tenant_id
leave_requests — id, user_id, type (annual/sick/personal), from_date, to_date, reason, status, approved_by
```

**Hook `useMobileProfile.js` cần expose**:
```javascript
{
  profile,            // Thông tin cá nhân
  payrolls,           // Danh sách phiếu lương
  selectedPayroll,    // Chi tiết 1 phiếu lương
  leaveRequests,      // Đơn xin nghỉ
  loading,
  fetchProfile(),
  updateAvatar(file),
  changePassword(oldPw, newPw),
  fetchPayroll(year, month),
  submitLeaveRequest(data),
  logout(),
}
```

**UI gợi ý**:
- Header: avatar lớn + tên + chức vụ + phòng ban
- Menu: list items với icon bên trái (giống Settings iOS)
- Phiếu lương: card hiện lương NET lớn, tap xem chi tiết (lương cơ bản, phụ cấp, khấu trừ)
- Đơn từ: danh sách cards với badge trạng thái (Chờ duyệt / Đã duyệt / Từ chối)

---

## BOTTOM NAV LAYOUT

```
┌───────────────────────────────────────────────┐
│                                               │
│              [NỘI DUNG TRANG]                 │
│                                               │
├───────┬───────┬───────┬───────┬───────────────┤
│  💬   │  ✅   │  📦   │  🎬   │     👤        │
│ Chat  │Chấm   │Đơn    │Video  │     Tôi       │
│       │ công  │ hàng  │       │               │
└───────┴───────┴───────┴───────┴───────────────┘
```

- Nền: trắng hoặc xanh lá đậm (#15803d) — tuỳ chọn design
- Tab active: highlight icon + text
- Badge đỏ: unread chat count, task sắp deadline

---

## MOBILE APP SHELL — MobileApp.jsx

```javascript
// Cấu trúc cơ bản của MobileApp.jsx
import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import MobileHeader from './components/MobileHeader';
import MobileBottomNav from './components/MobileBottomNav';
import ChatPage from './pages/chat/ChatPage';
import AttendancePage from './pages/attendance/AttendancePage';
import OrdersPage from './pages/orders/OrdersPage';
import MediaPage from './pages/media/MediaPage';
import ProfilePage from './pages/profile/ProfilePage';

export default function MobileApp() {
  const [currentUser, setCurrentUser] = useState(null);
  const [tenantId, setTenantId] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Auth check: lấy session → lấy profile → set currentUser + tenantId
    // Nếu chưa login → hiện MobileLogin
  }, []);

  if (loading) return <MobileLoading />;
  if (!currentUser) return <MobileLogin onLogin={handleLogin} />;

  const renderPage = () => {
    switch (activeTab) {
      case 'chat': return <ChatPage user={currentUser} tenantId={tenantId} />;
      case 'attendance': return <AttendancePage user={currentUser} tenantId={tenantId} />;
      case 'orders': return <OrdersPage user={currentUser} tenantId={tenantId} />;
      case 'media': return <MediaPage user={currentUser} tenantId={tenantId} />;
      case 'profile': return <ProfilePage user={currentUser} tenantId={tenantId} />;
    }
  };

  return (
    <div className="mobile-app">
      <MobileHeader title={getTitle(activeTab)} />
      <main className="mobile-content">
        {renderPage()}
      </main>
      <MobileBottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
```

---

## CSS MOBILE — NGUYÊN TẮC

```css
/* mobile.css — CHỈ áp dụng trong mobile shell, không ảnh hưởng desktop */

.mobile-app {
  display: flex;
  flex-direction: column;
  height: 100dvh;              /* dynamic viewport height cho iOS */
  overflow: hidden;
  background: #f5f5f5;
  font-family: -apple-system, BlinkMacSystemFont, sans-serif;
}

.mobile-header {
  height: 48px;
  flex-shrink: 0;
  /* safe-area cho iPhone notch */
  padding-top: env(safe-area-inset-top);
}

.mobile-content {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  /* tránh content bị nav che */
  padding-bottom: calc(60px + env(safe-area-inset-bottom));
}

.mobile-bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: calc(60px + env(safe-area-inset-bottom));
  padding-bottom: env(safe-area-inset-bottom);
  flex-shrink: 0;
}
```

**QUAN TRỌNG**:
- Dùng `100dvh` thay vì `100vh` (iOS Safari address bar)
- Luôn có `env(safe-area-inset-*)` cho notch/home indicator
- `-webkit-overflow-scrolling: touch` cho smooth scroll
- Không dùng `position: fixed` cho content (chỉ cho nav/header)

---

## REALTIME SUBSCRIPTIONS — TRÁNH CONFLICT

```javascript
// Mobile dùng channel name KHÁC desktop để tránh conflict
// Desktop: 'chat-messages'
// Mobile:  'mobile-chat-messages-{userId}'

const channel = supabase
  .channel(`mobile-chat-${tenantId}-${userId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'chat_messages',
    filter: `tenant_id=eq.${tenantId}`
  }, handleNewMessage)
  .subscribe();

// QUAN TRỌNG: cleanup khi unmount
return () => {
  supabase.removeChannel(channel);
};
```

---

## CAPACITOR — BUILD & TEST

```bash
# Build web → sync vào iOS project
npm run build
npx cap sync ios
npx cap open ios    # Mở Xcode

# Trong Xcode: chọn iPhone 15 Pro → Run (⌘R)
```

**Config Capacitor** (`capacitor.config.ts`):
```json
{
  "appId": "vn.hoangnamaudio.app",
  "appName": "Hoàng Nam Audio",
  "server": {
    "url": "https://in.hoangnamaudio.vn"
  },
  "plugins": {
    "Keyboard": { "resize": "ionic", "resizeOnFullScreen": true },
    "StatusBar": { "style": "light" },
    "SplashScreen": { "launchAutoHide": false }
  }
}
```

---

## THỨ TỰ TRIỂN KHAI

| Đợt | Module | Ước lượng | Ghi chú |
|------|--------|-----------|---------|
| 1 | MobileApp shell + Auth + Bottom Nav | 1 ngày | Khung cơ bản, login, navigate |
| 2 | Chat (fix bug + hoàn thiện) | 3-4 ngày | Đã có 70% code, cần fix + test |
| 3 | Chấm công | 1-2 ngày | Module đơn giản nhất |
| 4 | Đơn hàng | 2-3 ngày | Chủ yếu read-only, list + detail |
| 5 | Video tasks | 2-3 ngày | List + detail + update status |
| 6 | Profile + Lương | 2 ngày | Read-only + menu |
| 7 | Polish + Test iPhone | 2-3 ngày | UI polish, test thật, fix edge cases |
| 8 | Submit App Store | 1 ngày | Screenshots, Privacy Policy, submit |

**Tổng ước lượng: ~2-3 tuần**

---

## CHECKLIST TRƯỚC KHI BẮT ĐẦU MỖI MODULE

- [ ] Xác nhận tables Supabase đã có đủ (check schema)
- [ ] Tạo hook `useMobile[Module].js` — test query data thành công
- [ ] Tạo page entry `[Module]Page.jsx` — render data cơ bản
- [ ] Thêm vào `MobileApp.jsx` switch case
- [ ] Test trên Chrome DevTools mobile view
- [ ] Test trên iPhone thật qua Capacitor
- [ ] Kiểm tra desktop KHÔNG bị ảnh hưởng (mở browser > 768px)

---

## LƯU Ý ĐẶC BIỆT

1. **KHÔNG import component từ `src/components/` (desktop)** — luôn tạo mới trong `src/mobile/`
2. **KHÔNG sửa file desktop** — ngoại trừ 3 dòng trong App.jsx
3. **Mỗi hook mobile query thẳng Supabase** — không phụ thuộc DataContext desktop
4. **Truyền `currentUser` và `tenantId` qua props** — đơn giản, dễ debug
5. **Commit thường xuyên** — mỗi module xong → commit + push
6. **Test desktop sau mỗi commit** — mở > 768px, kiểm tra không hỏng

---

## CẤU HÌNH HIỆN TẠI (reference)

```
Supabase: Free plan (reset egress 06/03)
Cloudinary: dhvn5cueh / hoangnam_unsigned
Vercel: deploy từ GitHub main
Capacitor: vn.hoangnamaudio.app / iPhone 15 Pro / Tin DO
Production: https://in.hoangnamaudio.vn
```
