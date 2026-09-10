import React, { useState, useMemo, useRef } from 'react';
import {
  Boxes,
  Search,
  Filter,
  Download,
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  ExternalLink,
  Edit2,
  TrendingDown,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Receipt,
  Info,
  DollarSign,
  PackageCheck,
  Truck,
  Layers,
  X,
} from 'lucide-react';
import { InventoryItem, CaseRecord, Shipment } from '../types';
import { exportInventoryToExcel } from '../utils/excelExporter';
import {
  downloadInventoryTemplateExcel,
  parseInventoryUploadExcel,
} from '../utils/excelParser';

interface InventoryManagementViewProps {
  inventory: InventoryItem[];
  cases?: CaseRecord[];
  shipments?: Shipment[];
  onSelectSku: (sku: string) => void;
  onUpdateInventoryItem: (item: InventoryItem) => void;
  onBulkUpdateInventory?: (items: InventoryItem[]) => void;
}

export const InventoryManagementView: React.FC<InventoryManagementViewProps> = ({
  inventory,
  cases = [],
  shipments = [],
  onSelectSku,
  onUpdateInventoryItem,
  onBulkUpdateInventory,
}) => {
  const [search, setSearch] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [stockStatusFilter, setStockStatusFilter] = useState<string>('all');
  const [reimbursementFilter, setReimbursementFilter] = useState<string>('all');
  const [showAllRows, setShowAllRows] = useState<boolean>(false);
  const [displayLimit, setDisplayLimit] = useState<number>(15);

  // Edit Safety Stock modal state
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [newSafetyStock, setNewSafetyStock] = useState<number>(50);

  // Walmart Reimbursement / Claim Detail Modal state
  const [reimbursementModalSku, setReimbursementModalSku] = useState<InventoryItem | null>(null);

  // File upload state for complete product & inventory table
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const productTypes = useMemo(() => {
    const set = new Set<string>();
    inventory.forEach((i) => {
      if (i.productType) set.add(i.productType);
    });
    return Array.from(set);
  }, [inventory]);

  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      if (typeFilter !== 'all' && item.productType !== typeFilter) return false;

      const isLow = item.available < item.safetyStock;
      const isOver = item.maxStock ? item.available > item.maxStock : false;

      if (stockStatusFilter === 'low' && !isLow) return false;
      if (stockStatusFilter === 'normal' && (isLow || isOver)) return false;
      if (stockStatusFilter === 'over' && !isOver) return false;

      const hasReimbursement = Boolean(item.reimbursedUnits && item.reimbursedUnits > 0);
      if (reimbursementFilter === 'reimbursed' && !hasReimbursement) return false;
      if (reimbursementFilter === 'none' && hasReimbursement) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        return (
          item.sku.toLowerCase().includes(q) ||
          item.productName.toLowerCase().includes(q) ||
          (item.itemId || '').toLowerCase().includes(q) ||
          (item.gtin || '').toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [inventory, typeFilter, stockStatusFilter, reimbursementFilter, search]);

  const totalAvailable = inventory.reduce((acc, curr) => acc + curr.available, 0);
  const totalInbound = inventory.reduce((acc, curr) => acc + curr.inbound, 0);
  const totalReceiving = inventory.reduce((acc, curr) => acc + curr.receiving, 0);
  // Total projected strictly = in-stock available + in-transit inbound
  const totalProjected = inventory.reduce((acc, curr) => acc + curr.totalProjected, 0);
  const totalReimbursedUnits = inventory.reduce((acc, curr) => acc + (curr.reimbursedUnits || 0), 0);
  const totalReimbursedAmount = inventory.reduce((acc, curr) => acc + (curr.reimbursedAmount || 0), 0);

  const handleSaveSafetyStock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    onUpdateInventoryItem({
      ...editingItem,
      safetyStock: newSafetyStock,
      updatedAt: new Date().toISOString(),
    });
    setEditingItem(null);
  };

  // Handle upload of full product & inventory table
  const handleInventoryFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadFeedback(null);

    try {
      const result = await parseInventoryUploadExcel(file, inventory);
      if (onBulkUpdateInventory) {
        onBulkUpdateInventory(result.items);
      }

      setUploadFeedback({
        type: 'success',
        text: `上传成功！共解析 ${result.totalRows} 行数据，更新 ${result.updatedCount} 个现有SKU，新增 ${result.newCount} 个新产品。在途与待收数据已自动重新核算。`,
      });

      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setUploadFeedback({
        type: 'error',
        text: `上传失败：${err.message || '文件解析异常，请检查表格格式'}`,
      });
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadFeedback(null), 8000);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto select-text">
      {/* Hidden File Input for Inventory Upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleInventoryFileUpload}
        accept=".xlsx,.xls,.csv"
        className="hidden"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            Walmart 库存全维度实时看板
            <span className="text-xs font-mono font-normal text-slate-500">
              ({filteredInventory.length} / {inventory.length} 个 SKU)
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            涵盖可用现货、在途运输、待收清点及预计可用总库存（预计可用 = 在库现货 + 在途发运）
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => downloadInventoryTemplateExcel()}
            title="下载包含商品SKU、Item ID、可用库存数等字段的标准Excel模板"
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            下载标准库存模板
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            title="手动上传完整产品表与在库库存数量"
            className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 transition-all"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
            {isUploading ? '正在解析...' : '上传/更新产品库存表'}
          </button>

          <button
            onClick={() => exportInventoryToExcel(filteredInventory)}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            导出当前报表
          </button>
        </div>
      </div>

      {/* Upload Feedback Toast */}
      {uploadFeedback && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
            uploadFeedback.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {uploadFeedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
          )}
          <span>{uploadFeedback.text}</span>
        </div>
      )}

      {/* 4 Inventory Structure KPI Cards + Reimbursement Summary Banner */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            当前在库/可用现货
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 mt-1">
            {totalAvailable.toLocaleString()}
            <span className="text-xs font-normal text-slate-400 ml-1">件</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">用户上传/实时在库库存</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            在途发运数量
          </div>
          <div className="text-xl font-bold font-mono text-indigo-600 mt-1">
            {totalInbound.toLocaleString()}
            <span className="text-xs font-normal text-slate-400 ml-1">件</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">货件已创建/已发货未到仓</div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
            <span>待收/清点中数量</span>
            {totalReimbursedUnits > 0 && (
              <span
                className="text-[10px] px-1.5 py-0.2 rounded font-medium bg-purple-50 text-purple-700 border border-purple-200"
                title={`已扣除 Walmart 官方确认赔付完结的 ${totalReimbursedUnits} 件损失`}
              >
                已核减赔付 {totalReimbursedUnits}件
              </span>
            )}
          </div>
          <div className="text-xl font-bold font-mono text-amber-600 mt-1">
            {totalReceiving.toLocaleString()}
            <span className="text-xs font-normal text-slate-400 ml-1">件</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">已到仓接收上架未完成部分</div>
        </div>

        <div className="bg-blue-50/70 p-3.5 rounded-xl border border-blue-200 shadow-xs">
          <div className="text-[11px] font-bold text-blue-900 uppercase tracking-wider flex items-center justify-between">
            <span>预计可用总计</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded font-mono font-medium bg-blue-100 text-blue-800">
              在库 + 在途
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-blue-900 mt-1">
            {totalProjected.toLocaleString()}
            <span className="text-xs font-normal text-blue-500 ml-1">件</span>
          </div>
          <div className="text-[10px] text-blue-700 mt-0.5">严格按可用在库 + 在途计算</div>
        </div>
      </div>

      {/* Reimbursement Claim Highlight Banner (if any reimbursed cases exist) */}
      {totalReimbursedUnits > 0 && (
        <div className="bg-purple-50/80 border border-purple-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-purple-900">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-purple-600 flex-shrink-0" />
            <span>
              <strong>Walmart 索赔赔付核销规则已生效：</strong>
              当前共有 <strong>{totalReimbursedUnits} 件</strong> 货件少收漏收已通过 Case 获得 Walmart 官方赔付完结（累计赔偿 <strong>${totalReimbursedAmount.toFixed(2)}</strong>），该部分数量已严格从「待收清点」中剔除，不计入在库与在途。
            </span>
          </div>
          <span className="text-[11px] font-medium text-purple-700 bg-white/80 px-2 py-0.5 rounded border border-purple-200 whitespace-nowrap self-start sm:self-auto">
            自动差异核销已同步
          </span>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="搜索 SKU / 产品名称 / Walmart Item ID / GTIN条码..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">产品类目:</span>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部类目</option>
              {productTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">库存健康:</span>
            <select
              value={stockStatusFilter}
              onChange={(e) => setStockStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部健康状态</option>
              <option value="low">低于安全库存 (Low Stock)</option>
              <option value="normal">健康充足 (Normal)</option>
              <option value="over">可能冗余积压 (Overstock)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-slate-500 font-medium">赔付状态:</span>
            <select
              value={reimbursementFilter}
              onChange={(e) => setReimbursementFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部</option>
              <option value="reimbursed">含 Walmart 官方赔付已结案</option>
              <option value="none">无赔付记录</option>
            </select>
          </div>
        </div>
      </div>

      {/* SKU Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left whitespace-nowrap">
            <thead className="bg-slate-900 text-slate-200 font-semibold border-b border-slate-800">
              <tr>
                <th className="p-3 sticky left-0 z-10 bg-slate-900">SKU 编号</th>
                <th className="p-3">产品名称 / Item ID</th>
                <th className="p-3">产品类目</th>
                <th className="p-3 text-right">可用现货 (在库)</th>
                <th className="p-3 text-right">在途数量 (未到仓)</th>
                <th className="p-3 text-right">待收清点 (到仓上架中)</th>
                <th className="p-3 text-right bg-slate-800/80">预计可用总计 (在库+在途)</th>
                <th className="p-3 text-right">安全库存阈值</th>
                <th className="p-3 text-right">30天销量</th>
                <th className="p-3 text-right">可售天数</th>
                <th className="p-3 text-center">状态</th>
                <th className="p-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {(showAllRows ? filteredInventory : filteredInventory.slice(0, displayLimit)).map((item) => {
                const isLow = item.available < item.safetyStock;
                const hasReimbursement = Boolean(item.reimbursedUnits && item.reimbursedUnits > 0);

                return (
                  <tr key={item.sku} className="hover:bg-slate-50 transition-colors">
                    {/* SKU */}
                    <td className="p-3 font-mono font-bold sticky left-0 z-10 bg-white group-hover:bg-slate-50">
                      <button
                        onClick={() => onSelectSku(item.sku)}
                        className="text-blue-600 hover:underline flex items-center gap-1 text-left"
                      >
                        {item.sku}
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    </td>

                    {/* Product Name & Item ID */}
                    <td className="p-3">
                      <div className="font-medium text-slate-900 truncate max-w-[220px]" title={item.productName}>
                        {item.productName}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {item.itemId || '—'} {item.gtin ? `· UPC ${item.gtin}` : ''}
                      </div>
                    </td>

                    {/* Product Type */}
                    <td className="p-3 text-slate-600">{item.productType || 'General'}</td>

                    {/* Available */}
                    <td className="p-3 text-right font-mono font-bold text-slate-900">
                      {item.available}
                    </td>

                    {/* Inbound (Created/Shipped but not arrived) */}
                    <td className="p-3 text-right font-mono font-semibold text-indigo-600">
                      {item.inbound}
                    </td>

                    {/* Receiving (Arrived/Receiving, excludes reimbursed units) */}
                    <td className="p-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="font-mono font-semibold text-amber-600">
                          {item.receiving}
                        </span>
                        {hasReimbursement && (
                          <button
                            onClick={() => setReimbursementModalSku(item)}
                            title={`Walmart 已确认赔付 ${item.reimbursedUnits} 件 ($${item.reimbursedAmount || 0})，点击查看索赔说明`}
                            className="px-1.5 py-0.2 rounded text-[10px] font-sans font-medium bg-purple-100 text-purple-800 border border-purple-300 hover:bg-purple-200 transition-colors flex items-center gap-0.5 shadow-2xs"
                          >
                            <ShieldCheck className="w-3 h-3 text-purple-600" />
                            <span>赔付 -{item.reimbursedUnits}件</span>
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Total Projected (Strictly Available + Inbound) */}
                    <td className="p-3 text-right font-mono font-bold text-blue-700 bg-blue-50/40">
                      {item.totalProjected}
                    </td>

                    {/* Safety Stock */}
                    <td className="p-3 text-right font-mono text-slate-600">
                      {item.safetyStock}
                    </td>

                    {/* 30 Day Sales */}
                    <td className="p-3 text-right font-mono text-slate-800">
                      {item.sales30Days ?? '—'}
                    </td>

                    {/* Days of supply */}
                    <td className="p-3 text-right font-mono">
                      {item.daysOfSupply !== undefined ? (
                        <span
                          className={`font-semibold ${
                            item.daysOfSupply < 15 ? 'text-red-600' : 'text-slate-800'
                          }`}
                        >
                          {item.daysOfSupply} 天
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    {/* Stock Status Badge */}
                    <td className="p-3 text-center">
                      {isLow ? (
                        <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-red-100 text-red-800 border border-red-200">
                          低库存预警
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          充足
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => {
                            setEditingItem(item);
                            setNewSafetyStock(item.safetyStock);
                          }}
                          title="修改安全库存"
                          className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onSelectSku(item.sku)}
                          className="text-[11px] text-blue-600 hover:underline font-medium"
                        >
                          明细流水
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredInventory.length === 0 && (
                <tr>
                  <td colSpan={12} className="p-12 text-center text-xs text-slate-400">
                    暂无符合条件的库存记录
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* 15-Item Display Limit & Pagination / Show More Control */}
        {filteredInventory.length > 15 && (
          <div className="p-3.5 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-slate-600">
              当前显示{' '}
              <span className="font-bold text-slate-900 font-mono">
                {showAllRows
                  ? filteredInventory.length
                  : Math.min(displayLimit, filteredInventory.length)}
              </span>{' '}
              / 共 <span className="font-bold text-slate-900 font-mono">{filteredInventory.length}</span> 个 SKU
            </div>

            <div className="flex items-center gap-2">
              {!showAllRows && displayLimit < filteredInventory.length && (
                <button
                  onClick={() => setDisplayLimit((prev) => prev + 15)}
                  className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-white hover:bg-blue-50 rounded-lg transition-colors border border-slate-200 shadow-2xs"
                >
                  继续加载 15 条
                </button>
              )}

              <button
                onClick={() => {
                  setShowAllRows(!showAllRows);
                  if (showAllRows) setDisplayLimit(15);
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 rounded-lg transition-colors border border-slate-200 shadow-2xs"
              >
                {showAllRows ? '折叠为默认 15 条' : `展开全部 (${filteredInventory.length} 条)`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Safety Stock Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-5 border border-slate-200 space-y-4">
            <h3 className="text-xs font-bold text-slate-900">
              调整 SKU 安全库存阈值: {editingItem.sku}
            </h3>
            <form onSubmit={handleSaveSafetyStock} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 mb-1">安全库存值 (Safety Stock)</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={newSafetyStock}
                  onChange={(e) => setNewSafetyStock(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-xs"
                >
                  保存更新
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Walmart Case Reimbursement / Settlement Details Modal */}
      {reimbursementModalSku && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-purple-100 text-purple-700 rounded-xl">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    Walmart 索赔赔付与结案明细说明
                  </h3>
                  <div className="text-xs font-mono text-purple-700 font-semibold mt-0.5">
                    SKU: {reimbursementModalSku.sku} · Item ID: {reimbursementModalSku.itemId || '—'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setReimbursementModalSku(null)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Product Overview Card */}
            <div className="bg-purple-50/60 p-3.5 rounded-xl border border-purple-200 text-xs space-y-1.5">
              <div className="font-semibold text-purple-950">
                {reimbursementModalSku.productName}
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div>
                  <span className="text-purple-600">已核准赔偿件数：</span>
                  <span className="font-mono font-bold text-purple-900 text-sm ml-1">
                    {reimbursementModalSku.reimbursedUnits || 0} 件
                  </span>
                </div>
                <div>
                  <span className="text-purple-600">官方赔付总金额：</span>
                  <span className="font-mono font-bold text-purple-900 text-sm ml-1">
                    ${(reimbursementModalSku.reimbursedAmount || 0).toFixed(2)} USD
                  </span>
                </div>
              </div>
            </div>

            {/* Rule explanation */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1 text-slate-600">
              <div className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-blue-600" />
                业务与库存扣减规则说明：
              </div>
              <p className="text-[11px] leading-relaxed">
                货件在沃尔玛收货过程中发生的少收/漏收差异，开具 Case 索赔并获得沃尔玛官方批准确认赔偿完结后，该部分件数已被官方折算为赔款结算，<strong>不再处于待上架或待收清点状态</strong>。因此系统已将其从「待收清点」数量中剔除，确保库存预测数据真实准确。
              </p>
            </div>

            {/* Associated Cases List */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-900">关联赔付 Case 记录:</div>
              <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                {reimbursementModalSku.reimbursementCases &&
                reimbursementModalSku.reimbursementCases.length > 0 ? (
                  reimbursementModalSku.reimbursementCases.map((c) => (
                    <div
                      key={c.caseId}
                      className="p-3 bg-white rounded-xl border border-purple-200 text-xs space-y-1.5 shadow-2xs"
                    >
                      <div className="flex items-center justify-between font-mono">
                        <span className="font-bold text-purple-900">{c.caseId}</span>
                        <span className="text-slate-500">货件: {c.shipmentId}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-600">
                          获赔数量: <strong className="text-purple-800 font-mono">{c.reimbursedUnits} 件</strong>
                        </span>
                        {c.reimbursedAmount !== undefined && (
                          <span className="text-emerald-700 font-mono font-bold">
                            赔偿金额: ${c.reimbursedAmount.toFixed(2)}
                          </span>
                        )}
                        <span className="text-slate-400">结案: {c.closedDate || '—'}</span>
                      </div>
                      {c.walmartResponse && (
                        <div className="p-2 bg-slate-50 rounded-lg text-[11px] text-slate-700 border border-slate-100 font-mono">
                          {c.walmartResponse}
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">
                    暂无关联 Case 明细记录
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setReimbursementModalSku(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg shadow-xs"
              >
                关闭说明
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

