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

export default class CotizadorAceites extends LightningElement {
	@track randomCacheKey = Math.random() * 1000000;
	@api recordId;
	@api closeModal;
	@api isUpdate;
	@api currentQuote;
	@track items = [];
	@track invoicingLabel = "Customer Delivered Price";
	@track exwLabel = "Customer Delivered Price";
	@track transportType = [];
	@track selects = { incrementalCost: false };
	@track opportunity = { data: null };
	@track link = null;
	@track isLoading = false;
	listaOracle = null;
	currentMetricLabel = "";
	volume = "";
	amountTypeByPlant = "";
	amountType = "";
	headerPeriods = {
		startDate: "",
		endDate: "",
		calendarYearPeriod: "",
		calendarPeriod: ""
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

			// const LIMIT = 30;
			// const accountCreditDays = Number(data.Account.Plazo_de_Credito__c);
			// if (accountCreditDays > LIMIT) {
			// 	this.isAdditionalFinantialCost = "Yes";
			// 	this.incrementalCreditDays = accountCreditDays - LIMIT;
			// } else {
			// 	this.isAdditionalFinantialCost = "No";
			// 	this.incrementalCreditDays = 0;
			// }
			this.filter.criteria.push({ fieldPath: "Cuenta__c", operator: "eq", value: data.AccountId });
			// update?
			if (this.isUpdate) {
				const quoteData = this.currentQuote.data;
				this.listaOracle = quoteData.Pricebook2Id;
				this.headerPeriods = {
					...getCalendarPeriods(quoteData.Fecha_de_inicio__c, quoteData.ExpirationDate),
					startDate: quoteData.Fecha_de_inicio__c,
					endDate: quoteData.ExpirationDate
				};
				this.priceAverages = { Fx__c: quoteData.Precio_dolar__c };
				this.quoationDate = quoteData.CreatedDate.split("T")[0];
				this.refs.unitMeasure.value = quoteData.Unidad_de_medida__c.toLowerCase();
				this.refs.invoiceSellingPrice.value = quoteData.Planta__c;
				this.refs.comments.value = quoteData.Description;
				this.refs.incrementalCostSelect.value = quoteData.Costo_incremental__c ? "yes" : "no";
				this.selects.incrementalCost = quoteData.Costo_incremental__c;
				this.refs.currency.value = quoteData.Moneda__c.toLowerCase();
				this.amountTypeByPlant = getPriceLabel("", this.refs.unitMeasure.value, this.currentCurrency);
				this.amountType = getPriceLabel("", this.refs.unitMeasure.value, this.currentCurrency);
				this.conve;
				this.currentMetricLabel =
					this.refs.unitMeasure.options[this.refs.unitMeasure.selectedIndex].textContent;
				const items = quoteData.QuoteLineItems.map((qli) => {
					const newPlant = new PlantProduct({
						id: qli.Id,
						unitMeasure: quoteData.Unidad_de_medida__c,
						// incrementalDates: this.incrementalCreditDays,
						// haveIncrementalCost: quoteData.Costo_incremental__c ? "yes" : "no",
						productId: data.Producto__c,
						product: {
							SG_A_LT__c: qli.SG_A_LT__c,
							SG_A_KG__c: qli.SG_A_KG__c,
							Costo_estandar_P__c: qli.Costo_estandar_P__c,
							Factor_de_conversion_kg__c: qli.Factor_de_conversion_kg__c,
							Factor_de_conversion__c: qli.Factor_de_conversion__c,
							Unidad_de_medida__c: qli.Unidad_de_medida__c
						}
					});
					newPlant.fill(qli);
					return newPlant;
				});
				this.items = items;
				this.updateTotals();
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

	get movimientoOptions() {
		return [
			{ label: "Selecciona una opción", value: "-" },
			{ label: "Entrega", value: "1" },
			{ label: "Recolecta", value: "2" }
		];
	}

	get showFinancialInputs() {
		return true;
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
		this.randomCacheKey = Math.random() * 1000000;
		this.items = [];
		this.invoicingLabel = "Customer Delivered Price";
		this.exwLabel = "Customer Delivered Price";
		this.transportType = [];
		this.selects = { incrementalCost: false };
		this.opportunity = { data: null };
		this.link = null;
		this.isLoading = false;
		this.listaOracle = null;
		this.currentMetricLabel = "";
		this.volume = "";
		this.amountTypeByPlant = "";
		this.amountType = "";
		this.headerPeriods = {
			startDate: "",
			endDate: "",
			calendarYearPeriod: "",
			calendarPeriod: ""
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
		this.items = this.items.map((i) => {
			i.currentCurrency = value;
			return i;
		});
		if (supplies.length > 0) {
			// Generar el promedio de los suministros
			this.priceAverages = marketAverages(supplies);
			// Agregar este factor a todos los items actuales para que se haga el calculo a la moneda correspondiente
			this.items = this.items.map((i) => {
				i.convertionCurrency = this.priceAverages.Fx__c;
				// if (value === "usd") {
				// 	i.convertionCurrency = 1;
				// } else {
				// }
				// i.updateDeliveryCost = this.validateDelivery(i.deliveryCost, i.deliveryCurrency, i.systemDeliveryCost);
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
			this.items = this.items.map((i) => {
				i.convertionCurrency = this.priceAverages.Fx__c;
				return i;
			});
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
							if (value === "2") i.transportation = "";
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
		const currentSelected = evt.target.options[evt.target.selectedIndex].textContent;
		this.items = this.items.map((i) => {
			if (Number(i.deliveryCost) > 0) {
				if (i.deliveryCost !== 0) {
					if (this.currentMetricLabel == "Metric Tons" && currentSelected == "Kilograms") {
						i.deliveryCost = i.deliveryCost / 1000;
						i.convertionPrice = round(i.realConvertionPrice / 1000, 3, true);
					} else if (this.currentMetricLabel == "Kilograms" && currentSelected == "Metric Tons") {
						i.deliveryCost = i.deliveryCost * 1000;
						i.convertionPrice = round(i.realConvertionPrice, 3, true);
					}
				}
			}
			i.unitMeasure = this.refs.unitMeasure.value;
			i.productCostInput = 0;
			return i;
		});
		this.volume = getVolume(this.refs.unitMeasure.value);
		this.currentMetricLabel = currentSelected;
		this.amountTypeByPlant = getPriceLabel("", evt.target.value, this.currentCurrency);
		this.amountType = getPriceLabel("", evt.target.value, this.currentCurrency);
		this.updateTotals();
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
				"productCostF",
				"almexPriceWarehouse",
				"movement"
			];
			console.log(this.items);
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
						"Por favor, complete los campos requeridos de una sucursal: Volumen, Producto, Almacen, Sucursal de destino, Metodo de transporte, Toneladas, Movimiento, Precio Meta, Shipping Costs per Lot Size, Flete de entrada",
					variant: "error"
				});
				return true;
			}
		}
		return false;
	}

	async addNewColumn(evt) {
		const { unitMeasure } = this.refs;
		try {
			// Validate if the current product have minimum data filled
			if (this.someProductNeedValues()) return;
			const size = this.items.length;
			// const newColumnJson = newJsonColumn(size);
			const { Producto__c } = this.opportunity.data;
			const productData = await getProductById({ id: Producto__c });
			const newProduct = new PlantProduct({
				id: size,
				unitMeasure: unitMeasure.value,
				haveIncrementalCost: this.refs.incrementalCostSelect.value,
				productId: Producto__c,
				product: productData
			});
			newProduct.currentCurrency = this.currentCurrency;
			newProduct.convertionCurrency = this.priceAverages.Fx__c;
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
				const externalId = `A_${Account.Name}_${Name}_${this.quoationDate}_v${Quote_Version__c}`;
				const newQuote = await createQuote({
					pricebook: "",
					newQuoteModel: {
						isOil: true,
						name: externalId,
						opportunityId: this.recordId,
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
						convertionCurrency: this.priceAverages.Fx__c
					}
				});
				const orderItems = this.items.map((i) => {
					return i.json();
				});
				const [orderId, pricebookId] = newQuote.split("-");
				const recordUrl = await createQuoteItem({
					quoteId: orderId,
					pricebookId: pricebookId,
					newQuoteItemList: orderItems
				});
				if (recordUrl.length > 0) {
					this.link = recordUrl;
				}
			} else {
				this.showToast({
					message: "Para poder guardar la cotización debe tener al menos un producto cotizado",
					title: "Por favor, valide sus datos",
					variant: "danger"
				});
			}
		} catch (error) {
			console.log(error);
			this.showToast({
				message:
					"La cotización no se pudo crear, por favor revisa si el producto que intentas cotizar está activo.",
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
				// recordData = await getProductById({ id: recordId });
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
						i.customerSiteState = "";
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
				const flete = await getFleteByParams({
					transport: product.transportation,
					city: product.customerSiteCity,
					plant: product.storage,
					state: product.customerSiteState,
					moneda: this.currentCurrency,
					initDate: this.headerPeriods.startDate
				});
				let costoFlete = Number(flete.Costo_de_flete__c) || 0;
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
		const decimals = this.refs.unitMeasure.value === "mt" ? 3 : 3;

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
				sumProductDivide(this.items, ["labTransferPrice", "volume", "volume"]),
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
			profitMarginPercentage: 2,
			// profitMarginPercentage: roundAndAddZeros(
			// 	sumProductDivide(this.items, ["profitMarginPercentage", "volume", "volume"]),
			// 	decimals
			// ),
			profitMargin: roundAndAddZeros(
				sumProductDivide(this.items, ["profitMargin", "volume", "volume"]),
				decimals
			),
			productCostLtF: roundAndAddZeros(
				sumProductDivide(this.items, ["productCostLtF", "volume", "volume"]),
				decimals
			),
			productCostF: roundAndAddZeros(
				sumProductDivide(this.items, ["productCostF", "volume", "volume"]),
				decimals
			),
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
			)
		};

		const totalBuildCost = roundAndAddZeros(
			Number(totalsCalculation.productCost) +
				Number(totalsCalculation.railroad) +
				Number(totalsCalculation.operativePacking) +
				Number(totalsCalculation.productCostF),
			decimals
		);

		const totalProductCost = roundAndAddZeros(
			Number(totalBuildCost) + Number(totalsCalculation.profitMargin),
			decimals
		);
		const totalOperativeCost = roundAndAddZeros(
			Number(totalsCalculation.clientPortals) + Number(totalsCalculation.dryStorage),
			4
		);
		const totalSalesCost = roundAndAddZeros(Number(totalProductCost) + Number(totalOperativeCost), 4);
		const marginBrute = roundAndAddZeros(Number(totalsCalculation.labTransfer) - Number(totalSalesCost), 4);
		const marginBeforeTaxes = roundAndAddZeros(Number(marginBrute) + Number(totalsCalculation.overhead), 4);
		const ptu = roundAndAddZeros(-Number(marginBeforeTaxes) * 0.1, 4);
		const isr = roundAndAddZeros(-Number(marginBeforeTaxes) * 0.3, 4);

		this.totals = {
			...this.totals,
			...totalsCalculation,
			totalBuildCost,
			totalProductCost,
			totalOperativeCost,
			totalSalesCost,
			marginBrute,
			marginBruteNetSales: round((Number(marginBrute) / Number(totalsCalculation.labTransfer)) * 100, 2),
			marginBeforeTaxes,
			netMarginBeforeSales: round((Number(marginBeforeTaxes) / Number(this.items[0].labTransferPrice)) * 100, 2),
			ptu,
			isr,
			netMargin: roundAndAddZeros(Number(marginBeforeTaxes) + Number(ptu) + Number(isr), 4)
		};
	}

	validateDelivery(cost, costCurrency = "usd", system) {
		const { Fx__c } = this.priceAverages;
		if (
			(this.currentCurrency === "usd" && costCurrency === "usd") ||
			(this.currentCurrency === "mxn" && costCurrency === "mxn")
		) {
			return system;
		}
		if (Fx__c) {
			if (costCurrency === "mxn") {
				if (this.currentCurrency === "usd") {
					return cost / Fx__c;
				} else {
					return cost;
				}
			} else if (costCurrency === "usd") {
				if (this.currentCurrency === "usd") {
					return cost;
				} else {
					return cost * Fx__c;
				}
			}
		}
		return cost;
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