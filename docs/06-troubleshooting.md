[← Volver a la Wiki](../README.md)

# 6. Troubleshooting

## `npm ci` falla: "can only install with an existing package-lock.json"

El repo aún no tiene `package-lock.json` y el CI usa `npm ci` (que lo exige).

**Solución:**
```bash
npm install                 # genera package-lock.json
git add package-lock.json
git commit -m "chore: add package-lock.json"
git push origin dev
```

## `npm run test:unit` falla: "No tests found"

No existen archivos `__tests__/*.test.js` y `sfdx-lwc-jest` termina con error, bloqueando el CI y el deploy.

**Opciones:**
- Escribir al menos un test (recomendado), p. ej. `force-app/main/default/lwc/cotizadorManufacturados/__tests__/cotizadorManufacturados.test.js`.
- Temporal: cambiar en `package.json` →
  ```json
  "test:unit": "sfdx-lwc-jest -- --passWithNoTests"
  ```

## `git@github.com: Permission denied (publickey)`

El remoto estaba en SSH y no hay llave configurada. El repo ya está en **HTTPS** (usa el token de `gh`). Si vuelve a aparecer:
```bash
git remote set-url origin https://github.com/ALMEX-SALESFORCE-DEV/Salesforce_Almex_SFDX.git
git remote set-url --push origin https://github.com/ALMEX-SALESFORCE-DEV/Salesforce_Almex_SFDX.git
gh auth setup-git
```

## `fatal: LF would be replaced by CRLF`

En Windows Git intenta convertir finales de línea. Desactiva la conversión en este repo:
```bash
git config core.autocrlf false
git config core.safecrlf false
```

## No puedo hacer push a `main`

Es intencional — `main` está protegida. Trabaja en `dev` y abre un PR:
```bash
git checkout dev
gh pr create --base main --head dev
```
Ver [Git Flow](02-gitflow.md).

## El retrieve completo omite algunos tipos

En el retrieve inicial (2026-09-23) algunos tipos no se pudieron traer por límites de la org (no son errores del proyecto):
`WorkflowFlowAutomation`, algunos `Layout`, `ExperienceBundle`, `ConnectedApp CPQIntegrationUserApp`, `NetworkBranding`.

- **ExperienceBundle:** habilítalo en *Setup → Digital Experiences → Settings → Enable ExperienceBundle Metadata API* y vuelve a hacer retrieve.

## El deploy a prod no arranca solo

Es correcto: **no está automatizado**. Lánzalo manualmente desde *Actions → Deploy → Run workflow* escribiendo `DEPLOY`. Ver [CI/CD](03-cicd.md).

---
[← Volver a la Wiki](../README.md)
