# PROMPT HÀNH ĐỘNG: BẮT ĐẦU LÀM MOBILE LITE APP

> Dùng cho: Claude Code session
> Ngày: 05/03/2026
> Upload kèm: `prompt-mobile-lite-app-architecture.md` (kiến trúc chi tiết) + `tom-tat-du-an-05-03-2026.md` (context dự án)

---

## BỐI CẢNH

App quản lý doanh nghiệp Hoàng Nam Audio (React + Vite + Supabase + Tailwind + Capacitor iOS).
- Repo: https://github.com/dotien9991993-png/my-business-app
- Production: https://in.hoangnamaudio.vn
- Desktop đang hoạt động, nhân viên sử dụng hàng ngày — **KHÔNG ĐƯỢC SỬA CODE DESKTOP**

Cần tạo **giao diện mobile độc lập** (Mobile Lite App) với 5 module:
1. 💬 Chat nội bộ
2. ✅ Chấm công
3. 📦 Đơn hàng
4. 🎬 Video tasks
5. 👤 Tôi (lương, đơn từ, cá nhân)

**Data dùng chung Supabase** — mobile và desktop đọc/ghi cùng database.
**UI hoàn toàn riêng** — toàn bộ code mobile nằm trong `src/mobile/`, không import component desktop.

---

## NGUYÊN TẮC BẮT BUỘC

1. **KHÔNG SỬA bất kỳ file nào trong `src/components/`, `src/pages/`, `src/contexts/`** — đó là desktop
2. **Chỉ sửa `src/App.jsx`** đúng 1 chỗ: thêm `if (isMobile) return <MobileApp />`
3. **Tất cả code mobile** tạo trong `src/mobile/`
4. **Import Supabase client** từ file có sẵn: `import { supabase } from '../../supabaseClient'`  
5. **Mỗi hook mobile query thẳng Supabase** — KHÔNG dùng DataContext/Provider của desktop
6. **Truyền `currentUser` và `tenantId` qua props** từ MobileApp xuống các page
7. **Realtime channel name** phải có prefix `mobile-` để không conflict với desktop
8. **CSS mobile** scoped trong `src/mobile/styles/mobile.css`, dùng class `.mobile-*`
9. **Test desktop sau mỗi thay đổi** — mở browser > 768px kiểm tra không hỏng

---

## TRƯỚC KHI CODE — ĐỌC CÁC FILE NÀY TRONG REPO

```bash
# 1. Hiểu cấu trúc hiện tại
ls src/
ls src/components/
ls src/hooks/

# 2. Đọc App.jsx — để biết thêm mobile vào đâu
cat src/App.jsx

# 3. Đọc supabaseClient — để biết cách import
cat src/supabaseClient.js

# 4. Đọc useMobile hook — đã có sẵn
cat src/hooks/useMobile.js

# 5. Kiểm tra có file mobile cũ không (nếu có → xoá sạch trước)
ls src/mobile/ 2>/dev/null
ls src/components/mobile/ 2>/dev/null

# 6. Đọc schema Supabase — xem tên bảng, cột thực tế
# (Nếu không có file schema, hỏi user hoặc dùng Supabase CLI)
```

---

## THỨ TỰ THỰC HIỆN

### BƯỚC 1: Tạo khung Mobile App Shell
**Mục tiêu**: Mở app trên mobile → thấy bottom nav 5 tab, chuyển tab được, có auth check

**Tạo files**:
```
src/mobile/
├── MobileApp.jsx              ← Shell chính
├── hooks/
│   └── useMobileAuth.js       ← Auth: lấy session + profile + tenant_id
├── components/
│   ├── MobileHeader.jsx       ← Header 48px
│   ├── MobileBottomNav.jsx    ← 5 tab: Chat, Chấm công, Đơn hàng, Video, Tôi
│   └── MobileLoading.jsx      ← Loading spinner
├── pages/
│   ├── chat/ChatPage.jsx              ← Placeholder "Chat - Coming soon"
│   ├── attendance/AttendancePage.jsx  ← Placeholder
│   ├── orders/OrdersPage.jsx         ← Placeholder
│   ├── media/MediaPage.jsx           ← Placeholder
│   └── profile/ProfilePage.jsx       ← Placeholder
└── styles/
    └── mobile.css             ← CSS mobile riêng
```

