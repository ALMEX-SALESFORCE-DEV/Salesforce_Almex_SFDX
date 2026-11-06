#!/usr/bin/env python3
"""Arma el CSV de upsert de Pedido_general__c para los padres que faltan en SF.

Lee Pedidos.csv (error "Pedido_general__c not found"), consulta Oracle (solo GET)
y genera padres_upsert.csv listo para cargar por Oracle_Id__c.

Solo lectura: Oracle (GET) y Salesforce (SOQL). No escribe en ninguno de los dos.
Credenciales de Oracle por variables de entorno (ver README.md).
"""
import argparse
import base64
import csv
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ERROR_RE = re.compile(
    r"Foreign key external ID: (\d+) not found for field Oracle_Id__c "
    r"in entity Pedido_general__c"
)
ORACLE_PATH = "/fscmRestApi/resources/11.13.18.05/salesOrdersForOrderHub"
CAMPOS_UPSERT = [
    "Oracle_Id__c",
    "Name",
    "Business_Unit__c",
    "Order_type__c",
    "Purchase_order__c",
    "Contact__c",
    "Contact_method__c",
    "Descripcion__c",
    "Customer__c",
]
NAME_MAX = 80


def extraer_padres(csv_path):
    """Devuelve {oracle_id_padre: folio}. Usa posiciones de columna: el
    encabezado trae caracteres mal codificados."""
    padres = {}
    with open(csv_path, newline="", encoding="utf-8-sig", errors="replace") as fh:
        lector = csv.reader(fh)
        next(lector, None)
        for fila in lector:
            if len(fila) < 5:
                continue
            m = ERROR_RE.search(fila[4])
            if m:
                padres.setdefault(m.group(1), fila[0].strip())
    return padres


def elegir_header(items, padre_id):
    """De los registros que Oracle devuelve para un folio, elige el real:
    OrderKey 'OPS:<id>' y SourceTransactionId igual al padre esperado.
    Ignora las copias DOO_REFERENCE."""
    for it in items:
        if (
            str(it.get("OrderKey", "")).startswith("OPS:")
            and str(it.get("SourceTransactionId")) == str(padre_id)
        ):
            return it
    return None


def mapear(item, customer_id):
    nombre = f"{item.get('BuyingPartyName') or ''} - {item.get('OrderNumber') or ''}"
    nombre = nombre[:NAME_MAX]
    return {
        "Oracle_Id__c": str(item["SourceTransactionId"]),
        "Name": nombre,
        "Business_Unit__c": item.get("BusinessUnitName") or "",
        "Order_type__c": item.get("TransactionTypeCode") or "",
        "Purchase_order__c": item.get("OrderNumber") or "",
        "Contact__c": item.get("BuyingPartyContactName") or "",
        "Contact_method__c": item.get("BuyingPartyContactEmail") or "",
        "Descripcion__c": nombre,
        "Customer__c": customer_id or "",
    }


def _sf_query(org, soql):
    sf = shutil.which("sf")
    if not sf:
        sys.exit("No encuentro el CLI 'sf' en el PATH.")
    r = subprocess.run(
        [sf, "data", "query", "-o", org, "-q", soql, "--json"],
        capture_output=True, text=True, encoding="utf-8",
    )
    data = json.loads(r.stdout)
    if data.get("status") != 0:
        sys.exit(f"Error SOQL: {data.get('message')}")
    return data["result"]["records"]


def _en_lotes(valores, n=100):
    valores = list(valores)
    for i in range(0, len(valores), n):
        yield valores[i:i + n]


def existentes_en_sf(org, ids):
    hallados = set()
    for lote in _en_lotes(ids):
        lista = ",".join(f"'{i}'" for i in lote)
        for r in _sf_query(org, f"SELECT Oracle_Id__c FROM Pedido_general__c WHERE Oracle_Id__c IN ({lista})"):
            hallados.add(r["Oracle_Id__c"])
    return hallados


