const BASE = import.meta.env.VITE_API || "http://localhost:3001/api";
let token = localStorage.getItem("token");
export const setToken = (t) => {
  token = t;
  t ? localStorage.setItem("token", t) : localStorage.removeItem("token");
};
async function req(path, method = "GET", body) {
  const r = await fetch(BASE + path, {
    method,
    headers: { "Content-Type": "application/json", ...(token && { Authorization: "Bearer " + token }) },
    body: body && JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Error del servidor");
  return d;
}
export const api = {
  login: (b) => req("/login", "POST", b),
  register: (b) => req("/register", "POST", b),
  posts: () => req("/posts"),
  newPost: (b) => req("/posts", "POST", b),
  comment: (id, b) => req(`/posts/${id}/comments`, "POST", b),
  reservas: () => req("/reservas"),
  reservar: (b) => req("/reservas", "POST", b),
  bloquear: (b) => req("/bloqueos", "POST", b),
  pendientes: () => req("/reservas/pendientes"),
  decidir: (id, estado) => req(`/reservas/${id}`, "PATCH", { estado }),
};
