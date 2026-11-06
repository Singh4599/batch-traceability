// firebase-config.js — LV Spices Batch Traceability System
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-app.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, getDocs, onSnapshot, query, orderBy, limit } from "https://www.gstatic.com/firebasejs/10.14.0/firebase-firestore.js";

// Batch Traceability Firebase
export const batchConfig = {
  apiKey: "AIzaSyDWHInqsX09xBOaHAlDmAIT0GFvHFE6NV8",
  authDomain: "batch-f54b6.firebaseapp.com",
  projectId: "batch-f54b6",
  storageBucket: "batch-f54b6.firebasestorage.app",
  messagingSenderId: "1097267346523",
  appId: "1:1097267346523:web:71f12e8ecab975742f537e"
};

// Label Maker Firebase (for Dukan Bai sticker records)
export const labelConfig = {
  apiKey: "AIzaSyBUC4Ej-pNcQsMbWYavJu9tBH53_WWL-zA",
  authDomain: "lablerecords-3f897.firebaseapp.com",
  projectId: "lablerecords-3f897",
  storageBucket: "lablerecords-3f897.firebasestorage.app",
  messagingSenderId: "936028827480",
  appId: "1:936028827480:web:0e6aea6bccddafa75f7f2d"
};

export const BATCH_COLLECTION = "batch_traceability";
export const LABEL_COLLECTION = "labelRecords";

let batchDb = null;
let labelDb = null;

export function updateCloudBadge(connected) {
  const badge = document.getElementById('cloud-status-badge');
  const text  = document.getElementById('cloud-status-text');
  if (!badge) return;
  badge.className = 'cloud-dot ' + (connected ? 'online' : 'offline');
  if (text) text.textContent = connected ? 'Cloud Synced' : 'Local / Offline';
  // Also update header badge
  const hdr = document.getElementById('cloud-badge-header');
  if (hdr) hdr.style.display = connected ? '' : 'none';
}

export function initBatchDb() {
  if (batchDb) return batchDb;
  try {
    const app = getApps().find(a => a.name === 'batch') || initializeApp(batchConfig, 'batch');
    batchDb = getFirestore(app);
    updateCloudBadge(true);
    return batchDb;
  } catch (err) { updateCloudBadge(false); return null; }
}

export function initLabelDb() {
  if (labelDb) return labelDb;
  try {
    const app = getApps().find(a => a.name === 'label-sync-batch') || initializeApp(labelConfig, 'label-sync-batch');
    labelDb = getFirestore(app);
    return labelDb;
  } catch (err) {
    console.warn('[BatchFirebase] initLabelDb error:', err);
    return null;
  }
}

export function parseDateMs(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const s = String(val).trim();
  if (!s) return 0;
  if (/^\d{12,14}$/.test(s)) return Number(s);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.slice(0, 10) + 'T00:00:00');
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  if (/^\d{2}-\d{2}-\d{4}/.test(s)) {
    const [dd, mm, yyyy] = s.slice(0, 10).split('-');
    const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const parsed = Date.parse(s);
  return isNaN(parsed) ? 0 : parsed;
}

function removeUndefined(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(removeUndefined);
  const cleaned = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) {
      cleaned[k] = removeUndefined(v);
    }
  }
  return cleaned;
}

export async function saveBatch(id, data) {
  const db = initBatchDb();
  if (!db) {
    console.error('[BatchFirebase] saveBatch: DB not ready');
    return false;
  }
  try {
    const cleaned = removeUndefined({ ...data, updatedAt: Date.now() });
    await setDoc(doc(db, BATCH_COLLECTION, id), cleaned, { merge: true });
    updateCloudBadge(true);
    console.log('[BatchFirebase] Batch saved to cloud:', id);
    return true;
  } catch (err) {
    console.error('[BatchFirebase] saveBatch error:', err);
    updateCloudBadge(false);
    return false;
  }
}

