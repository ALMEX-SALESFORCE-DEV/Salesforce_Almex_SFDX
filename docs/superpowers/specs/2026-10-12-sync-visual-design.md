# Diseño: Visualización del Prod-Sync y Gitflow

**Fecha:** 2026-10-12
**Estado:** aprobado (brainstorming)
**Relacionado:** [docs/07-sync-prod-a-main.md](../../07-sync-prod-a-main.md), [auto-sync-prod.yml](../../../.github/workflows/auto-sync-prod.yml)

## Problema

La parte administrativa de sistemas necesita ver el flujo (gitflow + prod-sync) de
forma **visual** y dar seguimiento **oportuno** a cada corrida del auto-sync, sin leer
YAML ni logs crudos.

## Decisiones (brainstorming)

- **Qué:** diagrama del proceso (estático) **+** reporte por corrida (dinámico).
- **Reporte:** Job Summary visual **+** artefacto descargable. **Sin Teams** (sin acceso),
  sin Issue.
- **Grafo de etapas:** opción **B** — partir el workflow en jobs (`needs:`) para que
  GitHub dibuje el grafo nativo multi-nodo. Límite: retrieve+commit comparten disco →
  viven en un job; el estado viaja por git (push) y por job outputs, no por artifacts.
- Todo **nativo de GitHub** (Mermaid en Markdown + Actions). Sin dashboards externos,
  GitHub Pages ni Projects (YAGNI).

## Componentes

### 1. Diagramas estáticos (Mermaid)
- **README:** flowchart maestro del ciclo de vida (Repo ↔ PROD) con los dos sentidos:
  deploy MANUAL repo→prod, y auto-sync prod→repo (PR a main, no despliega). Leyenda de
  colores (PROD rojo, sync azul).
- **docs/07:** flowchart de los 8 pasos del sync + `gitGraph` (rama de sync sale de
  `main` y vuelve por PR). Nota de qué pasos automatiza el workflow vs humanos.

### 2. Badges en README
Estado de las últimas corridas de **Auto-Sync**, **CI** y **Deploy** (passing/failing).

### 3. Workflow en 3 jobs (`auto-sync-prod.yml`)

```
sincronizar → abrir-pr → reporte
```

| Job | Responsabilidad | Condición |
|-----|-----------------|-----------|
| `sincronizar` | checkout, auth, manifest, retrieve, poda, normaliza, commit + push. Outputs: `changed`, `files` | siempre |
| `abrir-pr` | abre/actualiza PR con `GH_PAT`. Output: `pr` | `needs: sincronizar`, if `changed==true` |
| `reporte` | Job Summary (resultado + tabla de etapas + mermaid + link al PR) y sube artefacto `sync-report.md` | `needs: [sincronizar, abrir-pr]`, `if: always()` |

- Datos entre jobs: **job outputs** (strings). El código: **git push**. Nada de artifacts pesados.
- `reporte` corre siempre: reporta éxito-con-cambios, éxito-sin-cambios, o fallo de `sincronizar`.
- El subir-artefacto y el reporte son **no-fatales** respecto al sync.

## Armonía con flujos existentes

- Solo edita `README.md`, `docs/07` y reescribe `auto-sync-prod.yml` (1→3 jobs). No toca
  `ci.yml`, `deploy.yml` ni la lógica del sync (mismos comandos, mismo orden).
- PROD sigue 100% manual. El merge del PR sigue siendo humano.

## Criterios de éxito

- En GitHub se ven: badges en README, diagrama maestro en README, diagramas en docs/07.
- Cada corrida del auto-sync muestra un **grafo de 3 nodos** con ✓/✗/skipped, un **Job
  Summary** legible y un **artefacto** `sync-report.md` descargable.
- Ningún otro workflow cambia su comportamiento.

## Fuera de alcance (YAGNI)

- Teams/Slack/email, auto-crear Issue, dashboards externos, GitHub Pages.
- Partir retrieve/commit en jobs separados (requeriría artifacts pesados).
