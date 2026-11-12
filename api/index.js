import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

// ── Configuración ──────────────────────────────────────────────────────────────
const SECRET      = process.env.JWT_SECRET      || "cambie-esta-clave-en-produccion";
const SB_URL      = process.env.SUPABASE_URL    || "https://eihjazsbhhccbfokfkyx.supabase.co";
const SB_KEY      = process.env.SUPABASE_SERVICE_KEY;
const CATS        = ["seguridad", "eventos", "beneficios", "noticias"];

if (!SB_KEY) {
  console.error("⚠️  SUPABASE_SERVICE_KEY no está configurada en las variables de entorno.");
}

const sb = createClient(SB_URL, SB_KEY, {
  auth: { persistSession: false }
});

// ── Helpers de base de datos ───────────────────────────────────────────────────
const dbErr = (error) => { if (error) throw new Error(error.message); };

// ── Seed inicial: crear usuario directiva si no existe ─────────────────────────
let seeded = false;
const seed = async () => {
  if (seeded) return;
  const { data } = await sb.from("usuarios").select("id").eq("rol", "directiva").maybeSingle();
  if (!data) {
    const { error } = await sb.from("usuarios").insert({
      nombre: "Directiva",
      email:  "directiva@junta.cl",
      hash:   bcrypt.hashSync("directiva123", 10),
      rol:    "directiva",
    });
    if (error) console.error("Error al crear directiva:", error.message);
    else console.log("✅ Usuario directiva creado.");
  }
  seeded = true;
};

// ── Express ────────────────────────────────────────────────────────────────────
const app    = express();
const router = express.Router();

app.use(cors({ origin: "*" }));
app.use(express.json());

// Middleware: seed en la primera petición
router.use(async (_req, _res, next) => {
  try { await seed(); next(); }
  catch (err) { next(err); }
});

// Manejo global de errores
app.use((err, _req, res, _next) => {
  console.error("Error interno:", err.message);
  res.status(500).json({ error: `Error del servidor: ${err.message}` });
});

// ── Auth helpers ───────────────────────────────────────────────────────────────
const sign = (u) => ({
  token: jwt.sign({ id: u.id, nombre: u.nombre, rol: u.rol }, SECRET, { expiresIn: "7d" }),
  user:  { nombre: u.nombre, rol: u.rol },
});
const auth = (rol) => (req, res, next) => {
  try { req.u = jwt.verify((req.headers.authorization || "").slice(7), SECRET); }
  catch { return res.status(401).json({ error: "Debe ingresar con su cuenta." }); }
  if (rol && req.u.rol !== rol) return res.status(403).json({ error: "Solo la directiva puede hacer esto." });
  next();
};

// ── Ruta de diagnóstico ────────────────────────────────────────────────────────
router.get("/health", async (_req, res) => {
  try {
    const { data, error } = await sb.from("usuarios").select("count").limit(1);
    if (error) return res.status(500).json({ ok: false, error: error.message });
    res.json({ ok: true, supabase: "conectado" });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── Auth ───────────────────────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  const { nombre = "", email = "", password = "" } = req.body;
  if (!nombre.trim() || !/^\S+@\S+\.\S+$/.test(email) || password.length < 6)
    return res.status(400).json({ error: "Revise nombre, correo y contraseña (mín. 6 caracteres)." });
  const { data, error } = await sb
    .from("usuarios")
    .insert({ nombre: nombre.trim(), email: email.toLowerCase(), hash: bcrypt.hashSync(password, 10), rol: "vecino" })
    .select("id")
    .single();
  if (error) return res.status(409).json({ error: "Ese correo ya está registrado." });
  res.json(sign({ id: data.id, nombre: nombre.trim(), rol: "vecino" }));
});

router.post("/login", async (req, res) => {
  const { data: u } = await sb
    .from("usuarios")
    .select("*")
    .eq("email", (req.body.email || "").toLowerCase())
    .maybeSingle();
  if (!u || !bcrypt.compareSync(req.body.password || "", u.hash))
    return res.status(401).json({ error: "Correo o contraseña incorrectos." });
  res.json(sign(u));
});

// ── Foro ───────────────────────────────────────────────────────────────────────
router.get("/posts", async (_req, res) => {
  const { data: posts, error: pe } = await sb
    .from("publicaciones")
    .select("id, categoria, titulo, mensaje, creado, autor:usuarios!publicaciones_autor_id_fkey(nombre)")
    .order("id", { ascending: false });
  if (pe) return res.status(500).json({ error: pe.message });

  const ids = (posts || []).map(p => p.id);
  const { data: comments } = ids.length
    ? await sb
        .from("comentarios")
        .select("publicacion_id, texto, autor:usuarios!comentarios_autor_id_fkey(nombre)")
        .in("publicacion_id", ids)
        .order("id", { ascending: true })
    : { data: [] };

  res.json((posts || []).map(p => ({
    id:   p.id,
    cat:  p.categoria,
    t:    p.titulo,
    b:    p.mensaje,
    by:   p.autor?.nombre,
    when: new Date(p.creado).toLocaleString("es-CL", { timeZone: "America/Santiago", hour12: false }),
    cm:   (comments || []).filter(c => c.publicacion_id === p.id).map(c => ({ n: c.autor?.nombre, x: c.texto })),
  })));
});

router.post("/posts", auth("directiva"), async (req, res) => {
  const { categoria, titulo = "", mensaje = "" } = req.body;
  if (!CATS.includes(categoria) || !titulo.trim() || !mensaje.trim())
    return res.status(400).json({ error: "Complete categoría, título y mensaje." });
  const { error } = await sb.from("publicaciones")
    .insert({ categoria, titulo: titulo.trim(), mensaje: mensaje.trim(), autor_id: req.u.id });
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ ok: true });
});

