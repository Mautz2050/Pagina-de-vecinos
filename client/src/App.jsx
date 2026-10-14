import { useState, useEffect, useCallback } from "react";
import { api, setToken } from "./api";

const CATS = {
  seguridad: ["Seguridad", "--c-seg"],
  eventos: ["Eventos", "--c-eve"],
  beneficios: ["Beneficios", "--c-ben"],
  noticias: ["Noticias generales", "--c-not"],
};
const DAYS = ["Vie 2 oct", "Sáb 3 oct", "Dom 4 oct"];
const ISO = ["2026-10-02", "2026-10-03", "2026-10-04"];
const HOURS = ["10:00", "11:00", "12:00", "17:00", "18:00"];
const LABEL = { free: "Libre", busy: "Ocupado", block: "Bloqueado", pend: "Pendiente" };
const ST = { pendiente: "pend", aprobada: "busy", bloqueada: "block" };

const toSlots = (rs) => {
  const s = {};
  DAYS.forEach((_, j) => HOURS.forEach((_, i) => (s[`${j}-${i}`] = "free")));
  rs.forEach((r) => {
    const k = `${ISO.indexOf(r.fecha)}-${HOURS.indexOf(r.hora)}`;
    if (k in s) s[k] = ST[r.estado];
  });
  return s;
};

function Login({ onAuth, notify }) {
  const [reg, setReg] = useState(false);
  const [f, setF] = useState({ nombre: "", email: "", password: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = () => (reg ? api.register(f) : api.login(f)).then(onAuth).catch((e) => notify(e.message));
  return (
    <>
      <h1>{reg ? "Crear cuenta" : "Ingresar"}</h1>
      <div className="card">
        {reg && (<><label htmlFor="ln">Nombre completo</label><input id="ln" value={f.nombre} onChange={set("nombre")} /></>)}
        <label htmlFor="le">Correo</label>
        <input id="le" type="email" autoComplete="email" value={f.email} onChange={set("email")} />
        <label htmlFor="lp">Contraseña</label>
        <input id="lp" type="password" autoComplete={reg ? "new-password" : "current-password"} value={f.password} onChange={set("password")} />
        <button className="btn" onClick={submit}>{reg ? "Crear cuenta" : "Ingresar"}</button>{" "}
        <button className="btn alt" onClick={() => setReg(!reg)}>{reg ? "Ya tengo cuenta" : "Crear cuenta nueva"}</button>
      </div>
    </>
  );
}

function Foro({ posts, admin, user, reload, notify, goLogin }) {
  const [filter, setFilter] = useState("todas");
  const [open, setOpen] = useState(null);
  const [composer, setComposer] = useState(false);
  const [np, setNp] = useState({ t: "", cat: "seguridad", b: "" });
  const [cm, setCm] = useState("");

  const publish = () => {
    if (!np.t.trim() || !np.b.trim()) return notify("Escriba un título y un mensaje.");
    api.newPost({ categoria: np.cat, titulo: np.t, mensaje: np.b })
      .then(() => { setNp({ t: "", cat: "seguridad", b: "" }); setComposer(false); notify("Aviso publicado."); return reload(); })
      .catch((e) => notify(e.message));
  };
  const comment = (id) => {
    if (!cm.trim()) return notify("Escriba un comentario.");
    api.comment(id, { texto: cm })
      .then(() => { setCm(""); return reload(); })
      .catch((e) => notify(e.message));
  };

  return (
    <>
      <div className="bar">
        <h1>Foro de noticias</h1>
        {admin && <button className="btn alt" onClick={() => setComposer(!composer)}>+ Nuevo aviso</button>}
      </div>

      {composer && admin && (
        <div className="card">
          <label htmlFor="pt">Título</label>
          <input id="pt" value={np.t} onChange={(e) => setNp({ ...np, t: e.target.value })} />
          <label htmlFor="pc">Categoría</label>
          <select id="pc" value={np.cat} onChange={(e) => setNp({ ...np, cat: e.target.value })}>
            {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v[0]}</option>)}
          </select>
          <label htmlFor="pb">Mensaje</label>
          <textarea id="pb" rows={3} value={np.b} onChange={(e) => setNp({ ...np, b: e.target.value })} />
          <button className="btn" onClick={publish}>Publicar aviso</button>
        </div>
      )}

      <div className="chips">
        {["todas", ...Object.keys(CATS)].map((k) => (
          <button key={k} className={"chip" + (filter === k ? " on" : "")} aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {k === "todas" ? "Todas" : CATS[k][0]}
          </button>
        ))}
      </div>

      {posts.filter((p) => filter === "todas" || p.cat === filter).map((p) => (
        <article className="card" key={p.id}>
          <div className="row">
            <span className="tag" style={{ background: `var(${CATS[p.cat][1]})` }}>{CATS[p.cat][0]}</span>
            <span className="meta">{p.when}</span>
          </div>
          <h2>{p.t}</h2>
          <div>{p.b}</div>
          <div className="meta" style={{ marginTop: 8 }}>
            <span>{p.by}</span>
            <button className="btn alt sm" aria-expanded={open === p.id} onClick={() => setOpen(open === p.id ? null : p.id)}>
              💬 {p.cm.length} comentarios
            </button>
          </div>
          {open === p.id && (
            <div className="comments">
              {p.cm.length === 0 && <p className="meta">Aún no hay comentarios. ¡Sea el primero!</p>}
              {p.cm.map((c, i) => <div className="cm" key={i}><b>{c.n}</b><div>{c.x}</div></div>)}
              {user ? (
                <>
                  <label htmlFor="cx">Su comentario</label>
                  <textarea id="cx" rows={2} value={cm} onChange={(e) => setCm(e.target.value)} />
                  <button className="btn" onClick={() => comment(p.id)}>Enviar comentario</button>
                </>
              ) : (
                <p className="note">Para comentar, <button className="chip" onClick={goLogin}>ingrese a su cuenta</button></p>
              )}
            </div>
          )}
        </article>
      ))}
    </>
  );
}

