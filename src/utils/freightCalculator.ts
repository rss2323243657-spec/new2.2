import {
  FreightShippingItem,
  ShipmentFreightSummary,
  MonthlyFreightSummary,
  FreightReconciliationStatus,
  Shipment,
} from '../types';
import { normalizeDateString } from './dateUtils';

/**
 * Parses dimension string into length, width, height in cm.
 * Examples: "43*25*37", "43x25x37", "43*25*37cm", "43, 25, 37", "43 25 37"
 */
export function parseDimensions(dimStr: string | number): {
  length: number;
  width: number;
  height: number;
  text: string;
} {
  if (typeof dimStr === 'number') {
    return { length: dimStr, width: 1, height: 1, text: `${dimStr}*1*1` };
  }

  const clean = String(dimStr || '')
    .trim()
    .replace(/[cCmMsS]/g, '')
    .replace(/[xX×,，/]/g, '*');

  const parts = clean
    .split('*')
    .map((p) => parseFloat(p.trim()))
    .filter((n) => !isNaN(n) && n > 0);

  if (parts.length >= 3) {
    return {
      length: parts[0],
      width: parts[1],
      height: parts[2],
      text: `${parts[0]}*${parts[1]}*${parts[2]}`,
    };
  } else if (parts.length === 1) {
    return {
      length: parts[0],
      width: 1,
      height: 1,
      text: `${parts[0]}*1*1`,
    };
  }

  // Default fallback dimensions
  return { length: 40, width: 30, height: 25, text: '40*30*25' };
}

/**
 * Extracts month key "YYYY-MM" from date string.
 * Uses normalizeDateString to avoid misparsing (e.g. 2026/8/22 -> 2026-08).
 */
export function extractMonthKey(dateStr: string): string {
  if (!dateStr) return '2026-08';
  const normalized = normalizeDateString(dateStr, '2026-08-01');
  return normalized.slice(0, 7);
}

/**
 * Formats "YYYY-MM" into readable Chinese display "YYYY年MM月"
 */
export function formatMonthDisplay(monthKey: string): string {
  if (!monthKey || monthKey === 'all') return '全部月份汇总';
  const clean = monthKey.replace(/[年月]/g, '-').replace(/[日号]/g, '');
  const parts = clean.split('-');
  if (parts.length >= 2) {
    const y = parts[0].padStart(4, '20');
    const m = parts[1].padStart(2, '0');
    return `${y}年${m}月`;
  }
  return monthKey;
}

/**
 * Calculate single item metrics (volumetric weight, chargeable weight, min weight rule)
 */
