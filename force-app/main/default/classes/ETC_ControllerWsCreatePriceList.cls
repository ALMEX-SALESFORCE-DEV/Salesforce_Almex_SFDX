public with sharing class ETC_ControllerWsCreatePriceList {
	public Pricebook2 pb;
	public Decimal minPrice;
	public Map<String, String> mapUnits;

	public ETC_ControllerWsCreatePriceList(String recordId) {
		this.minPrice = 0;
		this.mapUnits = new Map<String, String>();
		this.mapUnits.put('KG', 'KILOGRAMO');
		this.mapUnits.put('LT', 'LITROS');
		this.mapUnits.put('PZA', 'PIEZA');
		this.mapUnits.put('TON', 'TONELADA');
		this.pb = [
			SELECT
				Id,
				External_Id__c,
				From_Oracle__c,
				Name,
				Description,
				Tipo__c,
				Codigo_de_Tipo__c,
				Unidad_de_negocio__c,
				Moneda__c,
				Codigo_Ajuste_Precios__c,
				Updated__c,
				Status__c,
				Definicion_de_cargos__c,
				Tipo_de_l_nea__c,
				Producto__c,
				Producto__r.Family,
				Precio_Base__c,
				M_todo_de_c_lculo__c,
				Fecha_de_inicio__c,
				Hora_Inicio__c,
				Fecha_de_Fin__c,
				Hora_Fin__c,
				Actualizacion_Manual__c,
				Cotizacion__r.QuoteNumber,
				Cotizacion__r.Moneda__c,
				Cotizacion__r.QuoteAccountId,
				Cotizacion__r.Account.N_mero_de_cuenta__c,
				Cotizacion__r.Account.Name,
				Cotizacion__r.QuoteAccount.N_mero_de_cuenta__c,
				Cotizacion__r.QuoteAccount.Name,
				Cotizacion__r.Opportunity.Quote_Version__c,
				Cotizacion__r.Unidad_de_Medida_Oracle__c,
				Cotizacion__r.Fecha_de_inicio__c,
				Cotizacion__r.Hora_inicio__c,
				Cotizacion__r.ExpirationDate,
				Cotizacion__r.Hora_fin__c,
				Cotizacion__r.Id,
				Cotizacion__r.OpportunityId,
				(
					SELECT
						id,
						UnitPrice,
						Precio_enviado__c,
						Ship_to_ID__c,
						Product2.Producto_Principal__r.Id,
						ProductCode
					FROM PricebookEntries
				)
			FROM Pricebook2
			WHERE Id = :recordId
			LIMIT 1
		];
	}

	public string sync() {
		ETC_ReqCreatePriceList model = new ETC_ReqCreatePriceList();
		model.PriceListName = pb.Name;
		if (pb.Cotizacion__r.QuoteAccountId != null) {
			List<String> splitCustomerId = pb.Cotizacion__r.QuoteAccount.N_mero_de_cuenta__c.split('-');
			if (splitCustomerId.size() > 1) {
				model.CustomerId = pb.Cotizacion__r.QuoteAccount.N_mero_de_cuenta__c.split('-')[1];
			} else {
				model.CustomerId = pb.Cotizacion__r.QuoteAccount.N_mero_de_cuenta__c;
			}
		} else {
			List<String> splitCustomerId = pb.Cotizacion__r.Account.N_mero_de_cuenta__c.split('-');
			if (splitCustomerId.size() > 1) {
				model.CustomerId = pb.Cotizacion__r.Account.N_mero_de_cuenta__c.split('-')[1];
			} else {
				model.CustomerId = pb.Cotizacion__r.Account.N_mero_de_cuenta__c;
			}
		}
		System.debug('===START_UPDATE===');
		System.debug(pb.Fecha_de_inicio__c);
		System.debug(pb.Fecha_de_Fin__c);
		System.debug(pb.Hora_inicio__c);
		System.debug(pb.Hora_fin__c);
		System.debug('===END_UPDATE===');
		model.PriceListDescription = pb.Description;
		model.PriceListTypeCode = pb.Codigo_de_Tipo__c;
		model.BusinessUnit = pb.Unidad_de_negocio__c;
		model.CurrencyCode = pb.Moneda__c;
		model.StatusCode = pb.Status__c;
		model.StartDate = ETC_Utility.getStringDateTime(pb.Fecha_de_inicio__c, pb.Hora_inicio__c, null);
		model.EndDate = ETC_Utility.getStringDateTime(pb.Fecha_de_Fin__c, pb.Hora_fin__c, null);
		model.AssociationStartDate = ETC_Utility.getStringDateTime(pb.Fecha_de_inicio__c, pb.Hora_inicio__c, null);
		model.AssociationEndDate = ETC_Utility.getStringDateTime(pb.Fecha_de_Fin__c, pb.Hora_fin__c, null);
		model.PricingChargeDefinitionCode = pb.Definicion_de_cargos__c;
		model.LineTypeCode = pb.Tipo_de_l_nea__c;
		model.CalculationMethodCode = pb.M_todo_de_c_lculo__c;
		model.items = new List<ETC_ReqCreatePriceList.Item>();
		model.accessSets = new List<ETC_ReqCreatePriceList.AccessSet>();

		Map<String, List<PricebookEntry>> items = mergeValues(this.pb.PricebookEntries);

		Product2[] productsToSend = [
			SELECT Id, Oracle_Id__c
			FROM Product2
			WHERE Id IN :items.keySet()
		];
		Integer index = 1;
		for (Product2 product : productsToSend) {
			ETC_ReqCreatePriceList.Item newItem = new ETC_ReqCreatePriceList.Item();
			newItem.Item = product.Oracle_Id__c;
			newItem.PricingUOMCode = pb.Cotizacion__r.Unidad_de_Medida_Oracle__c;
			newItem.PricingUOMDescription = this.mapUnits.get(pb.Cotizacion__r.Unidad_de_Medida_Oracle__c);
			newItem.LineTypeCode = 'ORA_BUY';
			newItem.PrimaryPricingUOM = 'Y';
			newItem.ServiceDurationPeriodCode = 'ul';
			newItem.ItemLevelCode = 'ITEM';
			newItem.ItemLevel = 'Item';
			newItem.charges = new List<ETC_ReqCreatePriceList.Charge>();

			ETC_ReqCreatePriceList.Charge newCharge = new ETC_ReqCreatePriceList.Charge();
			newCharge.PricingChargeDefinitionCode = 'QP_SALE_PRICE';
			newCharge.CalculationMethodCode = 'PRICE';
			newCharge.BasePrice = this.minPrice;
			newCharge.StartDate = ETC_Utility.getStringDateTime(pb.Fecha_de_inicio__c, pb.Hora_inicio__c, null);
			newCharge.EndDate = ETC_Utility.getStringDateTime(pb.Fecha_de_Fin__c, pb.Hora_fin__c, null);
			newCharge.ChargeLineNumber = index;
			newCharge.pricingMatrixes = new List<ETC_ReqCreatePriceList.PricingMatrix>();
			ETC_ReqCreatePriceList.PricingMatrix pricingMatrix = new ETC_ReqCreatePriceList.PricingMatrix();
			pricingMatrix.MatrixName =
				pb.Cotizacion__r.QuoteNumber +
				'_' +
				pb.Id +
				'_' +
				index +
				pb.Actualizacion_Manual__c;
			pricingMatrix.rules = new List<ETC_ReqCreatePriceList.MatrixRule>();

			List<PricebookEntry> entries = items.get(product.Id);
			for (PricebookEntry entry : entries) {
				ETC_ReqCreatePriceList.MatrixRule newRule = new ETC_ReqCreatePriceList.MatrixRule();
				newRule.Dimension1 = 'Ship To';
				newRule.Dimension1Value = entry.Ship_to_ID__c;
				newRule.Dimension1KeyValue = entry.Ship_to_ID__c;
				newRule.Dimension2 = 'Adjustment Type';
				newRule.Dimension2Value = 'Markup amount';
				newRule.Dimension2KeyValue = 'MARKUP_AMOUNT';
				newRule.Dimension3 = 'Adjustment Amount';
				newRule.Dimension3Value = String.valueOf(entry.Precio_enviado__c - minPrice);
				newRule.Dimension3KeyValue = String.valueOf(entry.Precio_enviado__c - minPrice);
				newRule.Dimension4 = 'Adjustment Basis';
				newRule.Dimension4Value = 'AJUSTE_PRECIO';
				newRule.Dimension4KeyValue = pb.Codigo_Ajuste_Precios__c;
				pricingMatrix.rules.add(newRule);
			}

			newCharge.pricingMatrixes.add(pricingMatrix);
			newItem.charges.add(newCharge);
			model.items.add(newItem);
			index++;
		}

		ETC_ReqCreatePriceList.AccessSet newAccessSetCode = new ETC_ReqCreatePriceList.AccessSet();
		newAccessSetCode.AccessSetCode = 'COMMON';

		model.accessSets.add(newAccessSetCode);

		System.debug('===START_model===');
		System.debug(JSON.serializePretty(model));
		System.debug('===END_model===');
		return ETC_ReqCreatePriceList.parse(model);
	}

	public Map<String, List<PricebookEntry>> mergeValues(List<PricebookEntry> entries) {
		System.debug(entries);
		Map<String, List<PricebookEntry>> mapEntries = new Map<String, List<PricebookEntry>>();
		for (PricebookEntry entry : entries) {
			if (this.minPrice == 0) {
				this.minPrice = entry.Precio_enviado__c;
			} else if (entry.Precio_enviado__c < this.minPrice) {
				this.minPrice = entry.Precio_enviado__c;
			}
			List<PricebookEntry> currentMap = mapEntries.get(entry.Product2.Producto_Principal__r.Id);
			if (currentMap != null) {
				currentMap.add(entry);
			} else {
				List<PricebookEntry> deliveryPlaces = new List<PricebookEntry>();
				deliveryPlaces.add(entry);
				// System.debug('===START_ENTRY_TO_PB===');
				// System.debug(entry.Product2);
				// System.debug(entry.Product2.Producto_Principal__r);
				// System.debug('===END_ENTRY_TO_PB===');
				mapEntries.put(entry.Product2.Producto_Principal__r.Id, deliveryPlaces);
			}
		}
		// System.debug('===START_RETURN_MAP_ENTRIES===');
		// System.debug(mapEntries);
		// System.debug('===END_RETURN_MAP_ENTRIES===');
		return mapEntries;
	}

	public String saveResponse(String id) {
		try {
			System.debug('this.pb=' + this.pb);
			System.debug('id=' + id);
			pb.External_Id__c = id;
			pb.From_Oracle__c = true;
			pb.Fecha_de_inicio__c = pb.Fecha_de_inicio__c;
			pb.Hora_Inicio__c = pb.Hora_inicio__c;
			pb.Fecha_de_Fin__c = pb.Fecha_de_Fin__c;
			pb.Hora_Fin__c = pb.Hora_fin__c;
			pb.Moneda__c = pb.Cotizacion__r.Moneda__c;
			pb.Updated__c = true;

			List<SalesAgreementProduct> newSaProducts = new List<SalesAgreementProduct>();
			Map<String, Boolean> saProducts = new Map<String, Boolean>();
			SalesAgreement[] sa = [
				SELECT
					Id,
					Cotizacion__c,
					(
						SELECT Id, ProductId, SalesPrice, InitialPlannedQtyValue, DiscountPercentage
						FROM SalesAgreementProducts
					)
				FROM SalesAgreement
				WHERE PricebookId = :pb.Id
				LIMIT 1
			];

			if (sa.size() > 0) {
				for (SalesAgreementProduct saProduct : sa[0].SalesAgreementProducts) {
					saProducts.put(saProduct.ProductId, true);
				}
				List<QuoteLineItem> quoteItems = [
					SELECT
						Id,
						Product2Id,
						Product2.Name,
						Precio_facturado__c,
						Quantity,
						PricebookEntryId,
						Producto_Origen__c
					FROM QuoteLineItem
					WHERE QuoteId = :sa[0].Cotizacion__c
				];
				for (QuoteLineItem quoteItem : quoteItems) {
					if (saProducts.get(quoteItem.Product2Id) == null) {
						SalesAgreementProduct newSaProduct = new SalesAgreementProduct();
						if (quoteItem.Producto_Origen__c == null) {
							newSaProduct.SalesPrice = quoteItem.Precio_facturado__c;
						} else {
							newSaProduct.SalesPrice = 0;
						}
						newSaProduct.PricebookEntryId = quoteItem.PricebookEntryId;
						newSaProduct.InitialPlannedQtyValue = quoteItem.Quantity;
						newSaProduct.SalesAgreementId = sa[0].Id;
						newSaProduct.Name = quoteItem.Product2.Name;
						newSaProduct.DiscountPercentage = 0;
						newSaProducts.add(newSaProduct);
					}
				}
				insert newSaProducts;
			}

			update pb;

			return 'Lista de precio sincronizada correctamente';
		} catch (Exception e) {
			System.debug('===START_Error_SaveResponse===');
			System.debug(e);
			System.debug('===END_Error_SaveResponse===');
			return 'No fue posible crear la lista de precios';
		}
	}

	// public String getStringDateTime(Date dateInput, Time timeInput) {
	// 	return String.valueOf(dateInput).split(' ')[0] + 'T' + String.valueOf(timeInput).split('\\.')[0] + '+00:00';
	// }
}