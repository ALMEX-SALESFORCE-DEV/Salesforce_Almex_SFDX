[← Volver a la Wiki](../README.md)

> **Gobernanza:** este repo opera bajo la normativa de TI (vault). Ver [Gobernanza](00-gobernanza.md). Ante discrepancia, manda el vault.

# 7. Sincronizar `main` desde PROD (baseline / reconciliación de drift)

Procedimiento para **capturar en git el estado real de la org de producción** cuando
PROD ha derivado del repo (cambios hechos directo en la org, sin pasar por el flujo
`feature → dev → release → main`).

> ⚠️ **Flujo inverso — excepción registrada.** El flujo normal es `repo → prod`
> (el repo es la fuente de verdad y se **despliega** a prod). Este método hace lo
> contrario: `prod → repo`. Solo se usa para **reconciliar drift**, no es el día a día.
> Queda declarado como excepción en [Gobernanza](00-gobernanza.md).

## ¿Por qué es seguro?

**Un PR/merge a `main` NO despliega a producción.** Según [CI/CD](03-cicd.md), el
deploy a prod es **manual** (`workflow_dispatch` + escribir `DEPLOY`). Por tanto:

- Traer metadata de prod y abrir PR a `main` **no toca la org** — solo actualiza git.
- El **review del PR es el control de seguridad**: ahí se verifica qué entra antes de
  que `main` cambie.
- El único riesgo es **de repo** (perder en `main` trabajo mergeado que aún no se
  desplegó a prod). Se atrapa revisando la **dirección** de cada diff (abajo).

## ¿Cuándo usarlo?

- Se detecta **config drift**: Apex/Flows/campos/layouts modificados directo en prod.
- Baseline inicial del repo contra la org.
- Reconciliación periódica (si se decide una cadencia).

## Prerrequisitos

| Requisito | Comando / nota |
|-----------|----------------|
| `.gitattributes` con `eol=lf` | Mata el ruido CRLF↔LF del retrieve en Windows. Ver [Troubleshooting](06-troubleshooting.md). |
| Auth a prod | `sf org display -o ALMEX-Production` debe responder. |
| Working tree limpio | `git status` sin cambios pendientes antes de empezar. |
| Heap de Node elevado | `$env:NODE_OPTIONS = "--max-old-space-size=8192"` ANTES del retrieve. Sin esto, un manifiesto grande revienta con `JavaScript heap out of memory` (cap default ~4GB). Usa `12288` si tienes 16GB+ RAM. |
| CLI pinneada | Verifica versión con `sf version`. El comportamiento del retrieve cambia entre versiones (ruido/orden). Actualiza antes de empezar con `sf update` y deja constancia de la versión usada en el PR. |

## Procedimiento

### 1. Rama dedicada desde `main`

El destino es `main`, así que se corta de ahí (no de `dev` ni de una rama de docs):

```bash
git checkout main
git pull
git checkout -b release/sync-prod-YYYY-MM-DD
```

### 2. (Recomendado) Regenerar el manifiesto desde el org

No confíes en que `manifest/package.xml` esté al día. Captura lo que **hoy** vive en prod:

```bash
sf project generate manifest --from-org ALMEX-Production --name package --output-dir manifest
```

> Revisa el diff de `package.xml`: tipos nuevos = metadata que prod tiene y el repo no.

> ⚠️ **El `--from-org` mete ListViews estándar que NO se pueden retrieve.** El org
> las lista pero el Metadata API no las entrega (son system-managed: `AllOpenCases`
> default, `CalculationMatrix.Org_PCM_Decision_Table`, `BatchJob.All_Batch_Jobs`,
> etc.). En el retrieve salen como warning `Entity of type 'ListView' named '...'
> cannot be found` — **benigno, exit 0, no es fallo**. Si molestan en el log, borra
> esos `<members>` del `package.xml`; pero OJO: el próximo `--from-org` los re-mete.

### 3. Retrieve dividido por sub-manifiestos (`scripts/sync-prod-retrieve.ps1`)

PROD **no tiene source tracking**, así que el retrieve va SIEMPRE con `--manifest`
(nunca `retrieve start` pelón — falla con `noSourceTracking`).

