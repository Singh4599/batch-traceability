// ocr.js — Gemini Vision AI OCR for Batch Traceability Invoice Scanning
// Reuses same rotating 5-key system as raw-material-register with multi-item extraction

export const _B64_KEYS = [
  "QUl6YVN5Q0NzNjVZSW1lVW8yN1hwNk5pZ3NFVHZzVFZ4c0trOTRR",
  "QVEuQWI4Uk42STFNS0RtXzl2c1Fkb2tZUEdHWUJPS1pvNDB3Mm9zbi1vR3h3RXpwX0hBYUE=",
  "QVEuQWI4Uk42SWlSRFAtbWpXd1BaTnFvZGpkMWctUnNyYTNJLVdNSUJLcWROWFlZNTI1enc=",
  "QVEuQWI4Uk42S1pmRmkxWXgtNE94Y0JpZTFkaGF1WjdWT251eW5nZ2tTY2FTVEcweS1FTkE=",
  "QVEuQWI4Uk42SlJtbWtJLWk2eE4takJiQ1dRV1Qwa1BoLVNHekltUjRGcmdMQ0UwdnFKT2c="
];

function decodeKey(b64) {
  try { return atob(b64); } catch { return ''; }
}

let _keyIdx = 0;
export function getKey() { return decodeKey(_B64_KEYS[_keyIdx % _B64_KEYS.length]); }
export function rotateKey() {
  _keyIdx = (_keyIdx + 1) % _B64_KEYS.length;
  console.log(`[Batch OCR] Rotated to Key #${(_keyIdx % _B64_KEYS.length) + 1}`);
  return getKey();
}

// ── Image resize & PDF helper ────────────────────────────────────────────────
export function resizeImage(file, maxDim = 1600) {
  return new Promise((resolve) => {
    const isPdf = file.type === 'application/pdf' || (file.name && file.name.toLowerCase().endsWith('.pdf'));
    const reader = new FileReader();

    if (isPdf) {
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        const fallbackB64 = String(dataUrl).split(',')[1] || '';
        const pdfThumb = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80' viewBox='0 0 24 24' fill='%23D60018'><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><text x='6' y='16' fill='white' font-size='5.5' font-family='sans-serif' font-weight='bold'>PDF</text></svg>";
        resolve({ b64: fallbackB64, mime: 'application/pdf', thumb: pdfThumb });
      };
      reader.onerror = () => resolve({ b64: '', mime: 'application/pdf', thumb: '' });
      reader.readAsDataURL(file);
      return;
    }

    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const fallbackB64 = String(dataUrl).split(',')[1] || '';
      const fallbackMime = file.type || 'image/jpeg';

      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.getContext('2d').drawImage(img, 0, 0, w, h);
        const out = c.toDataURL('image/jpeg', 0.88);

        // Thumbnail
        const tc = document.createElement('canvas');
        tc.width = 80; tc.height = Math.max(40, Math.round(h * 80 / (w || 1)));
        tc.getContext('2d').drawImage(img, 0, 0, tc.width, tc.height);
        resolve({ b64: out.split(',')[1], mime: 'image/jpeg', thumb: tc.toDataURL('image/jpeg', 0.7) });
      };
      img.onerror = () => resolve({ b64: fallbackB64, mime: fallbackMime, thumb: dataUrl });
      img.src = dataUrl;
    };
    reader.onerror = () => resolve({ b64: '', mime: 'image/jpeg', thumb: '' });
    reader.readAsDataURL(file);
  });
}

