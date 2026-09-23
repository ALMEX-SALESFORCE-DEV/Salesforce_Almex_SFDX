import { round, truncate } from "./utils";

export class PlantProduct {
	#id;
	#unitMeasure;
	// #incrementalDates;
	#haveIncrementalCost;
	volume = 0;
	productId = "";
	productDescription = "";
	storage = "";
	customerSiteName = "";
	customerSiteId = "";
	customerSiteCity = "";
	transportation = "";
	tons = 0;
	deliveryCost = 0;
	productShareholdersCost = 0;
	railroadCost = 0;
	importExpensesAlmidon = 0;
	transferImportExpPacking = 0;
	profitMarginPercentage = 0;
	clientPortals = 0;
	storageDry = 0;
	incrementalCost = 0;
	finantialCostRate = 0;
	productCostInput = 0;
	movement = "";
	currentCurrency = "usd";
	deliveryCurrency = "";
	convertionCurrency = 1;
	systemDeliveryCost = 0;
	productCode = "";
	sgALtC = 0;
	sgAKgC = 0;
	costoEstandarPC = 0;
	factorDeConversionKgC = 0;
	factorDeConversionC = 0;
	unidadDeMedidaC = "";
	almexPriceWarehouse = 0;
	incrementalCostCalc = 0;
	finantialCost = 0;
	// Flete calculo
	shippingCostsPerLotSize = 0;
	customerSiteState = "";
	convertionPrice = 0;
	realConvertionPrice = 0;

	constructor({ id, unitMeasure, haveIncrementalCost, productId = "", product }) {
		this.#id = `product_${id}`;
		this.#unitMeasure = unitMeasure;
		// this.#incrementalDates = incrementalDates;
		this.#haveIncrementalCost = haveIncrementalCost;
		this.incrementalCost = haveIncrementalCost === "yes" ? 1.5 : 0;
		this.productId = productId;
		// this.productCode = product.ProductCode;
		this.sgALtC = product.SG_A_LT__c;
		this.sgAKgC = product.SG_A_KG__c;
		this.costoEstandarPC = product.Costo_estandar_P__c;
		this.factorDeConversionKgC = product.Factor_de_conversion_kg__c;
		this.factorDeConversionC = product.Factor_de_conversion__c;
		this.unidadDeMedidaC = product.Unidad_de_medida__c;
	}

	fill(qli) {
		this.volume = qli.Volumen__c;
		this.storage = qli.Almacen_de_Recibo_Almex__c;
		this.customerSiteName = qli.Customer_Site_Name__r.Id;
		this.customerSiteId = qli.Customer_Site_Name__r.Ship_to_ID__c;
		this.customerSiteCity = qli.Customer_Site_Name__r.Datos_de_direccion__City__s;
		this.customerSiteState = qli.Customer_Site_Name__r.Datos_de_direccion__c.state;
		this.transportation = qli.Transportation_Method__c;
		this.tons = qli.Tons__c;
		this.deliveryCost = qli.Flete_de_Salida_a_Cliente_OUTBOUND__c;
		this.productShareholdersCost = qli.Costo_Producto_USD_Shareholders__c;
		this.railroadCost = qli.Flete_de_Entrada_Railroad__c;
		this.importExpensesAlmidon = qli.Costos_Operativos__c;
		this.transferImportExpPacking = qli.Costos_Operativos_ImportExp__c;
		this.profitMarginPercentage = qli.Profit_Margin_porcentaje__c;
		this.clientPortals = qli.Costos_Operativos_Portales_Clientes__c;
		this.storageDry = qli.Costos_Operativos_almacenaje_seco__c;
		this.incrementalCostCalc = qli.Incremental_Costs_Rebate__c;
		this.finantialCost = qli.Financial_Costs_Rate__c;
		this.incrementalCost = qli.Incremental_Costs_Rebate_Porcentage__c;
		this.productCostInput = qli.Total_Costo_de_Producto__c;
		this.movement = qli.Movimiento__c;
		if (qli.Moneda__c) {
			this.currentCurrency = qli.Moneda__c.toLowerCase();
		}
		this.convertionCurrency = qli.Monto_conversion__c;
		this.shippingCostsPerLotSize = qli.Shipping_Costs_per_Lot_Size__c;
		this.almexPriceWarehouse = qli.Customer_Delivered_Price__c;
		if (qli.Flete_Convertido__c) {
			this.realConvertionPrice = qli.Flete_Convertido__c;
			this.convertionPrice = qli.Flete_Convertido__c;
		}
		if (qli.deliveryCurrency__c) {
			this.deliveryCurrency = qli.deliveryCurrency__c.toLowerCase();
		}
		if (qli.systemDeliveryCost__c) {
			this.systemDeliveryCost = qli.systemDeliveryCost__c;
		}
	}

	get id() {
		return this.#id;
	}

	get transporActive() {
		return !this.movement || this.movement === "2" || this.movement === "-";
	}

