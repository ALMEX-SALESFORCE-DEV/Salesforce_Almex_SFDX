trigger ETC_LinkQuoteToSalesAgreement on SalesAgreement(before insert, before update) {
	try {
		// 1. Recopilar Pricebook IDs de los registros entrantes
		Set<Id> pbIds = new Set<Id>();
		for (SalesAgreement sa : Trigger.new) {
			if (sa.PricebookId != null) {
				pbIds.add(sa.PricebookId);
			}
		}

		if (!pbIds.isEmpty()) {
			// 2. Consultar Pricebooks relevantes (no estándar y con Cotizacion__c)
			Map<Id, Id> pbToQuoteId = new Map<Id, Id>();
			for (Pricebook2 pb : [
				SELECT Id, Cotizacion__c
				FROM Pricebook2
				WHERE Id IN :pbIds AND IsStandard = FALSE AND Cotizacion__c != NULL
			]) {
				pbToQuoteId.put(pb.Id, pb.Cotizacion__c);
			}

			if (!pbToQuoteId.isEmpty()) {
				// 3. Consultar Quotes relacionados por Cotizacion__c
				Map<Id, Quote> quoteMap = new Map<Id, Quote>();
				for (Quote q : [
					SELECT Id, Acuerdo_de_suministro__c
					FROM Quote
					WHERE Id IN :pbToQuoteId.values()
				]) {
					quoteMap.put(q.Id, q);
				}

				// 4. Preparar actualizaciones: listas de SA a actualizar y Quotes a actualizar
				List<SalesAgreement> sasToUpdate = new List<SalesAgreement>();
				List<Quote> quotesToUpdate = new List<Quote>();

				for (SalesAgreement sa : Trigger.new) {
					Id qId = pbToQuoteId.get(sa.PricebookId);
					if (qId != null && quoteMap.containsKey(qId)) {
						sa.Cotizacion__c = qId; // asignar campo lookup
						sasToUpdate.add(sa);

						// marcar Quote
						Quote q = quoteMap.get(qId);
						q.Acuerdo_de_suministro__c = sa.Id;
						quotesToUpdate.add(q);
					}
				}

				// 5. Realizar DML sólo si hay cambios
				if (!quotesToUpdate.isEmpty()) {
					update quotesToUpdate;
				}
				// No es necesario explícitamente actualizar SA en before trigger:
				// se asigna directamente en Trigger.new
			}
		}
	} catch (Exception e) {
		System.debug('Exception en ETC_LinkQuoteToSalesAgreement: ' + e);
	}
}