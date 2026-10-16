# CI/CD PreProd (Release) + fix mdapi — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que las validaciones de delta en PR funcionen en el runner Linux (método mdapi `--metadata-dir`), que PR→main valide contra el org Release (PreProd), y que los deploys reales queden comentados (deploy manual desde terminal).

**Architecture:** Dos workflows. `ci.yml` valida (dry-run) el delta del PR convirtiéndolo a formato Metadata API y desplegando con `--metadata-dir` (stateless), eligiendo el org objetivo según la rama base del PR (`dev`→cpsandbox, `main`→Release). `deploy.yml` mantiene la lógica de delta pero con los `sf project deploy start` reales comentados; se agrega un bloque comentado para push→main→Release.

**Tech Stack:** GitHub Actions, Salesforce CLI (`sf`), plugin `sfdx-git-delta`, bash en `ubuntu-latest`.

## Global Constraints

- Salesforce CLI se instala desde el canal `stable` (`sf-linux-x64.tar.xz`); plugin `sfdx-git-delta` vía `sf plugins install`.
- API version de los `package.xml` generados/placeholder: **67.0** (coincide con `sourceApiVersion` de `sfdx-project.json` y la salida de sgd).
- Auth en CI vía secrets SFDX Auth URL: `SF_AUTH_URL_SANDBOX` (cpsandbox), `SF_AUTH_URL_RELEASE` (Release), `SF_AUTH_URL_PROD` (PROD). Guard no-bloqueante: si falta el secret, `::warning::` y skip.
- Alias local para pruebas: `cpsandbox` y `Release` (ya autenticados; IDs `00DWe000006nhOX` y `00DWD00000EN4sT`).
- Mantener la exclusión de ramas `release/sync-prod-*` en el job de validación.
- Delta siempre por `merge-base` (tres-puntos), no diff directo.
- Comando mdapi canónico (constructive + destructive opcional):
  ```bash
  sf sgd source delta --from "$BASE" --to "$HEAD" --output-dir delta --generate-delta
  HAS_TYPES=$(grep -c "<types>" delta/package/package.xml || true)
  HAS_DESTRUCT=$(grep -c "<types>" delta/destructiveChanges/destructiveChanges.xml 2>/dev/null || true)
  rm -rf mdout
  if [ "$HAS_TYPES" -gt 0 ]; then
    sf project convert source --root-dir delta/force-app --output-dir mdout
  elif [ "$HAS_DESTRUCT" -gt 0 ]; then
    mkdir -p mdout
    printf '<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n    <version>67.0</version>\n</Package>\n' > mdout/package.xml
  fi
  if [ "$HAS_DESTRUCT" -gt 0 ]; then
    cp delta/destructiveChanges/destructiveChanges.xml mdout/destructiveChangesPost.xml
  fi
  # luego: sf project deploy start --metadata-dir mdout -o <org> [--dry-run] --ignore-conflicts
  ```

---

## File Structure

- Modify: `.github/workflows/ci.yml` — reescribir el job `validate-deploy` (steps desde el guard).
- Modify: `.github/workflows/deploy.yml` — comentar `deploy start` reales; agregar bloque comentado Release.
- Reference: `docs/superpowers/specs/2026-10-15-cicd-preprod-release-design.md` — spec aprobado.

---

### Task 1: ci.yml — validación mdapi con org según rama base

**Files:**

- Modify: `.github/workflows/ci.yml:42-116` (job `validate-deploy`)
- Reference: `docs/superpowers/specs/2026-10-15-cicd-preprod-release-design.md`

**Interfaces:**

- Consumes: secrets `SF_AUTH_URL_SANDBOX`, `SF_AUTH_URL_RELEASE`; `github.base_ref`, `github.head_ref`, `github.event.pull_request.base.sha/head.sha`.
- Produces: job `validate-deploy` que valida el delta (dry-run) contra `cpsandbox` (PR→dev) o `Release` (PR→main) usando `--metadata-dir`. El org autenticado usa alias fijo `target`.

- [ ] **Step 1: Reproducir el método localmente contra cpsandbox (prueba del "camino dev")**

El delta debe validar sin `NothingToDeploy` ni `not found in zipped directory`. Usar una rama con cambios reales (ej. `feature/SaFo-38...` vs `dev`):

