[← Volver a la Wiki](../README.md)

> **Gobernanza:** este repo opera bajo la normativa de TI (vault). Ver [Gobernanza](00-gobernanza.md). Ante discrepancia, manda el vault.

# 3. CI/CD (GitHub Actions)

Dos workflows en [`.github/workflows/`](../.github/workflows).

## `ci.yml` — Validación

**Se ejecuta en:** Pull Request y push a `dev` / `main`.

| Paso | Bloqueante | Qué hace |
|------|-----------|----------|
| `npm ci` | ✅ | Instala dependencias |
| `npm run test:unit` (Jest) | ✅ | Tests unitarios de LWC (gate) |
| `npm run lint` (ESLint) | ⚠️ Informativo | No bloquea (hay legacy con violaciones) |
| `npm run prettier:verify` | ⚠️ Informativo | No bloquea |

## `deploy.yml` — Despliegue

> ⚠️ Solo despliega el bundle **`lwc/cotizadorManufacturados`** (`-d`). **Nunca toca otros componentes de la org.**

| Trigger | Destino | Requisito |
|---------|---------|-----------|
| Push a `dev` | Sandbox | Secret `SF_AUTH_URL_SANDBOX` |
| Ejecución **manual** (`workflow_dispatch`) | **Producción** | Escribir `DEPLOY` para confirmar + secret `SF_AUTH_URL_PROD` |

- Sandbox: si el secret no existe, el job termina en verde y solo avisa (no falla).
- Producción: valida con `--dry-run` y luego despliega. **No es automático** — alguien debe lanzarlo manualmente desde la pestaña *Actions*.

## Secrets necesarios

Configúralos en **Settings → Secrets and variables → Actions**:

| Secret | Cómo obtenerlo |
|--------|----------------|
| `SF_AUTH_URL_SANDBOX` | `sf org display --target-org cpsandbox --verbose --json` → campo `sfdxAuthUrl` |
| `SF_AUTH_URL_PROD` | `sf org display --target-org ALMEX-Production --verbose --json` → campo `sfdxAuthUrl` |

```bash
# Ejemplo para setear el secret de sandbox con gh CLI:
$url = (sf org display --target-org cpsandbox --verbose --json | ConvertFrom-Json).result.sfdxAuthUrl
gh secret set SF_AUTH_URL_SANDBOX --body $url --repo ALMEX-SALESFORCE-DEV/Salesforce_Almex_SFDX
```

> 🔐 El `sfdxAuthUrl` es una credencial completa de la org. **Nunca** lo pongas en el código ni en un commit — solo como secret de GitHub.

## Lanzar deploy manual a producción

Desde GitHub: pestaña **Actions → Deploy → Run workflow → escribir `DEPLOY`**. O por CLI:
```bash
gh workflow run deploy.yml --repo ALMEX-SALESFORCE-DEV/Salesforce_Almex_SFDX -f confirm=DEPLOY
```

## ⚠️ Pendientes conocidos del pipeline

Ver detalle en [Troubleshooting](06-troubleshooting.md):
1. **Falta `package-lock.json`** → `npm ci` falla. Ejecuta `npm install` y commitea el lockfile.
2. **No hay tests Jest** → `test:unit` falla ("No tests found"). Escribe tests o usa `sfdx-lwc-jest -- --passWithNoTests` temporalmente.

## Conformidad con el estándar (obligatoria)

Estas reglas del estándar de TI son **obligatorias** para este repo. Lo que hoy no
se cumple está declarado como **brecha con fecha objetivo** — no es práctica aceptada.
Detalle y dueño en [Gobernanza](00-gobernanza.md); versión autoritativa en `GUI-DEV-002`.

| Regla (STD-DEV-003 §3 / STD-DEV-004) | Estado | Objetivo | Fecha |
|---|---|---|---|
| Lint (ESLint/Prettier) **bloqueante** en archivos cambiados | ⚠️ informativo | Bloqueante en el diff | 2026-10-24 |
| **PMD (Apex)** bloqueante en seguridad (CRUD/FLS, sharing, inyección SOQL) | ✗ ausente | Añadir al CI | 2026-10-31 |
| **Pruebas Apex + cobertura ≥ 75%** en el PR `release`→`main` | ⚠️ solo al deploy | Gate en el PR | 2026-11-14 |
| **Jest (LWC)** con tests reales | ⚠️ `--passWithNoTests` | ≥1 test por bundle activo | 2026-10-10 |
| `package-lock.json` presente (CI `npm ci`) | ✗ falta | Commitear lockfile | 2026-10-03 |
| Deploy por **delta del release** (`sfdx-git-delta`) | ⚠️ un bundle fijo | Delta del release | 2026-11-28 |

> **Regla de sincronía:** todo cambio a `.github/workflows/` **debe** actualizar
> esta tabla y la de `GUI-DEV-002` (ítem del checklist del PR).

---
[Siguiente: Estructura y orgs →](04-estructura.md)
