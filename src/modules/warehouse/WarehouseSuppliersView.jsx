import { useState, useMemo } from 'react';
import { supabase } from '../../supabaseClient';
import { getNowISOVN } from '../../utils/dateUtils';
import { logActivity } from '../../lib/activityLog';

const formatMoney = (amount) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);

export default function WarehouseSuppliersView({
  suppliers,
  products,
  stockTransactions,
  loadWarehouseData,
  tenant,
  currentUser,
  warehouses,
  hasPermission,
  canEdit
}) {
  // --- State ---
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formContactPerson, setFormContactPerson] = useState('');
  const [formTaxCode, setFormTaxCode] = useState('');
  const [formBankAccount, setFormBankAccount] = useState('');
  const [formBankName, setFormBankName] = useState('');
  const [formNote, setFormNote] = useState('');

  // --- Derived data ---
  const activeSuppliers = useMemo(
    () => (suppliers || []).filter((s) => s.is_active !== false),
    [suppliers]
  );

  const filteredSuppliers = useMemo(() => {
    if (!searchTerm.trim()) return activeSuppliers;
    const term = searchTerm.toLowerCase().trim();
    return activeSuppliers.filter(
      (s) =>
        (s.name || '').toLowerCase().includes(term) ||
        (s.phone || '').toLowerCase().includes(term) ||
        (s.contact_person || '').toLowerCase().includes(term)
    );
  }, [activeSuppliers, searchTerm]);

  // Import stats per supplier
  const supplierImportStats = useMemo(() => {
    const stats = {};
    (stockTransactions || []).forEach((tx) => {
      if (tx.type === 'import' && tx.supplier_id) {
        if (!stats[tx.supplier_id]) {
          stats[tx.supplier_id] = { count: 0, totalAmount: 0 };
        }
        stats[tx.supplier_id].count += 1;
        stats[tx.supplier_id].totalAmount += Number(tx.total_amount || 0);
      }
    });
    return stats;
  }, [stockTransactions]);

  // Overall stats
  const totalSuppliers = activeSuppliers.length;
  const totalImportValue = useMemo(() => {
    return Object.values(supplierImportStats).reduce((sum, s) => sum + s.totalAmount, 0);
  }, [supplierImportStats]);
  const suppliersWithImports = useMemo(() => {
    return Object.keys(supplierImportStats).length;
  }, [supplierImportStats]);

  // Import history for selected supplier
  const selectedSupplierHistory = useMemo(() => {
    if (!selectedSupplier) return [];
    return (stockTransactions || [])
      .filter((tx) => tx.type === 'import' && tx.supplier_id === selectedSupplier.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [selectedSupplier, stockTransactions]);

  // --- View guard ---
  if (!hasPermission('warehouse', 2)) {
    return (
      <div className="p-8 text-center">
        <div className="text-6xl mb-4">🔒</div>
        <p className="text-gray-500">Bạn không có quyền xem nhà cung cấp</p>
      </div>
    );
  }

  // --- Helpers ---
  const resetForm = () => {
    setFormName('');
    setFormPhone('');
    setFormEmail('');
    setFormAddress('');
    setFormContactPerson('');
    setFormTaxCode('');
    setFormBankAccount('');
    setFormBankName('');
    setFormNote('');
  };

  const populateForm = (supplier) => {
    setFormName(supplier.name || '');
    setFormPhone(supplier.phone || '');
    setFormEmail(supplier.email || '');
    setFormAddress(supplier.address || '');
    setFormContactPerson(supplier.contact_person || '');
    setFormTaxCode(supplier.tax_code || '');
    setFormBankAccount(supplier.bank_account || '');
    setFormBankName(supplier.bank_name || '');
    setFormNote(supplier.note || '');
  };

  const getProductName = (productId) => {
    const p = (products || []).find((pr) => pr.id === productId);
    return p ? p.name : productId;
  };

  const getWarehouseName = (warehouseId) => {
    const w = (warehouses || []).find((wh) => wh.id === warehouseId);
    return w ? w.name : '';
  };

  // --- CRUD ---
  const handleCreate = async () => {
    if (!hasPermission('warehouse', 2)) { alert('Bạn không có quyền thêm nhà cung cấp'); return; }
    if (!formName.trim()) {
      alert('Vui lòng nhập tên nhà cung cấp');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('suppliers').insert({
        tenant_id: tenant.id,
        name: formName.trim(),
        phone: formPhone.trim() || null,
        email: formEmail.trim() || null,
        address: formAddress.trim() || null,
        contact_person: formContactPerson.trim() || null,
        tax_code: formTaxCode.trim() || null,
        bank_account: formBankAccount.trim() || null,
        bank_name: formBankName.trim() || null,
        note: formNote.trim() || null,
        is_active: true,
        created_at: getNowISOVN(),
        created_by: currentUser?.name
      });
      if (error) throw error;
      logActivity({ tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name, module: 'warehouse', action: 'create', entityType: 'supplier', entityName: formName.trim(), description: 'Thêm nhà cung cấp: ' + formName.trim() });
      await loadWarehouseData();
      setShowCreateModal(false);
      resetForm();
    } catch (err) {
      console.error('Lỗi tạo NCC:', err);
      alert('Lỗi tạo nhà cung cấp: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!canEdit('warehouse')) { alert('Bạn không có quyền chỉnh sửa nhà cung cấp'); return; }
    if (!selectedSupplier || !formName.trim()) {
      alert('Vui lòng nhập tên nhà cung cấp');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('suppliers')
        .update({
          name: formName.trim(),
          phone: formPhone.trim() || null,
          email: formEmail.trim() || null,
          address: formAddress.trim() || null,
          contact_person: formContactPerson.trim() || null,
          tax_code: formTaxCode.trim() || null,
          bank_account: formBankAccount.trim() || null,
          bank_name: formBankName.trim() || null,
          note: formNote.trim() || null,
          updated_at: getNowISOVN()
        })
        .eq('id', selectedSupplier.id);
      if (error) throw error;
      logActivity({ tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name, module: 'warehouse', action: 'update', entityType: 'supplier', entityId: selectedSupplier.id, entityName: formName.trim(), oldData: { name: selectedSupplier.name, phone: selectedSupplier.phone }, newData: { name: formName.trim(), phone: formPhone.trim() }, description: 'Cập nhật nhà cung cấp: ' + formName.trim() });
      await loadWarehouseData();
      setIsEditing(false);
      // Refresh selected supplier data
      const updated = {
        ...selectedSupplier,
        name: formName.trim(),
        phone: formPhone.trim() || null,
        email: formEmail.trim() || null,
        address: formAddress.trim() || null,
        contact_person: formContactPerson.trim() || null,
        tax_code: formTaxCode.trim() || null,
        bank_account: formBankAccount.trim() || null,
        bank_name: formBankName.trim() || null,
        note: formNote.trim() || null
      };
      setSelectedSupplier(updated);
    } catch (err) {
      console.error('Lỗi cập nhật NCC:', err);
      alert('Lỗi cập nhật nhà cung cấp: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (supplier) => {
    if (!canEdit('warehouse')) { alert('Bạn không có quyền xóa nhà cung cấp'); return; }
    if (!confirm(`Bạn có chắc muốn xoá nhà cung cấp "${supplier.name}"?`)) return;
    try {
      const { error } = await supabase
        .from('suppliers')
        .update({ is_active: false, updated_at: getNowISOVN() })
        .eq('id', supplier.id);
      if (error) throw error;
      logActivity({ tenantId: tenant.id, userId: currentUser?.id, userName: currentUser?.name, module: 'warehouse', action: 'delete', entityType: 'supplier', entityId: supplier.id, entityName: supplier.name, description: 'Xóa nhà cung cấp: ' + supplier.name });
      await loadWarehouseData();
      if (selectedSupplier?.id === supplier.id) {
        setShowDetailModal(false);
        setSelectedSupplier(null);
      }
    } catch (err) {
      console.error('Lỗi xoá NCC:', err);
      alert('Lỗi xoá nhà cung cấp: ' + err.message);
    }
  };

  const openCreate = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openDetail = (supplier) => {
    setSelectedSupplier(supplier);
    populateForm(supplier);
    setIsEditing(false);
    setShowDetailModal(true);
  };

  const startEditing = () => {
    populateForm(selectedSupplier);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    populateForm(selectedSupplier);
    setIsEditing(false);
  };

  // --- Render ---
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Nhà cung cấp</h2>
          <p className="text-sm text-gray-500 mt-1">Quản lý danh sách nhà cung cấp hàng hoá</p>
        </div>
        {hasPermission('warehouse', 2) && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-xl font-medium shadow-sm transition-colors text-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Thêm NCC
          </button>
        )}
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500">Tổng NCC</p>
              <p className="text-xl font-bold text-gray-800">{totalSuppliers}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500">Tổng giá trị nhập</p>
              <p className="text-xl font-bold text-gray-800">{formatMoney(totalImportValue)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500">NCC có giao dịch</p>
              <p className="text-xl font-bold text-gray-800">{suppliersWithImports}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Tìm theo tên, SĐT, người liên hệ..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Supplier list */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Desktop table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Tên NCC</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">SĐT</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-600">Người liên hệ</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Số lần nhập</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-600">Tổng giá trị</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-600">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-gray-400">
                    {searchTerm ? 'Không tìm thấy nhà cung cấp phù hợp' : 'Chưa có nhà cung cấp nào'}
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((supplier) => {
                  const stats = supplierImportStats[supplier.id] || { count: 0, totalAmount: 0 };
                  return (
                    <tr
                      key={supplier.id}
                      onClick={() => openDetail(supplier)}
                      className="border-b border-gray-50 hover:bg-green-50/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-800">{supplier.name}</div>
                        {supplier.address && (
                          <div className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">
                            {supplier.address}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{supplier.phone || '—'}</td>
                      <td className="px-4 py-3 text-gray-600">{supplier.contact_person || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          {stats.count}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-gray-800">
                        {formatMoney(stats.totalAmount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {canEdit('warehouse') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(supplier);
                            }}
                            className="text-red-500 hover:text-red-700 transition-colors p-1"
                            title="Xoá nhà cung cấp"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="sm:hidden divide-y divide-gray-100">
          {filteredSuppliers.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">
              {searchTerm ? 'Không tìm thấy nhà cung cấp phù hợp' : 'Chưa có nhà cung cấp nào'}
            </div>
          ) : (
            filteredSuppliers.map((supplier) => {
              const stats = supplierImportStats[supplier.id] || { count: 0, totalAmount: 0 };
              return (
                <div
                  key={supplier.id}
                  onClick={() => openDetail(supplier)}
                  className="p-4 hover:bg-green-50/50 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-800 truncate">{supplier.name}</p>
                      {supplier.phone && (
                        <p className="text-sm text-gray-500 mt-0.5">{supplier.phone}</p>
                      )}
                      {supplier.contact_person && (
                        <p className="text-xs text-gray-400 mt-0.5">LH: {supplier.contact_person}</p>
                      )}
                    </div>
                    <div className="text-right ml-3 shrink-0">
                      <p className="text-sm font-medium text-gray-800">{formatMoney(stats.totalAmount)}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{stats.count} lần nhập</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ============ CREATE MODAL ============ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">Thêm nhà cung cấp</h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tên NCC <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Nhập tên nhà cung cấp"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              {/* Phone + Contact person */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại</label>
                  <input
                    type="text"
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                    placeholder="0xxx xxx xxx"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Người liên hệ</label>
                  <input
                    type="text"
                    value={formContactPerson}
                    onChange={(e) => setFormContactPerson(e.target.value)}
                    placeholder="Tên người LH"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              {/* Address */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ</label>
                <input
                  type="text"
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                  placeholder="Địa chỉ nhà cung cấp"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              {/* Tax code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mã số thuế</label>
                <input
                  type="text"
                  value={formTaxCode}
                  onChange={(e) => setFormTaxCode(e.target.value)}
                  placeholder="Mã số thuế"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              {/* Bank info */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Số tài khoản</label>
                  <input
                    type="text"
                    value={formBankAccount}
                    onChange={(e) => setFormBankAccount(e.target.value)}
                    placeholder="Số TK ngân hàng"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng</label>
                  <input
                    type="text"
                    value={formBankName}
                    onChange={(e) => setFormBankName(e.target.value)}
                    placeholder="Tên ngân hàng"
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Note */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                <textarea
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder="Ghi chú thêm..."
                  rows={3}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-800 font-medium transition-colors"
              >
                Huỷ
              </button>
              <button
                onClick={handleCreate}
                disabled={saving}
                className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl shadow-sm transition-colors disabled:opacity-50"
              >
                {saving ? 'Đang lưu...' : 'Tạo NCC'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ DETAIL MODAL ============ */}
      {showDetailModal && selectedSupplier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">
                {isEditing ? 'Chỉnh sửa NCC' : 'Chi tiết nhà cung cấp'}
              </h3>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedSupplier(null);
                  setIsEditing(false);
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-5">
              {isEditing ? (
                /* Edit form */
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tên NCC <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại</label>
                      <input
                        type="text"
                        value={formPhone}
                        onChange={(e) => setFormPhone(e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Người liên hệ</label>
                      <input
                        type="text"
                        value={formContactPerson}
                        onChange={(e) => setFormContactPerson(e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ</label>
                    <input
                      type="text"
                      value={formAddress}
                      onChange={(e) => setFormAddress(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mã số thuế</label>
                    <input
                      type="text"
                      value={formTaxCode}
                      onChange={(e) => setFormTaxCode(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Số tài khoản</label>
                      <input
                        type="text"
                        value={formBankAccount}
                        onChange={(e) => setFormBankAccount(e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Ngân hàng</label>
                      <input
                        type="text"
                        value={formBankName}
                        onChange={(e) => setFormBankName(e.target.value)}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                    <textarea
                      value={formNote}
                      onChange={(e) => setFormNote(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                    />
                  </div>
                </div>
              ) : (
                /* Detail view */
                <div className="space-y-6">
                  {/* Supplier info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InfoRow label="Tên NCC" value={selectedSupplier.name} />
                    <InfoRow label="Số điện thoại" value={selectedSupplier.phone} />
                    <InfoRow label="Người liên hệ" value={selectedSupplier.contact_person} />
                    <InfoRow label="Email" value={selectedSupplier.email} />
                    <InfoRow label="Địa chỉ" value={selectedSupplier.address} className="sm:col-span-2" />
                    <InfoRow label="Mã số thuế" value={selectedSupplier.tax_code} />
                    <InfoRow
                      label="Ngân hàng"
                      value={
                        selectedSupplier.bank_account
                          ? `${selectedSupplier.bank_account}${selectedSupplier.bank_name ? ' - ' + selectedSupplier.bank_name : ''}`
                          : null
                      }
                    />
                    {selectedSupplier.note && (
                      <InfoRow label="Ghi chú" value={selectedSupplier.note} className="sm:col-span-2" />
                    )}
                  </div>

                  {/* Import history */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      Lịch sử nhập hàng ({selectedSupplierHistory.length})
                    </h4>

                    {selectedSupplierHistory.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 text-sm bg-gray-50 rounded-xl">
                        Chưa có phiếu nhập nào từ nhà cung cấp này
                      </div>
                    ) : (
                      <div className="border border-gray-100 rounded-xl overflow-hidden">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100">
                                <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Ngày</th>
                                <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Sản phẩm</th>
                                <th className="text-center px-3 py-2.5 font-semibold text-gray-600">SL</th>
                                <th className="text-right px-3 py-2.5 font-semibold text-gray-600">Đơn giá</th>
                                <th className="text-right px-3 py-2.5 font-semibold text-gray-600">Thành tiền</th>
                                <th className="text-left px-3 py-2.5 font-semibold text-gray-600">Kho</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedSupplierHistory.map((tx) => (
                                <tr key={tx.id} className="border-b border-gray-50">
                                  <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">
                                    {new Date(tx.created_at).toLocaleDateString('vi-VN')}
                                  </td>
                                  <td className="px-3 py-2.5 text-gray-800 font-medium">
                                    {getProductName(tx.product_id)}
                                  </td>
                                  <td className="px-3 py-2.5 text-center text-gray-600">{tx.quantity}</td>
                                  <td className="px-3 py-2.5 text-right text-gray-600">
                                    {formatMoney(tx.unit_price)}
                                  </td>
                                  <td className="px-3 py-2.5 text-right font-medium text-gray-800">
                                    {formatMoney(tx.total_amount)}
                                  </td>
                                  <td className="px-3 py-2.5 text-gray-500 text-xs">
                                    {getWarehouseName(tx.warehouse_id)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="bg-green-50 border-t border-green-100">
                                <td colSpan={4} className="px-3 py-2.5 text-right font-semibold text-green-700">
                                  Tổng cộng:
                                </td>
                                <td className="px-3 py-2.5 text-right font-bold text-green-700">
                                  {formatMoney(
                                    selectedSupplierHistory.reduce(
                                      (sum, tx) => sum + Number(tx.total_amount || 0),
                                      0
                                    )
                                  )}
                                </td>
                                <td></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between p-5 border-t border-gray-100">
              <div>
                {!isEditing && canEdit('warehouse') && (
                  <button
                    onClick={() => handleDelete(selectedSupplier)}
                    className="text-sm text-red-500 hover:text-red-700 font-medium transition-colors"
                  >
                    Xoá NCC
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3">
                {isEditing ? (
                  <>
                    <button
                      onClick={cancelEditing}
                      className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-800 font-medium transition-colors"
                    >
                      Huỷ
                    </button>
                    <button
                      onClick={handleUpdate}
                      disabled={saving}
                      className="px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl shadow-sm transition-colors disabled:opacity-50"
                    >
                      {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setShowDetailModal(false);
                        setSelectedSupplier(null);
                      }}
                      className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-800 font-medium transition-colors"
                    >
                      Đóng
                    </button>
                    {canEdit('warehouse') && (
                      <button
                        onClick={startEditing}
                        className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-xl shadow-sm transition-colors"
                      >
                        Chỉnh sửa
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* Small helper for detail info rows */
function InfoRow({ label, value, className = '' }) {
  return (
    <div className={className}>
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800 font-medium">{value || '—'}</p>
    </div>
  );
}
