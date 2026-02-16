import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { isAdmin } from '../../utils/permissionUtils';
import { getNowISOVN } from '../../utils/dateUtils';

const TaskModal = ({
  selectedTask,
  setSelectedTask,
  setShowModal,
  currentUser,
  allUsers,
  changeStatus,
  addComment,
  addPostLink,
  removePostLink,
  deleteTask,
  loadTasks,
  addNotification,
}) => {
  const [newComment, setNewComment] = useState('');
  const [showReassign, setShowReassign] = useState(false);
  const [newAssignee, setNewAssignee] = useState('');
  const [showEditTask, setShowEditTask] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editPlatform, setEditPlatform] = useState([]);
  const [editDueDate, setEditDueDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editCrew, setEditCrew] = useState([]);
  const [editActors, setEditActors] = useState([]);

  const videoCategories = [
    { id: 'video_dan', name: '🎬 Video dàn', color: 'purple' },
    { id: 'video_hangngay', name: '📅 Video hàng ngày', color: 'blue' },
    { id: 'video_huongdan', name: '📚 Video hướng dẫn', color: 'green' },
    { id: 'video_quangcao', name: '📢 Video quảng cáo', color: 'orange' },
    { id: 'video_review', name: '⭐ Video review', color: 'yellow' }
  ];

  if (!selectedTask) return null;

  const platforms = ['Facebook', 'Instagram', 'TikTok', 'Blog', 'Ads', 'Email'];

  const openEditMode = () => {
    setEditTitle(selectedTask.title || '');
    setEditPlatform(selectedTask.platform ? selectedTask.platform.split(', ') : []);
    setEditDueDate(selectedTask.dueDate || '');
    setEditDescription(selectedTask.description || '');
    setEditCategory(selectedTask.category || '');
    setEditCrew(selectedTask.crew || []);
    setEditActors(selectedTask.actors || []);
    setShowEditTask(true);
  };

  const toggleEditPlatform = (plat) => {
    if (editPlatform.includes(plat)) {
      setEditPlatform(editPlatform.filter(p => p !== plat));
    } else {
      setEditPlatform([...editPlatform, plat]);
    }
  };

  const toggleEditCrew = (name) => {
    if (editCrew.includes(name)) {
      setEditCrew(editCrew.filter(n => n !== name));
    } else {
      setEditCrew([...editCrew, name]);
    }
  };

  const toggleEditActor = (name) => {
    if (editActors.includes(name)) {
      setEditActors(editActors.filter(n => n !== name));
    } else {
      setEditActors([...editActors, name]);
    }
  };

  const saveEditTask = async () => {
    if (!editTitle || editPlatform.length === 0 || !editDueDate) {
      alert('⚠️ Vui lòng điền đầy đủ thông tin!');
      return;
    }
    try {
      const { error } = await supabase
        .from('tasks')
        .update({
          title: editTitle,
          platform: editPlatform.join(', '),
          due_date: editDueDate,
          description: editDescription,
          category: editCategory,
          cameramen: editCrew,
          editors: [],
          actors: editActors
        })
        .eq('id', selectedTask.id);

      if (error) throw error;
      alert('✅ Cập nhật task thành công!');
      setShowEditTask(false);
      await loadTasks();
      setSelectedTask({
        ...selectedTask,
        title: editTitle,
        platform: editPlatform.join(', '),
        dueDate: editDueDate,
        description: editDescription,
        category: editCategory,
        crew: editCrew,
        cameramen: editCrew,
        editors: [],
        actors: editActors
      });
    } catch (error) {
      console.error('Error updating task:', error);
      alert('❌ Lỗi khi cập nhật video!');
    }
  };

  const reassignTask = async () => {
    if (!newAssignee) {
      alert('⚠️ Vui lòng chọn người được gán!');
      return;
    }

    try {
      const assignedUser = allUsers.find(u => u.name === newAssignee);
      const { error } = await supabase
        .from('tasks')
        .update({
          assignee: newAssignee,
          team: assignedUser.team
        })
        .eq('id', selectedTask.id);

      if (error) throw error;

      // Notify new assignee
      if (newAssignee !== currentUser.name) {
        addNotification({
          type: 'assigned',
          taskId: selectedTask.id,
          title: '📋 Video được chuyển giao',
          message: `${currentUser.name} đã chuyển video "${selectedTask.title}" cho bạn`,
          read: false,
          createdAt: getNowISOVN()
        });
      }

      setShowReassign(false);
      alert('✅ Đã chuyển giao video!');
      await loadTasks();
      setShowModal(false);
    } catch (error) {
      console.error('Error reassigning task:', error);
      alert('❌ Lỗi khi chuyển giao video!');
    }
  };

  const canReassign = isAdmin(currentUser) || currentUser.role === 'Manager' ||
    (currentUser.role === 'Team Lead' && (currentUser.teams || [currentUser.team]).filter(Boolean).includes(selectedTask.team));

  const formatDateTime = (dateStr) => {
    if (!dateStr) return 'Chưa';
    try {
      return new Date(dateStr).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch { return dateStr; }
  };

  const taskCrew = selectedTask.crew || [];
  const taskActors = selectedTask.actors || [];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b bg-gradient-to-r from-blue-500 to-purple-600 text-white sticky top-0 z-10">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h2 className="text-2xl font-bold mb-2">{selectedTask.title}</h2>
              <div className="flex gap-2 flex-wrap items-center">
                <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm flex items-center gap-2">
                  👤 {selectedTask.assignee}
                  {canReassign && (
                    <button
                      onClick={() => {
                        setNewAssignee(selectedTask.assignee);
                        setShowReassign(true);
                      }}
                      className="ml-1 px-2 py-0.5 bg-white/30 hover:bg-white/40 rounded text-xs"
                    >
                      🔄
                    </button>
                  )}
                </span>
                <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm">
                  🏢 {selectedTask.team}
                </span>
                <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm">
                  📅 {selectedTask.dueDate}
                </span>
                <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm">
                  📱 {selectedTask.platform}
                </span>
              </div>
              {/* Cameramen & Editors */}
              {(taskCrew.length > 0 || taskActors.length > 0) && (
                <div className="flex gap-2 flex-wrap mt-2">
                  {taskCrew.length > 0 && (
                    <span className="px-3 py-1 bg-blue-400/30 backdrop-blur-sm rounded-full text-sm">
                      🎬 Q&D: {taskCrew.join(', ')}
                    </span>
                  )}
                  {taskActors.length > 0 && (
                    <span className="px-3 py-1 bg-pink-400/30 backdrop-blur-sm rounded-full text-sm">
                      🎭 {taskActors.join(', ')}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={openEditMode}
                className="px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium"
              >
                ✏️ Sửa
              </button>
              <button
                onClick={() => setShowModal(false)}
                className="text-white/80 hover:text-white text-2xl ml-2"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Production Timeline - Clickable */}
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-xl border border-blue-200">
            <h4 className="font-bold text-sm mb-3 text-blue-900">📐 Tiến Trình Sản Xuất <span className="font-normal text-gray-500">(bấm để cập nhật)</span></h4>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {/* Tạo - always show, not clickable */}
              <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg border bg-green-50 border-green-300">
                <span>📝</span>
                <div>
                  <div className="font-medium">Tạo</div>
                  <div className="text-green-600 font-medium">{formatDateTime(selectedTask.created_at)}</div>
                </div>
              </div>
              {[
                { key: 'filmed_at', icon: '🎥', label: 'Quay xong', fills: ['filmed_at'], status: 'Đã Quay' },
                { key: 'edited_at', icon: '✂️', label: 'Edit xong', fills: ['filmed_at', 'edited_at'], status: 'Đang Edit' },
                { key: 'completed_at', icon: '✅', label: 'Hoàn thành', fills: ['filmed_at', 'edited_at', 'completed_at'], status: 'Hoàn Thành' }
              ].map(step => {
                const done = !!selectedTask[step.key];
                return (
                  <React.Fragment key={step.key}>
                    <span className="text-gray-400">→</span>
                    <button
                      disabled={done}
                      onClick={async () => {
                        const now = new Date().toISOString();
                        const updateData = { status: step.status };
                        const localUpdate = { status: step.status };
                        step.fills.forEach(field => {
                          if (!selectedTask[field]) {
                            updateData[field] = now;
                            localUpdate[field] = now;
                          }
                        });
                        try {
                          const { error } = await supabase.from('tasks').update(updateData).eq('id', selectedTask.id);
                          if (error) throw error;
                          setSelectedTask(prev => ({ ...prev, ...localUpdate }));
                          loadTasks();
                        } catch (err) {
                          console.error('Error updating timeline:', err);
                          alert('❌ Lỗi khi cập nhật!');
                        }
                      }}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-lg border transition-all ${
                        done
                          ? 'bg-green-50 border-green-300'
                          : 'bg-white border-gray-200 hover:border-blue-400 hover:bg-blue-50 hover:scale-105 cursor-pointer'
                      }`}
                    >
                      <span>{step.icon}</span>
                      <div className="text-left">
                        <div className="font-medium">{step.label}</div>
                        <div className={done ? 'text-green-600 font-medium' : 'text-gray-400'}>
                          {done ? formatDateTime(selectedTask[step.key]) : 'Bấm để ghi nhận'}
                        </div>
                      </div>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Edit Task Form */}
          {showEditTask && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h4 className="font-bold text-lg mb-3 text-blue-900">✏️ Chỉnh Sửa Video</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Tiêu đề *</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Platform *</label>
                  <div className="flex flex-wrap gap-2">
                    {platforms.map(plat => (
                      <button
                        key={plat}
                        onClick={() => toggleEditPlatform(plat)}
                        className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${editPlatform.includes(plat) ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                      >
                        {plat}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Danh mục Video */}
                <div>
                  <label className="block text-sm font-medium mb-2">🏷️ Danh mục Video</label>
                  <div className="flex flex-wrap gap-2">
                    {videoCategories.map(cat => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setEditCategory(editCategory === cat.id ? '' : cat.id)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          editCategory === cat.id
                            ? `bg-${cat.color}-500 text-white`
                            : `bg-${cat.color}-100 text-${cat.color}-700 hover:bg-${cat.color}-200`
                        }`}
                      >
                        {cat.name}
                      </button>
                    ))}
                  </div>
                  {editCategory && (
                    <button
                      type="button"
                      onClick={() => setEditCategory('')}
                      className="mt-2 text-xs text-red-500 hover:text-red-700"
                    >
                      ✕ Xóa danh mục
                    </button>
                  )}
                </div>
                {/* Crew edit (Quay & Dựng) */}
                <div>
                  <label className="block text-sm font-medium mb-1">🎬 Quay & Dựng</label>
                  <div className="border rounded-lg p-2 max-h-32 overflow-y-auto space-y-1">
                    {allUsers.map(user => (
                      <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded text-sm">
                        <input type="checkbox" checked={editCrew.includes(user.name)} onChange={() => toggleEditCrew(user.name)} className="w-3 h-3" />
                        {user.name} <span className="text-gray-400 text-xs">- {user.team}</span>
                      </label>
                    ))}
                  </div>
                  {editCrew.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {editCrew.map(n => (
                        <span key={n} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">🎬 {n}</span>
                      ))}
                    </div>
                  )}
                </div>
                {/* Actors edit */}
                <div>
                  <label className="block text-sm font-medium mb-1">🎭 Diễn viên</label>
                  <div className="border rounded-lg p-2 max-h-32 overflow-y-auto space-y-1">
                    {allUsers.map(user => (
                      <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded text-sm">
                        <input type="checkbox" checked={editActors.includes(user.name)} onChange={() => toggleEditActor(user.name)} className="w-3 h-3" />
                        {user.name} <span className="text-gray-400 text-xs">- {user.team}</span>
                      </label>
                    ))}
                  </div>
                  {editActors.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {editActors.map(n => (
                        <span key={n} className="px-2 py-0.5 bg-pink-100 text-pink-700 rounded-full text-xs">🎭 {n}</span>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Deadline *</label>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Mô tả</label>
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {showReassign && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
              <h4 className="font-bold text-lg mb-3 text-yellow-900">🔄 Chuyển Giao Video</h4>
              <div className="space-y-3">
                <select
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                >
                  {allUsers
                    .filter(u => {
                      if (isAdmin(currentUser) || currentUser.role === 'Manager') return true;
                      if (currentUser.role === 'Team Lead') {
                        const userTeams = currentUser.teams || [currentUser.team].filter(Boolean);
                        const targetTeams = u.teams || [u.team].filter(Boolean);
                        return targetTeams.some(t => userTeams.includes(t));
                      }
                      return false;
                    })
                    .map(user => (
                      <option key={user.id} value={user.name}>
                        {user.name} - {(user.teams || [user.team]).filter(Boolean).join(', ')} ({user.role})
                      </option>
                    ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowReassign(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={reassignTask}
                    className="flex-1 px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-medium"
                  >
                    ✅ Chuyển Giao
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Links per Platform */}
          <div>
            <h4 className="text-lg font-bold mb-3">🔗 Links Theo Platform</h4>
            {(() => {
              const platformIcons = { 'Facebook': '📘', 'Instagram': '📸', 'TikTok': '🎵', 'Blog': '📝', 'Ads': '📢', 'Email': '📧', 'YouTube': '📺' };
              const platformColors = { 'Facebook': 'border-blue-300 bg-blue-50', 'Instagram': 'border-pink-300 bg-pink-50', 'TikTok': 'border-gray-800 bg-gray-50', 'Blog': 'border-green-300 bg-green-50', 'Ads': 'border-orange-300 bg-orange-50', 'Email': 'border-purple-300 bg-purple-50', 'YouTube': 'border-red-300 bg-red-50' };
              const taskPlatforms = (selectedTask.platform || '').split(', ').filter(Boolean);
              const existingLinks = selectedTask.postLinks || [];

              // Also show platforms from old links not in task.platform
              const oldLinkPlatforms = existingLinks.map(l => l.type).filter(t => !taskPlatforms.includes(t));
              const allPlatforms = [...taskPlatforms, ...oldLinkPlatforms];

              return (
                <div className="space-y-3">
                  {allPlatforms.map(plat => {
                    const link = existingLinks.find(l => l.type === plat);
                    const icon = platformIcons[plat] || '🔗';
                    const colorClass = platformColors[plat] || 'border-gray-300 bg-gray-50';
                    return (
                      <div key={plat} className={`border-2 rounded-lg p-3 ${colorClass}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg">{icon}</span>
                          <span className="font-bold text-sm">{plat}</span>
                          {link && <span className="text-xs text-gray-500">• {link.addedBy} • {link.addedAt}</span>}
                        </div>
                        {link ? (
                          <div className="flex items-center gap-2">
                            <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm break-all flex-1">{link.url}</a>
                            <button onClick={() => { navigator.clipboard.writeText(link.url); alert('✅ Đã copy!'); }} className="px-2 py-1 bg-white rounded text-xs hover:bg-gray-100 shrink-0">📋</button>
                            {(currentUser.name === link.addedBy || currentUser.role === 'Manager' || isAdmin(currentUser)) && (
                              <button onClick={() => { if (window.confirm('Xóa link này?')) removePostLink(selectedTask.id, existingLinks.indexOf(link)); }} className="px-2 py-1 bg-red-100 text-red-600 rounded text-xs hover:bg-red-200 shrink-0">🗑️</button>
                            )}
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <input
                              type="url"
                              placeholder={`Paste link ${plat} vào đây...`}
                              className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && e.target.value.trim()) {
                                  addPostLink(selectedTask.id, e.target.value.trim(), plat);
                                  e.target.value = '';
                                }
                              }}
                            />
                            <button
                              onClick={(e) => {
                                const input = e.target.closest('div').querySelector('input');
                                if (input && input.value.trim()) {
                                  addPostLink(selectedTask.id, input.value.trim(), plat);
                                  input.value = '';
                                }
                              }}
                              className="px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium shrink-0"
                            >
                              ✅ Lưu
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {allPlatforms.length === 0 && (
                    <div className="text-center py-6 bg-gray-50 rounded-lg text-gray-400 text-sm">Chưa chọn platform nào</div>
                  )}
                </div>
              );
            })()}
          </div>

          <div className="border-t pt-6">
            <div className="flex items-center justify-between mb-4">
              <h5 className="text-lg font-bold">💬 Nhận Xét & Feedback</h5>
              <span className="text-sm text-gray-500">
                {selectedTask.comments?.length || 0} nhận xét
              </span>
            </div>

            {selectedTask.comments && selectedTask.comments.length > 0 ? (
              <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                {selectedTask.comments.map((comment, index) => (
                  <div key={index} className="bg-gradient-to-r from-blue-50 to-purple-50 p-4 rounded-lg border border-blue-200">
                    <div className="flex items-start gap-3">
                      <div className="text-2xl">
                        {comment.user === currentUser.name ? '👤' : '👨‍💼'}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-bold text-sm">
                            {comment.user}
                            {comment.user === currentUser.name && ' (Bạn)'}
                          </span>
                          <span className="text-xs text-gray-500">• {comment.time}</span>
                        </div>
                        <div className="text-sm text-gray-700 bg-white p-3 rounded-lg">
                          {comment.text}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 rounded-lg mb-4">
                <div className="text-gray-400 text-sm">Chưa có nhận xét nào</div>
              </div>
            )}

            <div className="bg-white border-2 border-gray-200 rounded-lg p-4">
              <div className="font-medium text-sm mb-2">✍️ Thêm nhận xét:</div>
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={`${currentUser.role === 'Manager' ? 'Nhận xét của bạn về task này...' : 'Cập nhật tiến độ, ghi chú...'}`}
                rows="3"
                className="w-full px-4 py-3 border-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="flex justify-between items-center mt-3">
                <div className="text-xs text-gray-500">
                  💡 {currentUser.role === 'Manager' ? 'Admin/Manager có thể để lại feedback chi tiết' : 'Cập nhật tiến độ công việc của bạn'}
                </div>
                <button
                  onClick={() => {
                    if (newComment.trim()) {
                      addComment(selectedTask.id, newComment);
                      setNewComment('');
                    }
                  }}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                >
                  💬 Gửi
                </button>
              </div>
            </div>

            {currentUser.role === 'Manager' && (
              <div className="mt-4 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="text-sm font-medium text-yellow-800 mb-2">⚡ Phê duyệt nhanh:</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      changeStatus(selectedTask.id, 'Đã Duyệt');
                      setSelectedTask({ ...selectedTask, status: 'Đã Duyệt' });
                      addComment(selectedTask.id, '✅ Đã duyệt! Công việc làm tốt.');
                    }}
                    className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                  >
                    ✅ Phê Duyệt
                  </button>
                  <button
                    onClick={() => {
                      changeStatus(selectedTask.id, 'Cần Sửa');
                      setSelectedTask({ ...selectedTask, status: 'Cần Sửa' });
                      if (newComment.trim()) {
                        addComment(selectedTask.id, newComment);
                        setNewComment('');
                      }
                    }}
                    className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium"
                  >
                    🔄 Yêu Cầu Sửa
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-6 border-t bg-gray-50 sticky bottom-0">
          <div className="flex gap-3">
            <button
              onClick={() => {
                setShowEditTask(false);
                setShowModal(false);
              }}
              className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
            >
              Đóng
            </button>
            {currentUser && (isAdmin(currentUser) || currentUser.role === 'Manager' || selectedTask.assignee === currentUser.name) && (
              <button
                onClick={() => {
                  if (window.confirm('⚠️ Bạn có chắc chắn muốn xóa task này?\n\nHành động này không thể hoàn tác!')) {
                    deleteTask(selectedTask.id);
                  }
                }}
                className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium"
              >
                🗑️ Xóa
              </button>
            )}
            {showEditTask && (
              <button
                onClick={saveEditTask}
                className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
              >
                💾 Lưu
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskModal;
