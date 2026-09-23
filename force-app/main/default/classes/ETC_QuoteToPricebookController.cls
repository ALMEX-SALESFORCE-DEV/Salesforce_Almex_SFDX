public with sharing class ETC_QuoteToPricebookController {
	@TestVisible
	@AuraEnabled(cacheable=false)
	public static Boolean createDeliveryProducts(string orderId) {
		Pricebook2[] standardPb = [
			SELECT Id
			FROM Pricebook2
			WHERE IsStandard = TRUE
		];
		Quote q = [
			SELECT
				Id,
				Opportunity.Familia_de_productos__c,
				(
					SELECT Id, Customer_Site_Name__r.Name
					FROM QuoteLineItems
				)
			FROM Quote
			WHERE Id = :orderId
		];
		System.debug(JSON.serializePretty(1));
		Product2[] currentProducts = [
			SELECT Id, Name, ProductCode, Oracle_Id__c, Visible__c
			FROM Product2
			WHERE Family = :q.Opportunity.Familia_de_productos__c
		];
		System.debug(JSON.serializePretty(currentProducts));

		Map<String, Product2> productsMap = new Map<String, Product2>();
		for (Product2 p : currentProducts) {
			if (!p.Visible__c) {
				productsMap.put(p.ProductCode, p);
			}
		}

		Product2[] productsToCreate = new List<Product2>();
		for (Product2 p : currentProducts) {
			if (p.Visible__c) {
				for (QuoteLineItem qli : q.QuoteLineItems) {
					if (!productsMap.containsKey(p.Oracle_Id__c + '_' + qli.Customer_Site_Name__r.Name)) {
						Product2 newProduct = new Product2();
						newProduct.Name = p.Name + ' - ' + qli.Customer_Site_Name__r.Name;
						newProduct.ProductCode = p.Oracle_Id__c + '_' + qli.Customer_Site_Name__r.Name;
						newProduct.Oracle_Id__c = p.Oracle_Id__c + '_' + qli.Customer_Site_Name__r.Name;
						System.debug(newProduct.Oracle_Id__c);
						newProduct.Family = q.Opportunity.Familia_de_productos__c;
						newProduct.IsActive = true;
						newProduct.Producto_Principal__c = p.Id;
						// System.debug(newProduct);
						productsToCreate.add(newProduct);
					}
				}
			}
		}

		if (productsToCreate.size() > 0) {
			// System.debug(productsToCreate);
			insert productsToCreate;
			System.debug('Productos creados correctamente');

			PricebookEntry[] pbEntriesToCreate = new List<PricebookEntry>();
			for (Product2 p : productsToCreate) {
				PricebookEntry newPbEntry = new PricebookEntry();
				if (Test.isRunningTest()) {
					newPbEntry.Pricebook2Id = Test.getStandardPricebookId();
				} else {
					newPbEntry.Pricebook2Id = standardPb[0].Id;
				}
				newPbEntry.Product2Id = p.Id;
				newPbEntry.UnitPrice = 1;
				newPbEntry.IsActive = true;
				// System.debug(newPbEntry);
				pbEntriesToCreate.add(newPbEntry);
			}

			if (pbEntriesToCreate.size() > 0) {
				insert pbEntriesToCreate;
				System.debug('Entradas de lista creadas correctamente');
			}
		}

		return true;
	}

	@InvocableMethod(
		label='Create Delivery Quoter Products'
		description='Crea los productos de cada sucursal para la lista de precios'
		category='Quote'
	)
	public static List<OutputVars> createQuoterProducts(List<InputVars> params) {
		OutputVars[] outputList = new List<OutputVars>();

		ETC_QuoteToPricebookController.createDeliveryProducts(params.get(0).quoteId);

		OutputVars output = new OutputVars();
		output.result = true;
		outputList.add(output);

		return outputList;
	}

	public class InputVars {
		@InvocableVariable
		public String quoteId;
	}

	public class OutputVars {
		@InvocableVariable
		public Boolean result;
	}
}