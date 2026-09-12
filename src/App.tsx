import { useEffect, useState, type FormEvent } from "react";
import brandLogo from "../assets/logo.png";

type Screen = "dashboard" | "subjects" | "examination" | "monitoring" | "results" | "history" | "exports" | "devices" | "users";
type Role = "admin" | "operator" | "researcher";
type User = { id: string; email: string; full_name: string; role: Role; is_active: boolean };
type RegistrationRequest = { id: string; email: string; full_name: string; institution: string; status: string; created_at: string };
type Subject = { id: string; subject_code: string; initials: string; research_group: string; year_of_birth: number | null; consent_status: "pending" | "granted" | "withdrawn"; notes: string; is_active: boolean; created_at: string };
type ExaminationSession = { id: string; session_code: string; subject_code: string; modules: string[]; protocol_stages: string[]; electrode_site: string | null; status: string; created_at: string };
type SessionControl = { id: string; measurement: "emg" | "tongue_pressure" | "lip_force"; phase: "baseline" | "recording" | "paused" | "completed"; protocol_stage: string; fsr_point: string | null; created_at: string };
type SessionResults = { session: ExaminationSession; control: SessionControl | null; channels: string[]; selected_channel: string | null; sample_count: number; batch_count: number; downsample_stride: number; summary: { minimum: number | null; maximum: number | null; average: number | null; quality: Record<string, number> }; points: { timestamp: string; protocol_stage: string; sensor_channel: string; value: number; unit: string; quality: string }[]; markers: { id: string; protocol_stage: string; label: string; occurred_at: string }[]; notes: { id: string; note: string; created_at: string }[] };
type ExportJob = { id: string; session_ids: string[]; data_mode: string; include_metadata: boolean; include_markers: boolean; status: string; row_count: number; checksum: string; filename: string; created_at: string };
type AuthSession = { access_token: string; refresh_token: string; expires_in: number; user: User };
type Device = {
  id: string;
  device_id: string;
  hardware_uid: string;
  display_name: string;
  owner_id: string | null;
  registered_at: string | null;
  credential_hint: string | null;
  legacy: boolean;
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
  id: "legacy-tongue-smart-v3",
  device_id: "tongue-smart-v3",
  hardware_uid: "legacy-unprovisioned",
  display_name: "Tongue Smart v3",
  owner_id: null,
  registered_at: null,
  credential_hint: null,
  legacy: true,
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
    examination: "M12 5v14M5 12h14",
    results: "M7 3h7l5 5v13H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM10 13h6M10 17h4",
    history: "M3.5 12a8.5 8.5 0 1 0 2.6-6.1M3.5 4.5V9h4.5M12 8v4.5l3 2",
    exports: "M12 3v12M7 10l5 5 5-5M5 20h14",
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
  const [devices, setDevices] = useState<Device[]>([fallbackDevice]);
  const [deviceRefreshKey, setDeviceRefreshKey] = useState(0);
  const [summary, setSummary] = useState<Summary>({ device_status: "offline", pending_sync: 0, completed_sessions: 0, subject_count: 0, last_calibration: null });
  const [apiOnline, setApiOnline] = useState(false);
  const [resultSessionId, setResultSessionId] = useState("");

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
      fetch(`${API}/devices`, { headers: { Authorization: `Bearer ${auth.access_token}` } }).then((r) => {
        if (r.status === 401) { saveAuth(null); throw new Error("session expired"); }
        if (!r.ok) throw new Error("device request failed");
        return r.json() as Promise<Device[]>;
      }),
      fetch(`${API}/dashboard/summary`, { headers: { Authorization: `Bearer ${auth.access_token}` } }).then((r) => {
        if (r.status === 401) { saveAuth(null); throw new Error("session expired"); }
        if (!r.ok) throw new Error("summary request failed");
        return r.json() as Promise<Summary>;
      }),
    ]).then(([nextDevices, nextSummary]) => {
      if (!active) return;
      setDevices(nextDevices);
      setDevice(nextDevices[0] ?? fallbackDevice);
      setSummary(nextSummary);
      setApiOnline(true);
    }).catch(() => {
      if (active) setApiOnline(false);
    });
    refresh();
    const timer = window.setInterval(refresh, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, [auth, deviceRefreshKey]);

  if (!auth) return <Login onAuthenticated={saveAuth} />;

  const screens: { id: Screen; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "subjects", label: "Subjek" },
    ...(auth.user.role !== "researcher" ? [{ id: "examination" as Screen, label: "Pemeriksaan" }] : []),
    { id: "monitoring", label: "Monitoring" },
    { id: "results", label: "Hasil" },
    { id: "history", label: "Riwayat" },
    { id: "exports", label: "Ekspor" },
    { id: "devices", label: "Perangkat" },
    ...(auth.user.role === "admin" ? [{ id: "users" as Screen, label: "Pengguna" }] : []),
  ];

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">Lewati ke konten utama</a>
      <aside>
        <div className="brand-mark"><img src={brandLogo} alt="" /><div>Tongue Smart<small>Research Dashboard</small></div></div>
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
        {screen === "examination" && auth.user.role !== "researcher" && <ExaminationWizard accessToken={auth.access_token} devices={devices} onUnauthorized={() => saveAuth(null)} onPrepared={() => setScreen("monitoring")} />}
        {screen === "monitoring" && <Monitoring device={device} accessToken={auth.access_token} role={auth.user.role} onUnauthorized={() => saveAuth(null)} />}
        {screen === "results" && <Results accessToken={auth.access_token} role={auth.user.role} initialSessionId={resultSessionId} onUnauthorized={() => saveAuth(null)} />}
        {screen === "history" && <History accessToken={auth.access_token} onUnauthorized={() => saveAuth(null)} onView={(id) => { setResultSessionId(id); setScreen("results"); }} />}
        {screen === "exports" && <Exports accessToken={auth.access_token} onUnauthorized={() => saveAuth(null)} />}
        {screen === "devices" && <Devices devices={devices} accessToken={auth.access_token} role={auth.user.role} apiOnline={apiOnline} onUnauthorized={() => saveAuth(null)} onChanged={() => setDeviceRefreshKey((value) => value + 1)} />}
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
      <div className="auth-brand"><img className="auth-logo" src={brandLogo} alt="" /><div><strong>Tongue Smart</strong><small>RESEARCH PLATFORM</small></div></div>
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

