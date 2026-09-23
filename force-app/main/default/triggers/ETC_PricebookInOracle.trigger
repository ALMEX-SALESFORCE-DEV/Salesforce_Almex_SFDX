trigger ETC_PricebookInOracle on Pricebook2(after insert, after update) {
	Set<Id> pricebookIds = new Set<Id>();
	Map<Id, Boolean> pricebookOracleMap = new Map<Id, Boolean>();

	for (Pricebook2 pb : Trigger.new) {
		pricebookIds.add(pb.Id);
		pricebookOracleMap.put(pb.Id, pb.From_Oracle__c);
	}

	List<SalesAgreement> updatedSa = new List<SalesAgreement>();

	List<SalesAgreement> saList = [
		SELECT Id, PricebookId
		FROM SalesAgreement
		WHERE PricebookId IN :pricebookIds
	];

	for (SalesAgreement sa : saList) {
		if (pricebookOracleMap.containsKey(sa.PricebookId)) {
			sa.Con_Lista_de_Precio__c = pricebookOracleMap.get(sa.PricebookId);
			updatedSa.add(sa);
		}
	}

	if (!updatedSa.isEmpty()) {
		update updatedSa;
	}
}