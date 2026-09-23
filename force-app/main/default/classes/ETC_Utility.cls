public with sharing class ETC_Utility {
	public static endpoint__mdt getEndpoint(String name) {
		return [
			SELECT Id, client_id__c, client_secret__c, grant_type__c, host__c, method__c, scope__c, response__c, path__c, auth_type__c
			FROM endpoint__mdt
			WHERE DeveloperName = :name
			LIMIT 1
		];
	}

	// Este metodo elimina productos que no fueron creados correctamente
	// en el flujo de listas de precio
	public static void removeBadProducts(String familyProduct) {
		Product2[] products = [
			SELECT Id, Name, Oracle_Id__c
			FROM Product2
			WHERE
				Producto_Principal__c = NULL
				AND IsActive = TRUE
				AND Family = :familyProduct
				AND Oracle_Id__c LIKE '%_P%'
		];
		System.debug(products);

		String[] quoteLinesToRemove = new List<String>{};
		String[] pricebookEntriesToRemove = new List<String>{};

		for (Product2 p : products) {
			for (QuoteLineItem q : [SELECT Id FROM QuoteLineItem WHERE product2Id = :p.Id]) {
				quoteLinesToRemove.add(q.Id);
			}
			for (PricebookEntry pbe : [
				SELECT Id
				FROM PricebookEntry
				WHERE Product2Id = :p.Id AND Pricebook2.IsStandard = FALSE
			]) {
				pricebookEntriesToRemove.add(pbe.Id);
			}
		}

		Database.delete(quoteLinesToRemove);
		System.debug(quoteLinesToRemove);
		Database.delete(pricebookEntriesToRemove);
		System.debug(pricebookEntriesToRemove);
		Database.delete(products);
		System.debug(products);
	}

	public static String getStringDateTime(Date dateInput, Time timeInput, String addTime) {
		String timeToAdd = addTime != null ? addTime : '+00:00';
		return String.valueOf(dateInput).split(' ')[0] + 'T' + String.valueOf(timeInput).split('\\.')[0] + timeToAdd;
	}
}