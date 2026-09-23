trigger ETC_SendPriceListToOracle on SalesAgreement(before insert, before update) {
	Set<Id> pricebookIds = new Set<Id>();
	for (SalesAgreement sa : Trigger.new) {
		if (sa.PricebookId != null) {
			pricebookIds.add(sa.PricebookId);
		}
	}

	Map<Id, Pricebook2> pricebookMap = new Map<Id, Pricebook2>(
		[
			SELECT Id, External_Id__c, Name, From_Oracle__c, isStandard
			FROM Pricebook2
			WHERE Id IN :pricebookIds
		]
	);

	for (SalesAgreement sa : Trigger.new) {
		if (sa.PricebookId != null && pricebookMap.containsKey(sa.PricebookId)) {
			Pricebook2 pb = pricebookMap.get(sa.PricebookId);
			sa.Standard_Pricebook__c = pb.isStandard;
			sa.Con_Lista_de_Precio__c = pb.From_Oracle__c;
		}
	}
}