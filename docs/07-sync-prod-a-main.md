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

### 3. Retrieve completo por manifiesto

PROD **no tiene source tracking**, así que el retrieve va SIEMPRE con `--manifest`
(nunca `retrieve start` pelón — falla con `noSourceTracking`):

```bash
sf project retrieve start --manifest manifest/package.xml -o ALMEX-Production
```

### 4. Separar ruido EOL de cambios reales

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
| **Metadata ruidosa** | Profiles, `StandardValueSet`, `AppMenu`, `InstalledPackage` reordenan siempre. Considera `.forceignore`. |
| **Manifiesto viejo** | Regenera con `--from-org`; un `package.xml` viejo no captura tipos nuevos de prod. |
| **Secretos** | El retrieve no trae credenciales, pero revisa NamedCredentials/ConnectedApps antes de commitear. |
| **Dirección del diff** | Un diff NO implica "prod es más nuevo". Verifica caso por caso (paso 5). |
| **No auto-deploy** | Merge a `main` nunca despliega. El deploy a prod es manual y aparte. |

---
[← Volver a la Wiki](../README.md)