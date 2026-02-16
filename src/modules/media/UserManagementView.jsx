import React, { useState } from 'react';
import { supabase } from '../../supabaseClient';
import { isAdmin } from '../../utils/permissionUtils';
import EmployeeDetailModal from '../../components/shared/EmployeeDetailModal';

const EditUserDepartmentsModal = ({ user, onClose, onSave }) => {
  const [departments, setDepartments] = useState(user.departments || []);

  const toggleDepartment = (dept) => {
    if (departments.includes(dept)) {
      setDepartments(departments.filter(d => d !== dept));
    } else {
      setDepartments([...departments, dept]);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full">
        <div className="p-6 border-b bg-gradient-to-r from-blue-500 to-purple-600 text-white">
          <h2 className="text-2xl font-bold">✏️ Chỉnh Sửa Bộ Phận</h2>
          <p className="text-sm mt-1 opacity-90">{user.name}</p>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600 mb-4">
            Chọn bộ phận mà user này có thể làm việc:
          </p>

          <label className="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-blue-50 transition-colors">
            <input
              type="checkbox"
              checked={departments.includes('media')}
              onChange={() => toggleDepartment('media')}
              className="w-5 h-5 text-blue-600"
            />
            <div className="flex-1">
              <div className="font-medium">🎬 Media</div>
              <div className="text-sm text-gray-500">Quản lý tasks marketing, content, ads</div>
            </div>
          </label>

          <label className="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-orange-50 transition-colors">
            <input
              type="checkbox"
              checked={departments.includes('technical')}
              onChange={() => toggleDepartment('technical')}
              className="w-5 h-5 text-orange-600"
            />
            <div className="flex-1">
              <div className="font-medium">🔧 Kỹ Thuật</div>
              <div className="text-sm text-gray-500">Lắp đặt, bảo trì, sửa chữa thiết bị</div>
            </div>
          </label>

          <label className="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-green-50 transition-colors">
            <input
              type="checkbox"
              checked={departments.includes('sales')}
              onChange={() => toggleDepartment('sales')}
              className="w-5 h-5 text-green-600"
            />
            <div className="flex-1">
              <div className="font-medium">💼 Sales</div>
              <div className="text-sm text-gray-500">Bán hàng, lên đơn, gán việc kỹ thuật</div>
            </div>
          </label>

          <label className="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-yellow-50 transition-colors">
            <input
              type="checkbox"
              checked={departments.includes('warehouse')}
              onChange={() => toggleDepartment('warehouse')}
              className="w-5 h-5 text-yellow-600"
            />
            <div className="flex-1">
              <div className="font-medium">📦 Kho</div>
              <div className="text-sm text-gray-500">Quản lý kho hàng, nhập xuất, tồn kho</div>
            </div>
          </label>

          <label className="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-emerald-50 transition-colors">
            <input
              type="checkbox"
              checked={departments.includes('finance')}
              onChange={() => toggleDepartment('finance')}
              className="w-5 h-5 text-emerald-600"
            />
            <div className="flex-1">
              <div className="font-medium">💰 Tài Chính</div>
              <div className="text-sm text-gray-500">Thu chi, công nợ, lương, báo cáo tài chính</div>
            </div>
          </label>

          {departments.length === 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
              ⚠️ Vui lòng chọn ít nhất 1 bộ phận
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
          >
            Hủy
          </button>
          <button
            onClick={() => {
              if (departments.length === 0) {
                alert('⚠️ Vui lòng chọn ít nhất 1 bộ phận!');
                return;
              }
              onSave(departments);
            }}
            className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
          >
            ✅ Lưu
          </button>
        </div>
      </div>
    </div>
  );
};

const EditUserTeamsModal = ({ user, onClose, onSave }) => {
  const [teams, setTeams] = useState(user.teams || [user.team].filter(Boolean));

  const toggleTeam = (team) => {
    if (teams.includes(team)) {
      setTeams(teams.filter(t => t !== team));
    } else {
      setTeams([...teams, team]);
    }
  };

  const AVAILABLE_TEAMS = [
    { id: 'Content', name: 'Content', color: 'blue', emoji: '✍️' },
    { id: 'Edit Video', name: 'Edit Video', color: 'purple', emoji: '🎬' },
    { id: 'Livestream', name: 'Livestream', color: 'red', emoji: '🎥' },
    { id: 'Kho', name: 'Kho', color: 'yellow', emoji: '📦' },
    { id: 'Kỹ Thuật', name: 'Kỹ Thuật', color: 'orange', emoji: '🔧' },
    { id: 'Sale', name: 'Sale', color: 'green', emoji: '💼' },
    { id: 'Kinh Doanh', name: 'Kinh Doanh', color: 'teal', emoji: '📊' }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-md w-full">
        <div className="p-6 border-b bg-gradient-to-r from-purple-500 to-pink-600 text-white">
          <h2 className="text-2xl font-bold">👥 Chỉnh Sửa Teams</h2>
          <p className="text-sm mt-1 opacity-90">{user.name}</p>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-gray-600 mb-4">
            Chọn các team mà user này thuộc về:
          </p>

          {AVAILABLE_TEAMS.map(team => (
            <label
              key={team.id}
              className={`flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer hover:bg-${team.color}-50 transition-colors`}
            >
              <input
                type="checkbox"
                checked={teams.includes(team.id)}
                onChange={() => toggleTeam(team.id)}
                className={`w-5 h-5 text-${team.color}-600`}
              />
              <div className="flex-1">
                <div className="font-medium">{team.emoji} {team.name}</div>
                <div className="text-sm text-gray-500">Team {team.name}</div>
              </div>
            </label>
          ))}

          {teams.length === 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
              ⚠️ Vui lòng chọn ít nhất 1 team
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
          >
            Hủy
          </button>
          <button
            onClick={() => {
              if (teams.length === 0) {
                alert('⚠️ Vui lòng chọn ít nhất 1 team!');
                return;
              }
              onSave(teams);
            }}
            className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium"
          >
            ✅ Lưu
          </button>
        </div>
      </div>
    </div>
  );
};

const StatusBadge = ({ status, isActive }) => {
  if (isActive === false) {
    return <span className="px-2 py-1 bg-gray-200 text-gray-600 text-xs rounded-full font-medium">Vô hiệu hóa</span>;
  }
  switch (status) {
    case 'pending':
      return <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">Chờ duyệt</span>;
    case 'rejected':
      return <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded-full font-medium">Từ chối</span>;
    case 'suspended':
      return <span className="px-2 py-1 bg-gray-200 text-gray-600 text-xs rounded-full font-medium">Khóa</span>;
    default:
      return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full font-medium">Hoạt động</span>;
  }
};

const UserManagementView = ({ currentUser, allUsers, changeUserRole, deleteUser, loadUsers }) => {
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [showEditTeamsModal, setShowEditTeamsModal] = useState(false);
  const [editingTeamsUser, setEditingTeamsUser] = useState(null);
  const [showEmployeeDetail, setShowEmployeeDetail] = useState(null);

  const pendingUsers = allUsers.filter(u => u.status === 'pending');
  const activeUsers = allUsers.filter(u => u.status !== 'pending');

  const approveUser = async (userId, userName) => {
    if (!isAdmin(currentUser)) { alert('Chỉ Admin mới có quyền!'); return; }
    try {
      const { error } = await supabase
        .from('users')
        .update({ status: 'approved' })
        .eq('id', userId);
      if (error) throw error;
      alert(`Đã duyệt tài khoản ${userName}!`);
      await loadUsers();
    } catch (err) {
      console.error('Error approving user:', err);
      alert('Lỗi khi duyệt tài khoản!');
    }
  };

  const rejectUser = async (userId, userName) => {
    if (!isAdmin(currentUser)) { alert('Chỉ Admin mới có quyền!'); return; }
    if (!window.confirm(`Từ chối tài khoản "${userName}"?`)) return;
    try {
      const { error } = await supabase
        .from('users')
        .update({ status: 'rejected' })
        .eq('id', userId);
      if (error) throw error;
      alert(`Đã từ chối tài khoản ${userName}.`);
      await loadUsers();
    } catch (err) {
      console.error('Error rejecting user:', err);
      alert('Lỗi khi từ chối tài khoản!');
    }
  };

  const toggleUserActive = async (user) => {
    if (!isAdmin(currentUser)) { alert('Chỉ Admin mới có quyền!'); return; }
    const newActive = user.is_active === false ? true : false;
    const action = newActive ? 'Mở khóa' : 'Khóa';
    if (!window.confirm(`${action} tài khoản "${user.name}"?`)) return;
    try {
      const { error } = await supabase
        .from('users')
        .update({ is_active: newActive })
        .eq('id', user.id);
      if (error) throw error;
      alert(`Đã ${action.toLowerCase()} tài khoản ${user.name}.`);
      await loadUsers();
    } catch (err) {
      console.error('Error toggling user active:', err);
      alert(`Lỗi khi ${action.toLowerCase()} tài khoản!`);
    }
  };

  if (!isAdmin(currentUser)) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-8 text-center">
          <div className="text-6xl mb-4">🔒</div>
          <h2 className="text-2xl font-bold text-red-700 mb-2">Không Có Quyền Truy Cập</h2>
          <p className="text-gray-600">Chỉ Admin mới có thể quản lý users.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">👥 Quản Lý Users</h2>
          <p className="text-gray-600 mt-1">Quản lý tài khoản và phân quyền</p>
        </div>
        <div className="flex gap-3">
          {pendingUsers.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 px-4 py-2 rounded-lg">
              <span className="text-sm font-medium text-amber-700">
                {pendingUsers.length} chờ duyệt
              </span>
            </div>
          )}
          <div className="bg-blue-50 px-4 py-2 rounded-lg">
            <span className="text-sm font-medium text-blue-700">
              Tổng: {allUsers.length} users
            </span>
          </div>
        </div>
      </div>

      {/* Pending Approval Section */}
      {pendingUsers.length > 0 && (
        <div className="mb-6 bg-amber-50 border-2 border-amber-300 rounded-xl overflow-hidden">
          <div className="px-6 py-4 bg-amber-100 border-b border-amber-300 flex items-center gap-2">
            <span className="text-lg">⏳</span>
            <h3 className="font-bold text-amber-800">Tài Khoản Chờ Duyệt ({pendingUsers.length})</h3>
          </div>
          <div className="divide-y divide-amber-200">
            {pendingUsers.map(user => (
              <div key={user.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex-1">
                  <div className="font-medium text-gray-900">{user.name}</div>
                  <div className="text-sm text-gray-600">{user.email} {user.phone ? `- ${user.phone}` : ''}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Team: {user.team || 'N/A'} - Đăng ký: {user.created_at ? new Date(user.created_at).toLocaleDateString('vi-VN') : 'N/A'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => approveUser(user.id, user.name)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
                  >
                    Duyệt
                  </button>
                  <button
                    onClick={() => rejectUser(user.id, user.name)}
                    className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium"
                  >
                    Từ chối
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Họ Tên</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Email</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Team</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Trạng Thái</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Vai Trò</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Thao Tác</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {activeUsers.map(user => (
              <tr key={user.id} className={
                user.is_active === false ? 'bg-gray-100 opacity-60' :
                user.id === currentUser.id ? 'bg-blue-50' : 'hover:bg-gray-50'
              }>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowEmployeeDetail(user)} className="font-medium text-blue-700 hover:underline text-left">
                      {user.name}
                    </button>
                    {user.id === currentUser.id && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded-full">
                        Bạn
                      </span>
                    )}
                    {user.email === 'dotien.work@gmail.com' && (
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded-full">
                        Admin
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                <td className="px-6 py-4">
                  <div className="flex gap-1 flex-wrap">
                    {(user.teams || [user.team].filter(Boolean)).map((team, idx) => (
                      <span key={idx} className={`px-2 py-1 rounded-full text-xs ${
                        team === 'Content' ? 'bg-blue-100 text-blue-700' :
                        team === 'Kỹ Thuật' ? 'bg-orange-100 text-orange-700' :
                        team === 'Sale' ? 'bg-green-100 text-green-700' :
                        team === 'Edit Video' ? 'bg-purple-100 text-purple-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {team}
                      </span>
                    ))}
                    {(!user.teams && !user.team) && (
                      <span className="text-xs text-gray-400">Chưa có team</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <StatusBadge status={user.status} isActive={user.is_active} />
                </td>
                <td className="px-6 py-4">
                  <select
                    value={user.role}
                    onChange={(e) => {
                      if (window.confirm(`Thay đổi vai trò của ${user.name} thành ${e.target.value}?`)) {
                        changeUserRole(user.id, e.target.value);
                      }
                    }}
                    disabled={user.email === 'dotien.work@gmail.com'}
                    className={`px-3 py-1 rounded-lg text-sm font-medium border-2 ${
                      user.role === 'Admin' ? 'border-red-200 bg-red-50 text-red-700' :
                      user.role === 'Manager' ? 'border-purple-200 bg-purple-50 text-purple-700' :
                      user.role === 'Team Lead' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                      'border-gray-200 bg-gray-50 text-gray-700'
                    } ${user.email === 'dotien.work@gmail.com' ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <option value="Admin">Admin</option>
                    <option value="Manager">Manager</option>
                    <option value="Team Lead">Team Lead</option>
                    <option value="Member">Member</option>
                  </select>
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => {
                        setEditingTeamsUser(user);
                        setShowEditTeamsModal(true);
                      }}
                      className="px-3 py-1 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-sm font-medium"
                    >
                      👥 Teams
                    </button>
                    <button
                      onClick={() => {
                        setEditingUser(user);
                        setShowEditUserModal(true);
                      }}
                      className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-sm font-medium"
                    >
                      ✏️ B.Phận
                    </button>
                    {user.id !== currentUser.id && user.email !== 'dotien.work@gmail.com' && (
                      <>
                        <button
                          onClick={() => toggleUserActive(user)}
                          className={`px-3 py-1 rounded-lg text-sm font-medium ${
                            user.is_active === false
                              ? 'bg-green-100 hover:bg-green-200 text-green-700'
                              : 'bg-amber-100 hover:bg-amber-200 text-amber-700'
                          }`}
                        >
                          {user.is_active === false ? 'Mở khóa' : 'Khóa'}
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Xóa user "${user.name}"?\n\nHành động này không thể hoàn tác!`)) {
                              deleteUser(user.id);
                            }
                          }}
                          className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm font-medium"
                        >
                          Xóa
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-xl p-6">
        <h3 className="font-bold text-yellow-800 mb-2">Hướng Dẫn</h3>
        <ul className="text-sm text-yellow-700 space-y-1">
          <li>- <strong>Admin:</strong> Toàn quyền quản lý hệ thống, users, và dữ liệu</li>
          <li>- <strong>Manager:</strong> Quản lý tất cả tasks, phê duyệt, báo cáo</li>
          <li>- <strong>Team Lead:</strong> Quản lý tasks của team, phê duyệt team</li>
          <li>- <strong>Member:</strong> Chỉ quản lý tasks của bản thân</li>
          <li>- <strong>Khóa:</strong> Vô hiệu hóa tài khoản tạm thời (user không thể đăng nhập)</li>
        </ul>
      </div>

      {/* Edit Departments Modal */}
      {showEditUserModal && editingUser && (
        <EditUserDepartmentsModal
          user={editingUser}
          onClose={() => {
            setShowEditUserModal(false);
            setEditingUser(null);
          }}
          onSave={async (departments) => {
            try {
              const { error } = await supabase
                .from('users')
                .update({ departments })
                .eq('id', editingUser.id);

              if (error) throw error;

              alert('✅ Đã cập nhật bộ phận!');
              await loadUsers();
              setShowEditUserModal(false);
              setEditingUser(null);
            } catch (error) {
              console.error('Error updating departments:', error);
              alert('❌ Lỗi khi cập nhật bộ phận!');
            }
          }}
        />
      )}

      {showEditTeamsModal && editingTeamsUser && (
        <EditUserTeamsModal
          user={editingTeamsUser}
          onClose={() => {
            setShowEditTeamsModal(false);
            setEditingTeamsUser(null);
          }}
          onSave={async (teams) => {
            try {
              const { error } = await supabase
                .from('users')
                .update({ teams })
                .eq('id', editingTeamsUser.id);

              if (error) throw error;

              alert('Đã cập nhật teams!');
              await loadUsers();
              setShowEditTeamsModal(false);
              setEditingTeamsUser(null);
            } catch (error) {
              console.error('Error updating teams:', error);
              alert('Lỗi khi cập nhật teams!');
            }
          }}
        />
      )}

      {showEmployeeDetail && (
        <EmployeeDetailModal
          user={showEmployeeDetail}
          onClose={() => setShowEmployeeDetail(null)}
          onSaved={() => { loadUsers(); setShowEmployeeDetail(null); }}
        />
      )}
    </div>
  );
};

export default UserManagementView;
