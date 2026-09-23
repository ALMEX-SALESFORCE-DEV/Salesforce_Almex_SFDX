@isTest
public with sharing class ETC_QuoteTriggerTest {
	@isTest
	static void testQuoteApprovalTrigger() {
		// Crear datos de prueba
		Account acc = new Account(Name = 'Test Account', Unidad_de_negocio__c = 'ALMEX;PROMER');
		insert acc;

		Opportunity opp = new Opportunity(
			Name = 'Test Opportunity',
			StageName = 'Prospecting',
			CloseDate = Date.today().addDays(30),
			Familia_de_productos__c = 'ALMIDON DE MAIZ BP 25 KG',
			AccountId = acc.Id
		);
		insert opp;

		Id standardPricebookId = Test.getStandardPricebookId();
		System.debug('===START_PRICEBOOK_TEST===');
		System.debug(standardPricebookId);
		System.debug('===END_PRICEBOOK_TEST===');

		// new Sucursal__c
		Sucursal__c suc = new Sucursal__c(Name = 'TEST', Ship_to_ID__c = '001', Cuenta__c = acc.Id);
		insert suc;

		// create quote line items
		Product2 prod = new Product2(
			Name = 'Test Product',
			IsActive = true,
			Oracle_Id__c = '01',
			ProductCode = '01',
			Family = 'ALMIDON DE MAIZ BP 25 KG',
			Visible__c = true
		);
		insert prod;
		Product2 newProd = prod.clone(false, false, false, false);
		newProd.Oracle_Id__c = '01_TEST';
		newProd.ProductCode = '01_TEST';
		newProd.Visible__c = false;
		insert newProd;

		PricebookEntry pbe = new PricebookEntry(
			Pricebook2Id = standardPricebookId,
			Product2Id = prod.Id,
			UnitPrice = 100,
			IsActive = true
		);
		PricebookEntry newProdPbe = new PricebookEntry(
			Pricebook2Id = standardPricebookId,
			Product2Id = newProd.Id,
			UnitPrice = 100,
			IsActive = true
		);
		insert pbe;
		insert newProdPbe;
		System.debug(1);

		Quote quote = new Quote(
			Name = 'Test Quote',
			OpportunityId = opp.Id,
			Status = 'Draft',
			Utilizar_trigger__c = true,
			Cotizado__c = true,
			Lista_Generada__c = false,
			Fecha_de_inicio__c = Date.today(),
			Moneda__c = 'MXN',
			Pricebook2Id = standardPricebookId
		);
		insert quote;
		System.debug(1);

		quote.Pricebook2Id = standardPricebookId;
		update quote;

		// Quote verifyQuote = [SELECT Id, Pricebook2Id FROM Quote WHERE Id = :quote.Id];
		// System.debug('Verified Quote Pricebook2Id: ' + verifyQuote.Pricebook2Id);
		// System.debug('PricebookEntry Pricebook2Id: ' + pbe.Pricebook2Id);

		QuoteLineItem qli = new QuoteLineItem(
			QuoteId = quote.Id,
			PricebookEntryId = pbe.Id,
			Quantity = 1,
			Customer_Site_Name__c = suc.Id,
			Precio_facturado__c = 100,
			UnitPrice = 100
		);
		insert qli;
		System.debug(1);

		// Actualizar el estado de la cotización a 'Aprobado' para activar el trigger
		quote.Status = 'Aprobado';
		update quote;

		// Verificar que la lista de precios se haya generado correctamente
		Quote updatedQuote = [SELECT Id, Lista_Generada__c, Lista_Oracle__c FROM Quote WHERE Id = :quote.Id];
		System.assertEquals(true, updatedQuote.Lista_Generada__c, 'La lista de precios debería haberse generado.');
		System.assertNotEquals(null, updatedQuote.Lista_Oracle__c, 'La lista de precios Oracle no debería ser nula.');
	}
}