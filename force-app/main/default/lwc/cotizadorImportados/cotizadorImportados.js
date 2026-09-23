import { LightningElement, track, api, wire } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { NavigationMixin } from "lightning/navigation";
// import { refreshApex } from "@salesforce/apex";
// import { notifyRecordUpdateAvailable } from "lightning/uiRecordApi";
import modal from "@salesforce/resourceUrl/custom_modal";
import { loadStyle } from "lightning/platformResourceLoader";
import { CloseActionScreenEvent } from "lightning/actions";
import { PlantProduct, roundAndAddZeros } from "./scripts/product.module.js";
import { totals } from "./scripts/schemas.js";
import {
	getVolume,
	getCalendarPeriods,
	getPriceLabel,
	sumProductDivide,
	averages,
	round,
	truncate
} from "./scripts/utils.js";
import getOpportunityById from "@salesforce/apex/ETC_QuoterImportadosController.getOpportunityById";
import getProductById from "@salesforce/apex/ETC_QuoterImportadosController.getProductById";
import getClientSiteById from "@salesforce/apex/ETC_QuoterImportadosController.getClientSiteById";
import getFleteByParams from "@salesforce/apex/ETC_QuoterImportadosController.getFleteByParams";
import getSupplies from "@salesforce/apex/ETC_QuoterImportadosController.getSupplies";
import createQuote from "@salesforce/apex/ETC_QuoterImportadosController.createQuote";
import createQuoteItem from "@salesforce/apex/ETC_QuoterImportadosController.createQuoteItem";
import { getPicklistValues } from "lightning/uiObjectInfoApi";
import PICKLIST_FIELD_FIELD from "@salesforce/schema/Fletes__c.Medio_de_transporte__c";
// import getPlantById from "@salesforce/apex/ETC_QuoterImportadosController.getPlantById";

export default class CotizadorImportados extends NavigationMixin(LightningElement) {
	@track randomCacheKey = Math.random() * 1000000;
	@api recordId;
	@api closeModal;
	@api isUpdate;
	@api currentQuote;
	@track items = [];
	@track isLoading = false;
	@track invoicingLabel = "Customer Delivered Price";
	@track exwLabel = "Customer Delivered Price";
	@track transportType = [];
	@track selects = { incrementalCost: false };
	@track opportunity = { data: null };
	@track link = null;
	@track configUnitMeasure = "mt";
	@track Dias_de_credito__c = 0;
	@track literOutputLabel = "";
	listaOracle = null;
	currentMetricLabel = "";
	volume = "";
	amountTypeByPlant = "";
	amountType = "";
	headerPeriods = {
		startDate: "",
		endDate: "",
		calendarYearPeriod: "",
		calendarPeriod: "",
		totalMonths: 0
	};
	isLoaded = false;
	isAdditionalFinantialCost = "";
	incrementalCreditDays = 0;
	quoationDate = "";
	totals = totals;
	filter = {
		criteria: []
	};
	currentCurrency = "usd";
	priceAverages = { Corn__c: 0, Basis__c: 0, Fx__c: 0, Gas__c: 0 };
	// Litros
	literSelectLoaded = false;
	@track densidadMark20C = 0;
	@track volumenLtGalon = 0;

	// refreshPage() {
	// 	this[NavigationMixin.Navigate]({
	// 		type: "standard__recordPage",
	// 		attributes: {
	// 			recordId: this.recordId,
	// 			objectApiName: "Opportunity",
	// 			actionName: "view"
	// 		}
	// 	});
	// }

