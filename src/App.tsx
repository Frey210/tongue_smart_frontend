import { useEffect, useState, type FormEvent } from "react";

type Screen = "dashboard" | "subjects" | "monitoring" | "devices" | "users";
type Role = "admin" | "operator" | "researcher";
type User = { id: string; email: string; full_name: string; role: Role; is_active: boolean };
type RegistrationRequest = { id: string; email: string; full_name: string; institution: string; status: string; created_at: string };
type Subject = { id: string; subject_code: string; initials: string; research_group: string; year_of_birth: number | null; consent_status: "pending" | "granted" | "withdrawn"; notes: string; is_active: boolean; created_at: string };
type AuthSession = { access_token: string; refresh_token: string; expires_in: number; user: User };
type Device = {
  device_id: string;
  firmware_version: string;
  connection: string;
  transport: string[];
  emg_channels: number;
  tongue_pressure_channels: number;
  lip_force: boolean;
  motorized_traction: boolean;
  wifi_portal: boolean;
  mqtt: boolean;
  last_seen_at: string | null;
};
type Summary = {
  device_status: string;
  pending_sync: number;
  completed_sessions: number;
  last_calibration: string | null;
  subject_count: number;
};

const API = import.meta.env.VITE_API_URL ?? "/api/v1";
const AUTH_KEY = "tongue-smart-auth";

const fallbackDevice: Device = {
  device_id: "tongue-smart-v3",
  firmware_version: "0.2.0",
  connection: "offline",
  transport: ["usb_serial", "http", "https"],
  emg_channels: 1,
  tongue_pressure_channels: 1,
  lip_force: true,
  motorized_traction: true,
  wifi_portal: true,
  mqtt: false,
  last_seen_at: null,
};

