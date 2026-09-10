import React, { useState, useMemo } from 'react';
import {
  X,
  Check,
  Plus,
  AlertCircle,
  Link2,
  DollarSign,
  Calendar,
  Building2,
  Truck,
  Tag,
  Sparkles,
  Layers,
  FileCheck,
} from 'lucide-react';
import { ShipmentFreightSummary, FreightShippingItem } from '../types';
import { ShipmentLevelUpdatePayload } from '../utils/freightCalculator';

interface FreightShipmentEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  shipment: ShipmentFreightSummary;
  allFreightItems: FreightShippingItem[];
  onSave: (payload: ShipmentLevelUpdatePayload) => void;
}

export const FreightShipmentEditModal: React.FC<FreightShipmentEditModalProps> = ({
  isOpen,
  onClose,
  shipment,
  allFreightItems,
  onSave,
}) => {
  const [unitPrice, setUnitPrice] = useState<number>(shipment.unitPrice || 0);
  const [channel, setChannel] = useState<string>(shipment.channel || '美森限时达');
  const [warehouse, setWarehouse] = useState<string>(shipment.warehouse || '');
  const [shipDate, setShipDate] = useState<string>(shipment.shipDate || '');
  const [customsDeclarationType, setCustomsDeclarationType] = useState<'STANDALONE' | 'MERGED' | 'EXEMPT'>(
    shipment.customsDeclarationType === 'EXEMPT'
      ? 'EXEMPT'
      : shipment.customsDeclarationType === 'STANDALONE'
      ? 'STANDALONE'
      : shipment.customsDeclarationType === 'MERGED' || shipment.isMergedCustoms === true
      ? 'MERGED'
      : 'STANDALONE'
  );
  const [mergedCustomsShipmentIds, setMergedCustomsShipmentIds] = useState<string[]>(
    shipment.mergedCustomsShipmentIds || []
  );
  const [manualInputId, setManualInputId] = useState<string>('');
  const [extraCategoriesCount, setExtraCategoriesCount] = useState<number>(
    shipment.extraCategoriesCount || 0
  );
  const [extraCategoryUnitPrice, setExtraCategoryUnitPrice] = useState<number>(
    shipment.extraCategoryUnitPrice || 30
  );

  // 同期候选货件 (同一发货日期、同渠道、排除自身)
  const peerCandidates = useMemo(() => {
    const currentId = shipment.shipmentId.toUpperCase();
    const set = new Set<string>();
    allFreightItems.forEach((it) => {
      const itId = it.shipmentId.toUpperCase();
      if (itId !== currentId && it.shipDate === shipDate) {
        set.add(itId);
      }
    });
    return Array.from(set);
  }, [allFreightItems, shipment.shipmentId, shipDate]);

  if (!isOpen) return null;

  // 添加手动关联货件
  const handleAddManualId = () => {
    if (!manualInputId.trim()) return;
    const parts = manualInputId
      .split(/[,，\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    const currentSet = new Set(mergedCustomsShipmentIds.map((id) => id.toUpperCase()));
    currentSet.delete(shipment.shipmentId.toUpperCase());
    parts.forEach((p) => {
      if (p !== shipment.shipmentId.toUpperCase()) {
        currentSet.add(p);
      }
    });

    setMergedCustomsShipmentIds(Array.from(currentSet));
    setManualInputId('');
  };

  // 移除某个关联
  const handleRemoveMergedId = (idToRemove: string) => {
    setMergedCustomsShipmentIds((prev) =>
      prev.filter((id) => id.toUpperCase() !== idToRemove.toUpperCase())
    );
  };

  // 一键关联所有候选
  const handleAddAllCandidates = () => {
    const currentSet = new Set(mergedCustomsShipmentIds.map((id) => id.toUpperCase()));
    peerCandidates.forEach((c) => currentSet.add(c));
    currentSet.delete(shipment.shipmentId.toUpperCase());
    setMergedCustomsShipmentIds(Array.from(currentSet));
  };

  const calculatedExtraFee = Math.max(0, extraCategoriesCount) * Math.max(0, extraCategoryUnitPrice);
  const isMerged = customsDeclarationType === 'MERGED';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      shipmentId: shipment.shipmentId,
      unitPrice: Number(unitPrice) || 0,
      channel: channel.trim() || '快船',
      warehouse: warehouse.trim().toUpperCase(),
      shipDate,
      customsDeclarationType,
      mergedCustomsShipmentIds: isMerged ? mergedCustomsShipmentIds : [],
      extraCategoriesCount: Math.max(0, Number(extraCategoriesCount) || 0),
      extraCategoryUnitPrice: Math.max(0, Number(extraCategoryUnitPrice) || 30),
    });
    onClose();
  };

  return (
    <div
      id="freight-shipment-edit-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold tracking-tight">编辑货件物流与报关配置</h3>
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-800 text-blue-300 font-bold border border-slate-700">
                  {shipment.shipmentId}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                此配置针对整个货件适用，修改后将自动同步至该货件下所有商品（共 {shipment.items.length} 项）
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Section 1: 物流基础与单价 (针对整个货件) */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
              <DollarSign className="w-4 h-4 text-blue-600" />
              <span>货件物流通用属性 (整票固定)</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* 物流单价 (关键要求) */}
              <div className="col-span-1 sm:col-span-2 bg-blue-50/60 p-3 rounded-lg border border-blue-200">
                <label className="block text-xs font-bold text-blue-950 mb-1 flex items-center justify-between">
                  <span>整票物流单价 (元/kg) *</span>
                  <span className="text-[11px] font-normal text-blue-600">针对整个货件统一适用</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-blue-600">¥</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
                    placeholder="例如 13.50"
                    className="w-full pl-8 pr-3 py-2 text-sm font-mono font-bold bg-white border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden text-slate-900"
                  />
                </div>
                <p className="text-[11px] text-blue-700 mt-1">
                  修改后将同步更新本货件全部 {shipment.items.length} 个商品条目的计费重运费
                </p>
              </div>

              {/* 物流渠道 */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">物流渠道 *</label>
                <input
                  type="text"
                  required
                  list="channel-options"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                  placeholder="如 美森限时达"
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                />
                <datalist id="channel-options">
                  <option value="美森限时达" />
                  <option value="美森正班" />
                  <option value="以星快船" />
                  <option value="普船超大件" />
                  <option value="空运普货" />
                  <option value="空运带电" />
                  <option value="中欧班列" />
                </datalist>
              </div>

              {/* 目的仓代码 */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">目的仓 (FC) *</label>
                <div className="relative">
                  <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={warehouse}
                    onChange={(e) => setWarehouse(e.target.value.toUpperCase())}
                    placeholder="如 PHX1"
                    className="w-full pl-8 pr-3 py-2 text-xs font-mono font-semibold uppercase border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* 出货/发货日期 */}
              <div className="col-span-1 sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">发货/出货日期 *</label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="date"
                    required
                    value={shipDate}
                    onChange={(e) => setShipDate(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: 报关方式与同批拼单关联 */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 uppercase tracking-wider">
                <FileCheck className="w-4 h-4 text-emerald-600" />
                <span>报关申报方式 (整票适用)</span>
              </div>
              <span className="text-[11px] text-slate-500">
                {customsDeclarationType === 'MERGED'
                  ? '拼单共享 ¥175 报关费'
                  : customsDeclarationType === 'STANDALONE'
                  ? '单票独立收取 ¥350'
                  : '免除报关费 ¥0'}
              </span>
            </div>

            {/* 三选一单选框 */}
            <div className="grid grid-cols-3 gap-2.5">
              <label
                className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${
                  customsDeclarationType === 'MERGED'
                    ? 'bg-emerald-50/80 border-emerald-500 ring-2 ring-emerald-500/20 text-emerald-950 font-bold'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">合并报关 / 拼单</span>
                  <input
                    type="radio"
                    name="customsDecl"
                    value="MERGED"
                    checked={customsDeclarationType === 'MERGED'}
                    onChange={() => setCustomsDeclarationType('MERGED')}
                    className="text-emerald-600"
                  />
                </div>
                <span className="text-[11px] mt-1 text-emerald-700 font-normal">
                  ¥175 / 批 (关联拼单共享)
                </span>
              </label>

              <label
                className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${
                  customsDeclarationType === 'STANDALONE'
                    ? 'bg-amber-50/80 border-amber-500 ring-2 ring-amber-500/20 text-amber-950 font-bold'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">独立报关</span>
                  <input
                    type="radio"
                    name="customsDecl"
                    value="STANDALONE"
                    checked={customsDeclarationType === 'STANDALONE'}
                    onChange={() => setCustomsDeclarationType('STANDALONE')}
                    className="text-amber-600"
                  />
                </div>
                <span className="text-[11px] mt-1 text-amber-700 font-normal">
                  ¥350 / 票 (单票申报)
                </span>
              </label>

              <label
                className={`flex flex-col p-3 rounded-xl border cursor-pointer transition-all ${
                  customsDeclarationType === 'EXEMPT'
                    ? 'bg-slate-200/80 border-slate-500 ring-2 ring-slate-500/20 text-slate-950 font-bold'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">免报关</span>
                  <input
                    type="radio"
                    name="customsDecl"
                    value="EXEMPT"
                    checked={customsDeclarationType === 'EXEMPT'}
                    onChange={() => setCustomsDeclarationType('EXEMPT')}
                    className="text-slate-600"
                  />
                </div>
                <span className="text-[11px] mt-1 text-slate-600 font-normal">
                  ¥0 / 票 (免报关服务)
                </span>
              </label>
            </div>

            {/* 拼单关联货件设置 (仅合并报关时显示) */}
            {isMerged && (
              <div className="mt-3 p-3 bg-white rounded-lg border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>同批拼单关联货件 ({mergedCustomsShipmentIds.length} 票关联)</span>
                  </label>
                  {peerCandidates.length > 0 && (
                    <button
                      type="button"
                      onClick={handleAddAllCandidates}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" />
                      批量添加候选货件 ({peerCandidates.length})
                    </button>
                  )}
                </div>

                {/* 当前已关联货件标签卡片 */}
                {mergedCustomsShipmentIds.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {mergedCustomsShipmentIds.map((id) => (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300"
                      >
                        <Link2 className="w-3 h-3 text-emerald-600" />
                        {id}
                        <button
                          type="button"
                          onClick={() => handleRemoveMergedId(id)}
                          className="text-emerald-500 hover:text-emerald-900 rounded"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400 italic">
                    暂未关联其他货件。不是所有同天同渠道货件都关联，若与其他货件同批拼单（共享报关费与超品费），请在此手动添加关联货件。系统绝不强制自动关联。
                  </p>
                )}

                {/* 手动输入关联货件 */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={manualInputId}
                    onChange={(e) => setManualInputId(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddManualId();
                      }
                    }}
                    placeholder="输入要关联的货件单号 (支持逗号分隔多单)"
                    className="flex-1 px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={handleAddManualId}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium rounded-lg flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    添加关联
                  </button>
                </div>

                {/* 候选快捷点击 */}
                {peerCandidates.length > 0 && (
                  <div className="pt-1">
                    <div className="text-[11px] text-slate-500 mb-1">同发货日候选货件 (点击加入拼单)：</div>
                    <div className="flex flex-wrap gap-1">
                      {peerCandidates.map((candId) => {
                        const isAdded = mergedCustomsShipmentIds
                          .map((id) => id.toUpperCase())
                          .includes(candId.toUpperCase());
                        return (
                          <button
                            key={candId}
                            type="button"
                            onClick={() => {
                              if (isAdded) handleRemoveMergedId(candId);
                              else setMergedCustomsShipmentIds((prev) => [...prev, candId]);
                            }}
                            className={`px-2 py-0.5 rounded text-[11px] font-mono border transition-colors ${
                              isAdded
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-400 font-bold'
                                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            {isAdded ? `✓ ${candId}` : `+ ${candId}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 3: 超品申报情况 (整票收取 & 拼单批次合并收取) */}
          <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 uppercase tracking-wider">
                <Tag className="w-4 h-4 text-amber-700" />
                <span>超品申报配置 (整票/拼单合并收取)</span>
              </div>
              <span className="font-mono text-xs font-bold text-amber-900">
                超品费: ¥{calculatedExtraFee.toFixed(2)}
              </span>
            </div>

            <div className="p-2.5 bg-white/80 rounded-lg border border-amber-200/80 text-[11px] text-amber-800 leading-relaxed">
              <strong>重要规则提示：</strong>
              报关品类超出基础限制时产生超品费。
              <strong>如果有货件互为关联拼单，整批拼单共用报关单，超品费对这几票关联货件统一收取一次</strong>
              ，不会按单票重复扣收。
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-amber-950 mb-1">
                  超出品类数量 (个)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={extraCategoriesCount}
                  onChange={(e) => setExtraCategoriesCount(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="0 (无超品)"
                  className="w-full px-3 py-2 text-xs font-mono font-bold bg-white border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                />
                <p className="text-[10px] text-amber-700 mt-1">如整票超过5个品类，超出的品类总个数</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-amber-950 mb-1">
                  超品单价 (元/个)
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-700">
                    ¥
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={extraCategoryUnitPrice}
                    onChange={(e) => setExtraCategoryUnitPrice(Math.max(0, parseFloat(e.target.value) || 0))}
                    placeholder="默认 30"
                    className="w-full pl-7 pr-3 py-2 text-xs font-mono font-bold bg-white border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                  />
                </div>
                <p className="text-[10px] text-amber-700 mt-1">默认超品费单价 ¥30 或 ¥50/品类</p>
              </div>
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            涵盖 <span className="font-mono font-bold text-slate-700">{shipment.items.length}</span> 个商品条目
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <Check className="w-4 h-4" />
              保存并针对整个货件生效
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
