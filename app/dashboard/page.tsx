'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';

// This pulls your keys safely from your .env.local file
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// The Start Date the dashboard opens with is saved here in the browser, so
// it survives reloads (but is local to this browser -- not synced to
// Supabase or other devices).
const DEFAULT_START_DATE_KEY = 'msd_default_start_date';
const FALLBACK_START_DATE = '2026-01-01';

type Tab = 'overview' | 'wages' | 'budget' | 'suppliers' | 'tree' | 'projections';

type CostTreeNode = {
  total: number;
  children?: Record<string, CostTreeNode>;
  items?: any[];
};

function buildCostTree(rows: any[]): Record<string, CostTreeNode> {
  const root: Record<string, CostTreeNode> = {};
  for (const r of rows) {
    const acct = r.account || 'Uncategorized';
    const dept = r.dept || 'Uncategorized';
    const store = r.store_name || 'Unknown Store';
    const supplier = r.supplier || 'Unknown Supplier';
    const total = Number(r.total || 0);

    root[acct] = root[acct] || { total: 0, children: {} };
    root[acct].total += total;
    const depts = root[acct].children!;

    depts[dept] = depts[dept] || { total: 0, children: {} };
    depts[dept].total += total;
    const stores = depts[dept].children!;

    stores[store] = stores[store] || { total: 0, children: {} };
    stores[store].total += total;
    const suppliers = stores[store].children!;

    suppliers[supplier] = suppliers[supplier] || { total: 0, items: [] };
    suppliers[supplier].total += total;
    suppliers[supplier].items!.push(r);
  }
  return root;
}

function sortedEntries(children: Record<string, CostTreeNode>) {
  return Object.entries(children).sort((a, b) => b[1].total - a[1].total);
}

