import React from 'react';
import {
  X,
  Truck,
  Boxes,
  Calendar,
  AlertTriangle,
  FileCheck,
  Building2,
  Clock,
  ArrowRight,
  ShieldAlert,
  Info,
  CheckCircle2,
  ExternalLink,
  Tag,
  BellRing,
  Plus,
  Edit3,
  Link2,
  Shield,
  Layers,
} from 'lucide-react';
import { Shipment, CaseStatus } from '../types';
import { getCaseTimeDisplay } from '../utils/dateUtils';

interface ShipmentDetailDrawerProps {
  shipment: Shipment | null;
  allShipments?: Shipment[];
  onClose: () => void;
  onOpenCaseModal: (shipment: Shipment) => void;
  onOpenSkuDetail: (sku: string) => void;
  onOpenProductSupplement?: (shipment: Shipment) => void;
  onSelectShipment?: (shipmentId: string) => void;
  onEditShipment?: (shipment: Shipment) => void;
}

const DISCREPANCY_TAG_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  FC_SHORTAGE: { label: 'FC漏扫/少收', bg: 'bg-red-50', text: 'text-red-700' },
  DAMAGED_CARTON: { label: '外箱破损/丢件', bg: 'bg-amber-50', text: 'text-amber-700' },
  LABEL_ISSUE: { label: '标签/条码问题', bg: 'bg-orange-50', text: 'text-orange-700' },
  SUPPLIER_MISCOUNT: { label: '装箱少发', bg: 'bg-purple-50', text: 'text-purple-700' },
  PENDING_INVESTIGATION: { label: 'FC核实中', bg: 'bg-blue-50', text: 'text-blue-700' },
  VERIFIED: { label: '核实无误', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  OTHER: { label: '其他差异', bg: 'bg-slate-50', text: 'text-slate-700' },
};

