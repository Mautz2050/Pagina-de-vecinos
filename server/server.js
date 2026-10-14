import express from "express";
import cors from "cors";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "cambie-esta-clave-en-produccion";
const CATS = ["seguridad", "eventos", "beneficios", "noticias"];

let db;
const initDB = async () => {
  db = await open({
    filename: process.env.DB_FILE || "junta.db",
    driver: sqlite3.Database
  });
  await db.exec("PRAGMA foreign_keys = ON");
  await db.exec(`
CREATE TABLE IF NOT EXISTS usuarios(id INTEGER PRIMARY KEY, nombre TEXT NOT NULL, email TEXT UNIQUE NOT NULL, hash TEXT NOT NULL, rol TEXT NOT NULL DEFAULT 'vecino');
CREATE TABLE IF NOT EXISTS publicaciones(id INTEGER PRIMARY KEY, categoria TEXT NOT NULL, titulo TEXT NOT NULL, mensaje TEXT NOT NULL, autor_id INTEGER NOT NULL REFERENCES usuarios(id), creado TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS comentarios(id INTEGER PRIMARY KEY, publicacion_id INTEGER NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE, autor_id INTEGER NOT NULL REFERENCES usuarios(id), texto TEXT NOT NULL, creado TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS reservas(id INTEGER PRIMARY KEY, usuario_id INTEGER REFERENCES usuarios(id), fecha TEXT NOT NULL, hora TEXT NOT NULL, telefono TEXT, motivo TEXT, estado TEXT NOT NULL CHECK(estado IN ('pendiente','aprobada','rechazada','bloqueada')));
CREATE UNIQUE INDEX IF NOT EXISTS uq_reserva_activa ON reservas(fecha,hora) WHERE estado IN ('pendiente','aprobada','bloqueada');
  `);
  const row = await db.get("SELECT 1 FROM usuarios WHERE rol='directiva'");
  if (!row) {
    await db.run("INSERT INTO usuarios(nombre,email,hash,rol) VALUES(?,?,?,'directiva')",
      "Directiva", "directiva@junta.cl", bcrypt.hashSync("directiva123", 10));
  }
};

const app = express();
app.use(cors());
app.use(express.json());

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

app.post("/api/register", async (q, r) => {
  const { nombre = "", email = "", password = "" } = q.body;
  if (!nombre.trim() || !/^\S+@\S+\.\S+$/.test(email) || password.length < 6)
    return r.status(400).json({ error: "Revise su nombre, correo y contraseña (mínimo 6 caracteres)." });
  try {
    const result = await db.run("INSERT INTO usuarios(nombre,email,hash) VALUES(?,?,?)",
      nombre.trim(), email.toLowerCase(), bcrypt.hashSync(password, 10));
    const id = result.lastID;
    r.json(sign({ id, nombre: nombre.trim(), rol: "vecino" }));
  } catch { r.status(409).json({ error: "Ese correo ya está registrado." }); }
});

app.post("/api/login", async (q, r) => {
  const u = await db.get("SELECT * FROM usuarios WHERE email=?", (q.body.email || "").toLowerCase());
  if (!u || !bcrypt.compareSync(q.body.password || "", u.hash))
    return r.status(401).json({ error: "Correo o contraseña incorrectos." });
  r.json(sign(u));
});

// Foro
app.get("/api/posts", async (_q, r) => {
  const ps = await db.all(`SELECT p.id, p.categoria cat, p.titulo t, p.mensaje b, u.nombre autor, p.creado
    FROM publicaciones p JOIN usuarios u ON u.id=p.autor_id ORDER BY p.id DESC`);
  for (let p of ps) {
    p.cm = await db.all(`SELECT u.nombre n, c.texto x FROM comentarios c JOIN usuarios u ON u.id=c.autor_id
      WHERE c.publicacion_id=? ORDER BY c.id`, p.id);
  }
  r.json(ps.map((p) => ({ id: p.id, cat: p.cat, t: p.t, b: p.b, by: p.autor, when: p.creado, cm: p.cm })));
});
app.post("/api/posts", auth("directiva"), async (q, r) => {
  const { categoria, titulo = "", mensaje = "" } = q.body;
  if (!CATS.includes(categoria) || !titulo.trim() || !mensaje.trim())
    return r.status(400).json({ error: "Complete categoría, título y mensaje." });
  await db.run("INSERT INTO publicaciones(categoria,titulo,mensaje,autor_id) VALUES(?,?,?,?)",
    categoria, titulo.trim(), mensaje.trim(), q.u.id);
  r.status(201).json({ ok: true });
});
app.post("/api/posts/:id/comments", auth(), async (q, r) => {
  const texto = (q.body.texto || "").trim();
  if (!texto) return r.status(400).json({ error: "Escriba un comentario." });
  try {
    const res = await db.run("INSERT INTO comentarios(publicacion_id,autor_id,texto) VALUES(?,?,?)", q.params.id, q.u.id, texto);
    if (res.changes === 0) throw new Error();
    r.status(201).json({ ok: true });
  } catch { r.status(404).json({ error: "La publicación no existe." }); }
});

// Arriendo de la sede social
const crear = async (q, r, estado) => {
  const { fecha = "", hora = "", telefono = "", motivo = "" } = q.body;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !/^\d{2}:\d{2}$/.test(hora))
    return r.status(400).json({ error: "Fecha u hora inválida." });
  if (estado === "pendiente" && !telefono.trim())
    return r.status(400).json({ error: "Indique un teléfono de contacto." });
  try {
    await db.run("INSERT INTO reservas(usuario_id,fecha,hora,telefono,motivo,estado) VALUES(?,?,?,?,?,?)",
      q.u.id, fecha, hora, telefono.trim(), motivo.trim(), estado);
    r.status(201).json({ ok: true });
  } catch { r.status(409).json({ error: "Ese horario ya fue solicitado u ocupado." }); }
};
app.get("/api/reservas", async (_q, r) =>
  r.json(await db.all("SELECT id,fecha,hora,estado FROM reservas WHERE estado!='rechazada'")));
app.post("/api/reservas", auth(), (q, r) => crear(q, r, "pendiente"));
app.post("/api/bloqueos", auth("directiva"), (q, r) => crear(q, r, "bloqueada"));
app.get("/api/reservas/pendientes", auth("directiva"), async (_q, r) =>
  r.json(await db.all(`SELECT r.id,r.fecha,r.hora,r.telefono,r.motivo,u.nombre FROM reservas r
    JOIN usuarios u ON u.id=r.usuario_id WHERE r.estado='pendiente' ORDER BY r.fecha,r.hora`)));
app.patch("/api/reservas/:id", auth("directiva"), async (q, r) => {
  const { estado } = q.body;
  if (!["aprobada", "rechazada"].includes(estado)) return r.status(400).json({ error: "Estado inválido." });
  const result = await db.run("UPDATE reservas SET estado=? WHERE id=? AND estado='pendiente'", estado, q.params.id);
  result.changes ? r.json({ ok: true }) : r.status(404).json({ error: "Solicitud no encontrada o ya resuelta." });
});

initDB().then(() => {
  app.listen(process.env.PORT || 3001, () => console.log("API lista en http://localhost:3001"));
});
