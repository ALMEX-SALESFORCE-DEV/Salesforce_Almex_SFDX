public with sharing class ALMEX_MapDataController {

    @AuraEnabled
    public static List<Precio_productos__c> getPrices() {

        List<Precio_productos__c> prices = [
            SELECT
                Id,
                CreatedDate,
                Ciudad__c,
                Consumo_mensual__c,
                Estado__c,
                Municipio__c,
                Nombre_comercial__c,
                Nombre_producto__c,
                Precio_producto__c,
                Proveedor__c,
                Tama_o_embarque__c,
                Tipo_subproducto__c,
                Unidad__c
            FROM Precio_productos__c
        ];

        return prices;
    }
}