import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { products as productsApi, sales as salesApi, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";

const rs = (n) =>
  "Rs. " + Number(n || 0).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Printed on every receipt — edit here, nothing else to touch.
const SHOP = {
  name: "SARASAVI BOOK CORNER",
  address: "Kandy",
  phone: "081-2223550",
};

// Print CSS lives here rather than in a shared stylesheet since only this
// screen prints. The narrow width/monospace font are deliberate: this is the
// same layout an 80mm thermal roll will get later, just rendered by the
// browser today instead of ESC/POS commands.
const PRINT_STYLES = `
  .receipt-print { display: none; }

  @media print {
    /* The app's dark theme sets body's background directly (not just a
       descendant's), so body * { visibility: hidden } alone leaves it
       painted behind the receipt — force paper-white explicitly. */
    html, body { background: #fff !important; }
    body * { visibility: hidden; }
    .receipt-print, .receipt-print * { visibility: visible; }
    .receipt-print {
      display: block;
      position: absolute;
      top: 0;
      left: 0;
      width: 72mm; /* ~300px / 42-48 monospace chars — an 80mm roll's usable width */
      background: #fff;
      font-family: "JetBrains Mono", "Courier New", monospace;
      font-size: 12px;
      line-height: 1.4;
      color: #000;
    }
  }

  /* @page is inherently print-only, so it's kept at the top level rather than
     nested inside @media print — some print/PDF engines don't honor it there. */
  @page {
    size: 80mm auto; /* narrow roll width, auto (unbounded) height — not A4 */
    margin: 4mm 3mm;
  }

  .receipt-print .center { text-align: center; }
  .receipt-print .bold { font-weight: bold; }
  .receipt-print .shop-name { font-weight: bold; font-size: 14px; letter-spacing: 0.5px; }
  .receipt-print .divider { border-top: 1px dashed #000; margin: 6px 0; }
  .receipt-print .row { display: flex; justify-content: space-between; gap: 8px; }
  .receipt-print .item-name { margin-bottom: 1px; }
  .receipt-print .footer { margin-top: 10px; }
`;

// Backend field names -> the shape this screen was written against.
const mapProduct = (p) => ({
  id: p.id,
  barcode: p.barcode,
  name: p.name,
  price: Number(p.sellingPrice),
  isService: p.service,
  isOpenPrice: p.openPrice,
  stock: p.stockQty === null || p.stockQty === undefined ? null : Number(p.stockQty),
});

// Open-price lines carry their own enteredPrice; everything else uses the
// catalog price. Falls back to product.price for saleDone's server-resolved
// lines too, since those never carry isOpenPrice — the server already priced them.
const linePrice = (l) => (l.product.isOpenPrice ? l.enteredPrice : l.product.price);

export default function BillingScreen() {
  const { user, logout } = useAuth();
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [cart, setCart] = useState([]);
  const [query, setQuery] = useState("");
  const [tendered, setTendered] = useState("");
  const [flash, setFlash] = useState(null); // { type: 'ok'|'err', text }
  const [saleDone, setSaleDone] = useState(null); // completed sale snapshot
  const [checkingOut, setCheckingOut] = useState(false);
  const [pendingOpenPrice, setPendingOpenPrice] = useState(null); // product awaiting a cashier-entered price
  const [priceInput, setPriceInput] = useState("");
  const scanRef = useRef(null);
  const priceInputRef = useRef(null);
  const nextLineId = useRef(1); // cart lines need their own identity — see addToCart

  const notify = (type, text) => {
    setFlash({ type, text });
    setTimeout(() => setFlash(null), 1800);
  };

  const loadCatalog = useCallback(() => {
    setCatalogLoading(true);
    return productsApi
      .list(false)
      .then((list) => setCatalog(list.map(mapProduct)))
      .catch((err) => notify("err", err instanceof ApiError ? err.message : "Could not load products"))
      .finally(() => setCatalogLoading(false));
  }, []);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // The scan box must always be ready — a barcode scanner "types" here and sends Enter.
  useEffect(() => {
    scanRef.current?.focus();
  }, [cart, saleDone]);

  // Focus the price prompt's input the moment it mounts, same pattern as scanRef above.
  useEffect(() => {
    if (pendingOpenPrice) priceInputRef.current?.focus();
  }, [pendingOpenPrice]);

  // Open-price items have no fixed price, so adding one first opens the price
  // prompt (see below) instead of going straight into the cart; enteredPrice
  // arrives once the cashier confirms it there.
  const addToCart = (product, qty = 1, enteredPrice = null) => {
    if (product.isOpenPrice && enteredPrice === null) {
      setPendingOpenPrice(product);
      setQuery("");
      return;
    }
    setCart((prev) => {
      // Normal/service lines merge by product; open-price lines never do — each
      // add is its own pricing decision, so it always gets its own line.
      if (!product.isOpenPrice) {
        const line = prev.find((l) => l.product.id === product.id);
        if (line) {
          return prev.map((l) =>
            l.product.id === product.id ? { ...l, qty: l.qty + qty } : l
          );
        }
      }
      return [...prev, { lineId: nextLineId.current++, product, qty, enteredPrice }];
    });
    notify("ok", `Added: ${product.name}`);
    setQuery("");
  };

  const confirmOpenPrice = () => {
    const price = parseFloat(priceInput);
    if (!price || price <= 0) return notify("err", "Enter a valid price");
    addToCart(pendingOpenPrice, 1, price);
    setPendingOpenPrice(null);
    setPriceInput("");
  };

  const cancelOpenPrice = () => {
    setPendingOpenPrice(null);
    setPriceInput("");
  };

  const setQty = (lineId, qty) => {
    if (Number.isNaN(qty) || qty < 1) return;
    setCart((prev) =>
      prev.map((l) => (l.lineId === lineId ? { ...l, qty } : l))
    );
  };

  const removeLine = (lineId) =>
    setCart((prev) => prev.filter((l) => l.lineId !== lineId));

  // Enter in the scan box: exact barcode match first (scanner path), else first search hit.
  const handleScanSubmit = () => {
    const q = query.trim();
    if (!q) return;
    const byBarcode = catalog.find((p) => p.barcode === q);
    if (byBarcode) return addToCart(byBarcode);
    const hits = searchHits;
    if (hits.length > 0) return addToCart(hits[0]);
    notify("err", `No item found for "${q}"`);
    setQuery("");
  };

  const searchHits =
    query.trim().length > 0 && !/^\d{8,}$/.test(query.trim())
      ? catalog
          .filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
          .slice(0, 6)
      : [];

  const services = catalog.filter((p) => p.isService);
  const total = cart.reduce((s, l) => s + linePrice(l) * l.qty, 0);
  const paid = parseFloat(tendered) || 0;
  const change = paid - total;
  const canComplete = cart.length > 0 && paid >= total && !checkingOut;

  const completeSale = async () => {
    setCheckingOut(true);
    try {
      const res = await salesApi.checkout({
        items: cart.map((l) => ({
          productId: l.product.id,
          quantity: l.qty,
          // Only open-price lines send a price — normal/service lines never do,
          // the server always prices those from the product record itself.
          ...(l.product.isOpenPrice ? { unitPrice: l.enteredPrice } : {}),
        })),
        paidAmount: paid,
        paymentMethod: "CASH",
      });
      setSaleDone({
        no: res.id,
        time: new Date(res.saleTime),
        lines: res.items.map((line, i) => ({
          lineId: i,
          product: { id: i, name: line.name, price: Number(line.unitPrice) },
          qty: Number(line.quantity),
        })),
        total: Number(res.totalAmount),
        paid: Number(res.paidAmount),
        change: Number(res.changeGiven),
      });
      setCart([]);
      setTendered("");
      loadCatalog(); // stock was deducted server-side
    } catch (err) {
      notify("err", err instanceof ApiError ? err.message : "Checkout failed");
    } finally {
      setCheckingOut(false);
    }
  };

  const newSale = () => setSaleDone(null);

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100">
      <style>{PRINT_STYLES}</style>

      {/* Print-only receipt for the completed sale — invisible on screen, and the
          only thing `body * { visibility: hidden }` leaves visible when printing. */}
      {saleDone && (
        <div className="receipt-print">
          <div className="center shop-name">{SHOP.name}</div>
          <div className="center">{SHOP.address}</div>
          <div className="center">Tel {SHOP.phone}</div>

          <div className="divider" />
          <div>Bill #{saleDone.no}</div>
          <div>{saleDone.time.toLocaleString()}</div>

          <div className="divider" />
          {saleDone.lines.map((l) => (
            <div key={l.product.id} className="item-name">
              <div>{l.product.name}</div>
              <div className="row">
                <span>{l.qty} x {l.product.price.toFixed(2)}</span>
                <span>{(l.product.price * l.qty).toFixed(2)}</span>
              </div>
            </div>
          ))}

          <div className="divider" />
          <div className="row bold">
            <span>TOTAL</span>
            <span>{rs(saleDone.total)}</span>
          </div>
          <div className="row">
            <span>Cash</span>
            <span>{rs(saleDone.paid)}</span>
          </div>
          <div className="row">
            <span>Change</span>
            <span>{rs(saleDone.change)}</span>
          </div>

          <div className="divider" />
          <div className="center footer">Thank you — come again!</div>
        </div>
      )}

      {/* Header */}
      <header className="bg-zinc-900 border-b border-zinc-800 px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm">
            SB
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-base font-semibold text-zinc-50 tracking-tight">Sarasavi Book Corner</span>
            <span className="text-xs text-zinc-500 uppercase tracking-widest">Billing</span>
          </div>
        </div>
        <div className="flex items-center gap-5 text-sm text-zinc-400 tabular-nums">
          <span>{saleDone ? `Bill #${saleDone.no}` : "New sale"} · {new Date().toLocaleDateString("en-GB")}</span>
          {user?.role === "ADMIN" && (
            <Link to="/admin" className="font-sans normal-case tracking-normal text-zinc-300 hover:text-emerald-400 transition-colors">
              Back office
            </Link>
          )}
          <span className="font-sans normal-case tracking-normal text-zinc-500">{user?.name}</span>
          <button onClick={logout} className="font-sans normal-case tracking-normal text-zinc-400 hover:text-red-400 transition-colors">
            Sign out
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* ---------- Left: scan, services, cart ---------- */}
        <main className="flex-1 flex flex-col p-4 gap-3 min-w-0">
          {/* Scan / search */}
          <div className="relative">
            <input
              ref={scanRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleScanSubmit()}
              placeholder={catalogLoading ? "Loading catalog…" : "Scan barcode or type item name, then press Enter"}
              disabled={catalogLoading}
              className="w-full text-lg px-4 py-3 rounded-xl border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 focus:outline-none bg-zinc-900 text-zinc-100 placeholder-zinc-600 shadow-lg shadow-black/20 disabled:opacity-60 transition-colors"
            />
            {flash && (
              <div
                className={`absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium px-3 py-1 rounded-full border ${
                  flash.type === "ok"
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-red-500/10 text-red-400 border-red-500/30"
                }`}
              >
                {flash.text}
              </div>
            )}
            {searchHits.length > 0 && (
              <ul className="absolute z-10 left-0 right-0 mt-1 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl shadow-black/40 overflow-hidden">
                {searchHits.map((p, i) => (
                  <li key={p.id}>
                    <button
                      onClick={() => addToCart(p)}
                      className={`w-full flex justify-between px-4 py-2 text-left hover:bg-zinc-800 transition-colors ${
                        i === 0 ? "bg-zinc-800/60" : ""
                      }`}
                    >
                      <span className="text-zinc-100">
                        {p.name}
                        {i === 0 && (
                          <span className="ml-2 text-xs text-zinc-500">↵ Enter</span>
                        )}
                      </span>
                      <span className="tabular-nums text-zinc-400">
                        {p.isOpenPrice ? <span className="text-sky-400">enter price</span> : rs(p.price)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Service quick keys — no barcode, one tap */}
          {services.length > 0 && (
            <div className="grid grid-cols-4 gap-2">
              {services.map((s) => (
                <button
                  key={s.id}
                  onClick={() => addToCart(s)}
                  className="rounded-xl border border-amber-500/25 bg-amber-500/10 hover:bg-amber-500/15 px-3 py-2 text-left transition-colors"
                >
                  <div className="text-sm font-semibold text-amber-400 leading-tight">
                    {s.name.replace(/ \(per (page|sheet)\)/, "")}
                  </div>
                  <div className="text-xs text-amber-500/70 tabular-nums">
                    {rs(s.price)} / {s.name.includes("sheet") ? "sheet" : "page"}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Cart */}
          <div className="flex-1 min-h-0 bg-zinc-900 rounded-xl border border-zinc-800 shadow-lg shadow-black/20 overflow-auto">
            {cart.length === 0 ? (
              <div className="h-full flex items-center justify-center text-zinc-600 text-sm">
                {catalogLoading ? "Loading…" : "Scan an item or tap a service to start this bill"}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-zinc-900/95 backdrop-blur text-zinc-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium border-b border-zinc-800">Item</th>
                    <th className="text-center px-2 py-2 font-medium w-32 border-b border-zinc-800">Qty</th>
                    <th className="text-right px-2 py-2 font-medium w-24 border-b border-zinc-800">Price</th>
                    <th className="text-right px-4 py-2 font-medium w-28 border-b border-zinc-800">Amount</th>
                    <th className="w-10 border-b border-zinc-800" />
                  </tr>
                </thead>
                <tbody>
                  {cart.map((l) => (
                    <tr key={l.lineId} className="border-t border-zinc-800/60 hover:bg-zinc-800/20 transition-colors">
                      <td className="px-4 py-2 text-zinc-100">
                        {l.product.name}
                        {l.product.isService && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide bg-amber-500/10 text-amber-400 border border-amber-500/25 px-1.5 py-0.5 rounded">
                            service
                          </span>
                        )}
                        {l.product.isOpenPrice && (
                          <span className="ml-2 text-[10px] uppercase tracking-wide bg-sky-500/10 text-sky-400 border border-sky-500/25 px-1.5 py-0.5 rounded">
                            open price
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => setQty(l.lineId, l.qty - 1)}
                            className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold transition-colors"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={l.qty}
                            onChange={(e) => setQty(l.lineId, parseInt(e.target.value, 10))}
                            className="w-14 text-center bg-zinc-800/60 border border-zinc-700 rounded-md py-1 tabular-nums text-zinc-100 focus:border-emerald-500 focus:outline-none"
                          />
                          <button
                            onClick={() => setQty(l.lineId, l.qty + 1)}
                            className="w-7 h-7 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-bold transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-zinc-400">
                        {rs(linePrice(l))}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-zinc-100">
                        {rs(linePrice(l) * l.qty)}
                      </td>
                      <td className="pr-3 text-right">
                        <button
                          onClick={() => removeLine(l.lineId)}
                          className="text-zinc-600 hover:text-red-400 text-lg leading-none transition-colors"
                          title="Remove line"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>

        {/* ---------- Right: the live receipt (kept as literal paper against the dark chrome) ---------- */}
        <aside className="w-80 shrink-0 p-4 pl-0">
          <div className="h-full bg-neutral-50 rounded-lg shadow-2xl shadow-black/50 border border-neutral-200 flex flex-col font-mono text-sm text-neutral-900">
            <div className="px-5 pt-5 pb-3 text-center border-b border-dashed border-neutral-300">
              <div className="font-bold tracking-wider">{SHOP.name}</div>
              <div className="text-xs text-neutral-500">{SHOP.address} · Tel {SHOP.phone}</div>
            </div>

            <div className="flex-1 overflow-auto px-5 py-3 space-y-1">
              {(saleDone ? saleDone.lines : cart).map((l) => (
                <div key={l.lineId} className="flex justify-between gap-2">
                  <span className="truncate">
                    {l.qty > 1 ? `${l.qty} × ` : ""}
                    {l.product.name}
                  </span>
                  <span className="tabular-nums shrink-0">
                    {(linePrice(l) * l.qty).toFixed(2)}
                  </span>
                </div>
              ))}
              {cart.length === 0 && !saleDone && (
                <div className="text-neutral-300 text-center pt-8">— empty bill —</div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-dashed border-neutral-300 space-y-2">
              <div className="flex justify-between text-lg font-bold">
                <span>TOTAL</span>
                <span className="tabular-nums">{rs(saleDone ? saleDone.total : total)}</span>
              </div>

              {saleDone ? (
                <>
                  <div className="flex justify-between text-neutral-600">
                    <span>Cash</span>
                    <span className="tabular-nums">{rs(saleDone.paid)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>Change</span>
                    <span className="tabular-nums">{rs(saleDone.change)}</span>
                  </div>
                  <div className="text-center text-xs text-neutral-400 pt-1">
                    Bill #{saleDone.no} · {saleDone.time.toLocaleTimeString()}
                  </div>
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => window.print()}
                      className="flex-1 py-3 rounded-lg bg-zinc-700 text-white font-sans font-semibold hover:bg-zinc-600 transition-colors"
                    >
                      Print receipt
                    </button>
                    <button
                      onClick={newSale}
                      className="flex-1 py-3 rounded-lg bg-zinc-900 text-white font-sans font-semibold hover:bg-zinc-800 transition-colors"
                    >
                      New sale (Enter)
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label className="block">
                    <span className="text-xs text-neutral-500 font-sans">Cash received</span>
                    <input
                      type="number"
                      value={tendered}
                      onChange={(e) => setTendered(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && canComplete && completeSale()}
                      placeholder="0.00"
                      className="w-full mt-1 px-3 py-2 text-right text-lg border-2 border-neutral-300 rounded-lg focus:border-neutral-900 focus:outline-none tabular-nums"
                    />
                  </label>
                  <div
                    className={`flex justify-between font-bold ${
                      change >= 0 && paid > 0 ? "text-emerald-700" : "text-neutral-300"
                    }`}
                  >
                    <span>CHANGE</span>
                    <span className="tabular-nums">
                      {paid > 0 && change >= 0 ? rs(change) : "—"}
                    </span>
                  </div>
                  <button
                    onClick={completeSale}
                    disabled={!canComplete}
                    className="w-full py-3 rounded-lg font-sans font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-200 disabled:text-neutral-400 transition-colors"
                  >
                    {checkingOut ? "Completing…" : "Complete sale"}
                  </button>
                </>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Open-price prompt: no fixed price to add at, so ask for one before the
          item goes into the cart. Enter confirms, Escape cancels — this has to
          be fast, it's a live counter interaction. */}
      {pendingOpenPrice && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-30"
          onClick={cancelOpenPrice}
        >
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/50 w-full max-w-xs p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-semibold text-zinc-50">{pendingOpenPrice.name}</div>
            <label className="block">
              <span className="text-xs font-medium text-zinc-400">Price for this sale</span>
              <input
                ref={priceInputRef}
                type="number"
                min="0.01"
                step="0.01"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmOpenPrice();
                  if (e.key === "Escape") cancelOpenPrice();
                }}
                placeholder="0.00"
                className="w-full mt-1.5 px-3 py-2 text-lg rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none tabular-nums transition-colors"
              />
            </label>
            <div className="flex gap-2 pt-1">
              <button
                onClick={confirmOpenPrice}
                className="flex-1 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold transition-colors"
              >
                Add (Enter)
              </button>
              <button onClick={cancelOpenPrice} className="px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
