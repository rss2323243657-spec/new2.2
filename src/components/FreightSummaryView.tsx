import React, { useState, useMemo, useRef } from 'react';
import {
  Calculator,
  UploadCloud,
  Download,
  Plus,
  ArrowRightLeft,
  Search,
  Filter,
  Calendar,
  Building2,
  Truck,
  Box,
  Layers,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Trash2,
  Edit2,
  FileCheck,
  RotateCcw,
  Sparkles,
  Info,
  Scale,
  CalendarRange,
  Link2,
  Tag,
} from 'lucide-react';
import {
  FreightShippingItem,
  MonthlyFreightSummary,
  ShipmentFreightSummary,
  Shipment,
  InventoryItem,
  Product,
} from '../types';
import {
  aggregateMonthlySummaries,
  extractMonthKey,
  formatMonthDisplay,
  applyShipmentLevelUpdates,
  ShipmentLevelUpdatePayload,
} from '../utils/freightCalculator';
import {
  downloadFreightTemplate,
  parseFreightExcelOrCsv,
} from '../utils/excelParser';
import { exportFreightSummaryToExcel } from '../utils/freightExporter';
import { AppStorage } from '../utils/storage';
import { FreightManualItemModal } from './FreightManualItemModal';
import { FreightShipmentEditModal } from './FreightShipmentEditModal';
import { FreightSyncModal } from './FreightSyncModal';
import {
  FreightDuplicateModal,
  DuplicateResolutionStrategy,
} from './FreightDuplicateModal';

interface FreightSummaryViewProps {
  freightItems: FreightShippingItem[];
  actuals: Record<
    string,
    {
      actualChargeableWeight?: number;
      actualCost?: number;
      reconciliationNotes?: string;
    }
  >;
  onUpdateFreightItems: (items: FreightShippingItem[]) => void;
  onUpdateActuals: (
    actuals: Record<
      string,
      {
        actualChargeableWeight?: number;
        actualCost?: number;
        reconciliationNotes?: string;
      }
    >
  ) => void;
  shipments: Shipment[];
  inventory?: InventoryItem[];
  products?: Product[];
  onSyncToShipments: (shipments: Shipment[]) => void;
}

