@IsTest
private class ALMEX_FormPricesControllerTest {
    @TestSetup
    static void createData() {
        insert new Account(
            Name = 'SMURFIT CARTON Y PAPEL DE MEXICO',
            BillingState = 'CDMX',
            BillingCity = 'MIGUEL HIDALGO'
        );
        insert new Account(
            Name = 'CLIENTE PRUEBA JALISCO',
            BillingState = 'JAL',
            BillingCity = 'GUADALAJARA'
        );
        insert new List<Precio_productos__c>{
            buildRecord('Azucar', 'Estandar', 'MXN/Kg'),
            buildRecord('Azucar', 'Refinada', 'MXN/Kg'),
            buildRecord('Almidon', 'Generico', 'MXN 25kg Bulto')
        };
    }

    @IsTest
    static void searchesAccountsForClientSuggestions() {
        Test.startTest();
        List<ALMEX_FormPricesController.AccountSuggestion> suggestions =
            ALMEX_FormPricesController.searchAccounts('SMURFIT');
        Test.stopTest();

        System.assertEquals(1, suggestions.size());
        System.assertEquals('SMURFIT CARTON Y PAPEL DE MEXICO', suggestions[0].name);
        System.assertEquals('Ciudad de México', suggestions[0].state);
        System.assertEquals('MIGUEL HIDALGO', suggestions[0].municipality);
        System.assertEquals('MIGUEL HIDALGO', suggestions[0].city);
    }

    @IsTest
    static void doesNotSearchAccountsWithShortTerms() {
        Test.startTest();
        List<ALMEX_FormPricesController.AccountSuggestion> suggestions =
            ALMEX_FormPricesController.searchAccounts('S');
        Test.stopTest();

        System.assertEquals(0, suggestions.size());
    }

    @IsTest
    static void normalizesStateCodeInAccountSuggestion() {
        Test.startTest();
        List<ALMEX_FormPricesController.AccountSuggestion> suggestions =
            ALMEX_FormPricesController.searchAccounts('CLIENTE PRUEBA JALISCO');
        Test.stopTest();

        System.assertEquals(1, suggestions.size());
        System.assertEquals('Jalisco', suggestions[0].state);
    }

    @IsTest
    static void returnsReactiveOptions() {
        Test.startTest();
        ALMEX_FormPricesController.FormOptions options =
            ALMEX_FormPricesController.getFormOptions();
        Test.stopTest();

        System.assertEquals(2, options.products.size());
        System.assertEquals('Almidon', options.products[0].value);
        System.assertEquals(new List<String>{ 'Generico' }, options.products[0].subproducts);
        System.assertEquals('Azucar', options.products[1].value);
        System.assertEquals(
            new List<String>{ 'Estandar', 'Refinada' },
            options.products[1].subproducts
        );
        System.assertEquals(2, options.units.size());
    }

    @IsTest
    static void savesValidPrice() {
        ALMEX_FormPricesController.PriceInput input = validInput();
        input.state = 'JAL';
        input.factoryState = 'VE';

        Test.startTest();
        ALMEX_FormPricesController.SaveResponse response =
            ALMEX_FormPricesController.savePrice(input);
        Test.stopTest();

        System.assertEquals(true, response.success);
        System.assertNotEquals(null, response.recordId);

        Precio_productos__c saved = [
            SELECT Nombre_producto__c, Tipo_subproducto__c, Nombre_comercial__c,
                Estado__c, Lugar_fabricaci_n_estado__c
            FROM Precio_productos__c
            WHERE Id = :response.recordId
        ];
        System.assertEquals('Azucar', saved.Nombre_producto__c);
        System.assertEquals('Refinada', saved.Tipo_subproducto__c);
        System.assertEquals('Cliente de prueba', saved.Nombre_comercial__c);
        System.assertEquals('Jalisco', saved.Estado__c);
        System.assertEquals('Veracruz', saved.Lugar_fabricaci_n_estado__c);

        if (response.periodPersisted) {
            Id savedRecordId = response.recordId;
            SObject savedWithPeriod = Database.query(
                'SELECT Periodo_Anio__c, Periodo_Mes__c ' +
                'FROM Precio_productos__c WHERE Id = :savedRecordId'
            );
            System.assertEquals(Decimal.valueOf(2026), savedWithPeriod.get('Periodo_Anio__c'));
            System.assertEquals(Decimal.valueOf(9), savedWithPeriod.get('Periodo_Mes__c'));
        }
    }

    @IsTest
    static void rejectsInvalidMonth() {
        ALMEX_FormPricesController.PriceInput input = validInput();
        input.periodMonth = 13;

        Test.startTest();
        try {
            ALMEX_FormPricesController.savePrice(input);
            System.assert(false, 'Se esperaba una validación para el mes.');
        } catch (AuraHandledException expected) {
            System.assertNotEquals(null, expected);
        }
        Test.stopTest();
    }

    @IsTest
    static void savesWithoutFactoryLocationForNotApplicableSupplier() {
        ALMEX_FormPricesController.PriceInput input = validInput();
        input.supplier = 'N/A';
        input.factoryState = null;
        input.factoryCity = null;

        Test.startTest();
        ALMEX_FormPricesController.SaveResponse response =
            ALMEX_FormPricesController.savePrice(input);
        Test.stopTest();

        Precio_productos__c saved = [
            SELECT Proveedor__c, Lugar_fabricaci_n_estado__c, Lugar_fabricaci_n_ciudad__c
            FROM Precio_productos__c
            WHERE Id = :response.recordId
        ];
        System.assertEquals('N/A', saved.Proveedor__c);
        System.assertEquals(null, saved.Lugar_fabricaci_n_estado__c);
        System.assertEquals(null, saved.Lugar_fabricaci_n_ciudad__c);
    }

    private static Precio_productos__c buildRecord(String product, String subproduct, String unit) {
        return new Precio_productos__c(
            Name = product + ' - ' + subproduct,
            Nombre_producto__c = product,
            Tipo_subproducto__c = subproduct,
            Nombre_comercial__c = 'Cliente ' + product + subproduct,
            Estado__c = 'Jalisco',
            Municipio__c = 'Guadalajara',
            Ciudad__c = 'Guadalajara',
            Consumo_mensual__c = 100,
            Precio_producto__c = 20,
            Unidad__c = unit,
            Proveedor__c = 'Proveedor de prueba',
            Lugar_fabricaci_n_estado__c = 'Jalisco',
            Lugar_fabricaci_n_ciudad__c = 'Guadalajara'
        );
    }

    private static ALMEX_FormPricesController.PriceInput validInput() {
        ALMEX_FormPricesController.PriceInput input =
            new ALMEX_FormPricesController.PriceInput();
        input.productName = 'Azucar';
        input.subproductType = 'Refinada';
        input.periodYear = 2026;
        input.periodMonth = 9;
        input.commercialName = 'Cliente de prueba';
        input.state = 'Jalisco';
        input.municipality = 'Guadalajara';
        input.city = 'Guadalajara';
        input.monthlyConsumption = 250;
        input.price = 18.50;
        input.unit = 'MXN/Kg';
        input.shipmentSize = '25 toneladas';
        input.supplier = 'Proveedor de prueba';
        input.factoryState = 'Veracruz';
        input.factoryCity = 'Veracruz';
        return input;
    }
}