function ExaminationWizard({ accessToken, devices, onUnauthorized, onPrepared }: { accessToken: string; devices: Device[]; onUnauthorized: () => void; onPrepared: () => void }) {
  const [step, setStep] = useState(1);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [modules, setModules] = useState<string[]>([]);
  const [electrodeSite, setElectrodeSite] = useState("");
  const [electrodeNote, setElectrodeNote] = useState("");
  const [stages, setStages] = useState<string[]>(["rest", "clench"]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [prepared, setPrepared] = useState<ExaminationSession | null>(null);
  const [deviceId, setDeviceId] = useState(devices[0]?.device_id ?? "");
  const device = devices.find((item) => item.device_id === deviceId) ?? devices[0] ?? fallbackDevice;

  useEffect(() => {
    if (!devices.some((item) => item.device_id === deviceId)) setDeviceId(devices[0]?.device_id ?? "");
  }, [devices, deviceId]);

  useEffect(() => { fetch(`${API}/subjects?consent_status=granted`, { headers: { Authorization: `Bearer ${accessToken}` } }).then((response) => {
    if (response.status === 401) { onUnauthorized(); throw new Error("Sesi berakhir."); }
    if (!response.ok) throw new Error("Subjek tidak dapat dimuat."); return response.json() as Promise<Subject[]>;
  }).then(setSubjects).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Terjadi kesalahan.")); }, [accessToken]);

  const moduleOptions = [
    { id: "emg", label: "Aktivitas EMG", detail: `Sensor EMG · ${device.emg_channels} kanal · µV`, available: device.emg_channels > 0 },
    { id: "tongue_pressure", label: "Tekanan Lidah", detail: `FSR lidah · ${device.tongue_pressure_channels} kanal bergiliran · kPa`, available: device.tongue_pressure_channels > 0 },
    { id: "lip_force", label: "Gaya Bibir", detail: "Load cell HX711 · N", available: device.lip_force },
  ];
  const stageOptions = [{ id: "rest", label: "Posisi istirahat", duration: "30 dtk" }, { id: "mouth_close", label: "Menutup mulut", duration: "15 dtk" }, { id: "clench", label: "Menggigit (clenching)", duration: "3 × 10 dtk" }, { id: "tongue_press", label: "Tekanan lidah bergiliran", duration: "5 titik" }, { id: "lip_pull", label: "Tarikan gaya bibir", duration: "2 ulangan" }];
  const selectedSubject = subjects.find((subject) => subject.id === subjectId);
  const checks = [{ label: "Perangkat terdaftar", ok: Boolean(device.device_id) }, { label: "Capability sensor tersedia", ok: modules.length > 0 }, { label: "Penyimpanan lokal", ok: true }, { label: "Kalibrasi", ok: true }, { label: "Koneksi internet", ok: device.connection === "online", optional: true }];
  const canContinue = step === 1 ? Boolean(subjectId) : step === 2 ? modules.length > 0 && (!modules.includes("emg") || (Boolean(electrodeSite) && (electrodeSite !== "other" || Boolean(electrodeNote.trim())))) : step === 3 ? Boolean(deviceId) : step === 4 ? stages.length > 0 : true;
  const toggle = (value: string, current: string[], setter: (next: string[]) => void) => setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);

  const prepare = async () => {
    setSaving(true); setError("");
    try {
      const response = await fetch(`${API}/sessions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ subject_id: subjectId, device_id: device.device_id, modules, protocol_stages: stages, electrode_site: modules.includes("emg") ? electrodeSite : null, electrode_site_note: electrodeSite === "other" ? electrodeNote : null }) });
      if (response.status === 401) { onUnauthorized(); throw new Error("Sesi berakhir."); }
      if (!response.ok) { const body = await response.json() as { detail?: string }; throw new Error(body.detail ?? "Sesi tidak dapat dibuat."); }
      setPrepared(await response.json() as ExaminationSession);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Terjadi kesalahan."); }
    finally { setSaving(false); }
  };

  if (prepared) return <section className="prepared-state" role="status"><span className="prepared-check">✓</span><p className="eyebrow">SESI SIAP</p><h2>{prepared.session_code}</h2><p>Sesi untuk <strong>{prepared.subject_code}</strong> sudah disimpan sebagai prepared. Akuisisi tetap dimulai dari perangkat.</p><button className="primary" onClick={onPrepared}>Buka monitoring</button></section>;

  return <>
    <section className="page-intro"><div><p className="eyebrow">NEW EXAMINATION</p><h2>Persiapan sesi pemeriksaan</h2><p>Lengkapi lima langkah sebelum sesi dikirim ke perangkat.</p></div><span className="step-badge">Langkah {step} dari 5</span></section>
    <ol className="wizard-progress" aria-label="Kemajuan persiapan">{["Subjek", "Modul", "Perangkat", "Protokol", "Konfirmasi"].map((label, index) => <li key={label} className={step === index + 1 ? "active" : step > index + 1 ? "done" : ""}><span>{step > index + 1 ? "✓" : index + 1}</span><b>{label}</b></li>)}</ol>
    <section className="panel wizard-card">
      {step === 1 && <div><p className="eyebrow">LANGKAH 1</p><h3>Pilih subjek dengan consent aktif</h3><div className="choice-list">{subjects.map((subject) => <button type="button" key={subject.id} className={subjectId === subject.id ? "selected" : ""} onClick={() => setSubjectId(subject.id)}><span className="avatar">{subject.initials}</span><span><strong>{subject.subject_code}</strong><small>{subject.research_group} · consent disetujui</small></span><i>{subjectId === subject.id ? "Dipilih" : "Pilih"}</i></button>)}</div>{subjects.length === 0 && <p className="empty-state">Belum ada subjek dengan consent disetujui. Buka halaman Subjek untuk memperbarui consent.</p>}</div>}
      {step === 2 && <div><p className="eyebrow">LANGKAH 2</p><h3>Pilih modul pengukuran</h3><div className="module-options">{moduleOptions.map((item) => <button type="button" key={item.id} disabled={!item.available} className={modules.includes(item.id) ? "selected" : ""} onClick={() => toggle(item.id, modules, setModules)}><strong>{item.label}</strong><span>{item.detail}</span><small>{item.available ? modules.includes(item.id) ? "Aktif" : "Tersedia" : "Tidak dilaporkan firmware"}</small></button>)}</div>{modules.includes("emg") && <div className="emg-placement"><label htmlFor="electrode-site">Posisi pemasangan elektroda EMG</label><select id="electrode-site" required value={electrodeSite} onChange={(event) => setElectrodeSite(event.target.value)}><option value="">Pilih posisi…</option><option value="masseter_left">Masseter kiri</option><option value="masseter_right">Masseter kanan</option><option value="temporalis_left">Temporalis kiri</option><option value="temporalis_right">Temporalis kanan</option><option value="other">Lokasi lainnya</option></select>{electrodeSite === "other" && <><label htmlFor="electrode-note">Keterangan lokasi</label><input id="electrode-note" required value={electrodeNote} onChange={(event) => setElectrodeNote(event.target.value)} /></>}</div>}</div>}
      {step === 3 && <div><p className="eyebrow">LANGKAH 3</p><h3>Pilih dan validasi perangkat</h3><label className="device-select-label" htmlFor="session-device">Perangkat untuk sesi ini</label><select id="session-device" value={deviceId} onChange={(event) => setDeviceId(event.target.value)}>{devices.map((item) => <option key={item.device_id} value={item.device_id}>{item.display_name} · {item.device_id} · {item.connection === "online" ? "online" : "offline"}</option>)}</select><div className="device-checks">{checks.map((check) => <div key={check.label}><span className={check.ok ? "ok" : check.optional ? "optional" : "failed"}>{check.ok ? "✓" : check.optional ? "!" : "×"}</span><strong>{check.label}</strong><small>{check.ok ? "Lolos" : check.optional ? "Opsional — sesi tetap dapat disiapkan offline" : "Perlu diperiksa"}</small></div>)}</div><p className="security-note">Sesi akan dikunci ke <strong>{device.display_name}</strong>. Data dari credential perangkat lain akan ditolak backend.</p></div>}
      {step === 4 && <div><p className="eyebrow">LANGKAH 4</p><h3>Pilih tahap protokol</h3><div className="protocol-list">{stageOptions.map((stage) => <label key={stage.id}><input type="checkbox" checked={stages.includes(stage.id)} onChange={() => toggle(stage.id, stages, setStages)} /><span><strong>{stage.label}</strong><small>{stage.duration}</small></span></label>)}</div></div>}
      {step === 5 && <div><p className="eyebrow">LANGKAH 5</p><h3>Konfirmasi sesi</h3><dl className="review-list"><div><dt>Subjek</dt><dd>{selectedSubject?.subject_code}</dd></div><div><dt>Perangkat</dt><dd>{device.device_id}</dd></div><div><dt>Modul</dt><dd>{modules.join(", ")}</dd></div>{modules.includes("emg") && <div><dt>Elektroda EMG</dt><dd>{electrodeSite.replaceAll("_", " ")}</dd></div>}<div><dt>Tahap protokol</dt><dd>{stages.length} tahap</dd></div><div><dt>Status awal</dt><dd>Prepared</dd></div></dl><p className="security-note">Membuat sesi tidak menyalakan sensor atau motor. Mulai akuisisi dari menu lokal perangkat.</p></div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="wizard-actions"><button type="button" className="secondary" disabled={step === 1 || saving} onClick={() => setStep(step - 1)}>Kembali</button>{step < 5 ? <button type="button" className="primary" disabled={!canContinue} onClick={() => setStep(step + 1)}>Lanjutkan</button> : <button type="button" className="primary" disabled={saving} onClick={prepare}>{saving ? "Menyiapkan…" : "Siapkan sesi"}</button>}</div>
    </section>
  </>;
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
          <Capability name="Aktivitas EMG" meta={`Sensor EMG · ${device.emg_channels} kanal · µV`} enabled={device.emg_channels > 0} />
          <Capability name="Tekanan lidah" meta={`FSR lidah · ${device.tongue_pressure_channels} kanal · kPa`} enabled={device.tongue_pressure_channels > 0} />
          <Capability name="Gaya bibir" meta="Load cell HX711 · N" enabled={device.lip_force} />
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

const displayUnit = (unit: string) => unit === "uV" ? "µV" : unit;

function MedicalSignalChart({ points, label, unit, tone = "teal", emptyMessage = "Belum ada data pengukuran." }: { points: SessionResults["points"]; label: string; unit: string; tone?: "teal" | "navy" | "blue"; emptyMessage?: string }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const values = points.map((point) => point.value);
  const rawMin = values.length ? Math.min(...values) : 0;
  const rawMax = values.length ? Math.max(...values) : 1;
  const padding = Math.max((rawMax - rawMin) * .12, Math.abs(rawMax) * .04, 1);
  const min = rawMin - padding; const max = rawMax + padding;
  const left = 58; const right = 800; const top = 18; const bottom = 220;
  const x = (index: number) => left + (points.length <= 1 ? 0 : index * (right - left) / (points.length - 1));
  const y = (value: number) => bottom - (value - min) / Math.max(1, max - min) * (bottom - top);
  const line = points.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");
  const area = points.length ? `${left},${bottom} ${line} ${x(points.length - 1)},${bottom}` : "";
  const yTicks = Array.from({ length: 5 }, (_, index) => max - index * (max - min) / 4);
  const duration = points.length > 1 ? Math.max(0, (new Date(points.at(-1)!.timestamp).getTime() - new Date(points[0].timestamp).getTime()) / 1000) : 0;
  const hovered = hoverIndex === null ? null : points[hoverIndex];
  const move = (event: React.PointerEvent<SVGSVGElement>) => { if (!points.length) return; const rect = event.currentTarget.getBoundingClientRect(); const viewX = (event.clientX - rect.left) / rect.width * 820; const index = Math.round((viewX - left) / (right - left) * Math.max(0, points.length - 1)); setHoverIndex(Math.max(0, Math.min(points.length - 1, index))); };
  return <div className={`medical-chart tone-${tone}`}>
    <div className="chart-legend" aria-label="Legenda grafik"><span><i className="signal-dot" />{label}</span><span><i className="quality-dot" />Kualitas baik</span><strong>{points.length} titik tampilan</strong></div>
    <div className="chart-canvas"><svg viewBox="0 0 820 260" preserveAspectRatio="none" onPointerMove={move} onPointerLeave={() => setHoverIndex(null)} role="img" aria-label={`Grafik ${label}: ${points.length} titik, rentang ${rawMin.toFixed(1)} sampai ${rawMax.toFixed(1)} ${unit}`}>
      <defs><linearGradient id={`fill-${tone}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".22"/><stop offset="1" stopColor="currentColor" stopOpacity=".02"/></linearGradient></defs>
      {yTicks.map((tick, index) => <g key={index}><line className="chart-grid-line" x1={left} x2={right} y1={top + index * (bottom - top) / 4} y2={top + index * (bottom - top) / 4}/><text className="axis-label y-label" x={left - 9} y={top + index * (bottom - top) / 4 + 4}>{tick.toFixed(1)}</text></g>)}
      {[0, .25, .5, .75, 1].map((position) => <line key={position} className="chart-grid-line vertical" x1={left + position * (right - left)} x2={left + position * (right - left)} y1={top} y2={bottom}/>)}
      <line className="chart-axis" x1={left} x2={right} y1={bottom} y2={bottom}/><line className="chart-axis" x1={left} x2={left} y1={top} y2={bottom}/>
      <text className="axis-label" x={left} y="244">0 dtk</text><text className="axis-label" textAnchor="middle" x={(left + right) / 2} y="244">{(duration / 2).toFixed(1)} dtk</text><text className="axis-label" textAnchor="end" x={right} y="244">{duration.toFixed(1)} dtk</text><text className="axis-unit" x="10" y="14">{unit}</text>
      {points.length > 1 && <polygon className="signal-area" points={area}/>}<polyline className="signal-line" points={line}/>
      {hovered && hoverIndex !== null && <g className="chart-hover"><line x1={x(hoverIndex)} x2={x(hoverIndex)} y1={top} y2={bottom}/><circle cx={x(hoverIndex)} cy={y(hovered.value)} r="5"/><g transform={`translate(${Math.min(right - 154, Math.max(left + 8, x(hoverIndex) + 12))},${Math.max(22, y(hovered.value) - 52)})`}><rect width="146" height="44" rx="7"/><text x="10" y="17">{hovered.value.toFixed(2)} {unit}</text><text className="tooltip-sub" x="10" y="34">{new Date(hovered.timestamp).toLocaleTimeString("id-ID")}</text></g></g>}
    </svg>{!points.length && <div className="chart-empty-message"><strong>Menunggu sinyal</strong><span>{emptyMessage}</span></div>}</div>
  </div>;
}

function Exports({ accessToken, onUnauthorized }: { accessToken: string; onUnauthorized: () => void }) {
  const [sessions, setSessions] = useState<ExaminationSession[]>([]);
  const [jobs, setJobs] = useState<ExportJob[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState("both");
  const [metadata, setMetadata] = useState(true);
  const [markers, setMarkers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const headers = { Authorization: `Bearer ${accessToken}` };
  const load = () => Promise.all([fetch(`${API}/sessions`, { headers }), fetch(`${API}/exports`, { headers })]).then(async ([sessionResponse, exportResponse]) => {
    if (sessionResponse.status === 401 || exportResponse.status === 401) { onUnauthorized(); throw new Error("Sesi berakhir."); }
    if (!sessionResponse.ok || !exportResponse.ok) throw new Error("Data ekspor tidak dapat dimuat.");
    setSessions(await sessionResponse.json() as ExaminationSession[]); setJobs(await exportResponse.json() as ExportJob[]);
  }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Terjadi kesalahan."));
  useEffect(() => { load(); }, [accessToken]);
  const create = async () => { setSaving(true); setError(""); try { const response = await fetch(`${API}/exports`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ session_ids: selected, data_mode: mode, include_metadata: metadata, include_markers: markers }) }); if (!response.ok) { const body = await response.json() as { detail?: string }; throw new Error(body.detail ?? "Ekspor tidak dapat dibuat."); } setSelected([]); await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Terjadi kesalahan."); } finally { setSaving(false); } };
  const download = async (job: ExportJob) => { const response = await fetch(`${API}/exports/${job.id}/download`, { headers }); if (!response.ok) { setError("Berkas tidak dapat diunduh."); return; } const url = URL.createObjectURL(await response.blob()); const anchor = document.createElement("a"); anchor.href = url; anchor.download = job.filename; anchor.click(); URL.revokeObjectURL(url); };
  return <><section className="page-intro"><div><p className="eyebrow">DATA EXPORT</p><h2>Ekspor dataset penelitian</h2><p>Pilih sesi dan jenis nilai. Setiap berkas memiliki checksum untuk verifikasi.</p></div></section>{error && <p className="form-error" role="alert">{error}</p>}<section className="export-layout"><article className="panel"><p className="eyebrow">KONFIGURASI</p><h3>Pilih data</h3><fieldset className="export-sessions"><legend>Sesi pemeriksaan</legend>{sessions.map((session) => <label key={session.id}><input type="checkbox" checked={selected.includes(session.id)} onChange={() => setSelected(selected.includes(session.id) ? selected.filter((id) => id !== session.id) : [...selected, session.id])} /><span><strong>{session.session_code}</strong><small>{session.subject_code} · {session.status}</small></span></label>)}{sessions.length === 0 && <p className="empty-state">Belum ada sesi untuk diekspor.</p>}</fieldset><label className="export-field" htmlFor="data-mode">Jenis nilai</label><select id="data-mode" value={mode} onChange={(event) => setMode(event.target.value)}><option value="both">Raw + terkalibrasi</option><option value="raw">Raw saja</option><option value="processed">Terkalibrasi saja</option></select><label className="check-row"><input type="checkbox" checked={metadata} onChange={(event) => setMetadata(event.target.checked)} /> Sertakan metadata sesi</label><label className="check-row"><input type="checkbox" checked={markers} onChange={(event) => setMarkers(event.target.checked)} /> Sertakan event marker</label><button className="primary export-create" disabled={!selected.length || saving} onClick={create}>{saving ? "Membuat CSV…" : "Buat ekspor CSV"}</button></article><article className="panel"><p className="eyebrow">ARSIP EKSPOR</p><h3>Berkas siap diunduh</h3><div className="export-list">{jobs.map((job) => <div key={job.id}><div><strong>{job.filename}</strong><span>{job.row_count} baris · {job.data_mode} · {new Date(job.created_at).toLocaleString("id-ID")}</span><code title={job.checksum}>SHA-256 {job.checksum.slice(0, 16)}…</code></div><button className="secondary" onClick={() => download(job)}>Unduh</button></div>)}</div>{jobs.length === 0 && <p className="empty-state">Belum ada berkas ekspor.</p>}</article></section></>;
}

function History({ accessToken, onUnauthorized, onView }: { accessToken: string; onUnauthorized: () => void; onView: (id: string) => void }) {
  const [sessions, setSessions] = useState<ExaminationSession[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { fetch(`${API}/sessions`, { headers: { Authorization: `Bearer ${accessToken}` } }).then((response) => { if (response.status === 401) { onUnauthorized(); throw new Error("Sesi berakhir."); } if (!response.ok) throw new Error("Riwayat tidak dapat dimuat."); return response.json() as Promise<ExaminationSession[]>; }).then(setSessions).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Terjadi kesalahan.")); }, [accessToken]);
  const filtered = sessions.filter((session) => (!search || `${session.session_code} ${session.subject_code}`.toLowerCase().includes(search.toLowerCase())) && (!statusFilter || session.status === statusFilter));
  return <><section className="page-intro"><div><p className="eyebrow">SESSION ARCHIVE</p><h2>Riwayat pemeriksaan</h2><p>Seluruh sesi terkode, dari persiapan hingga selesai.</p></div><span className="subject-total">{filtered.length} sesi</span></section><section className="subject-toolbar"><input aria-label="Cari sesi" placeholder="Cari kode sesi atau subjek…" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Filter status sesi" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Semua status</option><option value="prepared">Prepared</option><option value="active">Active</option><option value="completed">Completed</option></select></section>{error && <p className="form-error" role="alert">{error}</p>}<section className="panel history-panel"><div className="history-list">{filtered.map((session) => <div key={session.id}><div><strong>{session.session_code}</strong><span>{session.subject_code} · {new Date(session.created_at).toLocaleString("id-ID")}</span></div><span>{session.modules.join(" + ")}</span><span className={`session-state ${session.status}`}>{session.status}</span><button className="secondary" onClick={() => onView(session.id)}>Lihat hasil</button></div>)}</div>{filtered.length === 0 && <p className="empty-state">Tidak ada sesi yang sesuai filter.</p>}</section></>;
}

function Results({ accessToken, role, initialSessionId, onUnauthorized }: { accessToken: string; role: Role; initialSessionId: string; onUnauthorized: () => void }) {
  const [sessions, setSessions] = useState<ExaminationSession[]>([]);
  const [sessionId, setSessionId] = useState(initialSessionId);
  const [channel, setChannel] = useState("");
  const [results, setResults] = useState<SessionResults | null>(null);
  const [note, setNote] = useState("");
  const [marker, setMarker] = useState("");
  const [error, setError] = useState("");
  const headers = { Authorization: `Bearer ${accessToken}` };
  useEffect(() => { fetch(`${API}/sessions`, { headers }).then((response) => { if (response.status === 401) { onUnauthorized(); throw new Error("Sesi berakhir."); } return response.json() as Promise<ExaminationSession[]>; }).then((items) => { setSessions(items); if (!sessionId && items.length) setSessionId(items[0].id); }).catch(() => setError("Daftar sesi tidak dapat dimuat.")); }, [accessToken]);
  const loadResults = () => { if (!sessionId) { setResults(null); return; } const query = channel ? `?sensor_channel=${encodeURIComponent(channel)}` : ""; fetch(`${API}/sessions/${sessionId}/results${query}`, { headers }).then((response) => { if (!response.ok) throw new Error("Hasil sesi tidak dapat dimuat."); return response.json() as Promise<SessionResults>; }).then(setResults).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Terjadi kesalahan.")); };
  useEffect(loadResults, [sessionId, channel, accessToken]);
  const post = async (kind: "notes" | "markers") => { if (!results) return; const body = kind === "notes" ? { note } : { label: marker, protocol_stage: results.session.protocol_stages[0] ?? "unspecified", occurred_at: new Date().toISOString() }; const response = await fetch(`${API}/sessions/${sessionId}/${kind}`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!response.ok) { setError("Catatan atau marker tidak dapat disimpan."); return; } setNote(""); setMarker(""); loadResults(); };
  const resultUnit = displayUnit(results?.points[0]?.unit ?? "unit");
  return <><section className="page-intro"><div><p className="eyebrow">EXAMINATION RESULTS</p><h2>Hasil pemeriksaan</h2><p>Seri grafik diringkas untuk tampilan; sampel mentah di database tidak diubah.</p></div></section><section className="result-controls"><select aria-label="Pilih sesi hasil" value={sessionId} onChange={(event) => { setSessionId(event.target.value); setChannel(""); }}><option value="">Pilih sesi…</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.session_code} · {session.subject_code}</option>)}</select><select aria-label="Pilih kanal sensor" value={channel} onChange={(event) => setChannel(event.target.value)}><option value="">Semua kanal</option>{results?.channels.map((item) => <option key={item}>{item}</option>)}</select></section>{error && <p className="form-error" role="alert">{error}</p>}{results && <><section className="metrics result-metrics"><Metric label="Sampel" value={String(results.sample_count)} detail={`${results.batch_count} batch tersimpan`} /><Metric label="Rata-rata" value={results.summary.average?.toFixed(2) ?? "—"} detail={channel || "Semua kanal"} /><Metric label="Puncak" value={results.summary.maximum?.toFixed(2) ?? "—"} detail={`${results.summary.quality.good ?? 0} kualitas baik`} /><Metric label="Downsample" value={`${results.points.length}`} detail={`Stride ${results.downsample_stride}`} /></section><section className="monitor-layout"><article className="panel"><div className="panel-title"><div><p className="eyebrow">SIGNAL OVERVIEW</p><h3>{channel || "Gabungan kanal"}</h3></div><span className="unit">{resultUnit}</span></div><MedicalSignalChart points={results.points} label={channel || "Gabungan kanal"} unit={resultUnit} tone="navy" /><p className="chart-summary">{results.sample_count} sampel · minimum {results.summary.minimum?.toFixed(2) ?? "—"} · maksimum {results.summary.maximum?.toFixed(2) ?? "—"}</p></article><aside className="panel annotations"><p className="eyebrow">ANNOTATIONS</p><h3>Marker dan catatan</h3>{role !== "researcher" && <div className="inline-entry"><input aria-label="Marker baru" placeholder="Label marker" value={marker} onChange={(event) => setMarker(event.target.value)} /><button className="secondary" disabled={!marker.trim()} onClick={() => post("markers")}>Tambah marker</button></div>}<div className="inline-entry"><textarea aria-label="Catatan baru" placeholder="Catatan operator/peneliti" value={note} onChange={(event) => setNote(event.target.value)} /><button className="secondary" disabled={!note.trim()} onClick={() => post("notes")}>Simpan catatan</button></div><div className="annotation-list">{results.markers.map((item) => <p key={item.id}><strong>{item.label}</strong><span>Marker · {item.protocol_stage}</span></p>)}{results.notes.map((item) => <p key={item.id}><strong>{item.note}</strong><span>{new Date(item.created_at).toLocaleString("id-ID")}</span></p>)}</div></aside></section></>}</>;
}

function Monitoring({ device, accessToken, role, onUnauthorized }: { device: Device; accessToken: string; role: Role; onUnauthorized: () => void }) {
  const [sessions, setSessions] = useState<ExaminationSession[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState<"emg" | "tongue_pressure" | "lip_force">("tongue_pressure");
  const [fsrPoint, setFsrPoint] = useState("median_anterior");
  const [results, setResults] = useState<SessionResults | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const headers = { Authorization: `Bearer ${accessToken}` };
  const selected = sessions.find((session) => session.id === selectedId);
  const channel = tab === "emg" ? "emg_1" : tab === "tongue_pressure" ? "fsr_1" : "lip_force_1";
  const load = async () => {
    try {
      const sessionResponse = await fetch(`${API}/sessions`, { headers });
      if (sessionResponse.status === 401) { onUnauthorized(); throw new Error("Sesi login berakhir."); }
      if (!sessionResponse.ok) throw new Error("Daftar sesi tidak dapat dimuat.");
      const items = await sessionResponse.json() as ExaminationSession[]; setSessions(items);
      const id = selectedId || items[0]?.id || ""; if (!selectedId && id) setSelectedId(id);
      if (id) { const resultResponse = await fetch(`${API}/sessions/${id}/results?sensor_channel=${channel}&max_points=400`, { headers }); if (resultResponse.ok) setResults(await resultResponse.json() as SessionResults); }
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Terjadi kesalahan."); }
  };
  useEffect(() => {
    let stopped = false;
    let timer = 0;
    const poll = async () => { await load(); if (!stopped) timer = window.setTimeout(poll, 500); };
    poll();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [accessToken, selectedId, tab]);
  useEffect(() => { if (selected && !selected.modules.includes(tab)) { const first = selected.modules.find((item) => ["emg", "tongue_pressure", "lip_force"].includes(item)); if (first) setTab(first as typeof tab); } }, [selectedId, sessions]);
  const transition = async (action: "start" | "finalize") => { if (!selected) return; setSaving(true); try { const response = await fetch(`${API}/sessions/${selected.id}/${action}`, { method: "POST", headers }); if (!response.ok) { const body = await response.json() as { detail?: string }; throw new Error(body.detail ?? "Status sesi tidak dapat diubah."); } await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Terjadi kesalahan."); } finally { setSaving(false); } };
  const control = async (phase: SessionControl["phase"]) => { if (!selected) return; setSaving(true); setError(""); try { const stage = tab === "tongue_pressure" ? `tongue_press_${fsrPoint}` : tab === "emg" ? `emg_${selected.electrode_site ?? "unspecified"}` : "lip_force_pull"; const response = await fetch(`${API}/sessions/${selected.id}/control`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ measurement: tab, phase, protocol_stage: stage, fsr_point: tab === "tongue_pressure" ? fsrPoint : null }) }); if (!response.ok) { const body = await response.json() as { detail?: string }; throw new Error(body.detail ?? "Kontrol tahap gagal."); } await load(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Terjadi kesalahan."); } finally { setSaving(false); } };
  const values = results?.points.map((point) => point.value) ?? [];
  const current = values.at(-1); const average = results?.summary.average; const peak = results?.summary.maximum; const controlState = results?.control;
  const tabLabel = tab === "emg" ? "Aktivitas EMG" : tab === "tongue_pressure" ? "Tekanan Lidah" : "Gaya Bibir";
  const unit = displayUnit(results?.points[0]?.unit ?? (tab === "emg" ? "uV" : tab === "tongue_pressure" ? "kPa" : "N"));
  return <>
    <section className="page-intro"><div><p className="eyebrow">LIVE MONITORING</p><h2>{selected?.session_code ?? "Menunggu sesi"}</h2><p>{selected ? `${selected.subject_code} · kontrol tahap oleh ${role}` : "Siapkan pemeriksaan baru untuk memulai."}</p></div><span className={`session-state ${selected?.status ?? "none"}`}>{selected?.status ?? "Tidak ada sesi"}</span></section>
    <section className="monitor-session-bar"><label htmlFor="monitor-session">Sesi</label><select id="monitor-session" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}><option value="">Pilih sesi…</option>{sessions.map((session) => <option key={session.id} value={session.id}>{session.session_code} · {session.subject_code} · {session.status}</option>)}</select>{selected?.status === "prepared" && role !== "researcher" && <button className="primary" disabled={saving} onClick={() => transition("start")}>Aktifkan sesi</button>}{selected?.status === "active" && role !== "researcher" && <button className="danger-button" disabled={saving} onClick={() => transition("finalize")}>Hentikan & simpan</button>}</section>
    {error && <p className="form-error" role="alert">{error}</p>}
    {selected && <>{selected.modules.length === 1
      ? <div className="measurement-label"><span>Kanal aktif</span><strong>{tabLabel}</strong></div>
      : <div className="measurement-tabs" role="tablist" aria-label="Jenis pengukuran">{selected.modules.map((module) => <button key={module} role="tab" aria-selected={tab === module} onClick={() => setTab(module as typeof tab)}>{module === "emg" ? "Aktivitas EMG" : module === "tongue_pressure" ? "Tekanan Lidah" : "Gaya Bibir"}</button>)}</div>}
    <section className="live-metrics"><Metric label="Nilai saat ini" value={current?.toFixed(1) ?? "—"} detail={results?.points.length ? unit : "Menunggu data"} /><Metric label="Nilai puncak" value={peak?.toFixed(1) ?? "—"} detail={`${channel} · ${unit}`} /><Metric label="Rata-rata" value={average?.toFixed(1) ?? "—"} detail={`${results?.sample_count ?? 0} sampel · ${unit}`} /><Metric label="Tahap aktif" value={controlState?.phase ?? "idle"} detail={controlState?.protocol_stage ?? "Belum dimulai"} /></section>
    <section className="live-monitor-grid"><article className="panel live-chart-panel"><div className="panel-title"><div><p className="eyebrow">{tabLabel}</p><h3>{tab === "emg" ? `Sensor EMG · elektroda ${selected.electrode_site?.replaceAll("_", " ") ?? "belum ditentukan"}` : tab === "tongue_pressure" ? `FSR lidah · titik ${fsrPoint.replaceAll("_", " ")}` : "Load cell HX711 · traksi"}</h3></div><span className="unit live-unit"><i />LIVE · {unit}</span></div><MedicalSignalChart points={results?.points ?? []} label={tabLabel} unit={unit} tone={tab === "emg" ? "navy" : tab === "tongue_pressure" ? "teal" : "blue"} emptyMessage="Tekan Mulai ukur di bawah. Perangkat dan LCD akan mengikuti kontrol dashboard secara otomatis."/><div className="measurement-controls">{tab === "tongue_pressure" && <select aria-label="Titik ukur FSR" value={fsrPoint} onChange={(event) => setFsrPoint(event.target.value)}><option value="median_anterior">Median anterior</option><option value="median_middle">Median tengah</option><option value="median_posterior">Median posterior</option><option value="lateral_left">Lateral kiri</option><option value="lateral_right">Lateral kanan</option></select>}{tab === "tongue_pressure" && <button className="secondary" disabled={selected.status !== "active" || saving} onClick={() => control("baseline")}>Mulai baseline</button>}<button className="primary" disabled={selected.status !== "active" || saving} onClick={() => control("recording")}>Mulai ukur {tab === "emg" ? "EMG" : tab === "tongue_pressure" ? "titik ini" : "gaya bibir"}</button><button className="secondary" disabled={selected.status !== "active" || saving || !controlState} onClick={() => control("paused")}>Jeda</button><button className="secondary" disabled={selected.status !== "active" || saving || !controlState} onClick={() => control("completed")}>Selesai tahap</button></div><p className="chart-summary">Kontrol tersinkron ke perangkat · {results?.batch_count ?? 0} batch · kualitas baik {results?.summary.quality.good ?? 0}</p></article>
    <aside className="panel live-side"><p className="eyebrow">STATUS PENGUKURAN</p><h3>{controlState ? `${controlState.measurement} · ${controlState.phase}` : "Belum ada tahap aktif"}</h3>{tab === "tongue_pressure" && <TonguePointMap active={fsrPoint} values={results?.points.map((point) => point.value) ?? []} />}<div className="quality-list"><p><span>Koneksi device</span><strong>{device.connection}</strong></p><p><span>Kualitas baik</span><strong>{results?.summary.quality.good ?? 0}</strong></p><p><span>Paket tersimpan</span><strong>{results?.batch_count ?? 0}</strong></p><p><span>Downsample</span><strong>{results?.downsample_stride ?? 1}×</strong></p></div></aside></section></>}
  </>;
}

function TonguePointMap({ active, values }: { active: string; values: number[] }) {
  const peak = values.length ? Math.max(...values) : 0;
  const points = [["median_anterior", "MA"], ["median_middle", "MM"], ["median_posterior", "MP"], ["lateral_left", "LK"], ["lateral_right", "LN"]];
  return <div className="tongue-map" aria-label={`Peta titik tekanan. Titik aktif ${active}`}><div className="palate-shape">{points.map(([id, label]) => <span key={id} className={`${id} ${active === id ? "active" : ""}`} title={id}>{label}<i>{active === id && peak ? peak.toFixed(1) : ""}</i></span>)}</div><small>Simulasi satu kanal FSR diukur bergiliran</small></div>;
}

function Devices({ devices, accessToken, role, apiOnline, onUnauthorized, onChanged }: { devices: Device[]; accessToken: string; role: Role; apiOnline: boolean; onUnauthorized: () => void; onChanged: () => void }) {
  const [pairingCode, setPairingCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);

  const claim = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`${API}/devices/claim`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ pairing_code: pairingCode, display_name: displayName }) });
      if (response.status === 401) { onUnauthorized(); throw new Error("Sesi berakhir."); }
      if (!response.ok) { const body = await response.json() as { detail?: string }; throw new Error(body.detail ?? "Perangkat tidak dapat didaftarkan."); }
      const claimed = await response.json() as Device;
      setSuccess(`${claimed.display_name} berhasil didaftarkan.`); setPairingCode(""); setDisplayName(""); onChanged();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Terjadi kesalahan."); }
    finally { setSaving(false); }
  };

  const onlineCount = devices.filter((item) => item.connection === "online").length;
  return <>
    <section className="page-intro"><div><p className="eyebrow">DEVICE MANAGEMENT</p><h2>Perangkat penelitian</h2><p>{devices.length} perangkat tersedia · {onlineCount} sedang online</p></div><Status online={apiOnline && onlineCount > 0} /></section>
    <section className="device-management-layout">
      {role !== "researcher" && <article className="panel device-claim-panel"><p className="eyebrow">PAIRING PERANGKAT</p><h3>Daftarkan ke akun</h3><p className="panel-copy">Masukkan kode yang tampil pada LCD atau terminal simulator. Kode berlaku selama 10 menit.</p><form onSubmit={claim}><label htmlFor="pairing-code">Kode pairing</label><input id="pairing-code" required minLength={6} maxLength={16} placeholder="TS-ABC234" value={pairingCode} onChange={(event) => setPairingCode(event.target.value.toUpperCase())} /><label htmlFor="device-name">Nama perangkat</label><input id="device-name" required minLength={2} maxLength={120} placeholder="Tongue Smart Lab 01" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />{error && <p className="form-error" role="alert">{error}</p>}{success && <p className="form-success" role="status">{success}</p>}<button className="primary" disabled={saving}>{saving ? "Mendaftarkan…" : "Daftarkan perangkat"}</button></form><div className="security-note">Setiap perangkat menggunakan secret unik. Dashboard hanya menampilkan enam karakter petunjuk dan tidak menyimpan secret dalam bentuk terbaca.</div></article>}
      <article className="panel device-registry"><div className="panel-title"><div><p className="eyebrow">REGISTRY</p><h3>Perangkat terdaftar</h3></div><span className="subject-total">{devices.length} unit</span></div><div className="device-card-list">{devices.map((item) => <div className="device-card" key={item.device_id}><div className="device-card-head"><span className="device-glyph" aria-hidden="true">TS</span><div><strong>{item.display_name}</strong><code>{item.device_id}</code></div><Status online={apiOnline && item.connection === "online"} /></div><dl><div><dt>Firmware</dt><dd>{item.firmware_version}</dd></div><div><dt>Hardware UID</dt><dd>{item.hardware_uid}</dd></div><div><dt>Credential</dt><dd>{item.legacy ? "Legacy bersama" : `••••••${item.credential_hint ?? ""}`}</dd></div><div><dt>Terakhir terlihat</dt><dd>{item.last_seen_at ? new Date(item.last_seen_at).toLocaleString("id-ID") : "Belum pernah"}</dd></div></dl>{item.legacy && <p className="device-warning">Mode kompatibilitas. Lakukan pairing agar perangkat memakai credential unik.</p>}</div>)}</div></article>
    </section>
    <section className="panel wifi-guide"><p className="eyebrow">KONEKSI WIFI</p><h3>Portal konfigurasi dari LCD</h3><div className="steps"><p><b>1</b>Pada LCD buka <strong>Settings</strong>.</p><p><b>2</b>Pilih <strong>WiFi Setup</strong> lalu tekan OK.</p><p><b>3</b>Hubungkan ponsel ke AP <code>TongueSmart-Setup</code>.</p><p><b>4</b>Pilih WiFi dan simpan. Perangkat kembali ke Home.</p></div></section>
  </>;
}
