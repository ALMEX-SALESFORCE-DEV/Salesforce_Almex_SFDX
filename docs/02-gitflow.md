[← Volver a la Wiki](../README.md)

# 2. Git Flow y ramas

## Modelo de ramas

| Rama | Propósito | Permisos |
|------|-----------|----------|
| **`dev`** | Rama de trabajo del equipo. **Default del repo.** | Push directo permitido |
| **`release/DDMMAAAA`** | Snapshot congelado de `dev` listo para prod. Aísla lo que va a producción del trabajo en validación que sigue entrando a `dev`. | Push permitido (rama temporal) |
| **`main`** | Producción. Refleja lo que va a la org de prod. | 🔒 Protegida — solo por PR aprobado |

```
dev  ──commit/push──►  origin/dev
                            │
                            │  (features validadas: se corta y congela)
                            ▼
                   release/DDMMAAAA  ──Pull Request──►  main (prod)
                                                │
                                                └─ requiere aprobación de
                                                   @Getsemani-Avila-Almidones
```

**¿Por qué una rama `release/*`?** `dev` puede recibir commits nuevos en validación en cualquier momento. Al cortar `release/DDMMAAAA` desde `dev` y abrir el PR desde esa rama, `main` recibe **solo** el snapshot congelado; el trabajo que siga entrando a `dev` no se cuela a producción.

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

1. Corta la rama de release desde `dev` (snapshot congelado):
   ```bash
   git checkout dev
   git pull
   git checkout -b release/DDMMAAAA     # ej: release/28092026
   git push origin release/DDMMAAAA
   ```
2. Abre un **Pull Request** `release/DDMMAAAA → main` en GitHub:
   ```bash
   gh pr create --base main --head release/DDMMAAAA \
     --title "Release DDMMAAAA" --body "Resumen de cambios"
   ```
3. La CI corre sobre el PR (tests Jest = gate; dry-run del delta). Ver [CI/CD](03-cicd.md).
4. **@Getsemani-Avila-Almidones** revisa y **aprueba**.
5. Merge del PR. Con eso `main` queda actualizado.
6. El despliegue a producción se hace **manualmente** (no automático). Ver [CI/CD](03-cicd.md).
7. **Back-merge** de `main → dev` para no perder nada que se haya resuelto en el PR:
   ```bash
   git checkout dev && git merge origin/main && git push origin dev
   ```

> Nota: las reglas de protección aplican por **base = `main`**, no por la rama de origen, así que un PR desde `release/*` cumple las mismas reglas que uno desde `dev`.

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
