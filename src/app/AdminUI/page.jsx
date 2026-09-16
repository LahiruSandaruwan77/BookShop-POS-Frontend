import { useState, useRef, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { products as productsApi, categories as categoriesApi, stock as stockApi, users as usersApi, reports as reportsApi, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth-context";

const rs = (n) => "Rs. " + Number(n || 0).toLocaleString("en-LK", { minimumFractionDigits: 2 });

const msg = (err, fallback) => (err instanceof ApiError ? err.message : fallback);

const EMPTY_FORM = {
  id: null, barcode: "", name: "", categoryId: "",
  costPrice: "", sellingPrice: "", openingStock: "", service: false,
};

export default function AdminScreen() {
  const { user, logout } = useAuth();
  const [tab, setTab] = useState("products");
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const notify = (text) => {
    setToast(text);
    setTimeout(() => setToast(null), 2200);
  };

  const reloadProducts = useCallback(
    () => productsApi.list(true).then(setProducts).catch((e) => notify(msg(e, "Could not load products"))),
    []
  );
  const reloadCategories = useCallback(
    () => categoriesApi.list().then(setCategories).catch((e) => notify(msg(e, "Could not load categories"))),
    []
  );

  useEffect(() => {
    Promise.all([reloadProducts(), reloadCategories()]).finally(() => setLoading(false));
  }, [reloadProducts, reloadCategories]);

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100">
      <header className="bg-zinc-900 border-b border-zinc-800 px-5 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold text-sm">
            SB
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-base font-semibold text-zinc-50 tracking-tight">Sarasavi Book Corner</span>
            <span className="text-xs text-zinc-500 uppercase tracking-widest">Back office</span>
          </div>
        </div>
        <div className="flex items-center gap-5 text-sm">
          <Link to="/billing" className="text-zinc-300 hover:text-emerald-400 transition-colors">Billing</Link>
          <span className="text-zinc-500">{user?.name}</span>
          <button onClick={logout} className="text-zinc-400 hover:text-red-400 transition-colors">Sign out</button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <nav className="w-48 shrink-0 bg-zinc-900 border-r border-zinc-800 py-4 flex flex-col gap-1">
          {[
            ["products", "Products"],
            ["stock", "Receive stock"],
            ["categories", "Categories"],
            ["users", "Users"],
            ["reports", "Reports"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`text-left px-5 py-2.5 text-sm font-medium border-l-2 transition-colors ${
                tab === key
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                  : "border-transparent text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        <main className="flex-1 min-w-0 p-5 overflow-auto">
          {loading ? (
            <div className="text-zinc-500 text-sm">Loading…</div>
          ) : (
            <>
              {tab === "products" && (
                <ProductsTab
                  products={products}
                  categories={categories}
                  reloadProducts={reloadProducts}
                  notify={notify}
                />
              )}
              {tab === "stock" && (
                <StockTab products={products} reloadProducts={reloadProducts} notify={notify} />
              )}
              {tab === "categories" && (
                <CategoriesTab categories={categories} reloadCategories={reloadCategories} products={products} notify={notify} />
              )}
              {tab === "users" && <UsersTab notify={notify} currentUsername={user?.username} />}
              {tab === "reports" && <ReportsTab notify={notify} />}
            </>
          )}
        </main>
      </div>

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-zinc-900 border border-zinc-800 text-zinc-100 text-sm px-4 py-2.5 rounded-full shadow-2xl shadow-black/50">
          {toast}
        </div>
      )}
    </div>
  );
}

/* ---------------- Products ---------------- */
function ProductsTab({ products, categories, reloadProducts, notify }) {
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState(null); // null = closed, object = editing/adding
  const [saving, setSaving] = useState(false);
  const barcodeRef = useRef(null);

  useEffect(() => {
    if (form) barcodeRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refocus only when a different record opens, not on every keystroke
  }, [form?.id]);

  const visible = products.filter(
    (p) =>
      (showInactive || p.active) &&
      (p.name.toLowerCase().includes(search.toLowerCase()) ||
        (p.barcode || "").includes(search))
  );

  const openAdd = () => setForm({ ...EMPTY_FORM, categoryId: categories[0]?.id ?? "" });
  const openEdit = (p) =>
    setForm({
      id: p.id,
      barcode: p.barcode || "",
      name: p.name,
      categoryId: categories.find((c) => c.name === p.category)?.id ?? "",
      costPrice: p.costPrice,
      sellingPrice: p.sellingPrice,
      openingStock: "",
      service: p.service,
    });

  const save = async () => {
    if (!form.name.trim()) return notify("Name is required");
    if (form.sellingPrice === "" || Number(form.sellingPrice) < 0) return notify("Selling price is required");
    if (!form.categoryId) return notify("Category is required");

    const body = {
      barcode: form.service ? null : form.barcode.trim() || null,
      name: form.name.trim(),
      categoryId: Number(form.categoryId),
      costPrice: form.costPrice === "" ? 0 : Number(form.costPrice),
      sellingPrice: Number(form.sellingPrice),
      openingStock: form.service || form.id ? null : (form.openingStock === "" ? 0 : Number(form.openingStock)),
      service: form.service,
      reorderLevel: null,
    };

    setSaving(true);
    try {
      if (form.id) {
        await productsApi.update(form.id, body);
        notify(`Updated: ${body.name}`);
      } else {
        await productsApi.create(body);
        notify(`Added: ${body.name}`);
      }
      setForm(null);
      reloadProducts();
    } catch (err) {
      notify(msg(err, "Could not save product"));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p) => {
    try {
      await productsApi.setActive(p.id, !p.active);
      notify(p.active ? `Deactivated: ${p.name}` : `Restored: ${p.name}`);
      reloadProducts();
    } catch (err) {
      notify(msg(err, "Could not update product"));
    }
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-semibold text-zinc-50 tracking-tight">Products</h1>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or barcode"
          className="ml-auto w-72 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 focus:border-emerald-500 focus:outline-none text-zinc-100 placeholder-zinc-600 text-sm transition-colors"
        />
        <label className="flex items-center gap-1.5 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="accent-emerald-500"
          />
          Show inactive
        </label>
        <button
          onClick={openAdd}
          className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-sm font-semibold transition-colors"
        >
          + Add product
        </button>
      </div>

      <div className="bg-zinc-900 rounded-xl border border-zinc-800 shadow-lg shadow-black/20 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-zinc-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium border-b border-zinc-800">Item</th>
              <th className="text-left px-2 py-2.5 font-medium border-b border-zinc-800">Barcode</th>
              <th className="text-left px-2 py-2.5 font-medium border-b border-zinc-800">Category</th>
              <th className="text-right px-2 py-2.5 font-medium border-b border-zinc-800">Cost</th>
              <th className="text-right px-2 py-2.5 font-medium border-b border-zinc-800">Price</th>
              <th className="text-right px-2 py-2.5 font-medium border-b border-zinc-800">Stock</th>
              <th className="px-4 py-2.5 w-40 border-b border-zinc-800" />
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id} className={`border-t border-zinc-800/60 hover:bg-zinc-800/20 transition-colors ${!p.active ? "opacity-40" : ""}`}>
                <td className="px-4 py-2.5 text-zinc-100">
                  {p.name}
                  {p.service && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide bg-amber-500/10 text-amber-400 border border-amber-500/25 px-1.5 py-0.5 rounded">
                      service
                    </span>
                  )}
                </td>
                <td className="px-2 py-2.5 tabular-nums text-zinc-500">{p.barcode || "—"}</td>
                <td className="px-2 py-2.5 text-zinc-400">{p.category}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-zinc-500">
                  {p.service ? "—" : rs(p.costPrice)}
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums font-medium text-zinc-100">{rs(p.sellingPrice)}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">
                  {p.service ? (
                    "—"
                  ) : (
                    <span
                      className={
                        Number(p.stockQty) <= p.reorderLevel
                          ? "text-red-400 font-bold"
                          : "text-zinc-300"
                      }
                    >
                      {p.stockQty}
                      {Number(p.stockQty) <= p.reorderLevel && " ⚠"}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right space-x-3 whitespace-nowrap">
                  <button onClick={() => openEdit(p)} className="text-emerald-400 hover:text-emerald-300 hover:underline transition-colors">
                    Edit
                  </button>
                  <button onClick={() => toggleActive(p)} className="text-zinc-500 hover:text-red-400 hover:underline transition-colors">
                    {p.active ? "Deactivate" : "Restore"}
                  </button>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan="7" className="px-4 py-10 text-center text-zinc-600">
                  No products match — add one to get started
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add / edit panel */}
      {form && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-20" onClick={() => setForm(null)}>
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/50 w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-zinc-50">{form.id ? "Edit product" : "Add product"}</h2>

            <label className="flex items-center gap-2 text-sm bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2 text-amber-200">
              <input
                type="checkbox"
                checked={form.service}
                onChange={(e) => setForm({ ...form, service: e.target.checked })}
                className="accent-amber-500"
              />
              This is a service (photocopy, printout…) — no barcode, no stock tracking
            </label>

            {!form.service && (
              <Field label="Barcode — click here and scan the item">
                <input
                  ref={barcodeRef}
                  value={form.barcode}
                  onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  placeholder="Scan or type, blank if none"
                  className="tabular-nums w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none transition-colors"
                />
              </Field>
            )}

            <Field label="Name *">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 focus:border-emerald-500 focus:outline-none transition-colors"
              />
            </Field>

            <Field label="Category *">
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 focus:border-emerald-500 focus:outline-none transition-colors"
              >
                <option value="" disabled>Choose…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              {!form.service && (
                <Field label="Cost price">
                  <input
                    type="number" min="0"
                    value={form.costPrice}
                    onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 focus:border-emerald-500 focus:outline-none tabular-nums transition-colors"
                  />
                </Field>
              )}
              <Field label="Selling price *">
                <input
                  type="number" min="0"
                  value={form.sellingPrice}
                  onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 focus:border-emerald-500 focus:outline-none tabular-nums transition-colors"
                />
              </Field>
              {!form.service && !form.id && (
                <Field label="Opening stock">
                  <input
                    type="number" min="0"
                    value={form.openingStock}
                    onChange={(e) => setForm({ ...form, openingStock: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 focus:border-emerald-500 focus:outline-none tabular-nums transition-colors"
                  />
                </Field>
              )}
            </div>

            {form.id && !form.service && (
              <p className="text-xs text-zinc-400 bg-zinc-800/40 border border-zinc-800 rounded-lg px-3 py-2">
                Stock is not edited here — use <b className="text-zinc-200">Receive stock</b> so every change is logged.
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save product"}
              </button>
              <button onClick={() => setForm(null)} className="px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Receive stock ---------------- */
function StockTab({ products, reloadProducts, notify }) {
  const [movements, setMovements] = useState([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [qty, setQty] = useState("");
  const [mode, setMode] = useState("purchase"); // purchase | adjustment
  const [reason, setReason] = useState("");
  const [newCost, setNewCost] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reloadMovements = useCallback(
    () => stockApi.list().then(setMovements).catch((e) => notify(msg(e, "Could not load stock movements"))),
    [notify]
  );

  useEffect(() => {
    reloadMovements();
  }, [reloadMovements]);

  const hits =
    query.trim() && !selected
      ? products
          .filter((p) => p.active && !p.service)
          .filter(
            (p) =>
              p.name.toLowerCase().includes(query.toLowerCase()) ||
              (p.barcode || "").includes(query.trim())
          )
          .slice(0, 6)
      : [];

  const pick = (p) => {
    setSelected(p);
    setQuery(p.name);
    setNewCost(String(p.costPrice));
  };

  const submit = async () => {
    const n = Number(qty);
    if (!selected) return notify("Choose a product first");
    if (!n || (mode === "purchase" && n <= 0)) return notify("Enter a valid quantity");
    if (mode === "adjustment" && !reason.trim()) return notify("Adjustments need a reason");

    const change = mode === "purchase" ? Math.abs(n) : n;
    setSubmitting(true);
    try {
      await stockApi.create({
        productId: selected.id,
        quantity: change,
        type: mode === "purchase" ? "PURCHASE" : "ADJUSTMENT",
        note: mode === "purchase" ? null : reason.trim(),
        newCostPrice: mode === "purchase" && newCost !== "" ? Number(newCost) : null,
      });
      notify(`${selected.name}: ${change > 0 ? "+" : ""}${change}`);
      setSelected(null); setQuery(""); setQty(""); setReason("");
      reloadProducts();
      reloadMovements();
    } catch (err) {
      notify(msg(err, "Could not record movement"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-5xl grid grid-cols-5 gap-5">
      <div className="col-span-2 bg-zinc-900 rounded-xl border border-zinc-800 shadow-lg shadow-black/20 p-5 space-y-4 self-start">
        <h1 className="text-xl font-semibold text-zinc-50 tracking-tight">Receive stock</h1>

        <div className="flex gap-2 text-sm">
          {[["purchase", "New stock arrived"], ["adjustment", "Adjustment"]].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setMode(k)}
              className={`flex-1 py-2 rounded-lg border font-medium transition-colors ${
                mode === k
                  ? "bg-emerald-500 text-zinc-950 border-emerald-500"
                  : "bg-zinc-800/40 border-zinc-700 text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Field label="Product — scan barcode or type name">
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
              placeholder="Scan or search…"
              className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none transition-colors"
            />
          </Field>
          {hits.length > 0 && (
            <ul className="absolute z-10 left-0 right-0 mt-1 bg-zinc-900 border border-zinc-800 rounded-lg shadow-2xl shadow-black/40 overflow-hidden">
              {hits.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => pick(p)}
                    className="w-full flex justify-between px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-800 transition-colors"
                  >
                    <span>{p.name}</span>
                    <span className="text-zinc-500 tabular-nums">now {p.stockQty}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label={mode === "purchase" ? "Quantity received" : "Change (use − to reduce)"}>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder={mode === "purchase" ? "e.g. 50" : "e.g. -2"}
              className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none tabular-nums transition-colors"
            />
          </Field>
          {mode === "purchase" ? (
            <Field label="New cost price (optional)">
              <input
                type="number" min="0"
                value={newCost}
                onChange={(e) => setNewCost(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 focus:border-emerald-500 focus:outline-none tabular-nums transition-colors"
              />
            </Field>
          ) : (
            <Field label="Reason *">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="damaged / count fix / theft"
                className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none transition-colors"
              />
            </Field>
          )}
        </div>

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold transition-colors disabled:opacity-50"
        >
          {submitting ? "Recording…" : "Record movement"}
        </button>
      </div>

      {/* Movement log */}
      <div className="col-span-3 bg-zinc-900 rounded-xl border border-zinc-800 shadow-lg shadow-black/20 overflow-hidden self-start">
        <div className="px-4 py-3 border-b border-zinc-800 font-semibold text-sm text-zinc-300">
          Recent stock movements
        </div>
        <table className="w-full text-sm">
          <tbody>
            {movements.map((m) => {
              const change = Number(m.qtyChange);
              const label = m.reason === "ADJUSTMENT" ? m.note : m.reason.toLowerCase();
              return (
                <tr key={m.id} className="border-t border-zinc-800/60">
                  <td className="px-4 py-2 text-zinc-500 tabular-nums w-16">
                    {new Date(m.movedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-2 py-2 text-zinc-200">{m.product}</td>
                  <td className={`px-2 py-2 text-right tabular-nums font-bold w-16 ${change > 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {change > 0 ? "+" : ""}{change}
                  </td>
                  <td className="px-4 py-2 text-zinc-500 w-32">{label}</td>
                </tr>
              );
            })}
            {movements.length === 0 && (
              <tr>
                <td colSpan="4" className="px-4 py-10 text-center text-zinc-600">No movements yet</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- Categories ---------------- */
function CategoriesTab({ categories, reloadCategories, products, notify }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    setSaving(true);
    try {
      await categoriesApi.create(n);
      setName("");
      notify(`Added category: ${n}`);
      reloadCategories();
    } catch (err) {
      notify(msg(err, "Could not add category"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md">
      <h1 className="text-xl font-semibold text-zinc-50 tracking-tight mb-4">Categories</h1>
      <div className="flex gap-2 mb-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="New category name"
          className="flex-1 px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none transition-colors"
        />
        <button onClick={add} disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold transition-colors disabled:opacity-50">
          Add
        </button>
      </div>
      <ul className="bg-zinc-900 rounded-xl border border-zinc-800 shadow-lg shadow-black/20 divide-y divide-zinc-800/60">
        {categories.map((c) => {
          const count = products.filter((p) => p.category === c.name && p.active).length;
          return (
            <li key={c.id} className="flex justify-between px-4 py-2.5 text-sm">
              <span className="text-zinc-100">{c.name}</span>
              <span className="text-zinc-500">{count} item{count !== 1 ? "s" : ""}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-zinc-600 mt-3">
        Categories with products can't be deleted — deactivate the products first.
      </p>
    </div>
  );
}

/* ---------------- Users ---------------- */
function UsersTab({ notify, currentUsername }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null); // add/edit modal
  const [saving, setSaving] = useState(false);
  const [resetFor, setResetFor] = useState(null); // reset-password modal
  const [tempPw, setTempPw] = useState("");

  const reloadUsers = useCallback(
    () => usersApi.list().then(setUsers).catch((e) => notify(msg(e, "Could not load users"))).finally(() => setLoading(false)),
    [notify]
  );

  useEffect(() => {
    reloadUsers();
  }, [reloadUsers]);

  const openAdd = () =>
    setForm({ id: null, name: "", username: "", phone: "", role: "CASHIER", password: "" });
  const openEdit = (u) => setForm({ id: u.id, name: u.name, username: u.username, phone: u.phone || "", role: u.role, password: "" });

  const save = async () => {
    if (!form.name.trim()) return notify("Name is required");
    const uname = form.username.trim().toLowerCase();
    if (!uname) return notify("Username is required");
    if (!form.id && form.password.length < 6)
      return notify("Temporary password needs at least 6 characters");

    const body = {
      name: form.name.trim(),
      username: uname,
      phone: form.phone.trim(),
      role: form.role,
      password: form.id ? undefined : form.password,
    };

    setSaving(true);
    try {
      if (form.id) {
        await usersApi.update(form.id, body);
        notify(`Updated: ${form.name.trim()}`);
      } else {
        await usersApi.create(body);
        notify(`Added user: ${uname} (must change password at first login)`);
      }
      setForm(null);
      reloadUsers();
    } catch (err) {
      notify(msg(err, "Could not save user"));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u) => {
    try {
      await usersApi.setActive(u.id, !u.active);
      notify(u.active ? `Deactivated: ${u.username}` : `Restored: ${u.username}`);
      reloadUsers();
    } catch (err) {
      notify(msg(err, "Could not update user"));
    }
  };

  const doReset = async () => {
    if (tempPw.length < 6) return notify("Temporary password needs at least 6 characters");
    try {
      await usersApi.resetPassword(resetFor.id, tempPw);
      notify(`Password reset for ${resetFor.username} — they must change it at next login`);
      setResetFor(null);
      setTempPw("");
      reloadUsers();
    } catch (err) {
      notify(msg(err, "Could not reset password"));
    }
  };

  if (loading) return <div className="text-zinc-500 text-sm">Loading…</div>;

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-semibold text-zinc-50 tracking-tight">Users</h1>
        <button
          onClick={openAdd}
          className="ml-auto px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 text-sm font-semibold transition-colors"
        >
          + Add user
        </button>
      </div>

      <div className="bg-zinc-900 rounded-xl border border-zinc-800 shadow-lg shadow-black/20 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-zinc-500 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium border-b border-zinc-800">Name</th>
              <th className="text-left px-2 py-2.5 font-medium border-b border-zinc-800">Username</th>
              <th className="text-left px-2 py-2.5 font-medium border-b border-zinc-800">Phone</th>
              <th className="text-left px-2 py-2.5 font-medium border-b border-zinc-800">Role</th>
              <th className="text-left px-2 py-2.5 font-medium border-b border-zinc-800">Status</th>
              <th className="px-4 py-2.5 w-56 border-b border-zinc-800" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={`border-t border-zinc-800/60 hover:bg-zinc-800/20 transition-colors ${!u.active ? "opacity-40" : ""}`}>
                <td className="px-4 py-2.5 text-zinc-100">
                  {u.name}
                  {u.username === currentUsername && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide bg-zinc-800 text-zinc-400 border border-zinc-700 px-1.5 py-0.5 rounded">
                      you
                    </span>
                  )}
                </td>
                <td className="px-2 py-2.5 text-zinc-400">{u.username}</td>
                <td className="px-2 py-2.5 text-zinc-500 tabular-nums">{u.phone || "—"}</td>
                <td className="px-2 py-2.5">
                  <span
                    className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded font-semibold border ${
                      u.role === "ADMIN"
                        ? "bg-violet-500/10 text-violet-300 border-violet-500/30"
                        : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="px-2 py-2.5 text-xs">
                  {u.active ? (
                    u.mustChangePassword ? (
                      <span className="text-amber-400">Awaiting first login</span>
                    ) : (
                      <span className="text-emerald-400">Active</span>
                    )
                  ) : (
                    <span className="text-zinc-600">Inactive</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right space-x-3 whitespace-nowrap">
                  <button onClick={() => openEdit(u)} className="text-emerald-400 hover:text-emerald-300 hover:underline transition-colors">
                    Edit
                  </button>
                  <button
                    onClick={() => { setResetFor(u); setTempPw(""); }}
                    className="text-zinc-400 hover:text-zinc-200 hover:underline transition-colors"
                  >
                    Reset password
                  </button>
                  <button
                    onClick={() => toggleActive(u)}
                    className="text-zinc-500 hover:text-red-400 hover:underline transition-colors"
                  >
                    {u.active ? "Deactivate" : "Restore"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add / edit modal */}
      {form && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-20" onClick={() => setForm(null)}>
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/50 w-full max-w-md p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-zinc-50">{form.id ? "Edit user" : "Add user"}</h2>

            <Field label="Full name *">
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 focus:border-emerald-500 focus:outline-none transition-colors"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Username *">
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 focus:border-emerald-500 focus:outline-none transition-colors"
                />
              </Field>
              <Field label="Phone (optional)">
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 focus:border-emerald-500 focus:outline-none tabular-nums transition-colors"
                />
              </Field>
            </div>

            <Field label="Role">
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 focus:border-emerald-500 focus:outline-none transition-colors"
              >
                <option value="CASHIER">CASHIER — billing screen only</option>
                <option value="ADMIN">ADMIN — full access</option>
              </select>
            </Field>

            {!form.id && (
              <Field label="Temporary password * (they'll change it at first login)">
                <input
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="At least 6 characters"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none transition-colors"
                />
              </Field>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold transition-colors disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save user"}
              </button>
              <button onClick={() => setForm(null)} className="px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset password modal */}
      {resetFor && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-20" onClick={() => setResetFor(null)}>
          <div
            className="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl shadow-black/50 w-full max-w-sm p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-zinc-50">Reset password — {resetFor.username}</h2>
            <p className="text-sm text-zinc-400">
              Set a temporary password and tell it to them. They'll be forced to choose their own at next login.
            </p>
            <Field label="Temporary password *">
              <input
                type="text"
                value={tempPw}
                onChange={(e) => setTempPw(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700 text-zinc-100 placeholder-zinc-600 focus:border-emerald-500 focus:outline-none transition-colors"
              />
            </Field>
            <div className="flex gap-2">
              <button
                onClick={doReset}
                className="flex-1 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold transition-colors"
              >
                Reset password
              </button>
              <button onClick={() => setResetFor(null)} className="px-4 py-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Reports ---------------- */
function ReportsTab({ notify }) {
  const [range, setRange] = useState("today");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    reportsApi
      .summary(range)
      .then(setData)
      .catch((e) => notify(msg(e, "Could not load report")))
      .finally(() => setLoading(false));
  }, [range, notify]);

  const selectRange = (r) => {
    setLoading(true);
    setRange(r);
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3 mb-4">
        <h1 className="text-xl font-semibold text-zinc-50 tracking-tight">Reports</h1>
        <div className="ml-auto flex gap-2 text-sm">
          {[["today", "Today"], ["week", "Last 7 days"]].map(([k, label]) => (
            <button
              key={k}
              onClick={() => selectRange(k)}
              className={`px-4 py-2 rounded-lg border font-medium transition-colors ${
                range === k
                  ? "bg-emerald-500 text-zinc-950 border-emerald-500"
                  : "bg-zinc-800/40 border-zinc-700 text-zinc-400 hover:bg-zinc-800"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading || !data ? (
        <div className="text-zinc-500 text-sm">Loading…</div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 mb-5">
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 shadow-lg shadow-black/20 p-5">
              <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1.5">Total sales</div>
              <div className="text-2xl font-semibold text-emerald-400 tabular-nums">{rs(data.totalSales)}</div>
            </div>
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 shadow-lg shadow-black/20 p-5">
              <div className="text-xs uppercase tracking-wide text-zinc-500 mb-1.5">Number of sales</div>
              <div className="text-2xl font-semibold text-zinc-100 tabular-nums">{data.saleCount}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="bg-zinc-900 rounded-xl border border-zinc-800 shadow-lg shadow-black/20 overflow-hidden self-start">
              <div className="px-4 py-3 border-b border-zinc-800 font-semibold text-sm text-zinc-300">
                Top items
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {data.topItems.map((item, i) => (
                    <tr key={item.productName} className="border-t border-zinc-800/60">
                      <td className="px-4 py-2 text-zinc-500 tabular-nums w-8">{i + 1}</td>
                      <td className="px-2 py-2 text-zinc-100">{item.productName}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-zinc-400 w-16">{item.quantity}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-zinc-100 w-28">{rs(item.revenue)}</td>
                    </tr>
                  ))}
                  {data.topItems.length === 0 && (
                    <tr>
                      <td colSpan="4" className="px-4 py-10 text-center text-zinc-600">No sales in this period</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="bg-zinc-900 rounded-xl border border-zinc-800 shadow-lg shadow-black/20 overflow-hidden self-start">
              <div className="px-4 py-3 border-b border-zinc-800 font-semibold text-sm text-zinc-300">
                Per-cashier totals
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {data.cashierTotals.map((c) => (
                    <tr key={c.cashier} className="border-t border-zinc-800/60">
                      <td className="px-4 py-2 text-zinc-100">{c.cashier}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-zinc-500 w-24">
                        {c.saleCount} sale{c.saleCount !== 1 ? "s" : ""}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-zinc-100 w-28">{rs(c.total)}</td>
                    </tr>
                  ))}
                  {data.cashierTotals.length === 0 && (
                    <tr>
                      <td colSpan="3" className="px-4 py-10 text-center text-zinc-600">No sales in this period</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