> ⚠️ **No bajes el `package.xml` completo de un jalón.** En esta org es grande
> (~135 tipos; `CustomField` solo trae ~560 miembros, `CustomObject` ~395). Un
> retrieve único dispara **dos** modos de falla en Windows:
>
> 1. **OOM** — carga toda la metadata en memoria para convertirla a source format y
>    revienta el heap de Node (`FATAL ERROR: ... JavaScript heap out of memory`),
>    aunque el server diga `Succeeded` (el crash es en la conversión local).
> 2. **Race de file handles** — al convertir cientos de objetos a la vez, Windows
>    tira `Component conversion failed: UNKNOWN: unknown error, open ...object-meta.xml`
>    (archivo distinto cada corrida = no es un archivo malo, es la concurrencia).

**El script resuelve ambos.** Parte `package.xml` en sub-manifiestos:

- Tipos pesados (`CustomField`, `CustomObject`, `Layout`, `Flow`,
  `LightningComponentBundle`, `PermissionSet`, `ExperienceBundle`) → sus **miembros**
  se parten en sub-lotes de `-HeavyMemberChunk` (default 25) → pocos archivos por
  retrieve → mata el race de handles.
- El resto → grupos de `-ChunkSize` tipos (default 10).
- Cada lote corre con heap elevado, **reintenta** `-Retries` veces ante lock/timeout,
  trata `Nothing retrieved` como *skip* (no fallo), y arregla el encoding UTF-8 de la
  consola (sin esto, los `─ ✔` de sf salen como `ÔöÇ`).

```powershell
./scripts/sync-prod-retrieve.ps1 -HeapMB 12288 -ChunkSize 6 -HeavyMemberChunk 25 -Retries 2 -Org ALMEX-Production
# todos los flags tienen default; ./scripts/sync-prod-retrieve.ps1 a secas también corre.
```

| Flag | Default | Para qué |
|------|---------|----------|
| `-Org` | `ALMEX-Production` | Alias del org. |
| `-HeapMB` | `8192` | Heap de Node en MB. Sube a `12288` con 16GB+ RAM. |
| `-ChunkSize` | `10` | Tipos ligeros por lote. |
| `-HeavyMemberChunk` | `25` | Miembros por sub-lote de un tipo pesado. Baja a `10` si sigue el `UNKNOWN: open`. |
| `-Retries` | `2` | Reintentos por lote ante lock/timeout (backoff 5s). |
| `-PauseIndexer` | off | Detiene `WSearch` durante el retrieve (requiere shell admin). Ver nota de abajo. |

**Lectura del log / consola** (`retrieve-log.txt`):

| Marca | Significa | Acción |
|-------|-----------|--------|
| (sin marca, exit 0) | Lote OK | nada |
| `SKIP nothing-retrieved` | Esos members no viven en el org (ej. `ExperienceBundle` vacío) | nada, es normal |
| `reintento N/2` | Lock/timeout transitorio, reintentando | nada, se auto-cura |
| `Warnings ... cannot be found` | ListViews estándar/system que el org lista pero no entrega (ver paso 2) | nada, es benigno (exit 0) |
| `FALLO exit=N` | Lote falló tras los reintentos | re-correr ese chunk (abajo) |

Sub-manifiestos en `manifest/split/chunk-NN.xml`. Si al final hay `FALLO`, el script
lista los lotes; re-corre solo esos:

```powershell
sf project retrieve start --manifest manifest/split/chunk-NN.xml -o ALMEX-Production
```

> **Si el `UNKNOWN: open` persiste** aun con `-HeavyMemberChunk 10`: el culpable
> casi siempre es el **indexer de Windows (`WSearch`)**, que mapea en memoria los
> `.xml` bajo `Documents` y choca con la reescritura de sf (`ERROR_USER_MAPPED_FILE`).
> Golpea más a objetos estándar que ya existen en disco (`AssociatedLocation`,
> `CalculationMatrix`). Soluciones, de barata a robusta:
>
> ```powershell
> # A) Excluir el repo del indexado (permanente, sin admin):
> #    Sin \* al final: aplica a la carpeta + /S recursivo. El \* tira un warning
> #    inofensivo al toparse con .git (oculto), pero igual excluye el resto.
> attrib +I "C:\Users\...\Salesforce_Almex_SFDX" /S /D
>
> # B) Pausar el indexer solo durante el retrieve (shell admin):
> ./scripts/sync-prod-retrieve.ps1 -PauseIndexer   # para/reinicia WSearch solo
>
> # C) Lo más robusto: mover el repo FUERA de Documents (ej. C:\dev\), esquiva
> #    indexer + OneDrive + DLP de una vez.
> ```
>
> Secundario: un AV de terceros o el watcher del IDE sobre `force-app` dan el mismo
> error. Cierra el explorador del IDE mientras corre; si hay AV corporativo, pide a
> TI excluir la ruta del repo.

