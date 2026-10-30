# Tongue Smart Frontend

React/TypeScript/Vite foundation untuk Research Dashboard.

```powershell
npm.cmd install
npm.cmd run dev
```

Rencana implementasi: [PLAN.md](PLAN.md). Prototype sumber berada di `../tongue-smart-research-dashboard`.

## Guided EMG baseline

Monitoring now guides electrode preparation, 10-second rest acquisition,
review/confirmation and device acknowledgement before enabling EMG recording.
It requires the matching baseline API and firmware 0.7.0. Values remain estimated
uV with an unverified gain; the interface does not map them to clinical norms.
Moving electrodes requires another baseline. Pause/cancel and retry preserve
the explicit workflow instead of silently using a default baseline.
