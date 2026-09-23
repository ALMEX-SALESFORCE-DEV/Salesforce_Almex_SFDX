public with sharing class ETC_QuoterImportadosController {
	@AuraEnabled(cacheable=true)
	public static Opportunity getOpportunityById(String id) {
		try {
			Opportunity opp = [
				SELECT
					Id,
					Name,
					Uso_del_Maiz__c,
					Producto__c,
					Unidad_de_negocio__c,
					Unidad_de_negocio_Picklist__c,
					AccountId,
					Account.Name,
					Account.N_mero_de_cuenta__c,
					Account.Raz_n_social__c,
					Account.Condicion_de_pago__c,
					Account.Condicion_de_pago_PROMER__c,
					Corn_Freight_to_Almex__c,
					Gas_transp_additional__c,
					sgaUst__c,
					Quote_Version__c,
					Coproduct_Recov__c,
					Producto__r.Medio_de_transporte__c,
					Producto__r.Densidad_Merk_20C__c,
					Producto__r.Volumen_Lt_Galon__c,
					Producto__r.Factor1Breakdown__c,
					Producto__r.Factor2Breakdown__c,
					Producto__r.Net_Corn_Fijo__c,
					Producto__r.Cogs_Usd_Variable_Fijo__c,
					Producto__r.Cogs_Usd_Fijo__c,
					Producto__r.Cogs_Usd_Formula_Fijo__c
				FROM Opportunity
				WHERE id = :id
			];
			return opp;
		} catch (Exception e) {
			throw new AuraHandledException(e.getMessage());
		}
	}

	@AuraEnabled(cacheable=true)
	public static Product2 getProductById(String id) {
		try {
			Product2 product = [
				SELECT
					ProductCode,
					SG_A_LT__c,
					SG_A_KG__c,
					Costo_estandar_P__c,
					Factor_de_conversion_kg__c,
					Factor_de_conversion__c,
					Densidad_Merk_20C__c,
					Volumen_Lt_Galon__c,
					Unidad_de_medida__c
				FROM product2
				WHERE id = :id
			];
			return product;
		} catch (Exception e) {
			throw new AuraHandledException(e.getMessage());
		}
	}

	@AuraEnabled(cacheable=true)
	public static Sucursal__c getClientSiteById(String id) {
		try {
			Sucursal__c clientSite = [
				SELECT Ship_to_ID__c, Datos_de_direccion__City__s, Datos_de_direccion__c
				FROM Sucursal__c
				WHERE id = :id
			];
			return clientSite;
		} catch (Exception e) {
			throw new AuraHandledException(e.getMessage());
		}
	}

	@AuraEnabled(cacheable=false)
	public static Fletes__c getFleteByParams(
		String transport,
		String city,
		String plant,
		String moneda,
		Date initDate,
		String state
	) {
		try {
			Fletes__c flete = [
				SELECT Costo_de_flete__c, Tipo_de_moneda__c, Limite_de_carga__c
				FROM Fletes__c
				WHERE
					Medio_de_transporte__c = :transport
					AND Ciudad_de_destino__c = :city
					AND Estado__c = :state
					AND Planta__c = :plant
					AND Fecha_inicio__c <= :initDate
					AND Fecha_vigencia__c >= :initDate
					AND Activo__c = TRUE
			];
			return flete;
		} catch (Exception e) {
			System.debug('===START_e===');
			System.debug(e);
			System.debug('===END_e===');
			throw new AuraHandledException(e.getMessage());
		}
	}

	@AuraEnabled(cacheable=true)
	public static Quote getQuoteById(String id) {
		try {
			Quote quoteRecord = [
				SELECT
					Id,
					recordType.DeveloperName,
					Precio_dolar__c,
					leftDataset__c,
					rightDataset__c,
					OpportunityId,
					CreatedDate,
					Fecha_de_inicio__c,
					ExpirationDate,
					Planta__c,
					Unidad_de_medida__c,
					Costo_incremental__c,
					Costo_de_financiamiento_adicional__c,
					Corn_date__c,
					Basis_date__c,
					Fx__c,
					Gas__c,
					Inflation__c,
					Corn_Usage__c,
					Proposed_Volume_Mtons__c,
					Booked_Volume_Mtons__c,
					Dias_de_credito__c,
					Delivery_Points_Number__c,
					isOilFlag__c,
					literOutput__c,
					Moneda__c,
					marketReferenceMetadata__c,
					Description,
					Lista_Oracle__c,
					Pricebook2Id,
					(
						SELECT
							Incremental_Costs_Rebate_Porcentage__c,
							Id,
							Shipping_Costs_per_Lot_Size__c,
							Monto_conversion__c,
							Shipping_Costs_per_Lot_SizeF__c,
							Volumen__c,
							Customer_Site_Name__r.Id,
							Customer_Site_Name__r.Ship_to_ID__c,
							Customer_Site_Name__r.Datos_de_direccion__City__s,
							Customer_Site_Name__r.Datos_de_direccion__c,
							Almacen_de_Recibo_Almex__c,
							Customer_Site_Name__c,
							Transportation_Method__c,
							Tons__c,
							Movimiento__c,
							Flete_de_Salida_a_Cliente_OUTBOUND__c,
							Costo_Producto_USD_Shareholders__c,
							Financial_Costs_Rate__c,
							Flete_de_Entrada_Railroad__c,
							Costos_Operativos__c,
							Costos_Operativos_ImportExp__c,
							Profit_Margin_porcentaje__c,
							Costos_Operativos_Isotank__c,
							Costos_Operativos_Portales_Clientes__c,
							Costos_Operativos_almacenaje_seco__c,
							Total_Costo_de_Producto__c,
							Total_Cost_USD_MT__c,
							Moneda__c,
							Freight_MXN__c,
							Incremental_Costs_Rebate__c,
							SG_A_LT__c,
							SG_A_KG__c,
							literOutput__c,
							Costo_estandar_P__c,
							Factor_de_conversion_kg__c,
							Factor_de_conversion__c,
							Unidad_de_medida__c,
							Customer_Delivered_Price__c,
							deliveryCurrency__c,
							Flete_Convertido__c,
							Month_Volume__c,
							Densidad_Merk_20C__c,
							Volumen_Lt_Galon__c,
							systemDeliveryCost__c,
							UnitPrice,
							freightCost__c,
							Ajuste_a_Flete__c,
							Flete_con_Ajuste__c
						FROM QuoteLineItems
						WHERE UnitPrice != 0
					)
				FROM Quote
				WHERE Id = :id
			];
			return quoteRecord;
		} catch (Exception e) {
			throw new AuraHandledException(e.getMessage());
		}
	}

	@AuraEnabled(cacheable=false)
	public static String createQuote(QuoteModel newQuoteModel, QuoteModel.QuoteConfigs quoteConfigs, String pricebook) {
		try {
			System.debug('===START_2===');
			System.debug(newQuoteModel);
			System.debug(pricebook);
			System.debug(quoteConfigs);
			System.debug('===END_2===');
			String standardPricebook = pricebook != null ? pricebook : '';
			if (standardPricebook.length() == 0) {
				standardPricebook = Test.isRunningTest()
					? Test.getStandardPricebookId()
					: [SELECT Id FROM Pricebook2 WHERE IsStandard = TRUE LIMIT 1].Id;
			}
			Id recordTypeId = Schema.SObjectType.Quote.getRecordTypeInfosByDeveloperName()
				.get('Cotizacion_Importados')
				.getRecordTypeId();
			Quote newQuote = new Quote();
			newQuote.literOutput__c = quoteConfigs.literOutput;
			newQuote.Cotizado__c = true;
			newQuote.isOilFlag__c = newQuoteModel.isOil != null ? newQuoteModel.isOil : false;
			newQuote.recordTypeId = recordTypeId;
			newQuote.opportunityId = newQuoteModel.opportunityId;
			if (newQuoteModel.accountCreditDays != null) {
				newQuote.Dias_de_credito__c = Integer.valueOf(newQuoteModel.accountCreditDays);
			}
			newQuote.Name = newQuoteModel.name;
			newQuote.pricebook2Id = standardPricebook;
			// Totales
			newQuote.Total_precio_facturado__c = Decimal.valueOf(newQuoteModel.pricing);
			newQuote.Total_de_volumen__c = Decimal.valueOf(newQuoteModel.volume);
			newQuote.Total_productos__c = Decimal.valueOf(newQuoteModel.products);
			newQuote.Sucursales__c = Decimal.valueOf(newQuoteModel.customerSites);
			newQuote.Total_precio_entregado_con_cliente__c = Decimal.valueOf(newQuoteModel.warehousePrice);
			newQuote.Flete_de_Salida_a_Cliente_OUTBOUND__c = Decimal.valueOf(newQuoteModel.flete);
			newQuote.Total_precio_LAB_transfer_station__c = Decimal.valueOf(newQuoteModel.labTransfer);
			newQuote.Total_Costo_USD_Shareholders__c = Decimal.valueOf(newQuoteModel.shareholders);
			newQuote.Costo_Producto__c = Decimal.valueOf(newQuoteModel.productCost);
			newQuote.Total_flete_de_entrada__c = Decimal.valueOf(newQuoteModel.railroad);
			newQuote.Total_Costos_Operativos_Almidon__c = Decimal.valueOf(newQuoteModel.operativeAlmidon);
			newQuote.Total_Costos_Operativos_Transfer__c = Decimal.valueOf(newQuoteModel.operativePacking);
			newQuote.Total_Costo_Construido__c = Decimal.valueOf(newQuoteModel.totalBuildCost);
			newQuote.Total_Profit_Margin_porcentaje__c = Decimal.valueOf(newQuoteModel.profitMarginPercentage);
			newQuote.Total_Profit_Margin__c = Decimal.valueOf(newQuoteModel.profitMargin);
			newQuote.Total_Costo_de_Producto__c = Decimal.valueOf(newQuoteModel.totalProductCost);
			newQuote.Total_Costos_Operativos_Isotank__c = Decimal.valueOf(newQuoteModel.isotank);
			newQuote.Total_Costos_Operativos_Portales__c = Decimal.valueOf(newQuoteModel.clientPortals);
			newQuote.Total_Costos_Operativos_almacenaje_seco__c = Decimal.valueOf(newQuoteModel.dryStorage);
			newQuote.Total_Costos_Operativos__c = Decimal.valueOf(newQuoteModel.totalOperativeCost);
			newQuote.Costo_Total_de_Venta__c = Decimal.valueOf(newQuoteModel.totalSalesCost);
			newQuote.Margen_Bruto__c = Decimal.valueOf(newQuoteModel.marginBrute);
			newQuote.Margen_Bruto_sobre_Ventas_netas__c = Decimal.valueOf(newQuoteModel.marginBruteNetSales);
			newQuote.Gastos_de_Overhead__c = Decimal.valueOf(newQuoteModel.overhead);
			newQuote.Margen_antes_de_Impuestos__c = Decimal.valueOf(newQuoteModel.marginBeforeTaxes);
			newQuote.Margen_Neto_sobre_Ventas_netas__c = Decimal.valueOf(newQuoteModel.netMarginBeforeSales);
			newQuote.PTU__c = Decimal.valueOf(newQuoteModel.ptu);
			newQuote.ISR_Impuesto_sobre_la_Renta__c = Decimal.valueOf(newQuoteModel.isr);
			newQuote.Margen_Neto__c = Decimal.valueOf(newQuoteModel.netMargin);
			newQuote.Incremental_Costs_Percentage__c = Decimal.valueOf(newQuoteModel.incrementalCostPercentage);
			newQuote.Incremental_Costs_Rebate__c = Decimal.valueOf(newQuoteModel.incrementalCostRebate);
			newQuote.Total_Costo_Incremental__c = Decimal.valueOf(newQuoteModel.exwIncrementals);
			newQuote.Costo_de_financiacin_Percentage__c = Decimal.valueOf(newQuoteModel.finantialCostPercentage);
			newQuote.Costo_de_financiacin__c = newQuoteModel.finantialCost;
			newQuote.Total_Costo_de_financiacin__c = Decimal.valueOf(newQuoteModel.exwFinantialCost);
			//  Totales
			newQuote.Fecha_de_inicio__c = Date.valueOf(quoteConfigs.startDate);
			newQuote.ExpirationDate = Date.valueOf(quoteConfigs.endDate);
			newQuote.Periodo__c = quoteConfigs.textPeriod;
			newQuote.Aos_de_periodo__c = quoteConfigs.yearPeriod;
			newQuote.Unidad_de_medida__c = quoteConfigs.unitMeasure;
			newQuote.Number_of_months__c = Decimal.valueOf(quoteConfigs.totalMonths);
			newQuote.Costo_incremental__c = quoteConfigs.incrementalCost;
			newQuote.Costo_de_financiamiento_adicional__c = quoteConfigs.haveIncrementalDays;
			newQuote.Das_adicionales_de_incremento__c = quoteConfigs.incrementalDays;
			newQuote.Planta__c = quoteConfigs.plant;
			newQuote.Codigo_Cotizador__c = quoteConfigs.quoteCode;
			newQuote.Description = quoteConfigs.comments;
			newQuote.Moneda__c = quoteConfigs.currentCurrency;

			if (newQuoteModel.listaOracle != null) {
				System.debug('===START_newQuoteModel.listaOracle===');
				System.debug(newQuoteModel.listaOracle);
				System.debug('===END_newQuoteModel.listaOracle===');
				Pricebook2[] quotePricebook = [
					SELECT Id, External_Id__c
					FROM Pricebook2
					WHERE Id = :newQuoteModel.listaOracle AND From_Oracle__c = TRUE AND isStandard = FALSE
				];
				System.debug('===START_QUOTE_PRICEBOOK===');
				System.debug(quotePricebook);
				System.debug('===END_QUOTE_PRICEBOOK===');
				if (quotePricebook.size() > 0) {
					if (quotePricebook[0].External_Id__c != null) {
						newQuote.Lista_Oracle__c = quotePricebook[0].Id;
					}
				}
			}

			if (newQuoteModel.literProductCost != null) {
				newQuote.Liter_Product_Cost__c = Decimal.valueOf(newQuoteModel.literProductCost);
			}
			if (newQuoteModel.transferStationCost != null) {
				newQuote.Transfer_Station_Cost__c = Decimal.valueOf(newQuoteModel.transferStationCost);
			}

			System.debug('===START_Decimal.valueOf(quoteConfigs.convertionCurrency);===');
			System.debug(Decimal.valueOf(quoteConfigs.convertionCurrency));
			System.debug('===END_Decimal.valueOf(quoteConfigs.convertionCurrency);===');
			newQuote.Precio_dolar__c = Decimal.valueOf(quoteConfigs.convertionCurrency);

			Opportunity opp = [
				SELECT Id, Quote_Version__c, AccountId
				FROM Opportunity
				WHERE Id = :newQuoteModel.opportunityId
			];

			newQuote.QuoteAccountId = opp.AccountId;

			upsert newQuote Codigo_Cotizador__c;

			if (opp.Quote_Version__c != null) {
				opp.Quote_Version__c = opp.Quote_Version__c + 1;
			} else {
				List<Quote> quoteList = [SELECT Id FROM Quote WHERE OpportunityId = :newQuoteModel.opportunityId];
				opp.Quote_Version__c = quoteList.size() + 1;
			}
			update opp;
			return newQuote.Id + '-' + standardPricebook;
		} catch (Exception e) {
			System.debug(e.getMessage());
			throw new AuraHandledException(e.getMessage());
		}
	}

	@AuraEnabled(cacheable=false)
	public static String createQuoteItem(String quoteId, String pricebookId, List<QuoteItemModel> newQuoteItemList) {
		try {
			System.debug('===START_1===');
			System.debug(quoteId);
			System.debug(pricebookId);
			System.debug(newQuoteItemList);
			System.debug('===END_1===');
			List<QuoteLineitem> newQuoteItems = new List<QuoteLineitem>();
			for (QuoteItemModel qi : newQuoteItemList) {
				QuoteLineItem newQuoteItem = new QuoteLineItem();
				List<PricebookEntry> pricebookEntryId = [
					SELECT id
					FROM PricebookEntry
					WHERE Product2Id = :qi.productId AND Pricebook2Id = :pricebookId
					LIMIT 1
				];
				System.debug(1);
				newQuoteItem.literOutput__c = qi.literOutput;
				newQuoteItem.Cotizado__c = true;
				newQuoteItem.product2Id = qi.productId;
				newQuoteItem.product2Id = qi.productId;
				newQuoteItem.Precio_facturado__c = Decimal.valueOf(qi.billedPrice);
				newQuoteItem.quoteId = quoteId;
				newQuoteItem.quantity = Decimal.valueOf(qi.volume);
				newQuoteItem.volumen__c = Decimal.valueOf(qi.volume);
				newQuoteItem.Almacen_de_Recibo_Almex__c = qi.storage;
				System.debug(1);
				newQuoteItem.Customer_Site_Name__c = qi.customerSiteName;
				newQuoteItem.unitPrice = Decimal.valueOf(qi.totalProductCost);
				newQuoteItem.Total_Costo_de_Producto__c = Decimal.valueOf(qi.totalProductCost);
				newQuoteItem.Customer_Delivered_Price__c = Decimal.valueOf(qi.almexPriceWarehouse);
				newQuoteItem.Transportation_Method__c = qi.transportation;
				newQuoteItem.Tons__c = Decimal.valueOf(qi.tons);
				newQuoteItem.Precio_LAB_Transfer_Station_Venta_Neta__c = Decimal.valueOf(qi.labTransferPrice);
				newQuoteItem.Costo_Producto_USD_Shareholders__c = Decimal.valueOf(qi.productShareholdersCost);
				System.debug(1);
				newQuoteItem.Costo_Producto__c = Decimal.valueOf(qi.productCost);
				newQuoteItem.Flete_de_Entrada_Railroad__c = Decimal.valueOf(qi.railroadCost);
				newQuoteItem.Costos_Operativos__c = Decimal.valueOf(qi.importExpensesAlmidon);
				newQuoteItem.Costos_Operativos_ImportExp__c = Decimal.valueOf(qi.transferImportExpPacking);
				newQuoteItem.Total_Costo_Construido__c = Decimal.valueOf(qi.totalBuildingCost);
				newQuoteItem.Profit_Margin_porcentaje__c = Decimal.valueOf(qi.profitMarginPercentage);
				if (qi.isotank != null) {
					newQuoteItem.Costos_Operativos_Isotank__c = Decimal.valueOf(qi.isotank);
				}
				System.debug(1);
				newQuoteItem.Costos_Operativos_Portales_Clientes__c = Decimal.valueOf(qi.clientPortals);
				newQuoteItem.Costos_Operativos_almacenaje_seco__c = Decimal.valueOf(qi.storageDry);
				newQuoteItem.Total_Costos_Operativos__c = Decimal.valueOf(qi.totalOperativeCost);
				newQuoteItem.Costo_Total_de_Venta__c = Decimal.valueOf(qi.totalSalesCost);
				newQuoteItem.Customer_Delivered_Price_Incrementals__c = Decimal.valueOf(qi.exwIncrementals);
				newQuoteItem.Customer_Delivered_Price_Financial_Cost__c = Decimal.valueOf(qi.exwFinancialCost);
				// INIT - MARGIN DATA
				newQuoteItem.Margen_Bruto__c = Decimal.valueOf(qi.marginBrute);
				newQuoteItem.Porcenta_Margen_Bruto_sobre_Ventas_netas__c = Decimal.valueOf(qi.marginBruteNetSales);
				if (qi.overhead != null) {
					newQuoteItem.Gastos_de_Overhead__c = Decimal.valueOf(qi.overhead);
				}
				if (qi.marginBeforeTaxes != null) {
					newQuoteItem.Margen_antes_de_Impuestos__c = Decimal.valueOf(qi.marginBeforeTaxes);
				}
				if (qi.netMarginAboutNetSales != null) {
					newQuoteItem.Porcenta_Margen_Neto_sobre_Ventas_netas__c = Decimal.valueOf(
						qi.netMarginAboutNetSales
					);
				}
				if (qi.ptu != null) {
					newQuoteItem.PTU__c = Decimal.valueOf(qi.ptu);
				}
				if (qi.isr != null) {
					newQuoteItem.ISR_Impuesto_sobre_la_Renta__c = Decimal.valueOf(qi.isr);
				}
				if (qi.netMargin != null) {
					newQuoteItem.Margen_Neto__c = Decimal.valueOf(qi.netMargin);
				}
				// END - MARGIN DATA
				System.debug(1);
				newQuoteItem.Incremental_Costs_Rebate_Porcentage__c = Decimal.valueOf(qi.incrementalCost);
				newQuoteItem.Incremental_Costs_Rebate__c = Decimal.valueOf(qi.incrementalCostCalc);
				newQuoteItem.Financial_Costs_Rate__c = Decimal.valueOf(qi.finantialCostRate);
				newQuoteItem.Monto_conversion__c = Decimal.valueOf(qi.convertionCurrency);
				newQuoteItem.Moneda__c = qi.currentCurrency;
				newQuoteItem.deliveryCurrency__c = qi.deliveryCurrency;
				newQuoteItem.systemDeliveryCost__c = Decimal.valueOf(qi.systemDeliveryCost);
				newQuoteItem.Movimiento__c = qi.movement;
				newQuoteItem.Flete_de_Salida_a_Cliente_OUTBOUND__c = Decimal.valueOf(qi.deliveryCost);
				System.debug(1);
				if (qi.densidadMark20C != null) {
					newQuoteItem.Densidad_Merk_20C__c = Decimal.valueOf(qi.densidadMark20C);
				}
				if (qi.volumenLtGalon != null) {
					newQuoteItem.Volumen_Lt_Galon__c = Decimal.valueOf(qi.volumenLtGalon);
				}
				if (qi.literProductCost != null) {
					newQuoteItem.Liter_Product_Cost__c = Decimal.valueOf(qi.literProductCost);
				}
				if (qi.transferStationCost != null) {
					newQuoteItem.Transfer_Station_Cost__c = Decimal.valueOf(qi.transferStationCost);
				}
				if (qi.convertionPrice != null) {
					newQuoteItem.Flete_Convertido__c = Decimal.valueOf(qi.convertionPrice);
				}
				if (qi.isOil != null && qi.isOil) {
					newQuoteItem.Shipping_Costs_per_Lot_Size__c = Decimal.valueOf(qi.shippingCostsPerLotSize);
					newQuoteItem.Shipping_Costs_per_Lot_SizeF__c = Decimal.valueOf(qi.shippingCostsPerLotSizeF);
					newQuoteItem.SG_A_LT__c = Decimal.valueOf(qi.sgALtC);
					newQuoteItem.SG_A_KG__c = Decimal.valueOf(qi.sgAKgC);
					newQuoteItem.Costo_estandar_P__c = Decimal.valueOf(qi.costoEstandarPC);
					newQuoteItem.Factor_de_conversion_kg__c = Decimal.valueOf(qi.factorDeConversionKgC);
					newQuoteItem.Factor_de_conversion__c = Decimal.valueOf(qi.factorDeConversionC);
					newQuoteItem.Unidad_de_medida__c = qi.unidadDeMedidaC;
				}

				if (pricebookEntryId.size() > 0) {
					newQuoteItem.pricebookEntryId = pricebookEntryId.get(0).Id;
				} else {
					PricebookEntry newPricebookEntry = new PricebookEntry();
					newPricebookEntry.Product2Id = qi.productId;
					newPricebookEntry.Pricebook2Id = pricebookId;
					newPricebookEntry.UnitPrice = Decimal.valueOf(qi.totalProductCost);
					newPricebookEntry.IsActive = true;
					insert newPricebookEntry;
					newQuoteItem.pricebookEntryId = newPricebookEntry.Id;
				}
				newQuoteItems.add(newQuoteItem);
			}
			insert newQuoteItems;

			ETC_QuoteToPricebookController.createDeliveryProducts(quoteId);

			String recordUrl = URL.getOrgDomainUrl().toExternalForm() + '/' + quoteId;
			return recordUrl;
		} catch (Exception e) {
			System.debug(e.getMessage());
			Quote quoteRecord = [SELECT Id FROM Quote WHERE Id = :quoteId];
			System.debug(quoteRecord);
			delete quoteRecord;
			System.debug('removed');
			throw new AuraHandledException(e.getMessage());
		}
	}

	@AuraEnabled(cacheable=false)
	public static List<Suministro__c> getSupplies(Date startDate, Date endDate) {
		try {
			List<Suministro__c> supplies = [
				SELECT id, Corn__c, Basis__c, Fx__c, Gas__c, Mes__c, Mes_ormula__c, LastModifiedDate
				FROM Suministro__c
				WHERE Mes__c >= :startDate AND Mes__c <= :endDate
				ORDER BY Mes__c
			];
			return supplies;
		} catch (Exception e) {
			throw new AuraHandledException(e.getMessage());
		}
	}

	// Metodos para manufacturados
	// Metodo que se encarga de crear la cotizacion con el tipo de registro de manufacturados
	@AuraEnabled(cacheable=false)
	public static String createManufacturedQuote(
		QuoteModel newQuoteModel,
		QuoteModel.QuoteConfigs quoteConfigs,
		String pricebook
	) {
		try {
			System.debug('===START_2===');
			System.debug(newQuoteModel);
			System.debug(pricebook);
			System.debug(quoteConfigs);
			System.debug('===END_2===');
			String standardPricebook = pricebook != null ? pricebook : '';
			if (standardPricebook.length() == 0) {
				standardPricebook = Test.isRunningTest()
					? Test.getStandardPricebookId()
					: [SELECT Id FROM Pricebook2 WHERE IsStandard = TRUE LIMIT 1].Id;
			}
			Id recordTypeId = Schema.SObjectType.Quote.getRecordTypeInfosByDeveloperName()
				.get('Cotizacion_Manufacturado')
				.getRecordTypeId();
			Quote newQuote = new Quote();
			newQuote.Cotizado__c = true;
			newQuote.marketReferenceMetadata__c = newQuoteModel.marketReferenceMetadata;
			newQuote.recordTypeId = recordTypeId;
			newQuote.opportunityId = newQuoteModel.opportunityId;
			newQuote.Name = newQuoteModel.name;
			newQuote.pricebook2Id = standardPricebook;
			// Init config values
			newQuote.Planta__c = quoteConfigs.plant;
			newQuote.Description = quoteConfigs.comments;
			newQuote.Proposed_Volume_Mtons__c = Decimal.valueOf(quoteConfigs.proposedMtons);
			newQuote.Booked_Volume_Mtons__c = Decimal.valueOf(quoteConfigs.bookedMtons);
			newQuote.Total_de_volumen__c = Decimal.valueOf(quoteConfigs.bookedMtons);
			newQuote.Delivery_Points_Number__c = Decimal.valueOf(quoteConfigs.pointsNumebr);
			newQuote.Fecha_de_inicio__c = Date.valueOf(quoteConfigs.startDate);
			newQuote.ExpirationDate = Date.valueOf(quoteConfigs.endDate);
			newQuote.Number_of_months__c = Decimal.valueOf(quoteConfigs.totalMonths);
			newQuote.Version__c = Decimal.valueOf(quoteConfigs.version);
			newQuote.Corn_Usage__c = Decimal.valueOf(quoteConfigs.cornUsage);
			newQuote.Total_precio_facturado__c = Decimal.valueOf(quoteConfigs.customerDeliv);
			newQuote.Customer_Deliv_USD_MT__c = Decimal.valueOf(quoteConfigs.customerDeliv);
			newQuote.EXW_ALMEX_USD_MT__c = Decimal.valueOf(quoteConfigs.exwAlmexUsd);
			newQuote.EXW_ALMEX_MXN_MT__c = Decimal.valueOf(quoteConfigs.exwAlmexMxn);
			newQuote.Total_Margin_porcentaje__c = Decimal.valueOf(quoteConfigs.totalMarginPercentage);
			newQuote.Total_Margin_usd_mt__c = Decimal.valueOf(quoteConfigs.totalMarginUsdMt);
			newQuote.Total_Margin_usd_DS__c = Decimal.valueOf(quoteConfigs.totalMarginUsdDs);
			newQuote.Total_Cost_USD_MT__c = Decimal.valueOf(quoteConfigs.totalCostUstMt);
			newQuote.SG_A_USD_MT__c = Decimal.valueOf(quoteConfigs.sgaUsdMt);
			newQuote.SG_A_MXN_MT__c = Decimal.valueOf(quoteConfigs.sgaMxnMt);
			newQuote.Unidad_de_medida__c = quoteConfigs.unitMeasure;
			newQuote.Flete_USD_MT__c = Decimal.valueOf(quoteConfigs.fleteUstMt);
			newQuote.MarketReferenceValores__c = quoteConfigs.textMarketReference;
			newQuote.Coproduct_Recov__c = Decimal.valueOf(quoteConfigs.coproductRecov);
			newQuote.Additional_Cost_porcentaje__c = Decimal.valueOf(quoteConfigs.additionalCostPercentage);
			newQuote.Codigo_Cotizador__c = quoteConfigs.quoteCode;
			if (quoteConfigs.convertionCurrency != null) {
				newQuote.Precio_dolar__c = Decimal.valueOf(quoteConfigs.convertionCurrency);
			}
			newQuote.Moneda__c = quoteConfigs.currentCurrency;
			// Dates
			newQuote.Corn_date__c = quoteConfigs.cornDate;
			newQuote.Basis_date__c = quoteConfigs.basisDate;
			newQuote.Fx__c = quoteConfigs.fxDate;
			newQuote.Gas__c = quoteConfigs.gasDate;
			System.debug(1);
			// Inflation
			newQuote.Inflation__c = Decimal.valueOf(quoteConfigs.inflation);
			// Datasets
			newQuote.leftDataset__c = quoteConfigs.leftDataset;
			newQuote.rightDataset__c = quoteConfigs.rightDataset;
			System.debug(1);

			if (newQuoteModel.listaOracle != null) {
				System.debug('===START_newQuoteModel.listaOracle===');
				System.debug(newQuoteModel.listaOracle);
				System.debug('===END_newQuoteModel.listaOracle===');
				Pricebook2[] quotePricebook = [
					SELECT Id, External_Id__c
					FROM Pricebook2
					WHERE Id = :newQuoteModel.listaOracle AND From_Oracle__c = TRUE AND isStandard = FALSE
				];
				System.debug('===START_QUOTE_PRICEBOOK===');
				System.debug(quotePricebook);
				System.debug('===END_QUOTE_PRICEBOOK===');
				if (quotePricebook.size() > 0) {
					if (quotePricebook[0].External_Id__c != null) {
						newQuote.Lista_Oracle__c = quotePricebook[0].Id;
					}
				}
			}

			Opportunity opp = [
				SELECT Id, Quote_Version__c, AccountId
				FROM Opportunity
				WHERE Id = :newQuoteModel.opportunityId
			];

			newQuote.QuoteAccountId = opp.AccountId;

			upsert newQuote Codigo_Cotizador__c;
			System.debug(1);
			System.debug(opp);
			if (opp.Quote_Version__c != null) {
				opp.Quote_Version__c = opp.Quote_Version__c + 1;
			} else {
				List<Quote> quoteList = [SELECT Id FROM Quote WHERE OpportunityId = :newQuoteModel.opportunityId];
				opp.Quote_Version__c = quoteList.size() + 1;
			}
			System.debug(1);
			update opp;
			System.debug(1);

			return newQuote.Id + '-' + standardPricebook;
		} catch (Exception e) {
			throw new AuraHandledException(e.getMessage());
		}
	}

	// Crea registros para las partidas de cotizacion del cotizador de manufacturados
	@AuraEnabled(cacheable=false)
	public static String createManufacturedQuoteItem(
		String quoteId,
		String pricebookId,
		List<QuoteItemModel> newQuoteItemList
	) {
		try {
			System.debug('===START_1===');
			System.debug(quoteId);
			System.debug(pricebookId);
			System.debug(newQuoteItemList);
			System.debug('===END_1===');
			List<QuoteLineitem> newQuoteItems = new List<QuoteLineitem>();
			for (QuoteItemModel qi : newQuoteItemList) {
				QuoteLineItem newQuoteItem = new QuoteLineItem();
				List<PricebookEntry> pricebookEntryId = [
					SELECT id
					FROM PricebookEntry
					WHERE Product2Id = :qi.productId AND Pricebook2Id = :pricebookId
					LIMIT 1
				];
				newQuoteItem.Cotizado__c = true;
				newQuoteItem.product2Id = qi.productId;
				newQuoteItem.quoteId = quoteId;
				if (qi.volume != null) {
					newQuoteItem.quantity = Decimal.valueOf(qi.volume);
				}
				if (qi.volume != null) {
					newQuoteItem.volumen__c = Decimal.valueOf(qi.volume);
				}
				newQuoteItem.Almacen_de_Recibo_Almex__c = qi.storage;
				newQuoteItem.Transportation_Method__c = qi.transportation;
				newQuoteItem.Customer_Site_Name__c = qi.customerSiteName;
				if (qi.totalProductCost != null) {
					newQuoteItem.unitPrice = Decimal.valueOf(qi.totalProductCost);
				}
				if (qi.totalProductCost != null) {
					newQuoteItem.Total_Cost_USD_MT__c = Decimal.valueOf(qi.totalProductCost);
				}
				if (qi.marginManufactured != null) {
					newQuoteItem.Margin_manufacturado__c = Decimal.valueOf(qi.marginManufactured);
				}
				if (qi.labAlmex != null) {
					newQuoteItem.LAB_Almex__c = Decimal.valueOf(qi.labAlmex);
				}
				if (qi.mxpMt != null) {
					newQuoteItem.Freight_MXN__c = Decimal.valueOf(qi.mxpMt);
				}
				if (qi.usdMt != null) {
					newQuoteItem.Freight_USD__c = Decimal.valueOf(qi.usdMt);
				}
				if (qi.labClient != null) {
					newQuoteItem.LAB_client__c = Decimal.valueOf(qi.labClient);
				}
				if (qi.labClient != null) {
					newQuoteItem.Precio_facturado__c = Decimal.valueOf(qi.labClient);
				}
				if (qi.factor1Breakdown != null) {
					newQuoteItem.Factor1Breakdown__c = Decimal.valueOf(qi.factor1Breakdown);
				}
				if (qi.factor2Breakdown != null) {
					newQuoteItem.Factor2Breakdown__c = Decimal.valueOf(qi.factor2Breakdown);
				}
				if (qi.monthVolume != null) {
					newQuoteItem.Month_Volume__c = Decimal.valueOf(qi.monthVolume);
				}
				if (qi.finalFreight != null) {
					newQuoteItem.Flete_con_Ajuste__c = Decimal.valueOf(qi.finalFreight);
				}
				if (qi.freightAddition != null) {
					try {
						newQuoteItem.Ajuste_a_Flete__c = Decimal.valueOf(qi.freightAddition);
					} catch (Exception e) {
						newQuoteItem.Ajuste_a_Flete__c = 0;
					}
				}
				if (qi.freightCost != null) {
					newQuoteItem.freightCost__c = Decimal.valueOf(qi.freightCost);
				}
				if (pricebookEntryId.size() > 0) {
					newQuoteItem.pricebookEntryId = pricebookEntryId.get(0).Id;
				} else {
					PricebookEntry newPricebookEntry = new PricebookEntry();
					newPricebookEntry.Product2Id = qi.productId;
					newPricebookEntry.Pricebook2Id = pricebookId;
					newPricebookEntry.UnitPrice = Decimal.valueOf(qi.totalProductCost);
					newPricebookEntry.IsActive = true;
					insert newPricebookEntry;
					newQuoteItem.pricebookEntryId = newPricebookEntry.Id;
				}
				newQuoteItems.add(newQuoteItem);
			}
			insert newQuoteItems;

			ETC_QuoteToPricebookController.createDeliveryProducts(quoteId);

			String recordUrl = URL.getOrgDomainUrl().toExternalForm() + '/' + quoteId;
			return recordUrl;
		} catch (Exception e) {
			System.debug('===START_e===');
			System.debug(e.getMessage());
			System.debug('===END_e===');
			Quote quoteRecord = [SELECT Id FROM Quote WHERE Id = :quoteId];
			delete quoteRecord;
			throw new AuraHandledException(e.getMessage());
		}
	}
}