export async function deleteBatchDoc(id) {
  const db = initBatchDb();
  if (!db) return false;
  try {
    await deleteDoc(doc(db, BATCH_COLLECTION, id));
    updateCloudBadge(true); return true;
  } catch { return false; }
}

export async function loadAllBatches() {
  const db = initBatchDb();
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, BATCH_COLLECTION));
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return docs.sort((a, b) => ((b.date || b.purchaseDate || '')).localeCompare((a.date || a.purchaseDate || '')));
  } catch { return []; }
}

export function subscribeToBatches(callback) {
  const db = initBatchDb();
  if (!db) { callback([]); return () => {}; }
  try {
    return onSnapshot(collection(db, BATCH_COLLECTION), snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => ((b.date || b.purchaseDate || '')).localeCompare((a.date || a.purchaseDate || '')));
      updateCloudBadge(true);
      callback(docs);
    }, err => {
      console.warn('[BatchFirebase] Batches snapshot error:', err);
      updateCloudBadge(false);
    });
  } catch (err) {
    console.warn('[BatchFirebase] subscribeToBatches error:', err);
    return () => {};
  }
}

// Cutoff: only sync label prints from just now (06 Nov 2026, 04:55 PM onwards — ignores morning test prints)
export const PRINTS_CUTOFF_MS = new Date('2026-11-06T16:55:00+05:30').getTime();

export function subscribeToLabelPrints(callback) {
  const lDb = initLabelDb();
  const bDb = initBatchDb();

  const labelMap = new Map();
  const batchMap = new Map();

  function notify() {
    const combined = new Map();
    // 1. Add any prints from batch DB
    batchMap.forEach((v, k) => combined.set(k, v));
    // 2. Add / overwrite with prints from lablerecords DB (primary)
    labelMap.forEach((v, k) => combined.set(k, v));

    const records = Array.from(combined.values());
    records.sort((a, b) => (b._recTime || 0) - (a._recTime || 0));
    callback(records);
  }

  function processDoc(docSnap, targetMap) {
    const data = docSnap.data();
    // Reject front labels — only back labels represent packaged finished goods
    const isFront = (data.labelSide === "front") || (data.packSize === "FRONT");
    if (isFront) return;

    // Check cutoff (today onwards: 06 Nov 2026)
    let recTime = Number(data.timestamp) || 0;
    if (!recTime && data.date) {
      recTime = parseDateMs(data.date);
    }
    if (recTime && recTime < PRINTS_CUTOFF_MS) {
      return;
    }

    const docId = docSnap.id || String(data._docId || data.timestamp || Math.random());
    targetMap.set(docId, { id: docId, ...data, _recTime: recTime });
  }

  const unsubs = [];

  // Primary: listen to lablerecords-3f897
  if (lDb) {
    try {
      const u1 = onSnapshot(collection(lDb, LABEL_COLLECTION), snap => {
        labelMap.clear();
        snap.forEach(d => processDoc(d, labelMap));
        console.log(`[BatchFirebase] Received ${labelMap.size} valid prints from lablerecords-3f897`);
        notify();
      }, err => {
        console.warn('[BatchFirebase] lablerecords-3f897 listener error:', err);
      });
      unsubs.push(u1);
    } catch (e) { console.warn('Label primary listener setup error:', e); }
  }

  // Dual/Fallback: listen to batch-f54b6 labelRecords
  if (bDb) {
    try {
      const u2 = onSnapshot(collection(bDb, LABEL_COLLECTION), snap => {
        batchMap.clear();
        snap.forEach(d => processDoc(d, batchMap));
        notify();
      }, err => {
        console.warn('[BatchFirebase] batch-f54b6 labelRecords listener error:', err);
      });
      unsubs.push(u2);
    } catch (e) { console.warn('Label secondary listener setup error:', e); }
  }

  return () => {
    unsubs.forEach(u => { try { u(); } catch {} });
  };
}

try { initBatchDb(); initLabelDb(); } catch (e) {}