	set unitMeasure(value) {
		this.#unitMeasure = value;
	}

	set updateDeliveryCost(value) {
		console.log(value);
		if (this.#unitMeasure == "mt") {
			this.realConvertionPrice = value;
			this.convertionPrice = round(value, 3, true);
		} else if (this.#unitMeasure == "kg") {
			this.realConvertionPrice = value / 1000;
			this.convertionPrice = round(value / 1000, 3, true);
		}
		this.freightCost = this.tons;
	}

	set freightCost(value) {
		this.deliveryCost = round(this.convertionPrice / value, 3, true);
	}

	set haveIncrementalCost(value) {
		this.#haveIncrementalCost = value;
	}

	get shippingCostsPerLotSizeF() {
		let result = 0;
		if (this.currentCurrency === "mxn") {
			result = this.shippingCostsPerLotSize;
		} else {
			result = this.shippingCostsPerLotSize / Number(this.convertionCurrency);
		}
		return round(result, 4, true, 4);
	}

	get referenceCurrency() {
		return round(Number(this.convertionCurrency), 2);
	}

	get fleteDeSalidaAClienteOutbound() {
		if (this.movement === "2") return 0;
		let result = this.shippingCostsPerLotSizeF / this.tons;
		return round(result, 4, true, 4);
	}

	get billedPrice() {
		let incremental = 0;
		if (this.#haveIncrementalCost) {
			incremental += Number(this.incrementalCostCalc);
		}
		incremental += Number(this.finantialCost);
		const total = Number(this.almexPriceWarehouse) + incremental;
		return truncate(total, 3, 4);
	}

	// get almexPriceWarehouse() {
	// 	const total = Number(this.deliveryCost) + Number(this.totalProductCost) + Number(this.totalOperativeCost);
	// 	return roundAndAddZeros(total, 4);
	// }

	get labTransferPrice() {
		const result = Number(this.almexPriceWarehouse) - Number(this.deliveryCost);
		return roundAndAddZeros(result, 4);
	}

	get productCost() {
		if (this.#unitMeasure === "mt") {
			return roundAndAddZeros(this.productShareholdersCost * 22.0458 * this.convertionCurrency, 4);
		} else {
			return roundAndAddZeros(this.productShareholdersCost * 1000 * 22.0458 * this.convertionCurrency, 4);
		}
	}

	get totalBuildingCost() {
		const total = Number(this.productCostF) + Number(this.railroadCost) + Number(this.transferImportExpPacking);
		const result = total;
		if (this.#unitMeasure === "mt") {
			// redondear con 2 decimales
			return roundAndAddZeros(result, 2);
		} else {
			// redondear con 3 decimales
			return roundAndAddZeros(result, 3);
		}
	}

	get profitMargin() {
		let result = Number(this.totalBuildingCost) * Number(this.profitMarginPercentage);
		if (this.#unitMeasure === "mt") {
			return round(result, 2, true, 4);
		} else {
			return round(result, 3, true, 4);
		}
	}

	set totalProductCost(value) {
		this.productCostInput = value;
		if (value > 0) {
			this.profitMarginPercentage = roundAndAddZeros(
				(value - this.totalBuildingCost) / this.totalBuildingCost,
				2
			);
		} else {
			this.profitMarginPercentage = 0;
			this.productCostInput = roundAndAddZeros(Number(this.totalBuildingCost) + Number(this.profitMargin), 4);
		}
	}

	get totalProductCost() {
		if (Number(this.productCostInput) > 0) {
			return this.productCostInput;
		}
		return roundAndAddZeros(Number(this.totalBuildingCost) + Number(this.profitMargin), 4);
	}

	get totalOperativeCost() {
		return roundAndAddZeros(Number(this.clientPortals) + Number(this.storageDry), 4);
	}

	get totalSalesCost() {
		return roundAndAddZeros(Number(this.totalOperativeCost) + Number(this.totalProductCost), 4);
	}

	get marginBrute() {
		const result = Number(this.labTransferPrice) - Number(this.totalSalesCost);
		return result;
	}

	get marginBruteNetSales() {
		const total = (Number(this.marginBrute) / Number(this.labTransferPrice)) * 100;
		return total.toFixed(2);
	}

	get overhead() {
		if (this.#unitMeasure === "kg") {
			return round(this.sgAKgC, 4, true);
		} else {
			return round(this.sgALtC, 4, true);
		}
	}

	get marginBeforeTaxes() {
		return roundAndAddZeros(Number(this.marginBrute) + Number(this.overhead), 4);
	}

	get netMarginAboutNetSales() {
		const total = (Number(this.marginBeforeTaxes) / Number(this.labTransferPrice)) * 100;
		const result = total;
		return result.toFixed(2);
	}

	get ptu() {
		return -Number(this.marginBeforeTaxes) * 0.1;
	}

	get ptuView() {
		return truncate(-Number(this.marginBeforeTaxes) * 0.1, 4, 4);
	}

