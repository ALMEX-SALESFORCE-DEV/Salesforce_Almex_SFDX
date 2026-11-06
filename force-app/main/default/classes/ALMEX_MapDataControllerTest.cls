@IsTest
private class ALMEX_MapDataControllerTest {
    private class BanxicoMock implements HttpCalloutMock {
        Integer statusCode;
        String rate;
        String seriesId = 'SF60653';
        Date observationDate = applicationDate();
        String bodyOverride;
        BanxicoMock(Integer statusCode, String rate) { this.statusCode = statusCode; this.rate = rate; }
        public HttpResponse respond(HttpRequest request) {
            System.assertEquals('GET', request.getMethod());
            String day = String.valueOf(applicationDate());
            System.assertEquals('callout:ALMEX_Banxico_API/SieAPIRest/service/v1/series/SF60653/datos/' + day + '/' + day,
                request.getEndpoint(), 'Se debe consultar la liquidación aplicable hoy, no FIX ni /oportuno.');
            System.assertEquals('application/json', request.getHeader('Accept'));
            System.assertEquals(null, request.getHeader('Bmx-Token'), 'El token lo inyecta la credencial, no Apex.');
            HttpResponse response = new HttpResponse();
            response.setStatusCode(statusCode);
            response.setBody(bodyOverride != null ? bodyOverride : JSON.serialize(new Map<String,Object>{
                'bmx' => new Map<String,Object>{ 'series' => new List<Object>{
                    new Map<String,Object>{ 'idSerie' => seriesId, 'datos' => new List<Object>{
                        new Map<String,Object>{ 'fecha' => String.valueOf(observationDate.day()) + '/' +
                            String.valueOf(observationDate.month()) + '/' + String.valueOf(observationDate.year()), 'dato' => rate }
                    }}
                }}
            }));
            return response;
        }
    }

    private static Date applicationDate() {
        return Date.valueOf(System.now().format('yyyy-MM-dd', 'America/Mexico_City'));
    }

    private static void assertRateRejected(BanxicoMock response) {
        Test.setMock(HttpCalloutMock.class, response);
        Boolean rejected = false;
        try { ALMEX_MapDataController.getExchangeRate(); }
        catch (AuraHandledException expected) { rejected = true; }
        System.assert(rejected, 'No devolver una tasa de otra serie, fecha o sin valor válido.');
    }

    @IsTest
    static void returnsOfficialExchangeRate() {
        Test.setMock(HttpCalloutMock.class, new BanxicoMock(200, '18.7592'));
        Test.startTest();
        ALMEX_MapDataController.ExchangeRate result = ALMEX_MapDataController.getExchangeRate();
        Test.stopTest();
        System.assertEquals(18.7592, result.mxnPerUsd);
        System.assertEquals(applicationDate(), result.rateDate);
        System.assertEquals('Banco de México · Para solventar obligaciones', result.source);
    }

    @IsTest
    static void rejectsMissingOrInvalidExchangeRateWithoutInventingOne() {
        Test.startTest();
        for (String rate : new List<String>{ 'N/E', '0', '-1', '', null }) {
            assertRateRejected(new BanxicoMock(200, rate));
        }
        assertRateRejected(new BanxicoMock(401, '20'));
        Test.stopTest();
    }

    @IsTest
    static void rejectsDeterminationSeriesEvenWhenTheValueIsValid() {
        BanxicoMock response = new BanxicoMock(200, '18.7147');
        response.seriesId = 'SF43718';
        Test.startTest();
        assertRateRejected(response);
        Test.stopTest();
    }

    @IsTest
    static void rejectsFutureAndPreviousLiquidationDates() {
        Test.startTest();
        for (Integer offset : new List<Integer>{-1, 1, 2}) {
            BanxicoMock response = new BanxicoMock(200, '18.7147');
            response.observationDate = applicationDate().addDays(offset);
            assertRateRejected(response);
        }
        Test.stopTest();
    }

    @IsTest
    static void rejectsEmptyAndMalformedDailyResponses() {
        Test.startTest();
        for (String body : new List<String>{
            '{}', 'not-json', '{"bmx":{"series":[]}}',
            '{"bmx":{"series":[{"idSerie":"SF60653","datos":[]}]}}',
            '{"bmx":{"series":[{"idSerie":"SF60653","datos":null}]}}',
            '{"bmx":{"series":[{"idSerie":"SF60653","datos":[{},{}]}]}}'
        }) {
            BanxicoMock response = new BanxicoMock(200, '18.7592');
            response.bodyOverride = body;
            assertRateRejected(response);
        }
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