function Arriendo({ slots, user, admin, reload, notify, goLogin }) {
  const [pick, setPick] = useState(null);
  const [f, setF] = useState({ tel: "", u: "" });
  const [pj, pi] = pick ? pick.split("-") : [];

  const onPick = (k) => {
    if (user) return setPick(k);
    notify("Ingrese a su cuenta para solicitar un horario.");
    goLogin();
  };
  const send = () => {
    if (!f.tel.trim()) return notify("Escriba un teléfono de contacto.");
    api.reservar({ fecha: ISO[pj], hora: HOURS[pi], telefono: f.tel, motivo: f.u || "Sin indicar" })
      .then(() => { setPick(null); setF({ tel: "", u: "" }); notify("Solicitud enviada. Un encargado la revisará."); })
      .catch((e) => notify(e.message))
      .finally(reload);
  };
  const block = () => {
    api.bloquear({ fecha: ISO[pj], hora: HOURS[pi], motivo: f.u || "Bloqueado por la directiva" })
      .then(() => { setPick(null); setF({ tel: "", u: "" }); notify("Horario bloqueado."); })
      .catch((e) => notify(e.message))
      .finally(reload);
  };

  return (
    <>
      <h1>Arriendo de la sede social</h1>
      <p className="note">Las solicitudes las revisa un encargado de la junta antes de confirmarse.</p>
      <div className="card">
        <div className="scroll">
          <div className="grid">
            <span />
            {DAYS.map((d) => <span className="h" key={d}>{d}</span>)}
            {HOURS.map((hr, i) => <Row key={hr} hr={hr} i={i} slots={slots} onPick={onPick} />)}
          </div>
        </div>
        <div className="legend">
          <span><i className="dot" style={{ background: "var(--free)" }} />Disponible</span>
          <span><i className="dot" style={{ background: "var(--pend)" }} />Pendiente de validación</span>
          <span><i className="dot" style={{ background: "var(--busy)" }} />Reservado</span>
          <span><i className="dot" style={{ background: "var(--block)" }} />Bloqueado</span>
        </div>
      </div>

      {pick && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Solicitar {DAYS[pj]} a las {HOURS[pi]}</h2>
          <p className="meta">A nombre de {user.nombre}</p>
          <label htmlFor="rt">Teléfono de contacto</label>
          <input id="rt" inputMode="tel" value={f.tel} onChange={(e) => setF({ ...f, tel: e.target.value })} />
          <label htmlFor="ru">Motivo (cumpleaños, reunión, etc.)</label>
          <input id="ru" value={f.u} onChange={(e) => setF({ ...f, u: e.target.value })} />
          <button className="btn" onClick={send}>Enviar solicitud</button>{" "}
          <button className="btn alt" onClick={() => setPick(null)}>Cancelar</button>
          {admin && (
            <div style={{ marginTop: 12 }}>
              <p className="meta">Como directiva, también puede dejar este horario fuera de arriendo (mantención, uso de la junta).</p>
              <button className="btn alt" onClick={block}>Bloquear horario</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function Row({ hr, i, slots, onPick }) {
  return (
    <>
      <span className="meta">{hr}</span>
      {DAYS.map((d, j) => {
        const k = `${j}-${i}`, s = slots[k];
        return (
          <button key={k} className={"slot " + s} aria-label={`${d} ${hr}: ${LABEL[s]}`}
            aria-disabled={s !== "free"} onClick={() => s === "free" && onPick(k)}>
            {LABEL[s]}
          </button>
        );
      })}
    </>
  );
}

function Directiva({ admin, pend, reload, notify }) {
  if (!admin)
    return (<><h1>Directiva</h1><div className="card">Esta sección es solo para la directiva. Ingrese con una cuenta de directiva.</div></>);
  const decide = (r, ok) =>
    api.decidir(r.id, ok ? "aprobada" : "rechazada")
      .then(() => { notify(ok ? "Reserva aprobada." : "Solicitud rechazada; horario liberado."); return reload(); })
      .catch((e) => notify(e.message));
  return (
    <>
      <h1>Solicitudes de arriendo</h1>
      {pend.length === 0 && <div className="card meta">No hay solicitudes pendientes.</div>}
      {pend.map((r) => (
        <div className="card" key={r.id}>
          <b>{r.nombre}</b> · {r.telefono}
          <div>{DAYS[ISO.indexOf(r.fecha)] || r.fecha}, {r.hora} hrs</div>
          <div className="meta">Motivo: {r.motivo}</div>
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={() => decide(r, true)}>Aprobar</button>
            <button className="btn alt" onClick={() => decide(r, false)}>Rechazar</button>
          </div>
        </div>
      ))}
    </>
  );
}

export default function App() {
  const [view, setView] = useState("foro");
  const [big, setBig] = useState(false);
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem("user")); } catch { return null; } });
  const [posts, setPosts] = useState([]);
  const [slots, setSlots] = useState(toSlots([]));
  const [pend, setPend] = useState([]);
  const [toast, setToast] = useState("");
  const admin = user?.rol === "directiva";
  const notify = (m) => { setToast(m); setTimeout(() => setToast(""), 3500); };

  const reload = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([api.posts(), api.reservas()]);
      setPosts(p);
      setSlots(toSlots(r));
      setPend(admin ? await api.pendientes() : []);
    } catch (e) {
      setToast(e.message === "Debe ingresar con su cuenta." ? "Su sesión venció. Ingrese nuevamente." : "No se pudo conectar con el servidor.");
    }
  }, [admin]);
  useEffect(() => { reload(); }, [reload]);

  const onAuth = ({ token, user }) => {
    setToken(token);
    localStorage.setItem("user", JSON.stringify(user));
    setUser(user);
    setView("foro");
    notify(`Bienvenido/a, ${user.nombre}.`);
  };
  const logout = () => { setToken(null); localStorage.removeItem("user"); setUser(null); setView("foro"); };
  const goLogin = () => setView("login");

  return (
    <div className="app" style={{ "--fs": big ? "22px" : "18px" }}>
      <style>{CSS}</style>
      <div className="wrap">
        <header className="top">
          <span className="brand">🏠 Junta de Vecinos René Schneider</span>
          <nav aria-label="Secciones">
            {[["foro", "Foro"], ["arriendo", "Arriendo de sede"], ["directiva", "Directiva"]].map(([k, l]) => (
              <button key={k} aria-current={view === k ? "page" : undefined} onClick={() => setView(k)}>{l}</button>
            ))}
          </nav>
          <div className="tools">
            <button className="chip" onClick={() => setBig(!big)}>{big ? "A− Letra normal" : "A+ Letra grande"}</button>
            {user
              ? <button className="chip" onClick={logout}>Salir ({user.nombre})</button>
              : <button className="chip" onClick={goLogin}>Ingresar</button>}
          </div>
        </header>
        <main>
          {view === "login" && <Login onAuth={onAuth} notify={notify} />}
          {view === "foro" && <Foro posts={posts} admin={admin} user={user} reload={reload} notify={notify} goLogin={goLogin} />}
          {view === "arriendo" && <Arriendo slots={slots} user={user} admin={admin} reload={reload} notify={notify} goLogin={goLogin} />}
          {view === "directiva" && <Directiva admin={admin} pend={pend} reload={reload} notify={notify} />}
        </main>
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

const CSS = `
.app{--bg:#f2f4f3;--card:#fff;--ink:#1c2725;--mute:#5b6866;--line:#d9dfdd;--acc:#1f4e79;--accink:#fff;
--free:#cfe8b5;--busy:#f5c4c4;--block:#f7cf86;--pend:#c9dcf3;--freeink:#2d4a12;--busyink:#7a1f1f;--blockink:#6b4300;--pendink:#12365c;
--c-seg:#f5c4c4;--c-eve:#c9dcf3;--c-ben:#cfe8b5;--c-not:#e6dcf3;
background:var(--bg);color:var(--ink);min-height:100vh;font-size:var(--fs);line-height:1.5;font-family:"Atkinson Hyperlegible",Verdana,system-ui,sans-serif}
@media (prefers-color-scheme:dark){.app{--bg:#121917;--card:#1b2422;--ink:#e9efed;--mute:#9fb0ac;--line:#33413e;--acc:#8ab8e6;--accink:#0c1a26;
--free:#2f4a1c;--busy:#5a2a2a;--block:#5c4212;--pend:#1f3a58;--freeink:#dff0cc;--busyink:#f6d3d3;--blockink:#f8e0b0;--pendink:#d3e4f8;
--c-seg:#5a2a2a;--c-eve:#1f3a58;--c-ben:#2f4a1c;--c-not:#40325a}}
.app *{box-sizing:border-box}
.app button,.app select,.app input,.app textarea{font:inherit;color:inherit}
.app :focus-visible{outline:3px solid var(--acc);outline-offset:2px}
.wrap{max-width:820px;margin:0 auto;padding:16px}
.top{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 16px;display:flex;flex-wrap:wrap;gap:10px 20px;align-items:center;justify-content:space-between}
.brand{font-weight:700;font-size:1.1rem}
nav{display:flex;gap:6px;flex-wrap:wrap}
nav button{background:none;border:0;border-bottom:3px solid transparent;padding:8px 10px;cursor:pointer;color:var(--mute);font-weight:700}
nav button[aria-current="page"]{color:var(--ink);border-color:var(--acc)}
.tools{display:flex;gap:8px}
.btn{background:var(--acc);color:var(--accink);border:0;border-radius:10px;padding:12px 18px;font-weight:700;cursor:pointer;min-height:48px}
.btn.alt{background:var(--card);color:var(--ink);border:1.5px solid var(--line)}
.btn.sm{padding:6px 12px;min-height:40px}
.chip{border:1.5px solid var(--line);background:var(--card);border-radius:20px;padding:6px 14px;cursor:pointer;font-weight:700}
.chip.on{border-color:var(--acc)}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
h1{font-size:1.5rem;margin:22px 0 12px}
.bar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;margin-bottom:12px}
.tag{display:inline-block;padding:2px 12px;border-radius:8px;font-weight:700;font-size:.85rem}
.meta{color:var(--mute);font-size:.9rem;display:flex;gap:14px;flex-wrap:wrap;align-items:center}
.card h2{margin:6px 0 4px;font-size:1.15rem}
.row{display:flex;justify-content:space-between;gap:10px}
.comments{border-top:1px solid var(--line);margin-top:12px;padding-top:10px}
.cm{padding:8px 0;border-bottom:1px dashed var(--line)}
.app input,.app textarea,.app select{width:100%;padding:10px 12px;border:1.5px solid var(--line);border-radius:10px;background:var(--card);margin:4px 0 10px}
.app label{font-weight:700;font-size:.95rem}
.grid{display:grid;grid-template-columns:64px repeat(3,1fr);gap:8px;align-items:center;min-width:480px}
.scroll{overflow-x:auto}
.grid .h{text-align:center;font-weight:700}
.slot{border:0;border-radius:10px;padding:12px 4px;font-weight:700;min-height:48px;cursor:pointer}
.slot.free{background:var(--free);color:var(--freeink)}
.slot.busy{background:var(--busy);color:var(--busyink);cursor:not-allowed}
.slot.block{background:var(--block);color:var(--blockink);cursor:not-allowed}
.slot.pend{background:var(--pend);color:var(--pendink);cursor:not-allowed}
.legend{display:flex;gap:16px;flex-wrap:wrap;margin-top:14px;font-size:.9rem;color:var(--mute)}
.dot{display:inline-block;width:12px;height:12px;border-radius:4px;margin-right:6px}
.note{background:var(--pend);color:var(--pendink);border-radius:10px;padding:10px 14px;margin:0 0 12px}
.toast{position:fixed;left:50%;transform:translateX(-50%);bottom:20px;background:var(--ink);color:var(--bg);padding:12px 20px;border-radius:12px;font-weight:700;max-width:90%}
`;
