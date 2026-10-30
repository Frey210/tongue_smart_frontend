export type EmgBaseline = {
  control_id: string;
  state: "requested" | "capturing" | "review" | "accepted" | "ready" | "failed" | "cancelled";
  reason: string;
  created_at: string;
  metrics: { mean_mv?: number; noise_mv?: number; drift_mv?: number; samples?: number };
};

export function EmgBaselinePanel({ baseline, prepared, onPrepared, onCapture, onConfirm, disabled, recording, site }: {
  baseline?: EmgBaseline | null; prepared: boolean; onPrepared: (value: boolean) => void;
  onCapture: () => void; onConfirm: () => void; disabled: boolean; recording: boolean; site: string;
}) {
  const state = baseline?.state;
  const busy = state === "requested" || state === "capturing" || state === "accepted";
  const step = state === "ready" ? 4 : state === "review" || state === "accepted" ? 3 : busy ? 2 : 1;
  const status = state === "ready" ? "Baseline siap di perangkat" : state === "review" ? "Periksa dan konfirmasi hasil"
    : state === "accepted" ? "Menunggu perangkat menyimpan baseline" : state === "capturing" ? "Rileks selama countdown dan rekaman 10 detik"
    : state === "requested" ? "Menunggu perangkat memulai baseline" : state === "failed" ? "Baseline ditolak; periksa kontak lalu ulangi"
    : state === "cancelled" ? "Baseline dibatalkan; ambil ulang sebelum mengukur" : "Siapkan baseline untuk lokasi elektroda ini";
  return <section className="emg-baseline" aria-labelledby="emg-baseline-heading">
    <div className="baseline-heading"><h3 id="emg-baseline-heading">Persiapan EMG</h3><span>Langkah {step} dari 4</span></div>
    <ol className="baseline-steps" aria-label="Tahap baseline EMG">
      {["Pasang & rileks", "Rekam baseline", "Konfirmasi", "Mulai ukur"].map((label, index) =>
        <li key={label} aria-current={step === index + 1 ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}
    </ol>
    <p>Lokasi: <strong>{site.replaceAll("_", " ")}</strong>. Tunggu kontak stabil. Rahang rileks, tanpa bicara atau mengunyah selama baseline. Ulangi setelah elektroda dipindahkan.</p>
    <label className="baseline-prepared"><input type="checkbox" checked={prepared} disabled={disabled || recording || busy}
      onChange={(event) => onPrepared(event.target.checked)} />Elektroda terpasang sesuai protokol dan isolasi listrik untuk pengujian sudah diverifikasi.</label>
    <p className="baseline-status" role="status">{status}</p>
    {baseline?.reason && <p className="baseline-reason">{baseline.reason}</p>}
    {baseline?.metrics.mean_mv !== undefined && <dl className="baseline-values">
      <div><dt>Baseline keluaran</dt><dd>{baseline.metrics.mean_mv.toFixed(1)} mV</dd></div>
      <div><dt>Variasi saat rileks</dt><dd>{baseline.metrics.noise_mv?.toFixed(1)} mV</dd></div>
      <div><dt>Drift</dt><dd>{baseline.metrics.drift_mv?.toFixed(1)} mV</dd></div>
      <div><dt>Sampel rata-rata</dt><dd>{baseline.metrics.samples}</dd></div>
    </dl>}
    <div className="baseline-actions"><button type="button" className={state === "review" ? "secondary" : "primary"}
      disabled={disabled || recording || busy || !prepared} onClick={onCapture}>{state ? "Ambil ulang baseline" : "Ambil baseline 10 detik"}</button>
      {state === "review" && <button type="button" className="primary" disabled={disabled || !prepared} onClick={onConfirm}>Konfirmasi & simpan di alat</button>}</div>
    {busy && <p>Jika alat belum merespons, periksa koneksi dan firmware 0.7.0 atau lebih baru. Gunakan Jeda untuk membatalkan.</p>}
    <small>Baseline bukan kalibrasi gain. Pembacaan µV tetap estimasi dengan gain asumsi; bukan nilai klinis terkalibrasi. Sampel baseline tidak dicampur sebagai hasil pemeriksaan.</small>
  </section>;
}
