@IsTest
private class ALMEX_FormPricesControllerTest {
    @TestSetup
    static void createData() {
        Account branchAccount = new Account(
            Name = 'CUENTA PRUEBA SUCURSALES',
            OwnerId = UserInfo.getUserId()
        );
        insert as system branchAccount;
        insert as system new Sucursal__c(
            Name = 'SUCURSAL PRUEBA MIGUEL HIDALGO',
            Cuenta__c = branchAccount.Id,
            Datos_de_direccion__CountryCode__s = 'MX',
            Datos_de_direccion__StateCode__s = 'DF',
            Datos_de_direccion__City__s = 'MIGUEL HIDALGO'
        );
        insert as system new Sucursal__c(
            Name = 'SUCURSAL PRUEBA JALISCO',
            Cuenta__c = branchAccount.Id,
            Datos_de_direccion__CountryCode__s = 'MX',
            Datos_de_direccion__StateCode__s = 'JA',
            Datos_de_direccion__City__s = 'GUADALAJARA'
        );
        insert as system new List<Precio_productos__c>{
            buildRecord('Azucar', 'Estandar', 'MXN/Kg'),
            buildRecord('Azucar', 'Refinada', 'MXN/Kg'),
            buildRecord('Almidon', 'Generico', 'MXN 25kg Bulto')
        };
    }

    @IsTest
    static void searchesBranchesForClientSuggestions() {
        Test.startTest();
        List<ALMEX_FormPricesController.BranchSuggestion> suggestions =
            ALMEX_FormPricesController.searchBranches('SUCURSAL PRUEBA MIGUEL HIDALGO');
        Test.stopTest();

        System.assertEquals(1, suggestions.size());
        System.assert(suggestions[0].name.startsWith('SUCURSAL PRUEBA MIGUEL HIDALGO'));
        System.assertNotEquals(null, suggestions[0].branchId);
        System.assertEquals('Ciudad de México', suggestions[0].state);
        System.assertEquals(null, suggestions[0].municipality);
        System.assertEquals('MIGUEL HIDALGO', suggestions[0].city);
    }

    @IsTest
    static void doesNotSearchBranchesWithShortTerms() {
        Test.startTest();
        List<ALMEX_FormPricesController.BranchSuggestion> suggestions =
            ALMEX_FormPricesController.searchBranches('S');
        Test.stopTest();

        System.assertEquals(0, suggestions.size());
    }

    @IsTest
    static void normalizesStateCodeInBranchSuggestion() {
        Test.startTest();
        List<ALMEX_FormPricesController.BranchSuggestion> suggestions =
            ALMEX_FormPricesController.searchBranches('SUCURSAL PRUEBA JALISCO');
        Test.stopTest();

        System.assertEquals(1, suggestions.size());
        System.assertEquals('Jalisco', suggestions[0].state);
    }

    @IsTest
    static void normalizesSonoraAndQueretaroStateCodes() {
        Test.startTest();
        for (String stateCode : new List<String>{ 'SON', 'QRO' }) {
            ALMEX_FormPricesController.PriceInput input = validInput();
            input.state = stateCode;
            input.factoryState = 'TAMPS';
            ALMEX_FormPricesController.SaveResponse response =
                ALMEX_FormPricesController.savePrice(input);
            Precio_productos__c saved = [
                SELECT Estado__c, Lugar_fabricaci_n_estado__c
                FROM Precio_productos__c WHERE Id = :response.recordId
            ];
            System.assertEquals(stateCode == 'SON' ? 'Sonora' : 'Querétaro', saved.Estado__c);
            System.assertEquals('Tamaulipas', saved.Lugar_fabricaci_n_estado__c);
        }
        Test.stopTest();
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
                Estado__c, Lugar_fabricaci_n_estado__c, Tipo_consumo_toneladas__c
            FROM Precio_productos__c
            WHERE Id = :response.recordId
        ];
        System.assertEquals('Azucar', saved.Nombre_producto__c);
        System.assertEquals('Refinada', saved.Tipo_subproducto__c);
        System.assertEquals('Cliente de prueba', saved.Nombre_comercial__c);
        System.assertEquals('Jalisco', saved.Estado__c);
        System.assertEquals('Veracruz', saved.Lugar_fabricaci_n_estado__c);
        System.assertEquals('M', saved.Tipo_consumo_toneladas__c);

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
    static void savesAnnualConsumptionWithoutConvertingVolume() {
        ALMEX_FormPricesController.PriceInput input = validInput();
        input.consumptionType = 'A';
        input.monthlyConsumption = 1200;
        input.productName = 'Dextrosa 95% liquida';
        input.shipmentSize = '20 Ton';

        Test.startTest();
        ALMEX_FormPricesController.SaveResponse response =
            ALMEX_FormPricesController.savePrice(input);
        Test.stopTest();

        Precio_productos__c saved = [
            SELECT Tipo_consumo_toneladas__c, Consumo_mensual__c,
                Nombre_producto__c, Tama_o_embarque__c
            FROM Precio_productos__c WHERE Id = :response.recordId
        ];
        System.assertEquals('A', saved.Tipo_consumo_toneladas__c);
        System.assertEquals(1200, saved.Consumo_mensual__c);
        System.assertEquals('Dextrosa 95% liquida', saved.Nombre_producto__c);
        System.assertEquals('20 Ton', saved.Tama_o_embarque__c);
    }

    @IsTest
    static void rejectsInvalidConsumptionType() {
        ALMEX_FormPricesController.PriceInput input = validInput();
        input.consumptionType = 'X';
        Boolean rejected = false;
        Test.startTest();
        try {
            ALMEX_FormPricesController.savePrice(input);
        } catch (AuraHandledException expected) {
            rejected = true;
        }
        Test.stopTest();
        System.assert(rejected, 'No debe guardar un tipo diferente de M o A.');
    }

    @IsTest
    static void rejectsMissingOrInvalidShipmentForEveryApplicableProduct() {
        List<String> products = new List<String>{
            'Glucosa 43', 'Glucosa 44', 'Glucosa 63', 'Glucosa Alta Maltosa',
            'Fructosa 42', 'Fructosa 55', 'Fructosa cristalina 99',
            'Dextrosa líquida', 'Dextrosa monohidratada', 'KRYSTAR líquido',
            'Dextrosa 95% liquida', 'Azúcar'
        };
        Test.startTest();
        for (String product : products) {
            for (String shipment : new List<String>{ null, 'Granel industrial' }) {
                ALMEX_FormPricesController.PriceInput input = validInput();
                input.productName = product;
                input.subproductType = 'Azucar liquida';
                input.shipmentSize = shipment;
                Boolean rejected = false;
                try {
                    ALMEX_FormPricesController.savePrice(input);
                } catch (AuraHandledException expected) {
                    rejected = true;
                }
                System.assert(rejected, product + ' debe exigir una opción válida de embarque.');
            }
        }
        Test.stopTest();
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