// ── Main OCR scan function ───────────────────────────────────────────────────
export async function scanPurchaseInvoice(file, onProgress = () => {}) {
  onProgress(15, 'Preparing document...');
  const { b64, mime, thumb } = await resizeImage(file);

  if (!b64) {
    onProgress(100, 'Unable to read file.');
    return { ok: false, data: null, items: [], thumb: '' };
  }

  onProgress(40, 'Analyzing invoice with Gemini Vision AI...');

  const prompt = `You are an expert OCR and Commodities Logistics Assistant specialized in Indian spice industry supplier invoices, APMC mandi receipts, cold storage bills, and delivery challans.
Extract purchase details and ALL commodity line items from this invoice image.
CRITICAL: An invoice may list multiple spice items or lots. You must extract every row/item into the "items" array!

RETURN ONLY A VALID JSON OBJECT WITH THIS EXACT STRUCTURE:
{
  "purchase_date": "YYYY-MM-DD",
  "supplier_name": "Full supplier, cold storage or mandi merchant name",
  "invoice_no": "Bill No or Tax Invoice No or Challan No",
  "items": [
    {
      "raw_material_name": "Standardized spice commodity name (e.g. 'Chilli Flakes', 'Red Chilli Powder', 'Turmeric Powder', 'Kashmiri Chilli', 'Coriander Seeds', 'Cumin Seeds')",
      "supplier_batch_no": "Printed lot number, receipt number or batch number (or null if absent)",
      "quantity_kg": 50,
      "rate_per_kg": 120.0,
      "total_value": 6000.0
    }
  ],
  "raw_material_name": "First item standardized name",
  "supplier_batch_no": "First item supplier batch number",
  "quantity_kg": 50
}

RULES:
1. purchase_date default: today in YYYY-MM-DD if missing.
2. Standardize raw_material_name (e.g. remove '-50' or 'RAW MATERIAL' brand tags).
3. Ensure quantity_kg, rate_per_kg, and total_value are numbers, not strings.
4. Return ONLY valid JSON, no markdown fences or conversational text.`;

  const maxAttempts = _B64_KEYS.length * 2;
  let attempts = 0;

  while (attempts < maxAttempts) {
    const key = getKey();
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
    const payload = {
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: b64 } }] }],
      generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
    };

    try {
      onProgress(65, `AI extraction in progress (Key #${(_keyIdx % _B64_KEYS.length) + 1})...`);
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.status === 429 || res.status === 403 || res.status === 400 || res.status === 503) {
        console.warn(`[Batch OCR] Status ${res.status} on key ${_keyIdx}. Rotating...`);
        rotateKey();
        attempts++;
        await new Promise(r => setTimeout(r, 400));
        continue;
      }

      if (!res.ok) {
        rotateKey();
        attempts++;
        continue;
      }

      const json = await res.json();
      let rawText = '';
      if (json.candidates?.[0]?.content?.parts) {
        for (const p of json.candidates[0].content.parts) {
          if (p.text && !p.thought) { rawText = p.text; break; }
        }
        if (!rawText && json.candidates[0].content.parts[0]?.text) {
          rawText = json.candidates[0].content.parts[0].text;
        }
      }

      if (!rawText) rawText = '{}';

      let parsed = {};
      try {
        parsed = JSON.parse(rawText);
      } catch {
        const clean = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        try {
          parsed = JSON.parse(clean);
        } catch {
          const m = clean.match(/\{[\s\S]*\}/);
          if (m) parsed = JSON.parse(m[0]);
        }
      }

      rotateKey(); // spread load gently
      onProgress(100, 'Invoice extraction complete!');

      // Standardize items array
      let rawItems = [];
      if (Array.isArray(parsed.items) && parsed.items.length > 0) {
        rawItems = parsed.items;
      } else if (parsed.raw_material_name) {
        rawItems = [{
          raw_material_name: parsed.raw_material_name,
          supplier_batch_no: parsed.supplier_batch_no || '',
          quantity_kg: Number(parsed.quantity_kg) || 0,
          rate_per_kg: Number(parsed.rate_per_kg) || 0,
          total_value: Number(parsed.total_value) || 0
        }];
      }

      const standardizedItems = rawItems.map((it, idx) => ({
        id: idx + 1,
        raw_material_name: it.raw_material_name || `Spice Item #${idx + 1}`,
        supplier_batch_no: it.supplier_batch_no || '',
        quantity_kg: Number(it.quantity_kg) || 0,
        rate_per_kg: Number(it.rate_per_kg) || 0,
        total_value: Number(it.total_value) || (Number(it.quantity_kg) * Number(it.rate_per_kg)) || 0
      }));

      // Top level fallbacks
      if (standardizedItems.length > 0) {
        if (!parsed.raw_material_name) parsed.raw_material_name = standardizedItems[0].raw_material_name;
        if (!parsed.quantity_kg) parsed.quantity_kg = standardizedItems[0].quantity_kg;
        if (!parsed.supplier_batch_no) parsed.supplier_batch_no = standardizedItems[0].supplier_batch_no;
      }

      return {
        ok: true,
        data: parsed,
        items: standardizedItems,
        thumb
      };
    } catch (err) {
      console.warn('[Batch OCR] Extraction error:', err);
      rotateKey();
      attempts++;
      if (attempts >= maxAttempts) break;
      await new Promise(r => setTimeout(r, 500));
    }
  }

  onProgress(100, 'AI unavailable, please fill manually.');
  return { ok: false, data: null, items: [], thumb };
}
