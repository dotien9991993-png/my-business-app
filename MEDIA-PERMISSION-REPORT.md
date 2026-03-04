# Báo Cáo Bug: Edit Video Member Không Xem Được Task

## Mô tả bug
User role "Edit Video" level "Member" (permission level 1) không xem được task video được giao cho mình. Chỉ thấy task mà mình là `assignee` chính, không thấy task mình là editor/cameraman.

## Nguyên nhân gốc

### 1. DataContext.jsx — `visibleTasks` filter quá chặt
**File:** `src/contexts/DataContext.jsx` (line 597)

```javascript
// CŨ — chỉ check assignee
return tasks.filter(t => t.assignee === currentUser.name);
```

Logic flow cho level 1 member:
1. Không phải Admin/Manager → skip
2. `getPermissionLevel('media')` = 1 (< 2) → skip
3. Không phải Team Lead → skip
4. **Fallback:** chỉ show task có `t.assignee === currentUser.name`

**Vấn đề:** Task có `editors: ["Nguyen Van A"]` hoặc `cameramen: ["Nguyen Van A"]` nhưng `assignee` là người khác → member không thấy.

### 2. MyTasksView.jsx — filter "Công việc của tôi" cũng thiếu
**File:** `src/modules/media/MyTasksView.jsx` (line 5)

```javascript
// CŨ — chỉ check assignee
const myTasks = tasks.filter(t => t.assignee === currentUser.name);
```

### 3. TaskModal.jsx — nút Sửa không có permission check
**File:** `src/modules/media/TaskModal.jsx` (line 598)

Nút "✏️ Sửa" luôn hiển thị cho mọi user, kể cả khi xem task hoàn thành của người khác (để tham khảo).

## Database schema — bảng `tasks`

| Field | Type | Mô tả |
|-------|------|-------|
| `assignee` | text | Người phụ trách chính |
| `editors` | JSONB array | Danh sách editor (tên) |
| `cameramen` | JSONB array | Danh sách cameraman (tên) |
| `actors` | JSONB array | Danh sách diễn viên |
| `crew` | computed | `[...editors, ...cameramen]` (frontend only) |
| `team` | text | Team (Content, Edit Video, Livestream, Kho) |
| `status` | text | Nháp, Chờ Duyệt, Đã Duyệt, Đang Làm, Hoàn Thành |

**Lưu ý:** Không có RLS policy filter theo user trên bảng `tasks`. Filter hoàn toàn ở frontend.

## Permission levels (module media)

| Level | Tên | Quyền xem task |
|-------|-----|----------------|
| 0 | Không truy cập | Không thấy module |
| 1 | Member | Task của mình (assignee/editor/cameraman) + task hoàn thành |
| 2 | View All | Tất cả task |
| 3 | Full CRUD | Tất cả task + sửa/xóa |
| Admin | Admin | Tất cả |

## Fix đã thực hiện

### Fix 1: DataContext.jsx — mở rộng `visibleTasks` cho level 1
```javascript
// MỚI — check assignee + editors + cameramen + task hoàn thành
return tasks.filter(t =>
  t.assignee === currentUser.name ||
  (t.editors || []).includes(currentUser.name) ||
  (t.cameramen || []).includes(currentUser.name) ||
  t.status === 'Hoàn Thành'
);
```

### Fix 2: MyTasksView.jsx — mở rộng filter "Công việc của tôi"
```javascript
// MỚI — bao gồm task mình là editor/cameraman
const myTasks = tasks.filter(t =>
  t.assignee === currentUser.name ||
  (t.editors || []).includes(currentUser.name) ||
  (t.cameramen || []).includes(currentUser.name)
);
```

### Fix 3: TaskModal.jsx — thêm permission check cho nút Sửa
```javascript
// MỚI — chỉ Admin/Manager/assignee/editor/cameraman mới thấy nút Sửa
{currentUser && (isAdmin(currentUser) || currentUser.role === 'Manager' ||
  selectedTask.assignee === currentUser.name ||
  (selectedTask.editors || []).includes(currentUser.name) ||
  (selectedTask.cameramen || []).includes(currentUser.name)) && (
  <button onClick={openEditMode}>✏️ Sửa</button>
)}
```

Nút Xóa đã có check đúng: chỉ Admin/Manager/assignee (line 1429).

## Files đã sửa

| File | Thay đổi |
|------|----------|
| `src/contexts/DataContext.jsx` | `visibleTasks` filter mở rộng cho level 1 |
| `src/modules/media/MyTasksView.jsx` | `myTasks` filter bao gồm editors/cameramen |
| `src/modules/media/TaskModal.jsx` | Nút Sửa có permission check |

## Test checklist

- [ ] Login user Edit Video Member (level 1)
- [ ] Tab "Công việc của tôi" → thấy task được giao (assignee) + task mình là editor/cameraman
- [ ] Tab "Videos" → thấy task liên quan + tất cả task hoàn thành (để tham khảo)
- [ ] Click task hoàn thành của người khác → KHÔNG thấy nút Sửa
- [ ] Click task mình là editor → thấy nút Sửa
- [ ] Nút Xóa chỉ hiện cho Admin/Manager/assignee
- [ ] Login Admin → vẫn thấy tất cả task, sửa/xóa bình thường
