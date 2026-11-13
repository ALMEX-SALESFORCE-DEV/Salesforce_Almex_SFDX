@IsTest
public with sharing class ETC_LinkQuoteToSalesAgreementTest {
	private static Quote newQuote;
	private static Pricebook2 newPricebook;
	private static Account newAccount;

	private static void makeData(Decimal quoteDays) {
		String productFamily = 'ALMIDON DE MAIZ PNC';
		newAccount = TestFactory.getAccount(true, 'account test');
		Product2 parent = TestFactory.getProduct(true, 'parent', '100-002-234', productFamily, null, true);
		newPricebook = TestFactory.getPricebook(true, 'pb test', '');
		Opportunity opp = TestFactory.getOpportunity(true, 'opp', productFamily, parent.Id, newAccount.Id);
		newQuote = TestFactory.getQuote(true, 'quote test', opp.Id, newPricebook.Id, 1000, 'mt');
		newQuote.Dias_de_credito__c = quoteDays;
		update newQuote;
		// El trigger enlaza el acuerdo con la cotizacion mediante Pricebook2.Cotizacion__c
		newPricebook.Cotizacion__c = newQuote.Id;
		update newPricebook;
	}

	@IsTest
	static void copiaElPlazoDeLaCotizacion() {
		makeData(45);
		SalesAgreement sa = TestFactory.getSalesAgreement(true, 12, 'sa', null, newPricebook.Id, newAccount.Id);
		sa = [SELECT Cotizacion__c, Dias_de_credito__c FROM SalesAgreement WHERE Id = :sa.Id];
		System.assertEquals(newQuote.Id, sa.Cotizacion__c);
		System.assertEquals(45, sa.Dias_de_credito__c);
	}

	@IsTest
	static void noPisaUnPlazoYaCapturado() {
		makeData(45);
		SalesAgreement sa = TestFactory.getSalesAgreement(false, 12, 'sa', null, newPricebook.Id, newAccount.Id);
		sa.Dias_de_credito__c = 60;
		insert sa;
		sa = [SELECT Dias_de_credito__c FROM SalesAgreement WHERE Id = :sa.Id];
		System.assertEquals(60, sa.Dias_de_credito__c);
	}

	@IsTest
	static void sinPlazoEnLaCotizacionQuedaVacio() {
		makeData(null);
		SalesAgreement sa = TestFactory.getSalesAgreement(true, 12, 'sa', null, newPricebook.Id, newAccount.Id);
		sa = [SELECT Dias_de_credito__c FROM SalesAgreement WHERE Id = :sa.Id];
		System.assertEquals(null, sa.Dias_de_credito__c);
	}
}
