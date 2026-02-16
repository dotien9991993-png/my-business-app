import React, { useState, useEffect } from 'react';
import { getProvinces, getDistricts, getWards } from '../../utils/viettelpostApi';

export default function AddressPicker({ token, value, onChange, disabled }) {
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [wards, setWards] = useState([]);
  const [loadingP, setLoadingP] = useState(false);
  const [loadingD, setLoadingD] = useState(false);
  const [loadingW, setLoadingW] = useState(false);

  // Load provinces on mount
  useEffect(() => {
    if (!token) return;
    setLoadingP(true);
    getProvinces(token).then(res => {
      if (res.success) setProvinces(res.data);
      setLoadingP(false);
    });
  }, [token]);

  // Load districts when province changes
  useEffect(() => {
    if (!token || !value?.province_id) { setDistricts([]); return; }
    setLoadingD(true);
    getDistricts(token, value.province_id).then(res => {
      if (res.success) setDistricts(res.data);
      setLoadingD(false);
    });
  }, [token, value?.province_id]);

  // Load wards when district changes
  useEffect(() => {
    if (!token || !value?.district_id) { setWards([]); return; }
    setLoadingW(true);
    getWards(token, value.district_id).then(res => {
      if (res.success) setWards(res.data);
      setLoadingW(false);
    });
  }, [token, value?.district_id]);

  const handleProvinceChange = (e) => {
    const id = Number(e.target.value);
    const prov = provinces.find(p => p.PROVINCE_ID === id);
    onChange({
      province_id: id, province_name: prov?.PROVINCE_NAME || '',
      district_id: null, district_name: '',
      ward_id: null, ward_name: ''
    });
  };

  const handleDistrictChange = (e) => {
    const id = Number(e.target.value);
    const dist = districts.find(d => d.DISTRICT_ID === id);
    onChange({
      ...value,
      district_id: id, district_name: dist?.DISTRICT_NAME || '',
      ward_id: null, ward_name: ''
    });
  };

  const handleWardChange = (e) => {
    const id = Number(e.target.value);
    const w = wards.find(w => w.WARDS_ID === id);
    onChange({
      ...value,
      ward_id: id, ward_name: w?.WARDS_NAME || ''
    });
  };

  const selectClass = "w-full border rounded-lg px-3 py-2 text-sm disabled:bg-gray-100";

  return (
    <div className="grid grid-cols-3 gap-2">
      <select
        value={value?.province_id || ''}
        onChange={handleProvinceChange}
        disabled={disabled || loadingP}
        className={selectClass}
      >
        <option value="">{loadingP ? 'Đang tải...' : 'Tỉnh/TP'}</option>
        {provinces.map(p => (
          <option key={p.PROVINCE_ID} value={p.PROVINCE_ID}>{p.PROVINCE_NAME}</option>
        ))}
      </select>

      <select
        value={value?.district_id || ''}
        onChange={handleDistrictChange}
        disabled={disabled || loadingD || !value?.province_id}
        className={selectClass}
      >
        <option value="">{loadingD ? 'Đang tải...' : 'Quận/Huyện'}</option>
        {districts.map(d => (
          <option key={d.DISTRICT_ID} value={d.DISTRICT_ID}>{d.DISTRICT_NAME}</option>
        ))}
      </select>

      <select
        value={value?.ward_id || ''}
        onChange={handleWardChange}
        disabled={disabled || loadingW || !value?.district_id}
        className={selectClass}
      >
        <option value="">{loadingW ? 'Đang tải...' : 'Phường/Xã'}</option>
        {wards.map(w => (
          <option key={w.WARDS_ID} value={w.WARDS_ID}>{w.WARDS_NAME}</option>
        ))}
      </select>
    </div>
  );
}
