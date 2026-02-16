import React from 'react';
import { ExportButton, PrintButton } from './reportUtils';

export default function ReportDetailWrapper({ report, onBack, onExport, children }) {
  return (
    <div className="p-4 md:p-6 pb-20 md:pb-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack}
            className="text-sm text-gray-500 hover:text-green-600 font-medium flex items-center gap-1">
            ← Quay lại
          </button>
          <h2 className="text-lg md:text-xl font-bold">
            {report?.icon} {report?.name}
          </h2>
        </div>
        <div className="flex gap-2">
          {onExport && <ExportButton onClick={onExport} />}
          <PrintButton />
        </div>
      </div>
      {children}
    </div>
  );
}

export function ComingSoon() {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-8 md:p-12 text-center">
      <div className="text-4xl mb-3">🚧</div>
      <div className="text-lg font-bold text-gray-700 mb-2">Đang phát triển</div>
      <div className="text-sm text-gray-500">Báo cáo này đang được xây dựng và sẽ sớm ra mắt.</div>
    </div>
  );
}