	@wire(getOpportunityById, { id: "$recordId" })
	getOpportunity({ data, error }) {
		if (error) {
			console.log(error);
		} else if (data) {
			this.opportunity = { data, error };
			this.quoationDate = new Date().toISOString().split("T")[0];

			//generate picklist
			if (data.Producto__r.Medio_de_transporte__c) {
				this.transportType = data.Producto__r.Medio_de_transporte__c.split(";").map((v) => ({
					label: v,
					value: v
				}));
			} else {
				this.showToast({
					title: "No se encontraron medios de transporte",
					message: "Este producto no tiene medio de transporte, por favor valide su informacion",
					variant: "warning"
				});
			}
			// Litros
			if (data.Producto__r.Densidad_Merk_20C__c && data.Producto__r.Volumen_Lt_Galon__c) {
				this.densidadMark20C = data.Producto__r.Densidad_Merk_20C__c;
				this.volumenLtGalon = data.Producto__r.Volumen_Lt_Galon__c;
			}

			const LIMIT = 30;
			if (this.isUpdate) {
				this.accountCreditDays = this.currentQuote.data.Dias_de_credito__c || 0;
				this.listaOracle = this.currentQuote.data.Pricebook2Id;
			} else {
				if (data.Unidad_de_negocio__c !== "Almex-Promer") {
					if (data.Unidad_de_negocio__c === "Almex") {
						this.accountCreditDays = Number(data.Account.Condicion_de_pago__c);
					} else {
						this.accountCreditDays = Number(data.Account.Condicion_de_pago_PROMER__c);
					}
				} else {
					if (data.Unidad_de_negocio_Picklist__c === "BU_ALMEX") {
						this.accountCreditDays = Number(data.Account.Condicion_de_pago__c);
					} else {
						this.accountCreditDays = Number(data.Account.Condicion_de_pago_PROMER__c);
					}
				}
			}
			if (this.accountCreditDays > LIMIT) {
				this.isAdditionalFinantialCost = "Yes";
				this.incrementalCreditDays = this.accountCreditDays - LIMIT;
			} else {
				this.isAdditionalFinantialCost = "No";
				this.incrementalCreditDays = 0;
			}
			this.filter.criteria.push({ fieldPath: "Cuenta__c", operator: "eq", value: data.AccountId });
			// update?
			if (this.isUpdate) {
				try {
					const quoteData = this.currentQuote.data;
					this.currentCurrency = quoteData.Moneda__c.toLowerCase();
					this.headerPeriods = {
						...getCalendarPeriods(quoteData.Fecha_de_inicio__c, quoteData.ExpirationDate),
						startDate: quoteData.Fecha_de_inicio__c,
						endDate: quoteData.ExpirationDate
					};
					this.priceAverages.Fx__c = quoteData.Precio_dolar__c;
					this.quoationDate = quoteData.CreatedDate.split("T")[0];
					this.refs.unitMeasure.value = quoteData.Unidad_de_medida__c;
					this.configUnitMeasure = quoteData.Unidad_de_medida__c;
					this.volume = getVolume(quoteData.Unidad_de_medida__c);
					this.refs.currency.value = quoteData.Moneda__c.toLowerCase();
					this.refs.invoiceSellingPrice.value = quoteData.Planta__c;
					this.refs.comments.value = quoteData.Description;
					this.refs.incrementalCostSelect.value = quoteData.Costo_incremental__c ? "yes" : "no";
					this.selects.incrementalCost = quoteData.Costo_incremental__c;
					this.amountTypeByPlant = getPriceLabel("", this.refs.unitMeasure.value, this.currentCurrency);
					console.log(this.amountTypeByPlant);

					this.amountType = getPriceLabel("", this.refs.unitMeasure.value, this.currentCurrency);
					console.log(this.amountType);

					this.currentMetricLabel =
						this.refs.unitMeasure.options[this.refs.unitMeasure.selectedIndex].textContent;
					const items = quoteData.QuoteLineItems.map((qli) => {
						const newPlant = new PlantProduct({
							id: qli.Id,
							unitMeasure: quoteData.Unidad_de_medida__c,
							incrementalDates: this.incrementalCreditDays,
							haveIncrementalCost: quoteData.Costo_incremental__c ? "yes" : "no",
							productId: data.Producto__c
						});
						newPlant.fill({ ...qli, Precio_dolar__c: quoteData.Precio_dolar__c });
						return newPlant;
					});
					this.items = items;
					this.updateTotals();
				} catch (error) {
					console.log(error);
				}
			} else {
				this.items = [];
			}
		}
	}

	// @wire(getPicklistValues, {
	// 	recordTypeId: "012000000000000AAA",
	// 	fieldApiName: PICKLIST_FIELD_FIELD
	// })
	// getPicklistValuesForField({ data, error }) {
	// 	if (error) {
	// 		console.log(error);
	// 	} else if (data) {
	// 		this.transportType = [...data.values];
	// 	}
	// }

	get isLiter() {
		return this.configUnitMeasure === "lt";
	}

	get isLiterAndKilograms() {
		return this.isLiter && this.literOutputLabel !== "";
	}

	get movimientoOptions() {
		return [
			{ label: "Selecciona una opción", value: "-" },
			{ label: "Entrega", value: "1" },
			{ label: "Recolecta", value: "2" }
		];
	}

	get showFinancialInputs() {
		return this.isAdditionalFinantialCost === "Yes";
	}

	connectedCallback() {
		loadStyle(this, modal);
		// HEADER
		// Dates
		const today = new Date().toISOString().split("T")[0];
		this.headerPeriods = {
			...getCalendarPeriods(today, today),
			startDate: today,
			endDate: today
		};
	}

