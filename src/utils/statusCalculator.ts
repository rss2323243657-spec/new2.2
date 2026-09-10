import { Shipment, ShipmentStatus, CaseStatus, AnomalyItem, InventoryItem, CaseRecord } from '../types';
import {
  calculateDaysDifference,
  getTodayString,
  addDaysToDate,
  checkDateAnomalies,
} from './dateUtils';

/**
 * Derives the exact ShipmentStatus based on business rules
 */
export function deriveShipmentStatus(
  shipment: Partial<Shipment>,
  todayStr: string = getTodayString()
): {
  status: ShipmentStatus;
  caseStatus: CaseStatus;
  daysSinceArrival?: number;
  daysUntilCase?: number;
  caseEligibleDate?: string;
} {
  const {
    shipDate,
    arrivalDate,
    totalShipQty = 0,
    totalReceivedQty = 0,
    totalDiscrepancyQty = 0,
    caseId,
    caseStatus: initialCaseStatus,
  } = shipment;

  // 1. Calculate Date Metrics
  let daysSinceArrival: number | undefined;
  let daysUntilCase: number | undefined;
  let caseEligibleDate: string | undefined;

  if (arrivalDate) {
    daysSinceArrival = calculateDaysDifference(arrivalDate, todayStr);
    caseEligibleDate = addDaysToDate(arrivalDate, 10);
    // daysUntilCase: positive means N days left, 0 means today, negative means overdue by N days
    daysUntilCase = 10 - daysSinceArrival;
  }

  // 2. Determine Case Status
  let caseStatus: CaseStatus = initialCaseStatus || 'Not Eligible';

  if (totalDiscrepancyQty <= 0) {
    caseStatus = 'Not Eligible';
  } else if (!arrivalDate) {
    caseStatus = 'Not Eligible'; // Strictly forbidden before arrival
  } else if (caseId && initialCaseStatus && initialCaseStatus !== 'Not Eligible') {
    caseStatus = initialCaseStatus;
  } else if (daysSinceArrival !== undefined && daysSinceArrival >= 10) {
    caseStatus = 'Eligible';
  } else {
    caseStatus = 'Not Eligible';
  }

  // 3. Determine Shipment Status Lifecycle
  let status: ShipmentStatus = 'Draft';

  if (!shipDate && totalShipQty === 0) {
    status = 'Draft';
  } else if (!arrivalDate && totalReceivedQty === 0) {
    status = 'In Transit';
  } else if (arrivalDate && totalReceivedQty === 0) {
    status = 'Arrived';
  } else if (totalReceivedQty > 0 && totalReceivedQty < totalShipQty) {
    // Receiving in progress or partial
    if (caseStatus === 'Opened' || caseStatus === 'In Review') {
      status = 'Case Opened';
    } else if (caseStatus === 'Eligible') {
      status = 'Case Eligible';
    } else {
      status = 'Partially Received';
    }
  } else if (totalReceivedQty >= totalShipQty && totalShipQty > 0) {
    status = 'Fully Received';
  } else if (totalDiscrepancyQty > 0) {
    if (caseStatus === 'Opened' || caseStatus === 'In Review') {
      status = 'Case Opened';
    } else if (caseStatus === 'Eligible') {
      status = 'Case Eligible';
    } else {
      status = 'Discrepancy';
    }
  }

  // If case is closed / resolved
  if (initialCaseStatus === 'Resolved' || initialCaseStatus === 'Closed') {
    status = 'Resolved';
  }

  return {
    status,
    caseStatus,
    daysSinceArrival,
    daysUntilCase,
    caseEligibleDate,
  };
}

/**
 * Fully recalculates all item-level and shipment-level metrics
 */
