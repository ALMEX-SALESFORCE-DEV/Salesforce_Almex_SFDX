[← Volver a la Wiki](../README.md)

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

---
[Siguiente: Estructura y orgs →](04-estructura.md)
