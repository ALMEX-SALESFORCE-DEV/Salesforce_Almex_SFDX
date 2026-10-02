@IsTest
public with sharing class ETC_QuoterImportadosControllerTest {
	@TestSetup
	static void makeData() {
		TestFactory.createSalesAgreementWithQuote();
	}

	@IsTest
	static void getOppotunityByIdTest() {
		String recordId = [SELECT Id FROM Opportunity LIMIT 1].Id;
		Test.startTest();
		ETC_QuoterImportadosController.getOpportunityById(recordId);
		Test.stopTest();
	}

	@IsTest
	static void getProductByIdTest() {
		String recordId = [SELECT Id FROM Product2 LIMIT 1].Id;
		Test.startTest();
		ETC_QuoterImportadosController.getProductById(recordId);
		Test.stopTest();
	}

	@IsTest
	static void getFleteTest() {
		Quote quoteRecord = [SELECT Id FROM Quote LIMIT 1];
		Account acc = [SELECT Id FROM Account LIMIT 1];
		Sucursal__c newSucursal = TestFactory.getSucursal(true, 'sucursal a', '1', 'a1', acc.Id);
		Planta__c newPlant = TestFactory.getPlanta(true, 'planta a');
		Fletes__c newFlete = TestFactory.getFlete(
			true,
			'flete',
			String.valueOf(newPlant.Id),
			'ciudad',
			'estado',
			2000.0,
			'PIPA_3EJES',
			'MXN'
		);
		Test.startTest();
		ETC_QuoterImportadosController.getClientSiteById(newSucursal.Id);
		ETC_QuoterImportadosController.getFleteByParams(
			'PIPA_3EJES',
			'ciudad',
			String.valueOf(newPlant.Id),
			'MXN',
			Date.today(),
			'estado'
		);
		ETC_QuoterImportadosController.getQuoteById(quoteRecord.Id);
		Test.stopTest();
	}

	@IsTest
	static void createQuoteTest() {
		Opportunity opp = [SELECT Id FROM Opportunity LIMIT 1];
		Pricebook2 pb = [SELECT Id FROM Pricebook2 LIMIT 1];
		Pricebook2 pbWithExternalId = TestFactory.getPricebook(true, 'pricebook with external id', 'CODE01');
		QuoteModel newQuoteModel = new QuoteModel();
		newQuoteModel.isOil = true;
		newQuoteModel.opportunityId = opp.Id;
		newQuoteModel.name = 'new quote' + Date.today();
		newQuoteModel.accountCreditDays = '1';
		newQuoteModel.pricing = '1';
		newQuoteModel.volume = '1';
		newQuoteModel.products = '1';
		newQuoteModel.customerSites = '1';
		newQuoteModel.warehousePrice = '1';
		newQuoteModel.flete = '1';
		newQuoteModel.labTransfer = '1';
		newQuoteModel.shareholders = '1';
		newQuoteModel.productCost = '1';
		newQuoteModel.railroad = '1';
		newQuoteModel.operativeAlmidon = '1';
		newQuoteModel.operativePacking = '1';
		newQuoteModel.totalBuildCost = '1';
		newQuoteModel.profitMarginPercentage = '1';
		newQuoteModel.profitMargin = '1';
		newQuoteModel.totalProductCost = '1';
		newQuoteModel.isotank = '1';
		newQuoteModel.clientPortals = '1';
		newQuoteModel.dryStorage = '1';
		newQuoteModel.totalOperativeCost = '1';
		newQuoteModel.totalSalesCost = '1';
		newQuoteModel.marginBrute = '1';
		newQuoteModel.marginBruteNetSales = '1';
		newQuoteModel.overhead = '1';
		newQuoteModel.marginBeforeTaxes = '1';
		newQuoteModel.netMarginBeforeSales = '1';
		newQuoteModel.ptu = '1';
		newQuoteModel.isr = '1';
		newQuoteModel.netMargin = '1';
		newQuoteModel.incrementalCostPercentage = '1';
		newQuoteModel.incrementalCostRebate = '1';
		newQuoteModel.exwIncrementals = '1';
		newQuoteModel.finantialCostPercentage = '1';
		newQuoteModel.finantialCost = '1';
		newQuoteModel.exwFinantialCost = '1';
		newQuoteModel.listaOracle = pbWithExternalId.Id;
		newQuoteModel.literProductCost = '1';
		newQuoteModel.transferStationCost = '1';
		QuoteModel.QuoteConfigs newQuoteConfigs = new QuoteModel.QuoteConfigs();
		newQuoteConfigs.startDate = String.valueOf(Date.today());
		newQuoteConfigs.endDate = String.valueOf(Date.today().addMonths(6));
		newQuoteConfigs.textPeriod = 'test';
		newQuoteConfigs.yearPeriod = 'test';
		newQuoteConfigs.unitMeasure = 'mt';
		newQuoteConfigs.totalMonths = '6';
		newQuoteConfigs.haveIncrementalDays = true;
		newQuoteConfigs.incrementalCost = true;
		newQuoteConfigs.incrementalDays = 1.0;
		newQuoteConfigs.plant = 'test';
		newQuoteConfigs.quoteCode = 'code-test';
		newQuoteConfigs.comments = 'test';
		newQuoteConfigs.currentCurrency = 'MXN';
		newQuoteConfigs.convertionCurrency = '1';
		newQuoteConfigs.proposedMtons = '1';
		newQuoteConfigs.bookedMtons = '1';
		newQuoteConfigs.pointsNumebr = '1';
		newQuoteConfigs.version = '1';
		newQuoteConfigs.cornUsage = '1';
		newQuoteConfigs.customerDeliv = '1';
		newQuoteConfigs.exwAlmexUsd = '1';
		newQuoteConfigs.exwAlmexMxn = '1';
		newQuoteConfigs.totalMarginPercentage = '1';
		newQuoteConfigs.totalMarginUsdMt = '1';
		newQuoteConfigs.totalMarginUsdDs = '1';
		newQuoteConfigs.totalCostUstMt = '1';
		newQuoteConfigs.sgaUsdMt = '1';
		newQuoteConfigs.sgaMxnMt = '1';
		newQuoteConfigs.fleteUstMt = '1';
		newQuoteConfigs.coproductRecov = '1';
		newQuoteConfigs.additionalCostPercentage = '1';
		newQuoteConfigs.cornDate = '1';
		newQuoteConfigs.basisDate = '1';
		newQuoteConfigs.fxDate = '1';
		newQuoteConfigs.gasDate = '1';
		newQuoteConfigs.inflation = '1';
		newQuoteConfigs.leftDataset = '';
		newQuoteConfigs.rightDataset = '';

		Test.startTest();
		ETC_QuoterImportadosController.createQuote(newQuoteModel, newQuoteConfigs, pb.Id);
		ETC_QuoterImportadosController.createManufacturedQuote(newQuoteModel, newQuoteConfigs, pb.Id);
		Test.stopTest();
	}

	@IsTest
	static void createQuoteItems() {
		Account acc = [SELECT Id FROM Account LIMIT 1];
		Product2 product = [SELECT Id FROM Product2 LIMIT 1];
		Planta__c plant = TestFactory.getPlanta(true, 'planta a');
		Pricebook2 pricebook = [SELECT Id FROM Pricebook2 LIMIT 1];

		TestFactory.getPricebookEntry(true, pricebook.Id, product.Id, 20);

		Quote quoteRecord = [SELECT Id FROM Quote LIMIT 1];
		Sucursal__c newSucursal = TestFactory.getSucursal(true, 'sucursal a', '1', 'a1', acc.Id);
		QuoteItemModel[] newQuoteItems = new List<QuoteItemModel>{};
		QuoteItemModel qi = new QuoteItemModel();
		qi.productId = product.Id;
		qi.billedPrice = '150.00';
		qi.volume = '10';
		qi.storage = plant.Id;
		qi.customerSiteName = newSucursal.Id;
		qi.totalProductCost = '120.00';
		qi.almexPriceWarehouse = '160.00';
		qi.transportation = 'PIPA_3EJES';
		qi.tons = '8.5';
		qi.labTransferPrice = '140.00';
		qi.productShareholdersCost = '100.00';
		qi.productCost = '90.00';
		qi.railroadCost = '15.00';
		qi.importExpensesAlmidon = '5.00';
		qi.transferImportExpPacking = '3.00';
		qi.totalBuildingCost = '133.00';
		qi.profitMarginPercentage = '18.0';
		qi.isotank = '2.00';
		qi.clientPortals = '1.00';
		qi.storageDry = '0.50';
		qi.totalOperativeCost = '26.50';
		qi.totalSalesCost = '146.50';
		qi.exwIncrementals = '3.00';
		qi.exwFinancialCost = '2.50';
		qi.marginBrute = '13.50';
		qi.marginBruteNetSales = '9.0';
		qi.overhead = '4.00';
		qi.marginBeforeTaxes = '9.50';
		qi.netMarginAboutNetSales = '6.3';
		qi.ptu = '0.80';
		qi.isr = '1.00';
		qi.netMargin = '7.70';
		qi.incrementalCost = '1.5';
		qi.incrementalCostCalc = '1.50';
		qi.finantialCostRate = '1.2';
		qi.convertionCurrency = '17.50';
		qi.currentCurrency = 'MXN';
		qi.deliveryCurrency = 'USD';
		qi.systemDeliveryCost = '25.00';
		qi.movement = '1';
		qi.deliveryCost = '20.00';
		qi.densidadMark20C = '1.05';
		qi.volumenLtGalon = '3.78';
		qi.literProductCost = '0.95';
		qi.transferStationCost = '12.00';
		qi.convertionPrice = '21.00';
		qi.isOil = true;
		qi.shippingCostsPerLotSize = '8.00';
		qi.shippingCostsPerLotSizeF = '8.50';
		qi.sgALtC = '0.1';
		qi.sgAKgC = '0.1';
		qi.costoEstandarPC = '0.1';
		qi.factorDeConversionKgC = '0.1';
		qi.factorDeConversionC = '0.1';
		qi.unidadDeMedidaC = 'KG';
		newQuoteItems.add(qi);
		Test.startTest();
		ETC_QuoterImportadosController.createQuoteItem(quoteRecord.Id, pricebook.Id, newQuoteItems);
		ETC_QuoterImportadosController.createManufacturedQuoteItem(quoteRecord.Id, pricebook.Id, newQuoteItems);
		Test.stopTest();
	}
}