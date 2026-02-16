import React, { useState, useMemo } from 'react';

function ReportCard({ report, onClick }) {
  return (
    <button onClick={onClick}
      className="bg-white border rounded-xl p-4 text-left hover:border-green-300 hover:shadow-md transition-all group">
      <div className="text-2xl mb-2">{report.icon}</div>
      <div className="text-sm font-medium text-gray-800 group-hover:text-green-700">{report.name}</div>
      {report.description && (
        <div className="text-xs text-gray-500 mt-1 line-clamp-2">{report.description}</div>
      )}
    </button>
  );
}

export default function ReportGrid({ reports, onSelect, title }) {
  const [search, setSearch] = useState('');
  const [activeGroup, setActiveGroup] = useState('Tất cả');

  const groups = useMemo(() => {
    const g = new Set();
    reports.forEach(r => { if (r.group) g.add(r.group); });
    return ['Tất cả', ...g];
  }, [reports]);

  const popular = useMemo(() => reports.filter(r => r.popular), [reports]);

  const filtered = useMemo(() => {
    let result = reports;
    if (activeGroup !== 'Tất cả') {
      result = result.filter(r => r.group === activeGroup);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q)
      );
    }
    return result;
  }, [reports, activeGroup, search]);

  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6 space-y-5">
      <h2 className="text-xl md:text-2xl font-bold">{title}</h2>

      {/* Popular reports */}
      {popular.length > 0 && !search.trim() && activeGroup === 'Tất cả' && (
        <div>
          <h3 className="text-sm font-bold text-gray-500 mb-3">⭐ Báo cáo phổ biến nhất</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {popular.map(r => (
              <ReportCard key={r.id} report={r} onClick={() => onSelect(r.id)} />
            ))}
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="🔍 Tìm kiếm báo cáo..."
          className="w-full border rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        {search && (
          <button onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-sm">
            ✕
          </button>
        )}
      </div>

      {/* Group tabs + All reports */}
      <div>
        <h3 className="text-sm font-bold text-gray-500 mb-3">Tất cả báo cáo</h3>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {groups.map(g => (
            <button key={g} onClick={() => setActiveGroup(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeGroup === g ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}>
              {g}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map(r => (
            <ReportCard key={r.id} report={r} onClick={() => onSelect(r.id)} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center text-gray-400 py-8 text-sm">Không tìm thấy báo cáo</div>
        )}
      </div>
    </div>
  );
}
