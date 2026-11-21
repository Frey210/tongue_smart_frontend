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

## Required examination device selection (2026-11-21)

The preparation wizard starts with no selected device. Step 3 requires an
explicit choice and lists ONLINE/OFFLINE beside each device name and ID.
Registry refreshes never select the first device automatically. If the chosen
device disappears, continuation and session submission are blocked; the request
uses only the explicitly selected device, never a fallback. Offline devices
remain selectable for preparation; connect the device before acquiring data.

Verification: production build and isolated Playwright checks passed for blank
selection, required/placeholder/status labels, refresh preservation, removal at
confirmation, exact selected device in the session request, empty registry and
375px layout. Desktop/mobile screenshots are in
`../output/screenshots/device-choice-20261121/`. Tests used mocked API responses,
not patient data or hardware.

Deployment verified 2026-11-21: commit `1b8cef7` pulled through Tailscale SSH
and the frontend container rebuilt/recreated on port 8180. Both containers
reported healthy; public HTTPS `/health` and `/ready` returned 200. The same
isolated Playwright checks passed against the deployed public frontend bundle.
No patient/session writes or hardware commands were sent to the live API.