```bash
cd C:/Users/21596/Documents/Dev/Salesforce_Almex_SFDX
git fetch origin dev feature/SaFo-38-deuda-tecnica-matriz-acceso
BASE=$(git merge-base origin/dev origin/feature/SaFo-38-deuda-tecnica-matriz-acceso)
HEAD=$(git rev-parse origin/feature/SaFo-38-deuda-tecnica-matriz-acceso)
rm -rf delta mdout && mkdir delta
sf sgd source delta --from "$BASE" --to "$HEAD" --output-dir delta --generate-delta
sf project convert source --root-dir delta/force-app --output-dir mdout
cp delta/destructiveChanges/destructiveChanges.xml mdout/destructiveChangesPost.xml 2>/dev/null || true
sf project deploy start --metadata-dir mdout -o cpsandbox --dry-run --ignore-conflicts
```

Expected: el deploy llega al org (Deploy ID), `Components: 2/2` para los profiles. Puede fallar SOLO por el destructive del permset ausente en cpsandbox (`No PermissionSet named ALMEX_FormPrices_Access found`) — eso es dato, no infra. **Clave:** NO debe aparecer `NothingToDeploy` ni `not found in zipped directory`.

- [ ] **Step 2: Reproducir el método localmente contra Release (prueba del "camino main")**

```bash
sf project deploy start --metadata-dir mdout -o Release --dry-run --ignore-conflicts
```

Expected: resuelve los componentes contra Release (Deploy ID emitido). Registrar el resultado (éxito o fallos reales de contenido del org Release). Confirma que el alias `Release` y el método mdapi funcionan contra ese org.

- [ ] **Step 3: Reescribir el job `validate-deploy` en ci.yml**

Reemplazar íntegro el job `validate-deploy` (desde `  validate-deploy:` hasta el final del archivo) por:

```yaml
validate-deploy:
  name: Validar deploy del delta (dry-run)
  # Se omite en ramas release/sync-prod-*: esos PR son flujo inverso prod->repo
  # (ver docs/07). Validar metadata de PROD contra el sandbox da falsos ❌.
  if: github.event_name == 'pull_request' && !startsWith(github.head_ref, 'release/sync-prod-')
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0 # historia completa para calcular el delta

    - uses: actions/setup-node@v4
      with:
        node-version: "20"
        cache: npm

    # Org objetivo segun la rama BASE del PR:
    #   base dev  -> cpsandbox (SF_AUTH_URL_SANDBOX)
    #   base main -> Release/PreProd (SF_AUTH_URL_RELEASE)
    # Guard no-bloqueante: si falta el secret, avisa y se omite.
    - name: Determinar org objetivo y credenciales
      id: guard
      run: |
        if [ "${{ github.base_ref }}" = "main" ]; then
          ORG_LABEL="Release (PreProd)"
          SECRET="${{ secrets.SF_AUTH_URL_RELEASE }}"
        else
          ORG_LABEL="cpsandbox"
          SECRET="${{ secrets.SF_AUTH_URL_SANDBOX }}"
        fi
        echo "org_label=$ORG_LABEL" >> "$GITHUB_OUTPUT"
        if [ -z "$SECRET" ]; then
          echo "::warning::Secret de auth para $ORG_LABEL no configurado; se omite la validacion de deploy."
          echo "ready=false" >> "$GITHUB_OUTPUT"
        else
          echo "ready=true" >> "$GITHUB_OUTPUT"
        fi

    - name: Instalar Salesforce CLI
      if: steps.guard.outputs.ready == 'true'
      run: |
        curl -fsSL https://developer.salesforce.com/media/salesforce-cli/sf/channels/stable/sf-linux-x64.tar.xz | tar xJ -C "$HOME"
        echo "$HOME/sf/bin" >> "$GITHUB_PATH"

    - name: Instalar plugin sfdx-git-delta
      if: steps.guard.outputs.ready == 'true'
      run: echo y | sf plugins install sfdx-git-delta

    - name: Autenticar org objetivo (SFDX Auth URL)
      if: steps.guard.outputs.ready == 'true'
      run: |
        if [ "${{ github.base_ref }}" = "main" ]; then
          printf '%s' "${{ secrets.SF_AUTH_URL_RELEASE }}" > "$RUNNER_TEMP/sfauth"
        else
          printf '%s' "${{ secrets.SF_AUTH_URL_SANDBOX }}" > "$RUNNER_TEMP/sfauth"
        fi
        sf org login sfdx-url --sfdx-url-file "$RUNNER_TEMP/sfauth" --alias target --set-default
        rm -f "$RUNNER_TEMP/sfauth"

    - name: Calcular delta del PR (merge-base -> head)
      if: steps.guard.outputs.ready == 'true'
      run: |
        BASE_REF="${{ github.event.pull_request.base.sha }}"
        HEAD="${{ github.event.pull_request.head.sha }}"
        BASE=$(git merge-base "$BASE_REF" "$HEAD")
        echo "Delta desde merge-base $BASE hasta $HEAD"
        rm -rf delta && mkdir delta
        sf sgd source delta --from "$BASE" --to "$HEAD" --output-dir delta --generate-delta
        echo "----- package.xml (constructive) -----"
        cat delta/package/package.xml
        echo "----- destructiveChanges.xml -----"
        cat delta/destructiveChanges/destructiveChanges.xml 2>/dev/null || echo "(sin borrados)"

    # Metodo robusto: convertir source->mdapi y desplegar --metadata-dir.
    # Evita el matching manifest<->filesystem de -x (falla en Linux con
    # fullNames con espacios/acentos) y el NothingToDeploy de -d (source tracking).
    - name: Validar deploy (check-only, metodo mdapi)
      if: steps.guard.outputs.ready == 'true'
      run: |
        HAS_TYPES=$(grep -c "<types>" delta/package/package.xml || true)
        HAS_DESTRUCT=$(grep -c "<types>" delta/destructiveChanges/destructiveChanges.xml 2>/dev/null || true)
        rm -rf mdout
        if [ "$HAS_TYPES" -gt 0 ]; then
          sf project convert source --root-dir delta/force-app --output-dir mdout
        elif [ "$HAS_DESTRUCT" -gt 0 ]; then
          mkdir -p mdout
          printf '<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n    <version>67.0</version>\n</Package>\n' > mdout/package.xml
        fi
        if [ "$HAS_DESTRUCT" -gt 0 ]; then
          cp delta/destructiveChanges/destructiveChanges.xml mdout/destructiveChangesPost.xml
        fi
        if [ -d mdout ]; then
          echo "Validando delta contra ${{ steps.guard.outputs.org_label }} (dry-run)..."
          sf project deploy start --metadata-dir mdout -o target --dry-run --ignore-conflicts
        else
          echo "Sin metadata en el delta; nada que validar."
        fi
```

