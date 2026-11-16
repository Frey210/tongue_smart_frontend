# Dependency security remediation — 2026-11-16

The three packages previously reported as high severity by npm audit have been
updated. Vite stays on the 8.2 maintenance line; no application source, medical
measurement logic, authentication flow, credentials or database schema changed.

| Package | Previous | Locked version |
| --- | --- | --- |
| vite | 8.2.0 | 8.2.4 |
| nanoid (PostCSS dependency) | 3.3.17 | 3.3.20 |
| source-map-js (PostCSS dependency) | 1.2.1 | 1.2.2 |

Vite is pinned to 8.2.4 in package.json; package-lock.json locks the full tree.
The compatible PostCSS/Rolldown toolchain and native bindings were refreshed
by npm resolution. No forced major upgrade, extra runtime dependency, audit
suppression, or permanent transitive override was added.

## Advisory references

- Nano ID zero-size custom-generator denial of service:
  https://github.com/advisories/GHSA-2v37-7h3g-55p8 (patched 3.3.18+).
- Source map section-offset denial of service:
  https://github.com/advisories/GHSA-68fv-2mgg-jv7q (patched 1.2.2+).
- Vite's bundled launch-editor Windows command-injection risk:
  https://github.com/advisories/GHSA-587h-7wmj-h5pm (8.2 patched in 8.2.4).
  The installed audit also covered the related launch-editor issues and Vite
  development-server cross-origin/filesystem advisories for versions <=8.2.3.

These packages belong to the frontend development/build toolchain. The production
image serves compiled static assets with Nginx, not the Vite development server.
This limits the exposed surface but is not a reason to retain vulnerable tools.

## Verification

`npm ci` completed successfully from the committed lockfile. `npm audit --json`
reports zero findings across all severities, including development dependencies.
`npm run build` passed with Vite 8.2.4. Use `tests/monitoring-export.cjs` through
the installed Playwright skill runner for isolated browser regression checks.

Recheck `npm audit` on future dependency changes. Zero reported advisories means
no known findings in that registry audit at the check time, not a guarantee that
the application or dependencies have no undiscovered vulnerabilities. Backend,
firmware and container-OS dependency audits are outside this remediation scope.
