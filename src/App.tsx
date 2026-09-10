import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Sidebar, NavTab } from './components/Sidebar';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { ShipmentManagementView } from './components/ShipmentManagementView';
import { ReceivingDiscrepancyView } from './components/ReceivingDiscrepancyView';
import { CaseManagementView } from './components/CaseManagementView';
import { InventoryManagementView } from './components/InventoryManagementView';
import { InventoryAlertsView } from './components/InventoryAlertsView';
import { DataImportView } from './components/DataImportView';
import { DataQualityView } from './components/DataQualityView';
import { HistoryLedgerView } from './components/HistoryLedgerView';
import { SettingsView } from './components/SettingsView';
import { FreightSummaryView } from './components/FreightSummaryView';

import { ShipmentDetailDrawer } from './components/ShipmentDetailDrawer';
import { SkuDetailDrawer } from './components/SkuDetailDrawer';
import { ManualShipmentModal } from './components/ManualShipmentModal';
import { CaseModal } from './components/CaseModal';
import { ProductSupplementModal } from './components/ProductSupplementModal';
import { DataActionModal, DataActionType } from './components/DataActionModal';
import { FreightSyncModal } from './components/FreightSyncModal';

import { AppStorage } from './utils/storage';
import {
  Shipment,
  ShipmentItem,
  InventoryItem,
  CaseRecord,
  InventoryLedgerEntry,
  AuditLog,
  AnomalyItem,
  Product,
  AppSettings,
  ImportPreviewResult,
  FreightShippingItem,
} from './types';
import {
  calculateShipmentMetrics,
  detectAllAnomalies,
  calculateAllInventoryMetrics,
  harmonizeCustomsBatchAssociations,
} from './utils/statusCalculator';
import { syncShipmentsToFreightItems } from './utils/freightCalculator';
import { getTodayString } from './utils/dateUtils';