**Sửa `src/App.jsx`** — thêm đúng 3 dòng:
```javascript
import { useMobile } from './hooks/useMobile';
import MobileApp from './mobile/MobileApp';

// Trong function App(), thêm TRƯỚC return desktop:
const isMobile = useMobile();
if (isMobile) return <MobileApp />;
```

**Verify**: 
- Mobile (< 768px): thấy bottom nav, chuyển tab OK
- Desktop (> 768px): app hoạt động bình thường, không thay đổi gì

**Commit**: `feat: mobile lite app shell with bottom nav`

---

### BƯỚC 2: Module Chat
**Đọc code desktop chat trước** để hiểu schema:
```bash
cat src/components/chat/ChatWindow.jsx
cat src/components/chat/ChatPopupWindow.jsx
# Xem cách desktop query rooms, messages
```

**Tạo files**:
```
src/mobile/hooks/useMobileChat.js
src/mobile/pages/chat/ChatPage.jsx          ← Router: room list ↔ conversation
src/mobile/pages/chat/ChatRoomList.jsx      ← Danh sách phòng
src/mobile/pages/chat/ChatConversation.jsx  ← Màn hình chat
src/mobile/pages/chat/ChatMessage.jsx       ← Bubble tin nhắn
src/mobile/pages/chat/ChatInput.jsx         ← Input + send + attach ảnh
src/mobile/pages/chat/ChatHeader.jsx        ← Header trong conversation
```

**Commit**: `feat: mobile chat module`

---

### BƯỚC 3: Module Chấm công
```bash
# Đọc schema attendance trước
cat src/components/hrm/AttendanceView.jsx  # hoặc tương tự
```

**Tạo files**:
```
src/mobile/hooks/useMobileAttendance.js
src/mobile/pages/attendance/AttendancePage.jsx    ← Nút check-in/out + lịch
src/mobile/pages/attendance/CheckInButton.jsx     ← Nút lớn
src/mobile/pages/attendance/AttendanceCalendar.jsx ← Lịch tháng
```

**Commit**: `feat: mobile attendance module`

---

### BƯỚC 4: Module Đơn hàng
```bash
cat src/components/sale/SalesOrdersView.jsx  # hoặc tương tự
```

**Tạo files**:
```
src/mobile/hooks/useMobileOrders.js
src/mobile/pages/orders/OrdersPage.jsx      ← Danh sách + filter
src/mobile/pages/orders/OrderCard.jsx       ← Card đơn hàng
src/mobile/pages/orders/OrderDetail.jsx     ← Chi tiết đơn
```

**Commit**: `feat: mobile orders module`

---

### BƯỚC 5: Module Video Tasks
```bash
cat src/components/media/EditVideoView.jsx  # hoặc tương tự
```

**Tạo files**:
```
src/mobile/hooks/useMobileMedia.js
src/mobile/pages/media/MediaPage.jsx        ← Danh sách task
src/mobile/pages/media/TaskCard.jsx         ← Card task
src/mobile/pages/media/TaskDetail.jsx       ← Chi tiết + update status
```

**Commit**: `feat: mobile media tasks module`

---

### BƯỚC 6: Module Tôi (Profile)
```bash
cat src/components/hrm/EmployeeView.jsx  # hoặc tương tự
# Xem payroll table
```

**Tạo files**:
```
src/mobile/hooks/useMobileProfile.js
src/mobile/pages/profile/ProfilePage.jsx    ← Menu cá nhân
src/mobile/pages/profile/MyInfo.jsx         ← Thông tin
src/mobile/pages/profile/MyPayroll.jsx      ← Phiếu lương
```

**Commit**: `feat: mobile profile module`

---

## DESIGN GUIDELINES

### Màu sắc
- Primary: `#15803d` (xanh lá đậm — brand Hoàng Nam Audio)
- Background: `#f5f5f5`
- Card background: `#ffffff`
- Text primary: `#111827`
- Text secondary: `#6b7280`
- Danger: `#dc2626`
- Warning: `#f59e0b`
- Success: `#16a34a`