	renderedCallback() {
		if (this.refs.literOutput && !this.literSelectLoaded) {
			if (this.currentQuote) {
				this.refs.literOutput.value = this.currentQuote.data.literOutput__c;
				this.literOutputLabel = getPriceLabel("", this.currentQuote.data.literOutput__c, this.currentCurrency);
			}
			this.literSelectLoaded = true;
		}
		if (this.isLoaded) return;
		else {
			const STYLE = document.createElement("style");
			STYLE.innerText = `.uiModal--horizontalForm .modal-container {
				width: 100%;
				max-width: 100%;
				min-width: 480px;
				}
				`;
			this.template.querySelector(".main").appendChild(STYLE);
			this.isLoaded = true;
		}
		this.amountTypeByPlant = getPriceLabel("", this.refs.unitMeasure.value, this.currentCurrency);
		this.amountType = getPriceLabel("", this.refs.unitMeasure.value, this.currentCurrency);
		this.volume = getVolume(this.refs.unitMeasure.value);
		this.currentMetricLabel = this.refs.unitMeasure.options[this.refs.unitMeasure.selectedIndex].textContent;
		// HEADER
		// Dates
		const today = new Date().toISOString().split("T")[0];
		this.refs.quoationDate.value = today;
	}

	disconnectedCallback() {
		// console.log("El componente fue desconectado del DOM");
		this.resetProps();
	}

	resetProps() {
		this.items = [];
		this.isLoading = false;
		this.invoicingLabel = "Customer Delivered Price";
		this.exwLabel = "Customer Delivered Price";
		this.transportType = [];
		this.selects = { incrementalCost: false };
		this.opportunity = { data: null };
		this.link = null;
		this.configUnitMeasure = "mt";
		this.Dias_de_credito__c = 0;
		this.literOutputLabel = "";
		this.listaOracle = null;
		this.currentMetricLabel = "";
		this.volume = "";
		this.amountTypeByPlant = "";
		this.amountType = "";
		this.headerPeriods = {
			startDate: "",
			endDate: "",
			calendarYearPeriod: "",
			calendarPeriod: "",
			totalMonths: 0
		};
		this.isLoaded = false;
		this.isAdditionalFinantialCost = "";
		this.incrementalCreditDays = 0;
		this.quoationDate = "";
		this.totals = { ...totals };
		this.filter = {
			criteria: []
		};
		this.currentCurrency = "usd";
		this.priceAverages = { Corn__c: 0, Basis__c: 0, Fx__c: 0, Gas__c: 0 };
		// Litros
		this.literSelectLoaded = false;
		this.densidadMark20C = 0;
		this.volumenLtGalon = 0;
	}

	// Select Events
	async onChangeCurrency(evt) {
		const { value } = evt.target;
		// Cambiar el tag a mxn y no a usd
		this.currentCurrency = value;
		// Consultar con las fechas de inicio o de fin el rango de suministros
		const supplies = await getSupplies({
			startDate: this.headerPeriods.startDate,
			endDate: this.headerPeriods.endDate
		});
		if (supplies.length > 0) {
			// Generar el promedio de los suministros
			this.priceAverages = marketAverages(supplies);
			// Agregar este factor a todos los items actuales para que se haga el calculo a la moneda correspondiente
			this.items = this.items.map((i) => {
				i.currentCurrency = value;
				if (value === "usd") {
					i.convertionCurrency = 1;
				} else {
					i.convertionCurrency = this.priceAverages.Fx__c;
				}
				i.updateDeliveryCost = this.validateDelivery(i.deliveryCost, i.deliveryCurrency, i.systemDeliveryCost);
				return i;
			});
			this.amountTypeByPlant = getPriceLabel("", this.refs.unitMeasure.value, value);
			this.amountType = getPriceLabel("", this.refs.unitMeasure.value, value);
			this.updateTotals();
		} else {
			this.showToast({
				title: "No se encontraron suministros",
				message:
					"Por favor válida las fechas ingresadas o verifica que haya registros de suministros para el rango de fechas especificado",
				variant: "info"
			});
		}
	}

	async updatePriceAverages() {
		const supplies = await getSupplies({
			startDate: this.headerPeriods.startDate,
			endDate: this.headerPeriods.endDate
		});
		if (supplies.length > 0) {
			// Generar el promedio de los suministros
			this.priceAverages = marketAverages(supplies);
		}
	}

	async onChangeMovement(evt) {
		const value = evt.target.value;
		const id = evt.target.dataset.column;
		switch (value) {
			case "1":
				{
					this.items = this.items.map((i) => {
						if (i.id === id) {
							i.movement = value;
						}
						return i;
					});
					await this.updateFlete(id);
				}
				break;
			case "2":
				{
					this.items = this.items.map((i) => {
						if (i.id === id) {
							i.movement = value;
							i.deliveryCost = 0;
						}
						return i;
					});
				}
				break;
			default:
		}
		this.updateTotals();
	}