export const FreightSummaryView: React.FC<FreightSummaryViewProps> = ({
  freightItems,
  actuals,
  onUpdateFreightItems,
  onUpdateActuals,
  shipments,
  inventory = [],
  products = [],
  onSyncToShipments,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [channelFilter, setChannelFilter] = useState('all');
  const [reconcileFilter, setReconcileFilter] = useState('all'); // all, reconciled, pending, variance
  const [tagFilter, setTagFilter] = useState<
    'all' | 'mixed' | 'min12kg' | 'merged' | 'standalone' | 'exempt' | 'extraCats'
  >('all');
  const [expandedShipments, setExpandedShipments] = useState<Set<string>>(new Set());
  const [showAllShipments, setShowAllShipments] = useState(false);
  const [displayLimit, setDisplayLimit] = useState<number>(15);

  // Scroll ref for month buttons
  const monthScrollRef = useRef<HTMLDivElement>(null);

  // Modals state
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FreightShippingItem | null>(null);
  const [editingShipment, setEditingShipment] = useState<ShipmentFreightSummary | null>(null);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);

  // Duplicate prompt modal state for freight upload
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] = useState(false);
  const [pendingUploadResult, setPendingUploadResult] = useState<{
    items: FreightShippingItem[];
    actuals: Record<string, any>;
    fileName: string;
    shipmentCount: number;
    totalUnits: number;
  } | null>(null);

  // File upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);

  // Aggregate monthly summaries
  const monthlySummaries = useMemo(() => {
    return aggregateMonthlySummaries(freightItems, actuals, shipments);
  }, [freightItems, actuals, shipments]);

  // Available month tabs
  const availableMonths = useMemo(() => {
    return monthlySummaries.map((m) => ({
      key: m.monthKey,
      display: m.monthDisplay,
      year: m.monthKey.slice(0, 4),
      count: m.shipmentCount,
      cost: m.totalEstimatedCost,
    }));
  }, [monthlySummaries]);

  // Available years
  const availableYears = useMemo(() => {
    const set = new Set<string>();
    availableMonths.forEach((m) => set.add(m.year));
    return Array.from(set).sort().reverse();
  }, [availableMonths]);

  // Filtered months by year
  const displayedMonths = useMemo(() => {
    if (selectedYear === 'all') return availableMonths;
    return availableMonths.filter((m) => m.year === selectedYear);
  }, [availableMonths, selectedYear]);

  // Scroll handler for month pill tabs
  const scrollMonths = (direction: 'left' | 'right') => {
    if (monthScrollRef.current) {
      const scrollAmount = direction === 'left' ? -260 : 260;
      monthScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
  };

  // Active monthly data
  const currentMonthData = useMemo(() => {
    if (selectedMonth === 'all') {
      // Aggregate across all months
      const allShipments: ShipmentFreightSummary[] = [];
      monthlySummaries.forEach((m) => {
        allShipments.push(...m.shipments);
      });

      const totalUnits = allShipments.reduce((sum, s) => sum + s.totalUnits, 0);
      const totalCartons = allShipments.reduce((sum, s) => sum + s.totalCartons, 0);
      const totalEstWeight = allShipments.reduce(
        (sum, s) => sum + s.totalEstimatedChargeableWeight,
        0
      );
      const totalEstCost = allShipments.reduce((sum, s) => sum + s.totalEstimatedCost, 0);
      const totalActualWeight = allShipments.reduce(
        (sum, s) => sum + (s.actualChargeableWeight || 0),
        0
      );
      const totalActualCost = allShipments.reduce((sum, s) => sum + (s.actualCost || 0), 0);
      const costDiff = totalActualCost > 0 ? totalActualCost - totalEstCost : 0;
      const costDiffPct = totalEstCost > 0 ? (costDiff / totalEstCost) * 100 : 0;

      return {
        monthKey: 'all',
        monthDisplay: '全部月份出货汇总',
        shipments: allShipments,
        shipmentCount: allShipments.length,
        totalUnits,
        totalCartons,
        totalEstimatedChargeableWeight: totalEstWeight,
        totalEstimatedCost: totalEstCost,
        totalActualChargeableWeight: totalActualWeight,
        totalActualCost,
        costDifference: costDiff,
        costDifferencePercent: costDiffPct,
        reconciledShipmentCount: allShipments.filter((s) => s.isReconciled).length,
        unreconciledShipmentCount: allShipments.filter((s) => !s.isReconciled).length,
      };
    }

    return (
      monthlySummaries.find((m) => m.monthKey === selectedMonth) || {
        monthKey: selectedMonth,
        monthDisplay: formatMonthDisplay(selectedMonth),
        shipments: [],
        shipmentCount: 0,
        totalUnits: 0,
        totalCartons: 0,
        totalEstimatedChargeableWeight: 0,
        totalEstimatedCost: 0,
        totalActualChargeableWeight: 0,
        totalActualCost: 0,
        costDifference: 0,
        costDifferencePercent: 0,
        reconciledShipmentCount: 0,
        unreconciledShipmentCount: 0,
      }
    );
  }, [monthlySummaries, selectedMonth]);

  // Calculate current month statistics on mixed boxes, 12kg rule, and customs batches
  const currentMonthSpecialStats = useMemo(() => {
    let mixedShipmentCount = 0;
    let totalMixedGroups = 0;
    let min12kgShipmentCount = 0;
    let min12kgItemCount = 0;
    const customsBatches = new Set<string>();

    currentMonthData.shipments.forEach((s) => {
      const groups = new Set(
        s.items.map((it) => it.mixedBoxGroup).filter(Boolean)
      );
      if (groups.size > 0) {
        mixedShipmentCount++;
        totalMixedGroups += groups.size;
      }
      const min12Items = s.items.filter(
        (it) => it.chargeableType === 'MIN_12KG'
      );
      if (s.appliedMinimumRule || min12Items.length > 0) {
        min12kgShipmentCount++;
        min12kgItemCount += min12Items.length;
      }
      if (s.customsBatchId) {
        customsBatches.add(s.customsBatchId);
      }
    });

    return {
      mixedShipmentCount,
      totalMixedGroups,
      min12kgShipmentCount,
      min12kgItemCount,
      customsBatchesCount: customsBatches.size,
    };
  }, [currentMonthData.shipments]);

  // Unique channels
  const uniqueChannels = useMemo(() => {
    const set = new Set<string>();
    freightItems.forEach((it) => {
      if (it.channel) set.add(it.channel);
    });
    return Array.from(set);
  }, [freightItems]);

  // Filtered shipments in current view
  const filteredShipments = useMemo(() => {
    return currentMonthData.shipments.filter((s) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchId = s.shipmentId.toLowerCase().includes(q);
        const matchWh = s.warehouse.toLowerCase().includes(q);
        const matchSku = s.items.some(
          (it) =>
            it.sku.toLowerCase().includes(q) ||
            it.productName.toLowerCase().includes(q)
        );
        const matchNotes = (s.reconciliationNotes || '').toLowerCase().includes(q);
        if (!matchId && !matchWh && !matchSku && !matchNotes) return false;
      }

      // 2. Channel Filter
      if (channelFilter !== 'all') {
        const hasChannel = s.items.some((it) => it.channel === channelFilter);
        if (!hasChannel) return false;
      }

      // 3. Reconcile Filter
      if (reconcileFilter === 'reconciled' && !s.isReconciled) return false;
      if (reconcileFilter === 'pending' && s.isReconciled) return false;
      if (
        reconcileFilter === 'variance' &&
        (!s.isReconciled || Math.abs(s.costDifference || 0) < 0.01)
      ) {
        return false;
      }

      // 4. Tag / Characteristics Filter
      if (tagFilter === 'mixed') {
        const hasMixed = s.items.some((it) => !!it.mixedBoxGroup);
        if (!hasMixed) return false;
      } else if (tagFilter === 'min12kg') {
        const hasMin12kg =
          s.appliedMinimumRule ||
          s.items.some((it) => it.chargeableType === 'MIN_12KG');
        if (!hasMin12kg) return false;
      } else if (tagFilter === 'merged') {
        if (!s.isMergedCustoms || s.customsDeclarationType === 'EXEMPT')
          return false;
      } else if (tagFilter === 'standalone') {
        if (s.isMergedCustoms || s.customsDeclarationType === 'EXEMPT')
          return false;
      } else if (tagFilter === 'exempt') {
        if (s.customsDeclarationType !== 'EXEMPT') return false;
      } else if (tagFilter === 'extraCats') {
        if (!s.extraCategoryFee || s.extraCategoryFee <= 0) return false;
      }

      return true;
    });
  }, [
    currentMonthData.shipments,
    searchQuery,
    channelFilter,
    reconcileFilter,
    tagFilter,
  ]);

  // Toggle expansion of a shipment
  const toggleExpand = (shipmentId: string) => {
    setExpandedShipments((prev) => {
      const next = new Set(prev);
      if (next.has(shipmentId)) {
        next.delete(shipmentId);
      } else {
        next.add(shipmentId);
      }
      return next;
    });
  };

  // Expand or collapse all
  const toggleExpandAll = () => {
    if (expandedShipments.size === filteredShipments.length) {
      setExpandedShipments(new Set());
    } else {
      setExpandedShipments(new Set(filteredShipments.map((s) => s.shipmentId)));
    }
  };

  // Handle actual input update for a shipment
  const handleUpdateShipmentActual = (
    shipmentId: string,
    field: 'actualChargeableWeight' | 'actualCost' | 'reconciliationNotes',
    value: string
  ) => {
    const existing = actuals[shipmentId] || {};
    let updatedField: any = value;
    if (field === 'actualChargeableWeight' || field === 'actualCost') {
      updatedField = value.trim() === '' ? undefined : Number(value);
    }

    const updatedActuals = {
      ...actuals,
      [shipmentId]: {
        ...existing,
        [field]: updatedField,
      },
    };

    onUpdateActuals(updatedActuals);
    AppStorage.saveFreightActuals(updatedActuals);
  };

  // Execute freight data import with duplicate resolution strategy
  const executeImportFreightData = (
    strategy: DuplicateResolutionStrategy,
    incomingItems: FreightShippingItem[],
    actualsToMerge: Record<string, any> = {},
    meta?: { fileName: string; shipmentCount: number; totalUnits: number }
  ) => {
    let finalItems: FreightShippingItem[] = [];

    if (strategy === 'overwrite') {
      const existingMap = new Map<string, FreightShippingItem>();
      freightItems.forEach((it) =>
        existingMap.set(
          `${it.shipmentId.toUpperCase()}_${it.sku.toUpperCase()}`,
          it
        )
      );
      incomingItems.forEach((it) => {
        const key = `${it.shipmentId.toUpperCase()}_${it.sku.toUpperCase()}`;
        const existing = existingMap.get(key);
        if (existing) {
          existingMap.set(key, { ...existing, ...it, id: existing.id });
        } else {
          existingMap.set(key, it);
        }
      });
      finalItems = Array.from(existingMap.values());
    } else if (strategy === 'skip') {
      const existingKeys = new Set(
        freightItems.map(
          (it) => `${it.shipmentId.toUpperCase()}_${it.sku.toUpperCase()}`
        )
      );
      const brandNew = incomingItems.filter(
        (it) =>
          !existingKeys.has(
            `${it.shipmentId.toUpperCase()}_${it.sku.toUpperCase()}`
          )
      );
      finalItems = [...freightItems, ...brandNew];
    } else if (strategy === 'append') {
      const freshItems = incomingItems.map((it) => ({
        ...it,
        id: `FRT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      }));
      finalItems = [...freightItems, ...freshItems];
    }

    onUpdateFreightItems(finalItems);
    AppStorage.saveFreightItems(finalItems);

    if (Object.keys(actualsToMerge).length > 0) {
      const mergedActuals = {
        ...actuals,
        ...actualsToMerge,
      };
      onUpdateActuals(mergedActuals);
      AppStorage.saveFreightActuals(mergedActuals);
    }

    const count = incomingItems.length;
    const sCount =
      meta?.shipmentCount ||
      new Set(incomingItems.map((i) => i.shipmentId)).size;
    const uCount =
      meta?.totalUnits ||
      incomingItems.reduce((sum, i) => sum + i.actualQty, 0);

    AppStorage.logAudit({
      targetType: 'Import',
      targetId: meta?.fileName || 'Freight Upload',
      action: `Freight Upload (${strategy})`,
      details: `头程表格导入 (${
        strategy === 'overwrite'
          ? '覆盖更新'
          : strategy === 'skip'
          ? '跳过重复'
          : '全部追加'
      })：处理 ${count} 条明细，涉及 ${sCount} 票货件，总件数 ${uCount}`,
    });

    setUploadFeedback(
      `成功按「${
        strategy === 'overwrite'
          ? '覆盖原数据'
          : strategy === 'skip'
          ? '跳过重复仅新增'
          : '全部追加'
      }」方式导入 ${count} 条出货明细（${sCount} 票货件，共 ${uCount} 件）`
    );

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handle file upload with duplicate inspection
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setIsUploading(true);
    setUploadFeedback(null);

    try {
      const result = await parseFreightExcelOrCsv(file);
      if (result.items.length === 0) {
        throw new Error('未在文件中读取到有效出货记录');
      }

      // Check if duplicate items exist
      const existingKeys = new Set(
        freightItems.map(
          (it) => `${it.shipmentId.toUpperCase()}_${it.sku.toUpperCase()}`
        )
      );
      const duplicateCount = result.items.filter((it) =>
        existingKeys.has(
          `${it.shipmentId.toUpperCase()}_${it.sku.toUpperCase()}`
        )
      ).length;

      if (duplicateCount > 0) {
        // Prompt user with Duplicate Modal
        setPendingUploadResult({
          items: result.items,
          actuals: result.actuals,
          fileName: file.name,
          shipmentCount: result.shipmentCount,
          totalUnits: result.totalUnits,
        });
        setIsDuplicateModalOpen(true);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      // No duplicates, execute directly
      executeImportFreightData('overwrite', result.items, result.actuals, {
        fileName: file.name,
        shipmentCount: result.shipmentCount,
        totalUnits: result.totalUnits,
      });
    } catch (err: any) {
      setUploadFeedback(`导入失败：${err.message || '文件解析错误'}`);
    } finally {
      setIsUploading(false);
      setTimeout(() => setUploadFeedback(null), 6000);
    }
  };

  // Handle saving a manual item (supports applying shipment-level updates to all items in shipment)
  const handleSaveManualItem = (
    item: FreightShippingItem,
    shipmentUpdates?: {
      unitPrice: number;
      channel: string;
      warehouse: string;
      shipDate: string;
      customsDeclarationType: 'STANDALONE' | 'MERGED' | 'EXEMPT';
      extraCategoriesCount: number;
      extraCategoryUnitPrice: number;
    }
  ) => {
    const existingIndex = freightItems.findIndex((it) => it.id === item.id);
    let updated: FreightShippingItem[];
    if (existingIndex >= 0) {
      updated = [...freightItems];
      updated[existingIndex] = item;
    } else {
      updated = [item, ...freightItems];
    }

    // 关键优化：整票货件固定属性（物流单价、渠道、报关模式、超品等）同步应用至该货件下所有商品
    if (shipmentUpdates) {
      updated = applyShipmentLevelUpdates(updated, {
        shipmentId: item.shipmentId,
        ...shipmentUpdates,
      });
    }

    onUpdateFreightItems(updated);
    AppStorage.saveFreightItems(updated);

    AppStorage.logAudit({
      targetType: 'Freight',
      targetId: item.shipmentId,
      action: existingIndex >= 0 ? 'Update Item' : 'Add Item',
      details: `头程明细：${item.shipmentId} SKU ${item.sku}，出货 ${item.actualQty} 件，计费重 ${item.totalChargeableWeight}kg${
        shipmentUpdates ? `（已同步整票单价 ¥${shipmentUpdates.unitPrice} 及货件属性）` : ''
      }`,
    });
  };

  // 针对整个货件一键更新物流属性（物流单价、渠道、目的仓、发货日、报关方式、关联货件、超品申报等）
  const handleSaveShipmentSettings = (payload: ShipmentLevelUpdatePayload) => {
    const updated = applyShipmentLevelUpdates(freightItems, payload);
    onUpdateFreightItems(updated);
    AppStorage.saveFreightItems(updated);

    // 同步更新业务货件列表对应基础字段
    const matchedShipment = shipments.find(
      (s) => s.id.toUpperCase() === payload.shipmentId.toUpperCase()
    );
    if (matchedShipment) {
      const targetId = payload.shipmentId.toUpperCase();
      const isMerged = payload.customsDeclarationType === 'MERGED';
      const explicitMergedIds = isMerged
        ? (payload.mergedCustomsShipmentIds || []).map((id) => id.toUpperCase())
        : [];
      const peerSet = new Set(explicitMergedIds);

      const updatedShipments = shipments.map((s) => {
        const sId = s.id.toUpperCase();
        if (sId === targetId) {
          return {
            ...s,
            channel: payload.channel || s.channel,
            destination: payload.warehouse || s.destination,
            fc: payload.warehouse || s.fc,
            shipDate: payload.shipDate || s.shipDate,
            customsDeclarationType: payload.customsDeclarationType || s.customsDeclarationType,
            isMergedCustoms: isMerged && explicitMergedIds.length > 0,
            mergedCustomsShipmentIds: explicitMergedIds,
          };
        }
        // If s was explicitly added as a peer to targetId, ensure mutual link
        if (peerSet.has(sId)) {
          const currentPeers = new Set((s.mergedCustomsShipmentIds || []).map((id) => id.toUpperCase()));
          currentPeers.add(targetId);
          explicitMergedIds.forEach((id) => {
            if (id !== sId) currentPeers.add(id);
          });
          currentPeers.delete(sId);
          return {
            ...s,
            isMergedCustoms: true,
            customsDeclarationType: 'MERGED' as const,
            mergedCustomsShipmentIds: Array.from(currentPeers),
          };
        }
        // If s was previously linked to targetId but was removed by the user, remove targetId
        if ((s.mergedCustomsShipmentIds || []).map((id) => id.toUpperCase()).includes(targetId)) {
          const remainingPeers = (s.mergedCustomsShipmentIds || []).filter(
            (id) => id.toUpperCase() !== targetId
          );
          return {
            ...s,
            mergedCustomsShipmentIds: remainingPeers,
            isMergedCustoms: remainingPeers.length > 0,
            customsDeclarationType:
              remainingPeers.length > 0 ? s.customsDeclarationType : ('STANDALONE' as const),
          };
        }
        return s;
      });
      onSyncToShipments(updatedShipments);
      AppStorage.saveShipments(updatedShipments);
    }

    AppStorage.logAudit({
      targetType: 'Freight',
      targetId: payload.shipmentId,
      action: 'Update Shipment Settings',
      details: `更新货件级配置：单价 ¥${payload.unitPrice}/kg，渠道 ${payload.channel}，仓位 ${payload.warehouse}，报关方式 ${payload.customsDeclarationType}，超品 ${payload.extraCategoriesCount || 0} 个`,
    });
  };

  // Delete single SKU item
  const handleDeleteItem = (itemId: string) => {
    const updated = freightItems.filter((it) => it.id !== itemId);
    onUpdateFreightItems(updated);
    AppStorage.saveFreightItems(updated);
  };

  // Delete entire shipment from freight list
  const handleDeleteShipment = (shipmentId: string) => {
    if (!confirm(`确定删除货件 ${shipmentId} 的全部头程出货明细吗？`)) return;
    const updated = freightItems.filter((it) => it.shipmentId !== shipmentId);
    onUpdateFreightItems(updated);
    AppStorage.saveFreightItems(updated);

    const updatedActuals = { ...actuals };
    delete updatedActuals[shipmentId];
    onUpdateActuals(updatedActuals);
    AppStorage.saveFreightActuals(updatedActuals);
  };

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto select-text">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".xlsx,.xls,.csv"
        className="hidden"
      />

      {/* Header with Title & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            头程费用管理
            <span className="text-xs font-normal text-slate-500 font-mono">
              ({currentMonthData.shipmentCount} 票货件 / {currentMonthData.totalUnits} 件出货)
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            月度出货费用核算 · 运费账单对比 · 实收核销（按箱规实重与体积重计费，单箱不足12kg按12kg计）
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => downloadFreightTemplate('xlsx')}
            title="下载头程出货明细与对账填写模板"
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            下载出货模板
          </button>

          <button
            onClick={() => exportFreightSummaryToExcel(monthlySummaries, freightItems, selectedMonth)}
            title="导出当前月度头程费用报表与对账数据"
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg border border-slate-200 flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            导出汇总报表
          </button>

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-semibold rounded-lg shadow-xs flex items-center gap-1.5 transition-all"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            {isUploading ? '正在解析...' : '上传头程出货表'}
          </button>

          {/* Compact hidden/icon quick access for syncing to shipments */}
          <button
            onClick={() => setIsSyncModalOpen(true)}
            disabled={freightItems.length === 0}
            title="提取/反向同步货件至货件管理"
            className="p-2 bg-white hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 border border-slate-200 hover:border-indigo-300 rounded-lg shadow-xs transition-all disabled:opacity-40 disabled:pointer-events-none"
            aria-label="反向同步至货件管理"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => {
              setEditingItem(null);
              setIsManualModalOpen(true);
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            录入出货明细
          </button>
        </div>
      </div>

      {/* Upload Feedback Toast */}
      {uploadFeedback && (
        <div
          className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
            uploadFeedback.includes('成功')
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {uploadFeedback.includes('成功') ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
          )}
          <span>{uploadFeedback}</span>
        </div>
      )}

      {/* Scalable Multi-Month Navigation Bar */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Year selector tabs (if more than 1 year exists) */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
              <CalendarRange className="w-3.5 h-3.5 text-blue-600" />
              年份筛选:
            </span>
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                onClick={() => setSelectedYear('all')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  selectedYear === 'all'
                    ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                全部年份
              </button>
              {availableYears.map((yr) => (
                <button
                  key={yr}
                  onClick={() => setSelectedYear(yr)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                    selectedYear === yr
                      ? 'bg-white text-blue-700 shadow-2xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {yr}年
                </button>
              ))}
            </div>
          </div>

          {/* Quick jump dropdown selector for 1-12+ months */}
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-xs font-medium">快速跳转月份:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">全部月份汇总 ({freightItems.length} 票明细)</option>
              {availableMonths.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.display} — {m.count} 票货件 (预估 ¥{Math.round(m.cost).toLocaleString()})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Scrollable Month Pills Strip with Navigation Arrows */}
        <div className="relative flex items-center pt-1 border-t border-slate-100">
          <button
            onClick={() => scrollMonths('left')}
            title="向左滚动月份"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 mr-2 flex-shrink-0 transition-colors"
            aria-label="向左滚动月份"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div
            ref={monthScrollRef}
            className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1 scroll-smooth flex-1"
          >
            <button
              onClick={() => setSelectedMonth('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 flex-shrink-0 ${
                selectedMonth === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
              }`}
            >
              <span>全部月份汇总</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                  selectedMonth === 'all' ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {freightItems.length}
              </span>
            </button>

            {displayedMonths.map((m) => (
              <button
                key={m.key}
                onClick={() => setSelectedMonth(m.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 flex-shrink-0 ${
                  selectedMonth === m.key
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200'
                }`}
              >
                <span>{m.display}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    selectedMonth === m.key
                      ? 'bg-blue-700 text-white'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {m.count} 票
                </span>
              </button>
            ))}

            {displayedMonths.length === 0 && (
              <span className="text-xs text-slate-400 italic py-1">所选年份暂无出货月份记录</span>
            )}
          </div>

          <button
            onClick={() => scrollMonths('right')}
            title="向右滚动月份"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 ml-2 flex-shrink-0 transition-colors"
            aria-label="向右滚动月份"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Summary KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            汇总出货货件
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1 font-mono">
            {currentMonthData.shipmentCount}
            <span className="text-xs font-normal text-slate-400 ml-1">票</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center justify-between">
            <span>{currentMonthData.monthDisplay}</span>
            {currentMonthSpecialStats.mixedShipmentCount > 0 && (
              <span className="text-[10px] text-indigo-600 font-medium">
                {currentMonthSpecialStats.mixedShipmentCount}票含混箱
              </span>
            )}
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            出货总件数 / 箱数
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1 font-mono">
            {currentMonthData.totalUnits}
            <span className="text-xs font-normal text-slate-400 ml-1">件</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 flex items-center justify-between">
            <span>共计 {currentMonthData.totalCartons} 箱</span>
            {currentMonthSpecialStats.totalMixedGroups > 0 && (
              <span className="text-[10px] text-indigo-600 font-medium">
                {currentMonthSpecialStats.totalMixedGroups}组混箱去重
              </span>
            )}
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            预估计费总重
          </div>
          <div className="text-xl font-bold text-blue-700 mt-1 font-mono">
            {currentMonthData.totalEstimatedChargeableWeight.toFixed(1)}
            <span className="text-xs font-normal text-slate-400 ml-1">kg</span>
          </div>
          <div className="text-[11px] text-blue-600/80 mt-0.5 flex items-center justify-between">
            <span>含体积重与保底</span>
            {currentMonthSpecialStats.min12kgShipmentCount > 0 && (
              <span className="text-[10px] text-purple-700 font-medium">
                {currentMonthSpecialStats.min12kgShipmentCount}票保底
              </span>
            )}
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            预估头程总费用
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1 font-mono">
            ¥{currentMonthData.totalEstimatedCost.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            运费 + 报关费 + 超品费
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            实际头程总费用
          </div>
          <div className="text-xl font-bold text-slate-900 mt-1 font-mono">
            {currentMonthData.totalActualCost > 0 ? (
              `¥${currentMonthData.totalActualCost.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            ) : (
              <span className="text-sm font-normal text-slate-400">待录入账单</span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            已对账 {currentMonthData.reconciledShipmentCount} / {currentMonthData.shipmentCount} 票
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            费用差额 (实际-预估)
          </div>
          <div className="text-xl font-bold mt-1 font-mono">
            {currentMonthData.totalActualCost > 0 ? (
              <span
                className={
                  currentMonthData.costDifference > 0
                    ? 'text-red-600'
                    : currentMonthData.costDifference < 0
                    ? 'text-emerald-600'
                    : 'text-slate-700'
                }
              >
                {currentMonthData.costDifference > 0 ? '+' : ''}
                ¥{currentMonthData.costDifference.toFixed(2)}
              </span>
            ) : (
              <span className="text-sm font-normal text-slate-400">--</span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {currentMonthData.totalActualCost > 0 ? (
              <span>偏差比例 {currentMonthData.costDifferencePercent > 0 ? '+' : ''}{currentMonthData.costDifferencePercent.toFixed(1)}%</span>
            ) : (
              '录入后自动核对'
            )}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索 Shipment ID / SKU / 仓库 / 渠道..."
              className="w-full pl-8.5 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 font-medium"
          >
            <option value="all">全部渠道</option>
            {uniqueChannels.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={reconcileFilter}
            onChange={(e) => setReconcileFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 font-medium"
          >
            <option value="all">全部对账状态</option>
            <option value="reconciled">已录入实际费用</option>
            <option value="pending">待录入对账</option>
            <option value="variance">存在费用偏差</option>
          </select>

          <select
            value={tagFilter}
            onChange={(e: any) => setTagFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-white text-slate-700 font-medium"
          >
            <option value="all">全部特性标记</option>
            <option value="mixed">仅看含混箱货件 (Mixed Boxes)</option>
            <option value="min12kg">仅看触发12kg保底 (Min 12kg)</option>
            <option value="merged">仅看合并/拼单报关 (Merged)</option>
            <option value="standalone">仅看独立报关 (¥350)</option>
            <option value="exempt">仅看免报关 (¥0)</option>
            <option value="extraCats">仅看含超品费 (Extra Categories)</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleExpandAll}
            className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            {expandedShipments.size === filteredShipments.length ? '收起全部明细' : '展开全部明细'}
          </button>
        </div>
      </div>

      {/* Shipment Breakdown Cards */}
      <div className="space-y-4">
        {filteredShipments.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3">
            <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <Calculator className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-semibold text-slate-700">暂无出货明细数据</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              您可以直接点击右上角“上传头程出货表”批量导入 Excel，或点击“录入出货明细”手工添加
            </p>
            <div className="pt-2 flex items-center justify-center gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm"
              >
                上传出货表
              </button>
            </div>
          </div>
        ) : (
          (showAllShipments ? filteredShipments : filteredShipments.slice(0, displayLimit)).map((shipment) => {
            const isExpanded = expandedShipments.has(shipment.shipmentId);
            const actualEntry = actuals[shipment.shipmentId] || {};
            const hasActual = shipment.actualCost !== undefined;
            const isOvercharged = (shipment.costDifference || 0) > 10;
            const isUndercharged = (shipment.costDifference || 0) < -10;

            const mixedGroupsInShipment = Array.from(
              new Set(
                shipment.items
                  .map((it) => it.mixedBoxGroup)
                  .filter(Boolean) as string[]
              )
            );
            const hasMixedBox = mixedGroupsInShipment.length > 0;
            const min12kgItemsCount = shipment.items.filter(
              (it) => it.chargeableType === 'MIN_12KG'
            ).length;

            return (
              <div
                key={shipment.shipmentId}
                className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden transition-all"
              >
                {/* Shipment Header Bar */}
                <div className="p-4 bg-slate-50/70 border-b border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      onClick={() => toggleExpand(shipment.shipmentId)}
                      className="text-slate-400 hover:text-slate-700 transition-colors p-0.5"
                    >
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    <div className="font-mono font-bold text-sm text-slate-900">
                      {shipment.shipmentId}
                    </div>

                    <span className="px-2 py-0.5 rounded-md bg-blue-100/80 text-blue-800 font-mono text-xs font-semibold">
                      {shipment.warehouse}
                    </span>

                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {shipment.shipDate}
                    </span>

                    <span className="text-xs px-2 py-0.5 rounded bg-slate-200/70 text-slate-700 font-medium">
                      {shipment.channel || shipment.items[0]?.channel || '快船'}
                    </span>

                    {/* 整票固定物流单价 */}
                    <span
                      className="text-xs px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 font-mono font-bold flex items-center gap-1 shadow-2xs"
                      title="整票货件固定物流单价（针对该货件全部商品统一适用）"
                    >
                      <DollarSign className="w-3 h-3 text-blue-600" />
                      ¥{shipment.unitPrice.toFixed(2)}/kg
                    </span>

                    {/* 混箱标示 */}
                    {hasMixedBox && (
                      <span
                        className="text-xs px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200 font-semibold flex items-center gap-1 shadow-2xs"
                        title={`包含 ${mixedGroupsInShipment.length} 组混装箱 (${mixedGroupsInShipment.join(', ')})。同混箱内的多个 SKU 共享同一物理箱规与实重，计费重与运费已自动去重只计一次。`}
                      >
                        <Layers className="w-3.5 h-3.5 text-indigo-600" />
                        包含混箱 ({mixedGroupsInShipment.length}组·箱重去重)
                      </span>
                    )}

                    {/* 报关标示 */}
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-md border font-semibold flex items-center gap-1 shadow-2xs ${
                        shipment.customsDeclarationType === 'EXEMPT' || shipment.customsFee === 0
                          ? 'bg-slate-100 text-slate-700 border-slate-200'
                          : shipment.isMergedCustoms
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                      title={
                        shipment.customsBatchShipmentCount && shipment.customsBatchShipmentCount > 1
                          ? `同批拼单合并报关 (${shipment.customsBatchShipmentCount}票关联货件拼单)，${
                              shipment.isCustomsBatchLeader ? '首票统一计入报关费 (¥175)' : '其余拼单关联货件免收重复报关费 (¥0)'
                            }`
                          : undefined
                      }
                    >
                      {shipment.customsBatchShipmentCount && shipment.customsBatchShipmentCount > 1 ? (
                        <Link2 className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <FileCheck className="w-3.5 h-3.5 text-slate-500" />
                      )}
                      {shipment.customsDeclarationType === 'EXEMPT'
                        ? '免报关 (¥0)'
                        : shipment.customsBatchShipmentCount && shipment.customsBatchShipmentCount > 1
                        ? shipment.isCustomsBatchLeader
                          ? `${shipment.isMergedCustoms ? '合并报关' : '独立报关'} (¥${shipment.customsFee}, 含${shipment.customsBatchShipmentCount}票拼单)`
                          : '同批拼单 (0元/费用由主票合并)'
                        : shipment.isMergedCustoms
                        ? '合并报关 (¥175)'
                        : '独立报关 (¥350)'}
                    </span>

                    {/* 12kg保底标示 */}
                    {(shipment.appliedMinimumRule || min12kgItemsCount > 0) && (
                      <span
                        className="text-xs px-2.5 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200 font-semibold flex items-center gap-1 shadow-2xs"
                        title={`该货件包含 ${min12kgItemsCount} 项商品单箱实重与体积重均不足 12kg，已按头程 12kg/箱 最低保底重量计费`}
                      >
                        <Scale className="w-3.5 h-3.5 text-purple-600" />
                        触发12kg保底 ({min12kgItemsCount}项)
                      </span>
                    )}

                    {/* 超品费标示 (整票收取 & 拼单批次合并收取) */}
                    {shipment.extraCategoryFee > 0 ? (
                      <span
                        className="text-xs px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-300 font-semibold flex items-center gap-1 shadow-2xs"
                        title={`超品申报数量 ${shipment.extraCategoriesCount || 0} 个 × 单价 ¥${shipment.extraCategoryUnitPrice || 30}。${
                          shipment.customsBatchShipmentCount && shipment.customsBatchShipmentCount > 1
                            ? `含 ${shipment.customsBatchShipmentCount} 票拼单整批合并计收，批次仅收一次`
                            : '整票货件统一适用'
                        }`}
                      >
                        <Tag className="w-3.5 h-3.5 text-amber-700" />
                        超品费 ¥{shipment.extraCategoryFee.toFixed(0)}
                        {shipment.customsBatchShipmentCount && shipment.customsBatchShipmentCount > 1 && (
                          <span className="text-[10px] text-amber-700 font-normal">
                            ({shipment.customsBatchShipmentCount}票拼单共享)
                          </span>
                        )}
                      </span>
                    ) : shipment.batchExtraCategoryFee &&
                      shipment.batchExtraCategoryFee > 0 &&
                      shipment.customsBatchShipmentCount &&
                      shipment.customsBatchShipmentCount > 1 &&
                      !shipment.isCustomsBatchLeader ? (
                      <span
                        className="text-xs px-2.5 py-0.5 rounded-md bg-amber-50/70 text-amber-800 border border-dashed border-amber-300 font-medium flex items-center gap-1"
                        title={`同批关联拼单共用申报单，整批超品费 ¥${shipment.batchExtraCategoryFee} 已由拼单主票合并收取，本票免收重复超品费`}
                      >
                        <Tag className="w-3.5 h-3.5 text-amber-600" />
                        拼单超品 (0元/已由主票合并)
                      </span>
                    ) : null}

                    {/* 编辑整票货件配置按钮 */}
                    <button
                      onClick={() => setEditingShipment(shipment)}
                      className="text-xs px-2.5 py-0.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold flex items-center gap-1 shadow-2xs transition-colors"
                      title="编辑该货件的固定物流单价、渠道、目的仓、报关方式及超品申报配置"
                    >
                      <Edit2 className="w-3 h-3" />
                      编辑货件配置
                    </button>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <div>
                      <span className="text-slate-500">出货：</span>
                      <span className="font-bold text-slate-800 font-mono">
                        {shipment.totalUnits} 件 / {shipment.totalCartons} 箱
                      </span>
                    </div>

                    <div>
                      <span className="text-slate-500">计费重：</span>
                      <span className="font-bold text-blue-700 font-mono">
                        {shipment.totalEstimatedChargeableWeight.toFixed(1)} kg
                      </span>
                    </div>

                    <div
                      title={`纯运费: ¥${shipment.estimatedFreightCost.toFixed(2)} + 报关费: ¥${shipment.customsFee} + 超品费: ¥${(shipment.extraCategoryFee || 0).toFixed(2)}`}
                    >
                      <span className="text-slate-500">预估总额：</span>
                      <span className="font-bold text-slate-900 font-mono">
                        ¥{shipment.totalEstimatedCost.toFixed(2)}
                      </span>
                    </div>

                    <button
                      onClick={() => handleDeleteShipment(shipment.shipmentId)}
                      title="删除此货件头程明细"
                      className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Actual vs Estimated Reconciliation Section */}
                <div className="p-4 bg-slate-50/30 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700">实际收费重:</span>
                      <div className="relative w-28">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="如 103.5"
                          value={actualEntry.actualChargeableWeight ?? ''}
                          onChange={(e) =>
                            handleUpdateShipmentActual(
                              shipment.shipmentId,
                              'actualChargeableWeight',
                              e.target.value
                            )
                          }
                          className="w-full px-2.5 py-1 text-xs font-mono border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 bg-white"
                        />
                        <span className="absolute right-2 top-1 text-[10px] text-slate-400">
                          kg
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-700">实际费用:</span>
                      <div className="relative w-32">
                        <input
                          type="number"
                          step="0.01"
                          placeholder="如 1573.06"
                          value={actualEntry.actualCost ?? ''}
                          onChange={(e) =>
                            handleUpdateShipmentActual(
                              shipment.shipmentId,
                              'actualCost',
                              e.target.value
                            )
                          }
                          className="w-full pl-5 pr-2.5 py-1 text-xs font-mono border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 bg-white font-semibold text-slate-900"
                        />
                        <span className="absolute left-2 top-1 text-[10px] text-slate-400">
                          ¥
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">对账备注:</span>
                      <input
                        type="text"
                        placeholder="如 货代账单核对无误"
                        value={actualEntry.reconciliationNotes || ''}
                        onChange={(e) =>
                          handleUpdateShipmentActual(
                            shipment.shipmentId,
                            'reconciliationNotes',
                            e.target.value
                          )
                        }
                        className="w-48 px-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-blue-500 bg-white"
                      />
                    </div>
                  </div>

                  {/* Variance Indicators */}
                  <div className="flex items-center gap-3 text-xs">
                    {hasActual ? (
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-[11px] text-slate-500">费用偏差 (实际 - 预估)</div>
                          <div
                            className={`font-mono font-bold ${
                              isOvercharged
                                ? 'text-red-600'
                                : isUndercharged
                                ? 'text-emerald-600'
                                : 'text-slate-700'
                            }`}
                          >
                            {(shipment.costDifference || 0) > 0 ? '+' : ''}
                            ¥{(shipment.costDifference || 0).toFixed(2)} (
                            {(shipment.costDifferencePercent || 0) > 0 ? '+' : ''}
                            {(shipment.costDifferencePercent || 0).toFixed(1)}%)
                          </div>
                        </div>

                        {shipment.weightDifference !== undefined && (
                          <div className="text-right pl-3 border-l border-slate-200">
                            <div className="text-[11px] text-slate-500">重量偏差</div>
                            <div className="font-mono text-slate-700 font-medium">
                              {shipment.weightDifference > 0 ? '+' : ''}
                              {shipment.weightDifference.toFixed(1)} kg
                            </div>
                          </div>
                        )}

                        <span
                          className={`px-2 py-1 rounded text-[11px] font-semibold border ${
                            Math.abs(shipment.costDifference || 0) < 1
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : isOvercharged
                              ? 'bg-red-50 text-red-800 border-red-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {Math.abs(shipment.costDifference || 0) < 1
                            ? '费用一致'
                            : isOvercharged
                            ? '实际费用偏高'
                            : '实际费用低于预估'}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic">
                        请在左侧输入货代账单实际收费重与费用完成对账
                      </span>
                    )}
                  </div>
                </div>

                {/* Collapsible SKU Breakdown Table */}
                {isExpanded && (
                  <div className="p-4 overflow-x-auto">
                    <div className="text-xs font-bold text-slate-800 mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>包含商品 SKU 明细 ({shipment.items.length} 项)</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingItem({
                              id: '',
                              shipmentId: shipment.shipmentId,
                              warehouse: shipment.warehouse,
                              shipDate: shipment.shipDate,
                              monthKey: extractMonthKey(shipment.shipDate),
                              sku: '',
                              productName: '',
                              actualQty: 100,
                              boxCount: 1,
                              boxWeight: 10,
                              boxLength: 40,
                              boxWidth: 30,
                              boxHeight: 20,
                              dimensionsText: '40*30*20',
                              volumetricWeightPerBox: 4,
                              chargeableWeightPerBox: 12,
                              totalChargeableWeight: 12,
                              chargeableType: 'MIN_12KG',
                              channel: shipment.channel || shipment.items[0]?.channel || '快船',
                              unitPrice: shipment.unitPrice,
                              isMergedCustoms: shipment.isMergedCustoms,
                              customsDeclarationType: shipment.customsDeclarationType,
                              extraCategoriesCount: shipment.extraCategoriesCount || 0,
                              extraCategoryUnitPrice: shipment.extraCategoryUnitPrice || 30,
                              extraCategoryFee: 0,
                              estimatedItemFreight: 0,
                            });
                            setIsManualModalOpen(true);
                          }}
                          className="px-2 py-0.5 text-[11px] font-semibold text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 flex items-center gap-1 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          添加商品明细
                        </button>
                      </div>
                      <span className="text-[11px] font-normal text-slate-500">
                        单箱体积重 = 长*宽*高/6000 | 计费重 = Max(实重, 体积重, 12kg) | 混箱产品重量与运费只在主项计费一次
                      </span>
                    </div>

                    <table className="w-full text-xs text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/50 text-slate-600 font-semibold">
                          <th className="py-2 px-2.5">商品 SKU</th>
                          <th className="py-2 px-2.5">品名标题</th>
                          <th className="py-2 px-2 text-right">出货数量</th>
                          <th className="py-2 px-2 text-right">件数/箱数</th>
                          <th className="py-2 px-2 text-right">单箱实重(kg)</th>
                          <th className="py-2 px-2 text-center">箱规长*宽*高(cm)</th>
                          <th className="py-2 px-2 text-right">单箱体积重(kg)</th>
                          <th className="py-2 px-2 text-right">单箱计费重(kg)</th>
                          <th className="py-2 px-2 text-center">计重方式</th>
                          <th className="py-2 px-2 text-center">混箱组</th>
                          <th className="py-2 px-2 text-right">单价(元/kg)</th>
                          <th className="py-2 px-2.5 text-right">该项预估运费(元)</th>
                          <th className="py-2 px-2 text-center">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {shipment.items.map((item) => {
                          const isSecondary = item.isSecondaryMixedItem || item.mixedBoxRole === 'SECONDARY';
                          const isPrimary = item.mixedBoxRole === 'PRIMARY';

                          return (
                            <tr
                              key={item.id}
                              className={`transition-colors ${
                                isSecondary ? 'bg-indigo-50/20 text-slate-600' : 'hover:bg-slate-50/60'
                              }`}
                            >
                              <td className="py-2 px-2.5 font-mono font-bold text-slate-900">
                                {item.sku}
                              </td>
                              <td className="py-2 px-2.5 max-w-xs truncate text-slate-700" title={item.productName}>
                                {item.productName}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-slate-800 font-medium">
                                {item.actualQty}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-slate-800">
                                {isSecondary ? (
                                  <span className="text-slate-400 font-normal" title="与混箱主项共用同一箱体">
                                    同箱共享
                                  </span>
                                ) : (
                                  item.boxCount
                                )}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-slate-800">
                                {isSecondary ? (
                                  <span className="text-slate-400 font-normal" title={`共享主项实重 ${item.boxWeight.toFixed(2)}kg`}>
                                    --
                                  </span>
                                ) : (
                                  item.boxWeight.toFixed(2)
                                )}
                              </td>
                              <td className="py-2 px-2 text-center font-mono text-slate-600">
                                {item.dimensionsText}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-slate-600">
                                {isSecondary ? (
                                  <span className="text-slate-400 font-normal">--</span>
                                ) : (
                                  item.volumetricWeightPerBox.toFixed(2)
                                )}
                              </td>
                              <td className="py-2 px-2 text-right font-mono font-bold text-blue-700">
                                {isSecondary ? (
                                  <span className="text-slate-400 font-normal">0.00</span>
                                ) : (
                                  item.chargeableWeightPerBox.toFixed(2)
                                )}
                              </td>
                              <td className="py-2 px-2 text-center">
                                {isSecondary ? (
                                  <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 text-[10px]">
                                    混箱共享
                                  </span>
                                ) : item.chargeableType === 'MIN_12KG' ? (
                                  <span className="px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 text-[10px] font-semibold">
                                    12kg保底
                                  </span>
                                ) : item.chargeableType === 'VOLUMETRIC' ? (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold">
                                    体积重大
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 text-[10px]">
                                    实重大
                                  </span>
                                )}
                              </td>
                              <td className="py-2 px-2 text-center font-mono text-slate-600">
                                {item.mixedBoxGroup ? (
                                  <span
                                    className={`px-1.5 py-0.2 rounded text-[10px] font-semibold border ${
                                      isPrimary
                                        ? 'bg-indigo-100 text-indigo-800 border-indigo-300 font-bold'
                                        : isSecondary
                                        ? 'bg-slate-100 text-slate-600 border-slate-300'
                                        : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                    }`}
                                    title={
                                      isPrimary
                                        ? '混箱主项：承担该混箱组物理箱数与运费计算'
                                        : '混箱副项：同箱共享实重与运费，不重复计费'
                                    }
                                  >
                                    MIX: {item.mixedBoxGroup} {isPrimary ? '(主项)' : isSecondary ? '(副项)' : ''}
                                  </span>
                                ) : (
                                  '--'
                                )}
                              </td>
                              <td className="py-2 px-2 text-right font-mono text-slate-700">
                                ¥{item.unitPrice.toFixed(2)}
                              </td>
                              <td className="py-2 px-2.5 text-right font-mono font-bold text-slate-900">
                                {isSecondary ? (
                                  <div className="flex flex-col items-end">
                                    <span className="text-slate-400 font-normal">¥0.00</span>
                                    <span className="text-[9px] text-slate-400 font-normal">(同箱已计)</span>
                                  </div>
                                ) : (
                                  `¥${item.estimatedItemFreight.toFixed(2)}`
                                )}
                              </td>
                              <td className="py-2 px-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingItem(item);
                                      setIsManualModalOpen(true);
                                    }}
                                    title="编辑"
                                    className="p-1 text-slate-400 hover:text-blue-600 rounded"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteItem(item.id)}
                                    title="删除"
                                    className="p-1 text-slate-400 hover:text-red-600 rounded"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* 15-Item Display Limit & Pagination / Show More Control */}
        {filteredShipments.length > 15 && (
          <div className="p-4 bg-white rounded-xl border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs">
            <div className="text-xs text-slate-600">
              当前显示{' '}
              <span className="font-bold text-slate-900 font-mono">
                {showAllShipments
                  ? filteredShipments.length
                  : Math.min(displayLimit, filteredShipments.length)}
              </span>{' '}
              / 共 <span className="font-bold text-slate-900 font-mono">{filteredShipments.length}</span> 票货件
            </div>

            <div className="flex items-center gap-2">
              {!showAllShipments && displayLimit < filteredShipments.length && (
                <button
                  onClick={() => setDisplayLimit((prev) => prev + 15)}
                  className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
                >
                  继续加载 15 条
                </button>
              )}

              <button
                onClick={() => {
                  setShowAllShipments(!showAllShipments);
                  if (showAllShipments) setDisplayLimit(15);
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                {showAllShipments ? '折叠为默认 15 条' : `展开全部 (${filteredShipments.length} 条)`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Manual Item Add/Edit Modal */}
      {isManualModalOpen && (
        <FreightManualItemModal
          isOpen={isManualModalOpen}
          onClose={() => {
            setIsManualModalOpen(false);
            setEditingItem(null);
          }}
          onSaveItem={handleSaveManualItem}
          initialItem={editingItem}
        />
      )}

      {/* Reverse Sync to Shipment Management Modal */}
      {isSyncModalOpen && (
        <FreightSyncModal
          isOpen={isSyncModalOpen}
          onClose={() => setIsSyncModalOpen(false)}
          freightItems={freightItems}
          existingShipments={shipments}
          inventory={inventory}
          products={products}
          onSyncToShipments={onSyncToShipments}
        />
      )}

      {/* Shipment Level Settings Edit Modal */}
      {editingShipment && (
        <FreightShipmentEditModal
          isOpen={!!editingShipment}
          onClose={() => setEditingShipment(null)}
          shipment={editingShipment}
          allFreightItems={freightItems}
          onSave={handleSaveShipmentSettings}
        />
      )}

      {/* Freight Duplicate Upload Resolution Modal */}
      {isDuplicateModalOpen && pendingUploadResult && (
        <FreightDuplicateModal
          isOpen={isDuplicateModalOpen}
          onClose={() => {
            setIsDuplicateModalOpen(false);
            setPendingUploadResult(null);
          }}
          incomingItems={pendingUploadResult.items}
          existingItems={freightItems}
          actualsToMerge={pendingUploadResult.actuals}
          onConfirm={(strategy, incomingItems, actualsToMerge) => {
            setIsDuplicateModalOpen(false);
            executeImportFreightData(strategy, incomingItems, actualsToMerge, {
              fileName: pendingUploadResult.fileName,
              shipmentCount: pendingUploadResult.shipmentCount,
              totalUnits: pendingUploadResult.totalUnits,
            });
            setPendingUploadResult(null);
          }}
        />
      )}
    </div>
  );
};
