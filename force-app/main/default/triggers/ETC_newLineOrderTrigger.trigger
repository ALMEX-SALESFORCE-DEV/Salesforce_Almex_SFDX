trigger ETC_newLineOrderTrigger on Order(before insert, before update) {
	Set<Id> pricebookIds = new Set<Id>();
	Set<Id> accountIds = new Set<Id>();

	// 1. Recolectar los Pricebook2Id y AccountId relevantes
	for (Order o : Trigger.new) {
		if (o.Pricebook2Id != null && o.AccountId != null) {
			pricebookIds.add(o.Pricebook2Id);
			accountIds.add(o.AccountId);
		}
	}

	// 2. Consultar SalesAgreements relacionados, los más recientes por combinación
	List<SalesAgreement> agreements = [
		SELECT Id, StartDate, PricebookId, AccountId, Pricebook.External_Id__c, CreatedDate
		FROM SalesAgreement
		WHERE PricebookId IN :pricebookIds AND AccountId IN :accountIds
		ORDER BY CreatedDate DESC
	];

	// 3. Mapear por combinación PricebookId + AccountId
	Map<String, SalesAgreement> saMap = new Map<String, SalesAgreement>();

	for (SalesAgreement sa : agreements) {
		String key = sa.PricebookId + '-' + sa.AccountId;
		if (!saMap.containsKey(key)) {
			saMap.put(key, sa); // Solo el más reciente por combinación
		}
	}

	// 4. Asignar SalesAgreementId al Order si aplica
	for (Order o : Trigger.new) {
		if (o.Pricebook2Id != null && o.AccountId != null) {
			String key = o.Pricebook2Id + '-' + o.AccountId;
			SalesAgreement relatedSA = saMap.get(key);

			if (
				relatedSA != null &&
				relatedSA.Pricebook.External_Id__c != null &&
				relatedSA.Pricebook.External_Id__c != 'standard'
			) {
				if (o.EffectiveDate < relatedSA.StartDate) {
					o.Fecha_inicial_recibida__c = o.EffectiveDate;
					o.EffectiveDate = relatedSA.StartDate;
				}
				if (Trigger.isInsert) {
					o.SalesAgreementId = relatedSA.Id;
				}
			}
		}
	}
}