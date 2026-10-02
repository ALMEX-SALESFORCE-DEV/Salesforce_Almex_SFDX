[← Volver a la Wiki](../README.md)

> **Gobernanza:** este repo opera bajo la normativa de TI (vault). Ver [Gobernanza](00-gobernanza.md). Ante discrepancia, manda el vault.

# 2. Git Flow y ramas

Este flujo sigue el estándar interno de TI (modelo de ramas por release, cadencia
semanal de PR y mapeo a ambientes DEV/TEST/PROD).

## Modelo de ramas

| Rama | Propósito | Ambiente | Permisos |
|------|-----------|----------|----------|
| **`feature/<nombre>`** | Trabajo de una feature (una por cambio). | — | Se integra a `dev` **solo vía PR revisado** |
| **`dev`** | Rama de integración del equipo. **Default del repo.** | **DEV** (`cpsandbox`) | 🔒 Sin push directo — solo por PR |
| **`release/YYYY-MM-DD`** | Snapshot congelado de `dev` listo para prod. Aísla lo que va a producción del trabajo que sigue entrando a `dev`. | **TEST/QA** | Se corta desde `dev` (rama temporal) |
| **`main`** | Producción. Refleja lo que va a la org de prod. | **PROD** | 🔒 Protegida — solo por PR aprobado |

```
feature/<nombre> ──PR (review)──► dev ──corte──► release/YYYY-MM-DD ──PR──► main (prod)
                                   │                                          │
                              (org DEV)         (org TEST/QA)            (deploy manual)
                                   ▲                                          │
                                   └────────── back-merge main → dev ─────────┘
```

**¿Por qué una rama `release/*`?** `dev` puede recibir cambios en validación en
cualquier momento. Al cortar `release/YYYY-MM-DD` desde `dev` y abrir el PR desde
esa rama, `main` recibe **solo** el snapshot congelado; el trabajo que siga entrando
a `dev` no se cuela a producción.

## Mapeo rama ↔ ambiente

| Ambiente | Rama | Org Salesforce |
|----------|------|----------------|
| DEV | `dev` | `cpsandbox` |
| TEST / QA | `release/YYYY-MM-DD` | `cpsandbox` *(ver nota)* |
| PROD | `main` | `ALMEX-Production` |

> **Nota (una sola sandbox):** este proyecto solo dispone de `cpsandbox`, así que
> `dev` y `release/*` se validan en **la misma sandbox** (DEV + TEST) como
> **excepción registrada** a la separación de ambientes. `release/*` se valida en
> `cpsandbox` antes de promover a `main`.

## Flujo diario del equipo (`feature` → `dev`)

```bash
git checkout dev
git pull                                # trae lo último
git checkout -b feature/mi-cambio       # rama de feature

# ...editar LWC / Apex / etc...

git add -A
git commit -m "feat: descripcion del cambio"
git push origin feature/mi-cambio

# Abrir PR feature/mi-cambio → dev
gh pr create --base dev --head feature/mi-cambio \
  --title "feat: mi cambio" --body "Resumen y contexto"
```

El PR se revisa según la **cadencia semanal** (abajo). Al aprobarse, se fusiona a
`dev` y se valida en la org DEV (`cpsandbox`).

## Cadencia semanal de revisión

| Momento | Acción |
|---------|--------|
| **Lunes (fin del día)** | Cierre de recepción de PRs del ciclo: PR abierto, **CI en verde**, descripción completa. PRs posteriores → ciclo siguiente. |
| **Martes** | Primer feedback del revisor (≤ 1 día hábil). |
| **Miércoles–Jueves** | El autor atiende comentarios y re-solicita revisión. |
| **Jueves–Viernes** | Re-revisión. |
| **Viernes 15:00 (corte)** | Aprobado → **merge a `dev`**. Con issues → **no se fusiona**; recorre al ciclo siguiente. |

- Un PR que recorre **≥ 2 ciclos** sin aprobarse se **escala al líder técnico**
  (partir el PR, repriorizar o reasignar).
- **Hotfix crítico:** fuera de la cadencia (flujo acelerado).

## Llevar cambios a producción (`release/YYYY-MM-DD` → `main`)

1. Corta la rama de release desde `dev` (snapshot congelado):
   ```bash
   git checkout dev
   git pull
   git checkout -b release/2026-09-28      # release/AAAA-MM-DD
   git push origin release/2026-09-28
   ```
2. Valida el release en `cpsandbox` (TEST/QA).
3. Abre un **Pull Request** `release/2026-09-28 → main`:
   ```bash
   gh pr create --base main --head release/2026-09-28 \
     --title "Release 2026-09-28" --body "Resumen de cambios"
   ```
4. La CI corre sobre el PR (tests + validación del delta). Ver [CI/CD](03-cicd.md).
5. **@Getsemani-Avila-Almidones** revisa y **aprueba**.
6. Merge del PR → `main` queda actualizado.
7. El **despliegue a producción es manual** (no automático), dentro de la **ventana
   autorizada** (preferente lunes/martes). Ver [CI/CD](03-cicd.md).
8. **Back-merge `main → dev`** para no perder nada resuelto en el PR:
   ```bash
   git checkout dev && git merge origin/main && git push origin dev
   ```

> **Ventana y anticipación:** el PR `release → main` debe entregarse con
> **≥ 3 días hábiles de anticipación** a la ventana de despliegue, con su paquete
> completo (PR verde, Control de Cambios/RFC, diccionarios/doc. técnica y solicitudes
> de acceso). Paquete tardío o incompleto → recorre a la siguiente ventana.

> Nota: las reglas de protección aplican por **base = `main`**, así que un PR desde
> `release/*` cumple las mismas reglas que cualquier otro.

## Reglas de protección

**`main` (ya configuradas):**

| Regla | Estado |
|-------|--------|
| Push directo a `main` | ❌ Bloqueado (requiere PR) |
| Aprobaciones requeridas | ✅ 1 |
| Revisión de **CODEOWNERS** | ✅ |
| Se descartan aprobaciones al hacer nuevo push | ✅ |
| Resolver conversaciones antes de merge | ✅ |
| Force-push / borrado de rama | ❌ Bloqueado |

**`dev` (objetivo — por configurar):** proteger `dev` para exigir **PR + revisión**
(sin push directo), alineado con la cadencia. La política concreta de revisión
(quién aprueba, self-approval, nº de aprobaciones) está **en definición**.

El archivo [`.github/CODEOWNERS`](../.github/CODEOWNERS) define a
`@Getsemani-Avila-Almidones` como dueño del repo.

## Convención de mensajes de commit

Formato [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: nuevo campo en cotizador
fix: corrige cálculo de flete en QuoteLineItem
docs: actualiza wiki de CI/CD
refactor: simplifica ETC_Utility
```

---
[Siguiente: CI/CD →](03-cicd.md)
