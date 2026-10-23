// app.js — LV Spices Batch Traceability & Recall Register
// Full implementation: Gemini Vision OCR + Dukan Bai Label Maker DB Sync + 4-Step Wizard + Edit Record

import { saveBatch, loadAllBatches, subscribeToLabelPrints, updateCloudBadge, deleteBatchDoc } from './firebase-config.js';
import { scanPurchaseInvoice } from './ocr.js';

// ── MASTER DUKAN PRODUCTS & BATCH CODE MAP ──────────────────────────────────
// Sourced from 365 Spicery / Dukan Stock specification master list
const DUKAN_MASTER_PRODUCTS = [
  { name: 'CHILLI FLAKES', code: 'CF', category: 'Chilli' },
  { name: 'GOLDEN TURMERIC POWDER', code: 'GTP', category: 'Turmeric' },
  { name: 'SELAM TURMERIC POWDER', code: 'STP', category: 'Turmeric' },
  { name: 'TURMERIC POWDER', code: 'TP', category: 'Turmeric' },
  { name: 'CHILLI POWDER KASHMIRI', code: 'CPKKMU1', category: 'Chilli' },
  { name: 'KASHMIRI CHILLI POWDER', code: 'KA', category: 'Chilli' },
  { name: 'RED CHILLI POWDER', code: 'RCP', category: 'Chilli' },
  { name: 'CHILLI POWDER SP LAL', code: 'CPSPLV', category: 'Chilli' },
  { name: 'CHILLI POWDER SP LAL UNCHA', code: 'CPSPLCCV', category: 'Chilli' },
  { name: 'CHILLI POWDER SP LINE', code: 'CPSPLV', category: 'Chilli' },
  { name: 'CHILLI POWDER KASHMIRI SUPER DELUXE', code: 'CPKKMU1', category: 'Chilli' },
  { name: 'CORIANDER POWDER', code: 'CP', category: 'Coriander' },
  { name: 'CORIANDER SEEDS', code: 'CS', category: 'Whole Spice' },
  { name: 'CORIANDER GREEN SEASONING', code: 'CGSKMU1', category: 'Seasoning' },
  { name: 'CORIANDER SARAS SEASONING', code: 'CSS', category: 'Seasoning' },
  { name: 'CORIANDER SEASONING', code: 'CS', category: 'Seasoning' },
  { name: 'DHANAJEERA (MIX MASALA POWDER)', code: 'DJMMPKMU1', category: 'Masala' },
  { name: 'MALVANI MIX SPECIAL MASALA', code: 'MMSM', category: 'Masala' },
  { name: 'GARAM MASALA', code: 'GM', category: 'Masala' },
  { name: 'RAJWADI GARAM MASALA', code: 'RGM', category: 'Masala' },
  { name: 'SPECIAL GARAM MASALA', code: 'SGM', category: 'Masala' },
  { name: 'BIRYANI MASALA', code: 'BM', category: 'Masala' },
  { name: 'CHAAT MASALA', code: 'CM', category: 'Masala' },
  { name: 'KITCHEN KING MASALA', code: 'KK', category: 'Masala' },
  { name: 'PAV BHAJI MASALA', code: 'PB', category: 'Masala' },
  { name: 'CHOLE MASALA', code: 'CH', category: 'Masala' },
  { name: 'DAL TADKA MASALA', code: 'DT', category: 'Masala' },
  { name: 'SABJI MASALA', code: 'SM', category: 'Masala' },
  { name: 'CHICKEN MASALA', code: 'CK', category: 'Masala' },
  { name: 'FISH MASALA', code: 'FM', category: 'Masala' },
  { name: 'MEAT MASALA', code: 'MT', category: 'Masala' },
  { name: 'TANDOORI MASALA', code: 'TM', category: 'Masala' },
  { name: 'PERI PERI SEASONING', code: 'PP', category: 'Seasoning' },
  { name: 'PIZZA SEASONING', code: 'PZ', category: 'Seasoning' },
  { name: 'SCHEZWAN SEASONING', code: 'SC', category: 'Seasoning' },
  { name: 'OREGANO SEASONING', code: 'OR', category: 'Seasoning' },
  { name: 'MIXED HERBS', code: 'MH', category: 'Seasoning' },
  { name: 'RESHAMPATTI KHANDELA CHILLI BLEND SEASONING', code: 'RKCBS', category: 'Chilli Blend' },
  { name: 'DANDICUT KHANDELA CHILLI BLEND SEASONING', code: 'DKCBS', category: 'Chilli Blend' },
  { name: 'PALITANA KHANDELA CHILLI BLEND SEASONING', code: 'PKCBS', category: 'Chilli Blend' },
  { name: 'KASHMIRI KHANDELA CHILLI BLEND SEASONING', code: 'KKCBS', category: 'Chilli Blend' },
  { name: 'SAMBHAR CHILLI BLEND SEASONING', code: 'SCBS', category: 'Chilli Blend' },
  { name: 'SAMBHAR KASHMIRI CHILLI BLEND SEASONING', code: 'SKCBS', category: 'Chilli Blend' },
  { name: 'GINGER SEASONING', code: 'GSM', category: 'Seasoning' },
  { name: 'CUMIN SEASONING', code: 'CSM', category: 'Seasoning' },
  { name: 'DRY MANGO SEASONING', code: 'DMSM', category: 'Seasoning' },
  { name: 'BLACK PEPPER SEASONING', code: 'BPS', category: 'Seasoning' },
  { name: 'METHI SEASONING', code: 'MS', category: 'Seasoning' },
  { name: 'VARIYALI SEASONING', code: 'VS', category: 'Seasoning' },
  { name: 'JEERA SUPER', code: 'JS', category: 'Whole Spice' },
  { name: 'CUMIN SEEDS', code: 'CS', category: 'Whole Spice' },
  { name: 'CUMIN POWDER', code: 'CU', category: 'Cumin' },
  { name: 'RAI', code: 'R', category: 'Whole Spice' },
  { name: 'WHITE PEPPER', code: 'WP', category: 'Whole Spice' },
  { name: 'BLACK PEPPER', code: 'BP', category: 'Whole Spice' }
];

// Keywords indicating blended / mix masala requiring processing
const MIX_KEYWORDS = [
  'masala', 'mix', 'blend', 'seasoning', 'chaat', 'garam', 'biryani',
  'kitchen king', 'pav bhaji', 'chole', 'dal tadka', 'sabji', 'meat',
  'chicken', 'fish', 'tandoori', 'peri peri', 'pizza', 'schezwan',
  'oregano', 'herbs', 'dhanajeera', 'malvani', 'khandela', 'saras'
];

const LOCAL_KEY = 'lv_spices_batch_traceability';
const STEP_TITLES = ['Purchase Details', 'Processing & Batch No.', 'Packing Quantity (Label Maker)', 'Dispatch & Balance'];
const STEP_SUBS = [
  'Step 1 of 4 — Scan invoice or enter supplier details',
  'Step 2 of 4 — Processing check & final batch number',
  'Step 3 of 4 — Finished packaging records from Label Maker DB',
  'Step 4 of 4 — Dispatch details & balance stock calculation'
];

