// app.js — 365 Spicery Batch Production & Traceability (Manufacturing ERP Build)
import { saveBatch as _saveBatchCloud, loadAllBatches, deleteBatchDoc } from './firebase-config.js';

async function saveBatch(batch) {
  return _saveBatchCloud(batch.id, batch);
}

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const LOCAL_KEY = 'spicery_batches_v3';

const PRODUCT_LIST = [
  'CHILLI FLAKES','GOLDEN TURMERIC POWDER','SELAM TURMERIC POWDER','TURMERIC POWDER',
  'KASHMIRI CHILLI POWDER','RED CHILLI POWDER','CORIANDER POWDER','CORIANDER SEEDS',
  'DHANAJEERA MIX MASALA','MALVANI MIX SPECIAL MASALA','GARAM MASALA','RAJWADI GARAM MASALA',
  'SPECIAL GARAM MASALA','BIRYANI MASALA','CHAAT MASALA','KITCHEN KING MASALA',
  'PAV BHAJI MASALA','CHOLE MASALA','DAL TADKA MASALA','SABJI MASALA',
  'CHICKEN MASALA','FISH MASALA','MEAT MASALA','TANDOORI MASALA',
  'PERI PERI SEASONING','PIZZA SEASONING','SCHEZWAN SEASONING','OREGANO SEASONING',
  'MIXED HERBS','CUMIN SEEDS','CUMIN POWDER','RAI','WHITE PEPPER','BLACK PEPPER',
  'JEERA SUPER','CORIANDER SARAS SEASONING','GINGER POWDER','FENNEL SEEDS',
  'CARDAMOM POWDER','CLOVES POWDER','CINNAMON POWDER'
];

const SUPPLIER_LIST = [
  'KRISHNA TRADERS','HARI OM SPICES','SHREE GANESH MASALA','ANIL ENTERPRISES',
  'BALAJI AGRO','RAJDHANI FOODS','MAHARAJA SPICE CO','VISHWA TRADERS',
  'PARAM MASALE','MEWAD SPICES','LAKSHMI AGENCIES','BHARAT SPICE MILL'
];

const INGREDIENT_LIST = [
  'CHILLI POWDER','TURMERIC POWDER','CORIANDER POWDER','CUMIN POWDER',
  'SALT','BLACK PEPPER POWDER','CARDAMOM POWDER','CLOVES POWDER','CINNAMON POWDER',
  'FENNEL SEEDS','RAI (MUSTARD)','METHI SEEDS','KASURI METHI','DRIED GINGER',
  'ASAFOETIDA (HING)','AMCHUR POWDER','CHILLI FLAKES','NUTMEG POWDER',
  'BAY LEAVES','STAR ANISE','MACE POWDER','PAPRIKA','DRIED MINT'
];

const PACK_SIZES = ['25g','50g','100g','200g','250g','500g','1kg','2kg','5kg','10kg','25kg','50kg','Bulk'];

// 4 wizard steps
const STEPS = [
  { title: '01 — Raw Material & Ingredient Entry', sub: 'Step 1 of 4 — Production date, finished product, and all ingredients with individual suppliers' },
  { title: '02 — Goods Check / Quality Inspection', sub: 'Step 2 of 4 — Inspect incoming raw materials and record QC result' },
  { title: '03 — Processing & Stock Movement',      sub: 'Step 3 of 4 — Processing location, factory shortage, internal batch number, and stock destinations' },
  { title: '04 — Packaging & Final Production',     sub: 'Step 4 of 4 — Pack sizes, units packed, and packaged quantities' },
];

// ── STATE ─────────────────────────────────────────────────────────────────────
let allBatches = [];
let filtered   = [];
let currentId  = null;
let activeStage = 0;
let _step      = 0;
let _editId    = null;
let _confirmCb = null;

// ── UTILITIES ─────────────────────────────────────────────────────────────────
function uid() {
  return 'BT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,5).toUpperCase();
}
function fmt(d) {
  if (!d) return '—';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
  } catch { return d; }
}
function num(v) { return isNaN(Number(v)) ? 0 : Number(v) || 0; }
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function today() { return new Date().toISOString().split('T')[0]; }
function genBatchCode(product, date) {
  const d = date ? new Date(date + 'T00:00:00') : new Date();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yy = String(d.getFullYear()).slice(2);
  const words = String(product||'').trim().split(/\s+/).filter(Boolean);
  let prefix = words.length >= 2 ? (words[0][0]+words[1][0]).toUpperCase() :
               words.length === 1 ? words[0].slice(0,2).toUpperCase() : 'SP';
  return `${prefix}-${mm}${yy}`;
}
function parsePackSizeKg(s) {
  if (!s) return 0;
  s = s.toLowerCase();
  if (s.includes('kg')) return num(s.replace('kg',''));
  if (s.includes('g'))  return num(s.replace('g','')) / 1000;
  return 0;
}
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast ' + type + ' show';
  setTimeout(() => t.classList.remove('show'), 3500);
}
function loadLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); } catch { return []; }
}
function saveLocal(arr) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(arr)); } catch {}
}

// ── INIT ──────────────────────────────────────────────────────────────────────
async function init() {
  populateDatalists();

  // Load from localStorage first (instant)
  allBatches = loadLocal();
  filtered = [...allBatches];
  renderList();
  renderSummaryEmpty();
  if (allBatches.length > 0) openDetail(allBatches[0].id);

  // Then sync from cloud
  try {
    const cloud = await loadAllBatches();
    if (cloud.length > 0) {
      // Merge: prefer cloud, keep any local-only
      const cloudIds = new Set(cloud.map(b => b.id));
      const localOnly = allBatches.filter(b => !cloudIds.has(b.id));
      allBatches = [...cloud, ...localOnly].sort((a,b) =>
        (b.date||'').localeCompare(a.date||''));
      saveLocal(allBatches);
      filtered = [...allBatches];
      renderList();
      if (!currentId && allBatches.length > 0) openDetail(allBatches[0].id);
      else if (currentId) openDetail(currentId);
    }
  } catch (e) {
    console.warn('Cloud load failed, using local:', e);
  }
}

function populateDatalists() {
  const dlP = document.getElementById('dl-products');
  const dlS = document.getElementById('dl-suppliers');
  const dlI = document.getElementById('dl-ingredients');
  if (dlP) dlP.innerHTML = PRODUCT_LIST.map(p => `<option value="${p}">`).join('');
  if (dlS) dlS.innerHTML = SUPPLIER_LIST.map(s => `<option value="${s}">`).join('');
  if (dlI) dlI.innerHTML = INGREDIENT_LIST.map(i => `<option value="${i}">`).join('');
}

// ── SEARCH / FILTER ───────────────────────────────────────────────────────────
window.doSearch = function(q) {
  const v = (q||'').toLowerCase().trim();
  filtered = v ? allBatches.filter(b =>
    (b.productName||'').toLowerCase().includes(v) ||
    (b.batchCode||'').toLowerCase().includes(v) ||
    (b.internalBatchNo||'').toLowerCase().includes(v) ||
    (b.date||'').includes(v) ||
    (b.qcStatus||'').toLowerCase().includes(v) ||
    (b.ingredients||[]).some(i =>
      (i.name||'').toLowerCase().includes(v) ||
      (i.supplier||'').toLowerCase().includes(v) ||
      (i.supplierBatch||'').toLowerCase().includes(v))
  ) : [...allBatches];

  // Sync both search boxes
  const si = document.getElementById('search-input');
  const ls = document.getElementById('list-search');
  if (si && si.value !== q) si.value = q;
  if (ls && ls.value !== q) ls.value = q;

  renderList();
};

window.filterByStage = function(stage) {
  const stageMap = {
    raw: b => (b.ingredients||[]).length > 0,
    qc: b => !!b.qcStatus,
    processing: b => !!b.processingLocation,
    packaging: b => !!(b.packagingRows||[]).length || !!b.packagingOutput,
  };
  filtered = stageMap[stage] ? allBatches.filter(stageMap[stage]) : [...allBatches];
  renderList();
};

// ── LIST RENDERING ────────────────────────────────────────────────────────────
function renderList() {
  const el = document.getElementById('batch-list');
  const count = document.getElementById('blp-count');
  if (!el) return;
  if (count) count.textContent = `${filtered.length} record${filtered.length!==1?'s':''}`;

  if (filtered.length === 0) {
    el.innerHTML = `<div class="empty-state" style="min-height:180px;">
      <div class="empty-icon">📦</div>
      <div class="empty-title">No batches found</div>
      <div class="empty-sub">Try a different search or create a new batch</div>
    </div>`;
    return;
  }

  el.innerHTML = filtered.map(b => {
    const ings = b.ingredients || [];
    const totalWt = ings.reduce((s,i) => s + num(i.totalQty), 0);
    const qcBadge = b.qcStatus === 'Approved'  ? `<span class="badge badge-green">${esc(b.qcStatus)}</span>` :
                    b.qcStatus === 'Rejected'   ? `<span class="badge badge-red">${esc(b.qcStatus)}</span>` :
                    b.qcStatus                  ? `<span class="badge badge-orange">${esc(b.qcStatus)}</span>` : '';
    const procBadge = b.processingLocation      ? `<span class="badge badge-blue">${esc(b.processingLocation)}</span>` : '';
    const pkgBadge  = getPackagingStatus(b)     ? `<span class="badge badge-green">Packaged</span>` : '';
    const isActive  = b.id === currentId;

    return `<div class="batch-card ${isActive ? 'active' : ''}" onclick="openDetail('${b.id}')">
      <div class="bc-product">${esc(b.productName||'Unnamed Product')}</div>
      <div class="bc-row">
        <span class="bc-date">${fmt(b.date)}</span>
        ${b.batchCode ? `<span class="bc-code">${esc(b.batchCode)}</span>` : ''}
        ${totalWt > 0 ? `<span class="bc-weight">${totalWt.toFixed(1)} kg</span>` : ''}
      </div>
      <div class="bc-status" style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;">
        ${qcBadge}${procBadge}${pkgBadge}
        ${!b.qcStatus && !b.processingLocation ? '<span class="badge badge-gray">Raw Material</span>' : ''}
      </div>
    </div>`;
  }).join('');
}