	get isr() {
		return roundAndAddZeros(-Number(this.marginBeforeTaxes) * 0.3, 4);
	}

	get netMargin() {
		return truncate(Number(this.marginBeforeTaxes) + Number(this.ptu) + Number(this.isr), 4, 4);
	}

	// get incrementalCostCalc() {
	// 	const total = Number(this.totalSalesCost) * getPercentage(Number(this.incrementalCost));
	// 	const result = total;
	// 	if (this.#unitMeasure === "mt") {
	// 		return roundAndAddZeros(result, 2);
	// 	} else {
	// 		return roundAndAddZeros(result, 3);
	// 	}
	// }

	get exwIncrementals() {
		if (this.#haveIncrementalCost === "no") {
			return this.almexPriceWarehouse;
		} else {
			const total = Number(this.almexPriceWarehouse) + Number(this.incrementalCostCalc);
			const result = total;
			// if (this.#unitMeasure === "mt") {
			// 	return roundAndAddZeros(result, 2);
			// } else {
			// }
			return truncate(result, 3, 4);
		}
	}

	// get finantialCost() {
	// 	const total =
	// 		Number(this.exwIncrementals) * getPercentage(this.finantialCostRate / 360) * Number(this.#incrementalDates);
	// 	const result = total;
	// 	if (this.#unitMeasure === "mt") {
	// 		return roundAndAddZeros(result, 2);
	// 	} else {
	// 		return roundAndAddZeros(result, 3);
	// 	}
	// }

	get exwFinancialCost() {
		const total = Number(this.exwIncrementals) + Number(this.finantialCost);
		const result = total;
		// if (this.#unitMeasure === "mt") {
		// 	return roundAndAddZeros(result, 2);
		// } else {
		// }
		return truncate(result, 3, 4);
	}

	json() {
		return {
			...this,
			id: this.id,
			billedPrice: this.billedPrice,
			almexPriceWarehouse: this.almexPriceWarehouse,
			labTransferPrice: this.labTransferPrice,
			productCost: this.productCost,
			totalBuildingCost: this.totalBuildingCost,
			profitMargin: this.profitMargin,
			totalProductCost: this.totalProductCost,
			totalOperativeCost: this.totalOperativeCost,
			totalSalesCost: this.totalSalesCost,
			marginBrute: this.marginBrute,
			marginBruteNetSales: this.marginBruteNetSales,
			overhead: this.overhead,
			marginBeforeTaxes: this.marginBeforeTaxes,
			netMarginAboutNetSales: this.netMarginAboutNetSales,
			ptu: this.ptu,
			isr: this.isr,
			netMargin: this.netMargin,
			incrementalCostCalc: this.incrementalCostCalc,
			exwIncrementals: this.exwIncrementals,
			finantialCost: this.finantialCost,
			exwFinancialCost: this.exwFinancialCost,
			movement: this.movement,
			currentCurrency: this.currentCurrency,
			convertionCurrency: this.convertionCurrency,
			shippingCostsPerLotSize: this.shippingCostsPerLotSize,
			shippingCostsPerLotSizeF: this.shippingCostsPerLotSizeF,
			fleteDeSalidaAClienteOutbound: this.fleteDeSalidaAClienteOutbound,
			sgALtC: this.sgALtC,
			sgAKgC: this.sgAKgC,
			costoEstandarPC: this.costoEstandarPC,
			factorDeConversionKgC: this.factorDeConversionKgC,
			factorDeConversionC: this.factorDeConversionC,
			unidadDeMedidaC: this.unidadDeMedidaC,
			isOil: true,
			deliveryCurrency: this.deliveryCurrency,
			deliveryCost: this.deliveryCost,
			systemDeliveryCost: this.systemDeliveryCost,
			productCostF: this.productCostF,
			convertionPrice: this.convertionPrice
		};
	}

	get productCostLtF() {
		let result = 0;
		if (this.currentCurrency === "mxn") {
			result = this.costoEstandarPC;
		} else {
			result = this.costoEstandarPC / Number(this.convertionCurrency);
		}
		return result !== Infinity ? result : round(0, 4, true);
	}

	get productCostLtFView() {
		return round(this.productCostLtF, 4, true);
	}

	get productCostF() {
		let result = 0;
		if (this.#unitMeasure.toLocaleLowerCase() === "kg") {
			result = round(this.productCostLtF / this.factorDeConversionKgC, 4, true);
		} else {
			result = round(this.productCostLtF * this.factorDeConversionC, 4, true);
		}
		return result !== Infinity ? result : round(0, 4, true);
	}
}

export function roundAndAddZeros(numero, decimales) {
	try {
		let redondeado = numero.toFixed(decimales);
		while (redondeado.split(".")[1].length < 4) {
			redondeado += "0";
		}
		return redondeado;
	} catch (error) {
		return Number(0).toFixed(decimales);
	}
}

export function getPercentage(value) {
	return Number(value) / 100;
}