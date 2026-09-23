public class ETC_QuoteTriggerHandler {
	private Map<String, Product2> productMap;
	private List<Product2> products;
	private Map<Id, Pricebook2> pbToCreate;
	private Map<Id, Opportunity> oppMap;
	private String standardPricebookId;
	private Map<String, PricebookEntry> pbEntries;
	private List<QuoteLineItem> getQuoteLineItems;

	public ETC_QuoteTriggerHandler() {
		if (shouldProcessRecords()) {
			initializeData();
		}
	}

	public Boolean shouldProcessRecords() {
		if (!Trigger.isAfter || !Trigger.isUpdate) {
			return false;
		}
		for (Quote q : (List<Quote>) Trigger.new) {
			// Solo procesar si cambió a Aprobado y cumple condiciones
			if (isValidQuote(q)) {
				return true; // Hay al menos uno que procesar
			}
		}
		return false;
	}

	public void initializeData() {
		// get all products2 where oracle id is != null
		this.products = [
			SELECT Id, Visible__c, ProductCode, Family
			FROM Product2
			WHERE Oracle_Id__c != NULL
		];
		this.productMap = new Map<String, Product2>();
		for (Product2 p : products) {
			this.productMap.put(p.ProductCode, p);
		}
		this.pbToCreate = new Map<Id, Pricebook2>();
		// get opportunities
		Set<Id> oppIds = new Set<Id>();
		for (Quote q : (List<Quote>) Trigger.new) {
			if (q.OpportunityId != null) {
				oppIds.add(q.OpportunityId);
			}
		}
		this.oppMap = new Map<Id, Opportunity>(
			[
				SELECT
					Id,
					Unidad_de_negocio__c,
					Unidad_de_negocio_Picklist__c,
					Producto__c,
					Producto__r.Oracle_Id__c,
					Account.Identificador_de_registro__c,
					Familia_de_productos__c
				FROM Opportunity
				WHERE Id IN :oppIds
			]
		);
		// get pricebook standard id
		this.standardPricebookId = Test.isRunningTest()
			? Test.getStandardPricebookId()
			: [SELECT Id FROM Pricebook2 WHERE IsStandard = TRUE LIMIT 1].Id;
		// map de entradas de listas de precio
		this.pbEntries = new Map<String, PricebookEntry>();

		this.getQuoteLineItems = getQuoteLineItems();

		run();
	}

	public void run() {
		if (Trigger.isAfter && Trigger.isUpdate) {
			System.debug('This records was after update');
			try {
				System.debug(1);
				// clone quote line items to delete them later
				List<QuoteLineItem> cloneQli = new List<QuoteLineItem>();
				for (QuoteLineItem qliItem : this.getQuoteLineItems) {
					/**
					 * preserveId (false): No preserva el Id, genera uno nuevo al insertar
					 * isDeepClone (false): No clona objetos relacionados
					 * preserveReadonlyTimestamps (false): No preserva CreatedDate, LastModifiedDate
					 * preserveAutonumber (false): No preserva campos autonumber
					 */
					QuoteLineItem qliClone = qliItem.clone(false, true, false, false);
					cloneQli.add(qliClone);
				}
				System.debug(1);

				List<Quote> quotesToUpdate = new List<Quote>();
				System.debug(1);

				List<Id> updatedPb = new List<Id>();
				for (Quote q : (List<Quote>) Trigger.new) {
					if (isValidQuote(q)) {
						if (q.Lista_Oracle__c != null) {
							updatedPb.add(q.Lista_Oracle__c);
						}
					}
				}
				for (PricebookEntry pbe : [
					SELECT Id, ProductCode, Product2Id, Pricebook2Id
					FROM PricebookEntry
					WHERE Pricebook2Id IN :updatedPb
				]) {
					this.pbEntries.put(pbe.ProductCode + '_' + pbe.Id, pbe);
				}
				System.debug(1);

				/**
				 * Creacion o asignacion previa de las listas de precio
				 * para poder ser consultadas en procesos posteriores
				 */
				Map<Id, Pricebook2> newQuotePricebooks = generatePricebooks((List<Quote>) Trigger.new);
				if (!newQuotePricebooks.isEmpty()) {
					upsert newQuotePricebooks.values() Id;
					this.pbToCreate = newQuotePricebooks;
					for (Quote q : (List<Quote>) Trigger.new) {
						if (newQuotePricebooks.containsKey(q.Id)) {
							Pricebook2 pb = newQuotePricebooks.get(q.Id);
							Quote qToUpdate = new Quote(Id = q.Id, Lista_Generada__c = true, Pricebook2Id = pb.Id);
							qToUpdate.Lista_Oracle__c = pb.Id;
							quotesToUpdate.add(qToUpdate);
						}
					}
				}
				System.debug(1);

				if (!quotesToUpdate.isEmpty()) {
					// delete quote line items
					delete this.getQuoteLineItems;
					update quotesToUpdate;
				}
				System.debug(1);

				/**
				 * Proceo de creacion de los productos tanto de la lista de precios
				 * como de las partidas de cotizacion
				 */
				for (Quote q : (List<Quote>) Trigger.new) {
					if (isValidQuote(q)) {
						Opportunity opp = this.oppMap.get(q.OpportunityId);
						if (opp != null) {
							List<Product2> productsToUse = new List<Product2>();
							if (opp.Familia_de_productos__c == 'N/A') {
								Product2 prod = this.productMap.get(opp.Producto__r.Oracle_Id__c);
								if (prod != null) {
									productsToUse.add(prod);
								}
							} else {
								for (Product2 p : products) {
									if (p.Visible__c && p.Family == opp.Familia_de_productos__c) {
										productsToUse.add(p);
									}
								}
							}
							createQuoteLineItems(q, cloneQli, productsToUse, q.Lista_Oracle__c != null, opp);
						}
					}
				}
				System.debug(1);
			} catch (Exception error) {
				System.debug('Error: ' + error);
			}
		}
	}

	// get quote lines items
	public List<QuoteLineItem> getQuoteLineItems() {
		// get quote line items from quotes and generate a map with quote line item product id as key
		return [
			SELECT
				Ajuste_a_Flete__c,
				Almacen_de_Recibo_Almex__c,
				Bandera_importado__c,
				Bandera_manufacturado__c,
				Costo_de_flete__c,
				Costo_estandar_P__c,
				Costo_Producto__c,
				Costo_Producto_USD_Shareholders__c,
				Costo_Total_de_Venta__c,
				Costos_Operativos__c,
				Costos_Operativos_almacenaje_seco__c,
				Costos_Operativos_ImportExp__c,
				Costos_Operativos_Isotank__c,
				Costos_Operativos_Portales_Clientes__c,
				Cotizado__c,
				Cuenta__c,
				Customer_Delivered_Price__c,
				Customer_Delivered_Price_Financial_Cost__c,
				Customer_Delivered_Price_Incrementals__c,
				Customer_Site_Name__c,
				deliveryCurrency__c,
				Densidad_Merk_20C__c,
				Description,
				Exchange_Rate_per_USD__c,
				Factor_de_conversion__c,
				Factor_de_conversion_kg__c,
				Factor1Breakdown__c,
				Factor2Breakdown__c,
				Financial_Costs_Rate__c,
				Flete_con_Ajuste__c,
				Flete_Convertido__c,
				Flete_de_Entrada_Railroad__c,
				Flete_de_Salida_a_Cliente_OUTBOUND__c,
				Freight_MXN__c,
				Freight_USD__c,
				freightCost__c,
				Gastos_de_Overhead__c,
				Have_Main__c,
				Id,
				id_cuenta__c,
				idCuenta__c,
				Incremental_Costs_Rebate__c,
				Incremental_Costs_Rebate_Porcentage__c,
				ISR_Impuesto_sobre_la_Renta__c,
				LAB_Almex__c,
				LAB_client__c,
				Liter_Product_Cost__c,
				literOutput__c,
				Margen_antes_de_Impuestos__c,
				Margen_Bruto__c,
				Margen_Neto__c,
				Margin_manufacturado__c,
				Moneda__c,
				Month_Volume__c,
				Monto_conversion__c,
				Movimiento__c,
				Planta__c,
				Porcenta_Margen_Bruto_sobre_Ventas_netas__c,
				Porcenta_Margen_Neto_sobre_Ventas_netas__c,
				Precio_dolar__c,
				QuoteId,
				Precio_facturado__c,
				Precio_LAB_Transfer_Station_Venta_Neta__c,
				Precio_total__c,
				PricebookEntryId,
				Product2Id,
				Producto_Origen__c,
				Profit_Margin__c,
				Profit_Margin_porcentaje__c,
				PTU__c,
				Quantity,
				SG_A_KG__c,
				SG_A_LT__c,
				ship_to_id__c,
				ship_to_sucursal__c,
				Shipping_cost_per_tons__c,
				Shipping_Costs_per_Lot_Size__c,
				Shipping_Costs_per_Lot_SizeF__c,
				Subtotal,
				Sucursal__c,
				systemDeliveryCost__c,
				Tons__c,
				Total_Cost_USD_MT__c,
				Total_Costo_Construido__c,
				Total_Costo_de_Producto__c,
				Total_Costos_Operativos__c,
				TotalPrice,
				Transfer_Station_Cost__c,
				Transportation_Method__c,
				Unidad_de_medida__c,
				UnitPrice,
				Volumen__c,
				Volumen_Lt_Galon__c,
				Product2.ProductCode,
				Customer_Site_Name__r.Name,
				Customer_Site_Name__r.Ship_to_ID__c
			FROM QuoteLineItem
			WHERE QuoteId IN :Trigger.newMap.keySet()
		];
	}

	public Boolean isValidQuote(Quote q) {
		Quote oldQ = (Quote) Trigger.oldMap.get(q.Id);
		return (oldQ.Status != 'Aprobado' &&
		q.Status == 'Aprobado' &&
		q.Utilizar_trigger__c &&
		q.Cotizado__c &&
		!q.Lista_Generada__c &&
		q.OpportunityId != null);
	}

	/**
	 * Se encarga de mapear las listas de precios tanto para las cotizaciones
	 * nuevas como para las listas de precio que se estan actualizando
	 */
	public Map<Id, Pricebook2> generatePricebooks(List<Quote> quoteItems) {
		Map<Id, Pricebook2> pbEntryMap = new Map<Id, Pricebook2>();
		for (Quote q : (List<Quote>) quoteItems) {
			if (isValidQuote(q)) {
				Opportunity opp = oppMap.get(q.OpportunityId);
				if (opp != null) {
					if (q.Lista_Oracle__c == null) {
						String pricebookBusinessUnit = '';
						if (opp.Unidad_de_negocio__c.contains('-')) {
							pricebookBusinessUnit = opp.Unidad_de_negocio_Picklist__c;
						} else {
							pricebookBusinessUnit = opp.Unidad_de_negocio__c == 'Almex' ? 'BU_ALMEX' : 'BU_PROMER';
						}
						Pricebook2 newPb = new Pricebook2();
						newPb.Cotizacion__c = q.Id;
						newPb.Fecha_de_Fin__c = q.ExpirationDate;
						newPb.Fecha_de_inicio__c = q.Fecha_de_inicio__c;
						newPb.IsActive = true;
						newPb.Moneda__c = q.Moneda__c;
						newPb.Name =
							opp.Producto__r.Oracle_Id__c +
							'-' +
							opp.Account.Identificador_de_registro__c +
							'-' +
							q.Id;
						newPb.Precio_Base__c = q.Total_precio_facturado__c;
						newPb.Producto__c = opp.Producto__c;
						newPb.Unidad_de_negocio__c = pricebookBusinessUnit;
						pbEntryMap.put(q.Id, newPb);
					} else {
						Pricebook2 newPb = new Pricebook2(Id = q.Lista_Oracle__c);
						newPb.IsActive = true;
						newPb.Cotizacion__c = q.Id;
						newPb.Fecha_de_inicio__c = q.Fecha_de_inicio__c;
						newPb.Fecha_de_Fin__c = q.ExpirationDate;
						newPb.Name =
							opp.Producto__r.Oracle_Id__c +
							'-' +
							opp.Account.Identificador_de_registro__c +
							'-' +
							q.Id;
						newPb.Updated__c = false;
						pbEntryMap.put(q.Id, newPb);
					}
				}
			}
		}
		return pbEntryMap;
	}

	/**
	 * Flujo que se encarga de crear las entradas de lista de precio
	 * como la asignacion de las partidas de cotizacion
	 */
	public void createQuoteLineItems(
		Quote quote,
		List<QuoteLineItem> deliveryPoints,
		List<Product2> products,
		Boolean isUpdate,
		Opportunity opp
	) {
		Pricebook2 currentPb = this.pbToCreate.get(quote.Id);
		/**
		 * Map de los nuevos productos para la lista de precios
		 */
		Map<String, PricebookEntry> newPbEntriesMap = new Map<String, PricebookEntry>();
		/**
		 * Filled de datos para el map con productos de la lista
		 * que ya se hayan creado previamente dentro de las listas de precio
		 */
		for (PricebookEntry pbEntry : this.pbEntries.values()) {
			if (pbEntry.Pricebook2Id == currentPb.Id) {
				newPbEntriesMap.put(pbEntry.ProductCode, pbEntry);
			}
		}
		/**
		 * Recorrido de los productos de la familia y las sucursales para
		 * generar las entradas de listas de precio
		 */
		for (Product2 p : products) {
			for (QuoteLineItem qli : deliveryPoints) {
				String pricebookKey = p.ProductCode + '_' + qli.Customer_Site_Name__r.Name;
				if (this.productMap.containsKey(pricebookKey)) {
					if (newPbEntriesMap.containsKey(pricebookKey)) {
						// product exists
						if (isUpdate) {
							PricebookEntry pbEntry = newPbEntriesMap.get(pricebookKey);
							pbEntry.UnitPrice = Test.isRunningTest() ? 1 : qli.Precio_facturado__c;
							newPbEntriesMap.put(pricebookKey, pbEntry);
						}
					} else {
						// product not exists
						PricebookEntry newPbe = new PricebookEntry();
						// System.debug(qli);
						// System.debug(qli.Precio_facturado__c);
						newPbe.Pricebook2Id = currentPb.Id;
						newPbe.Product2Id = this.productMap.get(pricebookKey).Id;
						newPbe.UnitPrice = Test.isRunningTest() ? 1 : qli.Precio_facturado__c;
						newPbe.Ship_to_ID__c = qli.Customer_Site_Name__r.Ship_to_ID__c;
						newPbe.IsActive = true;
						newPbEntriesMap.put(pricebookKey, newPbe);
					}
				}
			}
		}

		if (!newPbEntriesMap.isEmpty()) {
			upsert newPbEntriesMap.values();
			List<QuoteLineItem> qliToInsert = new List<QuoteLineItem>();
			/**
			 * Creacion de los productos de la cotizacion con las nuevas entradas
			 * creadas
			 */
			for (Product2 p : products) {
				for (QuoteLineItem qli : deliveryPoints) {
					QuoteLineItem clonenQli = qli.clone(false, true, false, false);
					String pricebookKey = p.ProductCode + '_' + qli.Customer_Site_Name__r.Name;
					/**
					 * Obtiene el valor del producto de la lista con base
					 * en el map creado en el ciclo anterior
					 */
					PricebookEntry pbEntry = newPbEntriesMap.get(pricebookKey);
					clonenQli.PricebookEntryId = pbEntry.Id;
					clonenQli.Product2Id = pbEntry.Product2Id;

					// valida si este producto es el mismo que se cotizo
					if (opp.Producto__c == p.Id) {
						// de ser asi actualiza el campo Producto_Origen__c
						clonenQli.Producto_Origen__c = opp.Producto__c;
					} else {
						// de no ser asi cambia parametros de los productos
						clonenQli.Quantity = 1;
						clonenQli.UnitPrice = 0;
					}

					qliToInsert.add(clonenQli);
				}
			}
			if (!qliToInsert.isEmpty()) {
				insert qliToInsert;
			}
		}
	}
}