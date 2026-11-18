@IsTest
public with sharing class ETC_ControllerAcuertdoPdfTest {
	// Es un Test sobre el SalesAgreement por lo que posiblemente tenga que crear uno :c
	@TestSetup
	static void makeData() {
		TestFactory.createSalesAgreementWithQuote();
	}

	private static ETC_ControllerAcuertdoPdf buildController(Id saId) {
		// Indicamos el PDF que va a utilizar
		PageReference pdf = Page.ETC_AlmexSalesAgreementPDF;
		pdf.getParameters().put('id', String.valueOf(saId));
		Test.setCurrentPage(pdf);
		// Definimos la instancia del controlador estandar para
		// Pasarselo al PDF
		ApexPages.StandardController sc = new ApexPages.StandardController(new SalesAgreement(Id = saId));
		return new ETC_ControllerAcuertdoPdf(sc);
	}

	private static void setDays(Decimal saDays, Decimal quoteDays, String accountAlmex, String accountPromer) {
		SalesAgreement sa = [SELECT Id, AccountId, Cotizacion__c FROM SalesAgreement LIMIT 1];
		update new Quote(Id = sa.Cotizacion__c, Dias_de_credito__c = quoteDays);
		update new Account(
			Id = sa.AccountId,
			Condicion_de_pago__c = accountAlmex,
			Condicion_de_pago_PROMER__c = accountPromer
		);
		update new SalesAgreement(Id = sa.Id, Dias_de_credito__c = saDays);
	}

	@IsTest
	static void testPdf() {
		SalesAgreement record = [SELECT Id FROM SalesAgreement LIMIT 1];
		ETC_ControllerAcuertdoPdf controller = buildController(record.Id);
		System.assertNotEquals(null, controller.sa, 'Debe cargar el acuerdo');
	}

	@IsTest
	static void plazoDelAcuerdoTienePrioridad() {
		setDays(45, 30, '60', '7');
		Id saId = [SELECT Id FROM SalesAgreement LIMIT 1].Id;
		ETC_ControllerAcuertdoPdf controller = buildController(saId);
		System.assertEquals('45', controller.plazoAlmex);
		System.assertEquals('45', controller.plazoPromer);
	}

	@IsTest
	static void plazoDeLaCotizacionSiElAcuerdoNoTiene() {
		setDays(null, 30, '60', '7');
		Id saId = [SELECT Id FROM SalesAgreement LIMIT 1].Id;
		ETC_ControllerAcuertdoPdf controller = buildController(saId);
		System.assertEquals('30', controller.plazoAlmex);
		System.assertEquals('30', controller.plazoPromer);
	}

	@IsTest
	static void plazoDeLaCuentaComoUltimoRecurso() {
		setDays(null, null, '60', '7');
		Id saId = [SELECT Id FROM SalesAgreement LIMIT 1].Id;
		ETC_ControllerAcuertdoPdf controller = buildController(saId);
		System.assertEquals('60', controller.plazoAlmex);
		System.assertEquals('7', controller.plazoPromer);
	}
}
