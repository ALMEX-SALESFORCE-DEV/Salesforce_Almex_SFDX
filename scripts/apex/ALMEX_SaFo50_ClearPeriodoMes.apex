// Ejecutar ANTES del retiro de Periodo_Mes__c. Nunca elimina registros.
System.assert([SELECT IsSandbox FROM Organization LIMIT 1].IsSandbox,
    'Este script solo está autorizado para un sandbox.');
Map<String, Schema.SObjectField> priceFields = Precio_productos__c.SObjectType.getDescribe().fields.getMap();
if (priceFields.containsKey('Periodo_Mes__c')) {
    Integer countBefore = [SELECT count() FROM Precio_productos__c];
    List<SObject> prices = Database.query(
        'SELECT Id, Periodo_Mes__c FROM Precio_productos__c WHERE Periodo_Mes__c != null');
    for (SObject price : prices) price.put('Periodo_Mes__c', null);
    if (!prices.isEmpty()) update prices;
    System.assertEquals(countBefore, [SELECT count() FROM Precio_productos__c]);
    System.debug('SaFo-50: valores de mes limpiados: ' + prices.size() + '; registros eliminados: 0.');
} else {
    System.debug('SaFo-50: Periodo_Mes__c ya está retirado; sin cambios.');
}