function getPackagingStatus(b) {
  if (b.packagingRows && b.packagingRows.length > 0) {
    const totalPacked = b.packagingRows.reduce((s,r) => s + num(r.totalKg), 0);
    return totalPacked > 0;
  }
  return num(b.packagingOutput) > 0;
}

// ── STAGE STEPPER (detail view) ───────────────────────────────────────────────
function updateStepper(batch) {
  const stages = [
    !!(batch && (batch.ingredients||[]).length > 0),
    !!(batch && batch.qcStatus),
    !!(batch && batch.processingLocation),
    !!(batch && getPackagingStatus(batch)),
  ];
  for (let i = 0; i < 4; i++) {
    const el = document.getElementById(`st-${i}`);
    if (!el) continue;
    el.className = 'stage-step' + (stages[i] ? ' done' : '') + (i === activeStage ? ' active' : '');
  }
}

window.jumpToStage = function(idx) {
  if (!currentId) return;
  activeStage = idx;
  const b = allBatches.find(x => x.id === currentId);
  if (b) renderDetail(b);
};

// ── DETAIL VIEW ───────────────────────────────────────────────────────────────
window.openDetail = function(id) {
  const b = allBatches.find(x => x.id === id);
  if (!b) return;
  currentId = id;
  activeStage = 0;

  // Determine which stage to show based on completeness
  if (getPackagingStatus(b)) activeStage = 3;
  else if (b.processingLocation) activeStage = 2;
  else if (b.qcStatus) activeStage = 1;

  renderList(); // refresh active highlight
  renderDetail(b);
  renderSummary(b);
};

function renderDetail(b) {
  updateStepper(b);
  const ws = document.getElementById('workspace-body');
  if (!ws) return;
  ws.innerHTML = buildDetailHeader(b) + getStageDetailHTML(activeStage, b);
}

function buildDetailHeader(b) {
  const ings = b.ingredients || [];
  const totalWt = ings.reduce((s,i) => s + num(i.totalQty), 0);
  const qcBadge = b.qcStatus === 'Approved' ? `<span class="badge badge-green" style="font-size:11px;">✓ QC Approved</span>` :
                  b.qcStatus === 'Rejected'  ? `<span class="badge badge-red" style="font-size:11px;">✕ QC Rejected</span>` :
                  b.qcStatus                 ? `<span class="badge badge-orange" style="font-size:11px;">${esc(b.qcStatus)}</span>` :
                  `<span class="badge badge-gray" style="font-size:11px;">QC Pending</span>`;

  return `<div class="detail-hcard">
    <div class="dhc-icon">🌶</div>
    <div class="dhc-info">
      <div class="dhc-title">${esc(b.productName||'—')}</div>
      <div class="dhc-meta">
        <div class="dhc-meta-item"><strong>${fmt(b.date)}</strong></div>
        ${b.batchCode ? `<div class="dhc-meta-item">Code: <strong class="text-brand">${esc(b.batchCode)}</strong></div>` : ''}
        ${b.internalBatchNo ? `<div class="dhc-meta-item">Internal: <strong style="color:var(--blue)">${esc(b.internalBatchNo)}</strong></div>` : ''}
        ${totalWt > 0 ? `<div class="dhc-meta-item">Raw Material: <strong>${totalWt.toFixed(2)} kg</strong></div>` : ''}
        ${qcBadge}
      </div>
    </div>
    <div class="dhc-actions">
      <button class="btn btn-secondary btn-sm" onclick="openEditModal('${b.id}')">✏️ Edit</button>
      <button class="btn btn-secondary btn-sm" onclick="printBatch('${b.id}')">🖨️</button>
      <button class="btn btn-danger btn-sm" onclick="confirmDelete('${b.id}')">🗑️</button>
    </div>
  </div>`;
}

function getStageDetailHTML(stage, b) {
  switch(stage) {
    case 0: return renderStage1Detail(b);
    case 1: return renderStage2Detail(b);
    case 2: return renderStage3Detail(b);
    case 3: return renderStage4Detail(b);
    default: return renderStage1Detail(b);
  }
}