function Icon({ name }: { name: Screen }) {
  const paths = {
    dashboard: "M4 5h6v6H4zM14 5h6v10h-6zM4 15h6v4H4zM14 19h6",
    subjects: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11A3.5 3.5 0 1 0 9.5 4a3.5 3.5 0 0 0 0 7Z",
    monitoring: "M3 13h4l2-7 4 12 3-9 2 4h3",
    devices: "M7 4h10a2 2 0 0 1 2 2v12H5V6a2 2 0 0 1 2-2Zm3 5h4v4h-4z",
    users: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11A3.5 3.5 0 1 0 9.5 4a3.5 3.5 0 0 0 0 7ZM17 11a3 3 0 0 0 0-6M19 14a4 4 0 0 1 3 4",
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d={paths[name]} /></svg>;
}

function Status({ online }: { online: boolean }) {
  return <span className={`status ${online ? "online" : "offline"}`}><i />{online ? "Terhubung" : "Offline"}</span>;
}

export function App() {
  const [auth, setAuth] = useState<AuthSession | null>(() => {
    const saved = sessionStorage.getItem(AUTH_KEY);
    return saved ? JSON.parse(saved) as AuthSession : null;
  });
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [device, setDevice] = useState<Device>(fallbackDevice);
  const [summary, setSummary] = useState<Summary>({ device_status: "offline", pending_sync: 0, completed_sessions: 0, subject_count: 0, last_calibration: null });
  const [apiOnline, setApiOnline] = useState(false);

  const saveAuth = (session: AuthSession | null) => {
    setAuth(session);
    if (session) sessionStorage.setItem(AUTH_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(AUTH_KEY);
  };

  const logout = async () => {
    if (auth) await fetch(`${API}/auth/logout`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: auth.refresh_token }),
    }).catch(() => undefined);
    saveAuth(null);
  };

  useEffect(() => {
    if (!auth) return;
    let active = true;
    const refresh = () => Promise.all([
      fetch(`${API}/devices/current`, { headers: { Authorization: `Bearer ${auth.access_token}` } }).then((r) => {
        if (r.status === 401) { saveAuth(null); throw new Error("session expired"); }
        if (!r.ok) throw new Error("device request failed");
        return r.json() as Promise<Device>;
      }),
      fetch(`${API}/dashboard/summary`, { headers: { Authorization: `Bearer ${auth.access_token}` } }).then((r) => {
        if (r.status === 401) { saveAuth(null); throw new Error("session expired"); }
        if (!r.ok) throw new Error("summary request failed");
        return r.json() as Promise<Summary>;
      }),
    ]).then(([nextDevice, nextSummary]) => {
      if (!active) return;
      setDevice(nextDevice);
      setSummary(nextSummary);
      setApiOnline(true);
    }).catch(() => {
      if (active) setApiOnline(false);
    });
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [auth]);

  if (!auth) return <Login onAuthenticated={saveAuth} />;

  const screens: { id: Screen; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "subjects", label: "Subjek" },
    { id: "monitoring", label: "Monitoring" },
    { id: "devices", label: "Perangkat" },
    ...(auth.user.role === "admin" ? [{ id: "users" as Screen, label: "Pengguna" }] : []),
  ];

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Lewati ke konten utama</a>
      <aside>
        <div className="brand-mark"><span>TS</span><div>Tongue Smart<small>Research Dashboard</small></div></div>
        <nav aria-label="Navigasi utama">
          {screens.map(({ id, label }) => (
            <button key={id} className={screen === id ? "active" : ""} onClick={() => setScreen(id)} aria-current={screen === id ? "page" : undefined}>
              <Icon name={id} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="scope-note"><strong>{auth.user.full_name}</strong><span>{auth.user.role} · {auth.user.email}</span><button className="text-button" onClick={logout}>Keluar</button></div>
      </aside>

      <main id="main" tabIndex={-1}>
        <header>
          <div><p className="eyebrow">TONGUE SMART v3</p><h1>{screens.find((item) => item.id === screen)?.label}</h1></div>
          <Status online={apiOnline} />
        </header>

        {screen === "dashboard" && <Dashboard device={device} summary={summary} apiOnline={apiOnline} onOpenDevice={() => setScreen("devices")} />}
        {screen === "subjects" && <Subjects accessToken={auth.access_token} role={auth.user.role} onUnauthorized={() => saveAuth(null)} />}
        {screen === "monitoring" && <Monitoring device={device} />}
        {screen === "devices" && <Devices device={device} apiOnline={apiOnline} />}
        {screen === "users" && auth.user.role === "admin" && <Users accessToken={auth.access_token} onUnauthorized={() => saveAuth(null)} />}
      </main>
    </div>
  );
}

function Login({ onAuthenticated }: { onAuthenticated: (session: AuthSession) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [institution, setInstitution] = useState("FKG — Departemen Kedokteran Gigi Anak");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setSuccess(""); setLoading(true);
    try {
      const response = await fetch(`${API}/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mode === "login" ? { email, password } : { full_name: fullName, email, password, institution }),
      });
      if (!response.ok) { const body = await response.json().catch(() => ({})) as { detail?: string }; throw new Error(body.detail ?? "Permintaan tidak dapat diproses."); }
      if (mode === "login") onAuthenticated(await response.json() as AuthSession);
      else { setSuccess("Pendaftaran berhasil dikirim. Admin akan meninjau akun Anda sebelum akun dapat digunakan."); setFullName(""); setEmail(""); setPassword(""); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Permintaan gagal. Coba kembali."); }
    finally { setLoading(false); }
  };

  const switchMode = (next: "login" | "register") => { setMode(next); setError(""); setSuccess(""); };

  return <main className="auth-layout">
    <section className="auth-story" aria-label="Tongue Smart Research Dashboard">
      <div className="auth-brand"><span className="auth-logo">⊕</span><div><strong>Tongue Smart</strong><small>RESEARCH PLATFORM</small></div></div>
      <div className="auth-message"><h1>Tongue Smart Research<br />Dashboard</h1><p>Pemantauan terintegrasi aktivitas otot orofasial, tekanan lidah, dan gaya bibir.</p><div className="sensor-tags"><span>sEMG · µV</span><span>Tekanan Lidah · kPa</span><span>Gaya Bibir · N</span></div></div>
      <footer>Fakultas Kedokteran Gigi · Laboratorium Biomedik<br />Tongue Smart MVP v0.9.2 · 2026</footer>
    </section>
    <section className="auth-form-side"><div className="auth-form-wrap">
      <p className="prototype-pill"><i /> Prototipe Riset — Bukan untuk Diagnosis Klinis Mandiri</p>
      <div className="auth-tabs" role="tablist" aria-label="Pilihan akses akun"><button type="button" role="tab" aria-selected={mode === "login"} onClick={() => switchMode("login")}>Masuk</button><button type="button" role="tab" aria-selected={mode === "register"} onClick={() => switchMode("register")}>Daftar akun</button></div>
      <h2 id="auth-title">{mode === "login" ? "Masuk ke Dashboard" : "Daftar akun penelitian"}</h2>
      <p className="auth-description">{mode === "login" ? "Gunakan akun institusi yang terdaftar pada studi." : "Kirim data akun untuk ditinjau dan disetujui oleh admin."}</p>
      <form onSubmit={submit} aria-labelledby="auth-title">
        {mode === "register" && <><label htmlFor="full-name">Nama Lengkap</label><input id="full-name" autoComplete="name" minLength={2} required value={fullName} onChange={(event) => setFullName(event.target.value)} /></>}
        <label htmlFor="email">Email atau Nama Pengguna</label><input id="email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} />
        <label htmlFor="password">Kata Sandi</label><input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={10} required value={password} onChange={(event) => setPassword(event.target.value)} />
        {mode === "register" && <><label htmlFor="institution">Institusi</label><select id="institution" value={institution} onChange={(event) => setInstitution(event.target.value)}><option>FKG — Departemen Kedokteran Gigi Anak</option><option>Laboratorium Biomedik</option><option>Institusi mitra penelitian</option></select></>}
        {error && <p className="form-error" role="alert">{error}</p>}{success && <p className="form-success" role="status">{success}</p>}
        <button className="primary auth-submit" type="submit" disabled={loading}>{loading ? "Memproses…" : mode === "login" ? "Masuk" : "Kirim pendaftaran"}</button>
      </form>
      <p className="research-disclaimer">Sistem ini merekam, menyusun, menampilkan, dan mengekspor data sensor untuk keperluan penelitian. Sistem tidak melakukan klasifikasi maloklusi, diagnosis, maupun rekomendasi perawatan.</p>
    </div></section>
  </main>;
}

function Subjects({ accessToken, role, onUnauthorized }: { accessToken: string; role: Role; onUnauthorized: () => void }) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ subject_code: "", initials: "", research_group: "", year_of_birth: "", consent_status: "pending" as Subject["consent_status"], notes: "" });

  const loadSubjects = async () => {
    try {
      const params = new URLSearchParams(); if (search) params.set("search", search); if (filter) params.set("consent_status", filter);
      const response = await fetch(`${API}/subjects?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (response.status === 401) { onUnauthorized(); throw new Error("Sesi berakhir. Silakan masuk kembali."); }
      if (!response.ok) throw new Error("Daftar subjek tidak dapat dimuat.");
      setSubjects(await response.json() as Subject[]); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Terjadi kesalahan."); }
  };

  useEffect(() => { const timer = window.setTimeout(loadSubjects, 250); return () => window.clearTimeout(timer); }, [accessToken, search, filter]);

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const response = await fetch(`${API}/subjects`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ ...form, year_of_birth: form.year_of_birth ? Number(form.year_of_birth) : null }) });
      if (!response.ok) { const body = await response.json() as { detail?: string }; throw new Error(body.detail ?? "Subjek tidak dapat disimpan."); }
      setForm({ subject_code: "", initials: "", research_group: "", year_of_birth: "", consent_status: "pending", notes: "" }); await loadSubjects();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Terjadi kesalahan."); }
    finally { setSaving(false); }
  };

  const canEdit = role !== "researcher";
  return <>
    <section className="page-intro"><div><p className="eyebrow">RESEARCH SUBJECTS</p><h2>Subjek penelitian terkode</h2><p>Gunakan kode riset. Jangan masukkan nama lengkap atau identitas langsung pasien.</p></div><span className="subject-total">{subjects.length} subjek</span></section>
    <section className="subject-toolbar" aria-label="Filter subjek"><input aria-label="Cari subjek" placeholder="Cari kode, inisial, atau kelompok…" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Filter consent" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="">Semua status consent</option><option value="pending">Menunggu</option><option value="granted">Disetujui</option><option value="withdrawn">Ditarik</option></select></section>
    {error && <p className="form-error" role="alert">{error}</p>}
    <section className={`subject-layout ${canEdit ? "" : "read-only"}`}>
      {canEdit && <article className="panel"><p className="eyebrow">SUBJEK BARU</p><h3>Daftarkan subjek</h3><form className="stack-form" onSubmit={submit}>
        <label htmlFor="subject-code">Kode subjek</label><input id="subject-code" required pattern="[A-Za-z0-9_-]+" placeholder="TS-2026-001" value={form.subject_code} onChange={(event) => setForm({ ...form, subject_code: event.target.value })} />
        <div className="form-row"><div><label htmlFor="initials">Inisial</label><input id="initials" required maxLength={12} placeholder="AN" value={form.initials} onChange={(event) => setForm({ ...form, initials: event.target.value })} /></div><div><label htmlFor="birth-year">Tahun lahir</label><input id="birth-year" type="number" min="1900" max={new Date().getFullYear()} placeholder="2015" value={form.year_of_birth} onChange={(event) => setForm({ ...form, year_of_birth: event.target.value })} /></div></div>
        <label htmlFor="research-group">Kelompok penelitian</label><input id="research-group" required placeholder="Kelompok kontrol" value={form.research_group} onChange={(event) => setForm({ ...form, research_group: event.target.value })} />
        <label htmlFor="consent-status">Status consent</label><select id="consent-status" value={form.consent_status} onChange={(event) => setForm({ ...form, consent_status: event.target.value as Subject["consent_status"] })}><option value="pending">Menunggu persetujuan</option><option value="granted">Telah disetujui</option><option value="withdrawn">Ditarik</option></select>
        <label htmlFor="subject-notes">Catatan non-identitas</label><textarea id="subject-notes" rows={3} maxLength={2000} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        <button className="primary" disabled={saving}>{saving ? "Menyimpan…" : "Simpan subjek"}</button>
      </form></article>}
      <article className="panel subject-directory"><p className="eyebrow">DIRECTORY</p><h3>Daftar subjek</h3><div className="subject-list">{subjects.map((subject) => <div key={subject.id}><div className="subject-code"><strong>{subject.subject_code}</strong><span>{subject.initials} · {subject.research_group}</span></div><span>{subject.year_of_birth ?? "Tahun tidak dicatat"}</span><span className={`consent ${subject.consent_status}`}>{subject.consent_status === "granted" ? "Disetujui" : subject.consent_status === "withdrawn" ? "Ditarik" : "Menunggu"}</span></div>)}</div>{subjects.length === 0 && !error && <p className="empty-state">Belum ada subjek yang sesuai filter.</p>}</article>
    </section>
  </>;
}

