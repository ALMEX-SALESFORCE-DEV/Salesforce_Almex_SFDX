[← Volver a la Wiki](../README.md)

# 0. Gobernanza: este repo opera bajo la normativa de TI

Este repositorio **se rige por la normativa del área de TI** (el "vault"). La
documentación de este repo son **reglas estrictas y operativas** que aterrizan
esa normativa para `Salesforce_Almex_SFDX`; **no la sustituyen ni la contradicen**.
Ante cualquier discrepancia, **manda la normativa del vault**.

## Documentos normativos aplicables (vault)

| Documento | Rige |
|-----------|------|
| `POL-DEV-001` | Ambientes y pase a producción (DEV/TEST/PROD, ventanas) |
| `POL-DEV-002` | Revisión de código (PR, cadencia semanal) |
| `POL-DEV-003` | Control de versiones |
| `STD-DEV-003` | CI/CD, gates de calidad, modelo de ramas, lead time |
| `STD-DEV-004` | Desarrollo Salesforce (Apex/LWC): reglas verificables |
| `GUI-DEV-002` | Guía de despliegue Salesforce (incl. tabla de conformidad) |
| `GUI-DEV-003` | Buenas prácticas de desarrollo Salesforce |

## Estado de conformidad (brechas conocidas)

Estas brechas son **excepciones temporales registradas**; se cierran según su
fecha objetivo. La versión autoritativa vive en `GUI-DEV-002` del vault.

| Gate | Estado | Objetivo | Fecha |
|------|--------|----------|-------|
| `package-lock.json` | ✗ falta | Commitear lockfile | 2026-10-03 |
| Jest (LWC) | ⚠️ sin tests | ≥1 test real | 2026-10-10 |
| ESLint/Prettier | ⚠️ informativo | Bloqueante en archivos cambiados | 2026-10-24 |
| PMD (Apex) | ✗ ausente | Bloqueante en seguridad (CRUD/FLS, sharing, inyección SOQL) | 2026-10-31 |
| Apex tests + cobertura ≥75% | ⚠️ solo al deploy | Gate en PR `release`→`main` | 2026-11-14 |
| Alcance del deploy | ⚠️ un bundle | Delta del release (`sfdx-git-delta`) | 2026-11-28 |
| Separación DEV/TEST | ⚠️ una sandbox | Excepción DEV+TEST registrada | Vigente |

## Dueño y sincronía

- **Dueño de la sincronía vault ↔ repo:** Getsemani Ávila Quezada (Jefe de Aplicaciones).
- **Regla de sincronía por evento:** todo cambio al pipeline / CI (`.github/workflows/`)
  **debe** actualizar esta tabla y la de `GUI-DEV-002`. Es un ítem del checklist del PR.

---
[Siguiente: Setup →](01-setup.md)