export function calculateShipmentMetrics(
  shipment: Shipment,
  todayStr: string = getTodayString(),
  caseEligibilityDays: number = 10
): Shipment {
  const items = (shipment.items || []).map((item) => {
    const shipQty = Number(item.shipQty) || 0;
    const receivedQty = Number(item.receivedQty) || 0;
    const cartons = Number(item.cartons) || 1;
    const qtyPerCarton = Number(item.qtyPerCarton) || (cartons > 0 ? Math.round(shipQty / cartons) : shipQty);
    const receivedCartons =
      item.receivedCartons !== undefined
        ? Number(item.receivedCartons)
        : receivedQty > 0
        ? Math.min(cartons, Math.ceil(receivedQty / (qtyPerCarton || 1)))
        : 0;

    const discrepancyQty = Math.max(0, shipQty - receivedQty);

    return {
      ...item,
      shipQty,
      receivedQty,
      cartons,
      qtyPerCarton,
      receivedCartons,
      discrepancyQty,
    };
  });

  const hasItems = items.length > 0;
  const totalShipQty = hasItems
    ? items.reduce((sum, it) => sum + it.shipQty, 0)
    : Number(shipment.totalShipQty) || 0;

  const totalReceivedQty = hasItems
    ? items.reduce((sum, it) => sum + it.receivedQty, 0)
    : Number(shipment.totalReceivedQty) || 0;

  const totalDiscrepancyQty = Math.max(0, totalShipQty - totalReceivedQty);

  // Calculate total physical cartons with mixed box group deduplication:
  // Multiple SKUs in the same mixedBoxGroup share the same physical box (count only 1 per box/group).
  let totalCartons = 0;
  if (hasItems) {
    const mixedGroupMap = new Map<string, number>();
    let standaloneCartons = 0;
    let hasMixed = false;

    items.forEach((it) => {
      if (it.mixedBoxGroup && it.mixedBoxGroup.trim()) {
        hasMixed = true;
        const grp = it.mixedBoxGroup.trim();
        if (!mixedGroupMap.has(grp)) {
          // Take the box count for this mixed group (defaults to it.cartons or 1)
          mixedGroupMap.set(grp, Number(it.cartons) || 1);
        }
      } else {
        standaloneCartons += Number(it.cartons) || 0;
      }
    });

    if (hasMixed) {
      let mixedCartonsTotal = 0;
      mixedGroupMap.forEach((count) => {
        mixedCartonsTotal += count;
      });
      totalCartons = standaloneCartons + mixedCartonsTotal;
    } else if (shipment.totalCartons !== undefined && Number(shipment.totalCartons) > 0) {
      totalCartons = Number(shipment.totalCartons);
    } else {
      totalCartons = items.reduce((sum, it) => sum + (Number(it.cartons) || 0), 0);
    }
  } else {
    totalCartons = Number(shipment.totalCartons) || (totalShipQty > 0 ? Math.max(1, Math.ceil(totalShipQty / 20)) : 0);
  }

  const totalReceivedCartons = hasItems
    ? items.reduce((sum, it) => sum + (it.receivedCartons || 0), 0)
    : shipment.totalReceivedCartons !== undefined
    ? Number(shipment.totalReceivedCartons)
    : totalReceivedQty >= totalShipQty && totalShipQty > 0
    ? totalCartons
    : totalCartons > 0 && totalShipQty > 0
    ? Math.floor((totalReceivedQty / totalShipQty) * totalCartons)
    : 0;

  const missingCartons = Math.max(0, totalCartons - totalReceivedCartons);

  const { status, caseStatus, daysSinceArrival, daysUntilCase, caseEligibleDate } =
    deriveShipmentStatus(
      {
        ...shipment,
        items,
        totalShipQty,
        totalReceivedQty,
        totalDiscrepancyQty,
      },
      todayStr
    );

  return {
    ...shipment,
    items,
    totalShipQty,
    totalReceivedQty,
    totalDiscrepancyQty,
    totalCartons,
    totalReceivedCartons,
    missingCartons,
    status,
    caseStatus,
    daysSinceArrival,
    daysUntilCase,
    caseEligibleDate,
  };
}

/**
 * Symmetrically harmonizes and links shipments that are explicitly associated by the user for combined customs declaration:
 * - Only shipments with explicit manual mergedCustomsShipmentIds are linked.
 * - Same shipDate + same channel does NOT automatically link shipments (users must manually set/add them, no forced association).
 * - Symmetrically synchronizes mutual references for explicitly linked peer shipments.
 * - Unlinked shipments have mergedCustomsShipmentIds strictly set to [].
 */