	onChangeUnitMeasure(evt) {
		try {
			const currentSelected = evt.target.options[evt.target.selectedIndex].textContent;
			if (evt.target.value == "lt") {
				this.literSelectLoaded = false;
			}
			this.items = this.items.map((i) => {
				if (Number(i.deliveryCost) > 0) {
					if (i.deliveryCost !== 0) {
						// if (this.currentMetricLabel == "Metric Tons" && currentSelected == "Kilograms") {
						// 	i.deliveryCost = i.deliveryCost / 1000;
						// 	i.convertionPrice = round(i.realConvertionPrice / 1000, 3, true);
						// } else if (this.currentMetricLabel == "Kilograms" && currentSelected == "Metric Tons") {
						// 	i.deliveryCost = i.deliveryCost * 1000;
						// 	i.convertionPrice = round(i.realConvertionPrice, 3, true);
						// }
					}
				}
				if (evt.target.value == "lt") {
					i.literOutput = this.refs?.literOutput?.value || "lt";
				}
				i.unitMeasure = this.refs.unitMeasure.value;
				i.productCostInput = 0;
				return i;
			});
			this.configUnitMeasure = evt.target.value;
			this.volume = getVolume(this.refs.unitMeasure.value);
			this.currentMetricLabel = currentSelected;
			this.amountTypeByPlant = getPriceLabel("", evt.target.value, this.currentCurrency);
			this.amountType = getPriceLabel("", evt.target.value, this.currentCurrency);
			this.updateTotals();
		} catch (error) {
			console.log(error);
		}
	}

	onChangeLiterOutput(evt) {
		try {
			this.items = this.items.map((i) => {
				i.literOutput = evt.target.value;
				return i;
			});
			if (evt.target.value === "kg") {
				this.literOutputLabel = getPriceLabel("", evt.target.value, this.currentCurrency);
			} else {
				this.literOutputLabel = "";
			}
			this.updateTotals();
		} catch (error) {
			console.log(error);
		}
	}

	// Input Events
	onChangeInvoiceSellingPrice(evt) {
		this.amountTypeByPlant = getPriceLabel(evt.target.value, this.refs.unitMeasure.value, this.currentCurrency);
		if (evt.target.value === "customer-plant") {
			this.invoicingLabel = "Customer Delivered Price";
			this.exwLabel = "Customer Delivered Price";
		} else {
			this.invoicingLabel = "ALMEX Warehouse Price";
			this.exwLabel = "EXW Transfer Station Price";
		}
	}

	async onChangeAgreementDate(evt) {
		try {
			const currentStartDate = this.refs.agreementStartDate.value;
			const currentEndDate = this.refs.agreementEndDate.value;

			if (evt.target.name === "agreementStartDate") {
				if (currentEndDate < evt.target.value) {
					this.showToast({
						title: "Revise sus fechas",
						message: "La fecha de fin no puede ser menor a la de inicio",
						variant: "error"
					});
				} else {
					this.headerPeriods = {
						...getCalendarPeriods(evt.target.value, currentEndDate),
						startDate: evt.target.value,
						endDate: currentEndDate
					};
				}
			} else if (evt.target.name === "agreementEndDate") {
				if (evt.target.value < currentStartDate) {
					this.showToast({
						title: "Revise sus fechas",
						message: "La fecha de fin no puede ser menor a la de inicio",
						variant: "error"
					});
				} else {
					this.headerPeriods = {
						...getCalendarPeriods(currentStartDate, evt.target.value),
						startDate: currentStartDate,
						endDate: evt.target.value
					};
				}
			}
			await this.updatePriceAverages();
		} catch (error) {
			console.log(error);
		}
	}

	someProductNeedValues() {
		if (this.items.length > 0) {
			const requiredFields = [
				"volume",
				"productId",
				"storage",
				"transportation",
				"tons",
				"productShareholdersCost",
				"railroadCost",
				"movement"
			];
			const incompleteData = this.items.some((i) =>
				requiredFields.some((rf) => {
					if (i.movement === "2" && rf === "transportation") {
						return false;
					} else {
						return !Boolean(i[rf]);
					}
				})
			);
			if (incompleteData) {
				this.showToast({
					title: "Faltan datos",
					message:
						"Por favor, complete los campos requeridos de una sucursal: Volumen, Producto, Almacen, Sucursal de destino, Metodo de transporte, Toneladas, Movimiento, Costo del Producto, Flete de entrada",
					variant: "error"
				});
				return true;
			}
		}
		return false;
	}

