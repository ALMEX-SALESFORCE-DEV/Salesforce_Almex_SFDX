# SaFo-50 — Mapeo de mercado

## Alcance del PR

El PR #54 depende del #53 y apunta a `feature/SaFo-28-proyecto-agendas` mientras ese PR está abierto. El orden es #53 y después #54. Una vez integrado #53, cambiar la base de #54 a `main` y repetir la simulación. No fusionar Agendas desde este PR ni restaurar la IA de notas.

Las pruebas nuevas y los cambios funcionales corresponden exclusivamente al formulario de precios y al mapa. Los archivos heredados de Agendas no se eliminan del árbol: quedan fuera del diff del PR al usar su base correcta.

## Permisos y credenciales

- Los dos perfiles parciales están en `metadata/safo50`. Contienen FLS de los cuatro campos comerciales nuevos; Supervisor conserva también la edición de precios incorporada por esta feature.
- `.forceignore` mantiene excluidos los perfiles completos y permite únicamente estos parciales. Para publicarlos usar `manifest/ALMEX_SaFo50_Accesos_package.xml`, o el paquete completo indicado abajo; no el convertidor de delta limitado a `force-app`.
- No se incluyen permisos `UserExternalCredential` en estos perfiles.
- Se versionan `ALMEX_Banxico_API` y `ALMEX_Banxico_Auth`, sin token. El encabezado usa la referencia segura `{!$Credential.ALMEX_Banxico_Auth.Token}`.
- El secreto `Token` debe cargarse de forma segura en cada org. La asignación de `BanxicoPrincipal` queda pendiente por indicación del solicitante: no se crea script ni Permission Set. Salesforce no admite `externalCredentialPrincipalAccesses` en Profile; no añadir ese nodo al XML.

## Retiro de Mes

Se retira `Periodo_Mes__c`, su traducción, referencias en Apex/tests, FLS y manifiesto general. Año continúa usando `Periodo_Anio__c`, independientemente de la vigencia del contrato.

Antes de retirar el campo en otro sandbox, respaldar sus valores y ejecutar:

```sh
sf apex run --file scripts/apex/ALMEX_SaFo50_ClearPeriodoMes.apex --target-org <sandbox>
```

El script únicamente pone Mes en `null`; no elimina precios. Es intencionalmente exclusivo de sandbox. El manifiesto destructivo contiene solo ese campo y se aplica después de actualizar sus clases dependientes. No usar `--purge-on-delete`.

## Validación y despliegue explícito

```sh
npm run test:unit:csp -- --coverage
npm run test:unit -- --runInBand
sf project deploy start --manifest manifest/ALMEX_SaFo50_package.xml --post-destructive-changes manifest/ALMEX_SaFo50_destructiveChangesPost.xml --target-org <sandbox> --dry-run --test-level RunSpecifiedTests --tests ALMEX_FormPricesControllerTest --tests ALMEX_MapDataControllerTest
```

Solo tras aprobar la validación se puede repetir sin `--dry-run` en la org autorizada. El paquete completo incluye credenciales: revisar primero la configuración de secretos existente. `ALMEX_SaFo50_RetiroMes_package.xml` permite actualizar únicamente las clases dependientes y retirar Mes, sin tocar credenciales, perfiles ni otros proyectos.

Las pruebas JS verifican normalización anual y moneda, catálogos, captura/validaciones, lookup de cuentas/sucursales, fechas, filtros, mapa/gráfica, propuestas, columnas/modales y exportación anual con CreatedDate. Apex comprueba persistencia, permisos y respuestas simuladas de Banxico. Los mocks no sustituyen la comprobación real del token ni de cada perfil; esa asignación no se modifica en esta entrega.
