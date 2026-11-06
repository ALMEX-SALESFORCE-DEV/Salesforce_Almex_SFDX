# Padres faltantes de Pedido_general__c (SaFo-54)

Genera el CSV para cargar en SF los `Pedido_general__c` que Oracle tiene y SF no
(error `Foreign key external ID ... not found for field Oracle_Id__c in entity Pedido_general__c`).

Solo lectura en Oracle (GET) y en Salesforce (SOQL). La carga a SF la haces tú.

## 1. Variables de entorno (PowerShell)

```powershell
$env:ORACLE_BASE_URL = "https://fa-enkq-saasfaprod1.fa.ocs.oraclecloud.com"
$env:ORACLE_USER     = "<usuario>"      # o bien: $env:ORACLE_TOKEN = "<token>"
$env:ORACLE_PASSWORD = "<password>"
```

No guardes credenciales en archivos ni en el repo.

## 2. Prueba con 3 padres

```powershell
python scripts\padres_faltantes\mapear_padres.py --csv Pedidos.csv --org ALMEX-Production --out salida --limit 3
```

Revisa `salida\padres_upsert.csv`. El primero debe ser el folio 308999 con `Oracle_Id__c = 300000683875609`.

## 3. Corrida completa

Quita `--limit 3`. Genera tres archivos en `salida\`:

| Archivo                     | Contenido                                                                |
| --------------------------- | ------------------------------------------------------------------------ |
| `padres_upsert.csv`         | Listos para cargar                                                       |
| `padres_sin_cliente.csv`    | Oracle los devolvió, pero no se resolvió la cuenta en SF. Revisar a mano |
| `padres_no_encontrados.csv` | Oracle no devolvió un header que coincida. Revisar a mano                |

El script omite los padres que ya existen en SF.

## 4. Cargar a SF (upsert por Oracle_Id__c)

Con el CLI:

```powershell
sf data upsert bulk --sobject Pedido_general__c --file salida\padres_upsert.csv --external-id Oracle_Id__c --wait 10 -o ALMEX-Production
```

O con Data Loader: operación **Upsert**, objeto `Pedido_general__c`, campo externo `Oracle_Id__c`, mapeo automático por nombre de columna.

`Customer__c` lleva el Id de la cuenta de la org consultada. Corre el script con
`--org` igual a la org donde vas a cargar.

## 5. Verificar

```powershell
sf data query -o ALMEX-Production -q "SELECT COUNT(Id) FROM Pedido_general__c WHERE Oracle_Id__c IN ('300000683875609','300000692375110','300000694109911')"
```

Debe dar 3. Después reenvía las líneas desde Oracle.

## Limitaciones

- `Ship_to_customer__c`, `Ship_to_address__c` y `Bill_to_customer__c` quedan vacíos
  (el padre de referencia 317754 también los tiene vacíos).
- Si Oracle reenvía luego el padre completo, el mismo upsert lo actualiza.

## Pruebas

```powershell
cd scripts\padres_faltantes
$env:PYTHONPATH = "."; python -m unittest -v test_mapear_padres
```
