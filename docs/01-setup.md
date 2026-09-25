[← Volver a la Wiki](../README.md)

# 1. Setup del entorno

## Requisitos

| Herramienta | Versión mínima | Descarga |
|-------------|----------------|----------|
| **Salesforce CLI** (`sf`) | 2.x | [developer.salesforce.com/tools/salesforcecli](https://developer.salesforce.com/tools/salesforcecli) |
| **Node.js** | 20 LTS | [nodejs.org](https://nodejs.org) |
| **Git** | 2.4+ | [git-scm.com](https://git-scm.com) |
| **VS Code + Salesforce Extension Pack** | — | [Instrucciones](https://developer.salesforce.com/docs/platform/sfvscode-extensions/guide/install.html) |

Verifica instalación:
```bash
sf version
node -v
git --version
```

## Clonar el repositorio

```bash
git clone https://github.com/ALMEX-SALESFORCE-DEV/Salesforce_Almex_SFDX.git
cd Salesforce_Almex_SFDX
npm install          # instala dependencias de LWC/Jest/ESLint
```

> El repo usa **HTTPS**. Si prefieres SSH, sube tu llave pública a GitHub y cambia el remoto:
> `git remote set-url origin git@github.com:ALMEX-SALESFORCE-DEV/Salesforce_Almex_SFDX.git`

## Autenticar las orgs

### Producción
```bash
sf org login web --alias ALMEX-Production --instance-url https://login.salesforce.com
```

### Sandbox
```bash
sf org login web --alias cpsandbox --instance-url https://test.salesforce.com
```

Verifica:
```bash
sf org list
```

Define la org por defecto del proyecto (recomendado: sandbox para no tocar prod por error):
```bash
sf config set target-org cpsandbox
```

## Configuración de línea de comandos ya aplicada

El repo ya trae:
- `.gitignore` estándar SFDX (ignora `.sf/`, `.sfdx/`, `node_modules/`, logs, etc.)
- `core.autocrlf=false` recomendado en Windows para no corromper finales de línea (LF). Configúralo:
  ```bash
  git config core.autocrlf false
  ```

---
[Siguiente: Git Flow y ramas →](02-gitflow.md)
