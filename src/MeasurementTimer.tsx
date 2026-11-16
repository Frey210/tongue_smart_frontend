import { useEffect, useRef, useState } from "react";

export function MeasurementTimer({ active }: { active: boolean }) {
  const [mode, setMode] = useState("countdown");
  const [duration, setDuration] = useState("10");
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const accumulated = useRef(0);
  const started = useRef(0);
  const limit = Number(duration) * 1000;
  const valid = Number.isInteger(Number(duration)) && limit >= 1000 && limit <= 3600000;
  const finished = mode === "countdown" && valid && elapsed >= limit;
  const reset = () => { accumulated.current = 0; setElapsed(0); setRunning(false); };
  const pause = () => {
    accumulated.current += performance.now() - started.current;
    setElapsed(accumulated.current); setRunning(false);
  };
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const value = accumulated.current + performance.now() - started.current;
      setElapsed(value);
      if (!active || (mode === "countdown" && value >= limit)) {
        accumulated.current = value; setRunning(false);
      }
    };
    tick();
    const interval = window.setInterval(tick, 100);
    return () => window.clearInterval(interval);
  }, [running, active, mode, limit]);
  const seconds = mode === "countdown" ? Math.max(0, Math.ceil((limit - elapsed) / 1000)) : Math.floor(elapsed / 1000);
  const display = Number.isFinite(seconds) ? `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}` : "--:--";
  return <section className={`measurement-timer${finished ? " finished" : ""}`} aria-labelledby="timer-heading">
    <div className="timer-heading"><h4 id="timer-heading">Timer instruksi pasien</h4><span role="status">{finished ? "Waktu habis — tidak menghentikan alat otomatis" : running ? "Timer berjalan" : elapsed ? "Timer dijeda" : "Siap digunakan"}</span></div>
    <div className="timer-body">
      <output role="timer" aria-label="Waktu timer" aria-live="off">{display}</output>
      <div className="timer-settings"><label>Mode timer<select value={mode} disabled={running} onChange={event => { setMode(event.target.value); reset(); }}><option value="countdown">Hitung mundur</option><option value="stopwatch">Stopwatch</option></select></label>
        {mode === "countdown" && <label>Durasi (detik)<input type="number" min="1" max="3600" step="1" value={duration} disabled={running} aria-invalid={!valid} aria-describedby={!valid ? "timer-error" : undefined} onChange={event => { setDuration(event.target.value); reset(); }} /></label>}</div>
      <div className="timer-actions"><button type="button" className="secondary" disabled={!active || (!running && (finished || (mode === "countdown" && !valid)))} onClick={() => {
        if (running) pause(); else { started.current = performance.now(); setRunning(true); }
      }}>{running ? "Jeda timer" : elapsed && !finished ? "Lanjutkan timer" : "Mulai timer"}</button><button type="button" className="secondary" onClick={reset}>Reset timer</button></div>
    </div>
    {mode === "countdown" && !valid && <p id="timer-error" className="form-error">Isi durasi 1–3600 detik dalam bilangan bulat.</p>}
    <p className="timer-help">Panduan waktu saja, tidak mengontrol alat atau mencatat marker. Timer direset saat berpindah sesi atau meninggalkan Monitoring.</p>
  </section>;
}