export default function App() {
  // Navigation & Global UI States
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [globalSearch, setGlobalSearch] = useState<string>('');

  // Primary Data States
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [ledger, setLedger] = useState<InventoryLedgerEntry[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<AppSettings>(AppStorage.getSettings());
  const [freightItems, setFreightItems] = useState<FreightShippingItem[]>([]);
  const [freightActuals, setFreightActuals] = useState<
    Record<
      string,
      {
        actualChargeableWeight?: number;
        actualCost?: number;
        reconciliationNotes?: string;
      }
    >
  >({});

  // Drawers & Modals States
  const [selectedShipmentId, setSelectedShipmentId] = useState<string | null>(null);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [isManualModalOpen, setIsManualModalOpen] = useState<boolean>(false);
  const [manualModalMode, setManualModalMode] = useState<'manual' | 'batch'>('manual');
  const [shipmentToEdit, setShipmentToEdit] = useState<Shipment | null>(null);
  const [isCaseModalOpen, setIsCaseModalOpen] = useState<boolean>(false);
  const [caseTargetShipment, setCaseTargetShipment] = useState<Shipment | null>(null);
  const [caseToEdit, setCaseToEdit] = useState<CaseRecord | null>(null);
  const [isProductSupplementOpen, setIsProductSupplementOpen] = useState<boolean>(false);
  const [supplementTargetShipment, setSupplementTargetShipment] = useState<Shipment | null>(null);
  const [isFreightSyncOpen, setIsFreightSyncOpen] = useState<boolean>(false);

  // Data Action Modal & Toast
  const [dataActionModalType, setDataActionModalType] = useState<DataActionType>(null);
  const [isDemo, setIsDemo] = useState<boolean>(AppStorage.getIsDemo());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 4000);
  };

  // Initialize Data on Load
  const reloadData = useCallback(() => {
    AppStorage.initialize();
    const rawShipments = AppStorage.getShipments();
    const rawInventory = AppStorage.getInventory();
    const rawCases = AppStorage.getCases();
    const rawLedger = AppStorage.getLedger();
    const rawAudit = AppStorage.getAuditLogs();
    const rawProducts = AppStorage.getProducts();
    const rawSettings = AppStorage.getSettings();
    const rawIsDemo = AppStorage.getIsDemo();
    const rawFreightItems = AppStorage.getFreightItems();
    const rawFreightActuals = AppStorage.getFreightActuals();

    // Recalculate metrics for all shipments based on current date
    const calculatedShipments = rawShipments.map((s) => calculateShipmentMetrics(s));
    const calculatedInventory = calculateAllInventoryMetrics(rawInventory, calculatedShipments, rawCases);
    const detectedAnomalies = detectAllAnomalies(calculatedShipments, calculatedInventory);

    // Sync any shipment edits (such as shipDate / monthly buckets) to Freight Items
    const { hasChanges: hasFreightSync, updatedItems: syncedFreightItems } =
      syncShipmentsToFreightItems(rawFreightItems, calculatedShipments);
    const finalFreightItems = hasFreightSync ? syncedFreightItems : rawFreightItems;
    if (hasFreightSync) {
      AppStorage.saveFreightItems(finalFreightItems);
    }

    setShipments(calculatedShipments);
    setInventory(calculatedInventory);
    setCases(rawCases);
    setLedger(rawLedger);
    setAuditLogs(rawAudit);
    setAnomalies(detectedAnomalies);
    setProducts(rawProducts);
    setSettings(rawSettings);
    setIsDemo(rawIsDemo);
    setFreightItems(finalFreightItems);
    setFreightActuals(rawFreightActuals);
  }, []);

  useEffect(() => {
    reloadData();
  }, [reloadData]);

  // Recalculate inventory projection when shipments or cases change
  const refreshInventoryProjections = useCallback(
    (currentShipments: Shipment[], currentInventory: InventoryItem[], currentCases?: CaseRecord[]) => {
      const activeCases = currentCases || AppStorage.getCases();
      const updated = calculateAllInventoryMetrics(currentInventory, currentShipments, activeCases);

      setInventory(updated);
      AppStorage.saveInventory(updated);
    },
    []
  );

  // Helper to synchronize any updated shipment fields (like shipDate / month / FC) to Freight Items
  const syncShipmentsWithFreight = useCallback(
    (targetShipments: Shipment | Shipment[]) => {
      setFreightItems((prevFreight) => {
        const { hasChanges, updatedItems } = syncShipmentsToFreightItems(prevFreight, targetShipments);
        if (hasChanges) {
          AppStorage.saveFreightItems(updatedItems);
          return updatedItems;
        }
        return prevFreight;
      });
    },
    []
  );

  // Handlers for Save / Edit / Delete Shipment
  const handleSaveShipment = (newOrUpdated: Shipment) => {
    const calculated = calculateShipmentMetrics(newOrUpdated);
    const existingIndex = shipments.findIndex((s) => s.id === calculated.id);

    let updatedList: Shipment[];
    if (existingIndex >= 0) {
      updatedList = [...shipments];
      updatedList[existingIndex] = calculated;
      AppStorage.logAudit({
        targetType: 'Shipment',
        targetId: calculated.id,
        action: 'Update Shipment',
        details: `手动更新货件信息，发货日期: ${calculated.shipDate || '未设置'}，渠道: ${calculated.channel || calculated.carrier || '默认'}，包含 ${calculated.items?.length || 0} 个商品项`,
      });
    } else {
      updatedList = [calculated, ...shipments];
      AppStorage.logAudit({
        targetType: 'Shipment',
        targetId: calculated.id,
        action: 'Create Shipment',
        details: `手动创建新货件，发货总计 ${calculated.totalShipQty} 件，渠道: ${calculated.channel || calculated.carrier || '默认'}`,
      });
    }

    // Symmetrically sync mutual peer links and unlinks for explicitly configured customs batch peers
    const targetId = calculated.id.trim();
    const explicitPeerSet = new Set((calculated.mergedCustomsShipmentIds || []).map((id) => id.trim()));

    updatedList = updatedList.map((other) => {
      if (other.id === targetId) return other;

      // If other is in the target's explicit peer set, ensure mutual link
      if (explicitPeerSet.has(other.id)) {
        const currentPeers = new Set(other.mergedCustomsShipmentIds || []);
        currentPeers.add(targetId);
        return {
          ...other,
          isMergedCustoms: true,
          customsDeclarationType: 'MERGED' as const,
          mergedCustomsShipmentIds: Array.from(currentPeers),
        };
      }

      // If other was previously linked to targetId but was removed by the user, remove targetId
      if (other.mergedCustomsShipmentIds && other.mergedCustomsShipmentIds.includes(targetId)) {
        const remainingPeers = other.mergedCustomsShipmentIds.filter((id) => id !== targetId);
        return {
          ...other,
          isMergedCustoms: remainingPeers.length > 0,
          customsDeclarationType: remainingPeers.length > 0 ? other.customsDeclarationType : ('STANDALONE' as const),
          mergedCustomsShipmentIds: remainingPeers,
        };
      }

      return other;
    });

    // Harmonize customs batch links across all shipments (strictly manual associations, never auto-forced)
    const harmonizedList = harmonizeCustomsBatchAssociations(updatedList);

    setShipments(harmonizedList);
    AppStorage.saveShipments(harmonizedList);
    refreshInventoryProjections(harmonizedList, inventory);

    const freshAnomalies = detectAllAnomalies(harmonizedList, inventory);
    setAnomalies(freshAnomalies);
    AppStorage.saveAnomalies(freshAnomalies);

    // Sync shipDate/FC/carrier/channel/product titles to Freight summary
    syncShipmentsWithFreight(calculated);
  };

  const handleBatchSaveShipments = (newShipments: Shipment[], overwrite = true) => {
    let updatedList = [...shipments];
    const calculatedList: Shipment[] = [];

    newShipments.forEach((newShp) => {
      const calculated = calculateShipmentMetrics(newShp);
      calculatedList.push(calculated);
      const existingIdx = updatedList.findIndex((s) => s.id === calculated.id);

      if (existingIdx >= 0) {
        if (overwrite) {
          updatedList[existingIdx] = calculated;
        }
      } else {
        updatedList = [calculated, ...updatedList];
      }
    });

    // Harmonize customs batch links across all shipments (strictly manual associations, never auto-forced)
    const harmonizedList = harmonizeCustomsBatchAssociations(updatedList);

    setShipments(harmonizedList);
    AppStorage.saveShipments(harmonizedList);
    refreshInventoryProjections(harmonizedList, inventory);

    const freshAnomalies = detectAllAnomalies(harmonizedList, inventory);
    setAnomalies(freshAnomalies);
    AppStorage.saveAnomalies(freshAnomalies);

    // Sync shipDate/FC/carrier/channel/product titles to Freight summary
    syncShipmentsWithFreight(calculatedList);

    AppStorage.logAudit({
      targetType: 'Shipment',
      targetId: `${newShipments.length} 票批量导入`,
      action: 'Batch Import Shipments',
      details: `批量表格成功导入 ${newShipments.length} 票货件`,
    });
  };

  const handleSaveSupplementItems = (shipmentId: string, updatedItems: ShipmentItem[]) => {
    const existingIndex = shipments.findIndex((s) => s.id === shipmentId);
    if (existingIndex < 0) return;

    const originalShipment = shipments[existingIndex];
    const newShipmentData: Shipment = {
      ...originalShipment,
      items: updatedItems,
    };

    const calculated = calculateShipmentMetrics(newShipmentData);
    const updatedList = [...shipments];
    updatedList[existingIndex] = calculated;

    setShipments(updatedList);
    AppStorage.saveShipments(updatedList);
    refreshInventoryProjections(updatedList, inventory);

    const freshAnomalies = detectAllAnomalies(updatedList, inventory);
    setAnomalies(freshAnomalies);
    AppStorage.saveAnomalies(freshAnomalies);

    // Sync product titles to Freight summary
    syncShipmentsWithFreight(calculated);

    AppStorage.logAudit({
      targetType: 'Shipment',
      targetId: shipmentId,
      action: 'Supplement Shipment SKUs',
      details: `为货件 ${shipmentId} 补充/更新了 ${updatedItems.length} 个商品项及差异标注`,
    });
  };

  const handleDeleteShipment = (shipmentId: string) => {
    const updated = shipments.filter((s) => s.id !== shipmentId);
    setShipments(updated);
    AppStorage.saveShipments(updated);
    refreshInventoryProjections(updated, inventory);

    AppStorage.logAudit({
      targetType: 'Shipment',
      targetId: shipmentId,
      action: 'Delete Shipment',
      details: `删除了货件 ${shipmentId}`,
    });

    if (selectedShipmentId === shipmentId) {
      setSelectedShipmentId(null);
    }
  };

  const handleBatchDeleteShipments = (shipmentIds: string[]) => {
    const updated = shipments.filter((s) => !shipmentIds.includes(s.id));
    setShipments(updated);
    AppStorage.saveShipments(updated);
    refreshInventoryProjections(updated, inventory);

    AppStorage.logAudit({
      targetType: 'Shipment',
      targetId: `${shipmentIds.length} Shipments`,
      action: 'Batch Delete Shipments',
      details: `批量删除了 ${shipmentIds.join(', ')}`,
    });
  };

  // Handlers for Save Case
  const handleSaveCase = (caseRecord: CaseRecord) => {
    const existingIndex = cases.findIndex((c) => c.id === caseRecord.id);
    let updatedCases: CaseRecord[];

    if (existingIndex >= 0) {
      updatedCases = [...cases];
      updatedCases[existingIndex] = caseRecord;
    } else {
      updatedCases = [caseRecord, ...cases];
    }

    setCases(updatedCases);
    AppStorage.saveCases(updatedCases);

    // Also update associated shipment's case status & ID
    const matchedShipment = shipments.find((s) => s.id === caseRecord.shipmentId);
    if (matchedShipment) {
      const updatedShipment = calculateShipmentMetrics({
        ...matchedShipment,
        caseId: caseRecord.id,
        caseStatus: caseRecord.status,
      });

      const updatedShipments = shipments.map((s) =>
        s.id === updatedShipment.id ? updatedShipment : s
      );
      setShipments(updatedShipments);
      AppStorage.saveShipments(updatedShipments);
      refreshInventoryProjections(updatedShipments, inventory, updatedCases);
    } else {
      refreshInventoryProjections(shipments, inventory, updatedCases);
    }

    AppStorage.logAudit({
      targetType: 'Case',
      targetId: caseRecord.id,
      action: 'Save Case',
      details: `更新 Case 状态为 ${caseRecord.status}，索赔已补录 ${caseRecord.resolutionQty || 0} 件`,
    });
  };

  // Handlers for Inventory Update
  const handleUpdateInventoryItem = (item: InventoryItem) => {
    const updated = inventory.map((i) => (i.sku === item.sku ? item : i));
    const reCalculated = calculateAllInventoryMetrics(updated, shipments, cases);
    setInventory(reCalculated);
    AppStorage.saveInventory(reCalculated);

    AppStorage.logAudit({
      targetType: 'Inventory',
      targetId: item.sku,
      action: 'Update Safety Stock',
      details: `调整安全库存阈值为 ${item.safetyStock}`,
    });
  };

  // Bulk update inventory and product catalog from user manual uploaded product table
  const handleBulkUpdateInventory = (uploadedItems: InventoryItem[]) => {
    const reCalculated = calculateAllInventoryMetrics(uploadedItems, shipments, cases);
    setInventory(reCalculated);
    AppStorage.saveInventory(reCalculated);

    // Sync product table as well
    const prodMap = new Map<string, Product>();
    products.forEach((p) => prodMap.set(p.sku.toUpperCase(), p));
    uploadedItems.forEach((it) => {
      const existing = prodMap.get(it.sku.toUpperCase());
      if (existing) {
        prodMap.set(it.sku.toUpperCase(), {
          ...existing,
          productName: it.productName || existing.productName,
          itemId: it.itemId || existing.itemId,
          productType: it.productType || existing.productType,
          gtin: it.gtin || existing.gtin,
          safetyStock: it.safetyStock || existing.safetyStock,
        });
      } else {
        prodMap.set(it.sku.toUpperCase(), {
          sku: it.sku,
          productName: it.productName || it.sku,
          itemId: it.itemId || `WMT-ITEM-${Math.floor(100000 + Math.random() * 900000)}`,
          productType: it.productType || 'General',
          gtin: it.gtin,
          safetyStock: it.safetyStock || 50,
        });
      }
    });

    const updatedProductList = Array.from(prodMap.values());
    setProducts(updatedProductList);
    AppStorage.saveProducts(updatedProductList);

    const freshAnomalies = detectAllAnomalies(shipments, reCalculated);
    setAnomalies(freshAnomalies);
    AppStorage.saveAnomalies(freshAnomalies);

    AppStorage.logAudit({
      targetType: 'Inventory',
      targetId: `${uploadedItems.length} SKUs`,
      action: 'Bulk Upload Product & Inventory',
      details: `成功上传并更新完整产品表及可用在库数（共 ${uploadedItems.length} 个 SKU）`,
    });
  };

  // Handlers for Import Execution
  const handleExecuteImport = (result: ImportPreviewResult) => {
    // 1. Merge shipments
    const shipmentMap = new Map<string, Shipment>();
    shipments.forEach((s) => shipmentMap.set(s.id, s));

    result.newShipments.forEach((s) => shipmentMap.set(s.id, s));
    result.updatedShipments.forEach((s) => shipmentMap.set(s.id, s));

    const finalShipments = Array.from(shipmentMap.values()).map((s) =>
      calculateShipmentMetrics(s)
    );

    // 2. Merge Inventory
    const invMap = new Map<string, InventoryItem>();
    inventory.forEach((i) => invMap.set(i.sku, i));
    result.updatedInventory.forEach((i) => invMap.set(i.sku, i));
    const finalInventory = Array.from(invMap.values());

    setShipments(finalShipments);
    AppStorage.saveShipments(finalShipments);

    refreshInventoryProjections(finalShipments, finalInventory);

    // 3. Log Audit
    AppStorage.logAudit({
      targetType: 'Data Import',
      targetId: result.reportType,
      action: 'Execute Report Import',
      details: `成功导入报表，新增 ${result.newShipments.length} 票货件，更新 ${result.updatedShipments.length} 票货件`,
    });

    // 4. Update ledger and anomalies
    const freshAnomalies = detectAllAnomalies(finalShipments, finalInventory);
    setAnomalies(freshAnomalies);
    AppStorage.saveAnomalies(freshAnomalies);

    // Jump to shipments tab
    setCurrentTab('shipments');
  };

  // Reset Demo
  const handleExecuteResetDemo = () => {
    AppStorage.resetDemoData();
    reloadData();
    showToast('⚡ 沃尔玛业务参考数据已成功加载（包含 8 大典型业务场景与真实货件）');
  };

  // Clear All
  const handleExecuteClearAllData = () => {
    AppStorage.clearAllData();
    reloadData();
    showToast('🗑️ 已清空所有业务数据，系统已重置为空白就绪状态');
  };

  // JSON Export / Import
  const handleExportJsonBackup = () => {
    const jsonStr = AppStorage.exportAllDataAsJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Walmart_Inventory_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJsonBackup = (jsonContent: string) => {
    const success = AppStorage.importDataFromJson(jsonContent);
    if (success) {
      alert('备份数据导入恢复成功！');
      reloadData();
    } else {
      alert('备份文件格式解析失败，请检查 JSON 结构');
    }
  };

  // Active Shipment & Sku for Drawer Lookups
  const activeShipment = useMemo(() => {
    return shipments.find((s) => s.id === selectedShipmentId) || null;
  }, [shipments, selectedShipmentId]);

  const activeSkuInventory = useMemo(() => {
    return inventory.find((i) => i.sku === selectedSku);
  }, [inventory, selectedSku]);

  const linkedShipmentsForSku = useMemo(() => {
    if (!selectedSku) return [];
    return shipments.filter((s) => s.items?.some((it) => it.sku === selectedSku));
  }, [shipments, selectedSku]);

  // Derived Alerts for Header & Badges
  const urgentCases = useMemo(() => {
    return shipments.filter(
      (s) =>
        s.totalDiscrepancyQty > 0 &&
        s.arrivalDate &&
        s.daysUntilCase !== undefined &&
        s.daysUntilCase === 0 &&
        s.caseStatus !== 'Opened' &&
        s.caseStatus !== 'In Review' &&
        s.caseStatus !== 'Resolved'
    );
  }, [shipments]);

  const overdueCases = useMemo(() => {
    return shipments.filter(
      (s) =>
        s.totalDiscrepancyQty > 0 &&
        s.arrivalDate &&
        s.daysUntilCase !== undefined &&
        s.daysUntilCase < 0 &&
        s.caseStatus !== 'Opened' &&
        s.caseStatus !== 'In Review' &&
        s.caseStatus !== 'Resolved'
    );
  }, [shipments]);

  const approachingCases = useMemo(() => {
    return shipments.filter(
      (s) =>
        s.totalDiscrepancyQty > 0 &&
        s.arrivalDate &&
        s.daysUntilCase !== undefined &&
        s.daysUntilCase > 0 &&
        s.daysUntilCase <= 3
    );
  }, [shipments]);

  const lowStockCount = useMemo(() => {
    return inventory.filter((i) => i.available < i.safetyStock).length;
  }, [inventory]);

  const discrepancyCount = useMemo(() => {
    return shipments.filter((s) => s.totalDiscrepancyQty > 0).length;
  }, [shipments]);

  const activeCaseCount = useMemo(() => {
    return cases.filter(
      (c) => c.status === 'Opened' || c.status === 'In Review' || c.status === 'Eligible'
    ).length;
  }, [cases]);

  // Handle sync freight extracted shipments to Shipment management
  const handleSyncFreightToShipments = useCallback(
    (syncedShipments: Shipment[]) => {
      setShipments((prevShipments) => {
        const map = new Map<string, Shipment>();
        prevShipments.forEach((s) => map.set(s.id.toUpperCase(), s));
        syncedShipments.forEach((s) => {
          const calculated = calculateShipmentMetrics(s);
          map.set(s.id.toUpperCase(), calculated);
        });
        const merged = Array.from(map.values());
        AppStorage.saveShipments(merged);
        refreshInventoryProjections(merged, inventory);
        const newAnomalies = detectAllAnomalies(merged, inventory);
        setAnomalies(newAnomalies);
        return merged;
      });

      AppStorage.logAudit({
        targetType: 'Shipment',
        targetId: `${syncedShipments.length} 票头程提取`,
        action: 'Freight Reverse Sync',
        details: `成功从头程费用汇总表中反向提取并同步 ${syncedShipments.length} 票货件`,
      });

      showToast(`成功提取同步 ${syncedShipments.length} 票货件至货件管理`);
    },
    [inventory, refreshInventoryProjections]
  );

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 text-slate-900 font-sans antialiased relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-6 z-50 animate-in fade-in slide-in-from-top-2 duration-300 pointer-events-none">
          <div className="bg-slate-900 text-white text-xs font-medium px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 border border-slate-700">
            <span>{toastMessage}</span>
          </div>
        </div>
      )}

      {/* 1. Left Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          setCurrentTab(tab);
          setSelectedShipmentId(null);
          setSelectedSku(null);
        }}
        badgeCounts={{
          shipments: shipments.length,
          discrepancies: discrepancyCount,
          cases: activeCaseCount,
          inventoryAlerts: lowStockCount,
          dataQuality: anomalies.filter((a) => a.level === 'critical').length,
        }}
        onResetDemo={() => setDataActionModalType('load-demo')}
        onClearAllData={() => setDataActionModalType('clear-all')}
      />

      {/* 2. Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <Header
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          globalSearch={globalSearch}
          onSearchChange={setGlobalSearch}
          todayDateStr={getTodayString()}
          isDemo={isDemo}
          onResetDemo={() => setDataActionModalType('load-demo')}
          onClearAllData={() => setDataActionModalType('clear-all')}
          onOpenNewShipmentModal={() => {
            setShipmentToEdit(null);
            setIsManualModalOpen(true);
          }}
          onNavigateToImport={() => setCurrentTab('data-import')}
          urgentCases={urgentCases}
          overdueCases={overdueCases}
          approachingCases={approachingCases}
          lowStockCount={lowStockCount}
          anomalies={anomalies}
          onSelectShipment={(id) => setSelectedShipmentId(id)}
        />

        {/* Dynamic View Container */}
        <main className="flex-1 overflow-y-auto bg-slate-100/70">
          {currentTab === 'dashboard' && (
            <DashboardView
              shipments={shipments}
              inventory={inventory}
              cases={cases}
              anomalies={anomalies}
              onSelectTab={setCurrentTab}
              onSelectShipment={(id) => setSelectedShipmentId(id)}
              onSelectSku={(sku) => setSelectedSku(sku)}
              onOpenNewShipmentModal={() => {
                setShipmentToEdit(null);
                setIsManualModalOpen(true);
              }}
              onOpenCaseModal={(shp) => {
                setCaseTargetShipment(shp);
                setCaseToEdit(null);
                setIsCaseModalOpen(true);
              }}
              onResetDemo={() => setDataActionModalType('load-demo')}
              onClearAllData={() => setDataActionModalType('clear-all')}
            />
          )}

          {currentTab === 'shipments' && (
            <ShipmentManagementView
              shipments={shipments}
              searchQuery={globalSearch}
              onSearchChange={setGlobalSearch}
              onSelectShipment={(id) => setSelectedShipmentId(id)}
              onOpenNewShipmentModal={(shp, mode) => {
                setShipmentToEdit(shp || null);
                setManualModalMode(mode || 'manual');
                setIsManualModalOpen(true);
              }}
              onOpenCaseModal={(shp) => {
                setCaseTargetShipment(shp);
                setCaseToEdit(null);
                setIsCaseModalOpen(true);
              }}
              onOpenProductSupplement={(shp) => {
                setSupplementTargetShipment(shp);
                setIsProductSupplementOpen(true);
              }}
              onDeleteShipment={handleDeleteShipment}
              onBatchDeleteShipments={handleBatchDeleteShipments}
              onOpenFreightSync={() => setIsFreightSyncOpen(true)}
            />
          )}

          {currentTab === 'freight' && (
            <FreightSummaryView
              freightItems={freightItems}
              actuals={freightActuals}
              onUpdateFreightItems={(items) => {
                setFreightItems(items);
                AppStorage.saveFreightItems(items);
              }}
              onUpdateActuals={(act) => {
                setFreightActuals(act);
                AppStorage.saveFreightActuals(act);
              }}
              shipments={shipments}
              inventory={inventory}
              products={products}
              onSyncToShipments={handleSyncFreightToShipments}
            />
          )}

          {currentTab === 'discrepancies' && (
            <ReceivingDiscrepancyView
              shipments={shipments}
              onSelectShipment={(id) => setSelectedShipmentId(id)}
              onOpenCaseModal={(shp) => {
                setCaseTargetShipment(shp);
                setCaseToEdit(null);
                setIsCaseModalOpen(true);
              }}
              onOpenProductSupplement={(shp) => {
                setSupplementTargetShipment(shp);
                setIsProductSupplementOpen(true);
              }}
            />
          )}

          {currentTab === 'cases' && (
            <CaseManagementView
              cases={cases}
              shipments={shipments}
              onOpenCaseModal={(shp, existingCase) => {
                setCaseTargetShipment(shp);
                setCaseToEdit(existingCase || null);
                setIsCaseModalOpen(true);
              }}
              onSelectShipment={(id) => setSelectedShipmentId(id)}
            />
          )}

          {currentTab === 'inventory' && (
            <InventoryManagementView
              inventory={inventory}
              cases={cases}
              shipments={shipments}
              onSelectSku={(sku) => setSelectedSku(sku)}
              onUpdateInventoryItem={handleUpdateInventoryItem}
              onBulkUpdateInventory={handleBulkUpdateInventory}
            />
          )}

          {currentTab === 'inventory-alerts' && (
            <InventoryAlertsView
              inventory={inventory}
              onSelectSku={(sku) => setSelectedSku(sku)}
              onOpenNewShipmentModal={() => {
                setShipmentToEdit(null);
                setIsManualModalOpen(true);
              }}
            />
          )}

          {currentTab === 'data-import' && (
            <DataImportView
              existingShipments={shipments}
              existingInventory={inventory}
              onExecuteImport={handleExecuteImport}
              onDone={() => setCurrentTab('shipments')}
              onResetDemo={() => setDataActionModalType('load-demo')}
              onClearAllData={() => setDataActionModalType('clear-all')}
            />
          )}

          {currentTab === 'data-quality' && (
            <DataQualityView
              anomalies={anomalies}
              shipments={shipments}
              onSelectShipment={(id) => setSelectedShipmentId(id)}
              onRefreshQualityCheck={reloadData}
            />
          )}

          {currentTab === 'history-ledger' && (
            <HistoryLedgerView ledger={ledger} auditLogs={auditLogs} />
          )}

          {currentTab === 'settings' && (
            <SettingsView
              settings={settings}
              onUpdateSettings={(newSettings) => {
                setSettings(newSettings);
                AppStorage.saveSettings(newSettings);
                reloadData();
              }}
              onResetDemo={() => setDataActionModalType('load-demo')}
              onClearAllData={() => setDataActionModalType('clear-all')}
              onExportJsonBackup={handleExportJsonBackup}
              onImportJsonBackup={handleImportJsonBackup}
            />
          )}
        </main>
      </div>

      {/* 3. Shipment Detail Drawer */}
      <ShipmentDetailDrawer
        shipment={activeShipment}
        allShipments={shipments}
        onClose={() => setSelectedShipmentId(null)}
        onSelectShipment={(id) => setSelectedShipmentId(id)}
        onOpenCaseModal={(shp) => {
          setCaseTargetShipment(shp);
          setCaseToEdit(null);
          setIsCaseModalOpen(true);
        }}
        onOpenSkuDetail={(sku) => {
          setSelectedSku(sku);
          setSelectedShipmentId(null);
        }}
        onOpenProductSupplement={(shp) => {
          setSupplementTargetShipment(shp);
          setIsProductSupplementOpen(true);
        }}
        onEditShipment={(shp) => {
          setShipmentToEdit(shp);
          setIsManualModalOpen(true);
        }}
      />

      {/* 4. SKU Detail Drawer */}
      <SkuDetailDrawer
        sku={selectedSku}
        inventoryItem={activeSkuInventory}
        linkedShipments={linkedShipmentsForSku}
        ledgerEntries={ledger}
        onClose={() => setSelectedSku(null)}
        onSelectShipment={(shpId) => {
          setSelectedShipmentId(shpId);
          setSelectedSku(null);
        }}
      />

      {/* 5. Manual Shipment Modal */}
      <ManualShipmentModal
        isOpen={isManualModalOpen}
        onClose={() => {
          setIsManualModalOpen(false);
          setShipmentToEdit(null);
        }}
        onSave={handleSaveShipment}
        onSaveBatch={handleBatchSaveShipments}
        existingShipment={shipmentToEdit}
        products={products}
        allShipments={shipments}
        initialMode={manualModalMode}
      />

      {/* 6. Case Claim Modal */}
      <CaseModal
        isOpen={isCaseModalOpen}
        onClose={() => {
          setIsCaseModalOpen(false);
          setCaseTargetShipment(null);
          setCaseToEdit(null);
        }}
        shipment={caseTargetShipment}
        existingCase={caseToEdit}
        onSaveCase={handleSaveCase}
      />

      {/* 7. Product SKU Supplement & Discrepancy Annotation Modal */}
      <ProductSupplementModal
        isOpen={isProductSupplementOpen}
        onClose={() => {
          setIsProductSupplementOpen(false);
          setSupplementTargetShipment(null);
        }}
        shipment={supplementTargetShipment}
        products={products}
        onSaveItems={handleSaveSupplementItems}
      />

      {/* 8. Data Action Confirmation Modal (Load Demo / Clear All) */}
      <DataActionModal
        isOpen={dataActionModalType !== null}
        actionType={dataActionModalType}
        onClose={() => setDataActionModalType(null)}
        onConfirm={() => {
          if (dataActionModalType === 'load-demo') {
            handleExecuteResetDemo();
          } else if (dataActionModalType === 'clear-all') {
            handleExecuteClearAllData();
          }
          setDataActionModalType(null);
        }}
      />

      {/* 9. Reverse Sync from Freight Summary to Shipment Management Modal */}
      {isFreightSyncOpen && (
        <FreightSyncModal
          isOpen={isFreightSyncOpen}
          onClose={() => setIsFreightSyncOpen(false)}
          freightItems={freightItems}
          existingShipments={shipments}
          inventory={inventory}
          products={products}
          onSyncToShipments={handleSyncFreightToShipments}
        />
      )}
    </div>
  );
}
