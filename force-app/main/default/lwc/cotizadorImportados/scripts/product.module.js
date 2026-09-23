import { round, truncate } from "./utils";

export class PlantProduct {
	#id;
	#unitMeasure;
	#incrementalDates;
	#haveIncrementalCost;
	volume = 0;
	productId = "";
	productDescription = "";
	storage = "";
	customerSiteName = "";
	customerSiteId = "";
	customerSiteCity = "";
	customerSiteState = "";
	transportation = "";
	tons = 0;
	deliveryCost = 0;
	productShareholdersCost = 0;
	railroadCost = 0;
	importExpensesAlmidon = 0;
	transferImportExpPacking = 0;
	profitMarginPercentage = 0;
	isotank = 0;
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
	// flete
	convertionPrice = 0;
	realConvertionPrice = 0;
	// litros
	densidadMark20C = 0;
	volumenLtGalon = 0;
	literOutput = "lt";

	constructor({
		id,
		unitMeasure,
		incrementalDates,
		haveIncrementalCost,
		productId = "",
		densidadMark20C,
		volumenLtGalon
	}) {
		this.#id = `product_${id}`;
		this.#unitMeasure = unitMeasure;
		this.#incrementalDates = incrementalDates;
		this.#haveIncrementalCost = haveIncrementalCost;
		this.incrementalCost = haveIncrementalCost === "yes" ? 1.5 : 0;
		this.productId = productId;
		this.densidadMark20C = densidadMark20C;
		this.volumenLtGalon = volumenLtGalon;
	}

	fill(qli) {
		// console.log("===========+++++++++++++++++++++++++++++===========");
		// console.log(qli);
		// console.log("===========+++++++++++++++++++++++++++++===========");
		this.literOutput = qli.literOutput__c;
		this.volume = qli.Volumen__c;
		this.storage = qli.Almacen_de_Recibo_Almex__c;
		this.customerSiteName = qli.Customer_Site_Name__r.Id;
		this.customerSiteId = qli.Customer_Site_Name__r.Ship_to_ID__c; // pendiente
		this.customerSiteCity = qli.Customer_Site_Name__r.Datos_de_direccion__City__s; // pendiente Datos_de_direccion__City__s
		this.customerSiteState = qli.Customer_Site_Name__r.Datos_de_direccion__c.state;
		this.transportation = qli.Transportation_Method__c;
		this.tons = qli.Tons__c;
		this.deliveryCost = qli.Flete_de_Salida_a_Cliente_OUTBOUND__c;
		this.productShareholdersCost = qli.Costo_Producto_USD_Shareholders__c;
		this.railroadCost = qli.Flete_de_Entrada_Railroad__c;
		this.importExpensesAlmidon = qli.Costos_Operativos__c;
		this.transferImportExpPacking = qli.Costos_Operativos_ImportExp__c;
		this.profitMarginPercentage = qli.Profit_Margin_porcentaje__c;
		this.isotank = qli.Costos_Operativos_Isotank__c;
		this.clientPortals = qli.Costos_Operativos_Portales_Clientes__c;
		this.storageDry = qli.Costos_Operativos_almacenaje_seco__c;
		this.finantialCostRate = qli.Financial_Costs_Rate__c;
		this.incrementalCost = qli.Incremental_Costs_Rebate_Porcentage__c;
		this.productCostInput = qli.Total_Costo_de_Producto__c;
		this.movement = qli.Movimiento__c;
		this.currentCurrency = qli.Moneda__c.toLowerCase();
		this.convertionCurrency = qli.Precio_dolar__c;
		if (qli.Densidad_Merk_20C__c) {
			this.densidadMark20C = qli.Densidad_Merk_20C__c;
		}
		if (qli.Volumen_Lt_Galon__c) {
			this.volumenLtGalon = qli.Volumen_Lt_Galon__c;
		}
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
		return !this.movement || this.movement === "2";
	}

	set unitMeasure(value) {
		this.#unitMeasure = value;
	}

	set updateDeliveryCost(value) {
		if (this.#unitMeasure == "mt") {
			this.realConvertionPrice = value;
			this.convertionPrice = round(value, 4, true);
		} else if (this.#unitMeasure == "kg") {
			this.realConvertionPrice = value / 1000;
			this.convertionPrice = round(value / 1000, 4, true);
		} else if (this.#unitMeasure == "lt") {
			this.realConvertionPrice = value;
			this.convertionPrice = round(value, 4, true);
		}
		this.freightCost = this.tons;
	}