export function harmonizeCustomsBatchAssociations(shipments: Shipment[]): Shipment[] {
  if (!shipments || shipments.length === 0) return [];

  // Connected components map: each shipment ID maps to its cluster set
  const clusterMap = new Map<string, Set<string>>();

  // Initialize each shipment in its own cluster
  shipments.forEach((s) => {
    clusterMap.set(s.id, new Set([s.id]));
  });

  // Helper to union two clusters
  const union = (idA: string, idB: string) => {
    const setA = clusterMap.get(idA);
    const setB = clusterMap.get(idB);
    if (!setA || !setB || setA === setB) return;
    const merged = new Set([...setA, ...setB]);
    merged.forEach((id) => clusterMap.set(id, merged));
  };

  // Group strictly by explicit user-configured mergedCustomsShipmentIds ONLY
  // No auto-clustering by date, channel, warehouse, or batch ID strings!
  shipments.forEach((s) => {
    if (s.mergedCustomsShipmentIds && s.mergedCustomsShipmentIds.length > 0) {
      s.mergedCustomsShipmentIds.forEach((peerId) => {
        const cleanPeerId = (peerId || '').trim();
        if (cleanPeerId && cleanPeerId !== s.id && shipments.some((existing) => existing.id === cleanPeerId)) {
          union(s.id, cleanPeerId);
        }
      });
    }
  });

  // Extract unique clusters with size > 1
  const visited = new Set<string>();
  const finalizedClusters: { batchId?: string; members: string[] }[] = [];

  shipments.forEach((s) => {
    if (visited.has(s.id)) return;
    const cluster = clusterMap.get(s.id);
    if (cluster && cluster.size > 1) {
      cluster.forEach((id) => visited.add(id));
      const members = Array.from(cluster);
      // Find if any member has an explicit user-defined batch ID (excluding legacy auto-generated prefixes)
      const userBatchShp = shipments.find(
        (item) =>
          cluster.has(item.id) &&
          item.customsBatchId &&
          item.customsBatchId.trim() &&
          !item.customsBatchId.startsWith('CB-') &&
          !item.customsBatchId.startsWith('BATCH_') &&
          !item.customsBatchId.startsWith('AUTO_') &&
          !item.customsBatchId.startsWith('DATE_') &&
          !item.customsBatchId.startsWith('EXP_') &&
          !item.customsBatchId.startsWith('MERGED_') &&
          !item.customsBatchId.startsWith('STANDALONE_')
      );
      finalizedClusters.push({ batchId: userBatchShp?.customsBatchId, members });
    }
  });

  const memberToBatchMap = new Map<string, { batchId?: string; members: string[] }>();
  finalizedClusters.forEach((c) => {
    c.members.forEach((mId) => memberToBatchMap.set(mId, c));
  });

  // Symmetrically apply batch associations
  return shipments.map((s) => {
    const batchInfo = memberToBatchMap.get(s.id);
    if (batchInfo && batchInfo.members.length > 1) {
      const peers = batchInfo.members.filter((id) => id !== s.id);
      return {
        ...s,
        customsBatchId: batchInfo.batchId || (s.customsBatchId && !s.customsBatchId.startsWith('CB-') && !s.customsBatchId.startsWith('BATCH_') && !s.customsBatchId.startsWith('AUTO_') ? s.customsBatchId : undefined),
        isMergedCustoms: true,
        customsDeclarationType: 'MERGED' as const, // Explicitly linked shipments share merged customs
        mergedCustomsShipmentIds: peers,
      };
    }

    // Unlinked shipment: strictly clear mergedCustomsShipmentIds and purge legacy auto-generated batch IDs
    const cleanBatchId =
      s.customsBatchId &&
      (s.customsBatchId.startsWith('CB-') ||
        s.customsBatchId.startsWith('BATCH_') ||
        s.customsBatchId.startsWith('AUTO_') ||
        s.customsBatchId.startsWith('DATE_') ||
        s.customsBatchId.startsWith('EXP_') ||
        s.customsBatchId.startsWith('MERGED_') ||
        s.customsBatchId.startsWith('STANDALONE_'))
        ? undefined
        : s.customsBatchId;

    return {
      ...s,
      customsBatchId: cleanBatchId,
      isMergedCustoms: false,
      mergedCustomsShipmentIds: [],
    };
  });
}

/**
 * Scans all shipments and inventory to produce Anomaly Records
 */