// ── UTILITY FUNCTIONS ────────────────────────────────────────────────────────
function formatDate(d) {
  if (!d) return '—';
  const dateObj = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dateObj.getTime())) return d;
  return dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function cleanStr(s) {
  return String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Generate final batch number in format: [PREFIX]-[MMYY]
 * e.g. Chilli Flakes in Oct 2026 -> CF-1026
 */
function genFinalBatchNo(productName, dateStr) {
  const d = dateStr ? new Date(dateStr + 'T00:00:00') : new Date();
  const validDate = isNaN(d.getTime()) ? new Date() : d;
  const mm = String(validDate.getMonth() + 1).padStart(2, '0');
  const yy = String(validDate.getFullYear()).slice(2);
  const suffix = `${mm}${yy}`;

  const cleanName = cleanStr(productName);
  if (!cleanName) return `BT-${suffix}`;

  // Match against master products
  for (const p of DUKAN_MASTER_PRODUCTS) {
    const pClean = cleanStr(p.name);
    if (cleanName === pClean || cleanName.includes(pClean) || pClean.includes(cleanName)) {
      return `${p.code}-${suffix}`;
    }
  }

  // Fallback: extract initials from first 2 words
  const words = String(productName || '').trim().split(/\s+/).filter(Boolean);
  let prefix = '';
  if (words.length >= 2) {
    prefix = (words[0][0] + words[1][0]).toUpperCase();
  } else if (words.length === 1) {
    prefix = words[0].slice(0, 2).toUpperCase();
  } else {
    prefix = 'LV';
  }
  return `${prefix}-${suffix}`;
}

/**
 * Checks if a product is a mix masala / seasoning / blend
 */
function isMixProduct(name) {
  const n = String(name || '').toLowerCase();
  return MIX_KEYWORDS.some(kw => n.includes(kw));
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    return raw ? JSON.parse(raw).filter(b => b && !b.isGenerated) : [];
  } catch {
    return [];
  }
}

function saveLocal(arr) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(arr)); } catch {}
}

function showToast(msg, dur = 3000) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), dur);
}

// ── STATE ────────────────────────────────────────────────────────────────────
let allBatches = [];
let filteredBatches = [];
let currentBatchId = null;
let labelPrintRecords = []; // Live Dukan Bai sticker records from lablerecords-3f897
let currentOcrItems = [];
let _ocrSavedCount = 0; // tracks how many OCR items already saved in current scan session
let _bStep = 0;
const TOTAL_STEPS = 4;

// ── INIT ─────────────────────────────────────────────────────────────────────
async function init() {
  window.scrollTo({ top: 0, behavior: 'instant' });

  // 1. Subscribe to Label Maker real-time cloud sync
  subscribeToLabelPrints(records => {
    labelPrintRecords = records || [];
    console.log(`[Batch Traceability] Synced ${labelPrintRecords.length} Dukan Bai label records.`);
    populateProductDatalist();
    updateLabelSyncIndicator();
  });

  // 2. Load existing batches (Merge Local + Firebase Cloud)
  const localList = loadLocal().filter(b => b && !String(b.id || '').startsWith('BTR-00'));
  const cloudList = await loadAllBatches();
  const map = {};

  localList.forEach(b => { if (b?.id) map[b.id] = b; });
  cloudList.forEach(b => {
    if (b?.id && !b.isGenerated && !String(b.id).startsWith('BTR-00')) {
      map[b.id] = { ...(map[b.id] || {}), ...b };
    }
  });

  allBatches = Object.values(map).sort((a, b) => (b.purchaseDate || '').localeCompare(a.purchaseDate || ''));
  allBatches.forEach((b, i) => { b.srNo = i + 1; });
  saveLocal(allBatches);

  filteredBatches = [...allBatches];
  renderStats();
  renderTable();

  if (allBatches.length > 0) {
    openBatch(allBatches[0].id);
  } else {
    renderEmptyDetailCard();
  }
}

function updateLabelSyncIndicator() {
  const el = document.getElementById('label-sync-status');
  if (!el) return;
  const count = labelPrintRecords.length;
  el.innerHTML = `
    <div class="sync-icon-wrap">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <span class="sync-text">Label Maker: <strong>${count} Dukan Bai Records Synced</strong></span>
  `;
}

function populateProductDatalist() {
  const dl = document.getElementById('product-datalist');
  if (!dl) return;

  const namesSet = new Set();
  DUKAN_MASTER_PRODUCTS.forEach(p => namesSet.add(p.name));
  labelPrintRecords.forEach(r => { if (r.productName) namesSet.add(r.productName.trim()); });

  const sorted = [...namesSet].sort();
  dl.innerHTML = sorted.map(name => `<option value="${name}">`).join('');
}

// ── STATS CALCULATION ────────────────────────────────────────────────────────
function renderStats() {
  const batchEl = document.getElementById('stat-batches');
  const prodEl = document.getElementById('stat-products');
  const recallEl = document.getElementById('stat-recalls');
  const stockEl = document.getElementById('stat-stock');

  if (batchEl) batchEl.textContent = allBatches.length;
  if (prodEl) prodEl.textContent = new Set(allBatches.map(b => cleanStr(b.productName)).filter(Boolean)).size;
  if (recallEl) recallEl.textContent = allBatches.filter(b => b.recallStatus === 'Open' || b.recallStatus === 'Under Investigation').length;

  const totalBal = allBatches.reduce((acc, b) => acc + (Number(b.balanceStock) || 0), 0);
  if (stockEl) stockEl.textContent = totalBal.toLocaleString('en-IN') + ' kg';
}

// ── TABLE RENDERING ──────────────────────────────────────────────────────────
function renderTable() {
  const tbody = document.getElementById('batch-tbody');
  if (!tbody) return;

  if (filteredBatches.length === 0) {
    tbody.innerHTML = `<tr><td colspan="21" style="text-align:center;padding:48px;color:var(--text-muted);">No batch records found. Click <strong>"+ New Batch"</strong> to create one.</td></tr>`;
    return;
  }

  tbody.innerHTML = filteredBatches.map(b => {
    const isAct = b.id === currentBatchId;
    const isRecallOpen = b.recallStatus === 'Open' || b.recallStatus === 'Under Investigation';
    const bal = Number(b.balanceStock) || 0;
    const balColor = bal > 0 ? 'var(--brand-primary)' : 'var(--text-muted)';

    return `
      <tr class="${isAct ? 'row-active' : ''}" onclick="openBatch('${b.id}')" style="cursor:pointer;">
        <td class="td-sr">${b.srNo}</td>
        <td class="td-date">${b.displayPurchaseDate || formatDate(b.purchaseDate)}</td>
        <td>
          <div class="td-product-name">${b.productName}</div>
          <div class="td-batch-sub">${b.finalBatchNo || '—'}</div>
        </td>
        <td>
          <div class="td-supplier-name">${b.supplierName || '—'}</div>
          <div class="td-supplier-batch">${b.supplierBatch || '—'}</div>
        </td>
        <td class="td-date">${b.invoiceNo || '—'}</td>
        <td class="td-qty">${b.purchaseQty ?? 0}</td>
        <td style="text-align:center">
          <span class="badge-proc ${b.processingDone === 'Yes' ? 'proc-yes' : 'proc-no'}">${b.processingDone || 'No'}</span>
        </td>
        <td style="color:var(--text-muted);font-size:11px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${b.otherIngredients && b.otherIngredients !== '—' ? b.otherIngredients : '—'}
        </td>
        <td style="font-weight:700;font-size:11px;color:var(--text-primary);">${b.finalBatchNo || '—'}</td>
        <td class="td-date">${b.repackingDate || '—'}</td>
        <td style="font-size:11px;">${b.storageLocation || '—'}</td>
        <td class="td-qty">${b.totalFinishedQty ?? b.purchaseQty ?? 0}</td>
        <td class="td-date">${b.dispatchDate || '—'}</td>
        <td class="td-qty">${b.dispatchQty || '—'}</td>
        <td class="td-date">${b.invoiceRef || '—'}</td>
        <td class="td-balance-val" style="color:${balColor};font-weight:800;">${bal}</td>
        <td style="font-size:11px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${b.complaint && b.complaint !== 'None' ? b.complaint : '<span style="color:var(--text-light)">None</span>'}
        </td>
        <td style="font-size:11px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${b.actionTaken || '—'}
        </td>
        <td style="text-align:center">
          <span class="status-pill ${isRecallOpen ? 'pill-open' : 'pill-closed'}">${b.recallStatus || 'Closed'}</span>
        </td>
        <td style="font-size:11px;">${b.verifiedBy || 'Bhimlal Sharma'}</td>
        <td class="col-edit" onclick="event.stopPropagation()">
          <button class="btn-edit-row" onclick="openEditModal('${b.id}')" title="Edit Batch & Complaint">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit
          </button>
        </td>
      </tr>`;
  }).join('');
}

