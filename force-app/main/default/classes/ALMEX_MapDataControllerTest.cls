@IsTest
private class ALMEX_MapDataControllerTest {
    private static User createGerenciaUser(String uniqueSuffix) {
        Profile gerenciaProfile = [
            SELECT Id
            FROM Profile
            WHERE Name = 'Gerencia y Dirección Comercial'
            LIMIT 1
        ];

        User testUser = new User(
            Alias = 'germapa',
            Email = 'gerencia.mapa.' + uniqueSuffix + '@example.com',
            EmailEncodingKey = 'UTF-8',
            LastName = 'Gerencia Mapa',
            LanguageLocaleKey = 'es_MX',
            LocaleSidKey = 'es_MX',
            ProfileId = gerenciaProfile.Id,
            TimeZoneSidKey = 'America/Mexico_City',
            Username = 'gerencia.mapa.' + uniqueSuffix + '.' +
                String.valueOf(System.now().getTime()) + '@example.com'
        );
        insert testUser;
        return testUser;
    }

    @IsTest
    static void getPricesReturnsInsertedRecord() {
        User gerenciaUser = createGerenciaUser('datos');

        System.runAs(gerenciaUser) {
            Precio_productos__c testPrice = new Precio_productos__c(
                Name = 'Prueba mapa Gerencia',
                Nombre_producto__c = 'Azúcar',
                Proveedor__c = 'ALMEX',
                Estado__c = 'Puebla',
                Ciudad__c = 'Puebla',
                Municipio__c = 'Puebla',
                Lugar_fabricaci_n_estado__c = 'Puebla',
                Nombre_comercial__c = 'Cliente de prueba',
                Tipo_subproducto__c = 'Estándar',
                Consumo_mensual__c = 10,
                Tipo_consumo_toneladas__c = 'A',
                Precio_producto__c = 25,
                Periodo_Anio__c = 2026,
                Periodo_Mes__c = 9,
                Unidad__c = 'MXN_Kg'
            );
            insert testPrice;

            Test.startTest();
            List<Precio_productos__c> result = ALMEX_MapDataController.getPrices();
            Test.stopTest();

            System.assertEquals(1, result.size(), 'Gerencia debe poder consultar el registro creado.');
            System.assertEquals(testPrice.Id, result[0].Id, 'Debe devolver el precio insertado.');
            System.assertEquals('Azúcar', result[0].Nombre_producto__c);
            System.assertEquals('ALMEX', result[0].Proveedor__c);
            System.assertEquals(2026, result[0].Periodo_Anio__c);
            System.assertEquals(9, result[0].Periodo_Mes__c);
            System.assertEquals(25, result[0].Precio_producto__c);
            System.assertEquals('A', result[0].Tipo_consumo_toneladas__c);
        }
    }

    @IsTest
    static void getPricesReturnsEmptyListWhenThereAreNoRecords() {
        User gerenciaUser = createGerenciaUser('vacio');

        System.runAs(gerenciaUser) {
            Test.startTest();
            List<Precio_productos__c> result = ALMEX_MapDataController.getPrices();
            Test.stopTest();

            System.assertNotEquals(null, result, 'El controlador nunca debe devolver null.');
            System.assertEquals(0, result.size(), 'Sin datos de prueba debe devolver una lista vacía.');
        }
    }

    @IsTest
    static void getPricesDoesNotFailWhenPeriodFieldsAreNotVisible() {
        Test.startTest();
        List<Precio_productos__c> result = ALMEX_MapDataController.getPrices();
        Test.stopTest();

        System.assertNotEquals(
            null,
            result,
            'El mapa debe cargar aunque el usuario no tenga visibilidad de los campos de periodo.'
        );
    }
}