export function detectAllAnomalies(
  shipments: Shipment[],
  inventory?: InventoryItem[],
  todayStr?: string
): AnomalyItem[] {
  const anomalies: AnomalyItem[] = [];
  const shipmentIdMap = new Map<string, number>();

  shipments.forEach((shp) => {
    // 1. Duplicate Shipment ID Check
    const count = shipmentIdMap.get(shp.id) || 0;
    shipmentIdMap.set(shp.id, count + 1);
    if (count > 0) {
      anomalies.push({
        id: `anom-dup-${shp.id}`,
        level: 'critical',
        type: 'Shipment重复',
        title: `发现重复货件编号: ${shp.id}`,
        message: `货件 ${shp.id} 在系统中存在多次记录，可能导致库存和收货重复统计。`,
        description: `货件 ${shp.id} 在系统中存在多次记录，可能导致库存和收货重复统计。`,
        shipmentId: shp.id,
        referenceId: shp.id,
        referenceType: 'Shipment',
        detectedAt: new Date().toISOString(),
      });
    }

    // 2. Empty SKU or Ship Qty
    if (!shp.items || shp.items.length === 0) {
      anomalies.push({
        id: `anom-noitem-${shp.id}`,
        level: 'critical',
        type: '货件明细缺失',
        title: `货件 ${shp.id} 未包含任何商品SKU明细`,
        message: '该货件无商品项目，无法追踪具体SKU的收货与库存。',
        description: '该货件无商品项目，无法追踪具体SKU的收货与库存。',
        shipmentId: shp.id,
        referenceId: shp.id,
        referenceType: 'Shipment',
        detectedAt: new Date().toISOString(),
      });
    } else {
      shp.items.forEach((it, idx) => {
        if (!it.sku || it.sku.trim() === '') {
          anomalies.push({
            id: `anom-nosku-${shp.id}-${idx}`,
            level: 'critical',
            type: 'SKU为空',
            title: `货件 ${shp.id} 中第 ${idx + 1} 项SKU为空`,
            message: '存在空SKU条目，将影响库存汇总。',
            description: '存在空SKU条目，将影响库存汇总。',
            shipmentId: shp.id,
            referenceId: shp.id,
            referenceType: 'SKU',
            detectedAt: new Date().toISOString(),
          });
        }
        if (it.shipQty <= 0) {
          anomalies.push({
            id: `anom-zeroship-${shp.id}-${it.sku}`,
            level: 'warning',
            type: '发货数量异常',
            title: `货件 ${shp.id} SKU ${it.sku} 发货数量为 0`,
            message: '发货数量为零或缺失，请核对。',
            description: '发货数量为零或缺失，请核对。',
            shipmentId: shp.id,
            referenceId: shp.id,
            referenceType: 'Shipment',
            detectedAt: new Date().toISOString(),
          });
        }
        if (it.receivedQty > it.shipQty) {
          anomalies.push({
            id: `anom-excess-${shp.id}-${it.sku}`,
            level: 'critical',
            type: '接收数量超发',
            title: `货件 ${shp.id} 接收数量 (${it.receivedQty}) > 发货数量 (${it.shipQty})`,
            message: `SKU ${it.sku} 出现Walmart超收 ${it.receivedQty - it.shipQty} 件，请核查是否多贴标或混箱。`,
            description: `SKU ${it.sku} 出现Walmart超收 ${it.receivedQty - it.shipQty} 件，请核查是否多贴标或混箱。`,
            shipmentId: shp.id,
            referenceId: shp.id,
            referenceType: 'Shipment',
            detectedAt: new Date().toISOString(),
          });
        }
      });
    }

    // 3. Date Anomalies
    const dateErrors = checkDateAnomalies(shp.shipDate, shp.arrivalDate);
    dateErrors.forEach((err, idx) => {
      anomalies.push({
        id: `anom-date-${shp.id}-${idx}`,
        level: 'critical',
        type: '日期逻辑错误',
        title: `货件 ${shp.id} 日期逻辑异常`,
        message: err,
        description: err,
        shipmentId: shp.id,
        referenceId: shp.id,
        referenceType: 'Date',
        detectedAt: new Date().toISOString(),
      });
    });

    // 4. Missing Arrival Date when status is arrived/receiving
    if ((shp.totalReceivedQty > 0 || shp.status === 'Arrived' || shp.status === 'Receiving') && !shp.arrivalDate) {
      anomalies.push({
        id: `anom-noarr-${shp.id}`,
        level: 'warning',
        type: '实际到仓日期缺失',
        title: `货件 ${shp.id} 已开始接收但缺失实际到仓日期`,
        message: '由于缺少实际到仓日期（Arrival Date），系统无法开启10天Case倒计时。',
        description: '由于缺少实际到仓日期（Arrival Date），系统无法开启10天Case倒计时。',
        shipmentId: shp.id,
        referenceId: shp.id,
        referenceType: 'Shipment',
        detectedAt: new Date().toISOString(),
      });
    }

    // 5. Overdue Case Warning (>10 days with discrepancy, no case opened)
    if (
      shp.totalDiscrepancyQty > 0 &&
      shp.arrivalDate &&
      shp.daysUntilCase !== undefined &&
      shp.daysUntilCase < 0 &&
      (!shp.caseStatus || shp.caseStatus === 'Not Eligible' || shp.caseStatus === 'Eligible')
    ) {
      const overdueDays = Math.abs(shp.daysUntilCase);
      anomalies.push({
        id: `anom-case-overdue-${shp.id}`,
        level: 'critical',
        type: 'Case严重逾期未处理',
        title: `货件 ${shp.id} 已超期 ${overdueDays} 天未开Case`,
        message: `差异数量 ${shp.totalDiscrepancyQty} 件，到仓已 ${shp.daysSinceArrival} 天，请尽快向Walmart提起Claim。`,
        description: `差异数量 ${shp.totalDiscrepancyQty} 件，到仓已 ${shp.daysSinceArrival} 天，请尽快向Walmart提起Claim。`,
        shipmentId: shp.id,
        referenceId: shp.id,
        referenceType: 'Case',
        detectedAt: new Date().toISOString(),
      });
    }

    // 6. Box count complete but items missing
    if (shp.totalCartons > 0 && shp.missingCartons === 0 && shp.totalDiscrepancyQty > 0) {
      anomalies.push({
        id: `anom-carton-item-mismatch-${shp.id}`,
        level: 'warning',
        type: '箱数完整但商品缺失',
        title: `货件 ${shp.id} 箱数已全收但商品短少 ${shp.totalDiscrepancyQty} 件`,
        message: `发货 ${shp.totalCartons} 箱全部签收，但实际扫描商品少 ${shp.totalDiscrepancyQty} 件，可能为箱内少装或FC清点漏扫。`,
        description: `发货 ${shp.totalCartons} 箱全部签收，但实际扫描商品少 ${shp.totalDiscrepancyQty} 件，可能为箱内少装或FC清点漏扫。`,
        shipmentId: shp.id,
        referenceId: shp.id,
        referenceType: 'Shipment',
        detectedAt: new Date().toISOString(),
      });
    }
  });

  return anomalies;
}