function Users({ accessToken, onUnauthorized }: { accessToken: string; onUnauthorized: () => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", role: "operator" as Role, password: "" });

  const loadUsers = () => Promise.all(["users", "registration-requests"].map((path) => fetch(`${API}/${path}`, { headers: { Authorization: `Bearer ${accessToken}` } }).then((response) => {
    if (response.status === 401) { onUnauthorized(); throw new Error("Sesi berakhir. Silakan masuk kembali."); }
    if (!response.ok) throw new Error("Data pengguna tidak dapat dimuat.");
    return response.json();
  }))).then(([userData, requestData]) => { setUsers(userData as User[]); setRequests(requestData as RegistrationRequest[]); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Terjadi kesalahan."));

  useEffect(() => { loadUsers(); }, [accessToken]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true); setError("");
    try {
      const response = await fetch(`${API}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(form),
      });
      if (response.status === 401) { onUnauthorized(); throw new Error("Sesi berakhir. Silakan masuk kembali."); }
      if (!response.ok) {
        const body = await response.json() as { detail?: string };
        throw new Error(body.detail ?? "Pengguna tidak dapat dibuat.");
      }
      setForm({ full_name: "", email: "", role: "operator", password: "" });
      await loadUsers();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Terjadi kesalahan."); }
    finally { setSaving(false); }
  };

  const approve = async (id: string) => {
    setSaving(true); setError("");
    try {
      const response = await fetch(`${API}/registration-requests/${id}/approve`, { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } });
      if (!response.ok) { const body = await response.json() as { detail?: string }; throw new Error(body.detail ?? "Pendaftaran tidak dapat disetujui."); }
      await loadUsers();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Terjadi kesalahan."); }
    finally { setSaving(false); }
  };

  return <>
    <section className="page-intro"><div><p className="eyebrow">ADMINISTRATION</p><h2>Pengguna dan peran</h2><p>Admin mengatur akses. Otorisasi tetap diverifikasi oleh backend.</p></div></section>
    <section className="grid-two user-grid">
      <article className="panel registration-panel"><div className="panel-title"><div><p className="eyebrow">PERLU PERSETUJUAN</p><h3>Pendaftaran masuk</h3></div><span className="request-count">{requests.length}</span></div>
        <div className="registration-list">{requests.map((request) => <div key={request.id}><div><strong>{request.full_name}</strong><span>{request.email} · {request.institution}</span></div><button type="button" className="secondary" disabled={saving} onClick={() => approve(request.id)}>Setujui sebagai operator</button></div>)}</div>
        {requests.length === 0 && <p className="empty-state">Tidak ada pendaftaran yang menunggu.</p>}
      </article>
      <article className="panel">
        <p className="eyebrow">AKUN BARU</p><h3>Tambahkan pengguna</h3>
        <form className="stack-form" onSubmit={submit}>
          <label htmlFor="full-name">Nama lengkap</label><input id="full-name" required minLength={2} value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} />
          <label htmlFor="user-email">Email</label><input id="user-email" type="email" autoComplete="off" required value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          <label htmlFor="role">Peran</label><select id="role" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as Role })}><option value="operator">Operator</option><option value="researcher">Researcher</option><option value="admin">Admin</option></select>
          <label htmlFor="new-password">Password sementara</label><input id="new-password" type="password" autoComplete="new-password" minLength={10} required value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary" disabled={saving}>{saving ? "Menyimpan…" : "Buat pengguna"}</button>
        </form>
      </article>
      <article className="panel"><p className="eyebrow">DIRECTORY</p><h3>Akun terdaftar</h3>
        <div className="user-list">{users.map((user) => <div key={user.id}><span className="avatar" aria-hidden="true">{user.full_name.slice(0, 2).toUpperCase()}</span><div><strong>{user.full_name}</strong><span>{user.email}</span></div><span className="role-badge">{user.role}</span></div>)}</div>
        {users.length === 0 && !error && <p className="empty-state">Belum ada pengguna.</p>}
      </article>
    </section>
  </>;
}

function Dashboard({ device, summary, apiOnline, onOpenDevice }: { device: Device; summary: Summary; apiOnline: boolean; onOpenDevice: () => void }) {
  return <>
    <section className="hero-panel">
      <div><p className="eyebrow">SYSTEM OVERVIEW</p><h2>Pengukuran lokal, sinkronisasi saat tersedia.</h2><p>Firmware tetap menjadi sumber kebenaran. Dashboard hanya menampilkan kanal dan fungsi yang dilaporkan perangkat.</p></div>
      <button className="primary" onClick={onOpenDevice}>Lihat perangkat</button>
    </section>
    {!apiOnline && <div className="notice" role="status"><strong>Backend belum terhubung.</strong><span>Menampilkan capability firmware lokal yang terakhir diketahui.</span></div>}
    <section className="metrics" aria-label="Ringkasan sistem">
      <Metric label="Subjek aktif" value={String(summary.subject_count)} detail="Data terkode di PostgreSQL" />
      <Metric label="Sesi selesai" value={String(summary.completed_sessions)} detail="Belum ada rekaman server" />
      <Metric label="Kanal aktif" value={String(device.emg_channels + device.tongue_pressure_channels + (device.lip_force ? 1 : 0))} detail="1 EMG · 1 tekanan · 1 gaya" />
      <Metric label="Kalibrasi" value={summary.last_calibration ? "Valid" : "Belum"} detail={summary.last_calibration ?? "Diperlukan sebelum uji"} warning={!summary.last_calibration} />
    </section>
    <section className="grid-two">
      <article className="panel">
        <div className="panel-title"><div><p className="eyebrow">CAPABILITY</p><h3>Modul tersedia</h3></div><Status online={device.connection === "online"} /></div>
        <div className="module-list">
          <Capability name="Facial EMG" meta={`${device.emg_channels} kanal analog`} enabled={device.emg_channels > 0} />
          <Capability name="Tekanan lidah" meta={`${device.tongue_pressure_channels} kanal FSR`} enabled={device.tongue_pressure_channels > 0} />
          <Capability name="Gaya bibir" meta="HX711 + stepper" enabled={device.lip_force} />
          <Capability name="MQTT" meta="Ditunda pada tahap HTTP" enabled={device.mqtt} />
        </div>
      </article>
      <article className="panel workflow">
        <p className="eyebrow">WORKFLOW</p><h3>Pemeriksaan dipandu firmware</h3>
        <ol><li><b>01</b><span>Pilih pemeriksaan pada LCD</span></li><li><b>02</b><span>Persiapan dan kalibrasi sensor</span></li><li><b>03</b><span>Pengukuran tersimpan lokal</span></li><li><b>04</b><span>Sinkronisasi HTTPS saat online</span></li></ol>
      </article>
    </section>
  </>;
}

function Metric({ label, value, detail, warning = false }: { label: string; value: string; detail: string; warning?: boolean }) {
  return <article className="metric"><p className="eyebrow">{label}</p><strong className={warning ? "warn" : ""}>{value}</strong><span>{detail}</span></article>;
}

function Capability({ name, meta, enabled }: { name: string; meta: string; enabled: boolean }) {
  return <div className="capability"><span className={`cap-icon ${enabled ? "enabled" : "disabled"}`}>{enabled ? "✓" : "—"}</span><div><strong>{name}</strong><span>{meta}</span></div><span className="cap-state">{enabled ? "Tersedia" : "Nonaktif"}</span></div>;
}

function Monitoring({ device }: { device: Device }) {
  const points = [20,24,22,31,35,28,42,46,39,51,56,48,63,58,68,62,72,66,75,70];
  return <>
    <section className="page-intro"><div><p className="eyebrow">LIVE MONITORING</p><h2>Menunggu sesi dari perangkat</h2><p>Grafik aktif setelah firmware memulai pemeriksaan. Dashboard tidak dapat menggerakkan motor.</p></div><Status online={false} /></section>
    <section className="monitor-layout">
      <article className="panel chart-panel">
        <div className="panel-title"><div><p className="eyebrow">TEKANAN LIDAH</p><h3>FSR channel 1</h3></div><span className="unit">kPa · 100 Hz</span></div>
        <div className="chart-empty" role="img" aria-label="Pratinjau grafik tekanan lidah. Belum ada sesi aktif.">
          <svg viewBox="0 0 800 250" preserveAspectRatio="none" aria-hidden="true"><path className="grid" d="M0 50H800M0 100H800M0 150H800M0 200H800"/><polyline points={points.map((y, i) => `${i * 42},${230-y*2.4}`).join(" ")} /></svg>
          <div><strong>Belum ada data langsung</strong><span>Mulai pemeriksaan dari LCD perangkat.</span></div>
        </div>
        <p className="chart-summary">Ringkasan aksesibel: tidak ada sampel yang diterima pada sesi ini.</p>
      </article>
      <aside className="panel side-panel">
        <p className="eyebrow">KANAL FIRMWARE</p><h3>Yang dapat dimonitor</h3>
        <Capability name="EMG" meta={`${device.emg_channels} kanal`} enabled={device.emg_channels > 0} />
        <Capability name="Tekanan" meta={`${device.tongue_pressure_channels} kanal`} enabled={device.tongue_pressure_channels > 0} />
        <Capability name="Gaya bibir" meta="Load cell" enabled={device.lip_force} />
      </aside>
    </section>
  </>;
}

function Devices({ device, apiOnline }: { device: Device; apiOnline: boolean }) {
  return <>
    <section className="page-intro"><div><p className="eyebrow">DEVICE MANAGEMENT</p><h2>{device.device_id}</h2><p>Firmware {device.firmware_version} · transport {device.transport.join(" + ")}</p></div><Status online={apiOnline && device.connection === "online"} /></section>
    <section className="grid-two">
      <article className="panel"><p className="eyebrow">KONEKSI WIFI</p><h3>Portal konfigurasi dari LCD</h3><div className="steps"><p><b>1</b>Pada LCD buka <strong>Settings</strong>.</p><p><b>2</b>Pilih <strong>WiFi Setup</strong> lalu tekan OK.</p><p><b>3</b>Hubungkan ponsel ke AP <code>TongueSmart-Setup</code>.</p><p><b>4</b>Pilih WiFi dan simpan. Perangkat kembali ke Home.</p></div><div className="security-note">Password WiFi disimpan pada NVS perangkat, tidak dikirim ke dashboard.</div></article>
      <article className="panel"><p className="eyebrow">TRANSPORT</p><h3>HTTP/HTTPS tahap awal</h3><dl className="specs"><div><dt>USB serial</dt><dd>Aktif</dd></div><div><dt>HTTP sync</dt><dd>{device.connection === "online" ? "Aktif" : "Menunggu perangkat"}</dd></div><div><dt>Terakhir terlihat</dt><dd>{device.last_seen_at ? new Date(device.last_seen_at).toLocaleString("id-ID") : "Belum pernah"}</dd></div><div><dt>WiFi portal</dt><dd>{device.wifi_portal ? "Tersedia" : "Tidak ada"}</dd></div><div><dt>MQTT</dt><dd>Ditunda</dd></div><div><dt>Remote motor</dt><dd>Tidak diizinkan</dd></div></dl></article>
    </section>
  </>;
}
