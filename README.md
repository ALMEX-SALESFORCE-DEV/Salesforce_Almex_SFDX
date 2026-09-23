# 🌽 Salesforce ALMEX — Wiki del Proyecto

Repositorio de código fuente (SFDX) de la org **Almidones Mexicanos (ALMEX)**. Aquí vive todo el metadata de Salesforce: LWC, Apex, Flows, objetos, layouts, permisos, etc. Se edita en local, se versiona en Git y se despliega con la Salesforce CLI.

> **Repo:** `ALMEX-SALESFORCE-DEV/Salesforce_Almex_SFDX` (privado) · **Org:** `force-app-5145.my.salesforce.com` · **API:** 67.0

---

## 📚 Índice de la Wiki

| Página | Contenido |
|--------|-----------|
| [1. Setup del entorno](docs/01-setup.md) | Instalar CLI, clonar repo, autenticar orgs |
| [2. Git Flow y ramas](docs/02-gitflow.md) | Cómo trabajar en `dev`, PRs a `main`, protección |
| [3. CI/CD](docs/03-cicd.md) | Workflows de GitHub Actions, secrets, despliegues |
| [4. Estructura y orgs](docs/04-estructura.md) | Metadata, componentes LWC, orgs disponibles |
| [5. Recetario de comandos](docs/05-comandos.md) | Comandos `sf` de uso diario |
| [6. Troubleshooting](docs/06-troubleshooting.md) | Errores comunes y cómo resolverlos |

---

## ⚡ Inicio rápido

```bash
# 1. Clonar
git clone https://github.com/ALMEX-SALESFORCE-DEV/Salesforce_Almex_SFDX.git
cd Salesforce_Almex_SFDX

# 2. Instalar dependencias
npm install

# 3. Autenticar la org de producción (abre el navegador)
sf org login web --alias ALMEX-Production --instance-url https://login.salesforce.com

# 4. Trabajar SIEMPRE en dev
git checkout dev
```

---

## 🔀 Regla de oro del flujo

- **El equipo commitea solo a `dev`.** Push directo permitido.
- **`main` es producción y está protegida.** Solo se llega por **Pull Request** aprobado por **@Getsemani-Avila-Almidones**.
- **Los despliegues a producción NO están automatizados** — se ejecutan manualmente. Ver [CI/CD](docs/03-cicd.md).

```
dev  ──commit──►  dev (remoto)  ──Pull Request──►  main (prod, requiere tu aprobación)
```

---

## 🗂️ Estructura resumida

```
force-app/main/default/   Todo el metadata de Salesforce
  ├── lwc/                7 componentes Lightning Web
  ├── classes/           43 clases Apex
  ├── triggers/          7 triggers
  ├── flows/             73 flows
  ├── objects/           350 objetos (estándar + custom)
  └── ... (layouts, permissionsets, flexipages, etc.)
.github/workflows/        CI (ci.yml) y Deploy (deploy.yml)
.github/CODEOWNERS        Define quién aprueba PRs a main
manifest/package.xml      Manifiesto del metadata de la org
docs/                     Esta wiki
```

Detalle completo en [Estructura y orgs](docs/04-estructura.md).

---

## 🔗 Enlaces útiles

- [Salesforce CLI Command Reference](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/)
- [Salesforce DX Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/)
- [LWC Developer Guide](https://developer.salesforce.com/docs/platform/lwc/guide)