export const detectSystemAnomalies = detectAllAnomalies;

/**
 * Calculates real-time Inventory Metrics based on current Shipments, In-Transit status,
 * Arrived Receiving status, and Walmart Reimbursement settlements from Cases.
 *
 * Business Rules:
 * 1. Available (在库可用): Base stock uploaded / provided by user.
 * 2. In-Transit (在途数量): Shipments created but not yet arrived at FC (arrivalDate is empty or In Transit/Shipped).
 * 3. Pending Count / Receiving (待收清点): Shipments arrived at FC and being received (shipQty - receivedQty).
 *    * Walmart Reimbursement rule: If a case is resolved / reimbursed by Walmart, those discrepancy units
 *      are NO LONGER counted in pending receiving!
 * 4. Total Projected (预计可用总计): Available + In-Transit (在库 + 在途, strictly excluding receiving).
 */
export function calculateInventoryItemMetrics(
  item: InventoryItem,
  shipments: Shipment[],
  cases: CaseRecord[] = []
): InventoryItem {
  let inboundQty = 0;
  let rawReceivingQty = 0;

  // Track reimbursement details for this SKU
  const matchedReimbursementCases: {
    caseId: string;
    shipmentId: string;
    reimbursedUnits: number;
    reimbursedAmount?: number;
    currency?: string;
    reimbursementType?: string;
    status: string;
    resolutionDate?: string;
    details?: string;
  }[] = [];

  let totalReimbursedUnits = 0;
  let totalReimbursedAmount = 0;

  // 1. Scan shipments for inbound vs receiving
  shipments.forEach((shp) => {
    const matchedItem = shp.items?.find(
      (it) => it.sku.toLowerCase() === item.sku.toLowerCase()
    );
    if (!matchedItem) return;

    const isArrived =
      Boolean(shp.arrivalDate) ||
      shp.status === 'Arrived' ||
      shp.status === 'Receiving' ||
      shp.status === 'Partially Received' ||
      shp.status === 'Discrepancy' ||
      shp.status === 'Case Eligible' ||
      shp.status === 'Case Opened' ||
      shp.status === 'Case Processing' ||
      shp.status === 'Resolved';

    if (!isArrived) {
      // 货件已创建但还未到仓 -> 全部发货数计为在途
      inboundQty += matchedItem.shipQty;
    } else {
      // 货件已到仓 -> 未上架完成的部分 (shipQty - receivedQty)
      const diff = Math.max(0, matchedItem.shipQty - matchedItem.receivedQty);
      rawReceivingQty += diff;
    }
  });

  // 2. Scan cases for Walmart reimbursement / resolutions for this SKU
  cases.forEach((c) => {
    if (c.sku.toLowerCase() !== item.sku.toLowerCase()) return;

    const isResolvedOrReimbursed =
      c.status === 'Resolved' ||
      c.status === 'Partially Resolved' ||
      c.reimbursementStatus === 'APPROVED' ||
      c.reimbursementStatus === 'PAID' ||
      (c.walmartResponse && /赔付|赔偿|reimburse|reimbursed|credited|refund/i.test(c.walmartResponse)) ||
      (c.notes && /赔付|赔偿|reimburse|reimbursed|已赔/i.test(c.notes));

    if (isResolvedOrReimbursed) {
      const units =
        c.reimbursedUnits !== undefined
          ? c.reimbursedUnits
          : c.resolutionQty !== undefined && c.resolutionQty > 0
          ? c.resolutionQty
          : c.status === 'Resolved'
          ? c.discrepancyQty
          : 0;

      if (units > 0) {
        totalReimbursedUnits += units;
        const amount = c.reimbursedAmount !== undefined ? c.reimbursedAmount : units * 15; // default estimation if missing
        totalReimbursedAmount += amount;

        matchedReimbursementCases.push({
          caseId: c.id,
          shipmentId: c.shipmentId,
          reimbursedUnits: units,
          reimbursedAmount: amount,
          currency: c.reimbursementCurrency || 'USD',
          reimbursementType:
            c.reimbursementType ||
            (units >= c.discrepancyQty ? '全额赔付 (Full Reimbursement)' : '部分赔付 (Partial)'),
          status: c.status,
          resolutionDate: c.closedDate || c.updatedAt?.slice(0, 10),
          details: c.walmartResponse || c.notes || 'Walmart 官方已批准索赔并执行赔付补偿',
        });
      }
    }
  });

  // 3. Deduct reimbursed / settled discrepancy from pending receiving
  const netReceivingQty = Math.max(0, rawReceivingQty - totalReimbursedUnits);

  // 4. Projected Total: Available + Inbound (在库 + 在途)
  const totalProjected = item.available + inboundQty;

  const daysOfSupply =
    item.sales30Days && item.sales30Days > 0
      ? Math.round(totalProjected / (item.sales30Days / 30))
      : undefined;

  return {
    ...item,
    inbound: inboundQty,
    receiving: netReceivingQty,
    totalProjected,
    daysOfSupply,
    reimbursedUnits: totalReimbursedUnits,
    reimbursedAmount: totalReimbursedAmount,
    reimbursementCurrency: 'USD',
    reimbursementCases: matchedReimbursementCases,
    updatedAt: new Date().toISOString(),
  };
}

export function calculateAllInventoryMetrics(
  inventory: InventoryItem[],
  shipments: Shipment[],
  cases: CaseRecord[] = []
): InventoryItem[] {
  return inventory.map((item) => calculateInventoryItemMetrics(item, shipments, cases));
}
