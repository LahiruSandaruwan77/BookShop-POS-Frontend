export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = "GET", body, params } = {}) {
  const url = new URL(path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    });
  }

  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    const fieldError = data?.errors?.[0];
    const message =
      data?.message ||
      (fieldError && `${fieldError.field}: ${fieldError.defaultMessage}`) ||
      (res.status === 401 ? "Invalid username or password" : null) ||
      data?.error ||
      `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }

  return data;
}

export const auth = {
  login: (username, password) => request("/api/auth/login", { method: "POST", body: { username, password } }),
  me: () => request("/api/auth/me"),
  changePassword: (currentPassword, newPassword) =>
    request("/api/auth/change-password", { method: "POST", body: { currentPassword, newPassword } }),
  logout: () => request("/api/auth/logout", { method: "POST" }),
};

export const products = {
  list: (includeInactive = false) => request("/api/products", { params: { includeInactive } }),
  search: (q) => request("/api/products/search", { params: { q } }),
  byBarcode: (code) => request(`/api/products/barcode/${encodeURIComponent(code)}`),
  create: (body) => request("/api/products", { method: "POST", body }),
  update: (id, body) => request(`/api/products/${id}`, { method: "PUT", body }),
  setActive: (id, value) => request(`/api/products/${id}/active`, { method: "PATCH", params: { value } }),
};

export const categories = {
  list: () => request("/api/categories"),
  create: (name) => request("/api/categories", { method: "POST", body: { name } }),
  remove: (id) => request(`/api/categories/${id}`, { method: "DELETE" }),
};

export const sales = {
  checkout: (body) => request("/api/sales", { method: "POST", body }),
  get: (id) => request(`/api/sales/${id}`),
  list: ({ from, to }) => request("/api/sales", { params: { from, to } }), // from/to = "yyyy-MM-dd"
};

export const stock = {
  list: () => request("/api/stock-movements"),
  create: (body) => request("/api/stock-movements", { method: "POST", body }),
};

export const reports = {
  today: () => request("/api/reports/today"),
  week: () => request("/api/reports/week"),
  day: (date) => request("/api/reports/day", { params: { date } }), // date = "yyyy-MM-dd"
};

export const users = {
  list: () => request("/api/users"),
  create: (body) => request("/api/users", { method: "POST", body }),
  update: (id, body) => request(`/api/users/${id}`, { method: "PUT", body }),
  setActive: (id, value) => request(`/api/users/${id}/active`, { method: "PATCH", params: { value } }),
  resetPassword: (id, temporaryPassword) =>
    request(`/api/users/${id}/reset-password`, { method: "POST", body: { temporaryPassword } }),
};
