import csv
import tempfile
import unittest
from pathlib import Path

import mapear_padres as m

# Registro real del folio 317754 (campos relevantes).
HEADER_OPS = {
    "HeaderId": 300000837494265,
    "OrderNumber": "317754",
    "SourceTransactionId": "300000837494265",
    "OrderKey": "OPS:300000837494265",
    "BuyingPartyName": "EMBOTELLADORA MEXICANA DE BEBIDAS REFRESCANTES",
    "BuyingPartyNumber": "00013",
    "BuyingPartyContactName": "CUENTAS POR COBRAR",
    "BuyingPartyContactEmail": "e-factura@csc.femsa.com.mx",
    "BusinessUnitName": "BU_ALMEX",
    "TransactionTypeCode": "REV_NAC",
    "CustomerPONumber": "2000027808",
}
COPIA_REFERENCE = {**HEADER_OPS, "HeaderId": 100000190300820, "OrderKey": "100000190300820"}


class ExtraerPadres(unittest.TestCase):
    def test_solo_error_de_pedido_general_y_sin_duplicados(self):
        filas = [
            ["Numero", "Linea", "ERP", "SF", "Mensaje"],
            ["308999", "1", "Cancelado", "Error",
             "Foreign key external ID: 300000683875609 not found for field Oracle_Id__c in entity Pedido_general__c"],
            ["308999", "2", "Cancelado", "Error",
             "Foreign key external ID: 300000683875609 not found for field Oracle_Id__c in entity Pedido_general__c"],
            ["285111", "1", "Cerrado", "Error",
             "Foreign key external ID: 300000515054599 not found for field External_Id__c in entity Pricebook2"],
        ]
        with tempfile.TemporaryDirectory() as d:
            ruta = Path(d) / "p.csv"
            with open(ruta, "w", newline="", encoding="utf-8") as fh:
                csv.writer(fh).writerows(filas)
            self.assertEqual(m.extraer_padres(ruta), {"300000683875609": "308999"})


class ElegirHeader(unittest.TestCase):
    def test_ignora_copias_reference(self):
        item = m.elegir_header([COPIA_REFERENCE, HEADER_OPS], "300000837494265")
        self.assertIs(item, HEADER_OPS)

    def test_sin_coincidencia_devuelve_none(self):
        self.assertIsNone(m.elegir_header([HEADER_OPS], "300000683875609"))
        self.assertIsNone(m.elegir_header([COPIA_REFERENCE], "300000837494265"))


class Mapear(unittest.TestCase):
    def test_reproduce_el_padre_ya_sincronizado(self):
        fila = m.mapear(HEADER_OPS, "001V500000OKAjdIAH")
        self.assertEqual(fila["Oracle_Id__c"], "300000837494265")
        self.assertEqual(fila["Name"], "EMBOTELLADORA MEXICANA DE BEBIDAS REFRESCANTES - 317754")
        self.assertEqual(fila["Descripcion__c"], fila["Name"])
        self.assertEqual(fila["Business_Unit__c"], "BU_ALMEX")
        self.assertEqual(fila["Order_type__c"], "REV_NAC")
        self.assertEqual(fila["Purchase_order__c"], "317754")  # no CustomerPONumber
        self.assertEqual(fila["Contact__c"], "CUENTAS POR COBRAR")
        self.assertEqual(fila["Contact_method__c"], "e-factura@csc.femsa.com.mx")
        self.assertEqual(fila["Customer__c"], "001V500000OKAjdIAH")
        self.assertEqual(list(fila), m.CAMPOS_UPSERT)

    def test_name_se_trunca_a_80(self):
        largo = {**HEADER_OPS, "BuyingPartyName": "X" * 200}
        self.assertEqual(len(m.mapear(largo, None)["Name"]), 80)


if __name__ == "__main__":
    unittest.main()
