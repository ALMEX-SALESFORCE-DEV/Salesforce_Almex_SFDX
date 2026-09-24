import { generateUniqueId, round } from "../scripts/utils.js";

class BreakdownClass {
	#id = generateUniqueId();
	basis = 0;
	gas = 0;
	cornPricePerBushelUSD = 0;
	exchangeRate = 0;
	month = "";
	sellingPriceLabAlmexUSDPerMT = 0; // - [x] cambiar exwUsd
	netCornCostUSDFixed = 0; // x
	cogsVariableUSD = 0; // x
	cogsFixedUSD = 0; // x
	sgaExpensesUSD = 0; // - [x] cambiar
	coproductRecov = 0; // - [x] cambair
	factor1Breakdown = 0;
	factor2Breakdown = 0;
	netCornFijo = 0;
	cogsUsdVariableFijo = 0;
	cogsUsdFijo = 0;
	cogsUsdFormulaFijo = 0; // x

	// Nuevas variables
	inflation = 0; // Inflación representada en numero entero 10, 23

	constructor(supplies) {
		if (supplies) {
			// supplies
			this.basis = supplies.Basis__c;
			this.gas = supplies.Gas__c;
			this.cornPricePerBushelUSD = supplies.Corn__c;
			this.exchangeRate = supplies.Fx__c;
			this.month = supplies.Mes_ormula__c;
			// updates
			this.updateQuotes(supplies);
			if (supplies?.productInfo) {
				// console.log(supplies.productInfo);
				this.factor1Breakdown = Number(supplies.productInfo.Factor1Breakdown__c) || 0;
				this.factor2Breakdown = Number(supplies.productInfo.Factor2Breakdown__c) || 0;
				this.cogsVariableUSD = Number(supplies.productInfo.Cogs_Usd_Variable_Fijo__c) || 0;
				this.cogsFixedUSD = Number(supplies.productInfo.Cogs_Usd_Fijo__c) || 0;
				this.netCornCostUSDFixed = Number(supplies.productInfo.Net_Corn_Fijo__c) || 0;
				this.cogsUsdFormulaFijo = Number(supplies.productInfo.Cogs_Usd_Formula_Fijo__c) || 0;
			}
		}
	}

	fill(breakdown) {
		this.basis = breakdown.original.basis;
		this.gas = breakdown.original.gas;
		this.cornPricePerBushelUSD = breakdown.original.cornPricePerBushelUSD;
		this.exchangeRate = breakdown.original.exchangeRate;
		this.month = breakdown.original.month;
		this.sellingPriceLabAlmexUSDPerMT = breakdown.original.sellingPriceLabAlmexUSDPerMT;
		this.netCornCostUSDFixed = breakdown.original.netCornCostUSDFixed;
		this.cogsVariableUSD = breakdown.original.cogsVariableUSD;
		this.cogsFixedUSD = breakdown.original.cogsFixedUSD;
		this.sgaExpensesUSD = breakdown.original.sgaExpensesUSD;
		this.coproductRecov = breakdown.original.coproductRecov;
		this.factor1Breakdown = breakdown.original.factor1Breakdown;
		this.factor2Breakdown = breakdown.original.factor2Breakdown;
		this.cogsUsdFormulaFijo = breakdown.original.cogsUsdFormulaFijo;
		this.inflation = breakdown.original.inflation || 0;
	}

	get id() {
		return this.#id;
	}

	/* Valor del sga usd sumado al valor del input de inflacion */
	get sgaExpensesUSDWithInflation() {
		return this.sgaExpensesUSD * (1 + this.inflation / 100);
	}

	/*
  Valor del cogs fijo sumado al valor del input de inflación
  */
	get cogsFixedWithInflation() {
		return this.cogsFixedUSD * (1 + this.inflation / 100);
	}

	get netCornCostUSD() {
		// cambiar el .3
		/**
		 * El valor de this.cornPricePerBushelUSD cuando es actualizado se transforma en un string
		 * es por esto que es necesario convertirlo a un flotante (con decimales)
		 * de no hacerlo, la formula regresa NaN como valor
		 */
		return +(
			(((parseFloat(this.cornPricePerBushelUSD) + parseFloat(this.basis)) * 39.37 * (1 - this.coproductRecov)) /
				this.factor1Breakdown) *
			this.factor2Breakdown
		);
	}

	// Se debe ver impactado por el input de la inflación
	// Quedando la formula como (operacion)
	get cogsUsdGlobal() {
		const newCogsUsdGlobal = this.cogsVariableUSD + this.cogsUsd;
		// Valor que representa el porcentaje en decimal como 10 = .1
		const decimalInflation = this.inflation / 100;
		return newCogsUsdGlobal + newCogsUsdGlobal * decimalInflation;
	}

	get netCornCostUsdGlobal() {
		return this.netCornCostUSDFixed + this.netCornCostUSD;
	}

	get cogsUsd() {
		return (this.gas * this.cogsUsdFormulaFijo) / ((1995 * 360) / 12);
	}

	get variableMargin() {
		return this.sellingPriceLabAlmexUSDPerMT - this.netCornCostUSD - this.netCornCostUSDFixed - this.cogsUsdGlobal;
	}

	get directMargin() {
		return this.variableMargin - this.cogsFixedWithInflation;
	}