### Typography
- Font: `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Header title: 18px semibold
- Card title: 15px semibold
- Body: 14px regular
- Caption: 12px regular, text-secondary

### Spacing
- Page padding: 16px
- Card padding: 12px
- Card gap: 8px
- Border radius: 12px (cards), 8px (buttons), 999px (badges)

### iOS Safe Areas
```css
padding-top: env(safe-area-inset-top);
padding-bottom: env(safe-area-inset-bottom);
height: 100dvh;  /* KHÔNG dùng 100vh */
```

### Bottom Nav
- Height: 60px + safe-area-inset-bottom
- 5 tab: 💬 Chat | ✅ Chấm công | 📦 Đơn hàng | 🎬 Video | 👤 Tôi
- Active tab: primary color (#15803d) + bold
- Inactive: #9ca3af
- Badge đỏ cho unread count

---

## LƯU Ý QUAN TRỌNG

- **Luôn kiểm tra desktop sau mỗi bước** — nếu desktop hỏng → revert ngay
- **Commit sau mỗi module** — dễ revert nếu có lỗi
- **Hook mobile query thẳng Supabase** — xem code desktop để biết tên bảng/cột chính xác, nhưng KHÔNG import logic desktop
- **Realtime channel** phải có prefix `mobile-` khác desktop
- **iOS keyboard handling**: dùng `visualViewport` API cho chat input
- **Tailwind CSS**: dùng utility classes có sẵn, không cần compile thêm

---

## NATIVE FEATURES — PUSH NOTIFICATION + GPS + CAMERA

### Cài đặt Capacitor Plugins

```bash
# Push Notifications
npm install @capacitor/push-notifications
npx cap sync ios

# Camera
npm install @capacitor/camera
npx cap sync ios

# Geolocation (GPS)
npm install @capacitor/geolocation
npx cap sync ios

# Local Notifications (nhắc nhở offline)
npm install @capacitor/local-notifications
npx cap sync ios
```

### iOS Permissions — Info.plist

Khi dùng Capacitor plugins trên iOS, cần thêm các permission descriptions vào `ios/App/App/Info.plist`.
**Nếu thiếu → app sẽ bị Apple REJECT hoặc crash khi gọi plugin.**

```xml
<!-- Camera -->
<key>NSCameraUsageDescription</key>
<string>Ứng dụng cần camera để chụp ảnh gửi trong chat và cập nhật ảnh đại diện</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>Ứng dụng cần truy cập thư viện ảnh để gửi ảnh trong chat</string>

<!-- Location / GPS -->
<key>NSLocationWhenInUseUsageDescription</key>
<string>Ứng dụng cần vị trí để xác nhận chấm công tại công ty</string>

<!-- Push Notifications — tự động khi enable capability trong Xcode -->
```

---

### PUSH NOTIFICATIONS

#### Kiến trúc

```
Sự kiện xảy ra (tin nhắn mới, đơn hàng mới, deadline task...)
        │
        ▼
Supabase Edge Function / Database Webhook
        │
        ▼
Firebase Cloud Messaging (FCM) → Apple Push Notification Service (APNs)
        │
        ▼
Điện thoại nhân viên nhận notification (kể cả app đang tắt)
```

#### Bước 1 — Setup Firebase (miễn phí)
1. Tạo project trên https://console.firebase.google.com
2. Thêm iOS app: Bundle ID = `vn.hoangnamaudio.app`
3. Download `GoogleService-Info.plist` → copy vào `ios/App/App/`
4. Enable Push Notifications capability trong Xcode:
   - Target → Signing & Capabilities → + Capability → Push Notifications
   - Target → Signing & Capabilities → + Capability → Background Modes → Remote notifications ✓

#### Bước 2 — Hook `usePushNotifications.js`

```javascript
// src/mobile/hooks/usePushNotifications.js
import { useEffect } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../../supabaseClient';

