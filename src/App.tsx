import { useEffect, useState } from "react";

type Screen = "dashboard" | "monitoring" | "devices";
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
};

const API = import.meta.env.VITE_API_URL ?? "/api/v1";

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
    monitoring: "M3 13h4l2-7 4 12 3-9 2 4h3",
    devices: "M7 4h10a2 2 0 0 1 2 2v12H5V6a2 2 0 0 1 2-2Zm3 5h4v4h-4z",
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24"><path d={paths[name]} /></svg>;
}

function Status({ online }: { online: boolean }) {
  return <span className={`status ${online ? "online" : "offline"}`}><i />{online ? "Terhubung" : "Offline"}</span>;
}

export function App() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [device, setDevice] = useState<Device>(fallbackDevice);
  const [summary, setSummary] = useState<Summary>({ device_status: "offline", pending_sync: 0, completed_sessions: 0, last_calibration: null });
  const [apiOnline, setApiOnline] = useState(false);

  useEffect(() => {
    let active = true;
    const refresh = () => Promise.all([
      fetch(`${API}/devices/current`).then((r) => {
        if (!r.ok) throw new Error("device request failed");
        return r.json() as Promise<Device>;
      }),
      fetch(`${API}/dashboard/summary`).then((r) => {
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
  }, []);

  const screens: { id: Screen; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "monitoring", label: "Monitoring" },
    { id: "devices", label: "Perangkat" },
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
        <div className="scope-note"><strong>Mode riset</strong><span>Bukan untuk diagnosis klinis mandiri.</span></div>
      </aside>

      <main id="main" tabIndex={-1}>
        <header>
          <div><p className="eyebrow">TONGUE SMART v3</p><h1>{screens.find((item) => item.id === screen)?.label}</h1></div>
          <Status online={apiOnline} />
        </header>

        {screen === "dashboard" && <Dashboard device={device} summary={summary} apiOnline={apiOnline} onOpenDevice={() => setScreen("devices")} />}
        {screen === "monitoring" && <Monitoring device={device} />}
        {screen === "devices" && <Devices device={device} apiOnline={apiOnline} />}
      </main>
    </div>
  );
}

function Dashboard({ device, summary, apiOnline, onOpenDevice }: { device: Device; summary: Summary; apiOnline: boolean; onOpenDevice: () => void }) {
  return <>
    <section className="hero-panel">
      <div><p className="eyebrow">SYSTEM OVERVIEW</p><h2>Pengukuran lokal, sinkronisasi saat tersedia.</h2><p>Firmware tetap menjadi sumber kebenaran. Dashboard hanya menampilkan kanal dan fungsi yang dilaporkan perangkat.</p></div>
      <button className="primary" onClick={onOpenDevice}>Lihat perangkat</button>
    </section>
    {!apiOnline && <div className="notice" role="status"><strong>Backend belum terhubung.</strong><span>Menampilkan capability firmware lokal yang terakhir diketahui.</span></div>}
    <section className="metrics" aria-label="Ringkasan sistem">
      <Metric label="Sesi selesai" value={String(summary.completed_sessions)} detail="Belum ada rekaman server" />
      <Metric label="Menunggu sinkron" value={String(summary.pending_sync)} detail="Data lokal tetap aman" />
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