- [ ] **Step 4: Verificar sintaxis YAML**

```bash
python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('ci.yml OK')"
```

Expected: `ci.yml OK` (sin excepción). Si no hay `python`, usar `python3`.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "feat(ci): validar delta por mdapi --metadata-dir y org segun rama base

PR->dev valida en cpsandbox, PR->main en Release (PreProd). Reemplaza -x/-d
(que fallan en runner Linux con profiles de nombres con espacios/acentos) por
convert source->mdapi + deploy --metadata-dir (stateless). Guard para
SF_AUTH_URL_RELEASE no-bloqueante.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: deploy.yml — comentar deploys reales + bloque Release

**Files:**

- Modify: `.github/workflows/deploy.yml:88-108` (step "Desplegar delta a Sandbox")
- Modify: `.github/workflows/deploy.yml:147-151` (steps de validación/deploy a PROD)
- Modify: `.github/workflows/deploy.yml` (agregar job comentado `release` tras el job `sandbox`)

**Interfaces:**

- Consumes: delta ya calculado en el step previo (`delta/package/package.xml`, `delta/destructiveChanges/destructiveChanges.xml`).
- Produces: `deploy.yml` sin ningún `sf project deploy start` real activo; lógica lista para reactivar con método mdapi; bloque Release documentado.

- [ ] **Step 1: Comentar el deploy real a Sandbox**

Reemplazar el step "Desplegar delta a Sandbox" (líneas ~88-108) por:

```yaml
- name: Desplegar delta a Sandbox (DESHABILITADO)
  if: steps.guard.outputs.ready == 'true'
  run: |
    HAS_TYPES=$(grep -c "<types>" delta/package/package.xml || true)
    HAS_DESTRUCT=$(grep -c "<types>" delta/destructiveChanges/destructiveChanges.xml || true)
    echo "::notice::Deploy automatico a Sandbox DESHABILITADO. Deploy manual desde terminal."
    echo "Delta calculado (constructive types=$HAS_TYPES, destructive=$HAS_DESTRUCT)."
    # --- DEPLOY REAL COMENTADO (se deploya manual desde terminal) ---
    # Para reactivar, descomentar (metodo mdapi robusto):
    #   rm -rf mdout
    #   if [ "$HAS_TYPES" -gt 0 ]; then
    #     sf project convert source --root-dir delta/force-app --output-dir mdout
    #   elif [ "$HAS_DESTRUCT" -gt 0 ]; then
    #     mkdir -p mdout
    #     printf '<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n    <version>67.0</version>\n</Package>\n' > mdout/package.xml
    #   fi
    #   [ "$HAS_DESTRUCT" -gt 0 ] && cp delta/destructiveChanges/destructiveChanges.xml mdout/destructiveChangesPost.xml
    #   [ -d mdout ] && sf project deploy start --metadata-dir mdout -o sandbox --ignore-conflicts
```