export const ShipmentDetailDrawer: React.FC<ShipmentDetailDrawerProps> = ({
  shipment,
  allShipments = [],
  onClose,
  onOpenCaseModal,
  onOpenSkuDetail,
  onOpenProductSupplement,
  onSelectShipment,
  onEditShipment,
}) => {
  if (!shipment) return null;

  const receivingRate =
    shipment.totalShipQty > 0
      ? ((shipment.totalReceivedQty / shipment.totalShipQty) * 100).toFixed(1)
      : '0.0';

  const discrepancyRate =
    shipment.totalShipQty > 0
      ? ((shipment.totalDiscrepancyQty / shipment.totalShipQty) * 100).toFixed(1)
      : '0.0';

  const timeDisplay = getCaseTimeDisplay(shipment.arrivalDate);
  const cartonCompleteButItemShort =
    shipment.totalCartons > 0 &&
    shipment.missingCartons === 0 &&
    shipment.totalDiscrepancyQty > 0;

  // Find linked shipment objects
  const linkedShipmentObjects = (shipment.mergedCustomsShipmentIds || [])
    .map((id) => allShipments.find((s) => s.id === id))
    .filter(Boolean) as Shipment[];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end transition-opacity">
      <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-5 bg-slate-900 text-white flex items-center justify-between flex-shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-base font-bold tracking-tight">
                {shipment.id}
              </span>
              <span
                className={`text-[11px] px-2 py-0.5 rounded font-medium ${
                  shipment.status === 'Fully Received' || shipment.status === 'Resolved'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                    : shipment.status === 'Case Eligible'
                    ? 'bg-red-500/20 text-red-300 border border-red-400/30'
                    : shipment.status === 'Case Processing'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                }`}
              >
                {shipment.status}
              </span>
            </div>
            <div className="text-xs text-slate-300 mt-1 flex items-center gap-3">
              <span>{shipment.shipmentName}</span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                {shipment.fc}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: 10-Day Case Countdown Banner */}
          {shipment.totalDiscrepancyQty > 0 && (
            <div className={`p-4 rounded-xl border ${timeDisplay.badgeClass} flex flex-col gap-2`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-600" />
                  <span className="font-semibold text-xs text-slate-900">
                    Walmart 10天Case状态判断
                  </span>
                </div>
                <span className="text-xs font-mono font-medium">{timeDisplay.text}</span>
              </div>

              <div className="text-xs text-slate-700 leading-relaxed">
                {shipment.arrivalDate ? (
                  <>
                    实际到仓日期为 <span className="font-semibold font-mono">{shipment.arrivalDate}</span>
                    ，满10天基准日期为{' '}
                    <span className="font-semibold font-mono">{shipment.caseEligibleDate}</span>。
                    {shipment.daysUntilCase !== undefined && shipment.daysUntilCase <= 0
                      ? ' 已满足 Walmart 差异 Case 处理条件，建议尽快在 Seller Center 提交 Claim 索赔。'
                      : ` 距离 10 天核对期还需 ${shipment.daysUntilCase} 天，请观察仓库清点进度。`}
                  </>
                ) : (
                  <span className="text-slate-600">
                    ⚠️ 当前货件无实际到仓日期（仅有ETA预计到仓）。
                    <strong className="text-slate-800">
                      系统严禁以ETA作为Case计时基准
                    </strong>
                    ，需等待实际到仓后方可触发10天倒计时。
                  </span>
                )}
              </div>

              {shipment.daysUntilCase !== undefined &&
                shipment.daysUntilCase <= 0 &&
                shipment.caseStatus !== 'Opened' &&
                shipment.caseStatus !== 'In Review' &&
                shipment.caseStatus !== 'Resolved' && (
                  <div className="pt-2">
                    <button
                      onClick={() => onOpenCaseModal(shipment)}
                      className="px-3.5 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition-all"
                    >
                      <FileCheck className="w-3.5 h-3.5" />
                      一键发起 / 登记 Walmart Case 索赔
                    </button>
                  </div>
                )}
            </div>
          )}

          {/* Section 2: 数量核心核对 (Ship Qty vs Received Qty) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Boxes className="w-4 h-4 text-blue-600" />
              商品数量核对 (Items Verification)
            </h4>

            <div className="grid grid-cols-4 gap-3">
              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <div className="text-[11px] text-slate-500 font-medium">我方发货数量</div>
                <div className="text-lg font-bold text-slate-900 font-mono mt-1">
                  {shipment.totalShipQty}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Ship Qty</div>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <div className="text-[11px] text-slate-500 font-medium">Walmart 接收</div>
                <div className="text-lg font-bold text-blue-600 font-mono mt-1">
                  {shipment.totalReceivedQty}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Received Qty</div>
              </div>

              <div
                className={`p-3 rounded-lg border ${
                  shipment.totalDiscrepancyQty > 0
                    ? 'bg-red-50/70 border-red-200'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="text-[11px] text-slate-500 font-medium">数量差异</div>
                <div
                  className={`text-lg font-bold font-mono mt-1 ${
                    shipment.totalDiscrepancyQty > 0 ? 'text-red-600' : 'text-emerald-600'
                  }`}
                >
                  {shipment.totalDiscrepancyQty > 0 ? `-${shipment.totalDiscrepancyQty}` : '0'}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">Discrepancy</div>
              </div>

              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <div className="text-[11px] text-slate-500 font-medium">接收率 / 差异率</div>
                <div className="text-sm font-bold text-slate-800 font-mono mt-1">
                  {receivingRate}%
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">差异率: {discrepancyRate}%</div>
              </div>
            </div>
          </div>

          {/* Section 3: 箱数核对 (Carton Management) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Truck className="w-4 h-4 text-indigo-600" />
                箱数核对 (Carton Verification)
              </h4>
              {cartonCompleteButItemShort && (
                <span className="text-[11px] px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded font-medium">
                  ⚠️ 箱数完整，但商品数量短少
                </span>
              )}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <div className="text-[11px] text-slate-500 font-medium">发货总箱数</div>
                <div className="text-base font-bold text-slate-900 font-mono mt-1">
                  {shipment.totalCartons} 箱
                </div>
              </div>
              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <div className="text-[11px] text-slate-500 font-medium">接收箱数</div>
                <div className="text-base font-bold text-slate-900 font-mono mt-1">
                  {shipment.totalReceivedCartons} 箱
                </div>
              </div>
              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <div className="text-[11px] text-slate-500 font-medium">短缺箱数</div>
                <div
                  className={`text-base font-bold font-mono mt-1 ${
                    shipment.missingCartons > 0 ? 'text-red-600' : 'text-slate-800'
                  }`}
                >
                  {shipment.missingCartons} 箱
                </div>
              </div>
            </div>

            {cartonCompleteButItemShort && (
              <p className="text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200 mt-2.5 leading-relaxed">
                <strong>业务研判：</strong>发货箱数与接收箱数一致（
                {shipment.totalCartons} 箱），但商品总件数短少{' '}
                {shipment.totalDiscrepancyQty} 件。通常为装箱装货内配误差或FC拆箱时扫描遗漏，建议核对装箱清单（Packing List）。
              </p>
            )}
          </div>

          {/* Section 4: 时间节点全景 */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-600" />
              物流与到仓时间节点
            </h4>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-400 text-[11px] block">发货日期 (Ship Date)</span>
                <span className="font-mono font-medium text-slate-800">
                  {shipment.shipDate || '未记录'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">预计到仓 (ETA)</span>
                <span className="font-mono font-medium text-slate-800">
                  {shipment.eta || '未记录'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">实际到仓 (Arrival Date)</span>
                <span className="font-mono font-bold text-slate-900">
                  {shipment.arrivalDate || '暂无实际到仓'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">Case达到条件日</span>
                <span className="font-mono font-medium text-slate-800">
                  {shipment.caseEligibleDate || '无法计算'}
                </span>
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
              <span>
                承运商: <strong className="text-slate-800">{shipment.carrier || '—'}</strong>
              </span>
              <span>
                物流追踪号:{' '}
                <strong className="font-mono text-slate-800">{shipment.tracking || '—'}</strong>
              </span>
            </div>
          </div>

          {/* Section 4.5: 报关申报与同批关联货件 */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <Link2 className="w-4 h-4 text-blue-600" />
                报关申报与同批货件关联 (Customs Declaration)
              </h4>
              <span
                className={`text-[11px] px-2 py-0.5 rounded font-medium ${
                  shipment.customsDeclarationType === 'STANDALONE'
                    ? 'bg-slate-200 text-slate-800'
                    : shipment.customsDeclarationType === 'EXEMPT'
                    ? 'bg-emerald-100 text-emerald-800'
                    : linkedShipmentObjects.length > 0
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {shipment.customsDeclarationType === 'STANDALONE'
                  ? '独立报关 (¥350/票)'
                  : shipment.customsDeclarationType === 'EXEMPT'
                  ? '免报关 (¥0)'
                  : linkedShipmentObjects.length > 0
                  ? `合并报关 (拼单 ${linkedShipmentObjects.length + 1}票)`
                  : '单票报关 (未关联拼单)'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-400 text-[11px] block">运输渠道</span>
                <span className="font-bold text-slate-800 mt-0.5 block">
                  {shipment.channel || shipment.carrier || '美森限时达'}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-400 text-[11px] block">报关批次号</span>
                <span className="font-mono font-bold text-blue-700 mt-0.5 block truncate" title={shipment.customsBatchId || '未单独设置批次号'}>
                  {shipment.customsBatchId || (linkedShipmentObjects.length > 0 ? '手动拼单组' : '未设置 (单票独立)')}
                </span>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                <span className="text-slate-400 text-[11px] block">拼单关联货件数</span>
                <span className="font-bold text-slate-900 mt-0.5 block">
                  {linkedShipmentObjects.length > 0
                    ? `共 ${linkedShipmentObjects.length + 1} 票 (已关联 ${linkedShipmentObjects.length} 票)`
                    : '单票独立 (未关联拼单)'}
                </span>
              </div>
            </div>

            {/* List of associated peer shipments in this customs batch */}
            {linkedShipmentObjects.length > 0 ? (
              <div className="pt-2 border-t border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-700 block">
                    同批合并报关关联货件 (点击可切换查看):
                  </span>
                  {onEditShipment && (
                    <button
                      onClick={() => onEditShipment(shipment)}
                      className="text-[11px] text-blue-600 hover:text-blue-800 flex items-center gap-1 font-medium transition-colors"
                    >
                      <Edit3 className="w-3 h-3" />
                      管理关联货件
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {linkedShipmentObjects.map((peer) => (
                    <div
                      key={peer.id}
                      onClick={() => onSelectShipment && onSelectShipment(peer.id)}
                      className="p-2 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-300 rounded-lg text-xs cursor-pointer transition-all flex items-center justify-between group"
                    >
                      <div>
                        <div className="flex items-center gap-1.5 font-mono font-bold text-blue-600 group-hover:text-blue-700">
                          <span>{peer.id}</span>
                          <ExternalLink className="w-2.5 h-2.5 text-blue-400" />
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {peer.fc.split(' ')[0]} · 发货 {peer.totalShipQty} 件 · {peer.totalCartons} 箱
                        </div>
                      </div>
                      <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 group-hover:bg-blue-100 group-hover:text-blue-700 rounded text-[10px]">
                        {peer.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-slate-500 bg-white p-2.5 rounded-lg border border-slate-200 flex items-center justify-between gap-3">
                <span className="leading-relaxed">
                  💡 报关关联说明：只有经用户手动设置关联的货件才会视为同批拼单报关（共享报关费与超品申报）。系统绝不会随意强制关联同日同渠道货件。
                </span>
                {onEditShipment && (
                  <button
                    onClick={() => onEditShipment(shipment)}
                    className="px-2.5 py-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-md border border-blue-200 font-medium whitespace-nowrap transition-colors flex-shrink-0 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    设置拼单关联
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Section 5: Case 处理记录 */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-purple-600" />
                Case 索赔追踪
              </h4>
              <span
                className={`text-[11px] px-2 py-0.5 rounded font-medium ${
                  shipment.caseStatus === 'Resolved' || shipment.caseStatus === 'Closed'
                    ? 'bg-emerald-100 text-emerald-800'
                    : shipment.caseStatus === 'In Review' || shipment.caseStatus === 'Opened'
                    ? 'bg-blue-100 text-blue-800'
                    : shipment.caseStatus === 'Eligible'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {shipment.caseStatus}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs mb-3">
              <div>
                <span className="text-slate-400 text-[11px] block">Case 编号</span>
                <span className="font-mono font-semibold text-slate-900">
                  {shipment.caseId || '尚未创建Case'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 text-[11px] block">Case 状态</span>
                <span className="font-medium text-slate-800">{shipment.caseStatus}</span>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => onOpenCaseModal(shipment)}
                className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold shadow-xs transition-colors"
              >
                {shipment.caseId ? '更新 Case 进展 / 结果' : '开立 / 登记 Case'}
              </button>
            </div>
          </div>

          {/* Section 6: SKU 明细表 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Boxes className="w-4 h-4 text-blue-600" />
                货件商品明细 ({shipment.items?.length || 0} 个SKU)
              </h4>
              {onOpenProductSupplement && (
                <button
                  onClick={() => onOpenProductSupplement(shipment)}
                  className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {shipment.items && shipment.items.length > 0 ? '补充/编辑商品与差异标注' : '补充商品 SKU 明细'}
                </button>
              )}
            </div>

            {(!shipment.items || shipment.items.length === 0) ? (
              <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
                <p className="text-xs text-slate-500 mb-2">
                  当前货件未录入商品 SKU 明细（按货件主单总数 {shipment.totalShipQty} 件管理）
                </p>
                {onOpenProductSupplement && (
                  <button
                    onClick={() => onOpenProductSupplement(shipment)}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1 shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    补充录入商品 SKU 及差异标注
                  </button>
                )}
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">商品 SKU / 差异标注</th>
                      <th className="p-2.5 text-right">发货数</th>
                      <th className="p-2.5 text-right">接收数</th>
                      <th className="p-2.5 text-right">差异数</th>
                      <th className="p-2.5 text-center">箱数</th>
                      <th className="p-2.5 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {shipment.items?.map((it, idx) => {
                      const tagInfo = it.discrepancyTag ? DISCREPANCY_TAG_LABELS[it.discrepancyTag] : null;
                      return (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-2.5">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => onOpenSkuDetail(it.sku)}
                                className="font-mono font-bold text-blue-600 hover:underline flex items-center gap-1"
                              >
                                {it.sku}
                                <ExternalLink className="w-2.5 h-2.5" />
                              </button>
                              {it.requiresFollowup && (
                                <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-[10px] font-bold flex items-center gap-0.5">
                                  <BellRing className="w-2.5 h-2.5" />
                                  重点跟进
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate max-w-xs">
                              {it.productName}
                            </div>
                            {/* Discrepancy Tag & Reason Badge */}
                            {(tagInfo || it.discrepancyReason) && (
                              <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px]">
                                {tagInfo && (
                                  <span className={`px-1.5 py-0.2 rounded border ${tagInfo.bg} ${tagInfo.text} border-slate-200/60 font-medium`}>
                                    {tagInfo.label}
                                  </span>
                                )}
                                {it.discrepancyReason && (
                                  <span className="text-slate-600 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200/50 truncate max-w-[200px]" title={it.discrepancyReason}>
                                    备注: {it.discrepancyReason}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="p-2.5 text-right font-mono font-medium">{it.shipQty}</td>
                          <td className="p-2.5 text-right font-mono font-semibold text-blue-600">
                            {it.receivedQty}
                          </td>
                          <td
                            className={`p-2.5 text-right font-mono font-bold ${
                              it.discrepancyQty > 0 ? 'text-red-600' : 'text-emerald-600'
                            }`}
                          >
                            {it.discrepancyQty > 0 ? `-${it.discrepancyQty}` : '0'}
                          </td>
                          <td className="p-2.5 text-center font-mono text-slate-600">
                            {it.cartons} 箱 ({it.qtyPerCarton}/箱)
                          </td>
                          <td className="p-2.5 text-center">
                            <button
                              onClick={() => onOpenSkuDetail(it.sku)}
                              className="text-blue-600 hover:text-blue-800 text-[11px] font-medium"
                            >
                              库存明细
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 7: 数据溯源标记 */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-500 space-y-1">
            <div className="flex items-center justify-between">
              <span>数据来源: <strong className="text-slate-700">{shipment.source}</strong></span>
              <span>更新时间: <strong className="text-slate-700">{shipment.updatedAt.slice(0, 19).replace('T', ' ')}</strong></span>
            </div>
            {shipment.notes && (
              <div className="pt-1 text-slate-600">
                备注说明: {shipment.notes}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