	addNewColumn(evt) {
		const { unitMeasure, incrementalCreditDays } = this.refs;
		try {
			// Validate if the current product have minimum data filled
			if (this.someProductNeedValues()) return;
			const size = this.items.length;
			// const newColumnJson = newJsonColumn(size);
			this.opportunity.data.Producto__c;
			const newProduct = new PlantProduct({
				id: size,
				unitMeasure: unitMeasure.value,
				incrementalDates: incrementalCreditDays.value,
				haveIncrementalCost: this.refs.incrementalCostSelect.value,
				productId: this.opportunity.data.Producto__c,
				densidadMark20C: this.densidadMark20C,
				volumenLtGalon: this.volumenLtGalon
			});
			this.items.push(newProduct);
			this.updateTotals();
		} catch (error) {
			console.log(error);
		}
	}

	onRemoveProduct(evt) {
		const id = evt.target.dataset.id;
		this.items = this.items.filter((i) => i.id !== id);
		this.updateTotals();
	}

	async showResult(evt) {
		try {
			this.isLoading = true;
			if (this.someProductNeedValues()) return;
			if (!this.items || this.items.length === 0) {
				this.showToast({
					message: "Por favor, agregue al menos una sucursal",
					title: "No fue posible realizar esta operación",
					variant: "error"
				});
				return;
			}
			if (this.totals.products > 0) {
				this.showToast({
					message: "Estamos registrando todos los valores de su nueva cotización",
					title: "Guardando",
					variant: "success"
				});
				const { Account, Name, Quote_Version__c } = this.opportunity.data;
				const externalId = `${Account.Name}_${Name}_${this.quoationDate}_v${Quote_Version__c}`;

				const newQuote = await createQuote({
					pricebook: "",
					newQuoteModel: {
						name: externalId,
						opportunityId: this.recordId,
						accountCreditDays: this.accountCreditDays,
						listaOracle: this.listaOracle,
						...this.totals
					},
					quoteConfigs: {
						startDate: this.refs.agreementStartDate.value,
						endDate: this.refs.agreementEndDate.value,
						textPeriod: this.headerPeriods.calendarPeriod,
						yearPeriod: this.headerPeriods.calendarYearPeriod,
						totalMonths: this.headerPeriods.totalMonths,
						unitMeasure: this.refs.unitMeasure.value,
						incrementalCost: this.refs.incrementalCostSelect.value === "yes",
						haveIncrementalDays: this.isAdditionalFinantialCost === "Yes",
						incrementalDays: this.incrementalCreditDays,
						plant: this.refs.invoiceSellingPrice.value,
						comments: this.refs.comments.value,
						quoteCode: externalId,
						currentCurrency: this.currentCurrency,
						convertionCurrency: this.priceAverages.Fx__c,
						literOutput: this.refs?.literOutput?.value || ""
					}
				});
				const orderItems = this.items.map((i) => {
					return i.json();
				});
				// console.log(orderItems);
				const [orderId, pricebookId] = newQuote.split("-");
				const recordUrl = await createQuoteItem({
					quoteId: orderId,
					pricebookId: pricebookId,
					newQuoteItemList: orderItems
				});
				if (recordUrl.length > 0) {
					this.link = recordUrl;
					this.items = [];
				}
			} else {
				this.showToast({
					message: "Para poder guardar la cotización debe tener al menos un producto cotizado",
					title: "Por favor, valide sus datos",
					variant: "danger"
				});
			}
		} catch (error) {
			console.log(error.message);
			this.showToast({
				message: error?.body?.message || error.message,
				title: "No fue posible realizar esta operación",
				variant: "danger"
			});
		} finally {
			this.isLoading = false;
		}
	}

	finishProcess() {
		// this.refreshPage();
		this.dispatchEvent(new CloseActionScreenEvent({ bubbles: true, composed: true }));
		window.location.reload();
	}

	onChangeInput(evt) {
		try {
			const { name, value } = evt.target;
			let currentValue = value;
			if (name) {
				const column = evt.target.closest(".quoter-column").getAttribute("aria-id");
				this.items = this.items.map((i) => {
					if (i.id === column) {
						if (name === "profitMarginPercentage" || name !== "totalProductCost") {
							i.productCostInput = 0;
						}
						if (name === "tons") {
							i.tons = currentValue;
							i.freightCost = currentValue;
						} else {
							i[name] = currentValue;
						}
					}
					return i;
				});
			}
		} catch (error) {
			console.log(error);
		}
		this.updateTotals();
	}

