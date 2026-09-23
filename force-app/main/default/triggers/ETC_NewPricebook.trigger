trigger ETC_NewPricebook on Pricebook2(before insert, before update) {
	Map<Id, Quote> quoteMap = new Map<Id, Quote>();
	Set<Id> quoteIds = new Set<Id>();

	// Recolectar cotizaciones ligadas
	for (Pricebook2 pb : Trigger.new) {
		if (pb.Cotizacion__c != null) {
			quoteIds.add(pb.Cotizacion__c);
		}
	}

	if (!quoteIds.isEmpty()) {
		for (Quote q : [
			SELECT Hora_inicio__c, Hora_fin__c
			FROM Quote
			WHERE Id IN :quoteIds
		]) {
			quoteMap.put(q.Id, q);
		}
	}

	for (Pricebook2 pb : Trigger.new) {
		if (pb.Cotizacion__c != null) {
			Quote quoteRecord = quoteMap.get(pb.Cotizacion__c);

			if (quoteRecord != null) {
				Pricebook2 oldPb = Trigger.isInsert ? null : Trigger.oldMap.get(pb.Id);

				// Insert → siempre asigna
				if (Trigger.isInsert) {
					pb.Hora_inicio__c = quoteRecord.Hora_inicio__c;
					pb.Hora_fin__c = quoteRecord.Hora_fin__c;
				}
				// Update → solo si cambió
				else {
					if (pb.Hora_inicio__c == oldPb.Hora_inicio__c) {
						pb.Hora_inicio__c = quoteRecord.Hora_inicio__c;
					} else {
					}
					if (pb.Hora_fin__c == oldPb.Hora_fin__c) {
						pb.Hora_fin__c = quoteRecord.Hora_fin__c;
					}
				}
			}
		}
	}
}