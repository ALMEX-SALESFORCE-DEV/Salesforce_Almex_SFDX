// Respaldo unico: copia Quote.Dias_de_credito__c a SalesAgreement.Dias_de_credito__c
// en los acuerdos que ya tienen cotizacion y aun no tienen plazo.
//
// Ejecutar PRIMERO en QA:   sf apex run -o qa -f scripts/apex/backfill_sa_dias_de_credito.apex
// Por defecto es simulacion (dryRun = true): solo cuenta y muestra ejemplos, no modifica datos.
// Para aplicar, cambiar dryRun a false. Los acuerdos sin cotizacion, o con cotizacion sin plazo, no se tocan.
Boolean dryRun = true;

List<SalesAgreement> toUpdate = new List<SalesAgreement>();
for (SalesAgreement sa : [
	SELECT Id, Name, Dias_de_credito__c, Cotizacion__r.Dias_de_credito__c
	FROM SalesAgreement
	WHERE Cotizacion__c != NULL AND Dias_de_credito__c = NULL AND Cotizacion__r.Dias_de_credito__c != NULL
]) {
	sa.Dias_de_credito__c = sa.Cotizacion__r.Dias_de_credito__c;
	toUpdate.add(sa);
}

System.debug('Acuerdos a actualizar: ' + toUpdate.size() + ' | dryRun=' + dryRun);
for (Integer i = 0; i < Math.min(10, toUpdate.size()); i++) {
	System.debug('  ' + toUpdate[i].Name + ' -> ' + toUpdate[i].Dias_de_credito__c);
}
if (!dryRun && !toUpdate.isEmpty()) {
	Database.SaveResult[] results = Database.update(toUpdate, false);
	Integer failed = 0;
	for (Database.SaveResult r : results) {
		if (!r.isSuccess()) {
			failed++;
			System.debug('Error: ' + r.getErrors()[0].getMessage());
		}
	}
	System.debug('Actualizados: ' + (toUpdate.size() - failed) + ' | con error: ' + failed);
}
