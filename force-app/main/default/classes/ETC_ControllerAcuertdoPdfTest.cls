@IsTest
public with sharing class ETC_ControllerAcuertdoPdfTest {
	// Es un Test sobre el SalesAgreement por lo que posiblemente tenga que crear uno :c
	@TestSetup
	static void makeData() {
		TestFactory.createSalesAgreementWithQuote();
	}

	@IsTest
	static void testPdf() {
		SalesAgreement record = [SELECT Id FROM SalesAgreement LIMIT 1];
		// Indicamos el PDF que va a utilizar
		PageReference pdf = Page.ETC_AlmexSalesAgreementPDF;
		pdf.getParameters().put('id', String.valueOf(record.Id));
		Test.setCurrentPage(pdf);
		// Definimos la instancia del controlador estandar para
		// Pasarselo al PDF
		ApexPages.StandardController sc = new ApexPages.StandardController(record);
		ETC_ControllerAcuertdoPdf controller = new ETC_ControllerAcuertdoPdf(sc);
	}
}