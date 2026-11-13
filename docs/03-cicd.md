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

> ⚠️ Las descripciones anteriores de este archivo sobre "solo `cotizadorManufacturados`" corresponden al esquema viejo.
> Hoy los despliegues a **QA** y **Release** son por **delta** (solo lo que cambió en el push).

| Trigger | Destino | Requisito |
|---------|---------|-----------|
| Push/merge a `dev` | Sandbox **QA** — **automático** (delta) | Secret `SF_AUTH_URL_QA` |
| Push/merge a `main` | **Release / PreProd** — automático (delta) | Secret `SF_AUTH_URL_RELEASE` |
| Ejecución **manual** (`workflow_dispatch`) | **Producción** | Escribir `DEPLOY` para confirmar + secret `SF_AUTH_URL_PROD` |

### Despliegue automático a QA (push a `dev`)

1. Corren las pruebas Jest (gate) y se calcula el **delta** del push (`sfdx-git-delta`, de `github.event.before` a `github.sha`).
2. El delta se convierte a formato mdapi y se despliega con `sf project deploy start --metadata-dir ... -o qa --verbose`.
3. **Dónde ver qué se desplegó:** en GitHub → *Actions* → run **Deploy** → job *Deploy delta a QA*:
   - **Log del paso "Desplegar delta a QA"**: salida completa de SF CLI (estado, Deploy ID, enlace a la org y tabla de componentes
     con `Created` / `Changed` / `Unchanged`).
   - **Summary del run** (pestaña *Summary*): commit, cuántos tipos de componente y la misma salida de SF CLI.
4. Los despliegues a QA van **en serie** (`concurrency: deploy-qa`): si hay dos merges seguidos, el segundo espera al primero.

Qué hay que saber:
- Sin pruebas Apex: usa el nivel predeterminado de sandbox. Las pruebas Jest siguen como gate previo.
- Si el commit **borra** componentes del repo, el delta los borra también en QA (`destructiveChangesPost`).
- Si el push no contiene metadata de Salesforce (solo docs/workflows o archivos en `.forceignore`), el job termina en verde y lo
  indica en el Summary ("no se desplegó nada").
- Si falla la autenticación (`RefreshTokenAuthError`), renueva el secret (ver "Renovar el secret de QA").
- QA puede tener cambios que aún no están en `dev` (por ejemplo, ramas en pruebas desplegadas a mano). El delta solo toca lo que
  cambia en cada merge, pero un componente editado en QA y luego modificado en `dev` se **sobrescribe**.
- Si el secret no existe, el job termina en verde y solo avisa (no falla).
- Producción: valida con `--dry-run` y luego despliega. **No es automático** — alguien debe lanzarlo manualmente desde la pestaña *Actions*.

## Secrets necesarios

Configúralos en **Settings → Secrets and variables → Actions**:

| Secret | Cómo obtenerlo |
|--------|----------------|
| `SF_AUTH_URL_QA` | Sandbox **qa**: PR/push a `dev`. Ver "Renovar el secret de QA" abajo |
| `SF_AUTH_URL_RELEASE` | Release / PreProd: PR/push a `main` |
| `SF_AUTH_URL_PROD` | `sf org auth show-sfdx-auth-url -o ALMEX-Production --json` → campo `result.sfdxAuthUrl` |
| ~~`SF_AUTH_URL_SANDBOX`~~ | **Legado, sin uso.** Era ambiguo (apuntaba a `cpsandbox`) y su token venció. Se puede eliminar |

### Renovar el secret de QA

Los refresh tokens de las auth URL pueden vencer; si el check **"Validar deploy del delta"** falla en
*Autenticar org objetivo* con `RefreshTokenAuthError: expired access/refresh token`, renueva el secret:

```bash
# 1. Autenticar el sandbox qa (abre el navegador); omitir si ya esta autenticado
sf org login web --alias qa --instance-url https://force-app-5145--qa.sandbox.my.salesforce.com

# 2. Guardar la auth URL como secret SIN imprimirla (requiere permiso de escritura de secrets en el repo)
sf org auth show-sfdx-auth-url -o qa --json \
  | python3 -c "import json,sys; sys.stdout.write(json.load(sys.stdin)['result']['sfdxAuthUrl'])" \
  | gh secret set SF_AUTH_URL_QA --repo ALMEX-SALESFORCE-DEV/Salesforce_Almex_SFDX
```

> `sf org display --verbose` **enmascara** el `sfdxAuthUrl` (`[REDACTED]`) en la CLI 2.150+; usa
> `sf org auth show-sfdx-auth-url`. Si el secret no existe, el check se omite en verde con un aviso: un verde sin
> el secret **no** significa que el deploy se validó.

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