router.post("/posts/:id/comments", auth(), async (req, res) => {
  const texto = (req.body.texto || "").trim();
  if (!texto) return res.status(400).json({ error: "Escriba un comentario." });
  const { error } = await sb.from("comentarios")
    .insert({ publicacion_id: Number(req.params.id), autor_id: req.u.id, texto });
  if (error) return res.status(404).json({ error: "La publicación no existe." });
  res.status(201).json({ ok: true });
});

// ── Reservas ───────────────────────────────────────────────────────────────────
const crearReserva = async (req, res, estado) => {
  const { fecha = "", hora = "", telefono = "", motivo = "" } = req.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora))
    return res.status(400).json({ error: "Fecha u hora inválida." });
  if (estado === "pendiente" && !telefono.trim())
    return res.status(400).json({ error: "Indique un teléfono de contacto." });
  const { error } = await sb.from("reservas")
    .insert({ usuario_id: req.u.id, fecha, hora, telefono: telefono.trim(), motivo: motivo.trim(), estado });
  if (error) return res.status(409).json({ error: "Ese horario ya fue solicitado u ocupado." });
  res.status(201).json({ ok: true });
};

router.get("/reservas", async (_req, res) => {
  const { data, error } = await sb.from("reservas").select("id,fecha,hora,estado").neq("estado", "rechazada");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post("/reservas",  auth(),            (req, res) => crearReserva(req, res, "pendiente"));
router.post("/bloqueos",  auth("directiva"), (req, res) => crearReserva(req, res, "bloqueada"));

router.get("/reservas/pendientes", auth("directiva"), async (_req, res) => {
  const { data, error } = await sb
    .from("reservas")
    .select("id, fecha, hora, telefono, motivo, usuarios!reservas_usuario_id_fkey(nombre)")
    .eq("estado", "pendiente")
    .order("fecha").order("hora");
  if (error) return res.status(500).json({ error: error.message });
  res.json((data || []).map(r => ({ ...r, nombre: r.usuarios?.nombre })));
});

router.patch("/reservas/:id", auth("directiva"), async (req, res) => {
  const { estado } = req.body;
  if (!["aprobada", "rechazada"].includes(estado))
    return res.status(400).json({ error: "Estado inválido." });
  const { data, error } = await sb
    .from("reservas")
    .update({ estado })
    .eq("id", req.params.id)
    .eq("estado", "pendiente")
    .select("id");
  if (error || !data?.length)
    return res.status(404).json({ error: "Solicitud no encontrada o ya resuelta." });
  res.json({ ok: true });
});

// Montar router tanto en /api como en / (para compatibilidad con Vercel)
app.use("/api", router);
app.use("/",    router);

export default app;
