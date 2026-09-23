[← Volver a la Wiki](../README.md)

# 5. Recetario de comandos

> Añade `-o cpsandbox` o `-o ALMEX-Production` para elegir la org. Sin el flag usa la org por defecto (`sf config get target-org`).

## Orgs

```bash
sf org list                                   # lista orgs autenticadas
sf org login web --alias cpsandbox            # autenticar (abre navegador)
sf org open -o cpsandbox                       # abrir org en el navegador
sf config set target-org cpsandbox             # fijar org por defecto
sf org display -o cpsandbox --verbose          # detalles (incl. sfdxAuthUrl)
```

## Traer metadata (retrieve)

```bash
# Un componente LWC
sf project retrieve start -m "LightningComponentBundle:cotizadorManufacturados" -o cpsandbox

# Una clase Apex
sf project retrieve start -m "ApexClass:ETC_Utility" -o cpsandbox

# Un objeto completo
sf project retrieve start -m "CustomObject:Fletes__c" -o cpsandbox

# Todo según el manifiesto
sf project retrieve start --manifest manifest/package.xml -o ALMEX-Production
```

## Desplegar metadata (deploy)

```bash
# Validar SIN aplicar (dry-run) — hazlo siempre antes de prod
sf project deploy start -d force-app -o ALMEX-Production --dry-run

# Desplegar un bundle a sandbox
sf project deploy start -d force-app/main/default/lwc/cotizadorManufacturados -o cpsandbox

# Desplegar solo lo que cambió respecto al manifiesto
sf project deploy start -x manifest/package.xml -o cpsandbox

# Con nivel de tests (requerido para Apex en prod)
sf project deploy start -d force-app -o ALMEX-Production -l RunLocalTests
```

## Generar componentes nuevos

```bash
sf lightning generate component --type lwc --name miComponente -d force-app/main/default/lwc
sf apex generate class --name MiClase -d force-app/main/default/classes
sf apex generate trigger --name MiTrigger -s Account -d force-app/main/default/triggers
```

## Apex y datos

```bash
sf apex run --file scripts/apex/hello.apex -o cpsandbox      # Apex anónimo
sf apex run test --code-coverage --result-format human -o cpsandbox
sf data query --query "SELECT Id, Name FROM Account LIMIT 5" -o cpsandbox
```

## Calidad (local)

```bash
npm run test:unit          # Jest de LWC
npm run lint               # ESLint
npm run prettier           # formatea archivos
npm run prettier:verify    # verifica formato sin escribir
```

## Git / GitHub

```bash
git checkout dev && git pull
git add -A && git commit -m "feat: ..."
git push origin dev
gh pr create --base main --head dev --title "Release" --body "..."
gh pr status
```

---
[Siguiente: Troubleshooting →](06-troubleshooting.md)