function renderEmptyDetailCard() {
  const det = document.getElementById('detail-card');
  if (!det) return;
  det.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-muted);background:#FFFFFF;border-radius:12px;border:1px solid var(--border-light);">No batch selected. Choose a row or click <strong>"+ New Batch"</strong> to record an entry.</div>`;
}

// ── DETAIL CARD RENDERING ────────────────────────────────────────────────────
window.openBatch = function(id) {
  currentBatchId = id;
  renderTable();

  const b = allBatches.find(x => x.id === id);
  if (!b) { renderEmptyDetailCard(); return; }

  const det = document.getElementById('detail-card');
  if (!det) return;

  const isRecallOpen = b.recallStatus === 'Open' || b.recallStatus === 'Under Investigation';
  const bal = Number(b.balanceStock) || 0;

  det.innerHTML = `
    <div class="meta-rows-container">
      <!-- Title strip with quick Edit button -->
      <div style="display:flex;justify-content:space-between;align-items:center;padding:2px 4px 6px;">
        <div style="display:flex;align-items:center;gap:10px;">
          <h3 style="font-size:15px;font-weight:800;color:var(--text-primary);">${b.productName}</h3>
          <span style="font-size:12px;font-weight:700;padding:2px 8px;border-radius:6px;background:var(--brand-subtle);color:var(--brand-primary);">${b.finalBatchNo || '—'}</span>
          <span class="status-pill ${isRecallOpen ? 'pill-open' : 'pill-closed'}">${b.recallStatus || 'Closed'}</span>
        </div>
        <button class="btn-sidebar-ghost" style="padding:6px 12px;font-size:11px;" onclick="openEditModal('${b.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Edit Record
        </button>
      </div>

      <div class="meta-row-4">
        ${metaCard('BATCH ID', b.id, 'icon-box-red', `<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>`, 'value-brand')}
        ${metaCard('PRODUCT', b.productName, 'icon-box-orange', `<path d="M16.5 9.4 7.55 4.24a1.79 1.79 0 0 0-1.8 0l-1.9 1.1A1.8 1.8 0 0 0 3 6.91V17.1a1.8 1.8 0 0 0 .85 1.57l1.9 1.1a1.8 1.8 0 0 0 1.8 0l8.95-5.16a1.8 1.8 0 0 0 .85-1.57V6.91a1.8 1.8 0 0 0-.85-1.57Z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/>`)}
        ${metaCard('FINAL BATCH NO.', b.finalBatchNo || '—', 'icon-box-green', `<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>`)}
        ${metaCard('PURCHASE DATE', b.displayPurchaseDate || formatDate(b.purchaseDate), 'icon-box-blue', `<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>`)}
      </div>

      <div class="meta-row-6">
        ${metaCard('INVOICE NO.', b.invoiceNo || '—', 'icon-box-blue', `<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>`)}
        ${metaCard('SUPPLIER', b.supplierName || '—', 'icon-box-red', `<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>`)}
        ${metaCard('SUPPLIER BATCH', b.supplierBatch || '—', 'icon-box-red', `<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>`)}
        ${metaCard('INWARD QTY', (b.purchaseQty ?? 0) + ' kg', 'icon-box-orange', `<path d="M6 3h12l4 6-10 12L2 9l4-6z"/>`)}
        ${metaCard('PROCESSING DONE', b.processingDone || 'No', 'icon-box-orange', `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`)}
        ${metaCard('STORAGE', b.storageLocation || '—', 'icon-box-green', `<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>`)}
      </div>

      <div class="meta-row-4">
        ${metaCard('PACKED / FINISHED', (b.totalFinishedQty ?? b.purchaseQty ?? 0) + ' kg', 'icon-box-green', `<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>`)}
        ${metaCard('DISPATCH QTY', (b.dispatchQty || 0) + ' kg', 'icon-box-orange', `<rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>`)}
        ${metaCard('DISPATCH DATE', b.dispatchDate || '—', 'icon-box-blue', `<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>`)}
        ${metaCard('BALANCE STOCK', bal + ' kg', 'icon-box-red', `<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>`, 'value-brand')}
      </div>

      <div class="other-ingredients-strip">
        <svg class="strip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/><path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12"/></svg>
        <span class="strip-label">Other Ingredients:</span>
        <span class="strip-value">${b.otherIngredients && b.otherIngredients !== '—' ? b.otherIngredients : '—'}</span>
        <span style="margin-left:auto;font-size:11px;color:var(--text-muted);">Verified By: <strong>${b.verifiedBy || 'Bhimlal Sharma'}</strong></span>
      </div>
    </div>`;
};

function metaCard(label, value, iconClass, svgPath, valueClass = '') {
  return `
    <div class="meta-card">
      <div class="meta-icon-box ${iconClass}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="18" height="18">${svgPath}</svg>
      </div>
      <div class="meta-content">
        <span class="meta-label">${label}</span>
        <span class="meta-value ${valueClass}">${value}</span>
      </div>
    </div>`;
}

// ── SEARCH ───────────────────────────────────────────────────────────────────
window.onSearchChange = function(val) {
  const q = val.toLowerCase().trim();
  filteredBatches = q ? allBatches.filter(b =>
    (b.productName || '').toLowerCase().includes(q) ||
    (b.id || '').toLowerCase().includes(q) ||
    (b.finalBatchNo || '').toLowerCase().includes(q) ||
    (b.supplierName || '').toLowerCase().includes(q) ||
    (b.invoiceNo || '').toLowerCase().includes(q) ||
    (b.recallStatus || '').toLowerCase().includes(q) ||
    (b.complaint || '').toLowerCase().includes(q)
  ) : [...allBatches];
  renderTable();
};

// ── 4-STEP WIZARD MODAL LOGIC ────────────────────────────────────────────────
window.openNewModal = function() {
  _bStep = 0;
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('n-purchase-date').value = today;
  document.getElementById('n-repack-date').value = today;

  ['n-product', 'n-invoice', 'n-supplier', 'n-supplier-batch', 'n-ingredients', 'n-final-batch', 'n-dispatch-ref'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['n-qty', 'n-total-finished', 'n-pkg-count', 'n-dispatch-qty'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  document.getElementById('n-processing').value = 'No';
  const hintEl = document.getElementById('processing-auto-hint');
  if (hintEl) hintEl.style.display = 'none';

  document.getElementById('ocr-scan-label').textContent = '📷 Scan Purchase Invoice with AI (tap to upload)';
  document.getElementById('ocr-thumb-row').style.display = 'none';
  const chipsWrap = document.getElementById('ocr-items-picker');
  if (chipsWrap) chipsWrap.classList.add('hidden');

  _updateBatchStepUI();
  document.getElementById('modal-overlay').style.display = 'flex';
};

window.closeModal = function() {
  document.getElementById('modal-overlay').style.display = 'none';
};

function _updateBatchStepUI() {
  for (let i = 0; i < TOTAL_STEPS; i++) {
    const panel = document.getElementById(`bpanel-${i}`);
    const dot = document.getElementById(`bstep-dot-${i}`);
    if (panel) panel.classList.toggle('hidden', i !== _bStep);
    if (dot) dot.className = `modal-step${i === _bStep ? ' active' : i < _bStep ? ' done' : ''}`;
  }

  document.getElementById('modal-step-title').textContent = STEP_TITLES[_bStep];
  document.getElementById('modal-step-sub').textContent = STEP_SUBS[_bStep];
  document.getElementById('batch-back-btn').style.display = _bStep > 0 ? '' : 'none';
  document.getElementById('batch-next-btn').classList.toggle('hidden', _bStep === TOTAL_STEPS - 1);
  document.getElementById('save-batch-btn').classList.toggle('hidden', _bStep !== TOTAL_STEPS - 1);

  // STEP 1 ACTIONS: Auto-generate batch number & check mix masala
  if (_bStep === 1) {
    const product = document.getElementById('n-product').value.trim();
    const date = document.getElementById('n-purchase-date').value;
    if (product) {
      if (!document.getElementById('n-final-batch').value) {
        document.getElementById('n-final-batch').value = genFinalBatchNo(product, date);
      }
      if (isMixProduct(product)) {
        document.getElementById('n-processing').value = 'Yes';
        const hintEl = document.getElementById('processing-auto-hint');
        if (hintEl) hintEl.style.display = 'block';
      }
    }
    onProcessingChange(document.getElementById('n-processing').value);
  }

  // STEP 2 ACTIONS: Query Label Maker DB for product packaging stats
  if (_bStep === 2) {
    populateLabelStatsAndList();
  }

  // STEP 3 ACTIONS: Real-time balance preview
  if (_bStep === 3) {
    updateBalancePreview();
  }
}

window.batchStepNav = function(dir) {
  if (dir === 1 && _bStep === 0) {
    const date = document.getElementById('n-purchase-date').value;
    const product = document.getElementById('n-product').value.trim();
    const supplier = document.getElementById('n-supplier').value.trim();
    if (!date || !product || !supplier) {
      showToast('Please fill Date, Product Name, and Supplier to continue.');
      return;
    }
  }

  _bStep = Math.min(Math.max(_bStep + dir, 0), TOTAL_STEPS - 1);
  _updateBatchStepUI();
};

window.onDateOrProductChange = function() {
  const product = document.getElementById('n-product').value.trim();
  const date = document.getElementById('n-purchase-date').value;
  if (product) {
    document.getElementById('n-final-batch').value = genFinalBatchNo(product, date);
    if (isMixProduct(product)) {
      document.getElementById('n-processing').value = 'Yes';
      const hint = document.getElementById('processing-auto-hint');
      if (hint) hint.style.display = 'block';
    }
  }
};

window.onProductInput = function(val) {
  const date = document.getElementById('n-purchase-date').value;
  if (val.trim()) {
    document.getElementById('n-final-batch').value = genFinalBatchNo(val, date);
    if (isMixProduct(val)) {
      document.getElementById('n-processing').value = 'Yes';
      const hint = document.getElementById('processing-auto-hint');
      if (hint) hint.style.display = 'block';
    } else {
      const hint = document.getElementById('processing-auto-hint');
      if (hint) hint.style.display = 'none';
    }
  }
};

window.onProcessingChange = function(val) {
  const typeRow = document.getElementById('processing-type-row');
  if (typeRow) typeRow.style.display = val === 'Yes' ? '' : 'none';
  if (val !== 'Yes') {
    document.querySelectorAll('input[name="proc-type"]').forEach(r => r.checked = false);
    const sec = document.getElementById('ingredients-section');
    const pc  = document.getElementById('post-challan-row');
    if (sec) sec.style.display = 'none';
    if (pc)  pc.style.display  = 'none';
    const lf = document.getElementById('lbl-factory');
    const lb = document.getElementById('lbl-blend');
    if (lf) { lf.style.borderColor = '#E2E8F0'; lf.style.background = ''; }
    if (lb) { lb.style.borderColor = '#E2E8F0'; lb.style.background = ''; }
  }
};

window.onProcTypeChange = function(type) {
  const sec  = document.getElementById('ingredients-section');
  const fBar = document.getElementById('factory-info-bar');
  const bBar = document.getElementById('blend-info-bar');
  const pc   = document.getElementById('post-challan-row');
  const lf   = document.getElementById('lbl-factory');
  const lb   = document.getElementById('lbl-blend');
  if (sec) sec.style.display = '';
  if (pc)  pc.style.display  = '';
  if (type === 'factory') {
    if (fBar) fBar.style.display = '';
    if (bBar) bBar.style.display = 'none';
    lf.style.borderColor = 'var(--brand-primary)'; lf.style.background = '#EEF2FF';
    lb.style.borderColor = '#E2E8F0';               lb.style.background = '';
  } else {
    if (fBar) fBar.style.display = 'none';
    if (bBar) bBar.style.display = '';
    lb.style.borderColor = '#16A34A'; lb.style.background = '#F0FDF4';
    lf.style.borderColor = '#E2E8F0'; lf.style.background = '';
  }
  recalcNetWeight();
};

window.recalcNetWeight = function() {
  const rows = document.querySelectorAll('#ingredient-rows .ingredient-row');
  let ingTotal = 0;
  rows.forEach(r => { ingTotal += Number(r.querySelector('.ing-weight')?.value) || 0; });

  const procType   = document.querySelector('input[name="proc-type"]:checked')?.value || '';
  const processing = document.getElementById('n-processing')?.value;
  const purchaseQty = Number(document.getElementById('n-qty')?.value) || 0;
  const nwEl    = document.getElementById('n-net-weight');
  const totalEl = document.getElementById('ingredients-total');

  if (processing !== 'Yes' || !procType) {
    // No processing — net weight = purchase qty directly
    if (nwEl && purchaseQty > 0) nwEl.value = purchaseQty;
    if (totalEl) totalEl.textContent = '';
  } else {
    // Processing — total = purchased product + extra ingredients added
    const combined = +(purchaseQty + ingTotal).toFixed(3);
    const shortPct = procType === 'factory'
      ? Number(document.getElementById('factory-shortage-pct')?.value) || 9
      : 0;
    const netWt = +(combined * (1 - shortPct / 100)).toFixed(3);

    if (nwEl && combined > 0) nwEl.value = netWt;

    if (totalEl) {
      if (combined === 0) {
        totalEl.textContent = '';
      } else if (procType === 'factory') {
        totalEl.innerHTML =
          '<strong>' + purchaseQty + ' kg</strong> (purchase)' +
          (ingTotal > 0 ? ' + <strong>' + ingTotal + ' kg</strong> (ingredients)' : '') +
          ' = <strong>' + combined + ' kg</strong> &rarr; After <strong>' + shortPct + '%</strong> loss: <strong style="color:#4338CA">' + netWt + ' kg</strong>';
      } else {
        totalEl.innerHTML =
          '<strong>' + purchaseQty + ' kg</strong> (purchase)' +
          (ingTotal > 0 ? ' + <strong>' + ingTotal + ' kg</strong> (ingredients)' : '') +
          ' = <strong style="color:#166534">' + combined + ' kg</strong> (no grinding loss)';
      }
    }
  }
  onStorageQtyChange();
};

window.addIngredientRow = function() {
  const container = document.getElementById('ingredient-rows');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'ingredient-row';
  row.style.cssText = 'display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:6px;margin-bottom:6px;align-items:center;';
  row.innerHTML = '<input type="text" placeholder="e.g. Coriander Seeds" style="padding:7px 10px;border:1px solid #E2E8F0;border-radius:7px;font-size:12px;" class="ing-name" />' +
    '<input type="text" placeholder="NIL if none" style="padding:7px 10px;border:1px solid #E2E8F0;border-radius:7px;font-size:12px;" class="ing-batch" />' +
    '<input type="number" placeholder="0" style="padding:7px 10px;border:1px solid #E2E8F0;border-radius:7px;font-size:12px;" class="ing-weight" min="0" step="any" oninput="recalcNetWeight()" />' +
    '<button type="button" onclick="removeIngredientRow(this)" style="background:#FEF2F2;border:1px solid #FECACA;color:#EF4444;border-radius:6px;padding:5px 8px;cursor:pointer;font-size:14px;width:32px;">✕</button>';
  container.appendChild(row);
  row.querySelector('.ing-name')?.focus();
};

window.removeIngredientRow = function(btn) {
  const row = btn.closest('.ingredient-row');
  const container = document.getElementById('ingredient-rows');
  if (container && container.querySelectorAll('.ingredient-row').length > 1) {
    row?.remove();
  } else {
    if (row) row.querySelectorAll('input').forEach(i => i.value = '');
  }
  recalcNetWeight();
};

window.onNetWeightChange = function() { onStorageQtyChange(); };

window.onStorageCheck = function() {
  ['dry','cold','shop'].forEach(key => {
    const cb = document.getElementById('store-' + key);
    const qtyEl = document.getElementById('store-' + key + '-qty');
    const roomEl = document.getElementById('store-' + key + '-room');
    if (!cb || !qtyEl) return;
    const enabled = cb.checked;
    qtyEl.disabled = !enabled;
    if (roomEl) roomEl.disabled = !enabled;
    if (!enabled) qtyEl.value = '';
  });
  onStorageQtyChange();
};

window.onStorageQtyChange = function() {
  const netWt = Number(document.getElementById('n-net-weight')?.value) || Number(document.getElementById('n-qty')?.value) || 0;
  const dryQ  = Number(document.getElementById('store-dry')?.checked  ? document.getElementById('store-dry-qty')?.value  : 0) || 0;
  const coldQ = Number(document.getElementById('store-cold')?.checked ? document.getElementById('store-cold-qty')?.value : 0) || 0;
  const shopQ = Number(document.getElementById('store-shop')?.checked ? document.getElementById('store-shop-qty')?.value : 0) || 0;
  const allocated = +(dryQ + coldQ + shopQ).toFixed(2);
  const remaining  = +(netWt - allocated).toFixed(2);
  const hint = document.getElementById('storage-balance-hint');
  if (!hint) return;
  if (netWt === 0) { hint.textContent = ''; return; }
  const color = remaining < 0 ? '#EF4444' : remaining === 0 ? '#059669' : '#D97706';
  hint.innerHTML = 'Allocated: <strong>' + allocated + ' kg</strong> &nbsp;|&nbsp; Net Weight: <strong>' + netWt + ' kg</strong> &nbsp;|&nbsp; Remaining: <strong style="color:' + color + '">' + remaining + ' kg</strong>';
};

function collectIngredients() {
  const rows = document.querySelectorAll('#ingredient-rows .ingredient-row');
  const list = [];
  rows.forEach(row => {
    const name  = row.querySelector('.ing-name')?.value.trim();
    const batch = row.querySelector('.ing-batch')?.value.trim();
    const wt    = Number(row.querySelector('.ing-weight')?.value) || 0;
    if (name) list.push({ name, batch: batch || 'NIL', weight: wt });
  });
  return list;
}

function getStorageAllocation() {
  const alloc = [];
  if (document.getElementById('store-dry')?.checked) {
    const room = document.getElementById('store-dry-room')?.value || 'Dry Storage Room A';
    const qty  = Number(document.getElementById('store-dry-qty')?.value) || 0;
    alloc.push({ location: room, qty });
  }
  if (document.getElementById('store-cold')?.checked) {
    const qty = Number(document.getElementById('store-cold-qty')?.value) || 0;
    alloc.push({ location: 'Cold Storage', qty });
  }
  if (document.getElementById('store-shop')?.checked) {
    const qty = Number(document.getElementById('store-shop-qty')?.value) || 0;
    alloc.push({ location: 'Shop / Retail', qty });
  }
  return alloc;
}

// ── GEMINI AI OCR SCANNING ───────────────────────────────────────────────────
window.onOCRFileSelected = async function(input) {
  const file = input.files?.[0];
  if (!file) return;

  const label = document.getElementById('ocr-scan-label');
  const bar = document.getElementById('ocr-progress-bar');
  const fill = document.getElementById('ocr-progress-fill');
  const chipsPicker = document.getElementById('ocr-items-picker');

  bar.style.display = 'block';
  chipsPicker.classList.add('hidden');
  _ocrSavedCount = 0;
  label.textContent = '🔍 Scanning invoice with Gemini AI...';

  const { ok, data, items, thumb } = await scanPurchaseInvoice(file, (pct, msg) => {
    fill.style.width = pct + '%';
    label.textContent = msg;
  });

  bar.style.display = 'none';

  if (ok && data) {
    // Populate header details
    if (data.purchase_date) document.getElementById('n-purchase-date').value = data.purchase_date;
    if (data.invoice_no)    document.getElementById('n-invoice').value = data.invoice_no;
    if (data.challan_no)    { const el = document.getElementById('n-process-challan'); if(el) el.value = data.challan_no; }
    if (data.supplier_name) document.getElementById('n-supplier').value = data.supplier_name;
    if (data.gstin)         { const el = document.getElementById('n-supplier-gstin'); if(el) el.value = data.gstin; }
    if (data.fssai_no)      { const el = document.getElementById('n-supplier-fssai'); if(el) el.value = data.fssai_no; }
    if (data.supplier_address) { const el = document.getElementById('n-supplier-address'); if(el) el.value = data.supplier_address; }

    currentOcrItems = items || [];

    // If multiple commodities detected, show chips for user to pick
    if (currentOcrItems.length > 1) {
      chipsPicker.classList.remove('hidden');
      const chipsWrap = document.getElementById('ocr-items-chips-wrap');
      chipsWrap.innerHTML = currentOcrItems.map((it, idx) => `
        <button type="button" class="ocr-item-chip ${idx === 0 ? 'selected' : ''} ${idx < _ocrSavedCount ? 'saved' : ''}" onclick="selectOcrItem(${idx})" id="ocr-chip-${idx}">
          <strong>${it.raw_material_name}</strong>
          <span>&middot; ${it.quantity_kg} kg</span>
          ${it.supplier_batch_no ? `<span>(Lot: ${it.supplier_batch_no})</span>` : ''}
        </button>
      `).join('');
      // Populate first item by default
      selectOcrItem(0);
    } else {
      // Single item
      chipsPicker.classList.add('hidden');
      if (data.raw_material_name) document.getElementById('n-product').value = data.raw_material_name;
      if (data.supplier_batch_no) document.getElementById('n-supplier-batch').value = data.supplier_batch_no;
      if (data.quantity_kg) document.getElementById('n-qty').value = data.quantity_kg;
      onProductInput(data.raw_material_name || '');
    }

    if (thumb) {
      const thumbRow = document.getElementById('ocr-thumb-row');
      document.getElementById('ocr-thumb').src = thumb;
      document.getElementById('ocr-thumb-label').textContent = `${file.name} (${currentOcrItems.length} items found)`;
      thumbRow.style.display = 'flex';
    }

    label.textContent = `✅ AI scanned: ${data.supplier_name || 'Invoice'} (${currentOcrItems.length || 1} item${currentOcrItems.length > 1 ? 's' : ''})`;
    showToast('Invoice extracted! Verify details and proceed.');
  } else {
    label.textContent = '⚠️ AI scan failed — fill manually';
    showToast('AI could not extract invoice. Please fill manually.', 3500);
  }

  input.value = '';
};

window.selectOcrItem = function(idx) {
  const item = currentOcrItems[idx];
  if (!item) return;

  document.getElementById('n-product').value = item.raw_material_name;
  if (item.supplier_batch_no) document.getElementById('n-supplier-batch').value = item.supplier_batch_no;
  if (item.quantity_kg) document.getElementById('n-qty').value = item.quantity_kg;

  // Highlight active chip
  const chips = document.querySelectorAll('.ocr-item-chip');
  chips.forEach((c, i) => c.classList.toggle('selected', i === idx));

  // Auto trigger product input handlers
  onProductInput(item.raw_material_name);
  showToast(`Selected: ${item.raw_material_name} (${item.quantity_kg} kg)`);
};

// ── LABEL MAKER LIVE PACKAGING LOOKUP (DUKAN STOCK LOGIC) ────────────────────
let currentLabelStats = null;

function populateLabelStatsAndList() {
  const product = document.getElementById('n-product').value.trim();
  const dateStr = document.getElementById('n-purchase-date').value;
  const prodClean = cleanStr(product);

  const container = document.getElementById('label-pkg-list');
  if (!container) return;

  // Filter records matching product name or batch code from Dukan Bai sticker records
  const matchingRecords = labelPrintRecords.filter(r => {
    const isDukan = (r.stickerType === "dukan") || (r.stickerLabel === "Dukan Bai");
    const isNotFront = r.labelSide !== "front" && r.packSize !== "FRONT";
    if (!isDukan || !isNotFront) return false;

    const rNameClean = cleanStr(r.productName);
    const rBatchClean = cleanStr(r.batchNo);

    if (prodClean && rNameClean && (rNameClean === prodClean || rNameClean.includes(prodClean) || prodClean.includes(rNameClean))) {
      return true;
    }
    if (prodClean && rBatchClean && (rBatchClean.includes(prodClean) || prodClean.includes(rBatchClean))) {
      return true;
    }
    return false;
  });

  // Calculate stats across all matching records
  let p100 = 0, p200 = 0, p500 = 0, p1000 = 0;
  matchingRecords.forEach(r => {
    const sizeStr = String(r.packSize || '').toLowerCase().trim();
    const copies = Number(r.copies) || 1;
    if (sizeStr.includes('100g') || sizeStr === '100') p100 += copies;
    else if (sizeStr.includes('200g') || sizeStr === '200') p200 += copies;
    else if (sizeStr.includes('500g') || sizeStr === '500') p500 += copies;
    else if (sizeStr.includes('1kg') || sizeStr.includes('1000') || sizeStr === '1000') p1000 += copies;
    else {
      const g = Number(r.weightG) || 0;
      if (g === 100) p100 += copies;
      else if (g === 200) p200 += copies;
      else if (g === 500) p500 += copies;
      else p1000 += copies;
    }
  });

  const totalPackedKg = (p100 * 0.1) + (p200 * 0.2) + (p500 * 0.5) + (p1000 * 1.0);
  const totalPcs = p100 + p200 + p500 + p1000;

  // Find latest print date if available
  let latestDate = '';
  if (matchingRecords.length > 0) {
    const dates = matchingRecords.map(r => r.date).filter(Boolean);
    if (dates.length > 0) latestDate = dates[0];
  }

  currentLabelStats = {
    p100, p200, p500, p1000,
    totalPcs,
    totalPackedKg: Number(totalPackedKg.toFixed(2)),
    matchingRecords,
    latestDate
  };

  // Update UI stats indicators
  document.getElementById('lbl-p100').textContent = p100;
  document.getElementById('lbl-p200').textContent = p200;
  document.getElementById('lbl-p500').textContent = p500;
  document.getElementById('lbl-p1000').textContent = p1000;
  document.getElementById('lbl-total-pcs').textContent = `${totalPcs} pouches`;
  document.getElementById('lbl-total-kg').textContent = `${totalPackedKg.toFixed(2)} kg`;

  // If user hasn't filled finished qty yet, automatically apply if we found records
  if (totalPackedKg > 0 && !document.getElementById('n-total-finished').value) {
    document.getElementById('n-total-finished').value = totalPackedKg.toFixed(2);
    document.getElementById('n-pkg-count').value = totalPcs;
  }

  // Populate list of individual print records
  if (matchingRecords.length === 0) {
    container.innerHTML = `
      <div style="padding:16px;text-align:center;color:var(--text-muted);font-size:11.5px;">
        No printed packaging records found for <strong>${product}</strong> in Dukan Bai database.<br>
        You can enter the finished quantity and package count manually below.
      </div>`;
    return;
  }

  // Group by Date & BatchNo
  const grouped = {};
  matchingRecords.forEach(r => {
    const key = `${r.date || ''}_${r.batchNo || ''}`;
    if (!grouped[key]) {
      grouped[key] = {
        date: r.date || '',
        batchNo: r.batchNo || '—',
        prod: r.productName,
        copies: 0,
        weightKg: 0,
        sizes: []
      };
    }
    const copies = Number(r.copies) || 1;
    grouped[key].copies += copies;
    const w = Number(r.totalWeightG) || ((Number(r.weightG) || 0) * copies);
    grouped[key].weightKg += w / 1000;
    if (r.packSize && !grouped[key].sizes.includes(r.packSize)) grouped[key].sizes.push(r.packSize);
  });

  container.innerHTML = Object.values(grouped).map(g => `
    <div onclick="selectPkgGroup(${g.weightKg.toFixed(2)}, ${g.copies}, '${g.date}')"
      style="padding:10px 14px;cursor:pointer;border-bottom:1px solid #F1F5F9;display:flex;justify-content:space-between;align-items:center;transition:background 0.15s;"
      onmouseover="this.style.background='#F8FAFC'" onmouseout="this.style.background=''">
      <div>
        <div style="font-size:12px;font-weight:700;color:var(--text-primary);">${g.prod}</div>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">
          📅 ${g.date || '—'} &middot; Batch: <strong>${g.batchNo}</strong> &middot; Sizes: ${g.sizes.join(', ') || 'Standard'}
        </div>
      </div>
      <div style="text-align:right">
        <div style="font-size:13px;font-weight:800;color:var(--brand-primary);">${g.weightKg.toFixed(2)} kg</div>
        <div style="font-size:10px;color:var(--accent-green-dark);font-weight:600;">${g.copies} pouches</div>
      </div>
    </div>
  `).join('');
}

window.applyLabelStats = function() {
  if (!currentLabelStats || currentLabelStats.totalPackedKg === 0) {
    showToast('No label print records found for this product.');
    return;
  }
  document.getElementById('n-total-finished').value = currentLabelStats.totalPackedKg;
  document.getElementById('n-pkg-count').value = currentLabelStats.totalPcs;
  if (currentLabelStats.latestDate) {
    // Format if DD-MM-YYYY to YYYY-MM-DD
    const parts = currentLabelStats.latestDate.split('-');
    if (parts.length === 3 && parts[2].length === 4) {
      document.getElementById('n-repack-date').value = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  showToast(`Applied ${currentLabelStats.totalPackedKg} kg (${currentLabelStats.totalPcs} pouches) from Label Maker!`);
};

window.selectPkgGroup = function(kg, count, date) {
  document.getElementById('n-total-finished').value = kg;
  document.getElementById('n-pkg-count').value = count;
  if (date) {
    const parts = date.split('-');
    if (parts.length === 3 && parts[2].length === 4) {
      document.getElementById('n-repack-date').value = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  updateBalancePreview();
  showToast(`Selected: ${kg} kg (${count} packages)`);
};

// ── BALANCE PREVIEW ──────────────────────────────────────────────────────────
window.updateBalancePreview = function() {
  const pQty = Number(document.getElementById('n-qty').value) || 0;
  const fQty = Number(document.getElementById('n-total-finished').value) || pQty;
  const dQty = Number(document.getElementById('n-dispatch-qty').value) || 0;
  const baseQty = fQty > 0 ? fQty : pQty;
  const bal = Number((baseQty - dQty).toFixed(2));

  const pEl = document.getElementById('prev-purchase-qty');
  const dEl = document.getElementById('prev-dispatch-qty');
  const bEl = document.getElementById('prev-balance');

  if (pEl) pEl.textContent = `${baseQty} kg`;
  if (dEl) dEl.textContent = `${dQty} kg`;
  if (bEl) {
    bEl.textContent = `${bal} kg`;
    bEl.style.color = bal >= 0 ? 'var(--brand-primary)' : '#DC2626';
  }
};

// ── SAVE NEW BATCH ───────────────────────────────────────────────────────────
window.saveNewBatch = async function() {
  const purchaseDate  = document.getElementById('n-purchase-date').value;
  const productName   = document.getElementById('n-product').value.trim();
  const supplierName  = document.getElementById('n-supplier').value.trim();
  const invoiceNo     = document.getElementById('n-invoice').value.trim();
  const supplierBatch = document.getElementById('n-supplier-batch').value.trim();
  const supplierGSTIN = document.getElementById('n-supplier-gstin')?.value.trim() || '';
  const supplierFSSAI = document.getElementById('n-supplier-fssai')?.value.trim() || '';
  const supplierAddr  = document.getElementById('n-supplier-address')?.value.trim() || '';
  const purchaseQty   = Number(document.getElementById('n-qty').value) || 0;
  const processingDone = document.getElementById('n-processing').value;
  const procType      = document.querySelector('input[name="proc-type"]:checked')?.value || '';
  const finalBatchNo  = document.getElementById('n-final-batch').value.trim() || genFinalBatchNo(productName, purchaseDate);
  const repackDate    = document.getElementById('n-repack-date').value;
  const netWeight     = Number(document.getElementById('n-net-weight')?.value) || purchaseQty;
  const storageAlloc  = getStorageAllocation();
  const storageLocation = storageAlloc.length
    ? storageAlloc.map(a => `${a.location}${a.qty ? ' ('+a.qty+'kg)' : ''}`).join(', ')
    : 'Unspecified';
  const totalFinishedQty = Number(document.getElementById('n-total-finished').value) || purchaseQty;
  const dispatchDate  = document.getElementById('n-dispatch-date').value;
  const dispatchQty   = Number(document.getElementById('n-dispatch-qty').value) || 0;
  const invoiceRef    = document.getElementById('n-dispatch-ref').value.trim();

  // Ingredients — both factory AND blend
  const ingredientsList = processingDone === 'Yes' ? collectIngredients() : [];
  const shortPct = procType === 'factory' ? Number(document.getElementById('factory-shortage-pct')?.value) || 9 : 0;
  const ingTotalWt = ingredientsList.reduce((s, i) => s + i.weight, 0);
  const blendShortage = procType === 'factory' ? +(ingTotalWt * shortPct / 100).toFixed(3) : 0;
  const otherIngredients = ingredientsList.length
    ? ingredientsList.map(i => i.name + ' (Lot: ' + i.batch + ') ' + i.weight + 'kg').join('; ')
    : '—';
  // Post-processing challan (Step 2)
  const challanNo = document.getElementById('n-process-challan')?.value.trim() || '';

  // Balance = Finished Qty (or Purchase Qty) - Dispatch Qty
  const baseQty = totalFinishedQty > 0 ? totalFinishedQty : purchaseQty;
  const balanceStock = Number((baseQty - dispatchQty).toFixed(2));

  if (!purchaseDate || !productName || !supplierName) {
    showToast('Please fill Date, Product Name, and Supplier.');
    return;
  }

  const d = new Date(purchaseDate + 'T00:00:00');
  const timestamp = Date.now();
  const newId = `BTR-${timestamp}`;

  const record = {
    id: newId,
    srNo: allBatches.length + 1,
    purchaseDate,
    displayPurchaseDate: formatDate(d),
    productName,
    supplierName,
    supplierBatch: supplierBatch || 'NIL',
    invoiceNo: invoiceNo || '—',
    challanNo: challanNo || '—',
    supplierGSTIN: supplierGSTIN || '—',
    supplierFSSAI: supplierFSSAI || '—',
    supplierAddress: supplierAddr || '—',
    purchaseQty,
    processingDone,
    processingType: procType || '—',
    ingredients: ingredientsList,
    otherIngredients,
    blendShortage,
    finalBatchNo,
    netWeight,
    repackingDate: repackDate ? formatDate(new Date(repackDate + 'T00:00:00')) : formatDate(d),
    storageLocation,
    storageAllocation: storageAlloc,
    totalFinishedQty,
    dispatchDate: dispatchDate ? formatDate(new Date(dispatchDate + 'T00:00:00')) : '—',
    dispatchQty: dispatchQty || '—',
    invoiceRef: invoiceRef || (dispatchQty > 0 ? `DIS/${String(allBatches.length + 1).padStart(4, '0')}` : '—'),
    balanceStock,
    complaint: 'None',
    actionTaken: '—',
    recallStatus: 'Closed',
    verifiedBy: 'Bhimlal Sharma',
    isGenerated: false,
    createdAt: timestamp
  };

  const btn = document.getElementById('save-batch-btn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  const ok = await saveBatch(newId, record);
  btn.textContent = 'Save Batch';
  btn.disabled = false;

  allBatches.unshift(record);
  allBatches.sort((a, b) => (b.purchaseDate || '').localeCompare(a.purchaseDate || ''));
  allBatches.forEach((b, i) => { b.srNo = i + 1; });
  saveLocal(allBatches);

  filteredBatches = [...allBatches];
  renderStats();
  renderTable();
  openBatch(newId);
  closeModal();

  // If multi-item OCR invoice, track and reopen for next item
  const ocrRemaining = currentOcrItems.filter((_, i) => i > _ocrSavedCount);
  // Mark the saved chip visually
  const savedChipEl = document.getElementById('ocr-chip-' + (_ocrSavedCount));
  if (savedChipEl) savedChipEl.classList.add('saved');
  _ocrSavedCount++;
  if (currentOcrItems.length > 1 && _ocrSavedCount < currentOcrItems.length) {
    const nextItem = currentOcrItems[_ocrSavedCount];
    const remaining = currentOcrItems.length - _ocrSavedCount;
    showToast(`✅ Batch ${finalBatchNo} saved! Opening next item (${_ocrSavedCount + 1}/${currentOcrItems.length})...`, 2500);
    setTimeout(() => {
      // Partial reset: keep supplier fields, clear product-specific fields
      _bStep = 0;
      ['n-product','n-supplier-batch','n-final-batch','n-net-weight','n-ingredients'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      ['n-qty','n-net-weight','n-total-finished','n-dispatch-qty','n-pkg-count','n-dispatch-ref','n-process-challan'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
      });
      // Reset processing
      document.getElementById('n-processing').value = 'No';
      const procHint = document.getElementById('processing-auto-hint');
      if (procHint) procHint.style.display = 'none';
      const sec = document.getElementById('ingredients-section');
      if (sec) sec.style.display = 'none';
      const typeRow = document.getElementById('processing-type-row');
      if (typeRow) typeRow.style.display = 'none';
      // Reset storage checkboxes
      ['dry','cold','shop'].forEach(k => {
        const cb = document.getElementById('store-' + k); if (cb) { cb.checked = false; }
        const qty = document.getElementById('store-' + k + '-qty'); if (qty) { qty.value = ''; qty.disabled = true; }
      });
      // Reset ingredient rows to single empty row
      const ingRows = document.getElementById('ingredient-rows');
      if (ingRows) {
        ingRows.innerHTML = '<div class="ingredient-row" style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:6px;margin-bottom:6px;align-items:center;"><input type="text" placeholder="e.g. Coriander Seeds" style="padding:7px 10px;border:1px solid #E2E8F0;border-radius:7px;font-size:12px;" class="ing-name" /><input type="text" placeholder="NIL if none" style="padding:7px 10px;border:1px solid #E2E8F0;border-radius:7px;font-size:12px;" class="ing-batch" /><input type="number" placeholder="0" style="padding:7px 10px;border:1px solid #E2E8F0;border-radius:7px;font-size:12px;" class="ing-weight" min="0" step="any" oninput="recalcNetWeight()" /><button type="button" onclick="removeIngredientRow(this)" style="background:#FEF2F2;border:1px solid #FECACA;color:#EF4444;border-radius:6px;padding:5px 8px;cursor:pointer;font-size:14px;width:32px;">&#10005;</button></div>';
      }
      const totalEl = document.getElementById('ingredients-total');
      if (totalEl) totalEl.textContent = '';
      const balHint = document.getElementById('storage-balance-hint');
      if (balHint) balHint.textContent = '';

      _updateBatchStepUI();
      document.getElementById('modal-overlay').style.display = 'flex';

      setTimeout(() => {
        selectOcrItem(_ocrSavedCount);
        showToast(`📋 Item ${_ocrSavedCount + 1}/${currentOcrItems.length}: ${nextItem.raw_material_name} (${nextItem.quantity_kg} kg) — verify and save`, 3500);
      }, 200);
    }, 800);
  } else {
    showToast(ok ? `✅ Batch ${finalBatchNo} saved and synced!` : `Batch ${finalBatchNo} saved locally.`);
    if (currentOcrItems.length > 1) currentOcrItems = []; // clear after all done
  }
};

// ── EDIT RECORD MODAL ────────────────────────────────────────────────────────
let _currentEditBatch = null;

window.openEditModal = function(id) {
  const b = allBatches.find(x => x.id === id);
  if (!b) return;

  _currentEditBatch = b;
  document.getElementById('e-batch-id').value = b.id;
  document.getElementById('edit-batch-sub').textContent = `Batch: ${b.finalBatchNo || '—'} &middot; ${b.productName}`;

  document.getElementById('e-recall-status').value = b.recallStatus || 'Closed';
  document.getElementById('e-complaint').value = b.complaint && b.complaint !== 'None' ? b.complaint : '';
  document.getElementById('e-action-taken').value = b.actionTaken && b.actionTaken !== '—' ? b.actionTaken : '';

  // Dispatch fields
  let dispDateInput = '';
  if (b.dispatchDate && b.dispatchDate !== '—') {
    const parts = b.dispatchDate.split('/');
    if (parts.length === 3) dispDateInput = `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  document.getElementById('e-dispatch-date').value = dispDateInput;
  document.getElementById('e-dispatch-qty').value = b.dispatchQty && b.dispatchQty !== '—' ? b.dispatchQty : '';
  document.getElementById('e-dispatch-ref').value = b.invoiceRef && b.invoiceRef !== '—' ? b.invoiceRef : '';

  document.getElementById('e-storage').value = b.storageLocation || 'Dry Storage Room A';
  document.getElementById('e-verified-by').value = b.verifiedBy || 'Bhimlal Sharma';

  updateEditBalancePreview();
  document.getElementById('edit-modal-overlay').style.display = 'flex';
};

