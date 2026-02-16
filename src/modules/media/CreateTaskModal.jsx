import React, { useState } from 'react';
import { getTodayVN } from '../../utils/dateUtils';
import { isAdmin } from '../../utils/permissionUtils';

const CreateTaskModal = ({ currentUser, allUsers, setShowCreateTaskModal, createNewTask }) => {
  const [title, setTitle] = useState('');
  const [platform, setPlatform] = useState(['Facebook', 'TikTok']);
  const [dueDate, setDueDate] = useState(getTodayVN());
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState(currentUser.name);
  const [videoCategory, setVideoCategory] = useState('');
  const [crew, setCrew] = useState([]);
  const [actors, setActors] = useState([]);

  const videoCategories = [
    { id: 'video_dan', name: '🎬 Video dàn', color: 'purple' },
    { id: 'video_hangngay', name: '📅 Video hàng ngày', color: 'blue' },
    { id: 'video_huongdan', name: '📚 Video hướng dẫn', color: 'green' },
    { id: 'video_quangcao', name: '📢 Video quảng cáo', color: 'orange' },
    { id: 'video_review', name: '⭐ Video review', color: 'yellow' }
  ];

  const togglePlatform = (plat) => {
    if (platform.includes(plat)) {
      setPlatform(platform.filter(p => p !== plat));
    } else {
      setPlatform([...platform, plat]);
    }
  };

  const toggleCrew = (name) => {
    if (crew.includes(name)) {
      setCrew(crew.filter(n => n !== name));
    } else {
      setCrew([...crew, name]);
    }
  };

  const toggleActor = (name) => {
    if (actors.includes(name)) {
      setActors(actors.filter(n => n !== name));
    } else {
      setActors([...actors, name]);
    }
  };

  // Filter assignable users based on role
  const getAssignableUsers = () => {
    if (isAdmin(currentUser) || currentUser.role === 'Manager') {
      return allUsers;
    } else if (currentUser.role === 'Team Lead') {
      const userTeams = currentUser.teams || [currentUser.team].filter(Boolean);
      return allUsers.filter(u => {
        const targetTeams = u.teams || [u.team].filter(Boolean);
        return targetTeams.some(t => userTeams.includes(t));
      });
    } else {
      return allUsers.filter(u => u.name === currentUser.name);
    }
  };

  const assignableUsers = getAssignableUsers();

  const platforms = ['Facebook', 'Instagram', 'TikTok', 'Blog', 'Ads', 'Email'];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white p-6 border-b">
          <h2 className="text-2xl font-bold">➕ Tạo Video Mới</h2>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Tiêu đề *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Viết bài blog về sản phẩm mới"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Platform * (Chọn nhiều)</label>
              <div className="space-y-2 border rounded-lg p-3 max-h-48 overflow-y-auto">
                {platforms.map(plat => (
                  <label key={plat} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={platform.includes(plat)}
                      onChange={() => togglePlatform(plat)}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span>{plat}</span>
                  </label>
                ))}
              </div>
              {platform.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {platform.map(plat => (
                    <span key={plat} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm flex items-center gap-1">
                      {plat}
                      <button onClick={() => togglePlatform(plat)} className="text-blue-900 hover:text-red-600">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">🏷️ Danh mục Video</label>
            <div className="flex flex-wrap gap-2">
              {videoCategories.map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setVideoCategory(videoCategory === cat.id ? '' : cat.id)}
                  className={`px-3 py-2 rounded-lg border-2 font-medium transition-all ${
                    videoCategory === cat.id
                      ? (cat.color === 'purple' ? 'bg-purple-100 border-purple-500 text-purple-700'
                        : cat.color === 'blue' ? 'bg-blue-100 border-blue-500 text-blue-700'
                        : cat.color === 'green' ? 'bg-green-100 border-green-500 text-green-700'
                        : cat.color === 'orange' ? 'bg-orange-100 border-orange-500 text-orange-700'
                        : 'bg-yellow-100 border-yellow-500 text-yellow-700')
                      : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-400'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              👤 Gán cho *
              {currentUser.role === 'Member' && <span className="text-xs text-gray-500 ml-2">(Chỉ gán cho bản thân)</span>}
            </label>
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={currentUser.role === 'Member'}
            >
              {assignableUsers.map(user => (
                <option key={user.id} value={user.name}>
                  {user.name} - {user.team} ({user.role})
                </option>
              ))}
            </select>
          </div>

          {/* Crew selection (Quay & Dựng) */}
          <div>
            <label className="block text-sm font-medium mb-2">🎬 Quay & Dựng (Chọn nhiều)</label>
            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-1">
              {allUsers.map(user => (
                <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1.5 rounded">
                  <input
                    type="checkbox"
                    checked={crew.includes(user.name)}
                    onChange={() => toggleCrew(user.name)}
                    className="w-4 h-4 text-blue-600"
                  />
                  <span className="text-sm">{user.name} <span className="text-gray-400">- {user.team}</span></span>
                </label>
              ))}
            </div>
            {crew.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {crew.map(name => (
                  <span key={name} className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs flex items-center gap-1">
                    🎬 {name}
                    <button onClick={() => toggleCrew(name)} className="hover:text-red-600">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Actor selection */}
          <div>
            <label className="block text-sm font-medium mb-2">🎭 Diễn viên (Chọn nhiều)</label>
            <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-1">
              {allUsers.map(user => (
                <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1.5 rounded">
                  <input
                    type="checkbox"
                    checked={actors.includes(user.name)}
                    onChange={() => toggleActor(user.name)}
                    className="w-4 h-4 text-pink-600"
                  />
                  <span className="text-sm">{user.name} <span className="text-gray-400">- {user.team}</span></span>
                </label>
              ))}
            </div>
            {actors.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {actors.map(name => (
                  <span key={name} className="px-2 py-1 bg-pink-100 text-pink-700 rounded-full text-xs flex items-center gap-1">
                    🎭 {name}
                    <button onClick={() => toggleActor(name)} className="hover:text-red-600">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Deadline *</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Mô tả</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả chi tiết công việc..."
              rows="4"
              className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="p-6 border-t bg-gray-50 sticky bottom-0">
          <div className="flex gap-3">
            <button
              onClick={() => setShowCreateTaskModal(false)}
              className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
            >
              Hủy
            </button>
            <button
              onClick={() => {
                if (!title || platform.length === 0 || !dueDate) {
                  alert('⚠️ Vui lòng điền đầy đủ thông tin bắt buộc!');
                  return;
                }
                createNewTask(title, platform.join(', '), 'Trung bình', dueDate, description, assignee, videoCategory, crew, actors);
              }}
              className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
            >
              ✅ Tạo Video
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateTaskModal;
