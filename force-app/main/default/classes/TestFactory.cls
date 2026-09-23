@IsTest
public with sharing class TestFactory {
	public static Pricebook2 getPricebook(Boolean doInsert, String name, String externalId) {
		Pricebook2 newPricebook = new Pricebook2();
		newPricebook.Name = name;
		newPricebook.Fecha_de_inicio__c = Date.today();
		newPricebook.External_Id__c = externalId;
		newPricebook.From_Oracle__c = externalId != '';
		newPricebook.IsActive = true;
		if (doInsert) {
			insert newPricebook;
		}
		return newPricebook;
	}

	public static Product2 getProduct(
		Boolean doInsert,
		String name,
		String code,
		String family,
		String productId,
		Boolean visible
	) {
		Product2 newProduct = new Product2();
		newProduct.Name = name;
		newProduct.Oracle_Id__c = code;
		newProduct.ProductCode = code;
		newProduct.Family = family;
		newProduct.IsActive = true;
		newProduct.Producto_Principal__c = productId;
		newProduct.Visible__c = visible;
		if (doInsert) {
			insert newProduct;
		}
		return newProduct;
	}

	public static PricebookEntry getPricebookEntry(
		Boolean doInsert,
		String pricebookId,
		String productId,
		Decimal unitPrice
	) {
		PricebookEntry pbEntry = new PricebookEntry();
		pbEntry.Product2Id = productId;
		pbEntry.Pricebook2Id = pricebookId;
		pbEntry.UnitPrice = unitPrice;
		pbEntry.IsActive = true;
		PricebookEntry pbEntryStandard = pbEntry.clone(true);
		pbEntryStandard.Pricebook2Id = Test.getStandardPricebookId();
		if (doInsert) {
			insert pbEntryStandard;
			insert pbEntry;
		}
		return pbEntry;
	}

	public static Account getAccount(Boolean doInsert, String name) {
		Account newAccount = new Account();
		newAccount.Name = name;
		newAccount.N_mero_de_cuenta__c = 'C1-0';
		if (doInsert) {
			insert newAccount;
		}
		return newAccount;
	}

	public static Opportunity getOpportunity(
		Boolean doInsert,
		String name,
		String family,
		String productId,
		String accountId
	) {
		Opportunity newOpp = new Opportunity();
		newOpp.Name = name;
		newOpp.StageName = 'Nuevo';
		newOpp.CloseDate = Date.today();
		newOpp.Familia_de_productos__c = family;
		newOpp.Producto__c = productId;
		newOpp.AccountId = accountId;
		if (doInsert) {
			insert newOpp;
		}
		return newOpp;
	}

	public static Quote getQuote(
		Boolean doInsert,
		String name,
		String oppId,
		String pbId,
		Integer volume,
		String unitMeasure
	) {
		Quote newQuote = new Quote();
		newQuote.Name = name;
		newQuote.OpportunityId = oppId;
		newQuote.Pricebook2Id = pbId;
		newQuote.Fecha_de_inicio__c = Date.today();
		newQuote.ExpirationDate = Date.today().addDays(31);
		newQuote.Total_de_volumen__c = volume;
		newQuote.Unidad_de_medida__c = unitMeasure;
		newQuote.Hora_inicio__c = Time.newInstance(13, 0, 0, 0);
		newQuote.Hora_fin__c = Time.newInstance(13, 0, 0, 0);
		if (doInsert) {
			insert newQuote;
		}
		return newQuote;
	}

	public static SalesAgreement getSalesAgreement(
		Boolean doInsert,
		Integer scheduleCount,
		String name,
		String quoteId,
		String pbId,
		String accountId
	) {
		SalesAgreement newSa = new SalesAgreement();
		newSa.StartDate = Date.Today();
		newSa.ScheduleCount = scheduleCount;
		newSa.AccountId = accountId;
		newSa.Name = name;
		newSa.PricebookId = pbId;
		newSa.Cotizacion__c = quoteId;
		if (doInsert) {
			insert newSa;
		}
		return newSa;
	}

	public static Sucursal__c getSucursal(
		Boolean doInsert,
		String name,
		String shipTo,
		String codeNumber,
		String accountId
	) {
		Sucursal__c newSucursal = new Sucursal__c();
		newSucursal.Name = name;
		newSucursal.Ship_to_ID__c = shipTo;
		newSucursal.N_mero_de_sitio__c = codeNumber;
		newSucursal.Cuenta__c = accountId;
		if (doInsert) {
			insert newSucursal;
		}
		return newSucursal;
	}

	public static Planta__c getPlanta(Boolean doInsert, String name) {
		Planta__c newPlant = new Planta__c();
		newPlant.Name = name;
		if (doInsert) {
			insert newPlant;
		}
		return newPlant;
	}

	public static Fletes__c getFlete(
		Boolean doInsert,
		String name,
		String plantId,
		String city,
		String state,
		Decimal cost,
		String transportationMethod,
		String currencyValue
	) {
		Fletes__c newFlete = new Fletes__c();
		newFlete.Name = name;
		newFlete.Planta__c = plantId;
		newFlete.Ciudad_de_destino__c = city;
		newFlete.Estado__c = state;
		newFlete.Fecha_inicio__c = Date.today();
		newFlete.Fecha_vigencia__c = Date.today().addMonths(12);
		newFlete.Medio_de_transporte__c = transportationMethod;
		newFlete.Costo_de_flete__c = cost;
		newFlete.Tipo_de_moneda__c = currencyValue;
		if (doInsert) {
			insert newFlete;
		}
		return newFlete;
	}

	public static QuoteLineItem getQuoteLineItem(
		Boolean doInsert,
		Id pricebookEntry,
		Id quoteId,
		Integer quantity,
		Decimal unitPrice
	) {
		QuoteLineItem newQuoteLine = new QuoteLineItem();
		newQuoteLine.QuoteId = quoteId;
		newQuoteLine.PricebookEntryId = pricebookEntry;
		newQuoteLine.Quantity = quantity;
		newQuoteLine.UnitPrice = unitPrice;
		if (doInsert) {
			insert newQuoteLine;
		}
		return newQuoteLine;
	}

	public static SalesAgreementProduct getSalesAgreementProduct(Boolean doInsert, Id pbEntry, String name, Id saId) {
		SalesAgreementProduct newSaProduct = new SalesAgreementProduct();
		newSaProduct.PricebookEntryId = pbEntry;
		newSaProduct.SalesAgreementId = saId;
		newSaProduct.Name = name;
		newSaProduct.SalesPrice = 100;
		newSaProduct.InitialPlannedQtyValue = 100;
		newSaProduct.DiscountPercentage = 0;
		if (doInsert) {
			insert newSaProduct;
		}
		return newSaProduct;
	}

	public static void createSalesAgreementWithQuote() {
		String productFamily = 'ALMIDON DE MAIZ PNC';
		Account newAccount = TestFactory.getAccount(true, 'account test');
		Sucursal__c newSucursal = TestFactory.getSucursal(true, 'RUTA', '1234', '1', newAccount.Id);
		Product2 newParentProduct = TestFactory.getProduct(
			true,
			'new parent product 1',
			'100-002-234',
			productFamily,
			null,
			true
		);
		Product2 newProduct = TestFactory.getProduct(
			true,
			'new product 1',
			'100-002-234' + '_' + newSucursal.Name,
			productFamily,
			newParentProduct.Id,
			false
		);

		// pricebook and pricebook entries
		Pricebook2 newPricebook = TestFactory.getPricebook(true, 'new pricebook 1', '');
		PricebookEntry newPricebookEntry = TestFactory.getPricebookEntry(true, newPricebook.Id, newProduct.Id, 10);
		Opportunity newOpp = TestFactory.getOpportunity(
			true,
			'new opp',
			productFamily,
			newParentProduct.Id,
			newAccount.Id
		);
		Quote newQuote = TestFactory.getQuote(true, 'quote test', newOpp.Id, newPricebook.Id, 1000000, 'mt');
		newQuote.Pricebook2Id = newPricebook.Id;
		update newQuote;
		QuoteLineItem newQuoteLine = TestFactory.getQuoteLineItem(true, newPricebookEntry.Id, newQuote.id, 10, 10);
		SalesAgreement newSa = TestFactory.getSalesAgreement(
			true,
			12,
			'test sales agreement',
			newQuote.Id,
			newPricebook.Id,
			newAccount.Id
		);
		TestFactory.getSalesAgreementProduct(
			true,
			newPricebookEntry.Id,
			newParentProduct.Name + '_' + newSucursal.Name,
			newSa.Id
		);
	}
}