import React, { useState, useEffect } from 'react';
import { formatMoney } from '../../utils/formatUtils';
import { getTodayVN, getNowISOVN } from '../../utils/dateUtils';
import { supabase } from '../../supabaseClient';
import { isAdmin } from '../../utils/permissionUtils';

const JobDetailModal = ({
  selectedJob,
  setSelectedJob,
  setShowJobModal,
  currentUser,
  tenant,
  allUsers,
  loadTechnicalJobs,
  loadFinanceData,
  saveJobEditDraft,
  loadJobEditDraft,
  clearJobEditDraft,
  deleteTechnicalJob,
  addNotification
}) => {
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [newTechnicians, setNewTechnicians] = useState([]);

  // Edit state - local trong modal
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editEquipment, setEditEquipment] = useState('');
  const [editScheduledDate, setEditScheduledDate] = useState('');
  const [editScheduledTime, setEditScheduledTime] = useState('');
  const [editPayment, setEditPayment] = useState('');
  const [editTechnicians, setEditTechnicians] = useState([]);

  // Chi phí công việc
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState('Tiền xe');

  const expenseCategories = ['Tiền xe', 'Chi phí ăn uống', 'Chi phí khác'];

  // Lấy danh sách KTV từ users
  const technicianUsers = allUsers.filter(u =>
    u.departments?.includes('technical') || isAdmin(u)
  );

  // Kiểm tra và load draft khi modal mở (chỉ 1 lần)
  useEffect(() => {
    if (selectedJob && !isEditing) {
      const draft = loadJobEditDraft(selectedJob.id);
      if (draft) {
        // Có draft cũ - hỏi user có muốn tiếp tục không
        if (window.confirm('Có bản nháp chưa lưu. Tiếp tục chỉnh sửa?')) {
          setIsEditing(true);
          setEditTitle(draft.title || selectedJob.title || '');
          setEditCustomerName(draft.customerName || selectedJob.customerName || '');
          setEditCustomerPhone(draft.customerPhone || selectedJob.customerPhone || '');
          setEditAddress(draft.address || selectedJob.address || '');
          setEditEquipment(draft.equipment || (selectedJob.equipment ? selectedJob.equipment.join('\n') : ''));
          setEditScheduledDate(draft.scheduledDate || selectedJob.scheduledDate || '');
          setEditScheduledTime(draft.scheduledTime || selectedJob.scheduledTime || '');
          setEditPayment(draft.payment || selectedJob.customerPayment || '');
          setEditTechnicians(draft.technicians || selectedJob.technicians || []);
        } else {
          clearJobEditDraft();
        }
      }
    }
  }, [selectedJob?.id]);

  // Auto-save draft khi đang edit (debounced)
  useEffect(() => {
    if (!isEditing || !selectedJob) return;

    const timer = setTimeout(() => {
      saveJobEditDraft({
        jobId: selectedJob.id,
        title: editTitle,
        customerName: editCustomerName,
        customerPhone: editCustomerPhone,
        address: editAddress,
        equipment: editEquipment,
        scheduledDate: editScheduledDate,
        scheduledTime: editScheduledTime,
        payment: editPayment,
        technicians: editTechnicians
      });
    }, 1000);

    return () => clearTimeout(timer);
  }, [isEditing, editTitle, editCustomerName, editCustomerPhone, editAddress, editEquipment, editScheduledDate, editScheduledTime, editPayment, editTechnicians]);

  if (!selectedJob) return null;

  // Chi phí từ job
  const jobExpenses = selectedJob.expenses || [];
  const totalExpenses = jobExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  const netProfit = (selectedJob.customerPayment || 0) - totalExpenses;

  // Kiểm tra quyền sửa/xóa
  const isCreator = selectedJob.createdBy === currentUser.name;
  const isLocked = selectedJob.status === 'Hoàn thành' || selectedJob.status === 'Hủy';
  const canEdit = !isLocked && (isAdmin(currentUser) || isCreator);
  const canDelete = !isLocked && (isAdmin(currentUser) || isCreator);

  // Thêm chi phí
  const addExpense = async () => {
    if (!expenseAmount) {
      alert('⚠️ Vui lòng nhập số tiền!');
      return;
    }

    // Chỉ yêu cầu mô tả khi chọn "Chi phí khác"
    if (expenseCategory === 'Chi phí khác' && !expenseDesc) {
      alert('⚠️ Vui lòng nhập mô tả cho chi phí khác!');
      return;
    }

    const newExpense = {
      id: Date.now(),
      description: expenseCategory === 'Chi phí khác' ? expenseDesc : '',
      amount: parseFloat(expenseAmount),
      category: expenseCategory,
      addedBy: currentUser.name,
      addedAt: getNowISOVN()
    };

    const updatedExpenses = [...jobExpenses, newExpense];

    console.log('Saving expenses:', updatedExpenses);
    console.log('Job ID:', selectedJob.id);

    try {
      const { data, error } = await supabase
        .from('technical_jobs')
        .update({ expenses: updatedExpenses })
        .eq('id', selectedJob.id)
        .select();

      console.log('Response:', data, error);

      if (error) throw error;

      alert('✅ Đã thêm chi phí: ' + formatMoney(newExpense.amount));
      setSelectedJob({ ...selectedJob, expenses: updatedExpenses });
      setExpenseDesc('');
      setExpenseAmount('');
      setShowAddExpense(false);
      await loadTechnicalJobs();
    } catch (error) {
      console.error('Error adding expense:', error);
      alert('❌ Lỗi khi thêm chi phí: ' + error.message);
    }
  };

  // Xóa chi phí
  const removeExpense = async (expenseId) => {
    if (!window.confirm('Xóa chi phí này?')) return;

    const updatedExpenses = jobExpenses.filter(e => e.id !== expenseId);

    try {
      const { error } = await supabase
        .from('technical_jobs')
        .update({ expenses: updatedExpenses })
        .eq('id', selectedJob.id);

      if (error) throw error;

      setSelectedJob({ ...selectedJob, expenses: updatedExpenses });
      await loadTechnicalJobs();
    } catch (error) {
      console.error('Error removing expense:', error);
      alert('❌ Lỗi khi xóa chi phí!');
    }
  };

  const openEditMode = () => {
    setEditTitle(selectedJob.title || '');
    setEditCustomerName(selectedJob.customerName || '');
    setEditCustomerPhone(selectedJob.customerPhone || '');
    setEditAddress(selectedJob.address || '');
    setEditEquipment(selectedJob.equipment ? selectedJob.equipment.join('\n') : '');
    setEditScheduledDate(selectedJob.scheduledDate || '');
    setEditScheduledTime(selectedJob.scheduledTime || '');
    setEditPayment(selectedJob.customerPayment || '');
    setEditTechnicians(selectedJob.technicians || []);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    clearJobEditDraft();
  };

  const saveEditJob = async () => {
    if (!editTitle || !editCustomerName) {
      alert('⚠️ Vui lòng nhập tiêu đề và tên khách hàng!');
      return;
    }
    try {
      const equipmentArray = editEquipment.split('\n').filter(e => e.trim());
      const { error } = await supabase
        .from('technical_jobs')
        .update({
          title: editTitle,
          customer_name: editCustomerName,
          customer_phone: editCustomerPhone,
          address: editAddress,
          equipment: equipmentArray,
          scheduled_date: editScheduledDate,
          scheduled_time: editScheduledTime,
          customer_payment: parseFloat(editPayment) || 0,
          technicians: editTechnicians
        })
        .eq('id', selectedJob.id);

      if (error) throw error;
      alert('✅ Cập nhật thành công!');
      setIsEditing(false);
      clearJobEditDraft();
      await loadTechnicalJobs();
      setSelectedJob({
        ...selectedJob,
        title: editTitle,
        customerName: editCustomerName,
        customerPhone: editCustomerPhone,
        address: editAddress,
        equipment: equipmentArray,
        scheduledDate: editScheduledDate,
        scheduledTime: editScheduledTime,
        customerPayment: parseFloat(editPayment) || 0,
        technicians: editTechnicians
      });
    } catch (error) {
      console.error('Error updating job:', error);
      alert('❌ Lỗi khi cập nhật: ' + error.message);
    }
  };

  // Tạo phiếu thu từ công việc kỹ thuật
  const createReceiptFromJob = async (job) => {
    try {
      // Tạo mã phiếu thu
      const today = new Date();
      const dateStr = today.toISOString().slice(0,10).replace(/-/g, '');
      const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const receiptNumber = `PT-${dateStr}-${randomNum}`;

      // Handle cả snake_case và camelCase
      const paymentAmount = job.customerPayment || job.customer_payment || 0;
      const custName = job.customerName || job.customer_name || '';
      const custPhone = job.customerPhone || job.customer_phone || '';
      const custAddress = job.address || '';
      const techNames = job.technicians?.join(', ') || 'N/A';

      const { error } = await supabase
        .from('receipts_payments')
        .insert([{
          tenant_id: tenant.id,
          receipt_number: receiptNumber,
          type: 'thu',
          amount: paymentAmount,
          description: `Thu tiền lắp đặt: ${job.title}`,
          category: 'Lắp đặt tại nhà khách',
          status: 'pending',
          receipt_date: getTodayVN(),
          note: `Khách hàng: ${custName}\nSĐT: ${custPhone}\nĐịa chỉ: ${custAddress}\nKỹ thuật viên: ${techNames}\n\n[Tự động tạo từ công việc kỹ thuật - Chờ duyệt]`,
          created_by: currentUser.name,
          created_at: getNowISOVN()
        }]);

      if (error) throw error;

      // Reload receipts data
      await loadFinanceData();

      return true;
    } catch (error) {
      console.error('Error creating receipt:', error);
      alert('❌ Lỗi khi tạo phiếu thu: ' + error.message);
      return false;
    }
  };

  // Tạo phiếu chi từ chi phí công việc
  const createExpenseReceiptsFromJob = async (job) => {
    const expenses = job.expenses || [];
    if (expenses.length === 0) return true;

    try {
      const today = new Date();
      const dateStr = today.toISOString().slice(0,10).replace(/-/g, '');

      // Handle cả snake_case và camelCase
      const custName = job.customerName || job.customer_name || '';
      const techNames = job.technicians?.join(', ') || 'N/A';

      // Tạo 1 phiếu chi tổng hợp
      const totalExpense = expenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
      const expenseDetails = expenses.map(e => `- ${e.category}${e.description ? ': ' + e.description : ''}: ${formatMoney(e.amount)}`).join('\n');
      const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const receiptNumber = `PC-${dateStr}-${randomNum}`;

      const { error } = await supabase
        .from('receipts_payments')
        .insert([{
          tenant_id: tenant.id,
          receipt_number: receiptNumber,
          type: 'chi',
          amount: totalExpense,
          description: `Chi phí lắp đặt: ${job.title}`,
          category: 'Vận chuyển',
          status: 'pending',
          receipt_date: getTodayVN(),
          note: `Chi tiết chi phí:\n${expenseDetails}\n\nKhách hàng: ${custName}\nKỹ thuật viên: ${techNames}\n\n[Tự động tạo từ công việc kỹ thuật - Chờ duyệt]`,
          created_by: currentUser.name,
          created_at: getNowISOVN()
        }]);

      if (error) throw error;

      await loadFinanceData();
      return true;
    } catch (error) {
      console.error('Error creating expense receipts:', error);
      alert('❌ Lỗi khi tạo phiếu chi: ' + error.message);
      return false;
    }
  };

  const updateJobStatus = async (newStatus) => {
    // Block nếu status hiện tại đã lock
    if (selectedJob.status === 'Hoàn thành' || selectedJob.status === 'Hủy') {
      alert('⚠️ Không thể thay đổi trạng thái!\n\nCông việc đã ' +
            (selectedJob.status === 'Hoàn thành' ? 'hoàn thành' : 'bị hủy') +
            ' và đã bị khóa.');
      return;
    }

    // Confirm khi chuyển sang status cuối
    if (newStatus === 'Hoàn thành') {
      // *** FIX: Load lại job mới nhất từ database để có dữ liệu chính xác ***
      let latestJob = selectedJob;
      try {
        const { data: freshJob, error: fetchError } = await supabase
          .from('technical_jobs')
          .select('*')
          .eq('id', selectedJob.id)
          .single();

        if (fetchError) {
          console.error('Error fetching latest job:', fetchError);
        } else if (freshJob) {
          // Map snake_case sang camelCase
          latestJob = {
            ...freshJob,
            customerPayment: freshJob.customer_payment || freshJob.customerPayment || 0,
            customerName: freshJob.customer_name || freshJob.customerName || '',
            customerPhone: freshJob.customer_phone || freshJob.customerPhone || '',
            technicians: freshJob.technicians || [],
            expenses: freshJob.expenses || []
          };
          console.log('Loaded latest job data:', latestJob);
        }
      } catch (err) {
        console.error('Error loading latest job:', err);
      }

      const hasPayment = (latestJob.customerPayment || latestJob.customer_payment || 0) > 0;
      const hasExpenses = (latestJob.expenses || []).length > 0;
      const totalExp = (latestJob.expenses || []).reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
      const paymentAmount = latestJob.customerPayment || latestJob.customer_payment || 0;

      // Xây dựng thông báo
      let confirmMsg = `✅ Xác nhận hoàn thành công việc?\n\n`;

      if (hasPayment) {
        confirmMsg += `💰 Thu của khách: ${formatMoney(paymentAmount)}\n`;
      }
      if (hasExpenses) {
        confirmMsg += `💸 Chi phí: ${formatMoney(totalExp)}\n`;
      }
      if (hasPayment && hasExpenses) {
        confirmMsg += `📊 Còn lại: ${formatMoney(paymentAmount - totalExp)}\n`;
      }

      if (hasPayment || hasExpenses) {
        confirmMsg += `\n📝 Bạn có muốn TẠO PHIẾU TỰ ĐỘNG không?\n`;
        if (hasPayment) confirmMsg += `• Phiếu thu: ${formatMoney(paymentAmount)}\n`;
        if (hasExpenses) confirmMsg += `• Phiếu chi: ${formatMoney(totalExp)}\n`;
        confirmMsg += `\n• Nhấn OK → Tạo phiếu tự động\n• Nhấn Cancel → Không tạo phiếu`;

        const createReceipts = window.confirm(confirmMsg);

        try {
          // Update status
          const { error } = await supabase
            .from('technical_jobs')
            .update({ status: newStatus })
            .eq('id', selectedJob.id);

          if (error) throw error;

          let resultMsg = '✅ Hoàn thành công việc!\n\n';

          // Tạo phiếu nếu user đồng ý
          if (createReceipts) {
            if (hasPayment) {
              const successThu = await createReceiptFromJob(latestJob);
              resultMsg += successThu ? '✓ Đã tạo phiếu thu\n' : '⚠️ Lỗi tạo phiếu thu\n';
            }
            if (hasExpenses) {
              const successChi = await createExpenseReceiptsFromJob(latestJob);
              resultMsg += successChi ? '✓ Đã tạo phiếu chi\n' : '⚠️ Lỗi tạo phiếu chi\n';
            }
          }

          resultMsg += '\n🔒 Trạng thái đã bị khóa.';
          alert(resultMsg);

          await loadTechnicalJobs();
          setSelectedJob({ ...selectedJob, status: newStatus });
          return;
        } catch (error) {
          console.error('Error updating job status:', error);
          alert('❌ Lỗi khi cập nhật trạng thái!');
          return;
        }
      } else {
        // Không có tiền thu và chi phí
        if (!window.confirm('✅ Xác nhận hoàn thành công việc?\n\n⚠️ Sau khi hoàn thành, bạn KHÔNG THỂ thay đổi trạng thái nữa!')) {
          return;
        }
      }
    } else if (newStatus === 'Hủy') {
      if (!window.confirm('❌ Xác nhận hủy công việc?\n\n⚠️ Sau khi hủy, bạn KHÔNG THỂ thay đổi trạng thái nữa!')) {
        return;
      }
    }

    try {
      const { error } = await supabase
        .from('technical_jobs')
        .update({ status: newStatus })
        .eq('id', selectedJob.id);

      if (error) throw error;

      await loadTechnicalJobs();
      setSelectedJob({ ...selectedJob, status: newStatus });

      // Thông báo thành công
      if (newStatus === 'Hoàn thành' || newStatus === 'Hủy') {
        alert('✅ Đã ' + (newStatus === 'Hoàn thành' ? 'hoàn thành' : 'hủy') +
              ' công việc!\n\n🔒 Trạng thái đã bị khóa và không thể thay đổi.');
      }
    } catch (error) {
      console.error('Error updating job status:', error);
      alert('❌ Lỗi khi cập nhật trạng thái!');
    }
  };

  const updateJobTechnicians = async (technicians) => {
    try {
      const { error } = await supabase
        .from('technical_jobs')
        .update({ technicians })
        .eq('id', selectedJob.id);

      if (error) throw error;

      // Notify new technicians
      technicians.forEach(techName => {
        if (!selectedJob.technicians.includes(techName) && techName !== currentUser.name) {
          addNotification({
            type: 'assigned',
            taskId: null,
            title: '🔧 Công việc mới',
            message: `Bạn được gán vào công việc: "${selectedJob.title}"`,
            read: false,
            createdAt: getNowISOVN()
          });
        }
      });

      alert('✅ Đã cập nhật kỹ thuật viên!');
      await loadTechnicalJobs();
      setSelectedJob({ ...selectedJob, technicians });
      setShowReassignModal(false);
    } catch (error) {
      console.error('Error updating technicians:', error);
      alert('❌ Lỗi khi cập nhật kỹ thuật viên!');
    }
  };

  const getTechnicalUsers = () => {
    // Trả về tất cả users có thể được giao công việc kỹ thuật
    return allUsers.filter(u => u.is_active !== false);
  };

  const toggleTechnician = (techName) => {
    if (newTechnicians.includes(techName)) {
      setNewTechnicians(newTechnicians.filter(t => t !== techName));
    } else {
      setNewTechnicians([...newTechnicians, techName]);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'Chờ XN': 'bg-yellow-100 text-yellow-800',
      'Đang làm': 'bg-blue-100 text-blue-800',
      'Hoàn thành': 'bg-green-100 text-green-800',
      'Hủy': 'bg-gray-100 text-gray-800'
    };
    return colors[status] || 'bg-gray-100';
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 pb-20 md:pb-4">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[85vh] md:max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-4 md:p-6 border-b bg-gradient-to-r from-orange-500 to-red-600 text-white flex-shrink-0">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <h2 className="text-xl md:text-2xl font-bold mb-2">{selectedJob.title}</h2>
              <div className="flex gap-2 flex-wrap">
                <span className={`px-3 py-1 rounded-full text-sm ${getStatusColor(selectedJob.status)}`}>
                  {selectedJob.status}
                </span>
                <span className="px-3 py-1 bg-white/20 rounded-full text-sm">
                  {selectedJob.type}
                </span>
              </div>
            </div>
            <button
              onClick={() => setShowJobModal(false)}
              className="text-2xl hover:bg-white/20 w-10 h-10 rounded flex items-center justify-center"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-4 md:p-6 space-y-4 md:space-y-6 overflow-y-auto flex-1">
          {/* Form chỉnh sửa */}
          {isEditing ? (
            <div className="space-y-4">
              {/* Nút Lưu ở đầu form - dễ thấy trên mobile */}
              <div className="flex gap-2 sticky top-0 bg-white py-2 z-10 border-b pb-3">
                <button
                  onClick={cancelEdit}
                  className="flex-1 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
                >
                  ❌ Hủy sửa
                </button>
                <button
                  onClick={saveEditJob}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-lg"
                >
                  💾 LƯU
                </button>
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                ✏️ Đang chỉnh sửa - Dữ liệu tự động lưu nháp
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Tiêu đề *</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Tiêu đề công việc"
                />
              </div>

              <div className="bg-blue-50 p-4 rounded-lg space-y-3">
                <h3 className="font-bold text-blue-800">👤 Thông tin khách hàng</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Tên khách *</label>
                    <input
                      type="text"
                      value={editCustomerName}
                      onChange={(e) => setEditCustomerName(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Số điện thoại</label>
                    <input
                      type="text"
                      value={editCustomerPhone}
                      onChange={(e) => setEditCustomerPhone(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Địa chỉ</label>
                  <input
                    type="text"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg">
                <label className="block text-sm font-medium mb-1">🎤 Thiết bị (mỗi dòng 1 thiết bị)</label>
                <textarea
                  value={editEquipment}
                  onChange={(e) => setEditEquipment(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Micro Shure SM58&#10;Loa JBL 12&#10;Amply 1000W"
                />
              </div>

              <div className="bg-orange-50 p-4 rounded-lg space-y-3">
                <h3 className="font-bold text-orange-800">📅 Lịch hẹn</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Ngày</label>
                    <input
                      type="date"
                      value={editScheduledDate}
                      onChange={(e) => setEditScheduledDate(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Giờ</label>
                    <input
                      type="time"
                      value={editScheduledTime}
                      onChange={(e) => setEditScheduledTime(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg"
                    />
                  </div>
                </div>
              </div>

              {/* Kỹ thuật viên */}
              <div className="bg-purple-50 p-4 rounded-lg">
                <h3 className="font-bold text-purple-800 mb-2">🔧 Kỹ thuật viên</h3>

                {/* Hiển thị KTV đã chọn - có thể bỏ chọn */}
                {editTechnicians.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-purple-600 mb-1">Đã chọn (bấm để bỏ):</p>
                    <div className="flex flex-wrap gap-2">
                      {editTechnicians.map(name => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setEditTechnicians(editTechnicians.filter(t => t !== name))}
                          className="px-3 py-1.5 rounded-full text-sm font-medium bg-purple-600 text-white hover:bg-purple-700"
                        >
                          ✓ {name} ✕
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Danh sách KTV có thể thêm */}
                <div>
                  <p className="text-xs text-gray-600 mb-1">Thêm kỹ thuật viên:</p>
                  <div className="flex flex-wrap gap-2">
                    {technicianUsers
                      .filter(user => !editTechnicians.includes(user.name))
                      .map(user => (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => setEditTechnicians([...editTechnicians, user.name])}
                          className="px-3 py-1.5 rounded-full text-sm font-medium bg-white border border-purple-300 text-purple-700 hover:bg-purple-100"
                        >
                          + {user.name}
                        </button>
                      ))}
                    {technicianUsers.filter(user => !editTechnicians.includes(user.name)).length === 0 && (
                      <span className="text-sm text-gray-500 italic">Đã chọn hết</span>
                    )}
                  </div>
                </div>

                {editTechnicians.length === 0 && (
                  <p className="text-sm text-orange-600 mt-2">⚠️ Chưa chọn kỹ thuật viên</p>
                )}
              </div>

              <div className="bg-green-50 p-4 rounded-lg">
                <label className="block text-sm font-medium mb-1">💰 Thu của khách (VNĐ)</label>
                <input
                  type="number"
                  value={editPayment}
                  onChange={(e) => setEditPayment(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="0"
                />
              </div>
            </div>
          ) : (
            <>
              {/* Customer Info */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <h3 className="font-bold mb-3 text-lg">👤 Thông tin khách hàng</h3>
                <div className="space-y-2 text-sm">
                  <div><strong>Tên:</strong> {selectedJob.customerName}</div>
                  <div><strong>Số điện thoại:</strong> {selectedJob.customerPhone}</div>
                  <div><strong>Địa chỉ:</strong> {selectedJob.address}</div>
                </div>
              </div>

              {/* Equipment */}
              {selectedJob.equipment && selectedJob.equipment.length > 0 && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <h3 className="font-bold mb-3 text-lg">🎤 Thiết bị</h3>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {selectedJob.equipment.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Schedule */}
              <div className="bg-orange-50 p-4 rounded-lg">
                <h3 className="font-bold mb-3 text-lg">📅 Lịch hẹn</h3>
                <div className="space-y-2 text-sm">
                  {selectedJob.createdBy && (
                    <div>
                      <strong>📝 Người tạo:</strong> {selectedJob.createdBy}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div>
                      <strong>🔧 Kỹ thuật viên:</strong> {selectedJob.technicians ? selectedJob.technicians.join(', ') : selectedJob.technician}
                    </div>
                    {!isLocked && (isAdmin(currentUser) || (currentUser.departments && currentUser.departments.includes('sales'))) && (
                      <button
                        onClick={() => {
                          setNewTechnicians(selectedJob.technicians || []);
                          setShowReassignModal(true);
                        }}
                        className="px-3 py-1 bg-orange-600 hover:bg-orange-700 text-white rounded text-xs font-medium"
                      >
                        ✏️ Thay Đổi
                      </button>
                    )}
                  </div>
                  <div><strong>Ngày:</strong> {selectedJob.scheduledDate}</div>
                  <div><strong>Giờ:</strong> {selectedJob.scheduledTime || 'Chưa xác định'}</div>
                </div>
              </div>

              {/* Customer Payment */}
              {selectedJob.customerPayment > 0 && (
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="font-bold mb-3 text-lg">💰 Thu của khách</h3>
                  <div className="text-2xl font-bold text-green-700">
                    {formatMoney(selectedJob.customerPayment)}
                  </div>
                </div>
              )}

              {/* Job Expenses */}
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-lg">💸 Chi phí công việc</h3>
                  {!isLocked && (
                    <button
                      onClick={() => setShowAddExpense(!showAddExpense)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium"
                    >
                      {showAddExpense ? '✕ Đóng' : '+ Thêm'}
                    </button>
                  )}
                </div>

                {/* Form thêm chi phí */}
                {showAddExpense && (
                  <div className="bg-white p-3 rounded-lg border mb-3 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={expenseCategory}
                        onChange={(e) => setExpenseCategory(e.target.value)}
                        className="px-3 py-2 border rounded-lg text-sm"
                      >
                        {expenseCategories.map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={expenseAmount}
                        onChange={(e) => setExpenseAmount(e.target.value)}
                        placeholder="Số tiền"
                        className="px-3 py-2 border rounded-lg text-sm"
                      />
                    </div>
                    {expenseCategory === 'Chi phí khác' && (
                      <input
                        type="text"
                        value={expenseDesc}
                        onChange={(e) => setExpenseDesc(e.target.value)}
                        placeholder="Mô tả chi phí..."
                        className="w-full px-3 py-2 border rounded-lg text-sm"
                      />
                    )}
                    <button
                      onClick={addExpense}
                      className="w-full px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium"
                    >
                      ✓ Thêm chi phí
                    </button>
                  </div>
                )}

                {/* Danh sách chi phí */}
                {jobExpenses.length > 0 ? (
                  <div className="space-y-2">
                    {jobExpenses.map(expense => (
                      <div key={expense.id} className="flex justify-between items-center bg-white p-2 rounded border">
                        <div className="flex-1">
                          <div className="text-sm font-medium">{expense.category}{expense.description ? `: ${expense.description}` : ''}</div>
                          <div className="text-xs text-gray-500">{expense.addedBy}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-red-600">{formatMoney(expense.amount)}</span>
                          {!isLocked && (
                            <button
                              onClick={() => removeExpense(expense.id)}
                              className="text-gray-400 hover:text-red-600 p-1"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="font-medium">Tổng chi phí:</span>
                      <span className="font-bold text-red-700">{formatMoney(totalExpenses)}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-2">Chưa có chi phí nào</p>
                )}
              </div>

              {/* Profit Summary */}
              {(selectedJob.customerPayment > 0 || totalExpenses > 0) && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-bold mb-3 text-lg">📊 Tổng kết</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Thu của khách:</span>
                      <span className="font-medium text-green-600">+{formatMoney(selectedJob.customerPayment || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Chi phí:</span>
                      <span className="font-medium text-red-600">-{formatMoney(totalExpenses)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t">
                      <span className="font-bold">Còn lại:</span>
                      <span className={`font-bold text-lg ${netProfit >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                        {formatMoney(netProfit)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Change Status - chỉ hiện khi không đang edit */}
          {!isEditing && (
            <div className="border-t pt-4">
              <h3 className="font-bold mb-3">🔄 Thay đổi trạng thái</h3>

              {isLocked ? (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-gray-600">
                    <span className="text-xl">🔒</span>
                    <span className="font-medium">Trạng thái đã khóa - Không thể thay đổi</span>
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    Công việc đã {selectedJob.status === 'Hoàn thành' ? 'hoàn thành' : 'bị hủy'} và không thể thay đổi trạng thái.
                  </div>
                </div>
              ) : (
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={() => updateJobStatus('Chờ XN')}
                    className="px-4 py-2 bg-yellow-100 text-yellow-800 rounded-lg hover:bg-yellow-200 font-medium"
                  >
                    Chờ XN
                  </button>
                  <button
                    onClick={() => updateJobStatus('Đang làm')}
                    className="px-4 py-2 bg-blue-100 text-blue-800 rounded-lg hover:bg-blue-200 font-medium"
                  >
                    Đang làm
                  </button>
                  <button
                    onClick={() => updateJobStatus('Hoàn thành')}
                    className="px-4 py-2 bg-green-100 text-green-800 rounded-lg hover:bg-green-200 font-medium"
                  >
                    Hoàn thành
                  </button>
                  <button
                    onClick={() => updateJobStatus('Hủy')}
                    className="px-4 py-2 bg-gray-100 text-gray-800 rounded-lg hover:bg-gray-200 font-medium"
                  >
                    Hủy
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer - Sticky ở dưới cho mobile */}
        <div className="p-4 md:p-6 border-t bg-gray-50 flex-shrink-0 sticky bottom-0">
          <div className="flex gap-2 md:gap-3 justify-between">
            <div className="flex gap-2">
              {/* Nút Xóa - chỉ hiện khi chưa hoàn thành/hủy và là admin hoặc người tạo */}
              {canDelete && !isEditing && (
                <button
                  onClick={() => {
                    if (window.confirm('⚠️ Xóa công việc này?\n\nHành động không thể hoàn tác!')) {
                      deleteTechnicalJob(selectedJob.id);
                    }
                  }}
                  className="px-3 md:px-4 py-2 md:py-3 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg font-medium text-sm md:text-base"
                >
                  🗑️
                </button>
              )}
            </div>
            <div className="flex gap-2 md:gap-3">
              <button
                onClick={() => {
                  if (isEditing) cancelEdit();
                  setShowJobModal(false);
                }}
                className="px-4 md:px-6 py-2 md:py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium text-sm md:text-base"
              >
                Đóng
              </button>
              {/* Nút Sửa - chỉ hiện khi chưa hoàn thành/hủy và là admin hoặc người tạo */}
              {canEdit && !isEditing && (
                <button
                  onClick={openEditMode}
                  className="px-4 md:px-6 py-2 md:py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium text-sm md:text-base"
                >
                  ✏️ Sửa
                </button>
              )}
              {isEditing && (
                <button
                  onClick={saveEditJob}
                  className="px-6 md:px-8 py-2 md:py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-base md:text-lg"
                >
                  💾 LƯU
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Thông báo khóa */}
        {isLocked && (
          <div className="px-4 md:px-6 pb-4">
            <div className="bg-gray-100 border border-gray-300 rounded-lg p-3 text-center text-sm text-gray-600">
              🔒 Công việc đã {selectedJob.status === 'Hoàn thành' ? 'hoàn thành' : 'hủy'} - Không thể sửa hoặc xóa
            </div>
          </div>
        )}
      </div>

      {/* Reassign Technicians Modal */}
      {showReassignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full">
            <div className="p-6 border-b bg-gradient-to-r from-orange-500 to-red-600 text-white">
              <h2 className="text-2xl font-bold">👥 Thay Đổi Kỹ Thuật Viên</h2>
              <p className="text-sm mt-1 opacity-90">{selectedJob.title}</p>
            </div>

            <div className="p-6 space-y-3">
              <p className="text-sm text-gray-600 mb-3">
                Chọn kỹ thuật viên mới cho công việc này:
              </p>

              <div className="border rounded-lg p-3 space-y-2 max-h-60 overflow-y-auto">
                {getTechnicalUsers().map(user => (
                  <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                    <input
                      type="checkbox"
                      checked={newTechnicians.includes(user.name)}
                      onChange={() => toggleTechnician(user.name)}
                      className="w-4 h-4 text-orange-600"
                    />
                    <span className="text-sm">{user.name} - {user.team}</span>
                  </label>
                ))}
              </div>

              {newTechnicians.length === 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-sm text-yellow-700">
                  ⚠️ Vui lòng chọn ít nhất 1 kỹ thuật viên
                </div>
              )}
            </div>

            <div className="p-6 border-t bg-gray-50 flex gap-3">
              <button
                onClick={() => setShowReassignModal(false)}
                className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium"
              >
                Hủy
              </button>
              <button
                onClick={() => {
                  if (newTechnicians.length === 0) {
                    alert('⚠️ Vui lòng chọn ít nhất 1 kỹ thuật viên!');
                    return;
                  }
                  updateJobTechnicians(newTechnicians);
                }}
                className="flex-1 px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium"
              >
                ✅ Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default JobDetailModal;