- [ ] **Step 2: Comentar el deploy real a PROD**

En el job `prod`, reemplazar los steps de validar/deploy (líneas ~147-151) por:

```yaml
- name: Deploy a Produccion (DESHABILITADO)
  run: |
    echo "::notice::Deploy automatico a PROD DESHABILITADO. Deploy manual desde terminal."
    # --- DEPLOY REAL COMENTADO (se deploya manual desde terminal) ---
    # Validacion dry-run (solo cotizadorManufacturados):
    #   sf project deploy start -d "$DEPLOY_PATH" -o prod --dry-run
    # Deploy real:
    #   sf project deploy start -d "$DEPLOY_PATH" -o prod
```

- [ ] **Step 3: Agregar job `release` comentado (push→main→PreProd)**

Insertar tras el cierre del job `sandbox` (antes de `  prod:`) este bloque **completamente comentado**:

```yaml
# ------------------------------------------------------------------
# PreProd (Release): auto-deploy del delta al mergear a main.
# DESHABILITADO por ahora (deploy manual desde terminal).
# Para activar: (1) agregar `main` a `on.push.branches` arriba,
# (2) descomentar este job, (3) tener el secret SF_AUTH_URL_RELEASE.
# ------------------------------------------------------------------
# release:
#   name: Deploy delta a Release (PreProd)
#   if: github.event_name == 'push' && github.ref == 'refs/heads/main'
#   runs-on: ubuntu-latest
#   steps:
#     - uses: actions/checkout@v4
#       with:
#         fetch-depth: 0
#     - uses: actions/setup-node@v4
#       with:
#         node-version: "20"
#         cache: npm
#     - name: Verificar credenciales
#       id: guard
#       run: |
#         if [ -z "${{ secrets.SF_AUTH_URL_RELEASE }}" ]; then
#           echo "::warning::SF_AUTH_URL_RELEASE no configurado; se omite."
#           echo "ready=false" >> "$GITHUB_OUTPUT"
#         else
#           echo "ready=true" >> "$GITHUB_OUTPUT"
#         fi
#     - name: Instalar Salesforce CLI
#       if: steps.guard.outputs.ready == 'true'
#       run: |
#         curl -fsSL https://developer.salesforce.com/media/salesforce-cli/sf/channels/stable/sf-linux-x64.tar.xz | tar xJ -C "$HOME"
#         echo "$HOME/sf/bin" >> "$GITHUB_PATH"
#     - name: Instalar plugin sfdx-git-delta
#       if: steps.guard.outputs.ready == 'true'
#       run: echo y | sf plugins install sfdx-git-delta
#     - name: Autenticar Release (SFDX Auth URL)
#       if: steps.guard.outputs.ready == 'true'
#       run: |
#         printf '%s' "${{ secrets.SF_AUTH_URL_RELEASE }}" > "$RUNNER_TEMP/sfauth"
#         sf org login sfdx-url --sfdx-url-file "$RUNNER_TEMP/sfauth" --alias release --set-default
#         rm -f "$RUNNER_TEMP/sfauth"
#     - name: Calcular delta (solo lo del push)
#       if: steps.guard.outputs.ready == 'true'
#       run: |
#         BEFORE="${{ github.event.before }}"
#         AFTER="${{ github.sha }}"
#         if [ -z "$BEFORE" ] || [ "$BEFORE" = "0000000000000000000000000000000000000000" ]; then
#           BEFORE=$(git rev-parse "$AFTER^" 2>/dev/null || echo "$AFTER")
#         fi
#         rm -rf delta && mkdir delta
#         sf sgd source delta --from "$BEFORE" --to "$AFTER" --output-dir delta --generate-delta
#     - name: Desplegar delta a Release (metodo mdapi)
#       if: steps.guard.outputs.ready == 'true'
#       run: |
#         HAS_TYPES=$(grep -c "<types>" delta/package/package.xml || true)
#         HAS_DESTRUCT=$(grep -c "<types>" delta/destructiveChanges/destructiveChanges.xml || true)
#         rm -rf mdout
#         if [ "$HAS_TYPES" -gt 0 ]; then
#           sf project convert source --root-dir delta/force-app --output-dir mdout
#         elif [ "$HAS_DESTRUCT" -gt 0 ]; then
#           mkdir -p mdout
#           printf '<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n    <version>67.0</version>\n</Package>\n' > mdout/package.xml
#         fi
#         [ "$HAS_DESTRUCT" -gt 0 ] && cp delta/destructiveChanges/destructiveChanges.xml mdout/destructiveChangesPost.xml
#         [ -d mdout ] && sf project deploy start --metadata-dir mdout -o release --ignore-conflicts
```