export function usePushNotifications(userId, tenantId) {
  useEffect(() => {
    // Chỉ chạy trên device thật (không chạy trên web)
    if (!Capacitor.isNativePlatform()) return;

    const setup = async () => {
      // 1. Xin quyền
      const permission = await PushNotifications.requestPermissions();
      if (permission.receive !== 'granted') return;

      // 2. Đăng ký nhận push
      await PushNotifications.register();

      // 3. Lấy device token → lưu vào Supabase
      PushNotifications.addListener('registration', async (token) => {
        await supabase.from('device_tokens').upsert({
          user_id: userId,
          tenant_id: tenantId,
          token: token.value,
          platform: 'ios',
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,platform' });
      });

      // 4. Xử lý notification khi app đang mở
      PushNotifications.addListener('pushNotificationReceived', (notification) => {
        // Hiện in-app notification hoặc update badge
      });

      // 5. Xử lý tap vào notification → navigate đến màn hình tương ứng
      PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const data = action.notification.data;
        if (data.type === 'chat') { /* navigate to chat room */ }
        if (data.type === 'order') { /* navigate to order detail */ }
        if (data.type === 'task') { /* navigate to task detail */ }
      });
    };

    setup();
    return () => PushNotifications.removeAllListeners();
  }, [userId, tenantId]);
}
```

#### Bước 3 — Supabase table lưu device tokens

```sql
CREATE TABLE device_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,
  token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android', 'web')),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, platform)
);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tokens" ON device_tokens
  FOR ALL USING (auth.uid() = user_id);
```

#### Bước 4 — Supabase Edge Function gửi push (làm sau khi UI xong)

Khi có chat_messages INSERT → lấy device_tokens của room members → gửi qua FCM.
Khi có orders INSERT → gửi cho nhân viên sale.
Khi task deadline gần → gửi cho assignee.

#### Các loại notification theo module:

| Sự kiện | Gửi cho ai | Nội dung |
|---------|-----------|---------|
| Tin nhắn mới | Members trong room (trừ sender) | "[Tên]: Nội dung tin nhắn..." |
| Đơn hàng mới | Nhân viên sale | "Đơn hàng mới #DH001 - Nguyễn Văn A" |
| Task sắp deadline | Assignee của task | "Task 'Video ABC' còn 1 ngày!" |
| Đơn nghỉ được duyệt | Người gửi đơn | "Đơn xin nghỉ 10/03 đã được duyệt" |
| Lương đã tính | Nhân viên | "Phiếu lương tháng 3/2026 đã sẵn sàng" |

---

### GPS / GEOLOCATION — Chấm công theo vị trí

#### Hook `useGeolocation.js`

```javascript
// src/mobile/hooks/useGeolocation.js
import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

// Toạ độ công ty Hoàng Nam Audio — CẦN CẬP NHẬT ĐÚNG VỊ TRÍ THỰC TẾ
const COMPANY_LOCATION = {
  lat: 0,             // ← THAY toạ độ thật
  lng: 0,             // ← THAY toạ độ thật
  radiusMeters: 200   // Bán kính cho phép chấm công
};

