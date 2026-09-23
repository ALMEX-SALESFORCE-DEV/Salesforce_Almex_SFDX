@IsTest
public with sharing class ETC_CreatePricelistTest {
	@TestSetup
	static void makeData() {
		update new Pricebook2(
			Id = Test.getStandardPricebookId(),
			Fecha_de_inicio__c = Date.today(),
			External_Id__c = 'standard',
			From_Oracle__c = 'standard' != '',
			Unidad_de_negocio__c = 'BU_PROMER',
			Moneda__c = 'MXN',
			Definicion_de_cargos__c = 'QP_SALE_PRICE',
			Tipo_de_l_nea__c = 'ORA_BUY',
			M_todo_de_c_lculo__c = 'PRICE',
			Status__c = 'APPROVED'
		);
		TestFactory.createSalesAgreementWithQuote();
	}

	@IsTest
	static void createPricebookTest() {
		Product2 product = [SELECT Id FROM Product2 LIMIT 1];
		Quote quoteRecord = [SELECT Id FROM Quote LIMIT 1];
		Pricebook2 pb = TestFactory.getPricebook(false, 'pricebook-trigger', 'pricebook-trigger');
		pb.Tipo__c = 'Segment price list';
		pb.Unidad_de_negocio__c = 'BU_ALMEX';
		pb.Moneda__c = 'USD';
		pb.Codigo_Ajuste_Precios__c = '300000007065220';
		pb.Updated__c = false;
		pb.Status__c = 'APPROVED';
		pb.Definicion_de_cargos__c = 'QP_SALE_PRICE';
		pb.Tipo_de_l_nea__c = 'ORA_BUY';
		pb.Producto__c = product.Id;
		pb.Fecha_de_inicio__c = Date.today();
		pb.Hora_inicio__c = Time.newInstance(13, 0, 0, 0);
		pb.Fecha_de_Fin__c = Date.today().addMonths(12);
		pb.Hora_fin__c = Time.newInstance(13, 0, 0, 0);
		pb.M_todo_de_c_lculo__c = 'PRICE';
		pb.Cotizacion__c = quoteRecord.Id;
		insert pb;
	}

	@IsTest
	static void createNewPricebookTest() {
		Product2 product = [SELECT Id, Visible__c, Family FROM Product2 LIMIT 1];
		System.debug(product);
		Quote quoteRecord = [SELECT Id FROM Quote LIMIT 1];
		Pricebook2 pb = [SELECT Id FROM Pricebook2 LIMIT 1];
		pb.Tipo__c = 'Segment price list';
		pb.Unidad_de_negocio__c = 'BU_ALMEX';
		pb.Moneda__c = 'USD';
		pb.Codigo_Ajuste_Precios__c = '300000007065220';
		pb.Updated__c = false;
		pb.Status__c = 'APPROVED';
		pb.Definicion_de_cargos__c = 'QP_SALE_PRICE';
		pb.Tipo_de_l_nea__c = 'ORA_BUY';
		pb.Producto__c = product.Id;
		pb.Fecha_de_inicio__c = Date.today();
		pb.Hora_inicio__c = Time.newInstance(13, 0, 0, 0);
		pb.Fecha_de_Fin__c = Date.today().addMonths(12);
		pb.Hora_fin__c = Time.newInstance(13, 0, 0, 0);
		pb.M_todo_de_c_lculo__c = 'PRICE';
		pb.Cotizacion__c = quoteRecord.Id;
		update pb;
		List<ETC_wsCreatePriceList.InputVars> inputVars = new List<ETC_wsCreatePriceList.InputVars>();
		ETC_wsCreatePriceList.InputVars inputVar = new ETC_wsCreatePriceList.InputVars();
		inputVar.priceListId = pb.Id;
		inputVars.add(inputVar);
		Test.startTest();
		ETC_wsCreatePriceList.ReturnVars[] output = ETC_wsCreatePriceList.callCreate(inputVars);
		ETC_wsCreatePriceList.callService(pb.Id);
		System.debug(output.get(0));
		Test.stopTest();
	}

	@IsTest
	static void removeBadProductsTest() {
		Product2 newProduct = TestFactory.getProduct(
			true,
			'product to remove',
			'REMOVE_P01',
			'REMOVE_FAMILY',
			null,
			false
		);
		Test.startTest();
		ETC_Utility.removeBadProducts('REMOVE_FAMILY');
		Test.stopTest();
	}

	@IsTest
	static void createOrderTest() {
		Pricebook2 pb = [SELECT Id, Name FROM Pricebook2 WHERE Name = 'new pricebook 1' LIMIT 1];
		Account accRecord = [SELECT Id FROM Account LIMIT 1];
		SalesAgreementProduct saProducts = [SELECT Id, Name, SalesAgreementId FROM SalesAgreementProduct LIMIT 1];
		System.debug(saProducts);
		Sucursal__c sucursal = [SELECT Id FROM Sucursal__c LIMIT 1];
		// Para esta prueba hay dos productos, y para crear el producto se usa el codigo original
		Product2 productRecord = [SELECT Id, Oracle_Id__c FROM Product2 WHERE Producto_Principal__c = NULL LIMIT 1];

		PricebookEntry newPricebookEntry = TestFactory.getPricebookEntry(true, pb.Id, productRecord.Id, 10);

		Order newOrder = new Order();
		newOrder.Pricebook2Id = pb.Id;
		newOrder.AccountId = accRecord.Id;
		newOrder.Sucursal__c = sucursal.Id;
		newOrder.Oracle_Id__c = 'external-order';
		newOrder.BillingCity = 'GUADALAJARA';
		newOrder.BillingCountry = 'MEXICO';
		newOrder.BillingPostalCode = '44630';
		newOrder.BillingState = 'JAL';
		newOrder.BillingStreet = 'AV DE LAS AMERICAS';
		newOrder.ShippingCity = 'AMATITAN';
		newOrder.ShippingCountry = 'MEXICO';
		newOrder.ShippingPostalCode = '45380';
		newOrder.ShippingState = 'JAL';
		newOrder.ShippingStreet = 'PRODUCCION NEW MIX - EX HACIENDA SAN JOSE DEL REFUGIO';
		newOrder.Fecha_de_Envio_Programada__c = Date.today();
		newOrder.Folio_de_factura__c = '';
		newOrder.Linea_de_pedido__c = '1';
		newOrder.Codigo_Producto__c = productRecord.Oracle_Id__c;
		newOrder.Cantidad__c = 28000;
		newOrder.Cantidad_programada__c = 1000;
		newOrder.Precio_Unitario__c = 1140.07;
		newOrder.EffectiveDate = Date.today();
		newOrder.Status = 'Draft';
		insert newOrder;
		Documento__c newDocument = new Documento__c();
		newDocument.Name = 'CERTIFICADO 0001';
		newDocument.Documento__c = 'Certificado_de_calidad';
		newDocument.DOCUMENT_DEF_XID__c = 'OUTBOUND.PRUEBA_DE_ENVIO';
		newDocument.ORDER_RELEASE_REFNUM_QUAL_GID__c = '01';
		newDocument.DOCUMENT_XID__c = 'external-order';
		newDocument.ORG_INVENTARIO__c = '01';
		newDocument.SHIPMENT_XID__c = '01';
		newDocument.INVOICE_GID__c = '01';
		newDocument.ORDER_RELEASE_NAME__c = newOrder.Id;
		insert newDocument;
		ContentVersion cv = new ContentVersion();
		cv.sobject__c = 'order-document';
		cv.recordId__c = 'external-order';
		cv.Title = 'ArchivoNuevoDosPruebasComunidades.txt';
		cv.ReasonForChange = '';
		cv.VersionData = EncodingUtil.base64Decode('RXhhbXBsZQ==');
		insert cv;
	}
}