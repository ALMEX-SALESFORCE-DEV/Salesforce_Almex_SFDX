@IsTest
public with sharing class ETC_UpdateEndDatePriceListTest {
	@TestSetup
	static void makeData() {
		TestFactory.createSalesAgreementWithQuote();
	}

	@IsTest
	static void updateEndDateTest() {
		Pricebook2 pb = [SELECT Id FROM Pricebook2 LIMIT 1];
		Quote quoteRecord = [SELECT Id FROM Quote LIMIT 1];
		pb.Fecha_de_inicio__c = Date.today();
		pb.Hora_inicio__c = Time.newInstance(13, 0, 0, 0);
		pb.Fecha_de_Fin__c = Date.today().addMonths(12);
		pb.Hora_fin__c = Time.newInstance(13, 0, 0, 0);
		pb.Cotizacion__c = quoteRecord.Id;
		update pb;
		ETC_wsUpdateEndDatePriceList.InputVars[] inputs = new List<ETC_wsUpdateEndDatePriceList.InputVars>();
		ETC_wsUpdateEndDatePriceList.InputVars input = new ETC_wsUpdateEndDatePriceList.InputVars();
		input.priceListId = pb.Id;
		input.endDate = Date.today();
		inputs.add(input);
		Test.startTest();
		ETC_wsUpdateEndDatePriceList.updateDate(pb.Id, null);
		ETC_wsUpdateEndDatePriceList.ReturnVars[] result = ETC_wsUpdateEndDatePriceList.callUpdateEndDate(inputs);
		System.debug(result);
		Test.stopTest();
	}
}