import { useState, useRef } from "react";

const GST_RATES = [0, 5, 12, 18, 28];

const defaultItem = () => ({
  id: Date.now() + Math.random(),
  description: "",
  hsn: "",
  qty: 1,
  unit: "Nos",
  rate: 0,
  gst: 18,
});

const UNITS = ["Nos", "Kg", "Ltr", "Mtr", "Box", "Set", "Hr", "Day"];

function formatINR(n) {
  return Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numberToWords(num) {
  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const inWords = (n) => {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? " " + a[n % 10] : "");
    if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + inWords(n % 100) : "");
    if (n < 100000) return inWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + inWords(n % 1000) : "");
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + " Lakh" + (n % 100000 ? " " + inWords(n % 100000) : "");
    return inWords(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 ? " " + inWords(n % 10000000) : "");
  };
  const rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  let result = inWords(rupees) + " Rupees";
  if (paise > 0) result += " and " + inWords(paise) + " Paise";
  return result + " Only";
}

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
  "Delhi", "Jammu & Kashmir", "Ladakh", "Puducherry"
];

export default function GSTInvoiceGenerator() {
  const [seller, setSeller] = useState({
    name: "", address: "", city: "Chennai", state: "Tamil Nadu",
    gstin: "", pan: "", phone: "", email: "", bank: "", ifsc: "", acc: ""
  });
  const [buyer, setBuyer] = useState({
    name: "", address: "", city: "", state: "Tamil Nadu", gstin: "", phone: ""
  });
  const [invoice, setInvoice] = useState({
    number: "INV-001", date: new Date().toISOString().split("T")[0],
    due: "", po: "", notes: "Thank you for your business!"
  });
  const [items, setItems] = useState([defaultItem()]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [activeTab, setActiveTab] = useState("form"); // form | preview
  const [toast, setToast] = useState("");

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // Calculations
  const calcItem = (item) => {
    const taxable = item.qty * item.rate;
    const gstAmt = (taxable * item.gst) / 100;
    return { taxable, gstAmt, total: taxable + gstAmt };
  };

  const sameState = seller.state === buyer.state;
  const totals = items.reduce(
    (acc, item) => {
      const c = calcItem(item);
      acc.taxable += c.taxable;
      acc.gst += c.gstAmt;
      acc.total += c.total;
      return acc;
    },
    { taxable: 0, gst: 0, total: 0 }
  );

  const updateItem = (id, field, val) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: val } : i)));
  const addItem = () => setItems((prev) => [...prev, defaultItem()]);
  const removeItem = (id) => setItems((prev) => prev.filter((i) => i.id !== id));

  // AI: Generate line items from prompt
  const generateItems = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-opus-4-6",
          max_tokens: 1024,
          messages: [
            {
              role: "user",
              content: `Generate GST invoice line items for: ${aiPrompt}
              
Return ONLY a JSON array, no markdown, no explanation, no backticks.
Each item must have: {"description": string, "hsn": string, "qty": number, "unit": string, "rate": number, "gst": number}
HSN codes should be realistic Indian HSN codes.
GST rates must be one of: 0, 5, 12, 18, 28
Units must be one of: Nos, Kg, Ltr, Mtr, Box, Set, Hr, Day
Example output:
[{"description":"Website Design","hsn":"998314","qty":1,"unit":"Nos","rate":15000,"gst":18}]`
            }
          ]
        })
      });

      const data = await res.json();
      console.log("Full API response:", JSON.stringify(data));

      if (data.error) {
        showToast("❌ " + data.error.message);
        setAiLoading(false);
        return;
      }

      const text = data.content?.[0]?.text || "[]";
      console.log("Text received:", text);
      
      const cleaned = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      
      if (!Array.isArray(parsed) || parsed.length === 0) {
        showToast("❌ No items generated. Try again.");
        setAiLoading(false);
        return;
      }

      setItems(parsed.map(i => ({ 
        ...defaultItem(), 
        ...i, 
        id: Date.now() + Math.random() 
      })));
      setAiPrompt("");
      showToast("✅ AI generated " + parsed.length + " items!");

    } catch (e) {
      console.error("Error:", e);
      showToast("❌ Error: " + e.message);
    }
    setAiLoading(false);
  };

  const printInvoice = () => {
    setActiveTab("preview");
    setTimeout(() => window.print(), 400);
  };

  const tabs = [
    { id: "form", label: "📝 Edit Invoice" },
    { id: "preview", label: "👁 Preview" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#0f0e17", fontFamily: "'DM Sans', sans-serif", color: "#fffffe" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=Playfair+Display:wght@700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: #1a1a2e; } ::-webkit-scrollbar-thumb { background: #ff8906; border-radius: 3px; }
        input, select, textarea { background: #1a1a2e; border: 1px solid #2d2d44; color: #fffffe; padding: 8px 12px; border-radius: 8px; width: 100%; font-family: inherit; font-size: 13px; outline: none; transition: border 0.2s; }
        input:focus, select:focus, textarea:focus { border-color: #ff8906; }
        input::placeholder, textarea::placeholder { color: #555570; }
        select option { background: #1a1a2e; }
        label { font-size: 11px; color: #a8a8c0; font-weight: 500; letter-spacing: 0.5px; text-transform: uppercase; display: block; margin-bottom: 4px; }
        .btn { padding: 10px 20px; border-radius: 8px; border: none; cursor: pointer; font-family: inherit; font-weight: 600; font-size: 13px; transition: all 0.2s; }
        .btn-primary { background: #ff8906; color: #0f0e17; }
        .btn-primary:hover { background: #ffb347; transform: translateY(-1px); }
        .btn-ghost { background: transparent; color: #a8a8c0; border: 1px solid #2d2d44; }
        .btn-ghost:hover { border-color: #ff8906; color: #ff8906; }
        .btn-danger { background: transparent; color: #e53e3e; border: 1px solid #e53e3e; padding: 4px 10px; font-size: 12px; border-radius: 6px; }
        .btn-danger:hover { background: #e53e3e; color: white; }
        .card { background: #1a1a2e; border: 1px solid #2d2d44; border-radius: 12px; padding: 20px; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
        .section-title { font-family: 'Playfair Display', serif; font-size: 16px; color: #ff8906; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
        .tag { background: #ff890620; color: #ff8906; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
        @media (max-width: 768px) { .grid2, .grid3 { grid-template-columns: 1fr; } }
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .print-area { background: white; color: black; padding: 0; }
        }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, background: "#ff8906", color: "#0f0e17", padding: "12px 20px", borderRadius: 10, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 20px #ff890660" }}>
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="no-print" style={{ background: "#0f0e17", borderBottom: "1px solid #2d2d44", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: "#ff8906", fontWeight: 700 }}>GST Invoice Pro</div>
          <div style={{ fontSize: 11, color: "#555570", marginTop: 2 }}>AI-Powered • GST Compliant • Made for India</div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {tabs.map(t => (
            <button key={t.id} className="btn" onClick={() => setActiveTab(t.id)}
              style={{ background: activeTab === t.id ? "#ff8906" : "transparent", color: activeTab === t.id ? "#0f0e17" : "#a8a8c0", border: "1px solid " + (activeTab === t.id ? "#ff8906" : "#2d2d44") }}>
              {t.label}
            </button>
          ))}
          <button className="btn btn-primary" onClick={printInvoice}>🖨 Print / PDF</button>
        </div>
      </div>

      {/* FORM TAB */}
      {activeTab === "form" && (
        <div className="no-print" style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* AI Generator */}
          <div className="card" style={{ borderColor: "#ff890640", background: "linear-gradient(135deg, #1a1a2e, #ff890608)" }}>
            <div className="section-title">✨ AI Line Item Generator <span className="tag">Claude AI</span></div>
            <p style={{ fontSize: 13, color: "#a8a8c0", marginBottom: 12 }}>Describe your work/product and AI will auto-fill the invoice items.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                placeholder='e.g. "Website design for 5 pages, logo design, 3 months hosting"'
                onKeyDown={e => e.key === "Enter" && generateItems()}
              />
              <button className="btn btn-primary" onClick={generateItems} disabled={aiLoading} style={{ whiteSpace: "nowrap", minWidth: 130 }}>
                {aiLoading ? "⏳ Generating..." : "⚡ Generate"}
              </button>
            </div>
          </div>

          {/* Invoice Details */}
          <div className="card">
            <div className="section-title">🧾 Invoice Details</div>
            <div className="grid3">
              <div><label>Invoice Number</label><input value={invoice.number} onChange={e => setInvoice({ ...invoice, number: e.target.value })} /></div>
              <div><label>Invoice Date</label><input type="date" value={invoice.date} onChange={e => setInvoice({ ...invoice, date: e.target.value })} /></div>
              <div><label>Due Date</label><input type="date" value={invoice.due} onChange={e => setInvoice({ ...invoice, due: e.target.value })} /></div>
            </div>
          </div>

          {/* Seller */}
          <div className="card">
            <div className="section-title">🏢 Your Business (Seller)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="grid2">
                <div><label>Business Name *</label><input value={seller.name} onChange={e => setSeller({ ...seller, name: e.target.value })} placeholder="Your Company Pvt Ltd" /></div>
                <div><label>GSTIN *</label><input value={seller.gstin} onChange={e => setSeller({ ...seller, gstin: e.target.value.toUpperCase() })} placeholder="33XXXXX1234X1Z5" maxLength={15} /></div>
              </div>
              <div><label>Address</label><input value={seller.address} onChange={e => setSeller({ ...seller, address: e.target.value })} placeholder="Street, Area" /></div>
              <div className="grid3">
                <div><label>City</label><input value={seller.city} onChange={e => setSeller({ ...seller, city: e.target.value })} /></div>
                <div><label>State</label>
                  <select value={seller.state} onChange={e => setSeller({ ...seller, state: e.target.value })}>
                    {INDIAN_STATES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div><label>PAN</label><input value={seller.pan} onChange={e => setSeller({ ...seller, pan: e.target.value.toUpperCase() })} placeholder="XXXXX1234X" maxLength={10} /></div>
              </div>
              <div className="grid3">
                <div><label>Phone</label><input value={seller.phone} onChange={e => setSeller({ ...seller, phone: e.target.value })} placeholder="+91 98765 43210" /></div>
                <div><label>Email</label><input value={seller.email} onChange={e => setSeller({ ...seller, email: e.target.value })} placeholder="you@company.com" /></div>
                <div><label>Bank Name</label><input value={seller.bank} onChange={e => setSeller({ ...seller, bank: e.target.value })} placeholder="HDFC Bank" /></div>
              </div>
              <div className="grid2">
                <div><label>Account Number</label><input value={seller.acc} onChange={e => setSeller({ ...seller, acc: e.target.value })} placeholder="1234567890" /></div>
                <div><label>IFSC Code</label><input value={seller.ifsc} onChange={e => setSeller({ ...seller, ifsc: e.target.value.toUpperCase() })} placeholder="HDFC0001234" /></div>
              </div>
            </div>
          </div>

          {/* Buyer */}
          <div className="card">
            <div className="section-title">👤 Bill To (Buyer)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="grid2">
                <div><label>Customer Name *</label><input value={buyer.name} onChange={e => setBuyer({ ...buyer, name: e.target.value })} placeholder="Customer Name / Company" /></div>
                <div><label>GSTIN (if registered)</label><input value={buyer.gstin} onChange={e => setBuyer({ ...buyer, gstin: e.target.value.toUpperCase() })} placeholder="Leave blank for B2C" maxLength={15} /></div>
              </div>
              <div><label>Address</label><input value={buyer.address} onChange={e => setBuyer({ ...buyer, address: e.target.value })} placeholder="Customer address" /></div>
              <div className="grid3">
                <div><label>City</label><input value={buyer.city} onChange={e => setBuyer({ ...buyer, city: e.target.value })} /></div>
                <div><label>State</label>
                  <select value={buyer.state} onChange={e => setBuyer({ ...buyer, state: e.target.value })}>
                    {INDIAN_STATES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div><label>Phone</label><input value={buyer.phone} onChange={e => setBuyer({ ...buyer, phone: e.target.value })} /></div>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="card">
            <div className="section-title">📦 Line Items</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #2d2d44" }}>
                    {["Description", "HSN", "Qty", "Unit", "Rate (₹)", "GST %", "Amount", ""].map(h => (
                      <th key={h} style={{ padding: "8px 6px", color: "#a8a8c0", fontWeight: 500, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const c = calcItem(item);
                    return (
                      <tr key={item.id} style={{ borderBottom: "1px solid #2d2d2280" }}>
                        <td style={{ padding: "6px" }}><input value={item.description} onChange={e => updateItem(item.id, "description", e.target.value)} placeholder="Item description" style={{ minWidth: 160 }} /></td>
                        <td style={{ padding: "6px" }}><input value={item.hsn} onChange={e => updateItem(item.id, "hsn", e.target.value)} placeholder="HSN" style={{ width: 80 }} /></td>
                        <td style={{ padding: "6px" }}><input type="number" value={item.qty} onChange={e => updateItem(item.id, "qty", parseFloat(e.target.value) || 0)} style={{ width: 65 }} /></td>
                        <td style={{ padding: "6px" }}>
                          <select value={item.unit} onChange={e => updateItem(item.id, "unit", e.target.value)} style={{ width: 70 }}>
                            {UNITS.map(u => <option key={u}>{u}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: "6px" }}><input type="number" value={item.rate} onChange={e => updateItem(item.id, "rate", parseFloat(e.target.value) || 0)} style={{ width: 90 }} /></td>
                        <td style={{ padding: "6px" }}>
                          <select value={item.gst} onChange={e => updateItem(item.id, "gst", parseInt(e.target.value))} style={{ width: 70 }}>
                            {GST_RATES.map(r => <option key={r} value={r}>{r}%</option>)}
                          </select>
                        </td>
                        <td style={{ padding: "6px", color: "#ff8906", fontWeight: 600, whiteSpace: "nowrap" }}>₹{formatINR(c.total)}</td>
                        <td style={{ padding: "6px" }}><button className="btn btn-danger" onClick={() => removeItem(item.id)}>✕</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button className="btn btn-ghost" onClick={addItem} style={{ marginTop: 12 }}>+ Add Item</button>
          </div>

          {/* Notes */}
          <div className="card">
            <div className="section-title">📝 Notes</div>
            <textarea value={invoice.notes} onChange={e => setInvoice({ ...invoice, notes: e.target.value })} rows={3} placeholder="Payment terms, thank you note..." />
          </div>

          <button className="btn btn-primary" onClick={() => setActiveTab("preview")} style={{ padding: "14px", fontSize: 15 }}>
            👁 Preview Invoice →
          </button>
        </div>
      )}

      {/* PREVIEW TAB */}
      {activeTab === "preview" && (
        <div style={{ maxWidth: 860, margin: "0 auto", padding: "24px 16px" }}>
          <div className="no-print" style={{ marginBottom: 16, display: "flex", gap: 10 }}>
            <button className="btn btn-ghost" onClick={() => setActiveTab("form")}>← Back to Edit</button>
            <button className="btn btn-primary" onClick={printInvoice}>🖨 Print / Save as PDF</button>
          </div>

          {/* Invoice Print Area */}
          <div className="print-area" style={{ background: "white", color: "#1a1a2e", borderRadius: 12, padding: "40px", boxShadow: "0 20px 60px #00000060" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "3px solid #ff8906", paddingBottom: 20, marginBottom: 24 }}>
              <div>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, color: "#0f0e17" }}>{seller.name || "Your Business Name"}</div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>{seller.address}{seller.address && ","} {seller.city}, {seller.state}</div>
                {seller.gstin && <div style={{ fontSize: 12, color: "#555" }}>GSTIN: <b>{seller.gstin}</b></div>}
                {seller.pan && <div style={{ fontSize: 12, color: "#555" }}>PAN: {seller.pan}</div>}
                {seller.phone && <div style={{ fontSize: 12, color: "#555" }}>📞 {seller.phone} {seller.email && `| ✉ ${seller.email}`}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ background: "#ff8906", color: "white", padding: "6px 16px", borderRadius: 6, fontWeight: 700, fontSize: 18, letterSpacing: 1 }}>TAX INVOICE</div>
                <div style={{ marginTop: 10, fontSize: 13 }}><b>Invoice #:</b> {invoice.number}</div>
                <div style={{ fontSize: 13 }}><b>Date:</b> {new Date(invoice.date).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</div>
                {invoice.due && <div style={{ fontSize: 13 }}><b>Due:</b> {new Date(invoice.due).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</div>}
              </div>
            </div>

            {/* Bill To */}
            <div style={{ background: "#f8f9fa", borderRadius: 8, padding: "16px", marginBottom: 24, borderLeft: "4px solid #ff8906" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#ff8906", letterSpacing: 1, marginBottom: 6 }}>BILL TO</div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{buyer.name || "Customer Name"}</div>
              <div style={{ fontSize: 13, color: "#555" }}>{buyer.address}{buyer.address && ","} {buyer.city}{buyer.city && ","} {buyer.state}</div>
              {buyer.gstin && <div style={{ fontSize: 13 }}>GSTIN: <b>{buyer.gstin}</b></div>}
              {buyer.phone && <div style={{ fontSize: 13 }}>📞 {buyer.phone}</div>}
            </div>

            {/* Items Table */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 24 }}>
              <thead>
                <tr style={{ background: "#0f0e17", color: "white" }}>
                  <th style={{ padding: "10px 8px", textAlign: "left", borderRadius: "6px 0 0 6px" }}>#</th>
                  <th style={{ padding: "10px 8px", textAlign: "left" }}>Description</th>
                  <th style={{ padding: "10px 8px", textAlign: "center" }}>HSN</th>
                  <th style={{ padding: "10px 8px", textAlign: "center" }}>Qty</th>
                  <th style={{ padding: "10px 8px", textAlign: "center" }}>Unit</th>
                  <th style={{ padding: "10px 8px", textAlign: "right" }}>Rate</th>
                  <th style={{ padding: "10px 8px", textAlign: "right" }}>Taxable</th>
                  <th style={{ padding: "10px 8px", textAlign: "center" }}>GST%</th>
                  <th style={{ padding: "10px 8px", textAlign: "right", borderRadius: "0 6px 6px 0" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const c = calcItem(item);
                  return (
                    <tr key={item.id} style={{ borderBottom: "1px solid #eee", background: idx % 2 === 0 ? "white" : "#fafafa" }}>
                      <td style={{ padding: "9px 8px", color: "#888" }}>{idx + 1}</td>
                      <td style={{ padding: "9px 8px", fontWeight: 500 }}>{item.description || "—"}</td>
                      <td style={{ padding: "9px 8px", textAlign: "center", color: "#888" }}>{item.hsn}</td>
                      <td style={{ padding: "9px 8px", textAlign: "center" }}>{item.qty}</td>
                      <td style={{ padding: "9px 8px", textAlign: "center", color: "#888" }}>{item.unit}</td>
                      <td style={{ padding: "9px 8px", textAlign: "right" }}>₹{formatINR(item.rate)}</td>
                      <td style={{ padding: "9px 8px", textAlign: "right" }}>₹{formatINR(c.taxable)}</td>
                      <td style={{ padding: "9px 8px", textAlign: "center" }}>{item.gst}%</td>
                      <td style={{ padding: "9px 8px", textAlign: "right", fontWeight: 600 }}>₹{formatINR(c.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Totals */}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 24 }}>
              <div style={{ width: 300 }}>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderBottom: "1px solid #eee" }}>
                  <span>Taxable Amount</span><span>₹{formatINR(totals.taxable)}</span>
                </div>
                {sameState ? (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderBottom: "1px solid #eee" }}>
                      <span>CGST</span><span>₹{formatINR(totals.gst / 2)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderBottom: "1px solid #eee" }}>
                      <span>SGST</span><span>₹{formatINR(totals.gst / 2)}</span>
                    </div>
                  </>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderBottom: "1px solid #eee" }}>
                    <span>IGST</span><span>₹{formatINR(totals.gst)}</span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: "#ff8906", color: "white", borderRadius: 8, marginTop: 8, fontWeight: 700, fontSize: 16 }}>
                  <span>TOTAL</span><span>₹{formatINR(totals.total)}</span>
                </div>
              </div>
            </div>

            {/* Amount in words */}
            <div style={{ background: "#fff8f0", border: "1px solid #ff890640", borderRadius: 8, padding: "10px 14px", fontSize: 12, marginBottom: 20 }}>
              <b>Amount in Words:</b> {numberToWords(Math.round(totals.total))}
            </div>

            {/* Bank & Notes */}
            <div style={{ display: "flex", gap: 20, marginBottom: 24 }}>
              {(seller.bank || seller.acc) && (
                <div style={{ flex: 1, background: "#f8f9fa", borderRadius: 8, padding: "14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#ff8906", letterSpacing: 1, marginBottom: 8 }}>BANK DETAILS</div>
                  {seller.bank && <div style={{ fontSize: 13 }}><b>Bank:</b> {seller.bank}</div>}
                  {seller.acc && <div style={{ fontSize: 13 }}><b>A/C:</b> {seller.acc}</div>}
                  {seller.ifsc && <div style={{ fontSize: 13 }}><b>IFSC:</b> {seller.ifsc}</div>}
                </div>
              )}
              {invoice.notes && (
                <div style={{ flex: 1, background: "#f8f9fa", borderRadius: 8, padding: "14px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#ff8906", letterSpacing: 1, marginBottom: 8 }}>NOTES</div>
                  <div style={{ fontSize: 13, color: "#555" }}>{invoice.notes}</div>
                </div>
              )}
            </div>

            {/* Signature */}
            <div style={{ display: "flex", justifyContent: "flex-end", borderTop: "1px solid #eee", paddingTop: 20 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ height: 50, borderBottom: "1px solid #aaa", width: 180, marginBottom: 6 }}></div>
                <div style={{ fontSize: 12, color: "#555" }}>Authorized Signature</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{seller.name}</div>
              </div>
            </div>

            <div style={{ textAlign: "center", marginTop: 24, fontSize: 11, color: "#aaa" }}>
              This is a computer generated invoice • Generated with GST Invoice Pro
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