// Stage 1 Detail — Raw Material
function renderStage1Detail(b) {
  const ings = b.ingredients || [];
  const totalBags = ings.reduce((s,i) => s + num(i.bags), 0);
  const totalWt   = ings.reduce((s,i) => s + num(i.totalQty), 0);

  const table = ings.length > 0 ? `
    <div style="overflow-x:auto;margin-top:0;">
      <table class="data-table">
        <thead>
          <tr>
            <th style="width:36px;">#</th>
            <th>Ingredient</th>
            <th>Supplier</th>
            <th>Supplier Batch No.</th>
            <th class="td-right">Bags</th>
            <th class="td-right">Net Qty (kg)</th>
          </tr>
        </thead>
        <tbody>
          ${ings.map((ing, idx) => `<tr>
            <td style="color:var(--text3);font-size:11px;">${idx+1}</td>
            <td class="td-main">${esc(ing.name)}</td>
            <td>${esc(ing.supplier||'—')}</td>
            <td class="td-code">${esc(ing.supplierBatch||'—')}</td>
            <td class="td-right">${num(ing.bags)}</td>
            <td class="td-right font-bold">${num(ing.totalQty).toFixed(2)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="table-foot">
        <div>
          <span class="tf-label">Total Ingredients: <strong>${ings.length}</strong></span>
          &nbsp;&nbsp;
          <span class="tf-label">Total Bags: <strong>${totalBags}</strong></span>
        </div>
        <div>
          <span class="tf-label">Total Net Weight</span>
          <span class="tf-value" style="margin-left:8px;">${totalWt.toFixed(2)} kg</span>
        </div>
      </div>
    </div>` :
    `<div class="empty-state" style="min-height:140px;">
      <div class="empty-icon" style="font-size:28px;">🌿</div>
      <div class="empty-title">No Ingredients Recorded</div>
      <div class="empty-sub">Edit this batch to add raw material entries</div>
    </div>`;

  return `<div class="section-block">
    <div class="section-head">
      <div class="sh-num">1</div>
      <div>
        <div class="sh-title">Raw Material & Ingredient Entry</div>
        <div class="sh-sub">Production date · Finished product · All ingredients with individual suppliers</div>
      </div>
      <div class="sh-badge">${ings.length > 0 ? `<span class="badge badge-green">${ings.length} ingredient${ings.length!==1?'s':''}</span>` : '<span class="badge badge-gray">Pending</span>'}</div>
    </div>
    <div class="section-body">
      <div class="detail-kv-grid" style="margin-bottom:18px;">
        <div class="dkv">
          <div class="dkv-label">Production Date</div>
          <div class="dkv-value">${fmt(b.date)}</div>
        </div>
        <div class="dkv">
          <div class="dkv-label">Finished Product</div>
          <div class="dkv-value">${esc(b.productName||'—')}</div>
        </div>
        <div class="dkv">
          <div class="dkv-label">Batch Code</div>
          <div class="dkv-value brand mono">${esc(b.batchCode||'—')}</div>
        </div>
        ${b.incharge ? `<div class="dkv"><div class="dkv-label">Shift Incharge</div><div class="dkv-value">${esc(b.incharge)}</div></div>` : ''}
        ${b.targetQty ? `<div class="dkv"><div class="dkv-label">Target Quantity</div><div class="dkv-value">${num(b.targetQty).toFixed(1)} kg</div></div>` : ''}
        ${b.category ? `<div class="dkv"><div class="dkv-label">Category</div><div class="dkv-value">${esc(b.category)}</div></div>` : ''}
      </div>
      ${table}
    </div>
  </div>`;
}

// Stage 2 Detail — Goods Check
function renderStage2Detail(b) {
  const qcColor = b.qcStatus === 'Approved' ? 'green' : b.qcStatus === 'Rejected' ? 'red' : '';
  const qcBoxStyle = b.qcStatus === 'Approved' ? 'info-box green' :
                     b.qcStatus === 'Rejected'  ? 'info-box red'   : 'info-box blue';
  const qcMsg = b.qcStatus === 'Approved' ? '✓ Raw materials approved. Processing can proceed.' :
                b.qcStatus === 'Rejected'  ? '✕ Raw materials rejected. Processing is blocked until authorized.' :
                'ℹ️ QC inspection not yet recorded for this batch.';

  return `<div class="section-block">
    <div class="section-head">
      <div class="sh-num green">2</div>
      <div>
        <div class="sh-title">Goods Check / Quality Inspection</div>
        <div class="sh-sub">Inspection result for incoming raw materials</div>
      </div>
      <div class="sh-badge">${b.qcStatus ?
        `<span class="badge badge-${b.qcStatus==='Approved'?'green':'red'}">${esc(b.qcStatus)}</span>` :
        `<span class="badge badge-gray">Pending</span>`}</div>
    </div>
    <div class="section-body">
      ${b.qcStatus ? `
      <div class="${qcBoxStyle}" style="margin-bottom:18px;">${qcMsg}</div>
      <div class="detail-kv-grid g2">
        <div class="dkv">
          <div class="dkv-label">QC Result</div>
          <div class="dkv-value ${qcColor} big">${esc(b.qcStatus||'—')}</div>
        </div>
        <div class="dkv">
          <div class="dkv-label">Inspector</div>
          <div class="dkv-value">${esc(b.qcInspector||'—')}</div>
        </div>
        <div class="dkv">
          <div class="dkv-label">Inspection Date</div>
          <div class="dkv-value">${fmt(b.qcDate)}</div>
        </div>
        ${b.qcRemarks ? `<div class="dkv"><div class="dkv-label">Remarks / Rejection Reason</div><div class="dkv-value muted">${esc(b.qcRemarks)}</div></div>` : ''}
      </div>` :
      `<div class="empty-state" style="min-height:140px;">
        <div class="empty-icon" style="font-size:28px;">✅</div>
        <div class="empty-title">QC Not Recorded</div>
        <div class="empty-sub">Edit this batch and complete Stage 2 to record the goods check result</div>
      </div>`}
    </div>
  </div>`;
}

// Stage 3 Detail — Processing
function renderStage3Detail(b) {
  const procIcon = b.processingLocation === 'Factory' ? '🏭' :
                   b.processingLocation === 'Shop'    ? '🏪' :
                   b.processingLocation === 'Cold Storage' ? '🧊' : '';
  const movements = b.stockMovements || [];
  const totalMoved = movements.reduce((s,m) => s + num(m.qty), 0);

  return `<div class="section-block">
    <div class="section-head">
      <div class="sh-num orange">3</div>
      <div>
        <div class="sh-title">Processing & Stock Movement</div>
        <div class="sh-sub">Processing location · Internal batch · Factory shortage · Stock destinations</div>
      </div>
      <div class="sh-badge">${b.processingLocation ?
        `<span class="badge badge-blue">${procIcon} ${esc(b.processingLocation)}</span>` :
        `<span class="badge badge-gray">Pending</span>`}</div>
    </div>
    <div class="section-body">
      ${b.processingLocation ? `
      <div class="detail-kv-grid" style="margin-bottom:18px;">
        <div class="dkv">
          <div class="dkv-label">Processing Location</div>
          <div class="dkv-value">${procIcon} ${esc(b.processingLocation||'—')}</div>
        </div>
        <div class="dkv">
          <div class="dkv-label">Internal Batch No.</div>
          <div class="dkv-value" style="color:var(--blue);font-family:monospace;">${esc(b.internalBatchNo||'—')}</div>
        </div>
        <div class="dkv">
          <div class="dkv-label">Processing Date</div>
          <div class="dkv-value">${fmt(b.processingDate)}</div>
        </div>
        ${b.processingLocation === 'Factory' ? `
        <div class="dkv">
          <div class="dkv-label">Sent to Factory</div>
          <div class="dkv-value">${num(b.sentToFactory).toFixed(2)} kg</div>
        </div>
        <div class="dkv">
          <div class="dkv-label">Factory Shortage</div>
          <div class="dkv-value ${num(b.factoryShortage)>0?'red':''}">${num(b.factoryShortage).toFixed(2)} kg</div>
        </div>
        <div class="dkv">
          <div class="dkv-label">Processed Output</div>
          <div class="dkv-value big">${num(b.sentToShop).toFixed(2)} kg</div>
        </div>` : ''}
        ${b.processingNotes ? `<div class="dkv span3"><div class="dkv-label">Notes</div><div class="dkv-value muted">${esc(b.processingNotes)}</div></div>` : ''}
      </div>

      ${movements.length > 0 ? `
      <div class="divider-label">Stock Movements</div>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr>
            <th>Destination</th>
            <th>Date</th>
            <th class="td-right">Quantity (kg)</th>
            <th>Remarks</th>
          </tr></thead>
          <tbody>
            ${movements.map(m => `<tr>
              <td class="td-main">${esc(m.destination||'—')}</td>
              <td>${fmt(m.date)}</td>
              <td class="td-right font-bold">${num(m.qty).toFixed(2)}</td>
              <td>${esc(m.remarks||'—')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div class="table-foot">
          <div class="tf-label">Total Moved</div>
          <div class="tf-value">${totalMoved.toFixed(2)} kg</div>
        </div>
      </div>` : ''}` :
      `<div class="empty-state" style="min-height:140px;">
        <div class="empty-icon" style="font-size:28px;">⚙️</div>
        <div class="empty-title">Processing Not Recorded</div>
        <div class="empty-sub">Edit this batch and complete Stage 3 to record processing details</div>
      </div>`}
    </div>
  </div>`;
}

// Stage 4 Detail — Packaging
function renderStage4Detail(b) {
  const rows = b.packagingRows || [];
  const totalPacked = rows.reduce((s,r) => s + num(r.totalKg), 0) || num(b.packagingOutput);
  const totalUnits  = rows.reduce((s,r) => s + num(r.packs), 0)   || num(b.unitsPacked);
  const available   = num(b.sentToShop) || num(b.packagingOutput) || 0;
  const remaining   = Math.max(0, available - totalPacked);

  return `<div class="section-block">
    <div class="section-head">
      <div class="sh-num">4</div>
      <div>
        <div class="sh-title">Packaging & Final Production</div>
        <div class="sh-sub">Pack sizes · Units packed · Total packaged quantity</div>
      </div>
      <div class="sh-badge">${totalPacked > 0 ?
        `<span class="badge badge-green">${totalPacked.toFixed(1)} kg Packed</span>` :
        `<span class="badge badge-gray">Pending</span>`}</div>
    </div>
    <div class="section-body">
      ${rows.length > 0 || totalPacked > 0 ? `
      <div class="detail-kv-grid g2" style="margin-bottom:18px;">
        <div class="dkv">
          <div class="dkv-label">Packaging Date</div>
          <div class="dkv-value">${fmt(b.packagingDate||b.mfgDate)}</div>
        </div>
        <div class="dkv">
          <div class="dkv-label">MFG Date</div>
          <div class="dkv-value">${fmt(b.mfgDate)}</div>
        </div>
        <div class="dkv">
          <div class="dkv-label">Expiry Date</div>
          <div class="dkv-value">${fmt(b.expiryDate)}</div>
        </div>
        <div class="dkv">
          <div class="dkv-label">Packaging Location</div>
          <div class="dkv-value">${esc(b.packagingLocation||b.processingLocation||'—')}</div>
        </div>
      </div>

      ${rows.length > 0 ? `
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr>
            <th>Pack Size</th>
            <th class="td-right">Units / Packs</th>
            <th class="td-right">Total (kg)</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => `<tr>
              <td class="td-main">${esc(r.packSize||'—')}</td>
              <td class="td-right">${num(r.packs)}</td>
              <td class="td-right font-bold">${num(r.totalKg).toFixed(2)}</td>
            </tr>`).join('')}
          </tbody>
        </table>
        <div class="table-foot">
          <div class="tf-label">Total Units: <strong>${totalUnits}</strong></div>
          <div class="tf-value">${totalPacked.toFixed(2)} kg</div>
        </div>
      </div>` : `<div class="detail-kv-grid g2">
        <div class="dkv"><div class="dkv-label">Pack Size</div><div class="dkv-value">${esc(b.packSize||'—')}</div></div>
        <div class="dkv"><div class="dkv-label">Units Packed</div><div class="dkv-value">${num(b.unitsPacked)}</div></div>
        <div class="dkv"><div class="dkv-label">Packaging Output</div><div class="dkv-value big">${num(b.packagingOutput).toFixed(2)} kg</div></div>
        ${b.packagingLoss ? `<div class="dkv"><div class="dkv-label">Packaging Loss</div><div class="dkv-value red">${num(b.packagingLoss).toFixed(2)} kg</div></div>` : ''}
      </div>`}

      <div class="pkg-balance-bar" style="margin-top:14px;">
        <div class="pbb-item total">
          <div class="pbb-lbl">Available</div>
          <div class="pbb-val">${available.toFixed(2)} kg</div>
        </div>
        <div class="pbb-item">
          <div class="pbb-lbl">Packed</div>
          <div class="pbb-val">${totalPacked.toFixed(2)} kg</div>
        </div>
        <div class="pbb-item ${remaining > 0 ? 'warn' : ''}">
          <div class="pbb-lbl">Remaining</div>
          <div class="pbb-val">${remaining.toFixed(2)} kg</div>
        </div>
      </div>` :
      `<div class="empty-state" style="min-height:140px;">
        <div class="empty-icon" style="font-size:28px;">📦</div>
        <div class="empty-title">Packaging Not Recorded</div>
        <div class="empty-sub">Edit this batch and complete Stage 4 to record packaging details</div>
      </div>`}
    </div>
  </div>`;
}

// ── SUMMARY PANEL ─────────────────────────────────────────────────────────────
function renderSummaryEmpty() {
  const sb = document.getElementById('summary-body');
  if (!sb) return;
  sb.innerHTML = `<div class="sum-empty">
    <div class="sum-empty-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="28" height="28"><path d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"/></svg>
    </div>
    <div>Select a batch to see its summary</div>
  </div>`;
}

function renderSummary(b) {
  const sb = document.getElementById('summary-body');
  if (!sb) return;
  const ings = b.ingredients || [];
  const totalWt   = ings.reduce((s,i) => s + num(i.totalQty), 0);
  const totalBags = ings.reduce((s,i) => s + num(i.bags), 0);
  const pkgRows   = b.packagingRows || [];
  const totalPacked = pkgRows.reduce((s,r) => s + num(r.totalKg), 0) || num(b.packagingOutput);
  const available   = num(b.sentToShop) || num(b.packagingOutput) || 0;
  const remaining   = Math.max(0, available - totalPacked);

  const stagesDone = [
    ings.length > 0,
    !!b.qcStatus,
    !!b.processingLocation,
    getPackagingStatus(b),
  ];
  const stageLabels = ['Raw Material Entry','Goods Check / QC','Processing','Packaging'];

  const stageRows = stageLabels.map((lbl, i) => {
    const isDone    = stagesDone[i];
    const isReject  = i === 1 && b.qcStatus === 'Rejected';
    const numCls    = isDone ? (isReject ? 'pending' : 'done') : 'pending';
    const statusTxt = isReject ? 'Rejected' : isDone ? 'Completed' : 'Pending';
    const statusCls = isReject ? 'rejected' : isDone ? 'done' : 'pending';
    return `<div class="sum-stage-row">
      <div class="sum-stage-num ${numCls}">${i+1}</div>
      <div class="sum-stage-label">${lbl}</div>
      <div class="sum-stage-status ${statusCls}">● ${statusTxt}</div>
    </div>`;
  }).join('');

  sb.innerHTML = `
    <div class="sum-section">
      <div class="sum-sec-title">Batch Info</div>
      <div class="sum-kv"><div class="sum-kv-label">Product</div><div class="sum-kv-value">${esc(b.productName||'—')}</div></div>
      <div class="sum-kv"><div class="sum-kv-label">Production Date</div><div class="sum-kv-value">${fmt(b.date)}</div></div>
      ${b.internalBatchNo ? `<div class="sum-kv"><div class="sum-kv-label">Internal Batch No.</div><div class="sum-kv-value" style="color:var(--blue);font-family:monospace">${esc(b.internalBatchNo)}</div></div>` : '<div class="sum-kv"><div class="sum-kv-label">Internal Batch No.</div><div class="sum-kv-value muted">—</div></div>'}
      <div class="sum-kv"><div class="sum-kv-label">Total Ingredients</div><div class="sum-kv-value">${ings.length}</div></div>
      <div class="sum-kv"><div class="sum-kv-label">Total Raw Material</div><div class="sum-kv-value big brand">${totalWt.toFixed(2)} kg</div></div>
    </div>

    <div class="sum-stages">
      ${stageRows}
    </div>

    <div class="stock-card">
      <div class="stock-card-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
        Live Stock Position
      </div>
      <div class="stock-row">
        <div class="stock-row-label">Processed Quantity</div>
        <div class="stock-row-value">${available > 0 ? available.toFixed(2) + ' kg' : '0.00 kg'}</div>
      </div>
      <div class="stock-row">
        <div class="stock-row-label">Packed Quantity</div>
        <div class="stock-row-value">${totalPacked > 0 ? totalPacked.toFixed(2) + ' kg' : '0.00 kg'}</div>
      </div>
      <div class="stock-row">
        <div class="stock-row-label">Remaining Quantity</div>
        <div class="stock-row-value" style="${remaining > 0 ? 'color:var(--orange)' : ''}">${remaining.toFixed(2)} kg</div>
      </div>
    </div>
  `;
}

// ── WIZARD ────────────────────────────────────────────────────────────────────
window.openNewModal = function() {
  _editId = null;
  _step   = 0;
  renderWizard({});
  document.getElementById('new-modal').classList.add('open');
};

window.openEditModal = function(id) {
  const b = allBatches.find(x => x.id === id);
  if (!b) return;
  _editId = id;
  _step   = 0;
  renderWizard(b);
  document.getElementById('new-modal').classList.add('open');
};

window.closeNewModal = function() {
  document.getElementById('new-modal').classList.remove('open');
};

function renderWizard(data) {
  const d = data || {};

  // Dots — flex-column: dot on top, label below, connector between steps
  const dotsEl = document.getElementById('wizard-dots');
  if (dotsEl) {
    const labels = ['Raw Material','Goods Check','Processing','Packaging'];
    dotsEl.innerHTML = labels.map((lbl, i) => {
      const dotCls   = i < _step ? 'done' : i === _step ? 'active' : '';
      const lblCls   = i < _step ? 'done' : i === _step ? 'active' : '';
      const icon     = i < _step ? '✓' : i+1;
      const connector = i < labels.length-1
        ? `<div class="wz-connector"><div class="wz-line ${i < _step ? 'done' : ''}"></div></div>`
        : '';
      return `<div class="wz-step">
        <div class="wz-step-inner">
          <div class="wz-dot ${dotCls}">${icon}</div>
          <div class="wz-label ${lblCls}">${lbl}</div>
        </div>
      </div>${connector}`;
    }).join('');
  }

  const titleEl = document.getElementById('wizard-title');
  const subEl   = document.getElementById('wizard-sub');
  if (titleEl) titleEl.textContent = STEPS[_step].title;
  if (subEl)   subEl.textContent   = STEPS[_step].sub;

  const backBtn = document.getElementById('btn-back');
  const nextBtn = document.getElementById('btn-next');
  if (backBtn) backBtn.style.display = _step > 0 ? '' : 'none';
  if (nextBtn) nextBtn.textContent   = _step === STEPS.length-1 ? '💾 Save Batch' : 'Continue →';

  const body = document.getElementById('wizard-body');
  if (body) body.innerHTML = getWizardStepHTML(_step, d);

  // Post-render
  if (_step === 0) initIngRows(d.ingredients || []);
  if (_step === 2) initMovRows(d.stockMovements || []);
  if (_step === 3) initPkgRows(d.packagingRows || []);
  if (_step === 1 && d.qcStatus) {
    const btn = document.querySelector(`.qc-btn.${d.qcStatus === 'Approved' ? 'accept' : 'reject'}`);
    if (btn) { btn.classList.add('selected'); toggleQcReject(d.qcStatus === 'Rejected'); }
  }
  if (_step === 2 && d.processingLocation) {
    const btn = document.querySelector(`.proc-btn[data-loc="${d.processingLocation}"]`);
    if (btn) { btn.classList.add('selected'); toggleFactoryFields(d.processingLocation === 'Factory'); }
  }
}

function getWizardStepHTML(step, d) {
  switch(step) {
    case 0: return wizStep1(d);
    case 1: return wizStep2(d);
    case 2: return wizStep3(d);
    case 3: return wizStep4(d);
    default: return '';
  }
}

// Step 1 — Raw Material
function wizStep1(d) {
  return `
    <div class="divider-label">General Production Details</div>
    <div class="form-grid" style="margin-bottom:18px;">
      <div class="form-group">
        <label class="form-label">Production Date <span class="req">*</span></label>
        <input type="date" id="f-date" value="${esc(d.date||today())}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Finished Product Name <span class="req">*</span></label>
        <input type="text" id="f-product" value="${esc(d.productName||'')}" list="dl-products"
          placeholder="e.g. Mix Masala" autocomplete="off" oninput="onProductChange()"/>
      </div>
      <div class="form-group">
        <label class="form-label">Batch Code</label>
        <input type="text" id="f-batchcode" value="${esc(d.batchCode||'')}" placeholder="Auto-generated"/>
      </div>
      <div class="form-group">
        <label class="form-label">Shift Incharge</label>
        <input type="text" id="f-incharge" value="${esc(d.incharge||'')}" placeholder="Name of supervisor"/>
      </div>
    </div>

    <div class="divider-label">Ingredient & Raw Material Table</div>
    <div class="info-box blue" style="margin-bottom:12px;">
      ℹ️ Each ingredient row has its own supplier. The finished product is manufactured internally — no supplier required for it.
    </div>
    <div class="ing-table-wrap">
      <table class="ing-table">
        <thead>
          <tr>
            <th style="width:30px;">#</th>
            <th>Ingredient Name <span style="color:var(--brand)">*</span></th>
            <th>Supplier Name <span style="color:var(--brand)">*</span></th>
            <th>Supplier Batch No. <span style="color:var(--brand)">*</span></th>
            <th class="th-num">Bags <span style="color:var(--brand)">*</span></th>
            <th class="th-num">Net Qty (kg) <span style="color:var(--brand)">*</span></th>
            <th style="width:36px;"></th>
          </tr>
        </thead>
        <tbody id="ing-rows"></tbody>
      </table>
    </div>
    <button class="btn-add-row" onclick="addIngRow()">+ Add Ingredient</button>

    <div class="ing-totals-bar" id="ing-totals">
      <div class="it-item"><div class="it-label">Ingredients</div><div class="it-value" id="it-count">0</div></div>
      <div class="it-item"><div class="it-label">Total Bags</div><div class="it-value" id="it-bags">0</div></div>
      <div class="it-item"><div class="it-label">Total Net Weight</div><div class="it-value" id="it-wt">0.00 kg</div></div>
    </div>
  `;
}

function initIngRows(ings) {
  const tbody = document.getElementById('ing-rows');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (ings && ings.length > 0) {
    ings.forEach(ing => addIngRow(ing));
  } else {
    addIngRow();
  }
  calcIngTotals();
}

window.addIngRow = function(data) {
  const d = data || {};
  const tbody = document.getElementById('ing-rows');
  if (!tbody) return;
  const idx = tbody.children.length + 1;
  const tr = document.createElement('tr');
  tr.className = 'ing-row';
  tr.innerHTML = `
    <td style="color:var(--text3);font-size:11px;text-align:center;">${idx}</td>
    <td><input type="text" class="ing-name" value="${esc(d.name||'')}" list="dl-ingredients" placeholder="Ingredient name" autocomplete="off" oninput="calcIngTotals()"/></td>
    <td><input type="text" class="ing-supplier" value="${esc(d.supplier||'')}" list="dl-suppliers" placeholder="Supplier name" autocomplete="off"/></td>
    <td><input type="text" class="ing-sbatch" value="${esc(d.supplierBatch||'')}" placeholder="Supplier batch / lot no."/></td>
    <td><input type="number" class="ing-bags td-num" value="${d.bags||''}" placeholder="0" min="0" step="1" style="text-align:right;" oninput="calcIngTotals()"/></td>
    <td><input type="number" class="ing-qty td-num" value="${d.totalQty||''}" placeholder="0.00" min="0" step="0.01" style="text-align:right;" oninput="calcIngTotals()"/></td>
    <td><button class="btn-remove-row" onclick="removeIngRow(this)" title="Remove">×</button></td>
  `;
  tbody.appendChild(tr);
  calcIngTotals();
};

window.removeIngRow = function(btn) {
  const tbody = document.getElementById('ing-rows');
  if (tbody && tbody.children.length <= 1) {
    showToast('At least one ingredient is required', 'error');
    return;
  }
  btn.closest('tr').remove();
  renumberIngRows();
  calcIngTotals();
};

function renumberIngRows() {
  const rows = document.querySelectorAll('#ing-rows .ing-row');
  rows.forEach((r, i) => {
    const first = r.querySelector('td:first-child');
    if (first) first.textContent = i + 1;
  });
}

window.calcIngTotals = function() {
  const rows = document.querySelectorAll('#ing-rows .ing-row');
  let bags = 0, wt = 0, count = 0;
  rows.forEach(r => {
    const b = num(r.querySelector('.ing-bags')?.value);
    const q = num(r.querySelector('.ing-qty')?.value);
    bags += b; wt += q;
    if (r.querySelector('.ing-name')?.value?.trim()) count++;
  });
  const ic = document.getElementById('it-count'); if (ic) ic.textContent = count;
  const ib = document.getElementById('it-bags');  if (ib) ib.textContent = bags;
  const iw = document.getElementById('it-wt');    if (iw) iw.textContent = wt.toFixed(2) + ' kg';
};

window.onProductChange = function() {
  const p = document.getElementById('f-product')?.value?.trim();
  const d = document.getElementById('f-date')?.value;
  const bc = document.getElementById('f-batchcode');
  if (bc && !bc.value.trim() && p) bc.value = genBatchCode(p, d);
};

function collectIngredients() {
  const rows = document.querySelectorAll('#ing-rows .ing-row');
  const ings = [];
  rows.forEach(r => {
    const name = r.querySelector('.ing-name')?.value?.trim();
    if (!name) return;
    ings.push({
      name,
      supplier:      r.querySelector('.ing-supplier')?.value?.trim() || '',
      supplierBatch: r.querySelector('.ing-sbatch')?.value?.trim()   || '',
      bags:          num(r.querySelector('.ing-bags')?.value),
      totalQty:      num(r.querySelector('.ing-qty')?.value),
    });
  });
  return ings;
}

// Step 2 — Goods Check
function wizStep2(d) {
  const ings = collectIngredients();
  const totalWt = ings.reduce((s,i) => s + num(i.totalQty), 0);
  return `
    <div class="info-box blue" style="margin-bottom:16px;">
      ℹ️ Inspecting batch: Raw material total <strong>${totalWt.toFixed(2)} kg</strong> across <strong>${ings.length} ingredient${ings.length!==1?'s':''}</strong>
    </div>

    <div class="divider-label">QC Result</div>
    <div class="qc-choice">
      <button type="button" class="qc-btn accept" onclick="selectQC('Approved', this)">
        <div class="qb-icon">✅</div>
        <div style="font-size:15px;font-weight:800;">ACCEPTED</div>
        <div class="qb-label">Materials approved for processing</div>
      </button>
      <button type="button" class="qc-btn reject" onclick="selectQC('Rejected', this)">
        <div class="qb-icon">❌</div>
        <div style="font-size:15px;font-weight:800;">REJECTED</div>
        <div class="qb-label">Materials fail quality standards</div>
      </button>
    </div>
    <input type="hidden" id="f-qcstatus" value="${esc(d.qcStatus||'')}"/>

    <div class="form-grid" style="margin-top:18px;">
      <div class="form-group">
        <label class="form-label">Inspector Name</label>
        <input type="text" id="f-qcinspector" value="${esc(d.qcInspector||'')}" placeholder="Name of quality inspector"/>
      </div>
      <div class="form-group">
        <label class="form-label">Inspection Date</label>
        <input type="date" id="f-qcdate" value="${esc(d.qcDate||today())}"/>
      </div>
      <div class="form-group fg-full" id="qc-reject-section" style="${d.qcStatus==='Rejected'?'':'display:none'}">
        <label class="form-label">Rejection Reason <span class="req">*</span></label>
        <textarea id="f-qcremarks" placeholder="Describe the reason for rejection (e.g. moisture content too high, foreign material found…)">${esc(d.qcStatus==='Rejected'?(d.qcRemarks||''):'')}</textarea>
      </div>
      <div class="form-group fg-full" id="qc-notes-section" style="${d.qcStatus==='Rejected'?'display:none':''}">
        <label class="form-label">QC Notes (optional)</label>
        <textarea id="f-qcnotes" placeholder="Additional quality notes…">${esc(d.qcStatus!=='Rejected'?(d.qcRemarks||''):'')}</textarea>
      </div>
    </div>
  `;
}

window.selectQC = function(val, btn) {
  document.querySelectorAll('.qc-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const h = document.getElementById('f-qcstatus');
  if (h) h.value = val;
  toggleQcReject(val === 'Rejected');
};
function toggleQcReject(isReject) {
  const rs = document.getElementById('qc-reject-section');
  const ns = document.getElementById('qc-notes-section');
  if (rs) rs.style.display = isReject ? '' : 'none';
  if (ns) ns.style.display = isReject ? 'none' : '';
}

// Step 3 — Processing
function wizStep3(d) {
  const ings = collectIngredients();
  const totalWt = ings.reduce((s,i) => s + num(i.totalQty), 0) ||
    (allBatches.find(b => b.id === _editId)?.ingredients||[]).reduce((s,i) => s+num(i.totalQty), 0);

  return `
    <div class="info-box ${d.qcStatus==='Rejected'?'red':'green'}" style="margin-bottom:16px;">
      ${d.qcStatus==='Rejected'
        ? '⚠️ QC Result: REJECTED. Processing of rejected materials requires explicit authorization.'
        : `✓ QC Result: ${esc(d.qcStatus||'Approved')}. Total approved raw material: <strong>${totalWt.toFixed(2)} kg</strong>`}
    </div>

    <div class="divider-label">Processing Location</div>
    <div class="proc-choice" style="margin-bottom:18px;">
      <button type="button" class="proc-btn" data-loc="Factory" onclick="selectProc('Factory',this)">
        <div class="pb-icon">🏭</div>
        <div style="font-weight:700;">FACTORY</div>
        <div class="pb-sub">Grinding / Blending</div>
      </button>
      <button type="button" class="proc-btn" data-loc="Shop" onclick="selectProc('Shop',this)">
        <div class="pb-icon">🏪</div>
        <div style="font-weight:700;">SHOP</div>
        <div class="pb-sub">Direct Processing</div>
      </button>
      <button type="button" class="proc-btn" data-loc="Cold Storage" onclick="selectProc('Cold Storage',this)">
        <div class="pb-icon">🧊</div>
        <div style="font-weight:700;">COLD STORAGE</div>
        <div class="pb-sub">Cold Chain</div>
      </button>
    </div>
    <input type="hidden" id="f-procloc" value="${esc(d.processingLocation||'')}"/>

    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Internal Batch Number</label>
        <input type="text" id="f-intbatch" value="${esc(d.internalBatchNo||'')}" placeholder="e.g. MX-2026-001"/>
      </div>
      <div class="form-group">
        <label class="form-label">Processing Date</label>
        <input type="date" id="f-procdate" value="${esc(d.processingDate||today())}"/>
      </div>
    </div>

    <!-- Factory-specific fields -->
    <div id="factory-fields" style="${d.processingLocation==='Factory'?'':'display:none'}">
      <div class="divider-label">Factory Details</div>
      <div class="form-grid-3">
        <div class="form-group">
          <label class="form-label">Sent to Factory (kg)</label>
          <input type="number" id="f-senttofactory" value="${d.sentToFactory||''}" placeholder="0.00" min="0" step="0.01" oninput="calcFactoryOut()"/>
        </div>
        <div class="form-group">
          <label class="form-label">Factory Shortage (kg)</label>
          <input type="number" id="f-shortage" value="${d.factoryShortage||''}" placeholder="0.00" min="0" step="0.01" style="color:var(--red)" oninput="calcFactoryOut()"/>
        </div>
        <div class="form-group">
          <label class="form-label">Processed Output (kg)</label>
          <input type="number" id="f-senttoshop" value="${d.sentToShop||''}" placeholder="Auto-calculated" min="0" step="0.01" readonly style="color:var(--green);font-weight:700;"/>
        </div>
      </div>
    </div>

    <div class="form-group" style="margin-top:14px;">
      <label class="form-label">Processing Notes</label>
      <textarea id="f-procnotes" placeholder="Any additional notes about this processing run…">${esc(d.processingNotes||'')}</textarea>
    </div>

    <div class="divider-label">Stock Movements</div>
    <div class="info-box blue" style="margin-bottom:10px;">
      ℹ️ Record where the processed material is sent — Shop, Cold Storage, or other destinations. You can split across multiple destinations.
    </div>
    <div style="overflow-x:auto;">
      <table class="mov-table">
        <thead><tr>
          <th>Destination</th>
          <th>Date</th>
          <th style="text-align:right;">Quantity (kg)</th>
          <th>Remarks</th>
          <th style="width:36px;"></th>
        </tr></thead>
        <tbody id="mov-rows"></tbody>
      </table>
    </div>
    <button class="btn-add-row" onclick="addMovRow()" style="margin-top:8px;">+ Add Stock Movement</button>
  `;
}

function initMovRows(movs) {
  const tbody = document.getElementById('mov-rows');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (movs && movs.length > 0) movs.forEach(m => addMovRow(m));
}

window.addMovRow = function(data) {
  const d = data || {};
  const tbody = document.getElementById('mov-rows');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>
      <select class="mov-dest" style="min-width:130px;">
        <option value="">— Select —</option>
        ${['Shop','Cold Storage','Dry Store','Warehouse','Factory Store'].map(s =>
          `<option ${d.destination===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </td>
    <td><input type="date" class="mov-date" value="${esc(d.date||today())}"/></td>
    <td><input type="number" class="mov-qty" value="${d.qty||''}" placeholder="0.00" min="0" step="0.01" style="text-align:right;"/></td>
    <td><input type="text" class="mov-remarks" value="${esc(d.remarks||'')}" placeholder="Optional remarks"/></td>
    <td><button class="btn-remove-row" onclick="this.closest('tr').remove()" title="Remove">×</button></td>
  `;
  tbody.appendChild(tr);
};

window.selectProc = function(val, btn) {
  document.querySelectorAll('.proc-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const h = document.getElementById('f-procloc');
  if (h) h.value = val;
  toggleFactoryFields(val === 'Factory');
};
function toggleFactoryFields(show) {
  const ff = document.getElementById('factory-fields');
  if (ff) ff.style.display = show ? '' : 'none';
}
window.calcFactoryOut = function() {
  const sent  = num(document.getElementById('f-senttofactory')?.value);
  const short = num(document.getElementById('f-shortage')?.value);
  const out   = document.getElementById('f-senttoshop');
  if (out) out.value = Math.max(0, sent - short).toFixed(2);
};

// Step 4 — Packaging
function wizStep4(d) {
  const processed = num(d.sentToShop) || 0;
  return `
    ${processed > 0 ? `<div class="info-box green" style="margin-bottom:16px;">
      ✓ Available for packaging: <strong>${processed.toFixed(2)} kg</strong> processed output
    </div>` : ''}

    <div class="divider-label">Packaging Details</div>
    <div class="form-grid">
      <div class="form-group">
        <label class="form-label">Packaging Date</label>
        <input type="date" id="f-pkgdate" value="${esc(d.packagingDate||d.mfgDate||today())}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Packaging Location</label>
        <select id="f-pkgloc">
          <option value="">— Select —</option>
          ${['Factory','Shop','Cold Storage'].map(s => `<option ${(d.packagingLocation||d.processingLocation)===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">MFG Date</label>
        <input type="date" id="f-mfgdate" value="${esc(d.mfgDate||today())}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Expiry Date</label>
        <input type="date" id="f-expirydate" value="${esc(d.expiryDate||'')}"/>
      </div>
    </div>

    <div class="divider-label">Packaging Sizes & Quantities</div>
    <div class="info-box blue" style="margin-bottom:10px;">
      ℹ️ Add one row per pack size. Total packed quantity will be calculated automatically.
    </div>
    <div style="overflow-x:auto;">
      <table class="pkg-table">
        <thead><tr>
          <th>Pack Size</th>
          <th style="text-align:right;">No. of Packs</th>
          <th style="text-align:right;">Total (kg)</th>
          <th style="width:36px;"></th>
        </tr></thead>
        <tbody id="pkg-rows"></tbody>
      </table>
    </div>
    <button class="btn-add-row" onclick="addPkgRow()" style="margin-top:8px;">+ Add Pack Size</button>

    <div class="pkg-balance-bar" id="pkg-balance" style="margin-top:14px;">
      <div class="pbb-item total"><div class="pbb-lbl">Available</div><div class="pbb-val" id="pb-avail">${processed.toFixed(2)} kg</div></div>
      <div class="pbb-item"><div class="pbb-lbl">Packed</div><div class="pbb-val" id="pb-packed">0.00 kg</div></div>
      <div class="pbb-item warn"><div class="pbb-lbl">Remaining</div><div class="pbb-val" id="pb-remain">${processed.toFixed(2)} kg</div></div>
    </div>

    <div class="form-group" style="margin-top:14px;">
      <label class="form-label">Packaging Notes</label>
      <textarea id="f-packnotes" placeholder="Any notes about this packaging run…">${esc(d.packagingNotes||'')}</textarea>
    </div>
  `;
}

function initPkgRows(rows) {
  const tbody = document.getElementById('pkg-rows');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (rows && rows.length > 0) rows.forEach(r => addPkgRow(r));
  else addPkgRow();
  calcPkgBalance();
}

window.addPkgRow = function(data) {
  const d = data || {};
  const tbody = document.getElementById('pkg-rows');
  if (!tbody) return;
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>
      <select class="pkg-size" onchange="calcPkgRow(this)">
        <option value="">— Select —</option>
        ${PACK_SIZES.map(s => `<option ${d.packSize===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </td>
    <td><input type="number" class="pkg-packs" value="${d.packs||''}" placeholder="0" min="0" step="1" style="text-align:right;" oninput="calcPkgRow(this)"/></td>
    <td><div class="td-auto pkg-total">${d.totalKg ? num(d.totalKg).toFixed(2) : '—'}</div></td>
    <td><button class="btn-remove-row" onclick="this.closest('tr').remove();calcPkgBalance()" title="Remove">×</button></td>
  `;
  tbody.appendChild(tr);
  if (d.totalKg) calcPkgBalance();
};

window.calcPkgRow = function(inp) {
  const tr = inp.closest('tr');
  if (!tr) return;
  const size  = tr.querySelector('.pkg-size')?.value;
  const packs = num(tr.querySelector('.pkg-packs')?.value);
  const kg    = parsePackSizeKg(size) * packs;
  const totalEl = tr.querySelector('.pkg-total');
  if (totalEl) totalEl.textContent = kg > 0 ? kg.toFixed(2) : '—';
  calcPkgBalance();
};

function calcPkgBalance() {
  const rows = document.querySelectorAll('#pkg-rows tr');
  let packed = 0;
  rows.forEach(tr => {
    const size  = tr.querySelector('.pkg-size')?.value;
    const packs = num(tr.querySelector('.pkg-packs')?.value);
    packed += parsePackSizeKg(size) * packs;
  });
  const avail = num(document.getElementById('pb-avail')?.textContent);
  const remain = Math.max(0, avail - packed);
  const pb = document.getElementById('pb-packed'); if (pb) pb.textContent = packed.toFixed(2) + ' kg';
  const pr = document.getElementById('pb-remain'); if (pr) pr.textContent = remain.toFixed(2) + ' kg';
}

function collectPackagingRows() {
  const rows = document.querySelectorAll('#pkg-rows tr');
  const result = [];
  rows.forEach(tr => {
    const size  = tr.querySelector('.pkg-size')?.value;
    const packs = num(tr.querySelector('.pkg-packs')?.value);
    if (!size || packs <= 0) return;
    const totalKg = parsePackSizeKg(size) * packs;
    result.push({ packSize: size, packs, totalKg });
  });
  return result;
}

function collectMovements() {
  const rows = document.querySelectorAll('#mov-rows tr');
  const result = [];
  rows.forEach(tr => {
    const dest = tr.querySelector('.mov-dest')?.value;
    const qty  = num(tr.querySelector('.mov-qty')?.value);
    if (!dest || qty <= 0) return;
    result.push({
      destination: dest,
      date:    tr.querySelector('.mov-date')?.value   || '',
      qty,
      remarks: tr.querySelector('.mov-remarks')?.value?.trim() || '',
    });
  });
  return result;
}

// ── WIZARD NAVIGATION ─────────────────────────────────────────────────────────
window.wizardNext = function() {
  if (!validateStep(_step)) return;
  if (_step === STEPS.length - 1) {
    saveBatchData();
    return;
  }
  const partial = collectPartialData();
  _step++;
  renderWizard(partial);
};

window.wizardBack = function() {
  if (_step === 0) return;
  const partial = collectPartialData();
  _step--;
  renderWizard(partial);
};

function validateStep(step) {
  if (step === 0) {
    const p  = document.getElementById('f-product')?.value?.trim();
    const dt = document.getElementById('f-date')?.value;
    if (!p)  { showToast('Finished product name is required', 'error'); return false; }
    if (!dt) { showToast('Production date is required', 'error'); return false; }
    const ings = collectIngredients();
    if (ings.length === 0) { showToast('Add at least one ingredient', 'error'); return false; }
    const invalid = ings.filter(i => !i.name || !i.supplier || num(i.totalQty) <= 0);
    if (invalid.length > 0) {
      showToast(`Fill ingredient name, supplier, and net quantity for all rows`, 'error');
      return false;
    }
    const bc = document.getElementById('f-batchcode');
    if (bc && !bc.value.trim()) bc.value = genBatchCode(p, dt);
  }
  if (step === 1) {
    const qc = document.getElementById('f-qcstatus')?.value;
    if (!qc) { showToast('Select QC result (Accepted or Rejected)', 'error'); return false; }
    if (qc === 'Rejected') {
      const reason = document.getElementById('f-qcremarks')?.value?.trim();
      if (!reason) { showToast('Rejection reason is required when QC is Rejected', 'error'); return false; }
    }
  }
  return true;
}

function collectPartialData() {
  const d = {};
  // Step 1
  const prod = document.getElementById('f-product');
  if (prod) d.productName = prod.value.trim();
  const dt = document.getElementById('f-date');
  if (dt) d.date = dt.value;
  const bc = document.getElementById('f-batchcode');
  if (bc) d.batchCode = bc.value.trim();
  const inch = document.getElementById('f-incharge');
  if (inch) d.incharge = inch.value.trim();
  const ings = collectIngredients();
  if (ings.length > 0) d.ingredients = ings;

  // Step 2
  const qcs = document.getElementById('f-qcstatus');
  if (qcs) d.qcStatus = qcs.value;
  const qci = document.getElementById('f-qcinspector');
  if (qci) d.qcInspector = qci.value.trim();
  const qcd = document.getElementById('f-qcdate');
  if (qcd) d.qcDate = qcd.value;
  const qcr = document.getElementById('f-qcremarks');
  const qcn = document.getElementById('f-qcnotes');
  d.qcRemarks = (qcr?.value || qcn?.value || '').trim();

  // Step 3
  const pl = document.getElementById('f-procloc');
  if (pl) d.processingLocation = pl.value;
  const ib = document.getElementById('f-intbatch');
  if (ib) d.internalBatchNo = ib.value.trim();
  const pd = document.getElementById('f-procdate');
  if (pd) d.processingDate = pd.value;
  const stf = document.getElementById('f-senttofactory');
  if (stf) d.sentToFactory = num(stf.value) || undefined;
  const sh = document.getElementById('f-shortage');
  if (sh) d.factoryShortage = num(sh.value) || undefined;
  const sts = document.getElementById('f-senttoshop');
  if (sts) d.sentToShop = num(sts.value) || undefined;
  const pn = document.getElementById('f-procnotes');
  if (pn) d.processingNotes = pn.value.trim();
  const movs = collectMovements();
  if (movs.length > 0) d.stockMovements = movs;

  // Step 4
  const pkgd = document.getElementById('f-pkgdate');
  if (pkgd) d.packagingDate = pkgd.value;
  const pkgl = document.getElementById('f-pkgloc');
  if (pkgl) d.packagingLocation = pkgl.value;
  const mfgd = document.getElementById('f-mfgdate');
  if (mfgd) d.mfgDate = mfgd.value;
  const exd = document.getElementById('f-expirydate');
  if (exd) d.expiryDate = exd.value;
  const pkgn = document.getElementById('f-packnotes');
  if (pkgn) d.packagingNotes = pkgn.value.trim();
  const pkgRows = collectPackagingRows();
  if (pkgRows.length > 0) d.packagingRows = pkgRows;

  return d;
}

async function saveBatchData() {
  const data = collectPartialData();
  const ings = data.ingredients || (allBatches.find(b => b.id === _editId)?.ingredients || []);
  const totalNetWeight = ings.reduce((s,i) => s + num(i.totalQty), 0);
  const pkgRows = data.packagingRows || (allBatches.find(b => b.id === _editId)?.packagingRows || []);
  const totalPacked = pkgRows.reduce((s,r) => s + num(r.totalKg), 0);

  const existing = _editId ? allBatches.find(x => x.id === _editId) : null;

  const batch = {
    ...(existing || {}),
    ...data,
    id:             _editId || uid(),
    ingredients:    ings,
    totalNetWeight,
    packagingRows:  pkgRows,
    totalPacked,
    createdAt:      existing?.createdAt || new Date().toISOString(),
    updatedAt:      new Date().toISOString(),
  };

  // Save to cloud
  try {
    await saveBatch(batch);
  } catch (e) {
    console.warn('Cloud save failed:', e);
  }

  // Update local state
  if (_editId) {
    const idx = allBatches.findIndex(x => x.id === _editId);
    if (idx !== -1) allBatches[idx] = batch;
    else allBatches.unshift(batch);
  } else {
    allBatches.unshift(batch);
  }

  saveLocal(allBatches);
  filtered = [...allBatches];
  renderList();
  closeNewModal();
  currentId = batch.id;
  activeStage = 0;
  openDetail(batch.id);
  showToast(_editId ? '✅ Batch updated successfully' : '✅ New batch saved successfully', 'success');
  _editId = null;
}

// ── DELETE ────────────────────────────────────────────────────────────────────
window.confirmDelete = function(id) {
  const b = allBatches.find(x => x.id === id);
  const msg = document.getElementById('confirm-msg');
  if (msg && b) msg.textContent = `"${b.productName}" (${b.batchCode||id}) will be permanently deleted. This cannot be undone.`;
  const okBtn = document.getElementById('confirm-ok-btn');
  if (okBtn) okBtn.onclick = () => doDelete(id);
  document.getElementById('confirm-modal').classList.add('open');
};

window.closeConfirm = function() {
  document.getElementById('confirm-modal').classList.remove('open');
};

async function doDelete(id) {
  try { await deleteBatchDoc(id); } catch {}
  allBatches = allBatches.filter(x => x.id !== id);
  filtered   = filtered.filter(x => x.id !== id);
  saveLocal(allBatches);
  renderList();
  closeConfirm();
  currentId = null;
  if (allBatches.length > 0) openDetail(allBatches[0].id);
  else {
    const ws = document.getElementById('workspace-body');
    if (ws) ws.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📦</div>
      <div class="empty-title">No Batches</div>
      <div class="empty-sub">Create a new batch entry to get started</div>
      <button class="btn btn-primary" style="margin-top:12px;" onclick="openNewModal()">+ New Batch Entry</button>
    </div>`;
    renderSummaryEmpty();
  }
  showToast('Batch deleted', 'success');
}

// ── PRINT & DOSSIER MODAL ──────────────────────────────────────────────────
let _printTab = 'single';

function _todayStr() {
  return new Date().toISOString().split('T')[0];
}

function _renderBatchDossierHtml(b, isLastPage) {
  const ings = b.ingredients || [];
  const totalNet = ings.reduce((s,i) => s + num(i.totalQty), 0);
  const pkgRows = b.packagingRows || [];
  const totalPacked = pkgRows.reduce((s,r) => s + num(r.totalKg), 0) || num(b.packagingOutput);
  const movements = b.stockMovements || [];

  return `<div class="dossier-page" style="page-break-after:${isLastPage ? 'avoid' : 'always'}; margin-bottom:28px;">
    <h1>🌶 365 Spicery — Batch Production Dossier</h1>
    <div class="gen">Batch Code: <strong>${esc(b.batchCode || b.id)}</strong> | Generated: ${new Date().toLocaleString('en-IN')}</div>

    <div class="sec">01 — Raw Material &amp; Ingredient Entry</div>
    <div class="kv">
      <div class="kvp"><div class="kl">Production Date</div><div class="kv-v">${fmt(b.date)}</div></div>
      <div class="kvp"><div class="kl">Finished Product</div><div class="kv-v">${esc(b.productName)}</div></div>
      <div class="kvp"><div class="kl">Batch Code</div><div class="kv-v">${esc(b.batchCode||'—')}</div></div>
      <div class="kvp"><div class="kl">Internal Batch</div><div class="kv-v">${esc(b.internalBatchNo||'—')}</div></div>
      ${b.incharge ? `<div class="kvp"><div class="kl">Incharge</div><div class="kv-v">${esc(b.incharge)}</div></div>` : ''}
    </div>
    <table>
      <thead><tr><th>#</th><th>Ingredient</th><th>Supplier</th><th>Supplier Batch No.</th><th>Bags</th><th style="text-align:right">Net Qty (kg)</th></tr></thead>
      <tbody>
      ${ings.map((i,idx) => `<tr>
        <td>${idx+1}</td>
        <td><strong>${esc(i.name)}</strong></td>
        <td>${esc(i.supplier||'—')}</td>
        <td>${esc(i.supplierBatch||'—')}</td>
        <td>${num(i.bags)}</td>
        <td style="text-align:right"><strong>${num(i.totalQty).toFixed(2)}</strong></td>
      </tr>`).join('')}
      <tr class="tot"><td colspan="5"><strong>Total Net Weight</strong></td><td style="text-align:right"><strong>${totalNet.toFixed(2)} kg</strong></td></tr>
      </tbody>
    </table>

    <div class="sec">02 — Goods Check / QC</div>
    <div class="kv">
      <div class="kvp"><div class="kl">QC Result</div><div class="kv-v ${b.qcStatus==='Approved'?'badge-g':b.qcStatus==='Rejected'?'badge-r':''}">${esc(b.qcStatus||'—')}</div></div>
      <div class="kvp"><div class="kl">Inspector</div><div class="kv-v">${esc(b.qcInspector||'—')}</div></div>
      <div class="kvp"><div class="kl">Inspection Date</div><div class="kv-v">${fmt(b.qcDate)}</div></div>
      ${b.qcRemarks ? `<div class="kvp"><div class="kl">Remarks</div><div class="kv-v">${esc(b.qcRemarks)}</div></div>` : ''}
    </div>

    <div class="sec">03 — Processing &amp; Stock Movement</div>
    <div class="kv">
      <div class="kvp"><div class="kl">Processing Location</div><div class="kv-v">${esc(b.processingLocation||'—')}</div></div>
      <div class="kvp"><div class="kl">Internal Batch No.</div><div class="kv-v">${esc(b.internalBatchNo||'—')}</div></div>
      ${b.sentToFactory ? `<div class="kvp"><div class="kl">Sent to Factory</div><div class="kv-v">${num(b.sentToFactory).toFixed(2)} kg</div></div>` : ''}
      ${b.factoryShortage ? `<div class="kvp"><div class="kl">Factory Shortage</div><div class="kv-v">${num(b.factoryShortage).toFixed(2)} kg</div></div>` : ''}
      ${b.sentToShop ? `<div class="kvp"><div class="kl">Processed Output</div><div class="kv-v">${num(b.sentToShop).toFixed(2)} kg</div></div>` : ''}
    </div>
    ${movements.length > 0 ? `<table>
      <thead><tr><th>Destination</th><th>Date</th><th style="text-align:right">Qty (kg)</th><th>Remarks</th></tr></thead>
      <tbody>
      ${movements.map(m => `<tr><td>${esc(m.destination)}</td><td>${fmt(m.date)}</td><td style="text-align:right">${num(m.qty).toFixed(2)}</td><td>${esc(m.remarks||'—')}</td></tr>`).join('')}
      </tbody>
    </table>` : ''}

    <div class="sec">04 — Packaging</div>
    <div class="kv">
      <div class="kvp"><div class="kl">MFG Date</div><div class="kv-v">${fmt(b.mfgDate)}</div></div>
      <div class="kvp"><div class="kl">Expiry Date</div><div class="kv-v">${fmt(b.expiryDate)}</div></div>
      <div class="kvp"><div class="kl">Total Packed</div><div class="kv-v">${totalPacked.toFixed(2)} kg</div></div>
    </div>
    ${pkgRows.length > 0 ? `<table>
      <thead><tr><th>Pack Size</th><th style="text-align:right">Units / Packs</th><th style="text-align:right">Total (kg)</th></tr></thead>
      <tbody>
      ${pkgRows.map(r => `<tr><td>${esc(r.packSize)}</td><td style="text-align:right">${num(r.packs)}</td><td style="text-align:right"><strong>${num(r.totalKg).toFixed(2)}</strong></td></tr>`).join('')}
      <tr class="tot"><td colspan="2"><strong>Total Packed</strong></td><td style="text-align:right"><strong>${totalPacked.toFixed(2)} kg</strong></td></tr>
      </tbody>
    </table>` : ''}

    <div style="margin-top:28px;border-top:1px solid #EEE;padding-top:10px;font-size:10px;color:#AAA;">
      365 Spicery | Batch Production Dossier | ${b.id} | Printed ${new Date().toLocaleString('en-IN')}
    </div>
  </div>`;
}

function _printBatchesList(batches) {
  if (!batches || !batches.length) {
    alert('No batches found to print.');
    return;
  }
  const pagesHtml = batches.map((b, idx) => _renderBatchDossierHtml(b, idx === batches.length - 1)).join('');
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) {
    alert('Please allow popups to use Print.');
    return;
  }
  win.document.write(`<!DOCTYPE html><html><head>
    <title>Batch Dossiers — 365 Spicery</title>
    <style>
      @page { size: A4 portrait; margin: 12mm; }
      *, *::before, *::after { box-sizing: border-box; }
      body { font-family:'Segoe UI',Arial,sans-serif; padding:18px 24px; color:#111; font-size:12px; line-height:1.45; background:#fff; }
      h1 { font-size:17px; font-weight:800; margin-bottom:2px; }
      .gen { color:#888; font-size:11px; margin-bottom:18px; }
      .sec { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; color:#999;
        margin:16px 0 6px; border-bottom:1px solid #EEE; padding-bottom:3px; }
      table { width:100%; border-collapse:collapse; margin-bottom:4px; font-size:11.5px; }
      th { background:#F5F5F5; padding:5px 8px; text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:.4px; }
      td { padding:6px 8px; border-bottom:1px solid #F0F0F0; }
      .kv { display:flex; flex-wrap:wrap; gap:6px 24px; margin-bottom:12px; }
      .kvp { min-width:150px; }
      .kl { font-size:9.5px; color:#999; text-transform:uppercase; margin-bottom:2px; }
      .kv-v { font-size:12.5px; font-weight:700; }
      .tot { background:#FFF8F8; font-weight:700; border-top:2px solid #E5E5E5; }
      .badge-g { color:#15803D; font-weight:700; } .badge-r { color:#DC2626; font-weight:700; }
      @media print {
        body { padding:0; }
        .dossier-page { page-break-after: always; }
        .dossier-page:last-child { page-break-after: avoid; }
      }
    </style>
  </head><body>
    ${pagesHtml}
    <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 800); };<\/script>
  </body></html>`);
  win.document.close();
}

window.printBatch = function(id) {
  const b = allBatches.find(x => x.id === id);
  if (!b) {
    alert('Batch not found.');
    return;
  }
  _printBatchesList([b]);
};

window.openPrintModal = function() {
  const modal = document.getElementById('print-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  _printTab = 'single';
  setPrintTab('single');

  const today = _todayStr();

  // Single batch info
  const targetBatch = allBatches.find(x => x.id === currentId) || allBatches[0];
  const lbl = document.getElementById('pm-single-batch-label');
  const meta = document.getElementById('pm-single-batch-meta');
  if (targetBatch) {
    if (lbl) lbl.textContent = `${targetBatch.batchCode || targetBatch.id} — ${targetBatch.productName || 'Unnamed'}`;
    if (meta) meta.textContent = `Date: ${fmt(targetBatch.date)} | QC: ${targetBatch.qcStatus || 'Pending'} | Incharge: ${targetBatch.incharge || '—'}`;
  } else {
    if (lbl) lbl.textContent = 'No batch available';
    if (meta) meta.textContent = 'Create a batch entry first';
  }

  // Pre-fill range inputs and set max to today
  const fromEl = document.getElementById('pm-from-date');
  const toEl   = document.getElementById('pm-to-date');
  if (fromEl) { fromEl.max = today; fromEl.value = today; }
  if (toEl)   { toEl.max   = today; toEl.value   = today; }

  // Pre-fill month / year
  const [todayY, todayM] = today.split('-');
  const mSel = document.getElementById('pm-month-sel');
  const ySel = document.getElementById('pm-year-sel');
  if (mSel) mSel.value = todayM;
  if (ySel) ySel.value = todayY;

  window.updateMonthPreview();
  _batchRangeInfo();
};

window.closePrintModal = function() {
  const modal = document.getElementById('print-modal');
  if (modal) modal.style.display = 'none';
};

window.setPrintTab = function(tab) {
  _printTab = tab;
  ['single','range','month'].forEach(t => {
    const btn   = document.getElementById(`pm-tab-${t}`);
    const panel = document.getElementById(`pm-panel-${t}`);
    const active = t === tab;
    if (btn) {
      btn.style.background = active ? '#1a1a2e' : '#fff';
      btn.style.color = active ? '#fff' : '#555';
      btn.style.borderColor = active ? '#1a1a2e' : '#e2e8f0';
    }
    if (panel) panel.style.display = active ? '' : 'none';
  });
};

function _batchRangeInfo() {
  const info = document.getElementById('pm-range-info');
  const from = document.getElementById('pm-from-date');
  const to   = document.getElementById('pm-to-date');
  if (!info || !from || !to) return;
  const today = _todayStr();
  if (from.value > today) from.value = today;
  if (to.value > today)   to.value   = today;

  if (from.value && to.value && from.value <= to.value) {
    const matched = allBatches.filter(b => b.date && b.date >= from.value && b.date <= to.value).length;
    info.style.display = '';
    info.style.color = '#374151';
    info.textContent = matched > 0
      ? `📄 ${matched} batch dossier${matched > 1 ? 's' : ''} found in this range — ${matched} page${matched > 1 ? 's' : ''} will be printed.`
      : '⚠️ No batches found in this date range.';
  } else if (from.value && to.value && from.value > to.value) {
    info.style.display = '';
    info.style.color = '#dc2626';
    info.textContent = '⚠️ "From" date must be before or equal "To" date.';
  } else {
    info.style.display = 'none';
  }
}

window.updateMonthPreview = function() {
  const mSel = document.getElementById('pm-month-sel');
  const ySel = document.getElementById('pm-year-sel');
  const info = document.getElementById('pm-month-info');
  if (!mSel || !ySel || !info) return;
  const mo = mSel.value; const y = ySel.value;
  const today = _todayStr();
  const [todayY, todayM] = today.split('-');
  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  if (y > todayY || (y === todayY && mo > todayM)) {
    info.style.background = '#fef2f2'; info.style.borderColor = '#fecaca'; info.style.color = '#dc2626';
    info.textContent = `⛔ ${monthNames[parseInt(mo)-1]} ${y} is a future month — printing not allowed.`;
    return;
  }

  const ymPrefix = `${y}-${mo}`;
  const matched = allBatches.filter(b => b.date && b.date.startsWith(ymPrefix) && b.date <= today).length;
  info.style.background = '#f0fdf4'; info.style.borderColor = '#a7f3d0'; info.style.color = '#374151';
  info.textContent = `📅 ${monthNames[parseInt(mo)-1]} ${y} — ${matched} batch dossier${matched !== 1 ? 's' : ''} found${(y === todayY && mo === todayM) ? ' (up to today)' : ''}.`;
};

window.executePrint = function() {
  const today = _todayStr();
  if (_printTab === 'single') {
    const targetBatch = allBatches.find(x => x.id === currentId) || allBatches[0];
    if (!targetBatch) {
      alert('No batch available to print.');
      return;
    }
    closePrintModal();
    _printBatchesList([targetBatch]);
    return;
  }

  if (_printTab === 'range') {
    const from = document.getElementById('pm-from-date');
    const to   = document.getElementById('pm-to-date');
    if (!from.value || !to.value) { alert('Please select both From and To dates.'); return; }
    if (from.value > today) { alert('From date cannot be a future date.'); return; }
    if (to.value > today)   { alert('To date cannot be a future date.'); return; }
    if (from.value > to.value) { alert('From date must be before or equal To date.'); return; }

    const matched = allBatches.filter(b => b.date && b.date >= from.value && b.date <= to.value)
      .sort((a,b) => (a.date||'').localeCompare(b.date||''));
    if (!matched.length) {
      alert('No batches found in the selected date range.');
      return;
    }
    if (matched.length > 50 && !confirm(`You are about to print ${matched.length} batch dossiers. Continue?`)) return;
    closePrintModal();
    _printBatchesList(matched);
    return;
  }

  if (_printTab === 'month') {
    const mo = document.getElementById('pm-month-sel').value.padStart(2,'0');
    const y  = document.getElementById('pm-year-sel').value;
    const [todayY, todayM] = today.split('-');
    if (y > todayY || (y === todayY && mo > todayM)) {
      alert('Future month — printing not allowed.');
      return;
    }
    const ymPrefix = `${y}-${mo}`;
    const matched = allBatches.filter(b => b.date && b.date.startsWith(ymPrefix) && b.date <= today)
      .sort((a,b) => (a.date||'').localeCompare(b.date||''));
    if (!matched.length) {
      alert('No batches found for this month.');
      return;
    }
    if (matched.length > 50 && !confirm(`You are about to print ${matched.length} batch dossiers. Continue?`)) return;
    closePrintModal();
    _printBatchesList(matched);
    return;
  }
};

function _initBatchPrintListeners() {
  const fromEl = document.getElementById('pm-from-date');
  const toEl   = document.getElementById('pm-to-date');
  if (fromEl) { fromEl.addEventListener('change', _batchRangeInfo); fromEl.addEventListener('input', _batchRangeInfo); }
  if (toEl)   { toEl.addEventListener('change', _batchRangeInfo);   toEl.addEventListener('input', _batchRangeInfo); }
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initBatchPrintListeners);
} else {
  _initBatchPrintListeners();
}

// ── START ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

