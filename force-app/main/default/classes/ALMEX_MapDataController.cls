public with sharing class ALMEX_MapDataController {

    private static final String PERIOD_YEAR_FIELD = 'Periodo_Anio__c';
    private static final String PERIOD_MONTH_FIELD = 'Periodo_Mes__c';

    @AuraEnabled(cacheable=true)
    public static List<Precio_productos__c> getPrices() {
        List<String> selectedFields = new List<String>{
            'Id',
            'Ciudad__c',
            'Consumo_mensual__c',
            'Estado__c',
            'Municipio__c',
            'Nombre_comercial__c',
            'Nombre_producto__c',
            'Precio_producto__c',
            'Proveedor__c',
            'Tama_o_embarque__c',
            'Tipo_subproducto__c',
            'Unidad__c'
        };

        Map<String, Schema.SObjectField> priceFields =
            Schema.SObjectType.Precio_productos__c.fields.getMap();
        Boolean canReadPeriod = isFieldAccessible(priceFields, PERIOD_YEAR_FIELD) &&
            isFieldAccessible(priceFields, PERIOD_MONTH_FIELD);

        if (canReadPeriod) {
            selectedFields.add(PERIOD_YEAR_FIELD);
            selectedFields.add(PERIOD_MONTH_FIELD);
        }

        String orderByClause = canReadPeriod
            ? PERIOD_YEAR_FIELD + ' DESC, ' + PERIOD_MONTH_FIELD + ' DESC'
            : 'CreatedDate DESC';
        String queryText = 'SELECT ' + String.join(selectedFields, ', ') +
            ' FROM Precio_productos__c WITH USER_MODE ORDER BY ' + orderByClause;

        return Database.query(queryText);
    }

    private static Boolean isFieldAccessible(
        Map<String, Schema.SObjectField> availableFields,
        String fieldName
    ) {
        return availableFields.containsKey(fieldName) &&
            availableFields.get(fieldName).getDescribe().isAccessible();
    }
}