- [ ] **Step 4: Verificar que no queda ningún `deploy start` real activo**

```bash
grep -nE "^[[:space:]]*sf project deploy start" .github/workflows/deploy.yml
```

Expected: **sin resultados** (todos los `deploy start` reales están comentados con `#` al inicio).

- [ ] **Step 5: Verificar sintaxis YAML**

```bash
python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy.yml')); print('deploy.yml OK')"
```

Expected: `deploy.yml OK`.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "chore(ci): comentar deploys reales; bloque Release PreProd listo

Deploys se hacen manual desde terminal: se comentan los 'sf project deploy
start' de sandbox y prod, dejando el calculo de delta visible. Se agrega
(comentado) el job 'release' para auto-deploy del delta a Release/PreProd en
push a main, con metodo mdapi y guard SF_AUTH_URL_RELEASE.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Verificación integral en CI (push de la rama + PR de prueba)

**Files:**

- Reference: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

**Interfaces:**

- Consumes: rama `feat/cicd-preprod-release` con Tasks 1-2 commiteadas.
- Produces: evidencia de que el job `validate-deploy` corre con el método mdapi en un PR real (sin `NothingToDeploy`/`not found in zipped directory`).

- [ ] **Step 1: Push de la rama**

```bash
git push -u origin feat/cicd-preprod-release
```

Expected: rama publicada.

- [ ] **Step 2: Abrir PR hacia dev y observar el check**

```bash
gh pr create --base dev --head feat/cicd-preprod-release --title "CI/CD: fix mdapi + PreProd Release" --body "Ver docs/superpowers/specs/2026-10-15-cicd-preprod-release-design.md" 2>/dev/null || echo "PR ya existe"
gh pr checks feat/cicd-preprod-release --watch
```

Expected: el job "Validar deploy del delta (dry-run)" ejecuta el método mdapi contra cpsandbox. Dado que esta rama solo cambia workflows+docs (sin metadata SF), el delta no tiene `<types>` → "Sin metadata en el delta; nada que validar" → verde.

- [ ] **Step 3: (Opcional) Confirmar camino main con un PR dummy**

Si se quiere validar el camino `base=main` antes de usarlo en real, abrir un PR de la rama hacia `main` y confirmar que el guard elige Release y (al no haber metadata) reporta "nada que validar". No mergear; cerrar el PR dummy.

Expected: el log muestra "Release (PreProd)" como org objetivo y el guard `ready=true` (secret presente).

- [ ] **Step 4: Reportar evidencia**

Resumir en el PR: qué job corrió, contra qué org, y el resultado. No marcar como completo sin el log real del run.

---

## Self-Review

**Spec coverage:**

- Método mdapi `--metadata-dir` → Task 1 Step 3 (ci) + Task 2 Steps 1-3 (deploy, comentado). ✅
- Org según rama base (dev→cpsandbox, main→Release) → Task 1 Step 3 (guard + auth). ✅
- Guard `SF_AUTH_URL_RELEASE` no-bloqueante → Task 1 Step 3. ✅
- Deploys reales comentados → Task 2 Steps 1-2. ✅
- Bloque Release push→main (comentado, listo) → Task 2 Step 3. ✅
- Edge cases (sin cambios / solo destructive) → Global Constraints + Task 1 Step 3. ✅
- Exclusión `release/sync-prod-*`, merge-base → Task 1 Step 3. ✅
- Script manual diferido → fuera de alcance (spec sección 3). ✅ (no task, correcto)

**Placeholder scan:** sin TBD/TODO; YAML y comandos completos. ✅

**Consistency:** alias `target` (ci) y `release`/`sandbox`/`prod` (deploy) usados consistentemente; API 67.0 en todos los placeholders; `--ignore-conflicts` en dry-run y apply. ✅
