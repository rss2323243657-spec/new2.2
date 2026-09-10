import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  X,
  Boxes,
  FileSpreadsheet,
  ArrowRight,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { FreightShippingItem } from '../types';

export type DuplicateResolutionStrategy = 'overwrite' | 'skip' | 'append';

interface DuplicateConflictItem {
  shipmentId: string;
  sku: string;
  existingItem?: FreightShippingItem;
  incomingItem: FreightShippingItem;
}

interface FreightDuplicateModalProps {
  isOpen: boolean;
  onClose: () => void;
  incomingItems: FreightShippingItem[];
  existingItems: FreightShippingItem[];
  actualsToMerge?: Record<string, any>;
  onConfirm: (
    strategy: DuplicateResolutionStrategy,
    incomingItems: FreightShippingItem[],
    actualsToMerge?: Record<string, any>
  ) => void;
}

export const FreightDuplicateModal: React.FC<FreightDuplicateModalProps> = ({
  isOpen,
  onClose,
  incomingItems,
  existingItems,
  actualsToMerge,
  onConfirm,
}) => {
  const [strategy, setStrategy] = useState<DuplicateResolutionStrategy>('overwrite');
  const [showDetails, setShowDetails] = useState<boolean>(false);

  if (!isOpen) return null;

  // Identify duplicate conflicts (matching shipmentId + sku)
  const existingMap = new Map<string, FreightShippingItem>();
  existingItems.forEach((it) => {
    existingMap.set(`${it.shipmentId.toUpperCase()}_${it.sku.toUpperCase()}`, it);
  });

  const conflicts: DuplicateConflictItem[] = [];
  const brandNewItems: FreightShippingItem[] = [];

  incomingItems.forEach((incoming) => {
    const key = `${incoming.shipmentId.toUpperCase()}_${incoming.sku.toUpperCase()}`;
    const existing = existingMap.get(key);
    if (existing) {
      conflicts.push({
        shipmentId: incoming.shipmentId,
        sku: incoming.sku,
        existingItem: existing,
        incomingItem: incoming,
      });
    } else {
      brandNewItems.push(incoming);
    }
  });

  // Unique conflict shipment IDs
  const conflictShipmentIds = Array.from(
    new Set(conflicts.map((c) => c.shipmentId))
  );

  const handleExecute = () => {
    onConfirm(strategy, incomingItems, actualsToMerge);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                头程数据重复上传提示与处理
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                检测到本次上传表格中包含已存在于系统中的货件与出货记录
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-white/60 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* Summary Box */}
          <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
              <ShieldAlert className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>
                本次上传共解析 <strong>{incomingItems.length}</strong> 条明细，其中发现{' '}
                <strong className="text-amber-700">{conflicts.length}</strong> 条记录重复（涉及{' '}
                <strong>{conflictShipmentIds.length}</strong> 票货件）
              </span>
            </div>
            <div className="text-[11px] text-amber-800 leading-relaxed">
              涉及货件编号：
              <span className="font-mono font-medium ml-1">
                {conflictShipmentIds.slice(0, 6).join(', ')}
                {conflictShipmentIds.length > 6 ? ` 等 ${conflictShipmentIds.length} 票` : ''}
              </span>
            </div>
          </div>

          {/* Strategy Selection Choices */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-900 block">
              请选择重复数据的处理方式：
            </label>

            <div className="space-y-2.5">
              {/* Option 1: Overwrite */}
              <label
                onClick={() => setStrategy('overwrite')}
                className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  strategy === 'overwrite'
                    ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-500/20'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="freightDuplicateStrategy"
                  checked={strategy === 'overwrite'}
                  onChange={() => setStrategy('overwrite')}
                  className="mt-0.5 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <div className="font-bold text-slate-900 flex items-center gap-2">
                    <span>覆盖原数据 (Overwrite Existing)</span>
                    <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded text-[10px] font-semibold">
                      推荐
                    </span>
                  </div>
                  <p className="text-slate-500 text-[11px] mt-0.5 leading-relaxed">
                    使用本次上传表格中的单箱实重、箱数、箱规、运费单价和发货时间覆盖原有的同名货件/SKU记录，更新计算运费。
                  </p>
                </div>
              </label>

              {/* Option 2: Skip */}
              <label
                onClick={() => setStrategy('skip')}
                className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  strategy === 'skip'
                    ? 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-500/20'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="freightDuplicateStrategy"
                  checked={strategy === 'skip'}
                  onChange={() => setStrategy('skip')}
                  className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                />
                <div className="flex-1">
                  <div className="font-bold text-slate-900">
                    跳过重复数据，仅新增全新货件 (Skip Duplicates)
                  </div>
                  <p className="text-slate-500 text-[11px] mt-0.5 leading-relaxed">
                    保留系统中已有的 {conflicts.length} 条记录不作修改，仅把本次上传中全新未录入的{' '}
                    {brandNewItems.length} 条明细写入系统。
                  </p>
                </div>
              </label>

              {/* Option 3: Append */}
              <label
                onClick={() => setStrategy('append')}
                className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                  strategy === 'append'
                    ? 'bg-purple-50/80 border-purple-300 ring-2 ring-purple-500/20'
                    : 'bg-white border-slate-200 hover:bg-slate-50'
                }`}
              >
                <input
                  type="radio"
                  name="freightDuplicateStrategy"
                  checked={strategy === 'append'}
                  onChange={() => setStrategy('append')}
                  className="mt-0.5 text-purple-600 focus:ring-purple-500"
                />
                <div className="flex-1">
                  <div className="font-bold text-slate-900">
                    全部作为新行追加 (Append as New)
                  </div>
                  <p className="text-slate-500 text-[11px] mt-0.5 leading-relaxed">
                    不进行覆盖或去重，将本次上传的全部记录直接追加至头程列表（若为同批出货可能造成运费重复核算）。
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Toggle Conflict Details Table */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 flex items-center gap-1"
            >
              {showDetails ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" /> 收起冲突明细对比列表
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" /> 查看 {conflicts.length} 条重复数据明细对比
                </>
              )}
            </button>

            {showDetails && (
              <div className="mt-2.5 border border-slate-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                <table className="w-full text-[11px] text-left border-collapse">
                  <thead className="bg-slate-100 text-slate-700 sticky top-0 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2">货件编号</th>
                      <th className="p-2">商品 SKU</th>
                      <th className="p-2 text-right">现有箱数/实重</th>
                      <th className="p-2 text-right">上传新箱数/实重</th>
                      <th className="p-2 text-right">现有单价</th>
                      <th className="p-2 text-right">上传单价</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {conflicts.map((c, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="p-2 font-mono font-bold text-blue-600">
                          {c.shipmentId}
                        </td>
                        <td className="p-2 font-mono text-slate-800">{c.sku}</td>
                        <td className="p-2 text-right font-mono text-slate-600">
                          {c.existingItem?.boxCount}箱 / {c.existingItem?.boxWeight}kg
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-slate-900 bg-amber-50/50">
                          {c.incomingItem.boxCount}箱 / {c.incomingItem.boxWeight}kg
                        </td>
                        <td className="p-2 text-right font-mono text-slate-600">
                          ¥{c.existingItem?.unitPrice.toFixed(2)}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-slate-900 bg-amber-50/50">
                          ¥{c.incomingItem.unitPrice.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg shadow-xs transition-colors"
          >
            取消导入
          </button>

          <button
            type="button"
            onClick={handleExecute}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm flex items-center gap-1.5 transition-all"
          >
            <CheckCircle2 className="w-4 h-4" />
            确认按所选方式导入 ({incomingItems.length} 条)
          </button>
        </div>
      </div>
    </div>
  );
};
