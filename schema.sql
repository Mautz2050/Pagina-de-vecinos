-- ============================================================
-- SCHEMA para Junta de Vecinos - Supabase SQL Editor
-- Ejecutar UNA SOLA VEZ en: Supabase → SQL Editor → New Query
-- ============================================================

CREATE TABLE IF NOT EXISTS usuarios (
  id     SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  email  TEXT UNIQUE NOT NULL,
  hash   TEXT NOT NULL,
  rol    TEXT NOT NULL DEFAULT 'vecino'
);

CREATE TABLE IF NOT EXISTS publicaciones (
  id        SERIAL PRIMARY KEY,
  categoria TEXT NOT NULL,
  titulo    TEXT NOT NULL,
  mensaje   TEXT NOT NULL,
  autor_id  INTEGER NOT NULL REFERENCES usuarios(id),
  creado    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comentarios (
  id             SERIAL PRIMARY KEY,
  publicacion_id INTEGER NOT NULL REFERENCES publicaciones(id) ON DELETE CASCADE,
  autor_id       INTEGER NOT NULL REFERENCES usuarios(id),
  texto          TEXT NOT NULL,
  creado         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reservas (
  id         SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  fecha      TEXT NOT NULL,
  hora       TEXT NOT NULL,
  telefono   TEXT,
  motivo     TEXT,
  estado     TEXT NOT NULL CHECK(estado IN ('pendiente','aprobada','rechazada','bloqueada'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reserva_activa
  ON reservas(fecha, hora)
  WHERE estado IN ('pendiente','aprobada','bloqueada');

-- Desactivar RLS (el servidor maneja su propia autenticación con JWT)
ALTER TABLE usuarios      DISABLE ROW LEVEL SECURITY;
ALTER TABLE publicaciones DISABLE ROW LEVEL SECURITY;
ALTER TABLE comentarios   DISABLE ROW LEVEL SECURITY;
ALTER TABLE reservas      DISABLE ROW LEVEL SECURITY;
