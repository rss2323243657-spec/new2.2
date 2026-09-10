import React, { useState } from 'react';
import {
  LayoutDashboard,
  Truck,
  AlertTriangle,
  FileCheck,
  Boxes,
  Layers,
  BellRing,
  UploadCloud,
  ShieldCheck,
  History,
  Settings,
  Sparkles,
  Trash2,
  Calculator,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'shipments'
  | 'freight'
  | 'discrepancies'
  | 'cases'
  | 'inventory'
  | 'inventory-alerts'
  | 'data-import'
  | 'data-quality'
  | 'history-ledger'
  | 'settings';

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  discrepancyCount?: number;
  caseEligibleCount?: number;
  anomalyCount?: number;
  lowStockCount?: number;
  badgeCounts?: {
    shipments?: number;
    discrepancies?: number;
    cases?: number;
    inventoryAlerts?: number;
    dataQuality?: number;
  };
  onResetDemo?: () => void;
  onClearAllData?: () => void;
}

interface NavGroup {
  id: string;
  title: string;
  items: {
    id: NavTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number | null;
    badgeColor?: string;
  }[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  discrepancyCount = 0,
  caseEligibleCount = 0,
  anomalyCount = 0,
  lowStockCount = 0,
  badgeCounts,
  onResetDemo,
  onClearAllData,
}) => {
  const actualDiscrepancyCount = badgeCounts?.discrepancies ?? discrepancyCount;
  const actualCaseCount = badgeCounts?.cases ?? caseEligibleCount;
  const actualAnomalyCount = badgeCounts?.dataQuality ?? anomalyCount;
  const actualLowStockCount = badgeCounts?.inventoryAlerts ?? lowStockCount;

  // Track collapsed groups
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    core: false,
    inventory: false,
    data: false,
  });

  const toggleGroup = (groupId: string) => {
    setCollapsedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const navGroups: NavGroup[] = [
    {
      id: 'core',
      title: '核心业务',
      items: [
        {
          id: 'dashboard',
          label: 'Dashboard 总览',
          icon: LayoutDashboard,
          badge: null,
        },
        {
          id: 'shipments',
          label: '货件管理',
          icon: Truck,
          badge: null,
        },
        {
          id: 'freight',
          label: '头程费用管理',
          icon: Calculator,
          badge: null,
        },
        {
          id: 'discrepancies',
          label: '收货差异',
          icon: AlertTriangle,
          badge: actualDiscrepancyCount > 0 ? actualDiscrepancyCount : null,
          badgeColor: 'bg-amber-100 text-amber-800 border-amber-300',
        },
        {
          id: 'cases',
          label: 'Case 管理',
          icon: FileCheck,
          badge: actualCaseCount > 0 ? actualCaseCount : null,
          badgeColor: 'bg-red-100 text-red-800 border-red-300 font-bold animate-pulse',
        },
      ],
    },
    {
      id: 'inventory',
      title: '库存与预警',
      items: [
        {
          id: 'inventory',
          label: '库存管理',
          icon: Boxes,
          badge: null,
        },
        {
          id: 'inventory-alerts',
          label: '库存预警',
          icon: BellRing,
          badge: actualLowStockCount > 0 ? actualLowStockCount : null,
          badgeColor: 'bg-orange-100 text-orange-800 border-orange-300',
        },
      ],
    },
    {
      id: 'data',
      title: '数据与设置',
      items: [
        {
          id: 'data-import',
          label: '数据导入中心',
          icon: UploadCloud,
          badge: null,
        },
        {
          id: 'data-quality',
          label: '数据质量中心',
          icon: ShieldCheck,
          badge: actualAnomalyCount > 0 ? actualAnomalyCount : null,
          badgeColor: 'bg-red-100 text-red-700 border-red-200',
        },
        {
          id: 'history-ledger',
          label: '库存流水与日志',
          icon: History,
          badge: null,
        },
        {
          id: 'settings',
          label: '系统设置',
          icon: Settings,
          badge: null,
        },
      ],
    },
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col flex-shrink-0 border-r border-slate-800 select-none">
      {/* Brand Header */}
      <div className="p-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            W
          </div>
          <div>
            <div className="text-white font-semibold text-sm leading-tight flex items-center gap-1.5">
              Walmart Inbound
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-400/30">
                US
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              库存与货件全生命周期
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Groups with Accordion */}
      <nav className="flex-1 px-3 py-3 space-y-4 overflow-y-auto">
        {navGroups.map((group) => {
          const isCollapsed = collapsedGroups[group.id];
          const hasActiveChild = group.items.some((it) => it.id === currentTab);

          return (
            <div key={group.id} className="space-y-1">
              {/* Group Header Button */}
              <button
                onClick={() => toggleGroup(group.id)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-200 transition-colors group"
              >
                <span className="flex items-center gap-1.5">
                  {group.title}
                  {hasActiveChild && isCollapsed && (
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span>
                  )}
                </span>
                {isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-transform" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-transform" />
                )}
              </button>

              {/* Group Items */}
              {!isCollapsed && (
                <div className="space-y-1 pt-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => onSelectTab(item.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-sm font-semibold'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                          <span>{item.label}</span>
                        </div>
                        {item.badge !== null && item.badge !== undefined && (
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                              item.badgeColor || 'bg-slate-700 text-slate-300'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Quick Reference Data Actions */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/60 space-y-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 px-1">
          数据与环境
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-xs">
          {onResetDemo && (
            <button
              onClick={onResetDemo}
              title="运行/加载沃尔玛标准参考数据"
              className="px-2 py-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 rounded-lg font-medium text-[11px] flex items-center justify-center gap-1 transition-colors"
            >
              <Sparkles className="w-3 h-3 text-amber-400" />
              <span>运行参考数据</span>
            </button>
          )}

          {onClearAllData && (
            <button
              onClick={onClearAllData}
              title="清空所有本地业务数据"
              className="px-2 py-1.5 bg-slate-800 hover:bg-red-500/20 border border-slate-700 hover:border-red-500/30 text-slate-400 hover:text-red-300 rounded-lg font-medium text-[11px] flex items-center justify-center gap-1 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              <span>清空数据</span>
            </button>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="px-3 py-2.5 border-t border-slate-800 text-[11px] text-slate-400 bg-slate-950/80">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            本地持久化就绪
          </span>
          <span className="text-[10px] text-slate-500 font-mono">Walmart US</span>
        </div>
      </div>
    </aside>
  );
};

