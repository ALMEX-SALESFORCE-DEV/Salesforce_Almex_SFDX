# Diseño — CI/CD SFDX con PreProd (Release)

Fecha: 2026-10-15
Rama: `feat/cicd-preprod-release`

## Problema

Los workflows de Salesforce fallan en el runner Linux al validar/desplegar el
delta de perfiles con nombres que contienen espacios y acentos:

- `ci.yml` con `sf project deploy start -x delta/package/package.xml` →
  `Error (ComponentSetError): No source-backed components present in the package.`
  (el CLI no matchea los `<members>` del manifest contra los archivos en el
  working tree del runner).
- Un intento previo con `-d delta/force-app` cambió el síntoma a
  `Error (NothingToDeploy): No local changes to deploy.` (source tracking del
  org hace creer que no hay cambios).
- `deploy.yml` con `-x ... --post-destructive-changes ...` →
  `An object '...' of type Profile was named in package.xml, but was not found
in zipped directory` (mismo problema de matching, lado servidor).

Además se quiere introducir un org **PreProd (Release)** entre `dev` y `main`.

## Objetivos

1. Reemplazar el método de deploy roto por uno robusto en runner Linux.
2. Integrar el org sandbox **Release** como PreProd antes de `main`.
3. PR hacia `main` valida (dry-run) su delta contra Release.
4. PROD sigue siendo deploy manual (sin cambios).
5. Deploys reales **comentados**: el usuario despliega manual desde su terminal
   por ahora.

## Orgs y secrets

| Org       | Alias / ID                                                                   | Rol                            | Secret CI                                                            |
| --------- | ---------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------- |
| cpsandbox | `cpsandbox`                                                                  | Valida PR→`dev`                | `SF_AUTH_URL_SANDBOX` (existe)                                       |
| Release   | ID `00DWD00000EN4sT` · `force-app-5145--release.sandbox.lightning.force.com` | **PreProd** — valida PR→`main` | `SF_AUTH_URL_RELEASE` (nuevo — lo agrega el usuario; guard si falta) |
| PROD      | `ALMEX-Production`                                                           | Deploy manual (terminal)       | `SF_AUTH_URL_PROD` (existe)                                          |

El guard replica el patrón actual: si el secret del org objetivo no está
configurado, el job emite `::warning::` y se omite (no bloquea el PR).

## Método robusto de deploy/validación (mdapi `--metadata-dir`)

Reemplaza `-x` y `-d`. Es stateless: no usa source tracking y empaqueta
exactamente lo convertido, evitando el matching manifest↔filesystem.

```bash
# 1. delta incremental (sfdx-git-delta)
sf sgd source delta --from "<BASE>" --to "<HEAD>" --output-dir delta --generate-delta

# 2. convertir source -> metadata API (si hay constructive)
sf project convert source --root-dir delta/force-app --output-dir mdout

# 3. inyectar borrados como destructiveChangesPost.xml (si hay destructive)
cp delta/destructiveChanges/destructiveChanges.xml mdout/destructiveChangesPost.xml

# 4. validar (dry-run) o desplegar
sf project deploy start --metadata-dir mdout -o <org> --dry-run --ignore-conflicts
```

**Verificado** contra cpsandbox: valida 2/2 perfiles (`Gerencia y Dirección
Comercial`, `Supervisor y Ejecutivo Comercial`) sin `NothingToDeploy` ni
`not found in zipped directory`.

### Edge cases

- Sin constructive ni destructive → "nada que validar", job verde.
- Solo constructive → pasos 1,2,4 (sin paso 3).
- Solo destructive → no hay source que convertir: crear `mdout/` con un
  `package.xml` vacío (`<Package/>` con `<version>`) + `destructiveChangesPost.xml`,
  luego deploy `--metadata-dir mdout`.
- Detección: `grep -c "<types>"` sobre `package.xml` y
  `destructiveChanges.xml` (como hoy) para decidir qué ramas ejecutar.

## 1. ci.yml — validaciones (dry-run) ACTIVAS

Job `validate-deploy` (se mantiene en PRs a `dev` y `main`), con cambios:

- **Org objetivo según `github.base_ref`:**
  - `dev` → `-o cpsandbox` (auth con `SF_AUTH_URL_SANDBOX`)
  - `main` → `-o Release` (auth con `SF_AUTH_URL_RELEASE`)
- Paso de validación reescrito al método mdapi `--metadata-dir` de arriba.
- Se mantiene: cálculo por `merge-base`, exclusión de ramas
  `release/sync-prod-*`, guard de secret no-bloqueante.
- El job de lint/formato/tests unitarios no cambia.

## 2. deploy.yml — deploys reales COMENTADOS

El usuario deploya manual desde terminal; se comenta **solo el `sf project
deploy start` (apply)** en cada job, dejando el cálculo de delta + convert
listos y con `echo`/`cat` para visibilidad. Cada bloque comentado lleva nota
del porqué.

- push `dev` → deploy delta a cpsandbox: `deploy start` **comentado**.
- push `main` → deploy delta a **Release (PreProd)**: bloque **nuevo**, todo
  **comentado** (listo para activar cuando se quiera auto-deploy).
- `workflow_dispatch` PROD → `deploy start` **comentado**.

Cuando se reactiven, los apply usarán el método mdapi `--metadata-dir`.

## 3. (DIFERIDO — no implementar ahora) Script de deploy manual

Para cuando se requiera: `scripts/deploy-delta.ps1` (+ `.sh`) que ejecute el
flujo mdapi contra el org que se le pase (`-o <alias>`), con `--dry-run`
opcional, para que el deploy manual desde terminal use el mismo método robusto.
Se documenta aquí pero **queda fuera del alcance actual** por decisión del
usuario.

## Fuera de alcance

- Cambiar el scope del deploy manual a PROD (hoy solo `cotizadorManufacturados`).
- Resolver el borrado del permission set `ALMEX_FormPrices_Access` (no existe en
  cpsandbox, asignado a usuario en PROD) — es tema de datos/admin, no de infra.
- Crear/configurar el secret `SF_AUTH_URL_RELEASE` (acción del usuario en GitHub).

## Criterio de aceptación

1. PR→`dev` valida el delta (dry-run) contra cpsandbox con el método mdapi, en
   verde cuando el delta es válido.
2. PR→`main` valida el delta (dry-run) contra Release; si falta
   `SF_AUTH_URL_RELEASE`, avisa y se omite sin bloquear.
3. `deploy.yml` no aplica ningún cambio automático (todos los `deploy start`
   reales comentados); los jobs no rompen.
4. El método mdapi reemplaza a `-x`/`-d` en todos los puntos de validación.
