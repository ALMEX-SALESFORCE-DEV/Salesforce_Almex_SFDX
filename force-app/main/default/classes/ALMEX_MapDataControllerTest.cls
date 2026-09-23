@IsTest
private class ALMEX_MapDataControllerTest {
    @IsTest
    static void getPricesReturnsInsertedRecord() {
        Precio_productos__c testPrice = new Precio_productos__c(
            Nombre_producto__c = 'Azucar',
            Proveedor__c = 'ALMEX',
            Estado__c = 'Puebla',
            Ciudad__c = 'Puebla',
            Municipio__c = 'Puebla',
            Lugar_fabricaci_n_estado__c = 'Puebla',
            Nombre_comercial__c = 'Cliente de prueba',
            Tipo_subproducto__c = 'Azucar',
            Consumo_mensual__c = 10,
            Precio_producto__c = 25,
            Unidad__c = 'MXN_KG'
        );
        insert testPrice;

        Test.startTest();
        List<Precio_productos__c> result = ALMEX_MapDataController.getPrices();
        Test.stopTest();

        System.debug(LoggingLevel.INFO, 'Registros devueltos por getPrices: ' + result.size());
        System.debug(LoggingLevel.INFO, 'Registro de prueba devuelto: ' + result);

        System.assertEquals(1, result.size(), 'Debe devolver el registro creado por la prueba.');
        System.assertEquals(testPrice.Id, result[0].Id, 'Debe devolver el precio insertado.');
        System.assertEquals('Azucar', result[0].Nombre_producto__c);
        System.assertEquals('ALMEX', result[0].Proveedor__c);
        System.assertEquals(25, result[0].Precio_producto__c);
    }

    @IsTest
    static void getPricesReturnsEmptyListWhenThereAreNoRecords() {
        Test.startTest();
        List<Precio_productos__c> result = ALMEX_MapDataController.getPrices();
        Test.stopTest();

        System.assertNotEquals(null, result, 'El controlador nunca debe devolver null.');
        System.assertEquals(0, result.size(), 'Sin datos de prueba debe devolver una lista vacía.');
    }
}