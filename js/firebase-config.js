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
  badge.className = connected ? 'cloud-badge connected' : 'cloud-badge offline';
  if (text) text.textContent = connected ? 'Cloud Synced' : 'Local / Offline';
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

export async function saveBatch(id, data) {
  const db = initBatchDb();
  if (!db) return false;
  try {
    await setDoc(doc(db, BATCH_COLLECTION, id), { ...data, updatedAt: Date.now() }, { merge: true });
    updateCloudBadge(true); return true;
  } catch (err) { updateCloudBadge(false); return false; }
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
    const q = query(collection(db, BATCH_COLLECTION), orderBy("purchaseDate", "desc"), limit(500));
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch { return []; }
}

export function subscribeToLabelPrints(callback) {
  const db = initLabelDb();
  if (!db) { callback([]); return () => {}; }
  try {
    const q = collection(db, LABEL_COLLECTION);
    return onSnapshot(q, snap => {
      const records = [];
      snap.forEach(docSnap => {
        const data = docSnap.data();
        // STRICT FILTER: Match Dukan Bai sticker records (dukan-stock software logic)
        const isDukan = (data.stickerType === "dukan") || (data.stickerLabel === "Dukan Bai");
        const isNotFront = data.labelSide !== "front" && data.packSize !== "FRONT";
        if (isDukan && isNotFront) {
          records.push({ id: docSnap.id, ...data });
        }
      });
      callback(records);
    }, () => callback([]));
  } catch { callback([]); return () => {}; }
}

try { initBatchDb(); initLabelDb(); } catch (e) {}