	get directMarginPercentage() {
		const result = (this.directMargin / this.sellingPriceLabAlmexUSDPerMT) * 100;
		return result !== Infinity && result !== -Infinity ? result : 0;
	}

	get pbitUSD() {
		return this.directMargin - this.sgaExpensesUSDWithInflation;
	}

	get pbitPercentage() {
		const result = (this.pbitUSD / this.sellingPriceLabAlmexUSDPerMT) * 100;
		return result !== Infinity && result !== -Infinity ? result : 0;
	}

	get monthlyCostUSDPerMT() {
		return (
			+this.netCornCostUSD +
			this.netCornCostUSDFixed +
			this.cogsUsdGlobal +
			this.cogsFixedWithInflation +
			this.sgaExpensesUSDWithInflation
		);
	}

	get netCornCostPerBushelUSD() {
		return (+this.netCornCostUSD + this.netCornCostUSDFixed) / 39.37;
	}

	get cogsVariablePerBushelUSD() {
		return (+this.cogsUsd + this.cogsVariableUSD) / 39.37;
	}

	get cogsFixedPerBushelUSD() {
		return this.cogsFixedWithInflation / 39.37;
	}

	updateQuotes(update) {
		this.sgaExpensesUSD = Number(update.sgaUsd);
		this.coproductRecov = Number(update.coproductRecov) / 100;
		this.sellingPriceLabAlmexUSDPerMT = Number(update.exwUsd);
	}

	// Metodo que se encarga de actualizar la inflación dentro de la clase
	updateInflation(newValue) {
		this.inflation = newValue;
	}

	toJson() {
		const data = {
			basis: this.basis,
			gas: this.gas,
			cornPricePerBushelUSD: this.cornPricePerBushelUSD,
			exchangeRate: this.exchangeRate,
			month: this.month,
			sellingPriceLabAlmexUSDPerMT: this.sellingPriceLabAlmexUSDPerMT,
			netCornCostUSDFixed: this.netCornCostUSDFixed,
			cogsVariableUSD: this.cogsVariableUSD,
			cogsFixedUSD: this.cogsFixedUSD,
			sgaExpensesUSD: this.sgaExpensesUSD,
			netCornCostUSD: this.netCornCostUSD,
			cogsUsd: this.cogsUsd,
			variableMargin: this.variableMargin,
			directMargin: this.directMargin,
			directMarginPercentage: this.directMarginPercentage,
			pbitUSD: this.pbitUSD,
			pbitPercentage: this.pbitPercentage,
			monthlyCostUSDPerMT: this.monthlyCostUSDPerMT,
			netCornCostPerBushelUSD: this.netCornCostPerBushelUSD,
			cogsVariablePerBushelUSD: this.cogsVariablePerBushelUSD,
			cogsFixedPerBushelUSD: this.cogsFixedPerBushelUSD,
			coproductRecov: this.coproductRecov,
			cogsUsdGlobal: this.cogsUsdGlobal,
			netCornCostUsdGlobal: this.netCornCostUsdGlobal,
			factor1Breakdown: this.factor1Breakdown,
			factor2Breakdown: this.factor2Breakdown,
			cogsUsdFormulaFijo: this.cogsUsdFormulaFijo,
			inflation: this.inflation,
			cogsFixedWithInflation: this.cogsFixedWithInflation,
			sgaExpensesUSDWithInflation: this.sgaExpensesUSDWithInflation
		};

		return {
			id: this.id,
			...data,
			cornPricePerBushelUSD: round(this.cornPricePerBushelUSD, 4),
			exchangeRate: round(this.exchangeRate, 2),
			sellingPriceLabAlmexUSDPerMT: round(this.sellingPriceLabAlmexUSDPerMT, 2),
			netCornCostUSDFixed: round(this.netCornCostUSDFixed, 2),
			cogsVariableUSD: this.cogsVariableUSD.toFixed(2),
			cogsFixedUSD: round(this.cogsFixedUSD, 2),
			sgaExpensesUSD: round(this.sgaExpensesUSD, 2),
			netCornCostUSD: round(this.netCornCostUSD, 2),
			cogsUsd: round(this.cogsUsd, 2),
			variableMargin: round(this.variableMargin, 2),
			directMargin: round(this.directMargin, 2),
			directMarginPercentage: round(this.directMarginPercentage, 0),
			pbitUSD: round(this.pbitUSD, 2),
			pbitPercentage: round(this.pbitPercentage, 0),
			monthlyCostUSDPerMT: round(this.monthlyCostUSDPerMT, 2),
			netCornCostPerBushelUSD: round(this.netCornCostPerBushelUSD, 2),
			cogsVariablePerBushelUSD: round(this.cogsVariablePerBushelUSD, 2),
			cogsFixedPerBushelUSD: round(this.cogsFixedPerBushelUSD, 2),
			cogsUsdGlobal: round(this.cogsUsdGlobal, 2),
			netCornCostUsdGlobal: round(this.netCornCostUsdGlobal, 2),
			factor1Breakdown: this.factor1Breakdown,
			factor2Breakdown: this.factor2Breakdown,
			cogsUsdFormulaFijo: this.cogsUsdFormulaFijo,
			cogsFixedWithInflation: round(this.cogsFixedWithInflation, 2),
			sgaExpensesUSDWithInflation: round(this.sgaExpensesUSDWithInflation, 2),
			inflation: this.inflation,
			original: data
		};
	}
}

export default BreakdownClass;