### 4. Separar ruido EOL de cambios reales

> 🧹 **Antes de pelear el ruido, córtalo de raíz con `.forceignore`.** Los tipos que
> reordenan en cada retrieve (`Profile`, `StandardValueSet`, `AppMenu`,
> `InstalledPackage`) no deberían ni bajar. Agrégalos a `.forceignore` **una vez** y
> el retrieve los salta — menos memoria, menos diffs basura que descartar a mano.
> El retrieve dividido (paso 3) respeta `.forceignore` igual que el completo.

```powershell
# Total de archivos modificados
(git diff --name-only | Measure-Object -Line).Lines

# Cambios REALES (ignorando CR al final de línea)
git diff --ignore-cr-at-eol --name-only

# Solo ruido EOL (candidatos a descartar)
$all  = git diff --name-only
$real = git diff --ignore-cr-at-eol --name-only
$all | Where-Object { $_ -notin $real } | ForEach-Object { git checkout -- $_ }
```

> Con `.gitattributes` + `git add --renormalize .` el ruido desaparece de raíz.

### 5. Revisar los cambios reales — **verificar la dirección**

Para **cada** archivo que quede, decide:

| Caso | Qué significa | Acción |
|------|---------------|--------|
| Prod tiene algo que el repo no | Drift legítimo de prod | ✅ Se queda (es lo que buscamos) |
| El repo (main) es más nuevo que prod | Trabajo mergeado **aún no desplegado** | ❌ **NO sobreescribir** — `git checkout -- <archivo>` |
| Solo reordenamiento (profiles, apps, valuesets) | Ruido típico de retrieve | ⚠️ Descartar o añadir a `.forceignore` |

```bash
git diff <archivo>          # inspección manual, uno por uno
```

### 6. Commit + PR a `main`

```bash
git add -A
git commit -m "chore: sync main con estado de PROD (reconciliación de drift)"
git push origin release/sync-prod-YYYY-MM-DD

gh pr create --base main --head release/sync-prod-YYYY-MM-DD \
  --title "Sync PROD → main YYYY-MM-DD" \
  --body "Reconciliación de drift. Excepción al flujo (00-gobernanza). No despliega a prod."
```

### 7. Review del PR (control de seguridad)

- **@Getsemani-Avila-Almidones** revisa (CODEOWNERS, main protegida).
- Checklist: ¿algún archivo es main-adelante y se perdería? ¿hay secretos? ¿tipos nuevos esperados?
- Verde + aprobado → merge. **Prod no se tocó.**

### 8. Back-merge `main → dev`

Para no desincronizar `dev` (paso del [Git Flow](02-gitflow.md)):

```bash
git checkout dev
git merge origin/main
git push origin dev
```

## Gotchas / buenas prácticas

| Tema | Recomendación |
|------|---------------|
| **EOL** | `.gitattributes` con `eol=lf` ANTES del retrieve. Sin esto, 100% ruido. |
| **OOM (heap)** | Manifiesto grande de un jalón = `JavaScript heap out of memory`. Sube heap (`NODE_OPTIONS`) **y** parte el retrieve (paso 3). |
| **`UNKNOWN: open` (Windows)** | Causa #1: el indexer `WSearch` mapea los `.xml` bajo `Documents` y choca con sf (`ERROR_USER_MAPPED_FILE`). Fix: `attrib +I <repo> /S /D`, o `-PauseIndexer`, o mover el repo fuera de `Documents`. Baja `-HeavyMemberChunk` y cierra el IDE si persiste. |
| **Encoding de consola** | sf emite UTF-8 (`─ ✔`); PS 5.1 lo pinta como `ÔöÇ`. El script fuerza `[Console]::OutputEncoding = UTF8`. |
| **`Nothing retrieved`** | Es warning, no fallo (members que no viven en el org). El script lo marca `SKIP`. |
| **Metadata ruidosa** | Profiles, `StandardValueSet`, `AppMenu`, `InstalledPackage` reordenan siempre. Considera `.forceignore`. |
| **Manifiesto viejo** | Regenera con `--from-org`; un `package.xml` viejo no captura tipos nuevos de prod. |
| **Secretos** | El retrieve no trae credenciales, pero revisa NamedCredentials/ConnectedApps antes de commitear. |
| **Dirección del diff** | Un diff NO implica "prod es más nuevo". Verifica caso por caso (paso 5). |
| **No auto-deploy** | Merge a `main` nunca despliega. El deploy a prod es manual y aparte. |

---
[← Volver a la Wiki](../README.md)