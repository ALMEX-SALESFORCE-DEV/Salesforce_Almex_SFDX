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
            'QRO' => 'Querétaro',
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
            'ZA' => 'Zacatecas',
            'AGS' => 'Aguascalientes',
            'AGU' => 'Aguascalientes',
            'BCN' => 'Baja California',
            'BCS' => 'Baja California Sur',
            'CAM' => 'Campeche',
            'CAMP' => 'Campeche',
            'COA' => 'Coahuila',
            'COL' => 'Colima',
            'CHP' => 'Chiapas',
            'CHIS' => 'Chiapas',
            'CHH' => 'Chihuahua',
            'CHIH' => 'Chihuahua',
            'CMX' => 'Ciudad de México',
            'DIF' => 'Ciudad de México',
            'DGO' => 'Durango',
            'DUR' => 'Durango',
            'GTO' => 'Guanajuato',
            'GUA' => 'Guanajuato',
            'GRO' => 'Guerrero',
            'HGO' => 'Hidalgo',
            'HID' => 'Hidalgo',
            'MEX' => 'Estado de México',
            'EDOMEX' => 'Estado de México',
            'MIC' => 'Michoacán',
            'MICH' => 'Michoacán',
            'MOR' => 'Morelos',
            'NAY' => 'Nayarit',
            'NLE' => 'Nuevo León',
            'OAX' => 'Oaxaca',
            'PUE' => 'Puebla',
            'QUE' => 'Querétaro',
            'QROO' => 'Quintana Roo',
            'ROO' => 'Quintana Roo',
            'SLP' => 'San Luis Potosí',
            'SON' => 'Sonora',
            'TAB' => 'Tabasco',
            'TAM' => 'Tamaulipas',
            'TAMS' => 'Tamaulipas',
            'TAMPS' => 'Tamaulipas',
            'TLA' => 'Tlaxcala',
            'TLAX' => 'Tlaxcala',
            'VER' => 'Veracruz',
            'YUC' => 'Yucatán',
            'ZAC' => 'Zacatecas'
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
        @AuraEnabled public String consumptionType { get; set; }
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

    public class BranchSuggestion {
        @AuraEnabled public Id branchId { get; set; }
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
    public static List<BranchSuggestion> searchBranches(String searchTerm) {
        String normalizedTerm = String.isBlank(searchTerm)
            ? ''
            : searchTerm.trim().replace('%', '').replace('_', '');
        if (normalizedTerm.length() < 2) {
            return new List<BranchSuggestion>();
        }
        if (!Sucursal__c.SObjectType.getDescribe().isAccessible()) {
            throw new AuraHandledException('No tienes permisos para consultar sucursales.');
        }

        String searchPattern = '%' + normalizedTerm + '%';
        List<Sucursal__c> matchingBranches = [
            SELECT Id, Name, Estado__c, Ciudad__c
            FROM Sucursal__c
            WHERE Name LIKE :searchPattern
            ORDER BY Name
            LIMIT 8
        ];
        SObjectAccessDecision accessDecision = Security.stripInaccessible(
            AccessType.READABLE,
            matchingBranches
        );

        List<BranchSuggestion> suggestions = new List<BranchSuggestion>();
        for (SObject safeRecord : accessDecision.getRecords()) {
            Sucursal__c branchRecord = (Sucursal__c) safeRecord;
            BranchSuggestion suggestion = new BranchSuggestion();
            suggestion.branchId = branchRecord.Id;
            suggestion.name = branchRecord.Name;
            suggestion.state = normalizeMexicanState(branchRecord.Estado__c);
            // Sucursal no tiene municipio independiente; el LWC lo resuelve
            // con el catálogo de localidades y permite completar datos faltantes.
            suggestion.municipality = null;
            suggestion.city = branchRecord.Ciudad__c;
            suggestion.subtitle = joinNonBlank(
                new List<String>{ branchRecord.Ciudad__c, suggestion.state },
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
        if (!Precio_productos__c.Tipo_consumo_toneladas__c.getDescribe().isCreateable()) {
            throw new AuraHandledException('No tienes permisos para registrar el tipo de consumo.');
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
            Tipo_consumo_toneladas__c = String.isBlank(input.consumptionType)
                ? 'M' : input.consumptionType.trim().toUpperCase(),
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
        // No confirmar un registro si Salesforce descartó datos capturados por FLS.
        Set<String> removedFields = accessDecision.getRemovedFields().get('Precio_productos__c');
        List<String> suppliedFieldsWithoutAccess = new List<String>();
        if (removedFields != null) {
            for (String fieldName : removedFields) {
                if (record.get(fieldName) != null) {
                    suppliedFieldsWithoutAccess.add(fieldName);
                }
            }
        }
        if (!suppliedFieldsWithoutAccess.isEmpty()) {
            suppliedFieldsWithoutAccess.sort();
            throw new AuraHandledException('No tienes permisos para registrar estos campos: ' +
                String.join(suppliedFieldsWithoutAccess, ', '));
        }
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
            : 'Precio registrado, pero el periodo no se guardó: faltan los campos de año/mes o permisos para editarlos.';
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
            requireText(input.factoryCity, 'Lugar de fabricación (Ciudad)');
        }

        String productKey = normalizeProductKey(input.productName);
        if (productKey == 'almidon' || productKey == 'azucar') {
            requireText(input.subproductType, 'Subproducto');
            Set<String> allowedSubproducts = productKey == 'almidon'
                ? new Set<String>{ 'generico' }
                : new Set<String>{ 'estandar', 'refinada', 'azucar liquida' };
            if (!allowedSubproducts.contains(normalizeProductKey(input.subproductType))) {
                throw new AuraHandledException('Selecciona un subproducto válido para el producto.');
            }
        }
        Boolean needsShipment = productKey.startsWith('glucosa') ||
            productKey.startsWith('fructosa') || productKey.startsWith('fructuosa') ||
            (productKey.startsWith('dextrosa') && productKey.contains('liquida')) ||
            productKey == 'dextrosa monohidratada' || productKey == 'krystar liquido' ||
            (productKey == 'azucar' && normalizeProductKey(input.subproductType) == 'azucar liquida');
        if (needsShipment) {
            requireText(input.shipmentSize, 'Tamaño de embarque');
            Set<String> allowedShipments = new Set<String>{ '10 Ton', '20 Ton', '30 Ton', '38 Ton', 'N/A' };
            if (!allowedShipments.contains(input.shipmentSize.trim())) {
                throw new AuraHandledException('Selecciona un tamaño de embarque válido.');
            }
        }

        if (input.monthlyConsumption == null || input.monthlyConsumption < 0) {
            throw new AuraHandledException('El consumo debe ser un valor igual o mayor que cero.');
        }
        String consumptionType = String.isBlank(input.consumptionType)
            ? 'M' : input.consumptionType.trim().toUpperCase();
        if (consumptionType != 'M' && consumptionType != 'A') {
            throw new AuraHandledException('Selecciona consumo mensual o anual.');
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

    private static String normalizeProductKey(String value) {
        return String.isBlank(value) ? '' : value.trim().toLowerCase()
            .replace('á', 'a').replace('é', 'e').replace('í', 'i')
            .replace('ó', 'o').replace('ú', 'u');
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
        String stateByCode = MEXICAN_STATES_BY_CODE.get(
            normalized.toUpperCase().replaceAll('[^A-Z0-9]', '')
        );
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
