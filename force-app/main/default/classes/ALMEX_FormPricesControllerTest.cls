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
        System.assertEquals('A', saved.Tipo_consumo_toneladas__c);

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
    static void annualClientBranchesAndOrigin() {
        Account account = [SELECT Id FROM Account WHERE Name = 'CUENTA PRUEBA SUCURSALES' LIMIT 1];
        Sucursal__c branch = [SELECT Id, Name FROM Sucursal__c WHERE Cuenta__c = :account.Id LIMIT 1];
        Account unrelated = new Account(Name = 'OTRA CUENTA');
        insert unrelated;
        Test.startTest();
        System.assertEquals(0, ALMEX_FormPricesController.searchAccounts('C').size());
        System.assertEquals(1, ALMEX_FormPricesController.searchAccounts('CUENTA PRUEBA').size());
        System.assertEquals(2, ALMEX_FormPricesController.getBranchesForAccount(account.Id).size());
        System.assertEquals(0, ALMEX_FormPricesController.getBranchesForAccount(unrelated.Id).size());
        ALMEX_FormPricesController.PriceInput input = validInput();
        input.clientAccountId = account.Id;
        input.branchId = branch.Id;
        input.commercialName = 'NO GUARDAR ESTE NOMBRE';
        input.periodMonth = null;
        input.importedProduct = true;
        ALMEX_FormPricesController.SaveResponse result = ALMEX_FormPricesController.savePrice(input);
        Precio_productos__c saved = [SELECT Nombre_comercial__c, Producto_importado__c,
            Tipo_consumo_toneladas__c, Consumo_mensual__c, Periodo_Mes__c, Periodo_Anio__c
            FROM Precio_productos__c WHERE Id = :result.recordId];
        System.assertEquals(branch.Name, saved.Nombre_comercial__c);
        System.assertEquals(true, saved.Producto_importado__c);
        System.assertEquals('A', saved.Tipo_consumo_toneladas__c);
        System.assertEquals(input.monthlyConsumption, saved.Consumo_mensual__c);
        System.assertEquals(null, saved.Periodo_Mes__c);
        System.assertEquals(2026, saved.Periodo_Anio__c);
        input.clientAccountId = unrelated.Id;
        Boolean rejected = false;
        try { ALMEX_FormPricesController.savePrice(input); }
        catch (AuraHandledException expected) { rejected = true; }
        System.assert(rejected, 'No aceptar una sucursal de otra cuenta.');
        Test.stopTest();
    }

    @IsTest
    static void commercialProfilesCanSelectTheirClientAndSaveImportedAnnualPrice() {
        List<User> users = new List<User>();
        for (Profile profile : [SELECT Id FROM Profile WHERE Name IN ('Gerencia y Dirección Comercial', 'Supervisor y Ejecutivo Comercial')]) {
            users.add(new User(Alias = 'safocli', Email = 'safo@example.com', EmailEncodingKey = 'UTF-8',
                LastName = 'Prueba Cliente', LanguageLocaleKey = 'es_MX', LocaleSidKey = 'es_MX',
                ProfileId = profile.Id, TimeZoneSidKey = 'America/Mexico_City',
                Username = 'safo.' + profile.Id + '.' + System.now().getTime() + '@example.com'));
        }
        System.assertEquals(2, users.size());
        insert users;
        Test.startTest();
        for (User testUser : users) {
            System.runAs(testUser) {
                Account account = new Account(Name = 'CLIENTE ANUAL ' + testUser.Id);
                insert as system account;
                Sucursal__c branch = new Sucursal__c(Name = 'SUCURSAL DENVER', Cuenta__c = account.Id,
                    Datos_de_direccion__CountryCode__s = 'US', Datos_de_direccion__StateCode__s = 'CO',
                    Datos_de_direccion__City__s = 'Denver');
                insert as system branch;
                System.assertEquals(1, ALMEX_FormPricesController.searchAccounts(account.Name).size());
                List<ALMEX_FormPricesController.BranchSuggestion> branches = ALMEX_FormPricesController.getBranchesForAccount(account.Id);
                System.assertEquals(1, branches.size());
                System.assertEquals('CO', branches[0].state, 'No convertir Colorado en Coahuila.');
                ALMEX_FormPricesController.PriceInput input = validInput();
                input.clientAccountId = account.Id;
                input.branchId = branch.Id;
                input.importedProduct = true;
                input.periodMonth = null;
                input.state = 'Colorado';
                input.municipality = 'Denver';
                input.city = 'Denver';
                ALMEX_FormPricesController.SaveResponse result = ALMEX_FormPricesController.savePrice(input);
                Precio_productos__c saved = [SELECT Producto_importado__c, Nombre_comercial__c, Tipo_consumo_toneladas__c
                    FROM Precio_productos__c WHERE Id = :result.recordId];
                System.assertEquals(true, saved.Producto_importado__c);
                System.assertEquals('SUCURSAL DENVER', saved.Nombre_comercial__c);
                System.assertEquals('A', saved.Tipo_consumo_toneladas__c);
            }
        }
        Test.stopTest();
    }

    @IsTest
    static void savesEveryProductAndEveryVisibleSubproduct() {
        // Matriz de las 12 opciones del LWC y todas sus presentaciones visibles.
        Map<String, List<String>> catalog = new Map<String, List<String>>{
            'Almidón' => new List<String>{ '25 kilos', 'Granel', 'Super saco (500 kilos)', 'Super saco (1000 kilos)' },
            'Azúcar' => new List<String>{ 'Estandar', 'Refinada', 'Azúcar líquida' },
            'Glucosa 43' => new List<String>{ null },
            'Glucosa 44' => new List<String>{ null },
            'Glucosa 63' => new List<String>{ null },
            'Glucosa alta en maltosa' => new List<String>{ null },
            'Fructosa 42' => new List<String>{ null },
            'Fructosa 55' => new List<String>{ null },
            'Fructosa cristalina 99' => new List<String>{ null },
            'Dextrosa monohidratada' => new List<String>{ null },
            'KRYSTAR líquido' => new List<String>{ null },
            'Dextrosa 95% líquida' => new List<String>{ null }
        };
        List<String> units = new List<String>{ 'MXN_Kg', 'MXN_25KG_BULTO', 'MXN_50KG_BULTO', 'DOLARES_KILO', 'DOLARES_TON' };
        List<String> operations = new List<String>{ 'Contrato', 'Spot', 'Propuesta' };
        Integer caseIndex = 0;
        Test.startTest();
        for (String product : catalog.keySet()) {
            for (String subproduct : catalog.get(product)) {
                ALMEX_FormPricesController.PriceInput input = validInput();
                input.productName = product;
                input.subproductType = subproduct;
                input.shipmentSize = '15 Ton';
                input.unit = units[Math.mod(caseIndex, units.size())];
                input.commercialOperationType = operations[Math.mod(caseIndex, operations.size())];
                input.contractStartDate = Date.newInstance(2027, 1, 1);
                input.contractEndDate = Date.newInstance(2027, 12, 31);
                input.periodYear = 2027;
                input.periodMonth = 1;
                input.consumptionType = Math.mod(caseIndex, 2) == 0 ? 'M' : 'A';
                // Mismo contrato JSON que recibe el servicio desde el navegador.
                input = (ALMEX_FormPricesController.PriceInput) JSON.deserialize(JSON.serialize(input), ALMEX_FormPricesController.PriceInput.class);
                ALMEX_FormPricesController.SaveResponse response = ALMEX_FormPricesController.savePrice(input);
                System.assertEquals(true, response.success, product + ' / ' + subproduct);
                Precio_productos__c saved = [SELECT Nombre_producto__c, Tipo_subproducto__c, Unidad__c,
                    Periodo_Anio__c, Periodo_Mes__c, Tipo_consumo_toneladas__c,
                    Tipo_operacion_comercial__c, Fecha_inicio_contrato__c, Fecha_fin_contrato__c
                    FROM Precio_productos__c WHERE Id = :response.recordId];
                System.assertEquals(product, saved.Nombre_producto__c);
                System.assertEquals(subproduct, saved.Tipo_subproducto__c);
                System.assertEquals(input.unit, saved.Unidad__c);
                System.assertEquals(2027, saved.Periodo_Anio__c);
                System.assertEquals(1, saved.Periodo_Mes__c);
                System.assertEquals(input.consumptionType, saved.Tipo_consumo_toneladas__c);
                System.assertEquals(input.commercialOperationType, saved.Tipo_operacion_comercial__c);
                System.assertEquals(input.commercialOperationType == 'Contrato' ? input.contractStartDate : null, saved.Fecha_inicio_contrato__c);
                System.assertEquals(input.commercialOperationType == 'Contrato' ? input.contractEndDate : null, saved.Fecha_fin_contrato__c);
                caseIndex++;
            }
        }
        Test.stopTest();
        System.assertEquals(17, caseIndex, 'Deben probarse todos los productos y presentaciones del formulario.');
    }

    @IsTest
    static void savesStarchWithStandardAndCustomShipmentForEveryPresentation() {
        Test.startTest();
        for (String presentation : new List<String>{ '25 kilos', 'Granel', 'Super saco (500 kilos)', 'Super saco (1000 kilos)', 'Super saco (100 kilos)' }) {
            for (String shipment : new List<String>{ '20 Ton', '15 Ton' }) {
                ALMEX_FormPricesController.PriceInput input = validInput();
                input.productName = 'Almidón';
                input.subproductType = presentation;
                input.shipmentSize = shipment;
                ALMEX_FormPricesController.SaveResponse result = ALMEX_FormPricesController.savePrice(input);
                Precio_productos__c saved = [SELECT Tipo_subproducto__c, Tama_o_embarque__c
                    FROM Precio_productos__c WHERE Id = :result.recordId];
                System.assertEquals(presentation, saved.Tipo_subproducto__c);
                System.assertEquals(shipment, saved.Tama_o_embarque__c);
            }
        }
        Test.stopTest();
    }

    @IsTest
    static void rejectsStarchSubproductsNotOfferedByTheForm() {
        Test.startTest();
        for (String subproduct : new List<String>{ null, 'Generico', 'Granel industrial', '25' }) {
            ALMEX_FormPricesController.PriceInput input = validInput();
            input.productName = 'Almidón';
            input.subproductType = subproduct;
            Boolean rejected = false;
            try { ALMEX_FormPricesController.savePrice(input); }
            catch (AuraHandledException expected) { rejected = true; }
            System.assert(rejected, 'No aceptar una presentación que no está en el catálogo: ' + subproduct);
        }
        Test.stopTest();
    }

    @IsTest
    static void savesAnnualConsumptionWithoutConvertingVolume() {
        ALMEX_FormPricesController.PriceInput input = validInput();
        input.consumptionType = 'A';
        input.monthlyConsumption = 1200;
        input.productName = 'Dextrosa 95% líquida';
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
        System.assertEquals('Dextrosa 95% líquida', saved.Nombre_producto__c);
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
            'Dextrosa monohidratada', 'KRYSTAR líquido',
            'Dextrosa 95% líquida', 'Azúcar', 'Almidón'
        };
        Test.startTest();
        for (String product : products) {
            for (String shipment : new List<String>{ null, 'Granel industrial' }) {
                ALMEX_FormPricesController.PriceInput input = validInput();
                input.productName = product;
                input.subproductType = product == 'Almidón' ? 'Granel' : 'Azucar liquida';
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

    @IsTest
    static void savesCommercialTypesContractDatesAndCustomShipment() {
        Test.startTest();
        for (String operation : new List<String>{ 'Contrato', 'Spot', 'Propuesta' }) {
            ALMEX_FormPricesController.PriceInput input = validInput();
            input.commercialOperationType = operation;
            input.contractStartDate = Date.newInstance(2027, 1, 1);
            input.contractEndDate = Date.newInstance(2027, 12, 31);
            input.productName = 'Glucosa 63';
            input.shipmentSize = '15 Ton';
            ALMEX_FormPricesController.SaveResponse result = ALMEX_FormPricesController.savePrice(input);
            Precio_productos__c saved = [SELECT Tipo_operacion_comercial__c, Fecha_inicio_contrato__c,
                Fecha_fin_contrato__c, Tama_o_embarque__c FROM Precio_productos__c WHERE Id = :result.recordId];
            System.assertEquals(operation, saved.Tipo_operacion_comercial__c);
            System.assertEquals(operation == 'Contrato' ? input.contractStartDate : null, saved.Fecha_inicio_contrato__c);
            System.assertEquals(operation == 'Contrato' ? input.contractEndDate : null, saved.Fecha_fin_contrato__c);
            System.assertEquals('15 Ton', saved.Tama_o_embarque__c);
        }
        Test.stopTest();
    }

    @IsTest
    static void rejectsInvalidCommercialTypesDatesAndCustomShipments() {
        Test.startTest();
        for (String invalid : new List<String>{ 'missingType', 'missingDates', 'reversedDates', '0 Ton', '-15 Ton', '15', 'Otro' }) {
            ALMEX_FormPricesController.PriceInput input = validInput();
            input.productName = 'Glucosa 63';
            input.shipmentSize = '15 Ton';
            if (invalid == 'missingType') input.commercialOperationType = null;
            else if (invalid == 'missingDates') input.commercialOperationType = 'Contrato';
            else if (invalid == 'reversedDates') {
                input.commercialOperationType = 'Contrato';
                input.contractStartDate = Date.newInstance(2027, 2, 1);
                input.contractEndDate = Date.newInstance(2027, 1, 1);
            } else input.shipmentSize = invalid;
            Boolean rejected = false;
            try { ALMEX_FormPricesController.savePrice(input); }
            catch (AuraHandledException expected) { rejected = true; }
            System.assert(rejected, 'Debe rechazar: ' + invalid);
        }
        Test.stopTest();
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
        input.commercialOperationType = 'Spot';
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
