public with sharing class ALMEX_MapDataController {

    @AuraEnabled(cacheable=true)
    public static List<Precio_productos__c> getPrices() {
        return [
            SELECT
                Id,
                Ciudad__c,
                Consumo_mensual__c,
                Estado__c,
                Municipio__c,
                Nombre_comercial__c,
                Nombre_producto__c,
                Precio_producto__c,
                Proveedor__c,
                Periodo_Anio__c,
                Periodo_Mes__c,
                Tama_o_embarque__c,
                Tipo_subproducto__c,
                Unidad__c
            FROM Precio_productos__c
            ORDER BY Periodo_Anio__c DESC, Periodo_Mes__c DESC
        ];
    }
}