	set freightCost(value) {
		if (this.#unitMeasure === "lt") {
			this.deliveryCost = round(this.convertionPrice / value, 4, true);
		} else {
			this.deliveryCost = round(this.convertionPrice / value, 4, true);
		}
	}

	set haveIncrementalCost(value) {
		this.#haveIncrementalCost = value;
	}

	get billedPrice() {
		let incremental = 0;
		if (this.#haveIncrementalCost) {
			incremental += Number(this.incrementalCostCalc);
		}
		if (Number(this.#incrementalDates) > 0) {
			incremental += Number(this.finantialCost);
		}
		const total = Number(this.almexPriceWarehouse) + incremental;
		return truncate(total, 3, 4);
	}

	get almexPriceWarehouse() {
		// Si es lt y el output es kg entonces la formula cambia levemente dividiendo el this.densidadMark20C
		const total = Number(this.deliveryCost) + Number(this.totalProductCost) + Number(this.totalOperativeCost);
		if (this.#unitMeasure === "lt" && this.literOutput == "kg") {
			return roundAndAddZeros(total / Number(this.densidadMark20C), 4);
		}
		return roundAndAddZeros(total, 4);
	}

	get labTransferPrice() {
		const result = Number(this.almexPriceWarehouse) - Number(this.deliveryCost);
		return roundAndAddZeros(result, 4);
	}

	get realLiterProductCost() {
		return this.productShareholdersCost / this.volumenLtGalon;
	}

	get productCost() {
		if (this.#unitMeasure === "mt") {
			if (this.currentCurrency.toLocaleLowerCase() == "usd") {
				return roundAndAddZeros(this.productShareholdersCost * 22.0458, 4);
			}
			return roundAndAddZeros(this.productShareholdersCost * 22.0458 * this.convertionCurrency, 4);
		} else if (this.#unitMeasure === "kg") {
			if (this.currentCurrency.toLocaleLowerCase() == "usd") {
				return roundAndAddZeros((this.productShareholdersCost / 1000) * 22.0458, 4);
			}
			return roundAndAddZeros((this.productShareholdersCost / 1000) * 22.0458 * this.convertionCurrency, 4);
		} else {
			if (this.currentCurrency.toLocaleLowerCase() == "usd") {
				return roundAndAddZeros(this.realLiterProductCost, 4);
			}
			return roundAndAddZeros(this.realLiterProductCost * this.convertionCurrency, 4);
		}
	}

	get literProductCost() {
		const result = (this.realLiterProductCost / Number(this.densidadMark20C)) * 1000;
		return roundAndAddZeros(result, 4);
	}

	get transferStationCost() {
		const result = (Number(this.literProductCost) + Number(this.railroadCost)) / 1000;
		return roundAndAddZeros(result, 4);
	}

	get totalBuildingCost() {
		if (this.#unitMeasure === "lt") {
			const result = Number(this.transferStationCost) + Number(this.transferImportExpPacking);
			return roundAndAddZeros(result, 3);
		} else {
			const total =
				Number(this.productCost) +
				Number(this.railroadCost) +
				Number(this.importExpensesAlmidon) +
				Number(this.transferImportExpPacking);
			const result = total;
			if (this.#unitMeasure === "mt") {
				// redondear con 2 decimales
				return roundAndAddZeros(result, 2);
			} else {
				// redondear con 3 decimales
				return roundAndAddZeros(result, 3);
			}
		}
	}

	get profitMargin() {
		const total =
			(Number(this.totalBuildingCost) + Number(this.totalOperativeCost)) *
			getPercentage(this.profitMarginPercentage);
		const result = total;
		if (this.#unitMeasure === "mt") {
			return roundAndAddZeros(result, 2);
		} else {
			return roundAndAddZeros(result, 3);
		}
	}

	set totalProductCost(value) {
		this.productCostInput = value;
		if (value > 0) {
			let total = 0;
			if (this.#unitMeasure === "lt") {
				total = Number(value) / this.densidadMark20C;
			} else {
				total = Number(value);
			}
			this.profitMarginPercentage = roundAndAddZeros(
				((total - Number(this.totalBuildingCost)) /
					(Number(this.totalBuildingCost) + Number(this.totalOperativeCost))) *
					100,
				2
			);
		} else {
			this.profitMarginPercentage = 0;
			if (this.#unitMeasure === "lt") {
				this.productCostInput = roundAndAddZeros(
					(Number(this.totalBuildingCost) + Number(this.profitMargin)) * this.densidadMark20C,
					4
				);
			} else {
				this.productCostInput = roundAndAddZeros(Number(this.totalBuildingCost) + Number(this.profitMargin), 4);
			}
		}
	}

	get totalProductCost() {
		if (Number(this.productCostInput) > 0) {
			return this.productCostInput;
		}
		if (this.#unitMeasure === "lt") {
			return roundAndAddZeros(
				(Number(this.totalBuildingCost) + Number(this.profitMargin)) * this.densidadMark20C,
				4
			);
		} else {
			return roundAndAddZeros(Number(this.totalBuildingCost) + Number(this.profitMargin), 4);
		}
	}

	get totalOperativeCost() {
		return roundAndAddZeros(Number(this.isotank) + Number(this.clientPortals) + Number(this.storageDry), 4);
	}

	get totalSalesCost() {
		return roundAndAddZeros(Number(this.totalOperativeCost) + Number(this.totalProductCost), 4);
	}

	get realMarginBrute() {
		const firstOperation = Number(this.totalBuildingCost) + Number(this.totalOperativeCost);
		let result = "0";
		if (this.#unitMeasure === "lt") {
			result = Number(this.labTransferPrice) - firstOperation * this.densidadMark20C;
		} else {
			result = Number((Number(this.labTransferPrice) - firstOperation).toFixed(2));
		}
		if (this.currentCurrency.toLowerCase() !== "usd") {
			result = result * this.convertionCurrency;
		}
		return result;
	}

	get marginBrute() {
		return truncate(this.realMarginBrute, 4, 4);
	}

	get marginBruteNetSales() {
		const total = (Number(this.realMarginBrute) / Number(this.labTransferPrice)) * 100;
		const result = total;
		return round(result, 2, true);
	}

	get overhead() {
		if (this.realMarginBrute === "") {
			return roundAndAddZeros(0, 4);
		} else {
			if (this.#unitMeasure === "lt") {
				return roundAndAddZeros(-0.0145, 4);
			}
			return roundAndAddZeros(-9.4, 4);
		}
	}

	get realMarginBeforeTaxes() {
		return Number(this.realMarginBrute) + Number(this.overhead);
	}

	get marginBeforeTaxes() {
		return truncate(this.realMarginBeforeTaxes, 4, 4);
	}

	get netMarginAboutNetSales() {
		const total = (this.realMarginBeforeTaxes / Number(this.labTransferPrice)) * 100;
		const result = total;
		return round(result, 2);
	}

	get ptu() {
		return roundAndAddZeros(-Number(this.marginBeforeTaxes) * 0.1, 4);
	}

	get isr() {
		return roundAndAddZeros(-Number(this.marginBeforeTaxes) * 0.3, 4);
	}

	get netMargin() {
		return roundAndAddZeros(Number(this.marginBeforeTaxes) + Number(this.ptu) + Number(this.isr), 4);
	}

	get incrementalCostCalc() {
		const total = Number(this.totalSalesCost) * getPercentage(Number(this.incrementalCost));
		const result = total;
		// if (this.#unitMeasure === "lt") {
		// 	return roundAndAddZeros(result, 2);
		// } else {
		// }
		return truncate(result, 3, 4);
	}

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

	get finantialCost() {
		const total =
			Number(this.exwIncrementals) * getPercentage(this.finantialCostRate / 360) * Number(this.#incrementalDates);
		const result = total;
		// if (this.#unitMeasure === "mt") {
		// 	return roundAndAddZeros(result, 2);
		// } else {
		// }
		return truncate(result, 3, 4);
	}

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
			isOil: false,
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
			finantialCostRate: this.finantialCostRate,
			deliveryCurrency: this.deliveryCurrency,
			deliveryCost: this.deliveryCost,
			systemDeliveryCost: this.systemDeliveryCost,
			convertionPrice: this.convertionPrice,
			densidadMark20C: this.densidadMark20C,
			volumenLtGalon: this.volumenLtGalon,
			transferStationCost: this.transferStationCost,
			literProductCost: this.literProductCost,
			literOutput: this.literOutput
		};
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