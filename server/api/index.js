import express from "express";
import cors from "cors";
import pkg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const { Pool } = pkg;

const SECRET = process.env.JWT_SECRET || "cambie-esta-clave-en-produccion";
const CATS = ["seguridad", "eventos", "beneficios", "noticias"];

// Pool de conexiones a Supabase / PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Helpers
const getOne = async (text, params = []) => {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
};
const getAll = async (text, params = []) => {
  const { rows } = await pool.query(text, params);
  return rows;
};
const run = async (text, params = []) => pool.query(text, params);

// Seed inicial: crea tablas e inserta usuario directiva si no existe
const initDB = async () => {
  await run(`
    CREATE TABLE IF NOT EXISTS usuarios(
      id    SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      email  TEXT UNIQUE NOT NULL,
      hash   TEXT NOT NULL,
      rol    TEXT NOT NULL DEFAULT 'vecino'
    );
    CREATE TABLE IF NOT EXISTS publicaciones(
      id         SERIAL PRIMARY KEY,
      categoria  TEXT NOT NULL,
      titulo     TEXT NOT NULL,
      mensaje    TEXT NOT NULL,
      autor_id   INTEGER NOT NULL REFERENCES usuarios(id),
      creado     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS comentarios(
      id              SERIAL PRIMARY KEY,
      publicacion_id  INTEGER NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
      autor_id        INTEGER NOT NULL REFERENCES usuarios(id),
      texto           TEXT NOT NULL,
      creado          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS reservas(
      id          SERIAL PRIMARY KEY,
      usuario_id  INTEGER REFERENCES usuarios(id),
      fecha       TEXT NOT NULL,
      hora        TEXT NOT NULL,
      telefono    TEXT,
      motivo      TEXT,
      estado      TEXT NOT NULL CHECK(estado IN ('pendiente','aprobada','rechazada','bloqueada'))
    );
  `);

  // Índice único para evitar reservas duplicadas en el mismo horario
  await run(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_reserva_activa
    ON reservas(fecha, hora)
    WHERE estado IN ('pendiente','aprobada','bloqueada');
  `);

  // Insertar directiva solo si no existe
  await run(
    `INSERT INTO usuarios(nombre, email, hash, rol)
     VALUES($1, $2, $3, 'directiva')
     ON CONFLICT (email) DO NOTHING`,
    ["Directiva", "directiva@junta.cl", bcrypt.hashSync("directiva123", 10)]
  );
};

// ── Express ───────────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

// Inicializa la DB en el primer arranque
let ready = false;
app.use(async (_req, _res, next) => {
  if (!ready) { await initDB(); ready = true; }
  next();
});

// ── Helpers de auth ───────────────────────────────────────────────────────────
const sign = (u) => ({
  token: jwt.sign({ id: u.id, nombre: u.nombre, rol: u.rol }, SECRET, { expiresIn: "7d" }),
  user: { nombre: u.nombre, rol: u.rol },
});
const auth = (rol) => (q, r, next) => {
  try { q.u = jwt.verify((q.headers.authorization || "").slice(7), SECRET); }
  catch { return r.status(401).json({ error: "Debe ingresar con su cuenta." }); }
  if (rol && q.u.rol !== rol) return r.status(403).json({ error: "Solo la directiva puede hacer esto." });
  next();
};

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post("/api/register", async (q, r) => {
  const { nombre = "", email = "", password = "" } = q.body;
  if (!nombre.trim() || !/^\S+@\S+\.\S+$/.test(email) || password.length < 6)
    return r.status(400).json({ error: "Revise su nombre, correo y contraseña (mínimo 6 caracteres)." });
  try {
    const { rows } = await run(
      "INSERT INTO usuarios(nombre, email, hash) VALUES($1,$2,$3) RETURNING id",
      [nombre.trim(), email.toLowerCase(), bcrypt.hashSync(password, 10)]
    );
    r.json(sign({ id: rows[0].id, nombre: nombre.trim(), rol: "vecino" }));
  } catch { r.status(409).json({ error: "Ese correo ya está registrado." }); }
});

app.post("/api/login", async (q, r) => {
  const u = await getOne("SELECT * FROM usuarios WHERE email=$1", [(q.body.email || "").toLowerCase()]);
  if (!u || !bcrypt.compareSync(q.body.password || "", u.hash))
    return r.status(401).json({ error: "Correo o contraseña incorrectos." });
  r.json(sign(u));
});

// ── Foro ──────────────────────────────────────────────────────────────────────
app.get("/api/posts", async (_q, r) => {
  const ps = await getAll(`
    SELECT p.id, p.categoria cat, p.titulo t, p.mensaje b, u.nombre autor,
           TO_CHAR(p.creado AT TIME ZONE 'America/Santiago', 'YYYY-MM-DD HH24:MI') creado
    FROM publicaciones p
    JOIN usuarios u ON u.id = p.autor_id
    ORDER BY p.id DESC`);
  for (const p of ps) {
    p.cm = await getAll(
      `SELECT u.nombre n, c.texto x
       FROM comentarios c JOIN usuarios u ON u.id = c.autor_id
       WHERE c.publicacion_id = $1 ORDER BY c.id`,
      [p.id]
    );
  }
  r.json(ps.map((p) => ({ id: p.id, cat: p.cat, t: p.t, b: p.b, by: p.autor, when: p.creado, cm: p.cm })));
});

app.post("/api/posts", auth("directiva"), async (q, r) => {
  const { categoria, titulo = "", mensaje = "" } = q.body;
  if (!CATS.includes(categoria) || !titulo.trim() || !mensaje.trim())
    return r.status(400).json({ error: "Complete categoría, título y mensaje." });
  await run(
    "INSERT INTO publicaciones(categoria, titulo, mensaje, autor_id) VALUES($1,$2,$3,$4)",
    [categoria, titulo.trim(), mensaje.trim(), q.u.id]
  );
  r.status(201).json({ ok: true });
});

app.post("/api/posts/:id/comments", auth(), async (q, r) => {
  const texto = (q.body.texto || "").trim();
  if (!texto) return r.status(400).json({ error: "Escriba un comentario." });
  try {
    const res = await run(
      "INSERT INTO comentarios(publicacion_id, autor_id, texto) VALUES($1,$2,$3)",
      [q.params.id, q.u.id, texto]
    );
    if (res.rowCount === 0) throw new Error();
    r.status(201).json({ ok: true });
  } catch { r.status(404).json({ error: "La publicación no existe." }); }
});

// ── Reservas ──────────────────────────────────────────────────────────────────
const crear = async (q, r, estado) => {
  const { fecha = "", hora = "", telefono = "", motivo = "" } = q.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora))
    return r.status(400).json({ error: "Fecha u hora inválida." });
  if (estado === "pendiente" && !telefono.trim())
    return r.status(400).json({ error: "Indique un teléfono de contacto." });
  try {
    await run(
      "INSERT INTO reservas(usuario_id, fecha, hora, telefono, motivo, estado) VALUES($1,$2,$3,$4,$5,$6)",
      [q.u.id, fecha, hora, telefono.trim(), motivo.trim(), estado]
    );
    r.status(201).json({ ok: true });
  } catch { r.status(409).json({ error: "Ese horario ya fue solicitado u ocupado." }); }
};

app.get("/api/reservas", async (_q, r) =>
  r.json(await getAll("SELECT id, fecha, hora, estado FROM reservas WHERE estado != 'rechazada'")));

app.post("/api/reservas",  auth(),             (q, r) => crear(q, r, "pendiente"));
app.post("/api/bloqueos",  auth("directiva"),  (q, r) => crear(q, r, "bloqueada"));

app.get("/api/reservas/pendientes", auth("directiva"), async (_q, r) =>
  r.json(await getAll(`
    SELECT r.id, r.fecha, r.hora, r.telefono, r.motivo, u.nombre
    FROM reservas r JOIN usuarios u ON u.id = r.usuario_id
    WHERE r.estado = 'pendiente'
    ORDER BY r.fecha, r.hora`)));

app.patch("/api/reservas/:id", auth("directiva"), async (q, r) => {
  const { estado } = q.body;
  if (!["aprobada", "rechazada"].includes(estado))
    return r.status(400).json({ error: "Estado inválido." });
  const res = await run(
    "UPDATE reservas SET estado=$1 WHERE id=$2 AND estado='pendiente'",
    [estado, q.params.id]
  );
  res.rowCount ? r.json({ ok: true }) : r.status(404).json({ error: "Solicitud no encontrada o ya resuelta." });
});

// Exportar para Vercel (sin app.listen)
export default app;