window.closeEditModal = function() {
  document.getElementById('edit-modal-overlay').style.display = 'none';
  _currentEditBatch = null;
};

window.updateEditBalancePreview = function() {
  if (!_currentEditBatch) return;
  const baseQty = Number(_currentEditBatch.totalFinishedQty) || Number(_currentEditBatch.purchaseQty) || 0;
  const dQty = Number(document.getElementById('e-dispatch-qty').value) || 0;
  const newBal = Number((baseQty - dQty).toFixed(2));

  const el = document.getElementById('e-balance-preview');
  if (el) {
    el.textContent = `${newBal} kg`;
    el.style.color = newBal >= 0 ? 'var(--brand-primary)' : '#DC2626';
  }
};

window.saveBatchEdit = async function() {
  if (!_currentEditBatch) return;
  const id = _currentEditBatch.id;
  const idx = allBatches.findIndex(x => x.id === id);
  if (idx === -1) return;

  const recallStatus = document.getElementById('e-recall-status').value;
  const complaint = document.getElementById('e-complaint').value.trim() || 'None';
  const actionTaken = document.getElementById('e-action-taken').value.trim() || '—';
  const dispatchDateRaw = document.getElementById('e-dispatch-date').value;
  const dispatchQty = Number(document.getElementById('e-dispatch-qty').value) || 0;
  const invoiceRef = document.getElementById('e-dispatch-ref').value.trim();
  const storageLocation = document.getElementById('e-storage').value;
  const verifiedBy = document.getElementById('e-verified-by').value.trim() || 'Bhimlal Sharma';

  const baseQty = Number(_currentEditBatch.totalFinishedQty) || Number(_currentEditBatch.purchaseQty) || 0;
  const balanceStock = Number((baseQty - dispatchQty).toFixed(2));

  const updatedRecord = {
    ..._currentEditBatch,
    recallStatus,
    complaint,
    actionTaken,
    dispatchDate: dispatchDateRaw ? formatDate(new Date(dispatchDateRaw + 'T00:00:00')) : (_currentEditBatch.dispatchDate || '—'),
    dispatchQty: dispatchQty || '—',
    invoiceRef: invoiceRef || (dispatchQty > 0 ? `DIS/${String(allBatches.length).padStart(4, '0')}` : '—'),
    storageLocation,
    verifiedBy,
    balanceStock,
    updatedAt: Date.now()
  };

  const btn = document.getElementById('save-edit-btn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  const ok = await saveBatch(id, updatedRecord);
  btn.textContent = 'Save Changes';
  btn.disabled = false;

  allBatches[idx] = updatedRecord;
  saveLocal(allBatches);

  // Update in filtered list
  const fIdx = filteredBatches.findIndex(x => x.id === id);
  if (fIdx !== -1) filteredBatches[fIdx] = updatedRecord;

  renderStats();
  renderTable();
  openBatch(id);
  closeEditModal();

  showToast(ok ? `✅ Batch ${_currentEditBatch.finalBatchNo} updated and synced!` : `Batch updated locally.`);
};

// ── EXPORT EXCEL & PRINT ─────────────────────────────────────────────────────
window.exportExcel = function() {
  if (!allBatches.length) {
    showToast('No records to export.');
    return;
  }
  const wb = XLSX.utils.book_new();
  const headers = [
    'Sr.', 'Purchase Date', 'Product Name', 'Supplier Name', 'Supplier Batch', 'Invoice No.',
    'Purchase Qty (kg)', 'Processing Done', 'Other Ingredients & Batches',
    'Final Batch No.', 'Repacking Date', 'Storage Location', 'Total Finished Qty (kg)',
    'Dispatch Date', 'Dispatch Qty (kg)', 'Invoice/Dispatch Ref', 'Balance Stock (kg)',
    'Complaint/Recall Details', 'Action Taken', 'Recall Status', 'Verified By'
  ];

  const rows = [
    headers,
    ...allBatches.map(b => [
      b.srNo,
      b.displayPurchaseDate || formatDate(b.purchaseDate),
      b.productName,
      b.supplierName,
      b.supplierBatch,
      b.invoiceNo,
      b.purchaseQty,
      b.processingDone,
      b.otherIngredients,
      b.finalBatchNo,
      b.repackingDate,
      b.storageLocation,
      b.totalFinishedQty,
      b.dispatchDate,
      b.dispatchQty,
      b.invoiceRef,
      b.balanceStock,
      b.complaint,
      b.actionTaken,
      b.recallStatus,
      b.verifiedBy
    ])
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 5 }, { wch: 14 }, { wch: 24 }, { wch: 22 }, { wch: 15 }, { wch: 15 },
    { wch: 12 }, { wch: 10 }, { wch: 25 }, { wch: 15 }, { wch: 14 }, { wch: 18 },
    { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 20 },
    { wch: 20 }, { wch: 12 }, { wch: 16 }
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Batch Traceability Register');
  XLSX.writeFile(wb, `LV_Spices_Batch_Traceability_${new Date().toISOString().split('T')[0]}.xlsx`);
};

window.printPage = function() { window.print(); };
window.toggleSidebar = function() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('overlay').classList.toggle('show');
};
window.closeSidebar = function() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
};

init();
