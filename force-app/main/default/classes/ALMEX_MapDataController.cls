public with sharing class ALMEX_MapDataController {

    private static final String PERIOD_YEAR_FIELD = 'Periodo_Anio__c';

    public class ExchangeRate {
        @AuraEnabled public Decimal mxnPerUsd { get; set; }
        @AuraEnabled public Date rateDate { get; set; }
        @AuraEnabled public String source { get; set; }
    }

    @AuraEnabled(cacheable=true)
    public static ExchangeRate getExchangeRate() {
        HttpRequest request = new HttpRequest();
        request.setEndpoint('callout:ALMEX_Banxico_API/SieAPIRest/service/v1/series/SF43718/datos/oportuno');
        request.setMethod('GET');
        request.setHeader('Accept', 'application/json');
        request.setTimeout(20000);
        try {
            HttpResponse response = new Http().send(request);
            if (response.getStatusCode() != 200) {
                throw new CalloutException('HTTP ' + response.getStatusCode());
            }
            Map<String, Object> root = (Map<String, Object>) JSON.deserializeUntyped(response.getBody());
            Map<String, Object> bmx = (Map<String, Object>) root.get('bmx');
            List<Object> series = (List<Object>) bmx.get('series');
            Map<String, Object> seriesRow = (Map<String, Object>) series[0];
            if ((String) seriesRow.get('idSerie') != 'SF43718') throw new CalloutException('Serie inesperada');
            List<Object> observations = (List<Object>) seriesRow.get('datos');
            Map<String, Object> observation = (Map<String, Object>) observations[0];
            Decimal rate = Decimal.valueOf(((String) observation.get('dato')).replace(',', '').trim());
            if (rate <= 0) throw new CalloutException('Tasa inválida');
            List<String> dateParts = ((String) observation.get('fecha')).split('/');
            ExchangeRate result = new ExchangeRate();
            result.mxnPerUsd = rate;
            result.rateDate = Date.newInstance(Integer.valueOf(dateParts[2]), Integer.valueOf(dateParts[1]), Integer.valueOf(dateParts[0]));
            if (result.rateDate > Date.today()) throw new CalloutException('Fecha futura');
            result.source = 'Banco de México · FIX';
            return result;
        } catch (Exception error) {
            // Nunca registrar ni devolver tokens, encabezados o cuerpos de autenticación.
            throw new AuraHandledException('No se pudo obtener el FIX de Banxico. Revisa la conexión y el acceso a BanxicoPrincipal; no se convertirán precios MXN sin una tasa válida.');
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<Precio_productos__c> getPrices() {
        List<String> selectedFields = new List<String>{
            'Id',
            'CreatedDate',
            'Ciudad__c',
            'Consumo_mensual__c',
            'Tipo_consumo_toneladas__c',
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
        for (String commercialField : new List<String>{
            'Tipo_operacion_comercial__c', 'Fecha_inicio_contrato__c', 'Fecha_fin_contrato__c', 'Producto_importado__c'
        }) {
            if (isFieldAccessible(priceFields, commercialField)) selectedFields.add(commercialField);
        }
        Boolean canReadPeriod = isFieldAccessible(priceFields, PERIOD_YEAR_FIELD);

        if (canReadPeriod) {
            selectedFields.add(PERIOD_YEAR_FIELD);
        }

        String orderByClause = canReadPeriod
            ? PERIOD_YEAR_FIELD + ' DESC, CreatedDate DESC'
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
