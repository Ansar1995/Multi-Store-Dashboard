'use client';

import { useState, useEffect } from 'react';
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

export default function MobileFriendlyDashboard() {
  const [startDate, setStartDate] = useState(FALLBACK_START_DATE);
  const [endDate, setEndDate] = useState('2026-12-31');
  const [branchId, setBranchId] = useState<string>('all');
  const [branches, setBranches] = useState<any[]>([]);
  const [reportData, setReportData] = useState<any[]>([]);
  const [weeklyData, setWeeklyData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // 'total' = single totals row/table for the selected range (existing view)
  // 'weekly' = one row per week across the selected range
  const [viewMode, setViewMode] = useState<'total' | 'weekly'>('total');

  // Settings panel: lets you change which Start Date the dashboard opens
  // with by default. Starts blank; filled in from localStorage on mount.
  const [showSettings, setShowSettings] = useState(false);
  const [savedDefaultStartDate, setSavedDefaultStartDate] = useState<string | null>(null);
  const [defaultStartDateDraft, setDefaultStartDateDraft] = useState(FALLBACK_START_DATE);

  // Column View Toggles
  const [showSales, setShowSales] = useState(true);
  const [showCosts, setShowCosts] = useState(true);
  const [showProfit, setShowProfit] = useState(true);

  async function loadBranches() {
    // The actual Supabase table is "Stores" (Store_code / Store_Name), not
    // "branches" -- aliasing Store_Name to "name" here keeps the rest of
    // this component (which expects { id, name }) unchanged.
    const { data } = await supabase.from('Stores').select('id, name:Store_Name');
    if (data) setBranches(data);
  }

  async function fetchReport() {
    setLoading(true);
    const { data } = await supabase.rpc('get_sales_report', {
      start_date: startDate,
      end_date: endDate,
      branch_id_param: branchId === 'all' ? null : parseInt(branchId)
    });
    if (data) setReportData(data);
    setLoading(false);
  }

  async function fetchWeeklyReport() {
    setLoading(true);
    const { data } = await supabase.rpc('get_sales_report_weekly', {
      start_date: startDate,
      end_date: endDate,
      branch_id_param: branchId === 'all' ? null : parseInt(branchId)
    });
    if (data) setWeeklyData(data);
    setLoading(false);
  }

  useEffect(() => { loadBranches(); }, []);

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
    if (viewMode === 'weekly') fetchWeeklyReport();
    else fetchReport();
  }, [startDate, endDate, branchId, viewMode]);

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

  // 📥 Function to Convert Data and Download CSV File
  const downloadCSV = () => {
    const activeData = viewMode === 'weekly' ? weeklyData : reportData;
    if (activeData.length === 0) return;

    const headers = [viewMode === 'weekly' ? 'Week' : 'Branch Name'];
    if (showSales) headers.push('Total Sales');
    if (showCosts) headers.push('Total Costs');
    if (showProfit) headers.push('Net Profit');

    const csvRows = [headers.join(',')];

    for (const row of activeData) {
      const label = viewMode === 'weekly' ? `${row.week_start} to ${row.week_end}` : row.branch_name;
      const values = [ `"${label.replace(/"/g, '""')}"` ];
      if (showSales) values.push(row.total_sales);
      if (showCosts) values.push(row.total_costs);
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

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto bg-gray-50 min-h-screen text-gray-800">
      
      {/* HEADER SECTION WITH DOWNLOAD ACTION */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">📊 Sales Dashboard</h1>
          <p className="text-xs sm:text-sm text-gray-500">Multi-store sales analytics and reporting console</p>
        </div>
        <div className="flex flex-wrap w-full sm:w-auto gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="inline-flex items-center justify-center bg-white hover:bg-gray-50 text-gray-700 font-medium text-sm py-2.5 px-4 rounded-lg shadow-sm border border-gray-200 transition"
          >
            ⚙️ Settings
          </button>
          <button
            onClick={() => setViewMode(viewMode === 'weekly' ? 'total' : 'weekly')}
            className={`inline-flex items-center justify-center font-medium text-sm py-2.5 px-4 rounded-lg shadow-sm border transition ${
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
            className="flex-1 sm:flex-none inline-flex items-center justify-center bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm py-2.5 px-4 rounded-lg shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            📥 Download CSV
          </button>
        </div>
      </div>

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

      {/* 🗓️ MOBILE & DESKTOP FRIENDLY FILTERS TOOLBAR */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Store Filter</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-full rounded-lg border-gray-300 p-2 text-sm border focus:ring-2 focus:ring-blue-500 focus:outline-none">
            <option value="all">All Branches Combined</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Start Date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded-lg border-gray-300 p-2 text-sm border focus:ring-2 focus:ring-blue-500 focus:outline-none" />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">End Date</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full rounded-lg border-gray-300 p-2 text-sm border focus:ring-2 focus:ring-blue-500 focus:outline-none" />
        </div>
      </div>

      {/* 🔍 FLEXIBLE COLUMN CHANGER BAR */}
      <div className="flex flex-wrap gap-4 sm:gap-6 mb-6 bg-white p-4 rounded-xl border border-gray-200 shadow-sm items-center text-sm">
        <span className="font-semibold text-gray-500 text-xs uppercase tracking-wider">Metrics Shown:</span>
        <label className="flex items-center gap-2 font-medium cursor-pointer"><input type="checkbox" checked={showSales} onChange={() => setShowSales(!showSales)} className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4" /> Sales</label>
        <label className="flex items-center gap-2 font-medium cursor-pointer"><input type="checkbox" checked={showCosts} onChange={() => setShowCosts(!showCosts)} className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4" /> Costs</label>
        <label className="flex items-center gap-2 font-medium cursor-pointer"><input type="checkbox" checked={showProfit} onChange={() => setShowProfit(!showProfit)} className="rounded text-blue-600 focus:ring-blue-500 h-4 w-4" /> Profit</label>
      </div>

      {/* 📦 ADAPTIVE DATA CONTAINER */}
      {loading ? (
        <div className="p-12 text-center text-sm font-medium text-gray-400 bg-white rounded-xl border border-gray-200">Retrieving transactional database tables...</div>
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
                  {showProfit && <th className="px-6 py-3.5 text-left font-semibold text-gray-600">Net Profit</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {reportData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition">
                    <td className="px-6 py-4 font-semibold text-gray-900">{row.branch_name}</td>
                    {showSales && <td className="px-6 py-4 font-medium text-green-600">{formatGBP(row.total_sales)}</td>}
                    {showCosts && <td className="px-6 py-4 font-medium text-red-600">{formatGBP(row.total_costs)}</td>}
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
    </div>
  );
}
