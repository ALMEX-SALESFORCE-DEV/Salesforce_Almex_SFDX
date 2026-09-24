/**
 * Controller for the commercial product-price registration form.
 *
 * Product/subproduct options are derived from existing records so the UI can
 * react to the selected product without hard-coded catalog values.
 */
public with sharing class ALMEX_FormPricesController {
    private static final String PERIOD_YEAR_FIELD = 'Periodo_Anio__c';
    private static final String PERIOD_MONTH_FIELD = 'Periodo_Mes__c';
    private static final String NOT_APPLICABLE_SUPPLIER = 'N/A';
    private static final Map<String, String> MEXICAN_STATES_BY_CODE =
        new Map<String, String>{
            'AG' => 'Aguascalientes',
            'BC' => 'Baja California',
            'BS' => 'Baja California Sur',
            'CH' => 'Chihuahua',
            'CL' => 'Colima',
            'CM' => 'Campeche',
            'COAH' => 'Coahuila',
            'CO' => 'Coahuila',
            'CS' => 'Chiapas',
            'DF' => 'Ciudad de México',
            'DG' => 'Durango',
            'GR' => 'Guerrero',
            'GT' => 'Guanajuato',
            'HG' => 'Hidalgo',
            'JA' => 'Jalisco',
            'JAL' => 'Jalisco',
            'ME' => 'Estado de México',
            'MI' => 'Michoacán',
            'CDMX' => 'Ciudad de México',
            'MO' => 'Morelos',
            'NA' => 'Nayarit',
            'NL' => 'Nuevo León',
            'OA' => 'Oaxaca',
            'PB' => 'Puebla',
            'QE' => 'Querétaro',
            'QRO' => 'Quintana Roo',
            'QR' => 'Quintana Roo',
            'SI' => 'Sinaloa',
            'SIN' => 'Sinaloa',
            'SL' => 'San Luis Potosí',
            'SO' => 'Sonora',
            'TB' => 'Tabasco',
            'TL' => 'Tlaxcala',
            'TM' => 'Tamaulipas',
            'VE' => 'Veracruz',
            'YU' => 'Yucatán',
            'ZA' => 'Zacatecas'
        };

    public class FormOptions {
        @AuraEnabled public List<ProductOption> products { get; set; }
        @AuraEnabled public List<String> units { get; set; }
        @AuraEnabled public List<String> clientStates { get; set; }
        @AuraEnabled public List<String> factoryStates { get; set; }
        @AuraEnabled public Boolean supportsPeriod { get; set; }

        public FormOptions() {
            products = new List<ProductOption>();
            units = new List<String>();
            clientStates = new List<String>();
            factoryStates = new List<String>();
        }
    }

    public class ProductOption {
        @AuraEnabled public String label { get; set; }
        @AuraEnabled public String value { get; set; }
        @AuraEnabled public List<String> subproducts { get; set; }

        public ProductOption(String productName) {
            label = productName;
            value = productName;
            subproducts = new List<String>();
        }
    }

    public class PriceInput {
        @AuraEnabled public String productName { get; set; }
        @AuraEnabled public String subproductType { get; set; }
        @AuraEnabled public Integer periodYear { get; set; }
        @AuraEnabled public Integer periodMonth { get; set; }
        @AuraEnabled public String commercialName { get; set; }
        @AuraEnabled public String state { get; set; }
        @AuraEnabled public String municipality { get; set; }
        @AuraEnabled public String city { get; set; }
        @AuraEnabled public Decimal monthlyConsumption { get; set; }
        @AuraEnabled public Decimal price { get; set; }
        @AuraEnabled public String unit { get; set; }
        @AuraEnabled public String shipmentSize { get; set; }
        @AuraEnabled public String supplier { get; set; }
        @AuraEnabled public String factoryState { get; set; }
        @AuraEnabled public String factoryCity { get; set; }
    }

    public class SaveResponse {
        @AuraEnabled public Boolean success { get; set; }
        @AuraEnabled public Id recordId { get; set; }
        @AuraEnabled public Boolean periodPersisted { get; set; }
        @AuraEnabled public String message { get; set; }
    }

    public class AccountSuggestion {
        @AuraEnabled public Id accountId { get; set; }
        @AuraEnabled public String name { get; set; }
        @AuraEnabled public String state { get; set; }
        @AuraEnabled public String municipality { get; set; }
        @AuraEnabled public String city { get; set; }
        @AuraEnabled public String subtitle { get; set; }
    }

    @AuraEnabled(cacheable=true)
    public static FormOptions getFormOptions() {
        assertObjectReadable();

        FormOptions result = new FormOptions();
        result.supportsPeriod = supportsPeriodFields();

        ProductOption currentProduct;
        String currentProductName;
        for (AggregateResult row : [
            SELECT Nombre_producto__c productName, Tipo_subproducto__c subproductName
            FROM Precio_productos__c
            WHERE Nombre_producto__c != NULL
            GROUP BY Nombre_producto__c, Tipo_subproducto__c
            ORDER BY Nombre_producto__c, Tipo_subproducto__c
        ]) {
            String productName = (String) row.get('productName');
            String subproductName = (String) row.get('subproductName');

            if (currentProduct == null || currentProductName != productName) {
                currentProduct = new ProductOption(productName);
                currentProductName = productName;
                result.products.add(currentProduct);
            }
            if (String.isNotBlank(subproductName)) {
                currentProduct.subproducts.add(subproductName);
            }
        }

        for (AggregateResult row : [
            SELECT Unidad__c unitName
            FROM Precio_productos__c
            WHERE Unidad__c != NULL
            GROUP BY Unidad__c
            ORDER BY Unidad__c
        ]) {
            result.units.add((String) row.get('unitName'));
        }

        for (AggregateResult row : [
            SELECT Estado__c stateName
            FROM Precio_productos__c
            WHERE Estado__c != NULL
            GROUP BY Estado__c
            ORDER BY Estado__c
        ]) {
            result.clientStates.add((String) row.get('stateName'));
        }

        for (AggregateResult row : [
            SELECT Lugar_fabricaci_n_estado__c stateName
            FROM Precio_productos__c
            WHERE Lugar_fabricaci_n_estado__c != NULL
            GROUP BY Lugar_fabricaci_n_estado__c
            ORDER BY Lugar_fabricaci_n_estado__c
        ]) {
            result.factoryStates.add((String) row.get('stateName'));
        }

        return result;
    }

    @AuraEnabled(cacheable=true)
    public static List<AccountSuggestion> searchAccounts(String searchTerm) {
        String normalizedTerm = String.isBlank(searchTerm)
            ? ''
            : searchTerm.trim().replace('%', '').replace('_', '');
        if (normalizedTerm.length() < 2) {
            return new List<AccountSuggestion>();
        }
        if (!Account.SObjectType.getDescribe().isAccessible()) {
            throw new AuraHandledException('No tienes permisos para consultar clientes.');
        }

        String searchPattern = '%' + normalizedTerm + '%';
        List<Account> matchingAccounts = [
            SELECT Id, Name, BillingState, BillingCity
            FROM Account
            WHERE Name LIKE :searchPattern
            ORDER BY Name
            LIMIT 8
        ];
        SObjectAccessDecision accessDecision = Security.stripInaccessible(
            AccessType.READABLE,
            matchingAccounts
        );

        List<AccountSuggestion> suggestions = new List<AccountSuggestion>();
        for (SObject safeRecord : accessDecision.getRecords()) {
            Account accountRecord = (Account) safeRecord;
            AccountSuggestion suggestion = new AccountSuggestion();
            suggestion.accountId = accountRecord.Id;
            suggestion.name = accountRecord.Name;
            suggestion.state = normalizeMexicanState(accountRecord.BillingState);
            suggestion.municipality = accountRecord.BillingCity;
            suggestion.city = accountRecord.BillingCity;
            suggestion.subtitle = joinNonBlank(
                new List<String>{ accountRecord.BillingCity, suggestion.state },
                ' · '
            );
            suggestions.add(suggestion);
        }
        return suggestions;
    }

    @AuraEnabled
    public static SaveResponse savePrice(PriceInput input) {
        validateInput(input);

        if (!Precio_productos__c.SObjectType.getDescribe().isCreateable()) {
            throw new AuraHandledException('No tienes permisos para registrar precios de producto.');
        }

        Precio_productos__c record = new Precio_productos__c(
            Name = buildRecordName(input),
            Nombre_producto__c = input.productName.trim(),
            Tipo_subproducto__c = clean(input.subproductType),
            Nombre_comercial__c = input.commercialName.trim(),
            Estado__c = normalizeMexicanState(input.state),
            Municipio__c = input.municipality.trim(),
            Ciudad__c = input.city.trim(),
            Consumo_mensual__c = input.monthlyConsumption,
            Precio_producto__c = input.price,
            Unidad__c = input.unit.trim(),
            Tama_o_embarque__c = clean(input.shipmentSize),
            Proveedor__c = input.supplier.trim(),
            Lugar_fabricaci_n_estado__c = isSupplierNotApplicable(input.supplier)
                ? null
                : normalizeMexicanState(input.factoryState),
            Lugar_fabricaci_n_ciudad__c = isSupplierNotApplicable(input.supplier)
                ? null
                : clean(input.factoryCity)
        );

        Boolean periodPersisted = putPeriodWhenAvailable(record, input.periodYear, input.periodMonth);
        SObjectAccessDecision accessDecision = Security.stripInaccessible(
            AccessType.CREATABLE,
            new List<Precio_productos__c>{ record }
        );
        Precio_productos__c safeRecord = (Precio_productos__c) accessDecision.getRecords()[0];

        try {
            insert safeRecord;
        } catch (DmlException error) {
            throw new AuraHandledException('No fue posible registrar el precio: ' + error.getDmlMessage(0));
        }

        SaveResponse response = new SaveResponse();
        response.success = true;
        response.recordId = safeRecord.Id;
        response.periodPersisted = periodPersisted;
        response.message = periodPersisted
            ? 'Precio registrado correctamente.'
            : 'Precio registrado. El periodo no se guardó porque el objeto aún no tiene los campos de año y mes.';
        return response;
    }

    private static void validateInput(PriceInput input) {
        if (input == null) {
            throw new AuraHandledException('La información del formulario es obligatoria.');
        }

        requireText(input.productName, 'Tipo de producto');
        requireText(input.commercialName, 'Nombre comercial / Razón social');
        requireText(input.state, 'Estado');
        requireText(input.municipality, 'Municipio');
        requireText(input.city, 'Ciudad');
        requireText(input.unit, 'Unidad');
        requireText(input.supplier, 'Proveedor');
        if (!isSupplierNotApplicable(input.supplier)) {
            requireText(input.factoryState, 'Lugar de fabricación (Estado)');
        }

        if (input.monthlyConsumption == null || input.monthlyConsumption < 0) {
            throw new AuraHandledException('El consumo mensual debe ser un valor igual o mayor que cero.');
        }
        if (input.price == null || input.price < 0) {
            throw new AuraHandledException('El precio debe ser un valor igual o mayor que cero.');
        }
        if (input.periodYear == null || input.periodYear < 2000 || input.periodYear > 2100) {
            throw new AuraHandledException('Selecciona un año de periodo válido.');
        }
        if (input.periodMonth == null || input.periodMonth < 1 || input.periodMonth > 12) {
            throw new AuraHandledException('Selecciona un mes de periodo válido.');
        }
    }

    private static void requireText(String value, String label) {
        if (String.isBlank(value)) {
            throw new AuraHandledException('El campo "' + label + '" es obligatorio.');
        }
    }

    private static String clean(String value) {
        return String.isBlank(value) ? null : value.trim();
    }

    private static Boolean isSupplierNotApplicable(String supplier) {
        return String.isNotBlank(supplier) &&
            supplier.trim().equalsIgnoreCase(NOT_APPLICABLE_SUPPLIER);
    }

    private static String buildRecordName(PriceInput input) {
        String recordName = input.productName.trim() + ' - ' + input.commercialName.trim() +
            ' - ' + String.valueOf(input.periodYear) + '-' +
            String.valueOf(input.periodMonth).leftPad(2, '0');
        return recordName.length() > 80 ? recordName.substring(0, 80) : recordName;
    }

    private static String normalizeMexicanState(String stateName) {
        if (String.isBlank(stateName)) {
            return null;
        }
        String normalized = stateName.trim();
        String stateByCode = MEXICAN_STATES_BY_CODE.get(normalized.toUpperCase());
        if (stateByCode != null) {
            return stateByCode;
        }
        if (normalized.equalsIgnoreCase('Distrito Federal')) {
            return 'Ciudad de México';
        }
        if (normalized.equalsIgnoreCase('México')) {
            return 'Estado de México';
        }
        if (normalized.equalsIgnoreCase('Querétaro de Arteaga')) {
            return 'Querétaro';
        }
        return normalized;
    }

    private static String joinNonBlank(List<String> values, String separator) {
        List<String> populatedValues = new List<String>();
        for (String value : values) {
            if (String.isNotBlank(value)) {
                populatedValues.add(value.trim());
            }
        }
        return String.join(populatedValues, separator);
    }

    private static void assertObjectReadable() {
        if (!Precio_productos__c.SObjectType.getDescribe().isAccessible()) {
            throw new AuraHandledException('No tienes permisos para consultar precios de producto.');
        }
    }

    private static Boolean supportsPeriodFields() {
        Map<String, Schema.SObjectField> fields = Precio_productos__c.SObjectType.getDescribe().fields.getMap();
        return getFieldIgnoreCase(fields, PERIOD_YEAR_FIELD) != null &&
            getFieldIgnoreCase(fields, PERIOD_MONTH_FIELD) != null;
    }

    private static Boolean putPeriodWhenAvailable(Precio_productos__c record, Integer year, Integer month) {
        Map<String, Schema.SObjectField> fields = Precio_productos__c.SObjectType.getDescribe().fields.getMap();
        Schema.SObjectField yearField = getFieldIgnoreCase(fields, PERIOD_YEAR_FIELD);
        Schema.SObjectField monthField = getFieldIgnoreCase(fields, PERIOD_MONTH_FIELD);

        if (yearField == null || monthField == null ||
            !yearField.getDescribe().isCreateable() || !monthField.getDescribe().isCreateable()) {
            return false;
        }

        record.put(yearField, year);
        record.put(monthField, month);
        return true;
    }

    private static Schema.SObjectField getFieldIgnoreCase(
        Map<String, Schema.SObjectField> fields,
        String apiName
    ) {
        for (String fieldName : fields.keySet()) {
            if (fieldName.equalsIgnoreCase(apiName)) {
                return fields.get(fieldName);
            }
        }
        return null;
    }
}
