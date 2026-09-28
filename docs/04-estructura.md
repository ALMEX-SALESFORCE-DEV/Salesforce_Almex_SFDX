[← Volver a la Wiki](../README.md)

# 4. Estructura y orgs

## Orgs disponibles

| Alias | Tipo | Usuario | Instancia |
|-------|------|---------|-----------|
| `ALMEX-Production` | 🔴 Producción | `getsemani.avila@almidones.com.mx` | `force-app-5145.my.salesforce.com` |
| `cpsandbox` | 🟢 Sandbox | `getsemani.avila@almidones.com.mx.cpsandbox` | `force-app-5145--cpsandbox.sandbox.my.salesforce.com` |

> 💡 Trabaja y prueba en **`cpsandbox`**. Deja `ALMEX-Production` solo para releases validados.

## Estructura del proyecto

```
Salesforce_Almex_SFDX/
├── force-app/main/default/     ← Todo el metadata (formato source)
│   ├── lwc/                     7 Lightning Web Components
│   ├── aura/                    Componentes Aura
│   ├── classes/                43 clases Apex
│   ├── triggers/               7 triggers
│   ├── flows/                  73 flows
│   ├── objects/               350 objetos (13 custom __c + estándar)
│   ├── layouts/                Layouts de página
│   ├── flexipages/             Lightning pages
│   ├── permissionsets/         Permission sets
│   ├── profiles/ · staticresources/ · email/ · ...
│   └── ...                      ~85 tipos de metadata en total
├── config/                     project-scratch-def.json
├── manifest/package.xml        Manifiesto (todo el metadata de la org)
├── scripts/                    apex/ (anónimo) y soql/ (consultas)
├── .github/                    workflows/ + CODEOWNERS
├── docs/                       Esta wiki
├── sfdx-project.json           API 67.0, paquete force-app
├── package.json                Scripts npm (test, lint, prettier)
└── .forceignore / .gitignore
```

## Componentes Lightning Web (LWC)

| Bundle | Notas |
|--------|-------|
| `cotizadorManufacturados` | Cotizador principal. **Único bundle que despliega el CI/CD.** |
| `cotizadorImportados` | Cotizador de productos importados |
| `cotizadorAceites` | Cotizador de aceites |
| `updateQuoteImportados` | Actualización de cotizaciones importadas |
| `menuCotizadores` | Menú de acceso a cotizadores |
| `mapaNacional` | Mapa nacional |
| `pdfScreenFlow` | Componente para Screen Flows (PDF) |

## Triggers Apex

`ETC_LinkQuoteToSalesAgreement` · `ETC_NewPricebook` · `ETC_PricebookInOracle` · `ETC_QuoteTrigger` · `ETC_SendPriceListToOracle` · `ETC_newDocumentTrigger` · `ETC_newLineOrderTrigger`

## Objetos custom principales

`Documento__c`, `Factor__c`, `Fletes__c`, `Market_Share__c`, `Market_reference_breakdown__c`, `Pedido_general__c`, `Planta__c`, `Precio_productos__c`, `Programaciones__c`, `Requerimientos_Especiales__c`, `Sucursal__c`, `Suministro__c` (+ metadata types `endpoint__mdt`).

## `.forceignore`

Excluye del deploy/retrieve: `package.xml`, `**/jsconfig.json`, `**/.eslintrc.json`, `**/__tests__/**`, `node_modules/`.

---
[Siguiente: Recetario de comandos →](05-comandos.md)
