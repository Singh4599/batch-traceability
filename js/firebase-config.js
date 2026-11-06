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
  } catch { return null; }
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

// Cutoff: only sync label prints from today (06 Nov 2026) onwards
const PRINTS_CUTOFF_MS = new Date('2026-11-06T00:00:00').getTime();

export function subscribeToLabelPrints(callback) {
  const db = initLabelDb();
  if (!db) { callback([]); return () => {}; }
  try {
    const q = collection(db, LABEL_COLLECTION);
    return onSnapshot(q, snap => {
      const records = [];
      snap.forEach(docSnap => {
        const data = docSnap.data();
        // FILTER 1: Match Dukan Bai + 365 Spicery (db) sticker records
        const isValidSticker = (data.stickerType === "dukan") || (data.stickerLabel === "Dukan Bai")
          || (data.stickerType === "db") || (data.stickerLabel === "365 Spicery");
        const isNotFront = data.labelSide !== "front" && data.packSize !== "FRONT";

        // FILTER 2: Only prints from today (06 Nov 2026) onwards
        let recTime = Number(data.timestamp) || 0;
        if (!recTime && data.date && data.date.includes('-')) {
          const parts = data.date.split('-');
          if (parts.length === 3) {
            recTime = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`).getTime();
          }
        }
        const isFromTodayOnwards = recTime >= PRINTS_CUTOFF_MS;

        if (isValidSticker && isNotFront && isFromTodayOnwards) {
          records.push({ id: docSnap.id, ...data, _recTime: recTime });
        }
      });
      callback(records);
    }, () => callback([]));
  } catch { callback([]); return () => {}; }
}

try { initBatchDb(); initLabelDb(); } catch (e) {}