def cuentas_por_numero(org, numeros):
    """{numero_cuenta: id} solo si el numero es unico en SF."""
    vistos = {}
    for lote in _en_lotes(numeros):
        lista = ",".join(f"'{n}'" for n in lote)
        for r in _sf_query(org, f"SELECT Id, N_mero_de_cuenta__c FROM Account WHERE N_mero_de_cuenta__c IN ({lista})"):
            vistos.setdefault(r["N_mero_de_cuenta__c"], []).append(r["Id"])
    return {n: ids[0] for n, ids in vistos.items() if len(ids) == 1}


def _auth_header():
    token = os.environ.get("ORACLE_TOKEN")
    if token:
        return f"Bearer {token}"
    user, pwd = os.environ.get("ORACLE_USER"), os.environ.get("ORACLE_PASSWORD")
    if not (user and pwd):
        sys.exit("Define ORACLE_TOKEN, o bien ORACLE_USER y ORACLE_PASSWORD.")
    return "Basic " + base64.b64encode(f"{user}:{pwd}".encode()).decode()


def consultar_oracle(base_url, folio, auth):
    q = urllib.parse.quote(f"OrderNumber={folio}")
    url = f"{base_url.rstrip('/')}{ORACLE_PATH}?q={q}&onlyData=true&limit=50"
    req = urllib.request.Request(url, headers={"Authorization": auth, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:  # solo GET
        return json.load(resp).get("items", [])


def escribir_csv(ruta, campos, filas):
    with open(ruta, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=campos)
        w.writeheader()
        w.writerows(filas)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--csv", required=True, help="Ruta de Pedidos.csv")
    ap.add_argument("--org", required=True, help="Alias de la org SF (lectura)")
    ap.add_argument("--out", default="salida", help="Carpeta de salida")
    ap.add_argument("--limit", type=int, default=0, help="Procesar solo N padres (prueba)")
    ap.add_argument("--sleep", type=float, default=0.5, help="Pausa entre llamadas a Oracle")
    args = ap.parse_args(argv)

    base_url = os.environ.get("ORACLE_BASE_URL")
    if not base_url:
        sys.exit("Define ORACLE_BASE_URL (ej. https://fa-xxxx.fa.ocs.oraclecloud.com).")
    auth = _auth_header()

    padres = extraer_padres(args.csv)
    print(f"Padres distintos en el CSV: {len(padres)}")
    ya = existentes_en_sf(args.org, padres)
    pendientes = {p: f for p, f in padres.items() if p not in ya}
    print(f"Ya existen en SF: {len(ya)} | Por cargar: {len(pendientes)}")
    if args.limit:
        pendientes = dict(list(pendientes.items())[: args.limit])
        print(f"Modo prueba: {len(pendientes)} padres")

    headers, no_encontrados = [], []
    for i, (padre, folio) in enumerate(pendientes.items(), 1):
        try:
            item = elegir_header(consultar_oracle(base_url, folio, auth), padre)
        except urllib.error.URLError as e:
            no_encontrados.append({"folio": folio, "oracle_id": padre, "motivo": f"error de red: {e}"})
            continue
        if item is None:
            no_encontrados.append({"folio": folio, "oracle_id": padre, "motivo": "sin header OPS que coincida"})
        else:
            headers.append(item)
        if i % 20 == 0:
            print(f"  {i}/{len(pendientes)}")
        time.sleep(args.sleep)

    cuentas = cuentas_por_numero(args.org, {str(h.get("BuyingPartyNumber")) for h in headers})
    listos, sin_cliente = [], []
    for h in headers:
        cid = cuentas.get(str(h.get("BuyingPartyNumber")))
        fila = mapear(h, cid)
        (listos if cid else sin_cliente).append(fila)

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    escribir_csv(out / "padres_upsert.csv", CAMPOS_UPSERT, listos)
    escribir_csv(out / "padres_sin_cliente.csv", CAMPOS_UPSERT, sin_cliente)
    escribir_csv(out / "padres_no_encontrados.csv", ["folio", "oracle_id", "motivo"], no_encontrados)
    print(f"Listos: {len(listos)} | Sin cliente: {len(sin_cliente)} | No encontrados: {len(no_encontrados)}")
    print(f"Archivos en: {out.resolve()}")


if __name__ == "__main__":
    main()
