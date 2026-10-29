@IsTest
private class ALMEX_MapDataControllerTest {
    private class BanxicoMock implements HttpCalloutMock {
        Integer statusCode;
        String rate;
        BanxicoMock(Integer statusCode, String rate) { this.statusCode = statusCode; this.rate = rate; }
        public HttpResponse respond(HttpRequest request) {
            System.assertEquals('GET', request.getMethod());
            System.assert(request.getEndpoint().startsWith('callout:ALMEX_Banxico_API/'));
            System.assertEquals(null, request.getHeader('Bmx-Token'), 'El token lo inyecta la credencial, no Apex.');
            HttpResponse response = new HttpResponse();
            response.setStatusCode(statusCode);
            response.setBody('{"bmx":{"series":[{"idSerie":"SF43718","datos":[{"fecha":"21/10/2026","dato":"' + rate + '"}]}]}}');
            return response;
        }
    }

    @IsTest
    static void returnsOfficialExchangeRate() {
        Test.setMock(HttpCalloutMock.class, new BanxicoMock(200, '18.6425'));
        Test.startTest();
        ALMEX_MapDataController.ExchangeRate result = ALMEX_MapDataController.getExchangeRate();
        Test.stopTest();
        System.assertEquals(18.6425, result.mxnPerUsd);
        System.assertEquals(Date.newInstance(2026, 10, 21), result.rateDate);
    }

    @IsTest
    static void rejectsMissingOrInvalidExchangeRateWithoutInventingOne() {
        Test.startTest();
        for (String rate : new List<String>{ 'N/E', '0', '-1' }) {
            Test.setMock(HttpCalloutMock.class, new BanxicoMock(200, rate));
            Boolean rejected = false;
            try { ALMEX_MapDataController.getExchangeRate(); }
            catch (AuraHandledException expected) { rejected = true; }
            System.assert(rejected);
        }
        Test.setMock(HttpCalloutMock.class, new BanxicoMock(401, '20'));
        Boolean rejected = false;
        try { ALMEX_MapDataController.getExchangeRate(); }
        catch (AuraHandledException expected) { rejected = true; }
        System.assert(rejected);
        Test.stopTest();
    }
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
                Producto_importado__c = true,
                Precio_producto__c = 25,
                Periodo_Anio__c = 2026,
                Periodo_Mes__c = 9,
                Unidad__c = 'MXN_Kg'
            );
            insert testPrice;
            Datetime registrationDate = Datetime.newInstanceGMT(2024, 1, 2, 3, 4, 5);
            Test.setCreatedDate(testPrice.Id, registrationDate);

            Test.startTest();
            List<Precio_productos__c> result = ALMEX_MapDataController.getPrices();
            Test.stopTest();

            System.assertEquals(1, result.size(), 'Gerencia debe poder consultar el registro creado.');
            System.assertEquals(testPrice.Id, result[0].Id, 'Debe devolver el precio insertado.');
            System.assertEquals(registrationDate, result[0].CreatedDate,
                'La fecha de registro es CreatedDate, no el año del periodo ni una fecha contractual.');
            System.assertEquals('Azúcar', result[0].Nombre_producto__c);
            System.assertEquals('ALMEX', result[0].Proveedor__c);
            System.assertEquals(2026, result[0].Periodo_Anio__c);
            System.assertEquals(true, result[0].Producto_importado__c);
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