export function useGeolocation() {
  const getCurrentPosition = async () => {
    if (!Capacitor.isNativePlatform()) {
      // Fallback web: browser Geolocation API
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          (err) => reject(err)
        );
      });
    }

    const permission = await Geolocation.requestPermissions();
    if (permission.location !== 'granted') throw new Error('Chưa cấp quyền vị trí');

    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 10000
    });

    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy
    };
  };

  // Haversine formula — tính khoảng cách đến công ty
  const getDistanceToCompany = (lat, lng) => {
    const R = 6371000;
    const dLat = (COMPANY_LOCATION.lat - lat) * Math.PI / 180;
    const dLng = (COMPANY_LOCATION.lng - lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) ** 2 +
              Math.cos(lat * Math.PI / 180) * Math.cos(COMPANY_LOCATION.lat * Math.PI / 180) *
              Math.sin(dLng/2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const isAtCompany = (lat, lng) => {
    const distance = getDistanceToCompany(lat, lng);
    return { isNearby: distance <= COMPANY_LOCATION.radiusMeters, distanceMeters: Math.round(distance) };
  };

  return { getCurrentPosition, isAtCompany, getDistanceToCompany };
}
```

#### Tích hợp vào Chấm công

```javascript
// Trong CheckInButton.jsx
const { getCurrentPosition, isAtCompany } = useGeolocation();

const handleCheckIn = async () => {
  try {
    const position = await getCurrentPosition();
    const { isNearby, distanceMeters } = isAtCompany(position.lat, position.lng);

    await supabase.from('attendance').insert({
      user_id: currentUser.id,
      tenant_id: tenantId,
      date: new Date().toISOString().split('T')[0],
      check_in: new Date().toISOString(),
      latitude: position.lat,
      longitude: position.lng,
      is_at_company: isNearby,
      distance_meters: distanceMeters,
      note: isNearby ? null : `Check-in từ xa (${distanceMeters}m)`
    });
  } catch (err) {
    // Không lấy được GPS → vẫn cho chấm công nhưng ghi chú
  }
};
```

#### Cần thêm cột vào bảng attendance:

```sql
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS is_at_company BOOLEAN DEFAULT true;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS distance_meters INTEGER;
```

---

### CAMERA — Chụp ảnh trong Chat + Avatar

#### Hook `useCamera.js`

```javascript
// src/mobile/hooks/useCamera.js
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

export function useCamera() {
  const takePhoto = async () => {
    if (!Capacitor.isNativePlatform()) return null; // Fallback: dùng input[type=file]

    const image = await Camera.getPhoto({
      quality: 80,
      allowEditing: false,
      resultType: CameraResultType.Base64,
      source: CameraSource.Prompt,  // Cho chọn: Camera hoặc Thư viện
      width: 1200,
      height: 1200,
      promptLabelHeader: 'Chọn ảnh',
      promptLabelPhoto: 'Thư viện ảnh',
      promptLabelPicture: 'Chụp ảnh'
    });

    return image; // { base64String, format }
  };

  // Upload base64 lên Cloudinary
  const uploadToCloudinary = async (base64String, format = 'jpeg') => {
    const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;
    const formData = new FormData();
    formData.append('file', `data:image/${format};base64,${base64String}`);
    formData.append('upload_preset', uploadPreset);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
      { method: 'POST', body: formData }
    );
    const data = await res.json();
    return data.secure_url;
  };

  // Chụp + upload 1 bước
  const captureAndUpload = async () => {
    const photo = await takePhoto();
    if (!photo) return null;
    return await uploadToCloudinary(photo.base64String, photo.format);
  };

  return { takePhoto, uploadToCloudinary, captureAndUpload };
}
```

#### Dùng trong Chat — gửi ảnh:
```javascript
const { captureAndUpload } = useCamera();
const handleSendPhoto = async () => {
  const imageUrl = await captureAndUpload();
  if (imageUrl) await sendMessage(roomId, imageUrl, 'image');
};
```

#### Dùng trong Profile — đổi avatar:
```javascript
const handleChangeAvatar = async () => {
  const imageUrl = await captureAndUpload();
  if (imageUrl) {
    await supabase.from('profiles').update({ avatar_url: imageUrl }).eq('id', currentUser.id);
  }
};
```

---

### THỨ TỰ TÍCH HỢP NATIVE FEATURES

| Thời điểm | Tính năng | Ghi chú |
|-----------|-----------|---------|
| **Bước 2** (Chat) | Camera — chụp/chọn ảnh gửi chat | Cài plugin + hook useCamera |
| **Bước 3** (Chấm công) | GPS — xác nhận vị trí check-in | Cài plugin + hook useGeolocation |
| **Bước 6** (Profile) | Camera — đổi ảnh đại diện | Dùng lại hook useCamera |
| **Sau khi UI xong** | Push Notifications | Cần setup Firebase + Edge Function |
| **Sau khi UI xong** | Local Notifications | Nhắc chấm công, deadline task |

**Push Notification làm SAU CÙNG** vì cần setup Firebase, Edge Function, test trên device thật. Camera + GPS đơn giản hơn, tích hợp ngay khi làm module tương ứng.

### KIỂM TRA NATIVE vs WEB

```javascript
import { Capacitor } from '@capacitor/core';

if (Capacitor.isNativePlatform()) {
  // iPhone thật → dùng Camera/GPS/Push plugin
} else {
  // Browser → fallback: input file, navigator.geolocation, không có push
}
```

Luôn có **fallback cho web** — nhân viên có thể mở web trên browser thay vì app.