	onChangeHeaderSelect(evt) {
		try {
			const { value } = evt.target;
			const percentage = value === "yes" ? 1.5 : 0;
			this.items = this.items.map((i) => {
				i.incrementalCost = percentage;
				i.haveIncrementalCost = value;
				return i;
			});
			this.selects.incrementalCost = value === "yes";
			this.updateTotals();
		} catch (error) {
			console.log(error);
		}
	}

	async onChangeRecordPicker(evt) {
		let column = "";
		let type = "";
		try {
			column = evt.target.className;
		} catch (error) {}
		try {
			type = evt.target.dataset.type;
		} catch (error) {}

		const { recordId } = evt.detail;
		if (recordId) {
			let recordData = null;

			if (type === "product") {
				recordData = await getProductById({ id: recordId });
			} else if (type === "storage") {
				// recordData = await getPlantById({ id: recordId });
			} else if (type === "customer-site") {
				recordData = await getClientSiteById({ id: recordId });
			}
			this.items = this.items.map((i) => {
				if (i.id === column) {
					if (type === "product") {
						i.productId = recordId;
						i.productDescription = recordData.ProductCode;
					} else if (type === "storage") {
						i.storage = recordId;
					} else if (type === "customer-site") {
						i.customerSiteName = recordId;
						i.customerSiteId = recordData.Ship_to_ID__c;
						i.customerSiteCity = recordData.Datos_de_direccion__City__s;
						i.customerSiteState = recordData.Datos_de_direccion__c.stateCode;
					}
				}
				return i;
			});
		} else {
			this.items = this.items.map((i) => {
				if (i.id === column) {
					if (type === "product") {
						i.productId = "";
						i.productDescription = "";
					} else if (type === "storage") {
						i.storage = "";
					} else if (type === "customer-site") {
						i.customerSiteName = "";
						i.customerSiteId = "";
						i.customerSiteCity = "";
					}
				}
				return i;
			});
		}

		await this.updateFlete(column);
		this.updateTotals();
	}

	async onChangeSelect(evt) {
		this.items = this.items.map((i) => {
			if (i.id === evt.target.dataset.column) {
				i.transportation = evt.detail.value;
			}
			return i;
		});
		await this.updateFlete(evt.target.dataset.column);
		this.updateTotals();
	}

	showToast({ title = "Name", message = "Description", variant = "success" }) {
		const event = new ShowToastEvent({
			title,
			message,
			variant
		});
		this.dispatchEvent(event);
	}

	async updateFlete(productId) {
		const product = this.items.find((i) => i.id === productId);
		if (product && product["storage"] && product["transportation"] && product["customerSiteCity"]) {
			try {
				console.log({
					transport: product.transportation,
					city: product.customerSiteCity,
					plant: product.storage,
					moneda: this.currentCurrency,
					state: product.customerSiteState,
					initDate: this.headerPeriods.startDate
				});
				const flete = await getFleteByParams({
					transport: product.transportation,
					city: product.customerSiteCity,
					plant: product.storage,
					moneda: this.currentCurrency,
					state: product.customerSiteState,
					initDate: this.headerPeriods.startDate
				});
				let costoFlete = Number(flete.Costo_de_flete__c) || 0;
				console.log(flete.Tipo_de_moneda__c.toLowerCase());
				console.log(costoFlete);

				this.items = this.items.map((i) => {
					if (i.id === productId) {
						i.updateDeliveryCost = this.validateDelivery(
							costoFlete,
							flete.Tipo_de_moneda__c.toLowerCase(),
							costoFlete
						);
						i.deliveryCurrency = flete.Tipo_de_moneda__c.toLowerCase();
						i.systemDeliveryCost = costoFlete;
					}
					return i;
				});
			} catch (error) {
				this.showToast({
					title: "Flete no encontrado",
					message:
						"No se encontró ningún flete que coincida con el almacén, sucursal del cliente y tipo de transporte, por favor agregue el registro.",
					variant: "warning"
				});
				this.items = this.items.map((i) => {
					if (i.id === productId) {
						i.updateDeliveryCost = 0;
						i.tons = 0;
					}
					return i;
				});
			}
		}
	}