export function calculateItemFreightMetrics(
  item: Partial<FreightShippingItem>
): FreightShippingItem {
  const dims = parseDimensions(
    item.dimensionsText || `${item.boxLength || 40}*${item.boxWidth || 30}*${item.boxHeight || 25}`
  );
  const length = item.boxLength || dims.length;
  const width = item.boxWidth || dims.width;
  const height = item.boxHeight || dims.height;
  const dimensionsText = item.dimensionsText || dims.text;

  const boxWeight = Number(item.boxWeight || 0);
  // If mixed box and boxCount is explicitly 0, allow 0 so it doesn't double count
  const rawBoxCount = item.boxCount !== undefined && item.boxCount !== null ? Number(item.boxCount) : 1;
  const boxCount = isNaN(rawBoxCount) ? 1 : Math.max(0, rawBoxCount);
  const unitPrice = Number(item.unitPrice || 0);
  const actualQty = Number(item.actualQty || 0);
  const shipDate = normalizeDateString(item.shipDate, '2026-08-01');
  const monthKey = item.monthKey || extractMonthKey(shipDate);

  // 1. Volumetric weight = (L * W * H) / 6000
  const volumetricWeight = Number(((length * width * height) / 6000).toFixed(2));

  // 2. Chargeable weight = Max(Actual Weight, Volumetric Weight)
  const baseWeight = Math.max(boxWeight, volumetricWeight);
  const pricingMethod: 'Weight' | 'Volume' = volumetricWeight > boxWeight ? 'Volume' : 'Weight';

  // 3. Minimum 12kg rule: Whichever method, if < 12kg and boxCount > 0, calculate as 12kg
  const minWeightApplied = boxCount > 0 && baseWeight < 12 && baseWeight > 0;
  const billedWeightPerBox = boxWeight === 0 && volumetricWeight === 0
    ? 0
    : Number(Math.max(12, baseWeight).toFixed(2));

  let chargeableType: 'MIN_12KG' | 'VOLUMETRIC' | 'ACTUAL_WEIGHT' = 'ACTUAL_WEIGHT';
  if (minWeightApplied) {
    chargeableType = 'MIN_12KG';
  } else if (pricingMethod === 'Volume') {
    chargeableType = 'VOLUMETRIC';
  }

  const totalChargeableWeight = Number((billedWeightPerBox * boxCount).toFixed(2));

  // 4. Estimated Freight for this item
  const estimatedItemFreight = Number((unitPrice * totalChargeableWeight).toFixed(2));

  // 5. Extra Category Fee (超品费)
  const extraCategoriesCount = Number(item.extraCategoriesCount || 0);
  const extraCategoryUnitPrice = Number(item.extraCategoryUnitPrice || 30);
  const extraCategoryFee = Number((extraCategoriesCount * extraCategoryUnitPrice).toFixed(2));

  return {
    id: item.id || `F-ITEM-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    shipmentId: item.shipmentId || 'UNKNOWN_SHIPMENT',
    warehouse: (item.warehouse || 'PHX1').toUpperCase(),
    shipDate,
    monthKey,
    sku: item.sku || 'SKU-UNKNOWN',
    productName: item.productName || item.sku || '产品名称',
    actualQty,
    boxCount,
    boxWeight,
    boxLength: length,
    boxWidth: width,
    boxHeight: height,
    dimensionsText,
    channel: item.channel || '美森限时达',
    unitPrice,
    isMergedCustoms: item.isMergedCustoms !== false,
    customsDeclarationType: item.customsDeclarationType || (item.isMergedCustoms === false ? 'STANDALONE' : 'MERGED'),
    customsBatchKey: item.customsBatchKey,
    extraCategoriesCount,
    extraCategoryUnitPrice,
    extraCategoryFee,
    mixedBoxGroup: item.mixedBoxGroup?.trim() || undefined,
    notes: item.notes,
    volumetricWeight,
    volumetricWeightPerBox: volumetricWeight,
    billedWeightPerBox,
    chargeableWeightPerBox: billedWeightPerBox,
    totalChargeableWeight,
    pricingMethod,
    chargeableType,
    minWeightApplied,
    estimatedItemFreight,
  };
}

/**
 * Group freight items by Shipment ID
 */
export function groupFreightItemsByShipment(
  items: FreightShippingItem[]
): Map<string, FreightShippingItem[]> {
  const map = new Map<string, FreightShippingItem[]>();
  items.forEach((item) => {
    const sid = (item.shipmentId || 'UNKNOWN').trim().toUpperCase();
    const list = map.get(sid) || [];
    list.push(item);
    map.set(sid, list);
  });
  return map;
}

/**
 * Calculates shipment-level freight summary with mixed-box deduplication, extra category fee, and customs fee
 */
export function calculateShipmentFreightSummary(
  shipmentId: string,
  rawItems: FreightShippingItem[],
  existingActuals?: {
    actualChargeableWeight?: number;
    actualCost?: number;
    actualUnitPrice?: number;
    actualCustomsFee?: number;
    actualExtraCategoryFee?: number;
    reconciliationNotes?: string;
    isSyncedToShipments?: boolean;
  }
): ShipmentFreightSummary {
  // Ensure all items have calculated metrics
  const items = rawItems.map((it) => calculateItemFreightMetrics(it));

  if (items.length === 0) {
    return {
      shipmentId,
      warehouse: 'PHX1',
      shipDate: '2026-08-01',
      monthKey: '2026-08',
      channel: '美森限时达',
      unitPrice: 0,
      isMergedCustoms: true,
      customsDeclarationType: 'MERGED',
      totalActualQty: 0,
      totalUnits: 0,
      totalCartons: 0,
      totalActualWeight: 0,
      totalVolumetricWeight: 0,
      estimatedTotalChargeableWeight: 0,
      totalEstimatedChargeableWeight: 0,
      estimatedFreightFee: 0,
      estimatedFreightCost: 0,
      customsFee: 175,
      extraCategoriesCount: 0,
      extraCategoryUnitPrice: 30,
      extraCategoryFee: 0,
      estimatedTotalCost: 175,
      totalEstimatedCost: 175,
      reconciliationStatus: 'Pending',
      isReconciled: false,
      appliedMinimumRule: false,
      items: [],
      isSyncedToShipments: false,
    };
  }

  const first = items[0];
  const warehouse = first.warehouse;
  const shipDate = first.shipDate;
  const monthKey = first.monthKey || extractMonthKey(shipDate);
  const channel = first.channel;
  const unitPrice = first.unitPrice;
  const isMergedCustoms = first.isMergedCustoms;
  const customsDeclarationType = first.customsDeclarationType || (isMergedCustoms ? 'MERGED' : 'STANDALONE');
  const mergedCustomsShipmentIds = first.mergedCustomsShipmentIds || [];

  const totalActualQty = items.reduce((sum, item) => sum + (item.actualQty || 0), 0);

  // Mixed Box Deduplication Logic:
  // Items with the same mixedBoxGroup share the physical carton.
  // The physical weight and box count is counted ONLY ONCE per group.
  const mixedGroups = new Map<string, FreightShippingItem[]>();
  const standaloneItems: FreightShippingItem[] = [];

  items.forEach((item) => {
    if (item.mixedBoxGroup) {
      const groupKey = item.mixedBoxGroup.trim();
      const existing = mixedGroups.get(groupKey) || [];
      existing.push(item);
      mixedGroups.set(groupKey, existing);
    } else {
      standaloneItems.push(item);
    }
  });

  let estimatedTotalChargeableWeight = 0;
  let estimatedFreightFee = 0;
  let totalCartons = 0;
  let totalActualWeight = 0;
  let totalVolumetricWeight = 0;
  let appliedMinimumRule = false;

  // Add standalone boxes
  standaloneItems.forEach((item) => {
    const boxChargeWeight = item.chargeableWeightPerBox * item.boxCount;
    estimatedTotalChargeableWeight += boxChargeWeight;
    estimatedFreightFee += item.unitPrice * boxChargeWeight;
    totalCartons += item.boxCount;
    totalActualWeight += item.boxWeight * item.boxCount;
    totalVolumetricWeight += item.volumetricWeightPerBox * item.boxCount;
    if (item.minWeightApplied) appliedMinimumRule = true;
  });

  // Add mixed box groups (Counted ONLY ONCE per physical mixed group)
  mixedGroups.forEach((groupItems) => {
    // Find representative item that has max box count & weight in this group
    const repWithCartons = groupItems.find((it) => it.boxCount > 0) || groupItems[0];
    const maxBoxWeight = Math.max(...groupItems.map((it) => it.boxWeight || 0));
    const rep = {
      ...repWithCartons,
      boxWeight: maxBoxWeight > 0 ? maxBoxWeight : repWithCartons.boxWeight,
    };
    const repMetrics = calculateItemFreightMetrics(rep);
    const boxChargeWeight = repMetrics.chargeableWeightPerBox * Math.max(1, repMetrics.boxCount);

    estimatedTotalChargeableWeight += boxChargeWeight;
    estimatedFreightFee += repMetrics.unitPrice * boxChargeWeight;
    totalCartons += Math.max(1, repMetrics.boxCount);
    totalActualWeight += repMetrics.boxWeight * Math.max(1, repMetrics.boxCount);
    totalVolumetricWeight += repMetrics.volumetricWeightPerBox * Math.max(1, repMetrics.boxCount);
    if (repMetrics.minWeightApplied) appliedMinimumRule = true;
  });

  estimatedTotalChargeableWeight = Number(estimatedTotalChargeableWeight.toFixed(2));
  estimatedFreightFee = Number(estimatedFreightFee.toFixed(2));
  totalActualWeight = Number(totalActualWeight.toFixed(2));
  totalVolumetricWeight = Number(totalVolumetricWeight.toFixed(2));

  // Customs Fee base calculation
  let customsFee = 175;
  if (customsDeclarationType === 'STANDALONE' || !isMergedCustoms) {
    customsFee = 350;
  } else if (customsDeclarationType === 'EXEMPT') {
    customsFee = 0;
  } else {
    customsFee = 175;
  }

  // Extra Category Fee calculation (Shipment-level attribute: applies to entire shipment)
  const itemWithExtra = items.find((it) => (it.extraCategoriesCount || 0) > 0);
  const totalExtraCats = itemWithExtra
    ? itemWithExtra.extraCategoriesCount || 0
    : items[0]?.extraCategoriesCount || 0;
  const extraCategoryUnitPrice = itemWithExtra
    ? itemWithExtra.extraCategoryUnitPrice || 30
    : items[0]?.extraCategoryUnitPrice || 30;
  const extraCategoryFee = Number((totalExtraCats * extraCategoryUnitPrice).toFixed(2));

  const estimatedTotalCost = Number(
    (estimatedFreightFee + customsFee + extraCategoryFee).toFixed(2)
  );

  // Actual Reconciliation calculations
  const actualChargeableWeight = existingActuals?.actualChargeableWeight;
  const actualCost = existingActuals?.actualCost;
  const actualUnitPrice = existingActuals?.actualUnitPrice;
  const actualCustomsFee = existingActuals?.actualCustomsFee;
  const actualExtraCategoryFee = existingActuals?.actualExtraCategoryFee;
  const reconciliationNotes = existingActuals?.reconciliationNotes;
  const isSyncedToShipments = existingActuals?.isSyncedToShipments || false;

  let reconciliationStatus: FreightReconciliationStatus = 'Pending';
  let weightDiff: number | undefined;
  let weightDiffPercent: number | undefined;
  let costDiff: number | undefined;
  let costDiffPercent: number | undefined;
  const isReconciled = actualCost !== undefined && actualCost !== null && actualCost > 0;

  if (isReconciled && actualCost !== undefined) {
    costDiff = Number((actualCost - estimatedTotalCost).toFixed(2));
    costDiffPercent = Number(((costDiff / (estimatedTotalCost || 1)) * 100).toFixed(1));

    if (Math.abs(costDiff) <= 10) {
      reconciliationStatus = 'Matched';
    } else if (costDiff > 10) {
      reconciliationStatus = 'OverBudget';
    } else {
      reconciliationStatus = 'CostSaving';
    }
  }

  if (
    actualChargeableWeight !== undefined &&
    actualChargeableWeight !== null &&
    actualChargeableWeight > 0
  ) {
    weightDiff = Number((actualChargeableWeight - estimatedTotalChargeableWeight).toFixed(2));
    weightDiffPercent = Number(
      ((weightDiff / (estimatedTotalChargeableWeight || 1)) * 100).toFixed(1)
    );
  }

  // Build normalized item list where secondary mixed box items don't repeat box weight / freight cost
  const normalizedItems: FreightShippingItem[] = [];
  const processedMixedGroups = new Set<string>();

  items.forEach((item) => {
    if (!item.mixedBoxGroup || !item.mixedBoxGroup.trim()) {
      normalizedItems.push({
        ...item,
        isSecondaryMixedItem: false,
        mixedBoxRole: undefined,
      });
    } else {
      const groupKey = item.mixedBoxGroup.trim();
      const groupItems = mixedGroups.get(groupKey) || [item];
      const isFirstOfGroup = !processedMixedGroups.has(groupKey);

      if (isFirstOfGroup) {
        processedMixedGroups.add(groupKey);
        // Find representative item that has max box count & weight in this group
        const repWithCartons = groupItems.find((it) => it.boxCount > 0) || groupItems[0];
        const maxBoxWeight = Math.max(...groupItems.map((it) => it.boxWeight || 0));
        const repBoxCount = Math.max(1, repWithCartons.boxCount);

        const rep = {
          ...item,
          boxCount: repBoxCount,
          boxWeight: maxBoxWeight > 0 ? maxBoxWeight : item.boxWeight,
        };
        const repMetrics = calculateItemFreightMetrics(rep);
        normalizedItems.push({
          ...repMetrics,
          isSecondaryMixedItem: false,
          mixedBoxRole: 'PRIMARY',
        });
      } else {
        // SECONDARY mixed item: belongs to same carton, so 0 additional freight / chargeable weight
        normalizedItems.push({
          ...item,
          isSecondaryMixedItem: true,
          mixedBoxRole: 'SECONDARY',
          chargeableWeightPerBox: 0,
          totalChargeableWeight: 0,
          estimatedItemFreight: 0,
          billedWeightPerBox: 0,
        });
      }
    }
  });

  return {
    shipmentId,
    warehouse,
    shipDate,
    monthKey,
    channel,
    unitPrice,
    isMergedCustoms,
    customsDeclarationType,
    mergedCustomsShipmentIds,
    totalActualQty,
    totalUnits: totalActualQty,
    totalCartons,
    totalActualWeight,
    totalVolumetricWeight,
    estimatedTotalChargeableWeight,
    totalEstimatedChargeableWeight: estimatedTotalChargeableWeight,
    estimatedFreightFee,
    estimatedFreightCost: estimatedFreightFee,
    customsFee,
    extraCategoriesCount: totalExtraCats,
    extraCategoryUnitPrice,
    extraCategoryFee,
    estimatedTotalCost,
    totalEstimatedCost: estimatedTotalCost,
    actualChargeableWeight,
    actualCost,
    actualUnitPrice,
    actualCustomsFee,
    actualExtraCategoryFee,
    reconciliationStatus,
    isReconciled,
    appliedMinimumRule,
    weightDiff,
    weightDifference: weightDiff,
    weightDiffPercent,
    costDiff,
    costDifference: costDiff,
    costDiffPercent,
    costDifferencePercent: costDiffPercent,
    reconciliationNotes,
    items: normalizedItems,
    isSyncedToShipments,
  };
}

/**
 * Aggregates freight items and actuals into monthly overviews.
 * Implements strict customs declaration batching:
 * - Same shipDate + Same channel + Same warehouse (FC) + Same declaration type form ONE batch.
 * - If Standalone: batch fee is ¥350.
 * - If Merged with others: batch fee is ¥175.
 * - If Exempt: batch fee is ¥0.
 * - Only 1 customs fee is charged per batch.
 */
export function aggregateMonthlySummaries(
  itemsOrShipments: FreightShippingItem[] | ShipmentFreightSummary[],
  actualsRecord?: Record<
    string,
    {
      actualChargeableWeight?: number;
      actualCost?: number;
      actualUnitPrice?: number;
      actualCustomsFee?: number;
      actualExtraCategoryFee?: number;
      reconciliationNotes?: string;
      isSyncedToShipments?: boolean;
    }
  >,
  shipmentsContext?: Shipment[]
): MonthlyFreightSummary[] {
  let shipmentSummaries: ShipmentFreightSummary[] = [];

  if (itemsOrShipments.length > 0 && 'items' in itemsOrShipments[0]) {
    shipmentSummaries = itemsOrShipments as ShipmentFreightSummary[];
  } else {
    const items = itemsOrShipments as FreightShippingItem[];
    const grouped = groupFreightItemsByShipment(items);
    grouped.forEach((shipmentItems, shipmentId) => {
      const actuals = actualsRecord ? actualsRecord[shipmentId] : undefined;
      const summary = calculateShipmentFreightSummary(shipmentId, shipmentItems, actuals);
      shipmentSummaries.push(summary);
    });
  }

  // Build context lookup map for shipments if available
  const contextShipmentMap = new Map<string, Shipment>();
  if (shipmentsContext && shipmentsContext.length > 0) {
    shipmentsContext.forEach((s) => {
      if (s && s.id) {
        contextShipmentMap.set(s.id.trim().toUpperCase(), s);
      }
    });
  }

  // 1. Group shipments by monthKey
  const monthMap = new Map<string, ShipmentFreightSummary[]>();

  shipmentSummaries.forEach((s) => {
    const monthKey = s.monthKey || extractMonthKey(s.shipDate);
    const list = monthMap.get(monthKey) || [];
    list.push(s);
    monthMap.set(monthKey, list);
  });

  const results: MonthlyFreightSummary[] = [];

  monthMap.forEach((rawList, monthKey) => {
    // 2. Customs Declaration Batching for this month
    // Rule:
    // - 只有同批拼单的才是关联货件，同批拼单(关联货件)必须合并报关。
    // - 关联货件形成拼单批次，全批次共享一笔 ¥175 报关费 (由首票主计，其余拼单货件为 ¥0 并注明由主票合并)。
    // - 合并报关但未关联其他货件的，作为独立合并报关票件计算 ¥175 (不与同天其他货件自动强行归并)。
    // - 独立报关为 ¥350/票，免报关为 ¥0/票。
    interface ShipmentDeclInfo {
      summary: ShipmentFreightSummary;
      declType: 'STANDALONE' | 'MERGED' | 'EXEMPT';
      linkedIds: string[];
    }

    const declInfoList: ShipmentDeclInfo[] = rawList.map((shp) => {
      const matched = contextShipmentMap.get(shp.shipmentId.trim().toUpperCase());
      const rawDecl = matched?.customsDeclarationType || shp.customsDeclarationType;
      const declType: 'STANDALONE' | 'MERGED' | 'EXEMPT' =
        rawDecl === 'EXEMPT'
          ? 'EXEMPT'
          : rawDecl === 'STANDALONE'
          ? 'STANDALONE'
          : rawDecl === 'MERGED'
          ? 'MERGED'
          : shp.isMergedCustoms || matched?.isMergedCustoms
          ? 'MERGED'
          : 'STANDALONE';
      const linkedIds = (matched?.mergedCustomsShipmentIds || shp.mergedCustomsShipmentIds || []).map((id) =>
        id.trim().toUpperCase()
      );
      return { summary: shp, declType, linkedIds };
    });

    // Step B: Build connected components of explicitly linked MERGED shipments in this month
    const clusterMap = new Map<string, Set<string>>();
    declInfoList.forEach((info) => {
      clusterMap.set(info.summary.shipmentId.toUpperCase(), new Set([info.summary.shipmentId.toUpperCase()]));
    });

    const unionClusters = (idA: string, idB: string) => {
      const setA = clusterMap.get(idA);
      const setB = clusterMap.get(idB);
      if (!setA || !setB || setA === setB) return;
      const merged = new Set([...setA, ...setB]);
      merged.forEach((id) => clusterMap.set(id, merged));
    };

    declInfoList.forEach((info) => {
      if (info.declType === 'MERGED') {
        info.linkedIds.forEach((peerId) => {
          if (clusterMap.has(peerId)) {
            unionClusters(info.summary.shipmentId.toUpperCase(), peerId);
          }
        });
      }
    });

    // Step C: Group into batch buckets
    // 关键优化：互为关联货件共同作为一个报关申报单/拼单批次，报关费与超品费均对整批货件一起收取，绝不逐票重复计算
    const batchBuckets: {
      batchKey: string;
      batchFee: number;
      batchExtraCategoryFee: number;
      batchExtraCategoriesCount: number;
      batchExtraUnitPrice: number;
      shipments: ShipmentFreightSummary[];
    }[] = [];

    const processedIds = new Set<string>();

    declInfoList.forEach((info) => {
      const sId = info.summary.shipmentId.toUpperCase();
      if (processedIds.has(sId)) return;

      const cluster = clusterMap.get(sId);
      if (info.declType === 'MERGED' && cluster && cluster.size > 1) {
        // Linked combined batch
        const memberSummaries: ShipmentFreightSummary[] = [];
        let maxExtraCats = 0;
        let extraUnitPrice = 30;

        cluster.forEach((memberId) => {
          processedIds.add(memberId);
          const found = declInfoList.find((item) => item.summary.shipmentId.toUpperCase() === memberId);
          if (found) {
            memberSummaries.push(found.summary);
            if ((found.summary.extraCategoriesCount || 0) > maxExtraCats) {
              maxExtraCats = found.summary.extraCategoriesCount || 0;
            }
            if (found.summary.extraCategoryUnitPrice) {
              extraUnitPrice = found.summary.extraCategoryUnitPrice;
            }
          }
        });

        const sortedMemberIds = Array.from(cluster).sort();
        const batchKey = `BATCH_PIN_${sortedMemberIds.join('_')}`;
        // 整批拼单一起收取超品费，批次只计一次
        const batchExtraFee = Number((maxExtraCats * extraUnitPrice).toFixed(2));

        batchBuckets.push({
          batchKey,
          batchFee: 175,
          batchExtraCategoryFee: batchExtraFee,
          batchExtraCategoriesCount: maxExtraCats,
          batchExtraUnitPrice: extraUnitPrice,
          shipments: memberSummaries,
        });
      } else {
        // Single shipment (Unlinked MERGED, STANDALONE, or EXEMPT)
        processedIds.add(sId);
        const batchFee = info.declType === 'STANDALONE' ? 350 : info.declType === 'EXEMPT' ? 0 : 175;
        const batchKey = `${info.declType}_${sId}`;
        const singleExtraFee = info.summary.extraCategoryFee || 0;
        batchBuckets.push({
          batchKey,
          batchFee,
          batchExtraCategoryFee: singleExtraFee,
          batchExtraCategoriesCount: info.summary.extraCategoriesCount || 0,
          batchExtraUnitPrice: info.summary.extraCategoryUnitPrice || 30,
          shipments: [info.summary],
        });
      }
    });

    const finalizedShipments: ShipmentFreightSummary[] = [];
    let monthlyCustomsFeeTotal = 0;
    let monthlyExtraCategoryFeeTotal = 0;

    batchBuckets.forEach(
      ({
        batchKey,
        batchFee,
        batchExtraCategoryFee,
        batchExtraCategoriesCount,
        batchExtraUnitPrice,
        shipments: batchShipments,
      }) => {
        monthlyCustomsFeeTotal += batchFee;
        monthlyExtraCategoryFeeTotal += batchExtraCategoryFee;

        batchShipments.forEach((shp, idx) => {
          const isMultiBatch = batchShipments.length > 1;
          const isLeader = isMultiBatch ? idx === 0 : false;
          // 关键：首票主计整批拼单的报关费与整批超品费，其余拼单货件为 0 元 (已由主票合并收取)
          const assignedCustomsFee = isLeader ? batchFee : 0;
          const assignedExtraCategoryFee = isLeader ? batchExtraCategoryFee : 0;

          const totalEstCost = Number(
            (shp.estimatedFreightFee + assignedCustomsFee + assignedExtraCategoryFee).toFixed(2)
          );

          const matched = contextShipmentMap.get(shp.shipmentId.trim().toUpperCase());
          const declType =
            matched?.customsDeclarationType ||
            shp.customsDeclarationType ||
            (shp.isMergedCustoms || matched?.isMergedCustoms ? 'MERGED' : 'STANDALONE');

          finalizedShipments.push({
            ...shp,
            isMergedCustoms: isMultiBatch ? true : declType === 'MERGED',
            customsDeclarationType: declType,
            mergedCustomsShipmentIds: matched?.mergedCustomsShipmentIds || shp.mergedCustomsShipmentIds || [],
            customsBatchId: isMultiBatch ? batchKey : (matched?.customsBatchId && !matched.customsBatchId.startsWith('BATCH_') && !matched.customsBatchId.startsWith('MERGED_') && !matched.customsBatchId.startsWith('STANDALONE_') ? matched.customsBatchId : undefined),
            isCustomsBatchLeader: isLeader,
            customsBatchShipmentCount: batchShipments.length,
            customsBatchTotalFee: batchFee,
            customsFee: assignedCustomsFee,
            extraCategoriesCount: batchExtraCategoriesCount,
            extraCategoryUnitPrice: batchExtraUnitPrice,
            extraCategoryFee: assignedExtraCategoryFee,
            batchExtraCategoryFee,
            isExtraCategoryBatchLeader: isLeader,
            estimatedTotalCost: totalEstCost,
            totalEstimatedCost: totalEstCost,
          });
        });
      }
    );

    const shipmentCount = finalizedShipments.length;
    const totalActualQty = finalizedShipments.reduce((sum, s) => sum + s.totalActualQty, 0);
    const totalCartons = finalizedShipments.reduce((sum, s) => sum + s.totalCartons, 0);
    const estimatedTotalChargeableWeight = Number(
      finalizedShipments.reduce((sum, s) => sum + s.totalEstimatedChargeableWeight, 0).toFixed(2)
    );
    const estimatedFreightFee = Number(
      finalizedShipments.reduce((sum, s) => sum + s.estimatedFreightFee, 0).toFixed(2)
    );
    const estimatedCustomsFee = Number(monthlyCustomsFeeTotal.toFixed(2));
    const extraCategoryFee = Number(monthlyExtraCategoryFeeTotal.toFixed(2));
    const estimatedTotalCost = Number(
      (estimatedFreightFee + estimatedCustomsFee + extraCategoryFee).toFixed(2)
    );

    const actualTotalChargeableWeight = Number(
      finalizedShipments
        .filter((s) => s.actualChargeableWeight !== undefined && s.actualChargeableWeight > 0)
        .reduce((sum, s) => sum + (s.actualChargeableWeight || 0), 0)
        .toFixed(2)
    );

    const actualTotalCost = Number(
      finalizedShipments
        .filter((s) => s.actualCost !== undefined && s.actualCost > 0)
        .reduce((sum, s) => sum + (s.actualCost || 0), 0)
        .toFixed(2)
    );

    const totalCostDiff = Number(
      finalizedShipments
        .filter((s) => s.costDiff !== undefined)
        .reduce((sum, s) => sum + (s.costDiff || 0), 0)
        .toFixed(2)
    );

    const totalCostDiffPercent =
      estimatedTotalCost > 0 ? (totalCostDiff / estimatedTotalCost) * 100 : 0;

    const reconciledShipmentCount = finalizedShipments.filter(
      (s) => s.actualCost !== undefined && s.actualCost > 0
    ).length;
    const pendingReconciliationCount = shipmentCount - reconciledShipmentCount;

    results.push({
      monthKey,
      monthDisplay: formatMonthDisplay(monthKey),
      shipments: finalizedShipments,
      shipmentCount,
      totalUnits: totalActualQty,
      totalActualQty,
      totalCartons,
      estimatedTotalChargeableWeight,
      totalEstimatedChargeableWeight: estimatedTotalChargeableWeight,
      estimatedFreightFee,
      estimatedFreightCost: estimatedFreightFee,
      customsFee: estimatedCustomsFee,
      estimatedCustomsFee,
      extraCategoryFee,
      estimatedExtraCategoryFee: extraCategoryFee,
      estimatedTotalCost,
      totalEstimatedCost: estimatedTotalCost,
      customsBatchCount: batchBuckets.length,
      actualTotalChargeableWeight,
      totalActualChargeableWeight: actualTotalChargeableWeight,
      actualTotalCost,
      totalActualCost: actualTotalCost,
      totalCostDiff,
      costDifference: totalCostDiff,
      costDifferencePercent: Number(totalCostDiffPercent.toFixed(1)),
      reconciledShipmentCount,
      unreconciledShipmentCount: pendingReconciliationCount,
      pendingReconciliationCount,
    });
  });

  // Sort months descending (e.g. 2026-08 before 2026-07)
  return results.sort((a, b) => b.monthKey.localeCompare(a.monthKey));
}

/**
 * Synchronizes shipment edits (e.g. shipDate, monthKey, warehouse/FC, carrier/channel, product title)
 * from Shipment Management into Freight Items.
 */
export function syncShipmentsToFreightItems(
  freightItems: FreightShippingItem[],
  updatedShipments: Shipment | Shipment[]
): {
  hasChanges: boolean;
  updatedItems: FreightShippingItem[];
} {
  const shipmentsList = Array.isArray(updatedShipments) ? updatedShipments : [updatedShipments];
  if (shipmentsList.length === 0 || !freightItems || freightItems.length === 0) {
    return { hasChanges: false, updatedItems: freightItems || [] };
  }

  const shipmentMap = new Map<string, Shipment>();
  shipmentsList.forEach((s) => {
    if (s && s.id) {
      shipmentMap.set(s.id.trim().toUpperCase(), s);
    }
  });

  let hasChanges = false;
  const updatedItems = freightItems.map((item) => {
    const sid = (item.shipmentId || '').trim().toUpperCase();
    const matchedShipment = shipmentMap.get(sid);
    if (!matchedShipment) return item;

    let itemChanged = false;
    let nextShipDate = item.shipDate;
    let nextMonthKey = item.monthKey;
    let nextWarehouse = item.warehouse;
    let nextChannel = item.channel;
    let nextProductName = item.productName;

    // 1. Sync shipDate & monthKey (e.g. 2026-08-14 -> 2026-08, 2026-07-31 -> 2026-07)
    if (matchedShipment.shipDate && matchedShipment.shipDate !== item.shipDate) {
      nextShipDate = normalizeDateString(matchedShipment.shipDate, item.shipDate);
      nextMonthKey = extractMonthKey(nextShipDate);
      itemChanged = true;
    }

    // 2. Sync warehouse (FC)
    if (matchedShipment.fc && matchedShipment.fc !== item.warehouse) {
      nextWarehouse = matchedShipment.fc.toUpperCase();
      itemChanged = true;
    }

    // 3. Sync carrier / channel if provided
    if (matchedShipment.carrier && matchedShipment.carrier !== item.channel) {
      nextChannel = matchedShipment.carrier;
      itemChanged = true;
    }

    // 4. Sync product name if matched SKU exists
    if (matchedShipment.items && matchedShipment.items.length > 0) {
      const matchedSkuItem = matchedShipment.items.find(
        (si) => si.sku.trim().toLowerCase() === item.sku.trim().toLowerCase()
      );
      if (
        matchedSkuItem?.productName &&
        matchedSkuItem.productName !== matchedSkuItem.sku &&
        matchedSkuItem.productName !== item.productName
      ) {
        nextProductName = matchedSkuItem.productName;
        itemChanged = true;
      }
    }

    // 5. Sync customs declaration configuration and explicit merged links
    let nextIsMerged = item.isMergedCustoms;
    let nextDeclType = item.customsDeclarationType;
    let nextMergedIds = item.mergedCustomsShipmentIds;

    if (matchedShipment.customsDeclarationType && matchedShipment.customsDeclarationType !== item.customsDeclarationType) {
      nextDeclType = matchedShipment.customsDeclarationType;
      itemChanged = true;
    }
    if (matchedShipment.isMergedCustoms !== undefined && matchedShipment.isMergedCustoms !== item.isMergedCustoms) {
      nextIsMerged = matchedShipment.isMergedCustoms;
      itemChanged = true;
    }
    if (matchedShipment.mergedCustomsShipmentIds) {
      const prevIdsStr = (item.mergedCustomsShipmentIds || []).slice().sort().join(',');
      const nextIdsStr = matchedShipment.mergedCustomsShipmentIds.slice().sort().join(',');
      if (prevIdsStr !== nextIdsStr) {
        nextMergedIds = [...matchedShipment.mergedCustomsShipmentIds];
        itemChanged = true;
      }
    }

    if (itemChanged) {
      hasChanges = true;
      const updatedItemObj: FreightShippingItem = {
        ...item,
        shipDate: nextShipDate,
        monthKey: nextMonthKey,
        warehouse: nextWarehouse,
        channel: nextChannel,
        productName: nextProductName,
        isMergedCustoms: nextIsMerged,
        customsDeclarationType: nextDeclType,
        mergedCustomsShipmentIds: nextMergedIds,
      };
      return calculateItemFreightMetrics(updatedItemObj);
    }
    return item;
  });

  return { hasChanges, updatedItems };
}

export interface ShipmentLevelUpdatePayload {
  shipmentId: string;
  unitPrice?: number;
  channel?: string;
  warehouse?: string;
  shipDate?: string;
  customsDeclarationType?: 'STANDALONE' | 'MERGED' | 'EXEMPT';
  mergedCustomsShipmentIds?: string[];
  extraCategoriesCount?: number;
  extraCategoryUnitPrice?: number;
}

/**
 * 批量更新某个货件的货件级属性 (物流单价、物流渠道、目的仓、发货日、报关方式、关联货件、超品情况等)，
 * 并自动同步至互为拼单关联的同行货件 (关联货件合并报关、共享超品申报)。
 */
export function applyShipmentLevelUpdates(
  freightItems: FreightShippingItem[],
  payload: ShipmentLevelUpdatePayload
): FreightShippingItem[] {
  const targetId = payload.shipmentId.trim().toUpperCase();
  const nextMonthKey = payload.shipDate ? extractMonthKey(payload.shipDate) : undefined;
  const isMerged =
    payload.customsDeclarationType !== undefined
      ? payload.customsDeclarationType === 'MERGED'
      : undefined;

  // 规范化关联列表 (去重且不包含自身)
  const explicitMergedIds = (payload.mergedCustomsShipmentIds || [])
    .map((id) => id.trim().toUpperCase())
    .filter((id) => id && id !== targetId);

  const peerIdsSet = new Set<string>(explicitMergedIds);

  const updatedList = freightItems.map((item) => {
    const itemShipmentId = item.shipmentId.trim().toUpperCase();

    // 1. 目标货件的所有条目 (整票货件通用属性统一更新生效)
    if (itemShipmentId === targetId) {
      const nextUnitPrice = payload.unitPrice !== undefined ? Number(payload.unitPrice) : item.unitPrice;
      const nextChannel = payload.channel !== undefined ? payload.channel.trim() : item.channel;
      const nextWarehouse = payload.warehouse !== undefined ? payload.warehouse.trim().toUpperCase() : item.warehouse;
      const nextShipDate = payload.shipDate !== undefined ? payload.shipDate : item.shipDate;
      const nextDeclType = payload.customsDeclarationType !== undefined ? payload.customsDeclarationType : item.customsDeclarationType;
      const nextExtraCount =
        payload.extraCategoriesCount !== undefined
          ? Math.max(0, Number(payload.extraCategoriesCount))
          : item.extraCategoriesCount || 0;
      const nextExtraPrice =
        payload.extraCategoryUnitPrice !== undefined
          ? Math.max(0, Number(payload.extraCategoryUnitPrice))
          : item.extraCategoryUnitPrice || 30;

      const updatedObj: FreightShippingItem = {
        ...item,
        unitPrice: nextUnitPrice,
        channel: nextChannel,
        warehouse: nextWarehouse,
        shipDate: nextShipDate,
        monthKey: nextMonthKey || item.monthKey,
        customsDeclarationType: nextDeclType,
        isMergedCustoms: isMerged !== undefined ? isMerged : item.isMergedCustoms,
        mergedCustomsShipmentIds: explicitMergedIds,
        extraCategoriesCount: nextExtraCount,
        extraCategoryUnitPrice: nextExtraPrice,
        extraCategoryFee: nextExtraCount * nextExtraPrice,
      };
      return calculateItemFreightMetrics(updatedObj);
    }

    // 2. 互为拼单关联的货件：如果设定了关联，同步报关方式为 MERGED，并同步超品设定 (互为关联拼单共享申报单与超品费)
    if (peerIdsSet.has(itemShipmentId)) {
      const peerMergedList = new Set<string>(
        (item.mergedCustomsShipmentIds || []).map((id) => id.trim().toUpperCase())
      );
      peerMergedList.add(targetId);
      explicitMergedIds.forEach((id) => {
        if (id !== itemShipmentId) peerMergedList.add(id);
      });
      peerMergedList.delete(itemShipmentId);

      const nextExtraCount =
        payload.extraCategoriesCount !== undefined
          ? Math.max(0, Number(payload.extraCategoriesCount))
          : item.extraCategoriesCount;
      const nextExtraPrice =
        payload.extraCategoryUnitPrice !== undefined
          ? Math.max(0, Number(payload.extraCategoryUnitPrice))
          : item.extraCategoryUnitPrice;

      const updatedObj: FreightShippingItem = {
        ...item,
        isMergedCustoms: true,
        customsDeclarationType: 'MERGED',
        mergedCustomsShipmentIds: Array.from(peerMergedList),
        extraCategoriesCount: nextExtraCount,
        extraCategoryUnitPrice: nextExtraPrice,
        extraCategoryFee: (nextExtraCount || 0) * (nextExtraPrice || 30),
      };
      return calculateItemFreightMetrics(updatedObj);
    }

    // 3. 之前与 targetId 关联但现在被用户从拼单中移除的货件：必须彻底解除与 targetId 的关联
    if (
      !peerIdsSet.has(itemShipmentId) &&
      (item.mergedCustomsShipmentIds || []).map((id) => id.trim().toUpperCase()).includes(targetId)
    ) {
      const remainingPeers = (item.mergedCustomsShipmentIds || [])
        .map((id) => id.trim().toUpperCase())
        .filter((id) => id !== targetId);

      const updatedObj: FreightShippingItem = {
        ...item,
        mergedCustomsShipmentIds: remainingPeers,
        isMergedCustoms: remainingPeers.length > 0,
        customsDeclarationType: remainingPeers.length > 0 ? item.customsDeclarationType : 'STANDALONE',
      };
      return calculateItemFreightMetrics(updatedObj);
    }

    return item;
  });

  return updatedList;
}

