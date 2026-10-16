# Diseño: Auto-Sync PROD → main (programado)

**Fecha:** 2026-10-12
**Estado:** aprobado (brainstorming)
**Relacionado:** [docs/07-sync-prod-a-main.md](../../07-sync-prod-a-main.md), [docs/00-gobernanza.md](../../00-gobernanza.md), [docs/03-cicd.md](../../03-cicd.md)

## Problema

El sync PROD→repo de `docs/07` es manual: alguien corre el retrieve, limpia el ruido,
abre el PR. Se quiere que ese **captura + PR** ocurra solo, cada viernes en la noche,
para no depender de que alguien se acuerde. **Sin desplegar nada** — solo traer el
estado de PROD a `main` vía PR.

## Objetivo

Un workflow programado que cada viernes:
1. Trae el estado actual de PROD al repo (flujo inverso prod→repo).
2. Abre (o actualiza) un PR a `main` con ese drift.
3. **No mergea, no despliega.** El merge y el control de dirección (paso 5 de docs/07)
   siguen siendo humanos.

## Decisiones (brainstorming)

| Decisión | Elección | Por qué |
|----------|----------|---------|
| ¿Mergea o abre PR? | **Abre/actualiza PR a main** | El review es el control de seguridad (docs/07). Auto-merge saltaría el paso 5. |
| ¿Qué trae? | **Regenera manifiesto `--from-org` cada corrida** | Captura todo lo de prod hoy, incluso tipos nuevos. |
| ¿Rama/PR? | **Rama fija `release/sync-prod-auto` + 1 PR que se actualiza** | Sin spam; siempre el drift más fresco. |
| ¿Cuándo? | **Viernes 22:00 CST = `cron: "0 4 * * 6"` (sáb 04:00 UTC)** | Noche, org con poca actividad. |

## Arquitectura

**Archivo nuevo:** `.github/workflows/auto-sync-prod.yml`. No modifica `ci.yml`,
`deploy.yml` ni `youtrack-branch-issue.yml`.

**Disparadores:** `schedule` (cron) + `workflow_dispatch` (manual on-demand).
**Concurrencia:** `group: auto-sync-prod` para no encimar corridas.
**Permisos:** `contents: write` + `pull-requests: write` (solo `GITHUB_TOKEN`).

**Pasos (runner Linux efímero):**
1. Checkout de `main` (historia completa).
2. Guard: si falta `SF_AUTH_URL_PROD` → error y termina.
3. Instala Node + `sf` CLI.
4. Auth a PROD con `SF_AUTH_URL_PROD` (secret ya existente, reusado de `deploy.yml`).
5. `sf project generate manifest --from-org prod`.
6. `sf project retrieve start --manifest …` con `NODE_OPTIONS` heap elevado.
7. Poda ruido: elimina `force-app/main/default/profiles/` (18 MB que reordena cada
   retrieve; `.forceignore` lo cubrirá permanente cuando llegue a `main` por release).
8. Normaliza EOL: `git add --renormalize .` sobre `.gitattributes eol=lf`.
9. Si no hay cambios → termina sin hacer nada. Si hay → commit + `push -f` a
   `release/sync-prod-auto`.
10. Si no hay PR abierto para esa rama → lo crea a `main`; si ya existe, el push lo
    actualiza.

## Armonía con los flujos existentes

- Empuja a `release/sync-prod-auto`, **no a `dev`** → `deploy.yml` (push a `dev`) **no
  se dispara**. Cero riesgo de deploy.
- PROD sigue 100% manual (`workflow_dispatch` + `DEPLOY`). Este workflow solo trae datos.
- El nombre `release/sync-prod-auto` empata el prefijo `release/sync-prod-` → reusa el
  skip del dry-run (ver PR #19) una vez esté en `main`; el PR solo corre lint+tests.
- El workflow vive en la rama default (`dev`), requisito de GitHub para que el `schedule`
  dispare.

## Riesgos / límites conocidos

1. **OOM en el retrieve.** Local necesitó el script partido por el heap de Node. v1 hace
   retrieve único con heap elevado (runner ubuntu ~16 GB). Si revienta, v2 porta la
   lógica de chunking de `scripts/sync-prod-retrieve.ps1`.
2. **Skip del dry-run (#19) aún no en `main`.** Los primeros PR auto marcarán el ❌ de
   entorno (sandbox sin paridad) hasta que #19 llegue a `main` por release. No bloquea.
3. **GitHub puede retrasar crones** bajo carga (minutos). Aceptable para un job semanal.

## Fuera de alcance (YAGNI)

- No auto-mergea.
- No notifica por email/YouTrack (el PR es la señal).
- No maneja borrados (`destructiveChanges`): sync solo agrega/modifica; los borrados en
  prod se revisan a mano. Posible v2.
- No porta el chunking del retrieve (solo si el OOM lo obliga).

## Criterios de éxito

- Cada viernes, si PROD difiere de `main`, aparece/actualiza un PR a `main` con el drift.
- Si no hay diferencia, no se crea ruido (ni rama basura ni PR vacío).
- Ningún deploy se dispara por este workflow.
- El merge y la revisión de dirección siguen siendo manuales.