function Spinner() {
  return (
    <svg className="animate-spin h-5 w-5 text-blue-500" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="p-12 flex flex-col items-center justify-center gap-3 text-sm font-medium text-gray-400 bg-white rounded-xl border border-gray-200">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

const LEVEL_STYLES = [
  { icon: '🏢', label: 'Account' },
  { icon: '📁', label: 'Department' },
  { icon: '🏬', label: 'Store' },
  { icon: '🚚', label: 'Supplier' },
];

function CostTreeRow({
  name, node, path, level, expanded, onToggle, formatGBP, parentTotal,
}: {
  name: string;
  node: CostTreeNode;
  path: string;
  level: number;
  expanded: Set<string>;
  onToggle: (key: string) => void;
  formatGBP: (n: number) => string;
  parentTotal: number;
}) {
  const isOpen = expanded.has(path);
  const isLeafContainer = !!node.items;
  const hasChildren = !!node.children && Object.keys(node.children).length > 0;
  const canExpand = hasChildren || isLeafContainer;
  const pct = parentTotal > 0 ? Math.round((node.total / parentTotal) * 100) : 0;
  const style = LEVEL_STYLES[Math.min(level, LEVEL_STYLES.length - 1)];

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => canExpand && onToggle(path)}
        disabled={!canExpand}
        className={`w-full flex items-center gap-2 py-2.5 pr-3 text-left hover:bg-gray-50 transition ${canExpand ? 'cursor-pointer' : 'cursor-default'}`}
        style={{ paddingLeft: `${12 + level * 22}px` }}
      >
        <span className={`w-4 text-xs text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}>
          {canExpand ? '▶' : ''}
        </span>
        <span className="text-sm">{style.icon}</span>
        <span className={`text-sm flex-1 truncate ${level === 0 ? 'font-bold text-gray-900' : level === 1 ? 'font-semibold text-gray-800' : 'text-gray-700'}`}>
          {name}
        </span>
        <span className="hidden sm:block w-24 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <span className="block h-full bg-blue-400" style={{ width: `${pct}%` }} />
        </span>
        <span className={`text-sm tabular-nums ${level === 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
          {formatGBP(node.total)}
        </span>
      </button>

      {isOpen && hasChildren && (
        <div>
          {sortedEntries(node.children!).map(([childName, childNode]) => (
            <CostTreeRow
              key={path + '::' + childName}
              name={childName}
              node={childNode}
              path={path + '::' + childName}
              level={level + 1}
              expanded={expanded}
              onToggle={onToggle}
              formatGBP={formatGBP}
              parentTotal={node.total}
            />
          ))}
        </div>
      )}

      {isOpen && isLeafContainer && (
        <div className="bg-gray-50/60" style={{ paddingLeft: `${12 + (level + 1) * 22}px` }}>
          {node.items!.map((it, idx) => (
            <div key={idx} className="flex items-center gap-3 py-2 pr-3 text-xs text-gray-600 border-t border-dashed border-gray-200 first:border-t-0">
              <span className="w-20 shrink-0 text-gray-400">{it.invoice_date}</span>
              <span className="flex-1 truncate">{it.details || '—'}</span>
              <span className="font-medium tabular-nums text-gray-800">{formatGBP(Number(it.total || 0))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

// Every quarter start must be Feb/May/Aug/Nov 1st - this generates the
// selectable list (2 years back through 1 year ahead of today).
function buildQuarterOptions() {
  const now = new Date();
  const thisYear = now.getFullYear();
  const opts: { value: string; label: string }[] = [];
  const quarters = [
    { month: 2, label: 'Q1', range: 'Feb-Apr' },
    { month: 5, label: 'Q2', range: 'May-Jul' },
    { month: 8, label: 'Q3', range: 'Aug-Oct' },
    { month: 11, label: 'Q4', range: 'Nov-Jan' },
  ];
  for (let y = thisYear - 2; y <= thisYear + 1; y++) {
    for (const q of quarters) {
      opts.push({
        value: `${y}-${pad2(q.month)}-01`,
        label: `${q.label} ${y} (${q.range})`,
      });
    }
  }
  return opts;
}

// Which Feb/May/Aug/Nov quarter today falls into, as a starting default.
function getCurrentQuarterStart() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12
  const starts = [2, 5, 8, 11];
  let chosenMonth = 11;
  let chosenYear = y - 1;
  for (const sm of starts) {
    if (m >= sm) { chosenMonth = sm; chosenYear = y; }
  }
  // If we're in Jan, the current quarter started Nov of last year.
  if (m === 1) { chosenMonth = 11; chosenYear = y - 1; }
  return `${chosenYear}-${pad2(chosenMonth)}-01`;
}

// Given a fiscal quarter start (Feb/May/Aug/Nov 1st), returns that quarter's
// end date -- mirrors the Postgres quarter_end_for() helper so the frontend
// and database always agree on where a quarter ends.
function quarterEndFromStart(qStartStr: string): string {
  const d = new Date(qStartStr + 'T00:00:00');
  d.setMonth(d.getMonth() + 3);
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default function MobileFriendlyDashboard() {
  const [tab, setTab] = useState<Tab>('overview');

  const [startDate, setStartDate] = useState(FALLBACK_START_DATE);
  const [endDate, setEndDate] = useState('2026-12-31');
  const [branchId, setBranchId] = useState<string>('all');
  const [branches, setBranches] = useState<any[]>([]);
  const [reportData, setReportData] = useState<any[]>([]);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 'total' = single totals row/table for the selected range (existing view)
  // 'weekly' = one row per week across the selected range
  const [viewMode, setViewMode] = useState<'total' | 'weekly'>('total');

  // Lets any date-range tab (Overview, Wages, Suppliers, Cost Tree, Projections)
  // be driven by a fiscal quarter picker instead of manual Start/End dates.
  // Picking a quarter sets startDate/endDate to that quarter's bounds.
  const [dateMode, setDateMode] = useState<'range' | 'quarter'>('range');
  const [reportQuarter, setReportQuarter] = useState<string>(() => getCurrentQuarterStart());

  // Settings panel: lets you change which Start Date the dashboard opens
  // with by default. Starts blank; filled in from localStorage on mount.
  const [showSettings, setShowSettings] = useState(false);
  const [savedDefaultStartDate, setSavedDefaultStartDate] = useState<string | null>(null);
  const [defaultStartDateDraft, setDefaultStartDateDraft] = useState(FALLBACK_START_DATE);

  // Column View Toggles
  const [showSales, setShowSales] = useState(true);
  const [showCosts, setShowCosts] = useState(true);
  const [showGrossProfit, setShowGrossProfit] = useState(true);
  const [showProfit, setShowProfit] = useState(true);

  // --- Wages detail (filter by week / store / hours worked) ---------------
  const [wagesData, setWagesData] = useState<any[]>([]);
  const [wagesLoading, setWagesLoading] = useState(false);
  const [wagesError, setWagesError] = useState<string | null>(null);

  // --- Hours budget (quarterly, read + write) ------------------------------
  const quarterOptions = useMemo(() => buildQuarterOptions(), []);
  const [budgetQuarter, setBudgetQuarter] = useState<string>(() => getCurrentQuarterStart());
  const [budgetStatus, setBudgetStatus] = useState<any[]>([]);
  const [budgetLoading, setBudgetLoading] = useState(false);
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [budgetFormStore, setBudgetFormStore] = useState<string>('');
  const [budgetFormHours, setBudgetFormHours] = useState<string>('');
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [budgetSaveMsg, setBudgetSaveMsg] = useState<string | null>(null);

  // --- Supplier report (filter by invoice date / date range + supplier) ---
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [supplierFilter, setSupplierFilter] = useState<string>('all');
  const [supplierData, setSupplierData] = useState<any[]>([]);
  const [supplierLoading, setSupplierLoading] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);

  // --- Projections (projected vs actual, from the "projections" table) ---
  const [projectionsData, setProjectionsData] = useState<any[]>([]);
  const [projectionsWeeklyData, setProjectionsWeeklyData] = useState<any[]>([]);
  const [projectionsViewMode, setProjectionsViewMode] = useState<'total' | 'weekly'>('total');
  const [projectionsLoading, setProjectionsLoading] = useState(false);
  const [projectionsError, setProjectionsError] = useState<string | null>(null);

  // --- Cost tree (Account -> Dept -> Store -> Supplier -> line items) -----
  const [treeData, setTreeData] = useState<any[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

  function toggleNode(key: string) {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function loadSuppliers() {
    const { data } = await supabase.rpc('get_suppliers');
    if (data) setSuppliers(data.map((r: any) => r.supplier));
  }

  async function fetchSupplierReport() {
    setSupplierLoading(true);
    setSupplierError(null);
    const { data, error } = await supabase.rpc('get_supplier_report', {
      start_date: startDate,
      end_date: endDate,
      supplier_param: supplierFilter === 'all' ? null : supplierFilter,
      branch_id_param: branchId === 'all' ? null : parseInt(branchId)
    });
    if (error) setSupplierError(error.message);
    else if (data) setSupplierData(data);
    setSupplierLoading(false);
  }

  async function fetchCostTree() {
    setTreeLoading(true);
    setTreeError(null);
    const { data, error } = await supabase.rpc('get_supplier_report', {
      start_date: startDate,
      end_date: endDate,
      supplier_param: null,
      branch_id_param: branchId === 'all' ? null : parseInt(branchId)
    });
    if (error) setTreeError(error.message);
    else if (data) setTreeData(data);
    setTreeLoading(false);
  }

  async function loadBranches() {
    // The actual Supabase table is "Stores" (Store_code / Store_Name), not
    // "branches" -- aliasing Store_Name to "name" here keeps the rest of
    // this component (which expects { id, name }) unchanged.
    const { data } = await supabase.from('Stores').select('id, name:Store_Name');
    if (data) setBranches(data);
  }

  async function fetchReport() {
    setLoading(true);
    setErrorMsg(null);
    const { data, error } = await supabase.rpc('get_sales_report', {
      start_date: startDate,
      end_date: endDate,
      branch_id_param: branchId === 'all' ? null : parseInt(branchId)
    });
    if (error) setErrorMsg(error.message);
    else if (data) setReportData(data);
    setLoading(false);
  }

  async function fetchWeeklyReport() {
    setLoading(true);
    setErrorMsg(null);
    const { data, error } = await supabase.rpc('get_sales_report_weekly', {
      start_date: startDate,
      end_date: endDate,
      branch_id_param: branchId === 'all' ? null : parseInt(branchId)
    });
    if (error) setErrorMsg(error.message);
    else if (data) setWeeklyData(data);
    setLoading(false);
  }

  // Sets startDate/endDate to the bounds of the chosen fiscal quarter.
  // Called whenever dateMode is 'quarter' and reportQuarter changes.
  function applyQuarterToRange(qStart: string) {
    setReportQuarter(qStart);
    setStartDate(qStart);
    setEndDate(quarterEndFromStart(qStart));
  }

  async function fetchProjectionsReport() {
    setProjectionsLoading(true);
    setProjectionsError(null);
    const { data, error } = await supabase.rpc('get_projections_report', {
      start_date: startDate,
      end_date: endDate,
      branch_id_param: branchId === 'all' ? null : parseInt(branchId)
    });
    if (error) setProjectionsError(error.message);
    else if (data) setProjectionsData(data);
    setProjectionsLoading(false);
  }

  async function fetchProjectionsWeeklyReport() {
    setProjectionsLoading(true);
    setProjectionsError(null);
    const { data, error } = await supabase.rpc('get_projections_report_weekly', {
      start_date: startDate,
      end_date: endDate,
      branch_id_param: branchId === 'all' ? null : parseInt(branchId)
    });
    if (error) setProjectionsError(error.message);
    else if (data) setProjectionsWeeklyData(data);
    setProjectionsLoading(false);
  }

  async function fetchWagesDetail() {
    setWagesLoading(true);
    setWagesError(null);
    const { data, error } = await supabase.rpc('get_wages_detail', {
      start_date: startDate,
      end_date: endDate,
      branch_id_param: branchId === 'all' ? null : parseInt(branchId)
    });
    if (error) setWagesError(error.message);
    else if (data) setWagesData(data);
    setWagesLoading(false);
  }

  async function fetchBudgetStatus() {
    setBudgetLoading(true);
    setBudgetError(null);
    const { data, error } = await supabase.rpc('get_hours_budget_status', {
      quarter_start_param: budgetQuarter,
      branch_id_param: branchId === 'all' ? null : parseInt(branchId)
    });
    if (error) setBudgetError(error.message);
    else if (data) setBudgetStatus(data);
    setBudgetLoading(false);
  }

  async function saveBudget() {
    if (!budgetFormStore || budgetFormHours === '') return;
    setBudgetSaving(true);
    setBudgetSaveMsg(null);
    const hoursNum = parseFloat(budgetFormHours);
    const { error } = await supabase
      .from('hours_budget')
      .upsert(
        { store_name: budgetFormStore, quarter_start: budgetQuarter, budget_hours: hoursNum },
        { onConflict: 'store_name,quarter_start' }
      );
    if (error) {
      setBudgetSaveMsg(`Failed to save: ${error.message}`);
    } else {
      setBudgetSaveMsg(`Saved ${hoursNum} budgeted hours for ${budgetFormStore}.`);
      setBudgetFormHours('');
      fetchBudgetStatus();
    }
    setBudgetSaving(false);
  }

  useEffect(() => { loadBranches(); loadSuppliers(); }, []);

  // On first load, apply the saved default Start Date (if one was set in
  // an earlier visit) instead of the hardcoded fallback.
  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(DEFAULT_START_DATE_KEY) : null;
    if (saved) {
      setSavedDefaultStartDate(saved);
      setDefaultStartDateDraft(saved);
      setStartDate(saved);
    }
  }, []);

  useEffect(() => {
    if (tab !== 'overview') return;
    if (viewMode === 'weekly') fetchWeeklyReport();
    else fetchReport();
  }, [tab, startDate, endDate, branchId, viewMode]);

  useEffect(() => {
    if (tab === 'wages') fetchWagesDetail();
  }, [tab, startDate, endDate, branchId]);

  useEffect(() => {
    if (tab !== 'projections') return;
    if (projectionsViewMode === 'weekly') fetchProjectionsWeeklyReport();
    else fetchProjectionsReport();
  }, [tab, startDate, endDate, branchId, projectionsViewMode]);

  useEffect(() => {
    if (tab === 'budget') fetchBudgetStatus();
  }, [tab, budgetQuarter, branchId]);

  useEffect(() => {
    if (tab === 'suppliers') fetchSupplierReport();
  }, [tab, startDate, endDate, branchId, supplierFilter]);

  useEffect(() => {
    if (tab === 'tree') fetchCostTree();
  }, [tab, startDate, endDate, branchId]);

  function saveDefaultStartDate() {
    localStorage.setItem(DEFAULT_START_DATE_KEY, defaultStartDateDraft);
    setSavedDefaultStartDate(defaultStartDateDraft);
    setStartDate(defaultStartDateDraft);
  }

  function clearDefaultStartDate() {
    localStorage.removeItem(DEFAULT_START_DATE_KEY);
    setSavedDefaultStartDate(null);
    setDefaultStartDateDraft(FALLBACK_START_DATE);
  }

  // Format a number as GBP, e.g. 12345.6 -> "£12,345.60"
  const formatGBP = (n: number) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);

  const formatHours = (n: number) =>
    new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 }).format(n || 0);

  // 📥 Function to Convert Data and Download CSV File
  const downloadCSV = () => {
    const activeData = viewMode === 'weekly' ? weeklyData : reportData;
    if (activeData.length === 0) return;

    const headers = [viewMode === 'weekly' ? 'Week' : 'Branch Name'];
    if (showSales) headers.push('Total Sales');
    if (showCosts) headers.push('Total Costs');
    if (showGrossProfit) headers.push('Gross Profit %');
    if (showProfit) headers.push('Net Profit');

    const csvRows = [headers.join(',')];

    for (const row of activeData) {
      const label = viewMode === 'weekly' ? `${row.week_start} to ${row.week_end}` : row.branch_name;
      const values = [ `"${label.replace(/"/g, '""')}"` ];
      if (showSales) values.push(row.total_sales);
      if (showCosts) values.push(row.total_costs);
      if (showGrossProfit) values.push(row.gross_profit_pct);
      if (showProfit) values.push(row.net_profit);
      csvRows.push(values.join(','));
    }

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.setAttribute('href', url);
    link.setAttribute('download', `sales_report_${startDate}_to_${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadWagesCSV = () => {
    if (wagesData.length === 0) return;
    const headers = ['Week', 'Store', 'Day Hours', 'Night Hours', 'Hol Hours', 'Total Hours', 'Wages Cost', 'NI Cost', 'Pension Cost', 'Total Wage Cost'];
    const csvRows = [headers.join(',')];
    for (const row of wagesData) {
      csvRows.push([
        `"${row.week_start} to ${row.week_end}"`,
        `"${String(row.branch_name).replace(/"/g, '""')}"`,
        row.day_hours, row.night_hours, row.hol_hours, row.total_hours,
        row.wages_cost, row.ni_cost, row.pension_cost, row.total_wage_cost,
      ].join(','));
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `wages_detail_${startDate}_to_${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadProjectionsCSV = () => {
    const activeData = projectionsViewMode === 'weekly' ? projectionsWeeklyData : projectionsData;
    if (activeData.length === 0) return;
    const headers = [projectionsViewMode === 'weekly' ? 'Week' : 'Store', 'Projected Turnover', 'Actual Sales', 'Sales Variance', 'Sales Variance %', 'Projected GP %', 'Actual GP %', 'GP Variance', 'Projected Waste %'];
    const csvRows = [headers.join(',')];
    for (const row of activeData) {
      const label = projectionsViewMode === 'weekly' ? `${row.week_start} to ${row.week_end}` : row.branch_name;
      csvRows.push([
        `"${String(label).replace(/"/g, '""')}"`,
        row.projected_turnover, row.actual_sales, row.sales_variance, row.sales_variance_pct,
        row.projected_gp_pct, row.actual_gp_pct, row.gp_variance_pct, row.projected_waste_pct,
      ].join(','));
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `projections_report_${startDate}_to_${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const supplierTotals = useMemo(() => {
    return supplierData.reduce(
      (acc, r) => ({ total: acc.total + Number(r.total || 0), vat: acc.vat + Number(r.vat || 0) }),
      { total: 0, vat: 0 }
    );
  }, [supplierData]);

  // Breakdown of the current supplier/date filter across every branch it
  // touched -- lets you see one supplier's spend by branch at a glance,
  // regardless of whether the top Store Filter is set to "All" or one store.
  const supplierByBranch = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of supplierData) {
      const store = r.store_name || 'Unknown Store';
      map.set(store, (map.get(store) || 0) + Number(r.total || 0));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [supplierData]);

  const costTree = useMemo(() => buildCostTree(treeData), [treeData]);
  const costTreeGrandTotal = useMemo(
    () => Object.values(costTree).reduce((s, n) => s + n.total, 0),
    [costTree]
  );

  function expandAllTree() {
    const keys = new Set<string>();
    for (const [acctName, acct] of sortedEntries(costTree)) {
      const acctPath = acctName;
      keys.add(acctPath);
      for (const [deptName, dept] of sortedEntries(acct.children!)) {
        keys.add(acctPath + '::' + deptName);
      }
    }
    setExpandedNodes(keys);
  }
  function collapseAllTree() {
    setExpandedNodes(new Set());
  }

  const downloadSupplierCSV = () => {
    if (supplierData.length === 0) return;
    const headers = ['Invoice Date', 'Supplier', 'Store', 'Invoice/Details', 'Account', 'Dept', 'Total', 'VAT'];
    const csvRows = [headers.join(',')];
    for (const row of supplierData) {
      csvRows.push([
        row.invoice_date,
        `"${String(row.supplier).replace(/"/g, '""')}"`,
        `"${String(row.store_name).replace(/"/g, '""')}"`,
        `"${String(row.details || '').replace(/"/g, '""')}"`,
        `"${String(row.account || '').replace(/"/g, '""')}"`,
        `"${String(row.dept || '').replace(/"/g, '""')}"`,
        row.total, row.vat,
      ].join(','));
    }
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `supplier_report_${supplierFilter === 'all' ? 'all-suppliers' : supplierFilter.replace(/\s+/g, '_')}_${startDate}_to_${endDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-gray-100 text-gray-800">
      <div className="sticky top-0 z-10 bg-gradient-to-b from-slate-100/95 to-slate-100/80 backdrop-blur-sm pt-4 sm:pt-6 pb-2">
        <div className="px-4 sm:px-6 max-w-6xl mx-auto">
          {/* HEADER SECTION */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-11 w-11 rounded-xl bg-blue-600 text-white text-xl shadow-sm shrink-0">📊</div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">Sales Dashboard</h1>
                <p className="text-xs sm:text-sm text-gray-500">Multi-store sales, cost and wages analytics</p>
              </div>
            </div>
            <div className="flex flex-wrap w-full sm:w-auto gap-2">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="inline-flex items-center justify-center bg-white hover:bg-gray-50 text-gray-700 font-medium text-sm py-2.5 px-4 rounded-lg shadow-sm border border-gray-200 transition"
              >
                ⚙️ Settings
              </button>
            </div>
          </div>

          {/* 🗂️ TABS */}
          <div className="flex gap-1 bg-white p-1 rounded-xl border border-gray-200 shadow-sm w-full sm:w-fit overflow-x-auto">
            {([
              ['overview', '📈 Overview'],
              ['projections', '🔮 Projections'],
              ['wages', '🧾 Wages & Hours'],
              ['budget', '🎯 Hours Budget'],
              ['suppliers', '🚚 Suppliers'],
              ['tree', '🌳 Cost Tree'],
            ] as [Tab, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-medium transition ${
                  tab === key ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 pt-2 max-w-6xl mx-auto">

      {/* ⚙️ SETTINGS PANEL: change the Start Date the dashboard opens with */}
      {showSettings && (
        <div className="mb-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
            Default Start Date
          </label>
          <p className="text-xs text-gray-500 mb-2">
            The dashboard will open with this as the Start Date from now on (saved in this browser only).
            {savedDefaultStartDate ? ` Currently saved: ${savedDefaultStartDate}.` : ' No default saved yet -- using ' + FALLBACK_START_DATE + '.'}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              value={defaultStartDateDraft}
              onChange={(e) => setDefaultStartDateDraft(e.target.value)}
              className="rounded-lg border-gray-300 p-2 text-sm border focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            <button
              onClick={saveDefaultStartDate}
              className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm py-2 px-3 rounded-lg shadow-sm transition"
            >
              Save as Default
            </button>
            {savedDefaultStartDate && (
              <button
                onClick={clearDefaultStartDate}
                className="inline-flex items-center justify-center bg-white hover:bg-gray-50 text-gray-600 font-medium text-sm py-2 px-3 rounded-lg border border-gray-200 transition"
              >
                Clear Default
              </button>
            )}
          </div>
        </div>
      )}

      {/* 🗓️ MOBILE & DESKTOP FRIENDLY FILTERS TOOLBAR (Store always shown; date range shown for Overview/Wages) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Store Filter</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-full rounded-lg border-gray-300 p-2 text-sm border focus:ring-2 focus:ring-blue-500 focus:outline-none">
            <option value="all">All Branches Combined</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        {tab !== 'budget' ? (
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                {dateMode === 'quarter' ? 'Quarter' : 'Date Range'}
              </label>
              <div className="flex gap-1 bg-gray-100 rounded-md p-0.5">
                <button
                  type="button"
                  onClick={() => setDateMode('range')}
                  className={`text-xs font-medium px-2 py-0.5 rounded transition ${dateMode === 'range' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
                >
                  Range
                </button>
                <button
                  type="button"
                  onClick={() => { setDateMode('quarter'); applyQuarterToRange(reportQuarter); }}
                  className={`text-xs font-medium px-2 py-0.5 rounded transition ${dateMode === 'quarter' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
                >
                  Quarter
                </button>
              </div>
            </div>
            {dateMode === 'range' ? (
              <div className="flex items-center w-full rounded-lg border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-blue-500 overflow-hidden">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  max={endDate}
                  aria-label="Start Date"
                  className="flex-1 min-w-0 p-2 text-sm border-0 focus:ring-0 focus:outline-none bg-transparent"
                />
                <span className="px-2 text-gray-400 text-sm select-none">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  aria-label="End Date"
                  className="flex-1 min-w-0 p-2 text-sm border-0 focus:ring-0 focus:outline-none bg-transparent"
                />
              </div>
            ) : (
              <div>
                <select
                  value={reportQuarter}
                  onChange={(e) => applyQuarterToRange(e.target.value)}
                  className="w-full rounded-lg border-gray-300 p-2 text-sm border focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  {quarterOptions.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">Runs {startDate} to {endDate} -- weekly views for this range start counting from the quarter's 1st, so the final week may be partial.</p>
              </div>
            )}
          </div>
        ) : (
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Quarter</label>
            <select value={budgetQuarter} onChange={(e) => setBudgetQuarter(e.target.value)} className="w-full rounded-lg border-gray-300 p-2 text-sm border focus:ring-2 focus:ring-blue-500 focus:outline-none">
              {quarterOptions.map(q => <option key={q.value} value={q.value}>{q.label}</option>)}
            </select>
          </div>
        )}
      </div>

      {tab === 'suppliers' && (
        <div className="mb-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Supplier</label>
            <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="w-full rounded-lg border-gray-300 p-2 text-sm border focus:ring-2 focus:ring-blue-500 focus:outline-none">
              <option value="all">All Suppliers</option>
              {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <p className="text-xs text-gray-400">
              Dates above filter by invoice date (the date on each Costs line). Pick a single day by setting Start and End the same, or a range.
            </p>
          </div>
        </div>
      )}

      {tab === 'overview' && (
        <>
          {/* 🔍 FLEXIBLE COLUMN CHANGER BAR + view/download actions */}
          <div className="flex flex-wrap gap-4 sm:gap-6 mb-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm items-center text-sm">
            <span className="font-semibold text-gray-500 text-xs uppercase tracking-wider">Metrics Shown:</span>
            <label className="flex items-center gap-2 font-medium cursor-pointer"><input type="checkbox" checked={showSales} onChange={() => setShowSales(!showSales)} className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4" /> Sales</label>
            <label className="flex items-center gap-2 font-medium cursor-pointer"><input type="checkbox" checked={showCosts} onChange={() => setShowCosts(!showCosts)} className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4" /> Costs</label>
            <label className="flex items-center gap-2 font-medium cursor-pointer"><input type="checkbox" checked={showGrossProfit} onChange={() => setShowGrossProfit(!showGrossProfit)} className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4" /> Gross Profit %</label>
            <label className="flex items-center gap-2 font-medium cursor-pointer"><input type="checkbox" checked={showProfit} onChange={() => setShowProfit(!showProfit)} className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4" /> Profit</label>
            <div className="flex-1" />
            <button
              onClick={() => setViewMode(viewMode === 'weekly' ? 'total' : 'weekly')}
              className={`inline-flex items-center justify-center font-medium text-sm py-2 px-4 rounded-lg shadow-sm border transition ${
                viewMode === 'weekly'
                  ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600'
                  : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'
              }`}
            >
              📅 {viewMode === 'weekly' ? 'Viewing by Week' : 'View by Week'}
            </button>
            <button
              onClick={downloadCSV}
              disabled={(viewMode === 'weekly' ? weeklyData : reportData).length === 0}
              className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm py-2 px-4 rounded-lg shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              📥 Download CSV
            </button>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              Couldn&apos;t load this report: {errorMsg}
            </div>
          )}

          {/* 📦 ADAPTIVE DATA CONTAINER */}
          {loading ? (
            <LoadingBlock label="Retrieving transactional database tables..." />
          ) : viewMode === 'weekly' ? (
            <>
              {/* DESKTOP MODE: WEEKLY BREAKDOWN TABLE */}
              <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3.5 text-left font-semibold text-gray-600">Week</th>
                      {showSales && <th className="px-6 py-3.5 text-left font-semibold text-gray-600">Total Sales</th>}
                      {showCosts && <th className="px-6 py-3.5 text-left font-semibold text-gray-600">Total Costs</th>}
                      {showGrossProfit && <th className="px-6 py-3.5 text-left font-semibold text-gray-600">Gross Profit %</th>}
                      {showProfit && <th className="px-6 py-3.5 text-left font-semibold text-gray-600">Net Profit</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {weeklyData.length === 0 && (
                      <tr><td className="px-6 py-8 text-center text-gray-400" colSpan={4}>No data in this date range.</td></tr>
                    )}
                    {weeklyData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-4 font-semibold text-gray-900">{row.week_start} – {row.week_end}</td>
                        {showSales && <td className="px-6 py-4 font-medium text-green-600">{formatGBP(row.total_sales)}</td>}
                        {showCosts && <td className="px-6 py-4 font-medium text-red-600">{formatGBP(row.total_costs)}</td>}
                        {showGrossProfit && (
                          <td className="px-6 py-4 font-medium text-blue-600">
                            {row.gross_profit_pct}%
                          </td>
                        )}
                        {showProfit && (
                          <td className={`px-6 py-4 font-bold ${row.net_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {formatGBP(row.net_profit)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* MOBILE MODE: WEEKLY BREAKDOWN CARDS */}
              <div className="block md:hidden space-y-4">
                {weeklyData.length === 0 && (
                  <div className="p-8 text-center text-gray-400 bg-white rounded-xl border border-gray-200">No data in this date range.</div>
                )}
                {weeklyData.map((row, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                    <div className="border-b border-gray-100 pb-2">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Week</span>
                      <div className="text-base font-bold text-gray-900">{row.week_start} – {row.week_end}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {showSales && (
                        <div>
                          <div className="text-xs text-gray-400 font-medium">Total Sales</div>
                          <div className="text-green-600 font-bold">{formatGBP(row.total_sales)}</div>
                        </div>
                      )}
                      {showCosts && (
                        <div>
                          <div className="text-xs text-gray-400 font-medium">Total Costs</div>
                          <div className="text-red-600 font-bold">{formatGBP(row.total_costs)}</div>
                        </div>
                      )}
                      {showGrossProfit && (
                        <div>
                          <div className="text-xs text-gray-400 font-medium">Gross Profit %</div>
                          <div className="text-blue-600 font-bold">{row.gross_profit_pct}%</div>
                        </div>
                      )}
                      {showProfit && (
                        <div className="col-span-2 pt-1 border-t border-dashed border-gray-100 mt-1">
                          <div className="text-xs text-gray-400 font-medium">Net Profit</div>
                          <div className={`text-base font-extrabold ${row.net_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {formatGBP(row.net_profit)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* DESKTOP MODE: FULL DATA TABLE VIEW */}
              <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3.5 text-left font-semibold text-gray-600">Branch Name</th>
                      {showSales && <th className="px-6 py-3.5 text-left font-semibold text-gray-600">Total Sales</th>}
                      {showCosts && <th className="px-6 py-3.5 text-left font-semibold text-gray-600">Total Costs</th>}
                      {showGrossProfit && <th className="px-6 py-3.5 text-left font-semibold text-gray-600">Gross Profit %</th>}
                      {showProfit && <th className="px-6 py-3.5 text-left font-semibold text-gray-600">Net Profit</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {reportData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition">
                        <td className="px-6 py-4 font-semibold text-gray-900">{row.branch_name}</td>
                        {showSales && <td className="px-6 py-4 font-medium text-green-600">{formatGBP(row.total_sales)}</td>}
                        {showCosts && <td className="px-6 py-4 font-medium text-red-600">{formatGBP(row.total_costs)}</td>}
                        {showGrossProfit && (
                          <td className="px-6 py-4 font-medium text-blue-600">
                            {row.gross_profit_pct}%
                          </td>
                        )}
                        {showProfit && (
                          <td className={`px-6 py-4 font-bold ${row.net_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {formatGBP(row.net_profit)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* MOBILE MODE: STACKED METRIC CARDS LIST VIEW */}
              <div className="block md:hidden space-y-4">
                {reportData.map((row, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                    <div className="border-b border-gray-100 pb-2">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Store</span>
                      <div className="text-base font-bold text-gray-900">{row.branch_name}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {showSales && (
                        <div>
                          <div className="text-xs text-gray-400 font-medium">Total Sales</div>
                          <div className="text-green-600 font-bold">{formatGBP(row.total_sales)}</div>
                        </div>
                      )}
                      {showCosts && (
                        <div>
                          <div className="text-xs text-gray-400 font-medium">Total Costs</div>
                          <div className="text-red-600 font-bold">{formatGBP(row.total_costs)}</div>
                        </div>
                      )}
                      {showGrossProfit && (
                        <div>
                          <div className="text-xs text-gray-400 font-medium">Gross Profit %</div>
                          <div className="text-blue-600 font-bold">{row.gross_profit_pct}%</div>
                        </div>
                      )}
                      {showProfit && (
                        <div className="col-span-2 pt-1 border-t border-dashed border-gray-100 mt-1">
                          <div className="text-xs text-gray-400 font-medium">Net Profit</div>
                          <div className={`text-base font-extrabold ${row.net_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {formatGBP(row.net_profit)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'projections' && (
        <>
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
            <p className="text-xs text-gray-400 max-w-xl">
              Compares actual results against the store-level targets from your Projections upload.
              Projections are only as granular as the periods you've imported -- if you've only
              loaded one week of targets, picking a wider date range here will compare that single
              week's projection against a full range of actuals, which will look skewed. Pick a
              date range matching the period your projections cover for a meaningful comparison.
            </p>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setProjectionsViewMode(projectionsViewMode === 'weekly' ? 'total' : 'weekly')}
                className={`inline-flex items-center justify-center font-medium text-sm py-2.5 px-4 rounded-lg shadow-sm border transition ${
                  projectionsViewMode === 'weekly'
                    ? 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600'
                    : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'
                }`}
              >
                📅 {projectionsViewMode === 'weekly' ? 'Viewing by Week' : 'View by Week'}
              </button>
              <button
                onClick={downloadProjectionsCSV}
                disabled={(projectionsViewMode === 'weekly' ? projectionsWeeklyData : projectionsData).length === 0}
                className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm py-2.5 px-4 rounded-lg shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                📥 Download CSV
              </button>
            </div>
          </div>

          {projectionsError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              Couldn&apos;t load projections: {projectionsError}
            </div>
          )}

          {projectionsLoading ? (
            <LoadingBlock label="Comparing projections against actuals..." />
          ) : projectionsViewMode === 'weekly' ? (
            <>
              {/* DESKTOP: weekly projections vs actuals table */}
              <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3.5 text-left font-semibold text-gray-600">Week</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Projected Turnover</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Actual Sales</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Variance</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Variance %</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Projected GP %</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Actual GP %</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">GP Variance</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Projected Waste %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {projectionsWeeklyData.length === 0 && (
                      <tr><td className="px-4 py-8 text-center text-gray-400" colSpan={9}>No data in this date range.</td></tr>
                    )}
                    {projectionsWeeklyData.map((row, idx) => {
                      const salesOver = row.sales_variance >= 0;
                      const gpOver = row.gp_variance_pct == null ? null : row.gp_variance_pct >= 0;
                      return (
                        <tr key={idx} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{row.week_start} – {row.week_end}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{formatGBP(row.projected_turnover)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{formatGBP(row.actual_sales)}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${salesOver ? 'text-green-700' : 'text-red-700'}`}>{formatGBP(row.sales_variance)}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${salesOver ? 'text-green-700' : 'text-red-700'}`}>{row.sales_variance_pct == null ? '—' : `${row.sales_variance_pct}%`}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{row.projected_gp_pct == null ? '—' : `${row.projected_gp_pct}%`}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{row.actual_gp_pct == null ? '—' : `${row.actual_gp_pct}%`}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${gpOver == null ? 'text-gray-400' : gpOver ? 'text-green-700' : 'text-red-700'}`}>{row.gp_variance_pct == null ? '—' : `${row.gp_variance_pct}%`}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{row.projected_waste_pct == null ? '—' : `${row.projected_waste_pct}%`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* MOBILE: weekly projections vs actuals cards */}
              <div className="block md:hidden space-y-4">
                {projectionsWeeklyData.length === 0 && (
                  <div className="p-8 text-center text-gray-400 bg-white rounded-xl border border-gray-200">No data in this date range.</div>
                )}
                {projectionsWeeklyData.map((row, idx) => {
                  const salesOver = row.sales_variance >= 0;
                  const gpOver = row.gp_variance_pct == null ? null : row.gp_variance_pct >= 0;
                  return (
                    <div key={idx} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                      <div className="border-b border-gray-100 pb-2">
                        <span className="text-base font-bold text-gray-900">{row.week_start} – {row.week_end}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><div className="text-xs text-gray-400 font-medium">Projected Turnover</div><div className="font-semibold">{formatGBP(row.projected_turnover)}</div></div>
                        <div><div className="text-xs text-gray-400 font-medium">Actual Sales</div><div className="font-semibold">{formatGBP(row.actual_sales)}</div></div>
                        <div><div className="text-xs text-gray-400 font-medium">Variance</div><div className={`font-bold ${salesOver ? 'text-green-700' : 'text-red-700'}`}>{formatGBP(row.sales_variance)} ({row.sales_variance_pct == null ? '—' : `${row.sales_variance_pct}%`})</div></div>
                        <div><div className="text-xs text-gray-400 font-medium">Projected Waste %</div><div className="font-semibold">{row.projected_waste_pct == null ? '—' : `${row.projected_waste_pct}%`}</div></div>
                      </div>
                      <div className="pt-2 border-t border-dashed border-gray-100 grid grid-cols-3 gap-3 text-sm">
                        <div><div className="text-xs text-gray-400 font-medium">Projected GP %</div><div className="font-semibold">{row.projected_gp_pct == null ? '—' : `${row.projected_gp_pct}%`}</div></div>
                        <div><div className="text-xs text-gray-400 font-medium">Actual GP %</div><div className="font-semibold">{row.actual_gp_pct == null ? '—' : `${row.actual_gp_pct}%`}</div></div>
                        <div><div className="text-xs text-gray-400 font-medium">GP Variance</div><div className={`font-bold ${gpOver == null ? 'text-gray-400' : gpOver ? 'text-green-700' : 'text-red-700'}`}>{row.gp_variance_pct == null ? '—' : `${row.gp_variance_pct}%`}</div></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              {/* DESKTOP: projections vs actuals table */}
              <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3.5 text-left font-semibold text-gray-600">Store</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Projected Turnover</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Actual Sales</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Variance</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Variance %</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Projected GP %</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Actual GP %</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">GP Variance</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Projected Waste %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {projectionsData.length === 0 && (
                      <tr><td className="px-4 py-8 text-center text-gray-400" colSpan={9}>No projections uploaded for this date range.</td></tr>
                    )}
                    {projectionsData.map((row, idx) => {
                      const salesOver = row.sales_variance >= 0;
                      const gpOver = row.gp_variance_pct == null ? null : row.gp_variance_pct >= 0;
                      return (
                        <tr key={idx} className="hover:bg-gray-50 transition">
                          <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{row.branch_name}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{formatGBP(row.projected_turnover)}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{formatGBP(row.actual_sales)}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${salesOver ? 'text-green-700' : 'text-red-700'}`}>{formatGBP(row.sales_variance)}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${salesOver ? 'text-green-700' : 'text-red-700'}`}>{row.sales_variance_pct == null ? '—' : `${row.sales_variance_pct}%`}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{row.projected_gp_pct == null ? '—' : `${row.projected_gp_pct}%`}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{row.actual_gp_pct == null ? '—' : `${row.actual_gp_pct}%`}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${gpOver == null ? 'text-gray-400' : gpOver ? 'text-green-700' : 'text-red-700'}`}>{row.gp_variance_pct == null ? '—' : `${row.gp_variance_pct}%`}</td>
                          <td className="px-4 py-3 text-right text-gray-700">{row.projected_waste_pct == null ? '—' : `${row.projected_waste_pct}%`}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* MOBILE: projections vs actuals cards */}
              <div className="block md:hidden space-y-4">
                {projectionsData.length === 0 && (
                  <div className="p-8 text-center text-gray-400 bg-white rounded-xl border border-gray-200">No projections uploaded for this date range.</div>
                )}
                {projectionsData.map((row, idx) => {
                  const salesOver = row.sales_variance >= 0;
                  const gpOver = row.gp_variance_pct == null ? null : row.gp_variance_pct >= 0;
                  return (
                    <div key={idx} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                      <div className="border-b border-gray-100 pb-2">
                        <span className="text-base font-bold text-gray-900">{row.branch_name}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><div className="text-xs text-gray-400 font-medium">Projected Turnover</div><div className="font-semibold">{formatGBP(row.projected_turnover)}</div></div>
                        <div><div className="text-xs text-gray-400 font-medium">Actual Sales</div><div className="font-semibold">{formatGBP(row.actual_sales)}</div></div>
                        <div><div className="text-xs text-gray-400 font-medium">Variance</div><div className={`font-bold ${salesOver ? 'text-green-700' : 'text-red-700'}`}>{formatGBP(row.sales_variance)} ({row.sales_variance_pct == null ? '—' : `${row.sales_variance_pct}%`})</div></div>
                        <div><div className="text-xs text-gray-400 font-medium">Projected Waste %</div><div className="font-semibold">{row.projected_waste_pct == null ? '—' : `${row.projected_waste_pct}%`}</div></div>
                      </div>
                      <div className="pt-2 border-t border-dashed border-gray-100 grid grid-cols-3 gap-3 text-sm">
                        <div><div className="text-xs text-gray-400 font-medium">Projected GP %</div><div className="font-semibold">{row.projected_gp_pct == null ? '—' : `${row.projected_gp_pct}%`}</div></div>
                        <div><div className="text-xs text-gray-400 font-medium">Actual GP %</div><div className="font-semibold">{row.actual_gp_pct == null ? '—' : `${row.actual_gp_pct}%`}</div></div>
                        <div><div className="text-xs text-gray-400 font-medium">GP Variance</div><div className={`font-bold ${gpOver == null ? 'text-gray-400' : gpOver ? 'text-green-700' : 'text-red-700'}`}>{row.gp_variance_pct == null ? '—' : `${row.gp_variance_pct}%`}</div></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'wages' && (
        <>
          <div className="flex justify-end mb-4">
            <button
              onClick={downloadWagesCSV}
              disabled={wagesData.length === 0}
              className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm py-2.5 px-4 rounded-lg shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              📥 Download CSV
            </button>
          </div>

          {wagesError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              Couldn&apos;t load wages detail: {wagesError}
            </div>
          )}

          {wagesLoading ? (
            <LoadingBlock label="Retrieving wages and hours data..." />
          ) : (
            <>
              {/* DESKTOP: wages detail table */}
              <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3.5 text-left font-semibold text-gray-600">Week</th>
                      <th className="px-4 py-3.5 text-left font-semibold text-gray-600">Store</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Day Hrs</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Night Hrs</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Hol Hrs</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Total Hrs</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Wages</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">NI</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Pension</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Total Wage Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {wagesData.length === 0 && (
                      <tr><td className="px-4 py-8 text-center text-gray-400" colSpan={10}>No wages data in this date range.</td></tr>
                    )}
                    {wagesData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{row.week_start} – {row.week_end}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{row.branch_name}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{formatHours(row.day_hours)}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{formatHours(row.night_hours)}</td>
                        <td className="px-4 py-3 text-right text-gray-700">{formatHours(row.hol_hours)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatHours(row.total_hours)}</td>
                        <td className="px-4 py-3 text-right text-red-600">{formatGBP(row.wages_cost)}</td>
                        <td className="px-4 py-3 text-right text-red-600">{formatGBP(row.ni_cost)}</td>
                        <td className="px-4 py-3 text-right text-red-600">{formatGBP(row.pension_cost)}</td>
                        <td className="px-4 py-3 text-right font-bold text-red-700">{formatGBP(row.total_wage_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* MOBILE: wages detail cards */}
              <div className="block md:hidden space-y-4">
                {wagesData.length === 0 && (
                  <div className="p-8 text-center text-gray-400 bg-white rounded-xl border border-gray-200">No wages data in this date range.</div>
                )}
                {wagesData.map((row, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                    <div className="border-b border-gray-100 pb-2">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{row.week_start} – {row.week_end}</span>
                      <div className="text-base font-bold text-gray-900">{row.branch_name}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div><div className="text-xs text-gray-400 font-medium">Day Hrs</div><div className="font-semibold">{formatHours(row.day_hours)}</div></div>
                      <div><div className="text-xs text-gray-400 font-medium">Night Hrs</div><div className="font-semibold">{formatHours(row.night_hours)}</div></div>
                      <div><div className="text-xs text-gray-400 font-medium">Hol Hrs</div><div className="font-semibold">{formatHours(row.hol_hours)}</div></div>
                    </div>
                    <div className="pt-2 border-t border-dashed border-gray-100 grid grid-cols-2 gap-3 text-sm">
                      <div><div className="text-xs text-gray-400 font-medium">Total Hrs</div><div className="font-bold">{formatHours(row.total_hours)}</div></div>
                      <div><div className="text-xs text-gray-400 font-medium">Total Wage Cost</div><div className="font-bold text-red-700">{formatGBP(row.total_wage_cost)}</div></div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'budget' && (
        <>
          {/* ✍️ SET BUDGET FORM (writes to Supabase) */}
          <div className="mb-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Set hours budget for this quarter</h2>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Store</label>
                <select
                  value={budgetFormStore}
                  onChange={(e) => setBudgetFormStore(e.target.value)}
                  className="w-full rounded-lg border-gray-300 p-2 text-sm border focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                  <option value="">Select a store...</option>
                  {branches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Budget Hours</label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={budgetFormHours}
                  onChange={(e) => setBudgetFormHours(e.target.value)}
                  placeholder="e.g. 1200"
                  className="w-full rounded-lg border-gray-300 p-2 text-sm border focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>
              <button
                onClick={saveBudget}
                disabled={budgetSaving || !budgetFormStore || budgetFormHours === ''}
                className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm py-2.5 px-4 rounded-lg shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {budgetSaving ? 'Saving...' : '💾 Save Budget'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Quarters always start Jan/Apr/Jul/Oct 1st. Saving again for the same store + quarter updates the existing budget.
            </p>
            {budgetSaveMsg && (
              <p className={`text-sm mt-2 ${budgetSaveMsg.startsWith('Failed') ? 'text-red-600' : 'text-green-600'}`}>{budgetSaveMsg}</p>
            )}
          </div>

          {budgetError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              Couldn&apos;t load budget status: {budgetError}
            </div>
          )}

          {budgetLoading ? (
            <LoadingBlock label="Calculating hours used against budget..." />
          ) : (
            <>
              {/* DESKTOP: budget status table */}
              <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3.5 text-left font-semibold text-gray-600">Store</th>
                      <th className="px-6 py-3.5 text-right font-semibold text-gray-600">Budget Hrs</th>
                      <th className="px-6 py-3.5 text-right font-semibold text-gray-600">Actual Hrs</th>
                      <th className="px-6 py-3.5 text-right font-semibold text-gray-600">Remaining</th>
                      <th className="px-6 py-3.5 text-right font-semibold text-gray-600">% Used</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {budgetStatus.length === 0 && (
                      <tr><td className="px-6 py-8 text-center text-gray-400" colSpan={5}>No stores found.</td></tr>
                    )}
                    {budgetStatus.map((row, idx) => {
                      const over = row.hours_remaining < 0;
                      const noBudget = Number(row.budget_hours) === 0;
                      return (
                        <tr key={idx} className={`hover:bg-gray-50 transition ${over ? 'bg-red-50/50' : ''}`}>
                          <td className="px-6 py-4 font-semibold text-gray-900">{row.store_name}</td>
                          <td className="px-6 py-4 text-right text-gray-700">{noBudget ? '—' : formatHours(row.budget_hours)}</td>
                          <td className="px-6 py-4 text-right text-gray-700">{formatHours(row.actual_hours)}</td>
                          <td className={`px-6 py-4 text-right font-semibold ${over ? 'text-red-700' : 'text-green-700'}`}>
                            {noBudget ? '—' : formatHours(row.hours_remaining)}
                          </td>
                          <td className={`px-6 py-4 text-right font-bold ${row.pct_used == null ? 'text-gray-400' : over ? 'text-red-700' : 'text-gray-900'}`}>
                            {row.pct_used == null ? 'no budget set' : `${row.pct_used}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* MOBILE: budget status cards */}
              <div className="block md:hidden space-y-4">
                {budgetStatus.length === 0 && (
                  <div className="p-8 text-center text-gray-400 bg-white rounded-xl border border-gray-200">No stores found.</div>
                )}
                {budgetStatus.map((row, idx) => {
                  const over = row.hours_remaining < 0;
                  const noBudget = Number(row.budget_hours) === 0;
                  return (
                    <div key={idx} className={`bg-white p-4 rounded-xl border shadow-sm space-y-3 ${over ? 'border-red-200' : 'border-gray-200'}`}>
                      <div className="border-b border-gray-100 pb-2">
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Store</span>
                        <div className="text-base font-bold text-gray-900">{row.store_name}</div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><div className="text-xs text-gray-400 font-medium">Budget Hrs</div><div className="font-semibold">{noBudget ? '—' : formatHours(row.budget_hours)}</div></div>
                        <div><div className="text-xs text-gray-400 font-medium">Actual Hrs</div><div className="font-semibold">{formatHours(row.actual_hours)}</div></div>
                        <div><div className="text-xs text-gray-400 font-medium">Remaining</div><div className={`font-bold ${over ? 'text-red-700' : 'text-green-700'}`}>{noBudget ? '—' : formatHours(row.hours_remaining)}</div></div>
                        <div><div className="text-xs text-gray-400 font-medium">% Used</div><div className={`font-bold ${row.pct_used == null ? 'text-gray-400' : over ? 'text-red-700' : 'text-gray-900'}`}>{row.pct_used == null ? '—' : `${row.pct_used}%`}</div></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'suppliers' && (
        <>
          {supplierByBranch.length > 0 && (
            <div className="mb-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                {supplierFilter === 'all' ? 'All Suppliers' : supplierFilter} · by branch
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {supplierByBranch.map(([store, amount]) => (
                  <div key={store} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                    <div className="text-xs text-gray-500 font-medium truncate" title={store}>{store}</div>
                    <div className="text-sm font-bold text-gray-900">{formatGBP(amount)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center mb-4">
            <div className="text-sm text-gray-500">
              {supplierData.length} line{supplierData.length === 1 ? '' : 's'} · Total {formatGBP(supplierTotals.total)}{supplierTotals.vat > 0 ? ` (incl. ${formatGBP(supplierTotals.vat)} VAT)` : ''}
            </div>
            <button
              onClick={downloadSupplierCSV}
              disabled={supplierData.length === 0}
              className="inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm py-2.5 px-4 rounded-lg shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              📥 Download CSV
            </button>
          </div>

          {supplierError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              Couldn&apos;t load supplier report: {supplierError}
            </div>
          )}

          {supplierLoading ? (
            <LoadingBlock label="Retrieving supplier invoices..." />
          ) : (
            <>
              {/* DESKTOP: supplier report table */}
              <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3.5 text-left font-semibold text-gray-600">Invoice Date</th>
                      <th className="px-4 py-3.5 text-left font-semibold text-gray-600">Supplier</th>
                      <th className="px-4 py-3.5 text-left font-semibold text-gray-600">Store</th>
                      <th className="px-4 py-3.5 text-left font-semibold text-gray-600">Invoice / Details</th>
                      <th className="px-4 py-3.5 text-left font-semibold text-gray-600">Account</th>
                      <th className="px-4 py-3.5 text-left font-semibold text-gray-600">Dept</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">Total</th>
                      <th className="px-4 py-3.5 text-right font-semibold text-gray-600">VAT</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {supplierData.length === 0 && (
                      <tr><td className="px-4 py-8 text-center text-gray-400" colSpan={8}>No invoices in this date range.</td></tr>
                    )}
                    {supplierData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50 transition">
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{row.invoice_date}</td>
                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{row.supplier}</td>
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{row.store_name}</td>
                        <td className="px-4 py-3 text-gray-500">{row.details}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{row.account}</td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{row.dept}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900">{formatGBP(row.total)}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{Number(row.vat) > 0 ? formatGBP(row.vat) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  {supplierData.length > 0 && (
                    <tfoot className="bg-gray-50 border-t-2 border-gray-200">
                      <tr>
                        <td className="px-4 py-3 font-bold text-gray-700" colSpan={6}>Total</td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">{formatGBP(supplierTotals.total)}</td>
                        <td className="px-4 py-3 text-right font-bold text-gray-900">{supplierTotals.vat > 0 ? formatGBP(supplierTotals.vat) : '—'}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* MOBILE: supplier report cards */}
              <div className="block md:hidden space-y-4">
                {supplierData.length === 0 && (
                  <div className="p-8 text-center text-gray-400 bg-white rounded-xl border border-gray-200">No invoices in this date range.</div>
                )}
                {supplierData.map((row, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                    <div className="border-b border-gray-100 pb-2 flex justify-between items-start">
                      <div>
                        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{row.invoice_date}</span>
                        <div className="text-base font-bold text-gray-900">{row.supplier}</div>
                      </div>
                      <div className="text-base font-bold text-gray-900">{formatGBP(row.total)}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><div className="text-xs text-gray-400 font-medium">Store</div><div className="font-medium">{row.store_name}</div></div>
                      <div><div className="text-xs text-gray-400 font-medium">VAT</div><div className="font-medium">{Number(row.vat) > 0 ? formatGBP(row.vat) : '—'}</div></div>
                      <div className="col-span-2"><div className="text-xs text-gray-400 font-medium">Invoice / Details</div><div className="font-medium">{row.details}</div></div>
                      <div><div className="text-xs text-gray-400 font-medium">Account</div><div className="font-medium">{row.account}</div></div>
                      <div><div className="text-xs text-gray-400 font-medium">Dept</div><div className="font-medium">{row.dept}</div></div>
                    </div>
                  </div>
                ))}
                {supplierData.length > 0 && (
                  <div className="bg-gray-900 text-white p-4 rounded-xl flex justify-between items-center font-bold">
                    <span>Total ({supplierData.length} lines)</span>
                    <span>{formatGBP(supplierTotals.total)}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'tree' && (
        <>
          <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
            <div className="text-sm text-gray-500">
              Total for range: <span className="font-bold text-gray-900">{formatGBP(costTreeGrandTotal)}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={expandAllTree} className="text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition">Expand Accounts</button>
              <button onClick={collapseAllTree} className="text-xs font-medium text-gray-500 hover:text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition">Collapse All</button>
            </div>
          </div>

          {treeError && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              Couldn&apos;t load the cost tree: {treeError}
            </div>
          )}

          {treeLoading ? (
            <LoadingBlock label="Building cost tree..." />
          ) : Object.keys(costTree).length === 0 ? (
            <div className="p-8 text-center text-gray-400 bg-white rounded-xl border border-gray-200">No costs in this date range.</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="hidden sm:flex items-center gap-2 py-2.5 pr-3 pl-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-500">
                <span className="w-4" />
                <span className="flex-1">Account / Department / Store / Supplier</span>
                <span className="hidden sm:block w-24 text-center">Share</span>
                <span>Amount</span>
              </div>
              {sortedEntries(costTree).map(([name, node]) => (
                <CostTreeRow
                  key={name}
                  name={name}
                  node={node}
                  path={name}
                  level={0}
                  expanded={expandedNodes}
                  onToggle={toggleNode}
                  formatGBP={formatGBP}
                  parentTotal={costTreeGrandTotal}
                />
              ))}
            </div>
          )}
          <p className="text-xs text-gray-400 mt-3">
            Click any row with a ▶ to drill down: Account → Department → Store → Supplier → individual invoice lines.
          </p>
        </>
      )}
      </div>
    </div>
  );
}