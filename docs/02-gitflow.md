[← Volver a la Wiki](../README.md)

# 2. Git Flow y ramas

## Modelo de ramas

| Rama | Propósito | Permisos |
|------|-----------|----------|
| **`dev`** | Rama de trabajo del equipo. **Default del repo.** | Push directo permitido |
| **`main`** | Producción. Refleja lo que va a la org de prod. | 🔒 Protegida — solo por PR aprobado |

```
dev  ──commit/push──►  origin/dev  ──Pull Request──►  main (prod)
                                          │
                                          └─ requiere aprobación de
                                             @Getsemani-Avila-Almidones
```

## Flujo diario del equipo

```bash
git checkout dev
git pull                       # trae lo último

# ...editar LWC / Apex / etc...

git add -A
git commit -m "feat: descripcion del cambio"
git push origin dev            # directo, permitido
```

## Llevar cambios a producción (`main`)

1. Abre un **Pull Request** `dev → main` en GitHub:
   ```bash
   gh pr create --base main --head dev --title "Release: ..." --body "Resumen de cambios"
   ```
2. **@Getsemani-Avila-Almidones** revisa y **aprueba**.
3. Merge del PR. Con eso `main` queda actualizado.
4. El despliegue a producción se hace **manualmente** (no automático). Ver [CI/CD](03-cicd.md).

## Reglas de protección de `main` (ya configuradas)

| Regla | Estado |
|-------|--------|
| Push directo a `main` | ❌ Bloqueado (requiere PR) |
| Aprobaciones requeridas | ✅ 1 |
| Revisión de **CODEOWNERS** | ✅ (solo tu aprobación cuenta) |
| Se descartan aprobaciones al hacer nuevo push | ✅ |
| Resolver conversaciones antes de merge | ✅ |
| Force-push / borrado de rama | ❌ Bloqueado |
| Admins pueden mergear sus propios PRs | ✅ (`enforce_admins=false`) |

El archivo [`.github/CODEOWNERS`](../.github/CODEOWNERS) define a `@Getsemani-Avila-Almidones` como dueño de todo el repo, por lo que **cualquier PR a `main` necesita su aprobación**.

## Convención de mensajes de commit (recomendada)

Formato [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: nuevo campo en cotizador
fix: corrige cálculo de flete en QuoteLineItem
docs: actualiza wiki de CI/CD
refactor: simplifica ETC_Utility
```

---
[Siguiente: CI/CD →](03-cicd.md)
