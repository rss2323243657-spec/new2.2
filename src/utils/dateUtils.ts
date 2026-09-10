/**
 * Date calculation and validation utilities for Walmart Inbound & 10-Day Case rules
 */

/**
 * Universal date string normalizer.
 * Properly handles YYYY/M/D, YYYY-MM-DD, M/D/YYYY, M/D/YY, Excel serial numbers, and JS Dates.
 * Guarantees output is strictly YYYY-MM-DD.
 */
export function normalizeDateString(rawDate: any, fallback: string = '2026-08-01'): string {
  if (rawDate === undefined || rawDate === null || rawDate === '') {
    return fallback;
  }

  // 1. If Date instance
  if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
    const y = rawDate.getFullYear();
    const m = String(rawDate.getMonth() + 1).padStart(2, '0');
    const d = String(rawDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 2. If Excel serial number (e.g. 46256, representing days since 1899-12-30)
  if (typeof rawDate === 'number' && rawDate > 20000 && rawDate < 80000) {
    const date = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
    if (!isNaN(date.getTime())) {
      const y = date.getUTCFullYear();
      const m = String(date.getUTCMonth() + 1).padStart(2, '0');
      const d = String(date.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }

  const str = String(rawDate).trim();
  if (!str) return fallback;

  // Clean Chinese characters like 2026年8月22日 -> 2026-8-22
  const cleaned = str
    .replace(/[年月]/g, '-')
    .replace(/[日号]/g, '')
    .replace(/[.\/]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();

  // If contains space or 'T' (e.g. 2026-08-22 14:00:00 or ISO)
  const datePart = cleaned.split(/[\sT]/)[0];

  // Match parts
  const parts = datePart.split('-').map((p) => p.trim()).filter(Boolean);

  if (parts.length === 3) {
    const p0 = Number(parts[0]);
    const p1 = Number(parts[1]);
    const p2 = Number(parts[2]);

    if (!isNaN(p0) && !isNaN(p1) && !isNaN(p2)) {
      // Case A: First part is 4-digit Year (e.g. 2026-8-22 or 2026/8/22)
      if (p0 >= 1900 && p0 <= 2100) {
        const y = p0;
        const m = String(Math.min(12, Math.max(1, p1))).padStart(2, '0');
        const d = String(Math.min(31, Math.max(1, p2))).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }

      // Case B: Last part is 4-digit Year (e.g. 8-22-2026 or 22-8-2026)
      if (p2 >= 1900 && p2 <= 2100) {
        const y = p2;
        let m = p0;
        let d = p1;
        // If p0 > 12 and p1 <= 12, it's likely DD-MM-YYYY
        if (p0 > 12 && p1 <= 12) {
          d = p0;
          m = p1;
        }
        const mStr = String(Math.min(12, Math.max(1, m))).padStart(2, '0');
        const dStr = String(Math.min(31, Math.max(1, d))).padStart(2, '0');
        return `${y}-${mStr}-${dStr}`;
      }

      // Case C: Short year (e.g. 26-8-22 or 8-22-26)
      if (p0 <= 99 && p0 >= 20) {
        // e.g. 26-8-22 -> 2026-08-22
        const y = 2000 + p0;
        const m = String(Math.min(12, Math.max(1, p1))).padStart(2, '0');
        const d = String(Math.min(31, Math.max(1, p2))).padStart(2, '0');
        return `${y}-${m}-${d}`;
      } else if (p2 <= 99 && p2 >= 20) {
        // e.g. 8-22-26 -> 2026-08-22
        const y = 2000 + p2;
        let m = p0;
        let d = p1;
        if (p0 > 12 && p1 <= 12) {
          d = p0;
          m = p1;
        }
        const mStr = String(Math.min(12, Math.max(1, m))).padStart(2, '0');
        const dStr = String(Math.min(31, Math.max(1, d))).padStart(2, '0');
        return `${y}-${mStr}-${dStr}`;
      }
    }
  }

  // Fallback check if valid date
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return fallback;
}

export function getTodayString(simulatedDate?: string): string {
  if (simulatedDate && isValidDate(simulatedDate)) {
    return simulatedDate;
  }
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isValidDate(dateStr?: string | null): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const match = dateStr.match(/^\d{4}-\d{2}-\d{2}$/);
  if (!match) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(dateStr: string, days: number): string {
  if (!isValidDate(dateStr)) return '';
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

export const addDaysToDate = addDays;

export function diffInDays(dateStr1: string, dateStr2: string): number {
  if (!isValidDate(dateStr1) || !isValidDate(dateStr2)) return 0;
  const d1 = parseDate(dateStr1);
  const d2 = parseDate(dateStr2);
  const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
  const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
  return Math.floor((utc1 - utc2) / (1000 * 60 * 60 * 24));
}

export function calculateDaysDifference(startDate: string, endDate: string): number {
  return diffInDays(endDate, startDate);
}

/**
 * Calculates Case eligible date: Arrival Date + threshold (10 days)
 */
export function getCaseEligibleDate(arrivalDate?: string, thresholdDays: number = 10): string | undefined {
  if (!arrivalDate || !isValidDate(arrivalDate)) return undefined;
  return addDays(arrivalDate, thresholdDays);
}

/**
 * Days since arrival: Today - Arrival Date
 */
export function getDaysSinceArrival(arrivalDate?: string, todayStr?: string): number | undefined {
  if (!arrivalDate || !isValidDate(arrivalDate)) return undefined;
  const today = todayStr || getTodayString();
  return diffInDays(today, arrivalDate);
}

/**
 * Days until Case eligible: Case Eligible Date - Today
 * > 0: Still Y days to go
 * === 0: Exactly today reached
 * < 0: Overdue by |X| days
 */
export function getDaysUntilCase(arrivalDate?: string, todayStr?: string, thresholdDays: number = 10): number | undefined {
  if (!arrivalDate || !isValidDate(arrivalDate)) return undefined;
  const eligibleDate = getCaseEligibleDate(arrivalDate, thresholdDays);
  if (!eligibleDate) return undefined;
  const today = todayStr || getTodayString();
  return diffInDays(eligibleDate, today);
}

/**
 * Human-readable prompt status string
 */
export function getCaseTimeDisplay(arrivalDate?: string, todayStr?: string, thresholdDays: number = 10): {
  text: string;
  badgeClass: string;
  statusType: 'no_arrival' | 'approaching' | 'eligible' | 'overdue' | 'observing';
  daysSince?: number;
  daysRemaining?: number;
  overdueDays?: number;
} {
  if (!arrivalDate || !isValidDate(arrivalDate)) {
    return {
      text: '暂无实际到仓日期 (无法计算Case)',
      badgeClass: 'bg-gray-100 text-gray-600 border-gray-200',
      statusType: 'no_arrival',
    };
  }

  const daysSince = getDaysSinceArrival(arrivalDate, todayStr) ?? 0;
  const daysUntil = getDaysUntilCase(arrivalDate, todayStr, thresholdDays) ?? 0;

  if (daysUntil < 0) {
    const overdue = Math.abs(daysUntil);
    return {
      text: `已超期 ${overdue} 天未开Case (已到仓 ${daysSince} 天)`,
      badgeClass: 'bg-red-50 text-red-700 border-red-200 font-medium animate-pulse',
      statusType: 'overdue',
      daysSince,
      overdueDays: overdue,
    };
  } else if (daysUntil === 0) {
    return {
      text: `今日达到 10 天 Case 条件 (已到仓 ${daysSince} 天)`,
      badgeClass: 'bg-red-50 text-red-700 border-red-300 font-medium',
      statusType: 'eligible',
      daysSince,
      daysRemaining: 0,
    };
  } else if (daysUntil <= 3) {
    return {
      text: `还需 ${daysUntil} 天达到Case条件 (已到仓 ${daysSince} 天)`,
      badgeClass: 'bg-amber-50 text-amber-700 border-amber-300 font-medium',
      statusType: 'approaching',
      daysSince,
      daysRemaining: daysUntil,
    };
  } else {
    return {
      text: `已到仓 ${daysSince} 天 (还需 ${daysUntil} 天)`,
      badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
      statusType: 'observing',
      daysSince,
      daysRemaining: daysUntil,
    };
  }
}

/**
 * Checks for date logic anomalies
 */
export function checkDateAnomalies(shipDate?: string, arrivalDate?: string, receivedDate?: string): string[] {
  const errors: string[] = [];
  if (shipDate && arrivalDate && isValidDate(shipDate) && isValidDate(arrivalDate)) {
    if (diffInDays(arrivalDate, shipDate) < 0) {
      errors.push(`到仓日期 (${arrivalDate}) 早于发货日期 (${shipDate})，存在日期逻辑错误`);
    }
  }
  if (arrivalDate && receivedDate && isValidDate(arrivalDate) && isValidDate(receivedDate)) {
    if (diffInDays(receivedDate, arrivalDate) < 0) {
      errors.push(`接收日期 (${receivedDate}) 早于实际到仓日期 (${arrivalDate})，请核对报表`);
    }
  }
  return errors;
}
