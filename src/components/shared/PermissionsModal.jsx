import React, { useState } from 'react';
import { permissionLevels, departments, moduleTabs } from '../../constants/permissionConstants';
import { isAdmin as isAdminRole } from '../../utils/permissionUtils';

export default function PermissionsModal({ allUsers, onClose, loadUsers, supabase }) {
  const [selectedUser, setSelectedUser] = useState(null);
  const [saving, setSaving] = useState(false);

  const getRoleBadge = (role) => {
    if (isAdminRole({ role })) return <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">Admin</span>;
    if (role === 'Manager') return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">Manager</span>;
    return <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">Member</span>;
  };

  const getUserDepartments = (user) => {
    if (isAdminRole(user)) return 'Tất cả (Toàn quyền)';
    const perms = user.permissions || {};
    const depts = departments.filter(d => perms[d.id] && perms[d.id] > 0);
    if (depts.length === 0) return <span className="text-gray-400">Chưa phân quyền</span>;
    return depts.map(d => {
      const level = perms[d.id];
      const icon = d.name.split(' ')[0];
      const levelLabel = level === 1 ? '①' : level === 2 ? '②' : '③';
      return `${icon}${levelLabel}`;
    }).join(' ');
  };

  const UserPermissionDetail = ({ user, onClose }) => {
    const [localPerms, setLocalPerms] = useState(user.permissions || {});
    const [localTabs, setLocalTabs] = useState(user.allowed_tabs || {});
    const [hasChanges, setHasChanges] = useState(false);
    const [expandedDept, setExpandedDept] = useState(null);
    const isAdmin = isAdminRole(user);

    const handleToggleDept = (deptId) => {
      if (isAdmin) return;
      const current = localPerms[deptId] || 0;
      if (current > 0) {
        setLocalPerms(prev => ({ ...prev, [deptId]: 0 }));
        setLocalTabs(prev => ({ ...prev, [deptId]: [] }));
      } else {
        setLocalPerms(prev => ({ ...prev, [deptId]: 1 }));
        const allTabs = (moduleTabs[deptId] || []).map(t => t.id);
        setLocalTabs(prev => ({ ...prev, [deptId]: allTabs }));
      }
      setHasChanges(true);
    };

    const handleLevelChange = (deptId, level) => {
      if (isAdmin) return;
      setLocalPerms(prev => ({ ...prev, [deptId]: level }));
      setHasChanges(true);
    };

    const handleToggleTab = (deptId, tabId) => {
      if (isAdmin) return;
      const currentTabs = localTabs[deptId] || [];
      if (currentTabs.includes(tabId)) {
        const newTabs = currentTabs.filter(t => t !== tabId);
        setLocalTabs(prev => ({ ...prev, [deptId]: newTabs }));
      } else {
        setLocalTabs(prev => ({ ...prev, [deptId]: [...currentTabs, tabId] }));
      }
      setHasChanges(true);
    };

    const handleSelectAllTabs = (deptId) => {
      if (isAdmin) return;
      const allTabs = (moduleTabs[deptId] || []).map(t => t.id);
      const currentTabs = localTabs[deptId] || [];
      const allSelected = allTabs.every(t => currentTabs.includes(t));
      if (allSelected) {
        setLocalTabs(prev => ({ ...prev, [deptId]: [] }));
      } else {
        setLocalTabs(prev => ({ ...prev, [deptId]: allTabs }));
      }
      setHasChanges(true);
    };

    const selectAllDepts = () => {
      if (isAdmin) return;
      const allEnabled = departments.every(d => localPerms[d.id] > 0);
      const newPerms = {};
      const newTabs = {};
      departments.forEach(d => {
        newPerms[d.id] = allEnabled ? 0 : 1;
        newTabs[d.id] = allEnabled ? [] : (moduleTabs[d.id] || []).map(t => t.id);
      });
      setLocalPerms(newPerms);
      setLocalTabs(newTabs);
      setHasChanges(true);
    };

    const handleSave = async () => {
      try {
        setSaving(true);
        const { error } = await supabase
          .from('users')
          .update({
            permissions: localPerms,
            allowed_tabs: localTabs
          })
          .eq('id', user.id);
        if (error) throw error;
        await loadUsers();
        setHasChanges(false);
        alert('✅ Đã lưu phân quyền thành công!');
        onClose();
      } catch (error) {
        alert('❌ Lỗi: ' + error.message);
      } finally {
        setSaving(false);
      }
    };

    const handleCancel = () => {
      if (hasChanges) {
        if (!window.confirm('Bạn có thay đổi chưa lưu. Bạn có chắc muốn hủy?')) return;
      }
      onClose();
    };

    const getLevelColor = (level) => {
      if (level === 0) return 'bg-gray-100 text-gray-500 border-gray-200';
      if (level === 1) return 'bg-yellow-100 text-yellow-700 border-yellow-300';
      if (level === 2) return 'bg-blue-100 text-blue-700 border-blue-300';
      return 'bg-green-100 text-green-700 border-green-300';
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
        <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div className="p-5 border-b bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold">🔐 Phân quyền: {user.name}</h2>
                <p className="text-white/80 text-sm mt-1">{user.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {getRoleBadge(user.role)}
                <button onClick={handleCancel} className="text-2xl hover:bg-white/20 w-10 h-10 rounded-lg flex items-center justify-center ml-2">×</button>
              </div>
            </div>
          </div>

          <div className="p-5 overflow-y-auto flex-1 space-y-3">
            {isAdmin ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                <div className="text-5xl mb-3">👑</div>
                <div className="font-bold text-red-800 text-lg">Admin có toàn quyền</div>
                <div className="text-sm text-red-600 mt-1">Không thể thay đổi quyền Admin</div>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center bg-gray-50 rounded-lg p-3">
                  <span className="text-sm font-medium text-gray-700">Chọn bộ phận và cấp quyền:</span>
                  <button onClick={selectAllDepts} className="text-sm text-blue-600 hover:text-blue-800 font-medium">
                    {departments.every(d => localPerms[d.id] > 0) ? '❌ Bỏ chọn tất cả' : '✅ Chọn tất cả'}
                  </button>
                </div>

                {departments.map(dept => {
                  const level = localPerms[dept.id] || 0;
                  const isEnabled = level > 0;
                  const deptTabs = moduleTabs[dept.id] || [];
                  const enabledTabs = localTabs[dept.id] || [];
                  const isExpanded = expandedDept === dept.id;

                  return (
                    <div key={dept.id} className={`border-2 rounded-xl overflow-hidden transition-all ${isEnabled ? 'border-blue-400 shadow-sm' : 'border-gray-200'}`}>
                      <div
                        className={`p-4 flex items-center justify-between cursor-pointer ${isEnabled ? 'bg-blue-50' : 'bg-gray-50 hover:bg-gray-100'}`}
                        onClick={() => handleToggleDept(dept.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-6 h-6 rounded border-2 flex items-center justify-center ${isEnabled ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                            {isEnabled && <span className="text-white text-sm">✓</span>}
                          </div>
                          <div>
                            <div className="font-semibold text-gray-800">{dept.name}</div>
                            <div className="text-xs text-gray-500">{dept.desc}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {isEnabled && (
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${getLevelColor(level)}`}>
                              {permissionLevels.find(p => p.value === level)?.label}
                            </span>
                          )}
                          {isEnabled && deptTabs.length > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); setExpandedDept(isExpanded ? null : dept.id); }}
                              className="px-2 py-1 text-xs bg-gray-200 hover:bg-gray-300 rounded"
                            >
                              {isExpanded ? '▲' : '▼'} Chi tiết
                            </button>
                          )}
                        </div>
                      </div>

                      {isEnabled && (
                        <div className="px-4 pb-4 pt-3 bg-white border-t space-y-4">
                          <div>
                            <div className="text-xs text-gray-500 mb-2 font-medium">⚡ Chọn cấp quyền:</div>
                            <div className="grid grid-cols-3 gap-2">
                              {permissionLevels.filter(p => p.value > 0).map(p => (
                                <button
                                  key={p.value}
                                  onClick={(e) => { e.stopPropagation(); handleLevelChange(dept.id, p.value); }}
                                  className={`p-2 rounded-lg border-2 text-left transition-all ${
                                    level === p.value
                                      ? getLevelColor(p.value) + ' border-2 shadow-sm'
                                      : 'border-gray-200 hover:border-gray-300 bg-white'
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${level === p.value ? 'border-current bg-current' : 'border-gray-300'}`}>
                                      {level === p.value && <span className="text-white text-xs">•</span>}
                                    </div>
                                    <span className="font-bold text-xs">{p.label}</span>
                                  </div>
                                  <div className="text-xs text-gray-500 ml-5 mt-0.5">{p.desc}</div>
                                </button>
                              ))}
                            </div>
                          </div>

                          {deptTabs.length > 0 && isExpanded && (
                            <div className="border-t pt-3">
                              <div className="flex justify-between items-center mb-2">
                                <div className="text-xs text-gray-500 font-medium">📑 Chọn mục được xem:</div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleSelectAllTabs(dept.id); }}
                                  className="text-xs text-blue-600 hover:text-blue-800"
                                >
                                  {deptTabs.every(t => enabledTabs.includes(t.id)) ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                {deptTabs.map(tab => {
                                  const isTabEnabled = enabledTabs.includes(tab.id);
                                  return (
                                    <button
                                      key={tab.id}
                                      onClick={(e) => { e.stopPropagation(); handleToggleTab(dept.id, tab.id); }}
                                      className={`p-2 rounded-lg border-2 text-left transition-all ${
                                        isTabEnabled
                                          ? 'bg-green-50 border-green-400 text-green-700'
                                          : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <div className={`w-4 h-4 rounded border-2 flex items-center justify-center text-xs ${
                                          isTabEnabled ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 bg-white'
                                        }`}>
                                          {isTabEnabled && '✓'}
                                        </div>
                                        <span className="font-medium text-sm">{tab.name}</span>
                                      </div>
                                      <div className="text-xs text-gray-400 ml-6">{tab.desc}</div>
                                    </button>
                                  );
                                })}
                              </div>
                              {enabledTabs.length === 0 && (
                                <div className="text-xs text-orange-500 mt-2">⚠️ Chưa chọn mục nào - User sẽ không thấy nội dung</div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
            <div>
              {hasChanges && <span className="text-orange-600 text-sm font-medium">⚠️ Có thay đổi chưa lưu</span>}
            </div>
            <div className="flex gap-3">
              <button onClick={handleCancel} className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100">
                Hủy
              </button>
              {!isAdmin && (
                <button
                  onClick={handleSave}
                  disabled={saving || !hasChanges}
                  className={`px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 ${
                    hasChanges
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  {saving ? '💾 Đang lưu...' : '💾 Lưu thay đổi'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b bg-gradient-to-r from-purple-600 to-indigo-600 text-white flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">🔐 Quản Lý Phân Quyền</h2>
            <p className="text-white/80 text-sm">Nhấn "Phân quyền" để cài đặt chi tiết cho từng user</p>
          </div>
          <button onClick={onClose} className="text-2xl hover:bg-white/20 w-10 h-10 rounded-lg flex items-center justify-center">×</button>
        </div>

        <div className="overflow-y-auto flex-1">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="text-left p-4 text-sm font-semibold text-gray-600">#</th>
                <th className="text-left p-4 text-sm font-semibold text-gray-600">Tên</th>
                <th className="text-left p-4 text-sm font-semibold text-gray-600">Vai trò</th>
                <th className="text-left p-4 text-sm font-semibold text-gray-600">Bộ phận được truy cập</th>
                <th className="text-left p-4 text-sm font-semibold text-gray-600">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {allUsers.map((user, idx) => (
                <tr key={user.id} className="border-t hover:bg-gray-50">
                  <td className="p-4 text-sm text-gray-500">{idx + 1}</td>
                  <td className="p-4">
                    <div className="font-medium text-gray-800">{user.name}</div>
                    <div className="text-xs text-gray-500">{user.email}</div>
                  </td>
                  <td className="p-4">{getRoleBadge(user.role)}</td>
                  <td className="p-4 text-sm">{getUserDepartments(user)}</td>
                  <td className="p-4">
                    <button
                      onClick={() => setSelectedUser(user)}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"
                    >
                      🔐 Phân quyền
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-4 border-t bg-gray-50">
          <div className="flex flex-wrap gap-4 text-xs text-gray-500">
            <span>Chú thích cấp quyền:</span>
            {permissionLevels.map(p => (
              <span key={p.value} className="flex items-center gap-1">
                <span className={`w-3 h-3 rounded-full bg-${p.color}-400`}></span>
                {p.value} = {p.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {selectedUser && (
        <UserPermissionDetail user={selectedUser} onClose={() => setSelectedUser(null)} />
      )}
    </div>
  );
}
