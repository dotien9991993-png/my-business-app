import React from 'react';

export default function AutomationView({ currentUser, automations, setAutomations, templates, createFromTemplate }) {
  return (
    <div className="p-6">
      <h2 className="text-2xl font-bold mb-6">⚙️ Automation</h2>

      <div className="space-y-4">
        {automations.map(auto => (
          <div key={auto.id} className="bg-white p-6 rounded-xl shadow">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h3 className="font-bold text-lg">{auto.name}</h3>
                <div className="text-sm text-gray-600 mt-1">
                  Khi: <span className="font-medium">{auto.trigger}</span> →
                  Thực hiện: <span className="font-medium">{auto.action}</span>
                </div>
              </div>
              <label className="relative inline-block w-12 h-6">
                <input
                  type="checkbox"
                  checked={auto.active}
                  onChange={(e) =>
                    setAutomations(
                      automations.map(a =>
                        a.id === auto.id ? { ...a, active: e.target.checked } : a
                      )
                    )
                  }
                  className="sr-only peer"
                />
                <span className="absolute cursor-pointer inset-0 bg-gray-300 rounded-full peer-checked:bg-green-600 transition-colors" />
                <span className="absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform peer-checked:translate-x-6" />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 bg-white p-6 rounded-xl shadow">
        <h3 className="font-bold text-lg mb-4">📋 Templates</h3>
        <div className="space-y-3">
          {templates.map(template => (
            <div key={template.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <div className="font-medium">{template.name}</div>
                <div className="text-sm text-gray-600">{template.tasks.length} tasks • {template.team}</div>
              </div>
              <button
                onClick={() => createFromTemplate(template)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Sử dụng
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Reset Data - Chỉ Manager mới thấy */}
      {currentUser && currentUser.role === 'Manager' && (
        <div className="mt-6 bg-red-50 border-2 border-red-200 p-6 rounded-xl">
          <h3 className="font-bold text-lg mb-2 text-red-700">⚠️ Khu Vực Nguy Hiểm</h3>
          <p className="text-sm text-gray-700 mb-4">
            Xóa toàn bộ dữ liệu và khôi phục về mặc định. Hành động này KHÔNG THỂ hoàn tác!
          </p>
          <button
            onClick={() => {
              // eslint-disable-next-line no-restricted-globals
              if (confirm('⚠️ BẠN CÓ CHẮC CHẮN?\n\nĐiều này sẽ:\n- Xóa TẤT CẢ tasks trong database\n- Xóa TẤT CẢ users đã tạo\n\nHành động này KHÔNG THỂ hoàn tác!')) {
                // eslint-disable-next-line no-restricted-globals
                if (confirm('⚠️ XÁC NHẬN LẦN CUỐI!\n\nBạn THỰC SỰ muốn xóa toàn bộ dữ liệu?')) {
                  alert('⚠️ Tính năng Reset đã tạm thời vô hiệu hóa để bảo vệ dữ liệu Supabase.\n\nNếu cần xóa dữ liệu, vui lòng vào Supabase Dashboard.');
                }
              }
            }}
            className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium"
          >
            🗑️ Reset Toàn Bộ Dữ Liệu
          </button>
        </div>
      )}
    </div>
  );
}