	updateTotals() {
		if (this.items.length === 0) return;
		const decimalOptions = { mt: 3, kg: 3, lt: 3 };
		let decimals = decimalOptions[this.refs.unitMeasure.value];
		const totalsCalculation = {
			...this.totals,
			pricing: roundAndAddZeros(sumProductDivide(this.items, ["billedPrice", "volume", "volume"]), decimals),
			volume: this.items.reduce((acc, c) => acc + Number(c.volume), 0),
			products: this.items.reduce((acc, c) => {
				return c.productId ? acc + 1 : acc;
			}, 0),
			customerSites: this.items.reduce((acc, c) => {
				return c.customerSiteId ? acc + 1 : acc;
			}, 0),
			warehousePrice: roundAndAddZeros(
				sumProductDivide(this.items, ["almexPriceWarehouse", "volume", "volume"]),
				decimals
			),
			flete: roundAndAddZeros(sumProductDivide(this.items, ["deliveryCost", "volume", "volume"]), decimals),
			labTransfer: roundAndAddZeros(
				sumProductDivide(this.items, ["volume", "labTransferPrice", "volume"]),
				decimals
			),
			shareholders: roundAndAddZeros(
				sumProductDivide(this.items, ["productShareholdersCost", "volume", "volume"]),
				decimals
			),
			productCost: roundAndAddZeros(sumProductDivide(this.items, ["productCost", "volume", "volume"]), decimals),
			railroad: roundAndAddZeros(sumProductDivide(this.items, ["railroadCost", "volume", "volume"]), decimals),
			operativeAlmidon: roundAndAddZeros(
				sumProductDivide(this.items, ["importExpensesAlmidon", "volume", "volume"]),
				decimals
			),
			operativePacking: roundAndAddZeros(
				sumProductDivide(this.items, ["transferImportExpPacking", "volume", "volume"]),
				decimals
			),
			profitMarginPercentage: roundAndAddZeros(
				sumProductDivide(this.items, ["profitMarginPercentage", "volume", "volume"]),
				decimals
			),
			profitMargin: roundAndAddZeros(
				sumProductDivide(this.items, ["profitMargin", "volume", "volume"]),
				decimals
			),
			isotank: roundAndAddZeros(sumProductDivide(this.items, ["isotank", "volume", "volume"]), decimals),
			clientPortals: roundAndAddZeros(
				sumProductDivide(this.items, ["clientPortals", "volume", "volume"]),
				decimals
			),
			dryStorage: roundAndAddZeros(sumProductDivide(this.items, ["storageDry", "volume", "volume"]), decimals),
			overhead: roundAndAddZeros(sumProductDivide(this.items, ["overhead", "volume", "volume"]), decimals),
			incrementalCostPercentage: roundAndAddZeros(
				sumProductDivide(this.items, ["incrementalCost", "volume", "volume"]),
				decimals
			),
			incrementalCostRebate: roundAndAddZeros(
				sumProductDivide(this.items, ["incrementalCostCalc", "volume", "volume"]),
				3
			),
			exwIncrementals: roundAndAddZeros(
				sumProductDivide(this.items, ["exwIncrementals", "volume", "volume"]),
				decimals
			),
			finantialCostPercentage: roundAndAddZeros(
				sumProductDivide(this.items, ["finantialCostRate", "volume", "volume"]),
				decimals
			),
			finantialCost: roundAndAddZeros(
				sumProductDivide(this.items, ["finantialCost", "volume", "volume"]),
				decimals
			),
			exwFinantialCost: roundAndAddZeros(
				sumProductDivide(this.items, ["exwFinancialCost", "volume", "volume"]),
				decimals
			),
			transferStationCost: roundAndAddZeros(
				sumProductDivide(this.items, ["transferStationCost", "volume", "volume"]),
				decimals
			),
			literProductCost: roundAndAddZeros(
				sumProductDivide(this.items, ["literProductCost", "volume", "volume"]),
				decimals
			)
		};

		let totalBuildCost = "0";
		if (this.refs.unitMeasure.value === "lt") {
			totalBuildCost = roundAndAddZeros(
				Number(totalsCalculation.transferStationCost) + Number(totalsCalculation.operativePacking),
				decimals
			);
		} else {
			totalBuildCost = roundAndAddZeros(
				Number(totalsCalculation.productCost) +
					Number(totalsCalculation.railroad) +
					Number(totalsCalculation.operativeAlmidon) +
					Number(totalsCalculation.operativePacking),
				decimals
			);
		}

		const totalProductCost = roundAndAddZeros(
			Number(totalBuildCost) + Number(totalsCalculation.profitMargin),
			decimals
		);
		const totalOperativeCost = roundAndAddZeros(
			Number(totalsCalculation.isotank) +
				Number(totalsCalculation.clientPortals) +
				Number(totalsCalculation.dryStorage),
			4
		);

		const margins = {};

		if (this.configUnitMeasure.toLocaleLowerCase() === "lt") {
			const realTotalMarginBrute =
				Number(totalsCalculation.labTransfer) -
				(Number(totalBuildCost) + Number(totalsCalculation.totalOperativeCost)) * this.densidadMark20C;
			// console.log("===========+++++++++++++++++++++++++++++===========");
			// console.log(realTotalMarginBrute);
			// console.log(totalsCalculation.labTransfer);
			// console.log(totalBuildCost);
			// console.log(totalsCalculation.totalOperativeCost);
			// console.log(this.densidadMark20C);
			// console.log("===========+++++++++++++++++++++++++++++===========");

			margins.marginBrute = roundAndAddZeros(realTotalMarginBrute, 4);
			const realMarginBeforeTaxes = Number(margins.marginBrute) + Number(totalsCalculation.overhead);
			margins.marginBeforeTaxes = roundAndAddZeros(realMarginBeforeTaxes, 4);
		} else {
			margins.marginBrute = roundAndAddZeros(Number(totalsCalculation.labTransfer) - Number(totalBuildCost), 4);
			margins.marginBeforeTaxes = roundAndAddZeros(
				Number(margins.marginBrute) + Number(totalsCalculation.overhead),
				4
			);
		}
		margins.ptu = roundAndAddZeros(-(Number(margins.marginBeforeTaxes) * 0.1), 4);
		margins.isr = roundAndAddZeros(-(Number(margins.marginBeforeTaxes) * 0.3), 4);

		// marginBrute
		// marginBruteNetSales
		// x overhead
		// marginBeforeTaxes
		// netMarginBeforeSales
		// ptu
		// isr
		// netMargin
		this.totals = {
			...this.totals,
			...totalsCalculation,
			totalBuildCost,
			totalProductCost,
			totalOperativeCost,
			totalSalesCost: roundAndAddZeros(Number(totalProductCost) + Number(totalOperativeCost), 4),
			marginBrute: margins.marginBrute,
			marginBruteNetSales: truncate(
				(Number(margins.marginBrute) / Number(totalsCalculation.labTransfer)) * 100,
				2,
				2
			),
			marginBeforeTaxes: margins.marginBeforeTaxes,
			netMarginBeforeSales: round(
				(Number(margins.marginBeforeTaxes) / Number(this.items[0].labTransferPrice)) * 100,
				2,
				true
			),
			ptu: margins.ptu,
			isr: margins.isr,
			netMargin: roundAndAddZeros(
				Number(margins.marginBeforeTaxes) + Number(margins.ptu) + Number(margins.isr),
				4
			)
		};
	}

