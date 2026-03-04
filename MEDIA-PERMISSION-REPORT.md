# Báo Cáo Bug: Edit Video Member Không Xem Được Task

## Mô tả bug
User role "Edit Video" level "Member" (permission level 1) không xem được task video được giao cho mình. Chỉ thấy task mà mình là `assignee` chính, không thấy task mình là editor/cameraman/actor hoặc người tạo.

## Database schema — bảng `tasks`

### TẤT CẢ fields liên quan người tham gia

| Field | Type | Lưu gì | Ví dụ |
|-------|------|--------|-------|
| `assignee` | TEXT | **Tên người** phụ trách chính | `"Phạm Trung Kiên"` |
| `cameramen` | JSONB `[]` | **Array tên** quay phim | `["Nguyễn Văn A", "Trần B"]` |
| `editors` | JSONB `[]` | **Array tên** dựng phim | `["Phạm Trung Kiên"]` |
| `actors` | JSONB `[]` | **Array tên** diễn viên | `["Lê C"]` |
| `created_by` | TEXT | **Tên người** tạo task | `"Admin"` (TRƯỚC ĐÂY KHÔNG ĐƯỢC MAP!) |
| `crew` | — | Computed frontend: `[...cameramen, ...editors]` | — |
| `team` | TEXT | Team gán | `"Edit Video"` |
| `status` | TEXT | Trạng thái | `"Đang Làm"`, `"Hoàn Thành"` |

**Quan trọng:**
- Tất cả fields người tham gia lưu **tên người** (user.name), KHÔNG phải user.id
- Không có field `reviewer_id`, `participants`, `members` trong bảng tasks
- Không có RLS policy filter theo user — filter hoàn toàn ở frontend
- `created_by` trước đây KHÔNG được map vào frontend object → đã fix

## Nguyên nhân gốc

### 1. DataContext.jsx — `created_by` không được map
**File:** `src/contexts/DataContext.jsx` — `loadTasks()` `formattedTasks`

```javascript
// CŨ — THIẾU created_by
const formattedTasks = (data || []).map(task => ({
  id: task.id, title: task.title, assignee: task.assignee, ...
  // created_by: MISSING!
}));
```

### 2. DataContext.jsx — `visibleTasks` thiếu actors, created_by
```javascript
// CŨ — thiếu actors và created_by
return tasks.filter(t =>
  t.assignee === currentUser.name ||
  (t.editors || []).includes(currentUser.name) ||
  (t.cameramen || []).includes(currentUser.name) ||
  t.status === 'Hoàn Thành'
);
```

### 3. MyTasksView.jsx — filter thiếu actors, created_by
```javascript
// CŨ — thiếu actors và created_by
const myTasks = tasks.filter(t =>
  t.assignee === currentUser.name ||
  (t.editors || []).includes(currentUser.name) ||
  (t.cameramen || []).includes(currentUser.name)
);
```

### 4. TaskModal.jsx — nút Sửa thiếu actors
```javascript
// CŨ — thiếu actors trong check
isAdmin(currentUser) || ... || (selectedTask.editors || []).includes(currentUser.name) || (selectedTask.cameramen || []).includes(currentUser.name)
// THIẾU: (selectedTask.actors || []).includes(currentUser.name)
```

## Fix đã thực hiện

### Fix 1: DataContext.jsx — map `created_by` từ DB
```javascript
// THÊM vào formattedTasks:
created_by: task.created_by || null
```

### Fix 2: DataContext.jsx — `visibleTasks` check TẤT CẢ vai trò
```javascript
const userName = currentUser.name;
return tasks.filter(t =>
  t.assignee === userName ||
  t.created_by === userName ||
  (t.cameramen || []).includes(userName) ||
  (t.editors || []).includes(userName) ||
  (t.actors || []).includes(userName) ||
  t.status === 'Hoàn Thành'
);
```

### Fix 3: MyTasksView.jsx — "Công việc của tôi" check TẤT CẢ vai trò
```javascript
const userName = currentUser.name;
const myTasks = tasks.filter(t =>
  t.assignee === userName ||
  t.created_by === userName ||
  (t.cameramen || []).includes(userName) ||
  (t.editors || []).includes(userName) ||
  (t.actors || []).includes(userName)
);
```

### Fix 4: TaskModal.jsx — nút Sửa bao gồm actors
```javascript
{currentUser && (isAdmin(currentUser) || currentUser.role === 'Manager' ||
  selectedTask.assignee === currentUser.name ||
  (selectedTask.cameramen || []).includes(currentUser.name) ||
  (selectedTask.editors || []).includes(currentUser.name) ||
  (selectedTask.actors || []).includes(currentUser.name)) && (
  <button onClick={openEditMode}>✏️ Sửa</button>
)}
```

Nút Xóa giữ check cũ: chỉ Admin/Manager/assignee (line 1429).

## Permission levels (module media)

| Level | Tên | Quyền xem task |
|-------|-----|----------------|
| 0 | Không truy cập | Không thấy module |
| 1 | Member | Task mình tham gia (bất kỳ vai trò) + task hoàn thành |
| 2 | View All | Tất cả task |
| 3 | Full CRUD | Tất cả task + sửa/xóa |
| Admin | Admin | Tất cả |

## Files đã sửa

| File | Thay đổi |
|------|----------|
| `src/contexts/DataContext.jsx` | Map `created_by`, `visibleTasks` check tất cả vai trò |
| `src/modules/media/MyTasksView.jsx` | `myTasks` check tất cả vai trò |
| `src/modules/media/TaskModal.jsx` | Nút Sửa bao gồm actors |

## Test checklist

- [ ] Login user "Phạm Trung Kiên" (Edit Video Member)
- [ ] Tab "Của tôi" → thấy task mình là assignee/editor/cameraman/actor/người tạo
- [ ] Tab "Videos" → thấy task liên quan + tất cả task hoàn thành
- [ ] Click task hoàn thành của người khác → KHÔNG thấy nút Sửa
- [ ] Click task mình là editor/cameraman/actor → thấy nút Sửa
- [ ] Nút Xóa chỉ hiện cho Admin/Manager/assignee
- [ ] Login Admin → vẫn thấy tất cả task, sửa/xóa bình thường