	validateDelivery(cost, costCurrency = "usd", system) {
		const { Fx__c } = this.priceAverages;
		console.log(costCurrency, system);

		if (
			(this.currentCurrency === "usd" && costCurrency === "usd") ||
			(this.currentCurrency === "mxn" && costCurrency === "mxn")
		) {
			return system;
		}
		if (Fx__c) {
			if (costCurrency === "mxn") {
				if (this.currentCurrency === "usd") {
					return system / Fx__c;
				} else {
					return system;
				}
			} else if (costCurrency === "usd") {
				if (this.currentCurrency === "usd") {
					return system;
				} else {
					return system * Fx__c;
				}
			}
		} else {
			this.showToast({
				title: "Faltan valores",
				message:
					"El costo del dólar con las configuraciones en este cotizador es 0. Por favor, ingrese un rango de fecha válido para obtener el precio del dólar",
				variant: "warning"
			});
		}
		return system;
	}

	// gets
	get transportationLabel() {
		const labels = { kg: "Per Tons", mt: "Per Tons", lt: "Per Lt" };
		return labels[this.configUnitMeasure];
	}

	get shareholdersLabel() {
		const labels = { kg: "CWT", mt: "CWT", lt: "Gal" };
		return `${this.currentCurrency.toUpperCase()}/${labels[this.configUnitMeasure]}`;
	}

	get operativeCostLabel() {
		const labels = { kg: "Kg", mt: "Mton", lt: "" };
		if (this.configUnitMeasure === "lt") {
			return "";
		}
		return `${this.currentCurrency.toUpperCase()}/${labels[this.configUnitMeasure]}`;
	}

	get productCostAndEntryFreightLabel() {
		const labels = { kg: "Kg", mt: "Mton", lt: "Mton" };
		return `${this.currentCurrency.toUpperCase()}/${labels[this.configUnitMeasure]}`;
	}

	get productCostLtLabel() {
		const labels = { kg: "Kg", mt: "Mton", lt: "Kg" };
		return `${this.currentCurrency.toUpperCase()}/${labels[this.configUnitMeasure]}`;
	}

	get showInLiter() {
		return this.configUnitMeasure === "lt";
	}
}

function marketAverages(e) {
	const result = averages(e);
	return {
		Corn__c: round(result.Corn__c, 4),
		Basis__c: round(result.Basis__c, 2),
		Fx__c: round(result.Fx__c, 4),
		Gas__c: truncate(result.Gas__c, 4)
	};
}