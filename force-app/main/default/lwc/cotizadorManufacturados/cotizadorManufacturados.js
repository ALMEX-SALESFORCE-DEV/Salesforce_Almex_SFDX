import { LightningElement, track, api, wire } from "lwc";
import getOpportunityById from "@salesforce/apex/ETC_QuoterImportadosController.getOpportunityById";
import getSupplies from "@salesforce/apex/ETC_QuoterImportadosController.getSupplies";
import { refreshApex } from "@salesforce/apex";
import { RefreshEvent } from "lightning/refresh";
import { CloseActionScreenEvent } from "lightning/actions";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import modal from "@salesforce/resourceUrl/custom_modal";
import { loadStyle } from "lightning/platformResourceLoader";
import { getRecord } from "lightning/uiRecordApi";
import USER_ID from "@salesforce/user/Id";
import { getPicklistValues } from "lightning/uiObjectInfoApi";
import PROFILE_NAME from "@salesforce/schema/User.Profile.Name";
import DateUtils from "./scripts/DateUtils.js";
import BreakdownClass from "./classes/BreakdownClass.js";
import CustomerSite from "./classes/CustomerSiteClass.js";
import {
	references,
	resultL,
	resultR,
	breakdownHeaders,
	parseSupplies,
	globalVolume,
	referenceDates
} from "./scripts/datasets.js";
import { round, averages, truncate, sumObject, ObjectValidator, newObj, sumProductDivide } from "./scripts/utils.js";
import createManufacturedQuote from "@salesforce/apex/ETC_QuoterImportadosController.createManufacturedQuote";
import createManufacturedQuoteItem from "@salesforce/apex/ETC_QuoterImportadosController.createManufacturedQuoteItem";
import getClientSiteById from "@salesforce/apex/ETC_QuoterImportadosController.getClientSiteById";
import TRANSPORTATIONS from "@salesforce/schema/Fletes__c.Medio_de_transporte__c";
import getFleteByParams from "@salesforce/apex/ETC_QuoterImportadosController.getFleteByParams";

export default class CotizadorManufacturados extends LightningElement {
	randomCacheKey = Math.random() * 1000000;
	@api recordId;
	@api isUpdate;
	@api currentQuote;
	quotationDate = DateUtils.generateDate();
	breakdownHeaders = breakdownHeaders;
	@track agreementDate = {
		init: DateUtils.generateDate(),
		end: DateUtils.addDays(DateUtils.generateDate(), 1)
	};
	@track rangeDates = DateUtils.getDateRangeDetails(this.agreementDate.init, this.agreementDate.end);
	@track currency = "usd";
	@track opp = null;
	@track leftResults = newObj(resultL);
	@track rightResults = null;
	@track currentLeftPrice = null;
	@track currentRightPrice = null;
	@track averages = null;
	@track marketAverages = null;
	@track marketReference = newObj(references);
	@track supplies = [];
	@track breakdowns = [];
	@track breakdownClasses = [];
	@track summaries = [];
	@track totalSummaries = null;
	@track checkCompleto = "Check - Incompleto";
	@track checked = true;
	@track link = null;
	@track comments = "";
	@track invoiceSellingPrice = "customer-plant";
	@track globalVolume = newObj(globalVolume);
	@track referenceDate = newObj(referenceDates);
	@track completeClass = "";
	@track filter = { criteria: [] };
	@track loaded = false;
	@track currentUserProfile = false;
	@track transportType = [];
	@track canSave = true;
	listaOracle = null;
	serviceSupplies = [];

	connectedCallback() {
		loadStyle(this, modal);
	}

	@wire(getOpportunityById, { id: "$recordId" })
	getOpportunity({ data, error }) {
		if (error) {
			console.log(error);
		} else if (data) {
			this.opp = data;

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

			let coproductValue = 30;
			if (data.Coproduct_Recov__c) {
				coproductValue = data.Coproduct_Recov__c;
			}
			this.rightResults = resultR({
				sgaUsd: data.sgaUst__c,
				coproductRecov: coproductValue
			});
			this.filter.criteria.push({
				fieldPath: "Cuenta__c",
				operator: "eq",
				value: data.AccountId
			});
			this.marketReference.cornUsage = data.Uso_del_Maiz__c;
			this.loaded = false;
		}
	}

	@wire(getRecord, { recordId: USER_ID, fields: [PROFILE_NAME] })
	userDetails(result) {
		if (result.data) {
			this.currentUserProfile = result.data.fields.Profile.value.fields.Name.value;
		}
	}

	// @wire(getPicklistValues, {
	// 	recordTypeId: "012000000000000AAA",
	// 	fieldApiName: TRANSPORTATIONS
	// })
	// getPicklistValuesForField({ data, error }) {
	// 	if (error) {
	// 		console.log(error);
	// 	} else if (data) {
	// 		this.transportType = [...data.values];
	// 	}
	// }

	renderedCallback() {
		if (this.opp && !this.loaded) {
			if (this.isUpdate) {
				this.fillProps();
			} else {
				this.resetProps();
			}
			this.loaded = true;
		}
	}

	disconnectedCallback() {
		// console.log("El componente fue desconectado del DOM");
		this.resetProps();
	}

	async fillProps() {
		if (this.isUpdate) {
			const { data } = this.currentQuote;
			this.listaOracle = data.Pricebook2Id;
			this.agreementDate.init = data.Fecha_de_inicio__c;
			this.agreementDate.end = data.ExpirationDate;
			this.comments = data.Description;
			this.rangeDates = DateUtils.getDateRangeDetails(this.agreementDate.init, this.agreementDate.end);
			this.marketReference.cornUsage = data.Corn_Usage__c;
			this.marketReference.inflation = data.Inflation__c;
			this.referenceDate = {
				basisDate: data.Basis_date__c,
				cornDate: data.Corn_date__c,
				fxDate: data.Fx__c,
				gasDate: data.Gas__c
			};
			this.globalVolume.proposedMtons = data.Proposed_Volume_Mtons__c;
			this.globalVolume.bookedMtons = data.Booked_Volume_Mtons__c;
			this.globalVolume.pointsNumebr = data.Delivery_Points_Number__c;
			this.invoiceSellingPrice = data.Planta__c;
			this.refs.invoiceSellingPrice.value = data.Planta__c;

			// Set current values
			if (data.leftDataset__c) {
				const leftBackup = JSON.parse(data.leftDataset__c);
				if (leftBackup) {
					this.leftResults = leftBackup.dataset;
					this.currentLeftPrice = this.leftResults.find((e) => e.key === leftBackup.current.key);
					this.refs.leftSelect.value = leftBackup.current.option;
				}
			}

			if (data.rightDataset__c) {
				let rightBackup = JSON.parse(data.rightDataset__c);
				rightBackup.dataset = rightBackup.dataset.map((i) => {
					i.flete.read = true;
					i.coproductRecov.read = true;
					return i;
				});
				if (rightBackup) {
					this.rightResults = rightBackup.dataset;
					this.currentRightPrice = this.rightResults.find((e) => e.key === rightBackup.current.key);
					this.refs.rightSelect.value = rightBackup.current.option;
				}
			}

			// breakdowns
			// await this.loadSupplies();
			if (data.marketReferenceMetadata__c) {
				const marketReferenceProps = JSON.parse(data.marketReferenceMetadata__c);
				this.marketAverages = marketReferenceProps.marketAverages;
				this.supplies = marketReferenceProps.supplie;
				this.breakdownClasses = marketReferenceProps.breakdowns.map((b) => {
					const newBreakdown = new BreakdownClass();
					newBreakdown.fill(b);
					return newBreakdown;
				});
				this.loadBreakdowns();
				// this.breakdowns = this.breakdownClasses.map((b) => b.toJson());
				// this.averages = marketReferenceProps.averages;
				this.serviceSupplies = marketReferenceProps.metaSupplies;
			} else {
				await this.loadSupplies();
			}

			// calculate-quotation
			this.loadRighResult();
			this.loadLeftResult();
			this.loadInitSummary();
			this.validateCheck();

			const summaries = data.QuoteLineItems.map((qli, index) => {
				const initSummary = this.getInitSummary();
				const { Volumen__c, Freight_MXN__c, Month_Volume__c, ...restQli } = qli;
				const customerSites = new CustomerSite(initSummary);
				customerSites.customerSiteId = restQli.Customer_Site_Name__r.Id;
				customerSites.index = index;
				customerSites.volume = Volumen__c;
				customerSites.mxpMt = Freight_MXN__c;
				customerSites.monthVolume = Month_Volume__c;
				customerSites.freightCost = qli.freightCost__c || Freight_MXN__c * Month_Volume__c;
				customerSites.plantId = qli.Almacen_de_Recibo_Almex__c;
				customerSites.transportation = qli.Transportation_Method__c;
				customerSites.freightAddition = qli.Ajuste_a_Flete__c;
				return customerSites;
			});

			this.summaries = summaries;

			this.loadTotalSummary();
		}
	}

	resetProps() {
		this.quotationDate = DateUtils.generateDate();
		this.breakdownHeaders = newObj(breakdownHeaders);
		this.agreementDate = {
			init: DateUtils.generateDate(),
			end: DateUtils.addDays(DateUtils.generateDate(), 1)
		};
		this.rangeDates = DateUtils.getDateRangeDetails(this.agreementDate.init, this.agreementDate.end);
		this.currency = "usd";
		this.leftResults = newObj(resultL);
		this.currentLeftPrice = null;
		this.currentRightPrice = null;
		this.averages = null;
		this.marketAverages = null;
		this.marketReference = newObj(references);
		this.marketReference.cornUsage = this.opp.Uso_del_Maiz__c;
		this.supplies = [];
		this.breakdowns = [];
		this.breakdownClasses = [];
		this.summaries = [];
		this.totalSummaries = null;
		this.checkCompleto = "Check - Incompleto";
		this.checked = true;
		this.link = null;
		this.comments = "";
		this.invoiceSellingPrice = "customer-plant";
		this.globalVolume = newObj(globalVolume);
		this.referenceDate = newObj(referenceDates);
		this.completeClass = "";
		this.loaded = false;
	}

	get quotationOptions() {
		return [
			{ label: "Definitiva", value: "-" },
			{ label: "A", value: "A" },
			{ label: "B", value: "B" },
			{ label: "C", value: "C" },
			{ label: "D", value: "D" }
		];
	}

	get currencyOptions() {
		return [
			{ label: "MXN", value: "mxn" },
			{ label: "USD", value: "usd" }
		];
	}

	get canEditCorn() {
		const validUsers = ["Gerente comercial", "Ejecutivo de ventas", "Administrador del Sistema"];
		return validUsers.includes(this.currentUserProfile);
	}

	get canEditBasis() {
		const validUsers = ["Gerente comercial", "Administrador del Sistema"];
		return validUsers.includes(this.currentUserProfile);
	}

	// click
	copyValue(evt) {
		const value = evt.target.dataset.id;
		navigator.clipboard.writeText(value);
	}

	onClickCornUse(evt) {
		const value = evt.target.dataset.id;
		this.marketReference.cornUsage = value;
		this.loadRighResult();
		this.loadLeftResult();
		this.loadInitSummary();
		this.validateCheck();
	}

	async saveQuote() {
		try {
			this.showToast({
				message: "Estamos registrando todos los valores de su nueva cotización",
				title: "Guardando",
				variant: "success"
			});
			this.canSave = false;
			const { Account, Name, Quote_Version__c } = this.opp;
			const externalId = `M_${Account.Name}_${Name}_${this.quotationDate}_v${Quote_Version__c}`;

			const leftBackup = {
				current: this.currentLeftPrice,
				dataset: this.leftResults
			};
			const rightBackup = {
				current: this.currentRightPrice,
				dataset: this.rightResults
			};

			// Une los porcentages del market reference para convertirlo en un string

			const copyMarketReference = JSON.parse(JSON.stringify(this.marketAverages));
			delete copyMarketReference.realValues;
			const textMarketReference = Object.keys(copyMarketReference)
				.map((i) => `${i.replaceAll("__c", "")}: ${copyMarketReference[i]}`)
				.join(", ");

			const marketReferenceMetadata = JSON.stringify({
				marketAverages: this.marketAverages,
				breakdowns: this.breakdowns,
				supplie: this.supplies,
				averages: this.averages,
				metaSupplies: this.serviceSupplies
			});

			const newQuote = await createManufacturedQuote({
				pricebook: "",
				newQuoteModel: {
					opportunityId: this.recordId,
					name: externalId,
					marketReferenceMetadata,
					listaOracle: this.listaOracle
				},
				quoteConfigs: {
					convertionCurrency: this.marketAverages.Fx__c,
					currentCurrency: "USD",
					comments: this.comments,
					startDate: this.agreementDate.init,
					endDate: this.agreementDate.end,
					totalMonths: this.rangeDates.totalMonths,
					version: this.opp.Quote_Version__c,
					customerDeliv: this.currentLeftPrice.customerDeliv.value,
					exwAlmexUsd: this.currentLeftPrice.exwUsd.value,
					exwAlmexMxn: this.currentLeftPrice.exwMxn.value,
					totalMarginPercentage: this.currentLeftPrice.totalMargin.value,
					totalMarginUsdMt: this.currentLeftPrice.totalMarginUsdMt.value,
					totalMarginUsdDs: this.currentLeftPrice.totalMarginUsdDs.value,
					unitMeasure: "mt",
					totalCostUstMt: this.currentRightPrice.totalCost.value,
					sgaUsdMt: this.currentRightPrice.sgaUsd.value,
					sgaMxnMt: this.currentRightPrice.sgaMxn.value,
					fleteUstMt: this.currentRightPrice.flete.value,
					coproductRecov: this.currentRightPrice.coproductRecov.value,
					additionalCostPercentage: this.currentRightPrice.aditionalCost.value,
					quoteCode: externalId,
					plant: this.invoiceSellingPrice,
					...this.globalVolume,
					...this.referenceDate,
					...this.marketReference,
					leftDataset: JSON.stringify(leftBackup),
					rightDataset: JSON.stringify(rightBackup),
					textMarketReference
				}
			});
			if (newQuote.length > 0) {
				const [quoteId, pricebookId] = newQuote.split("-");
				const newQuoteItemList = this.summaries.map((s) => ({
					productId: this.opp.Producto__c,
					...s.json()
				}));
				const quoteUrl = await createManufacturedQuoteItem({
					pricebookId,
					quoteId,
					newQuoteItemList
				});
				if (quoteUrl) {
					this.link = quoteUrl;
				}
			}
		} catch (error) {
			this.showToast({
				message:
					"Por favor revise que todos los datos fueron rellenados correctamente, datos como precios definitivos, fechas, sucursales y uso del maíz son necesarias.",
				title: "No fue posible realizar esta operación",
				variant: "danger"
			});
			console.log(error);
		} finally {
			this.canSave = true;
		}
	}

	async finishProcess() {
		await refreshApex(this.opp, {
			reRender: true,
			bubbles: true,
			composed: true
		});
		this.dispatchEvent(new RefreshEvent({ bubbles: true, composed: true }));
		this.dispatchEvent(new CloseActionScreenEvent({ bubbles: true, composed: true }));
		window.location.reload();
	}

	onRemoveSite(evt) {
		const id = evt.target.dataset.id;
		this.summaries = this.summaries.filter((s) => s.id !== id);
		this.loadTotalSummary();
	}

	onInputWheel(evt) {
		evt.preventDefault();
	}

	onClickNewSite() {
		try {
			if (this.summaries.length > 0) {
				const requiredFields = ["customerSiteId", "volume"];
				const validSummaries = !this.summaries.every((s) => {
					const isValid = requiredFields.every((field) => s[field]);
					return isValid;
				});
				if (validSummaries) {
					this.showToast({
						title: "Información incompleta",
						message:
							"Es necesario que rellene toda la información requerida de la sucursal para poder crear otra",
						variant: "error"
					});
					return;
				}
			}
			const newSite = this.getInitSummary();
			if (!newSite) {
				this.showToast({
					title: "Datos incompletos",
					message: "Por favor revisa tu información, aún te faltan datos por llenar",
					variant: "error"
				});
			} else {
				const newCustomerSite = new CustomerSite(newSite);
				this.summaries.push(newCustomerSite);
				this.loadTotalSummary();
			}
		} catch (error) {
			console.log(error);
		}
	}

	// inputs
	async onChangeSupplies(evt) {
		try {
			this.isUpdate = true;
			const { value, name, dataset } = evt.target;

			const updatedSupplies = [...this.serviceSupplies].map((ss) => {
				if (ss.Id === dataset.id) ss[name] = value;
				return ss;
			});

			await this.loadSupplies(updatedSupplies);

			this.loadRighResult();
			this.loadLeftResult();
			this.loadInitSummary();
			this.validateCheck();
		} catch (error) {
			console.log(error);
		}
	}

	onChangeReferenceDate(evt) {
		try {
			const { value, name } = evt.target;
			this.referenceDate[name] = value;
			this.validateCheck();
		} catch (error) {
			console.log(error);
		}
	}

	onChangeGlobalVolume(evt) {
		const { value, name } = evt.target;
		this.globalVolume[name] = value;
		this.validateCheck();
	}

	async onChangeInvoiceSellingPrice(evt) {
		this.invoiceSellingPrice = evt.target.value;
		if (evt.target.value === "almex-plant") {
			this.summaries = this.summaries.map((e) => {
				e.mxpMt = 0;
				return e;
			});
		} else {
			const updatedSummaries = this.summaries.map((s) => this.loadCustomerPrice(s.id));
			await Promise.allSettled(updatedSummaries);
		}
		this.validateCheck();
	}

	onChangeComments(evt) {
		this.comments = evt.target.value;
	}

	onChangeReference(evt) {
		const { name, value } = evt.target;
		try {
			this.marketReference[name] = value;

			if (name === "inflation") {
				this.updateBreakdownClasses();
			}

			this.loadRighResult();
			this.loadLeftResult();
			this.loadInitSummary();
			this.validateCheck();
		} catch (error) {
			console.log(error);
		}
	}

	showToast({ title = "Name", message = "Description", variant = "success" }) {
		const event = new ShowToastEvent({
			title,
			message,
			variant
		});
		this.dispatchEvent(event);
	}

	// se activa cuando cambian las fechas de
	async onChangeDate(evt) {
		try {
			switch (evt.target.name) {
				case "initDate":
					this.agreementDate.init = evt.target.value;
					break;
				case "endDate":
					this.agreementDate.end = evt.target.value;
					break;
			}

			// breakdowns
			await this.loadSupplies();

			// calculate-quotation
			this.loadRighResult();
			this.loadLeftResult();
			this.loadInitSummary();
			this.validateCheck();
		} catch (error) {
			console.log(error.message);
		}
	}

	// cuando se actualize una fecha se obtendran suministros y
	// actualizara todas las tablas relacionadas a esta como el de suministros y
	// breakdown
	async loadSupplies(metaSupplies = null) {
		let supplies = metaSupplies?.type === "click" ? null : metaSupplies;
		if (!supplies) {
			const { init, end } = this.agreementDate;
			this.rangeDates = DateUtils.getDateRangeDetails(init, end);
			supplies = await getSupplies({ startDate: init, endDate: end });
			if (supplies.length > 0) {
				const lastItem = supplies[supplies.length - 1].LastModifiedDate;
				this.referenceDate.cornDate = lastItem.split("T")[0];
				this.referenceDate.basisDate = lastItem.split("T")[0];
				this.referenceDate.fxDate = lastItem.split("T")[0];
				this.referenceDate.gasDate = lastItem.split("T")[0];
			}
		}
		this.serviceSupplies = supplies;
		this.marketAverages = marketAverages(supplies);
		this.supplies = parseSupplies(supplies, this.isUpdate);
		const quotes = {
			sgaUsd: this.opp.sgaUst__c || 0,
			coproductRecov: this.rightResults[0]?.coproductRecov?.value || 0,
			exwUsd: this.currentLeftPrice?.exwUsd?.value || 0
		};
		this.breakdownClasses = supplies.map(
			(s) =>
				new BreakdownClass({
					...s,
					...quotes,
					productInfo: this.opp.Producto__r
				})
		);
		this.updateBreakdownClasses();
		this.loadBreakdowns();
		if (!metaSupplies) {
			this.showToast({
				message: "Se han cargado los suministros más recientes al cotizador",
				title: "Carga Exitosa",
				variant: "success"
			});
		}
	}

	// Si algunos de los valores de quotation se actualiza este metodo actualizara todos los valores
	// dentro de la clase para que se actualicen en la tabla de brekdown
	updateBreakdownClasses() {
		const quotes = {
			sgaUsd: this.opp.sgaUst__c || 0,
			coproductRecov: this.rightResults[0]?.coproductRecov?.value || 0,
			exwUsd: this.currentLeftPrice?.exwUsd?.value || 0
		};
		this.breakdownClasses = this.breakdownClasses.map((b) => {
			b.updateQuotes(quotes);
			b.updateInflation(this.marketReference.inflation ?? 0);
			return b;
		});
		this.loadBreakdowns();
	}

	// Actualiza los valores de la tabla de breakdowns a un formato json para que pueda ser leido correctamente
	loadBreakdowns() {
		this.breakdowns = this.breakdownClasses.map((s) => s.toJson());
		// console.log("===========+++++++++++++++++++++++++++++===========");
		// console.log(this.breakdowns.map((b) => b.original));
		// console.log("===========+++++++++++++++++++++++++++++===========");
		this.averages = breakdownAverages(this.breakdowns.map((b) => b.original));
		// console.log("===========+++++++++++++++++++++++++++++===========");
		// console.log("averages");
		// console.log(this.averages);
		// console.log("===========+++++++++++++++++++++++++++++===========");
	}

	onChangeSelect(evt) {
		const { name } = evt.target;
		if (name === "leftPriceSelect") {
			const currentSelected = this.leftResults.find((e) => e.option === evt.target.value);
			this.currentLeftPrice = currentSelected;
		} else if (name === "rightPriceSelect") {
			const currentSelected = this.rightResults.find((e) => e.option === evt.target.value);
			this.currentRightPrice = currentSelected;
		} else {
			const name = evt.target.name;
			const value = evt.detail.value;
			this[name] = value;
		}

		// update breakdown
		this.updateBreakdownClasses();
		this.loadInitSummary();
		this.validateCheck();
	}

	onChangeQuotation(evt) {
		try {
			if (!Boolean(this.marketReference.cornUsage)) {
				this.showToast({
					message:
						"Es importante que ingrese el valor de uso de maíz (Corn Usage) para que los cálculos se realizan correctamente",
					title: "Campo necesario",
					variant: "warning"
				});
			}
			const { value, name } = evt.target;
			const id = evt.target.parentElement.dataset.id;
			if (id.includes("right")) {
				this.rightResults = setValueInQuotation(this.rightResults, name, value, id);
				if (["flete", "coproductRecov"].includes(name)) {
					this.rightResults = replicateValue(this.rightResults, name, value);
				}
				this.loadRighResult();
				this.loadLeftResult();
				if (this.currentRightPrice) {
					this.currentRightPrice = this.rightResults.find((e) => e.key === this.currentRightPrice.key);
				}
			} else if (id.includes("left")) {
				this.leftResults = setValueInQuotation(this.leftResults, name, value, id);
				this.loadRighResult();
				this.loadLeftResult();
				if (this.currentLeftPrice) {
					this.currentLeftPrice = this.leftResults.find((e) => e.key === this.currentLeftPrice.key);
				}
			}
			this.loadInitSummary();
			this.updateBreakdownClasses();
			this.validateCheck();
		} catch (error) {
			console.log(error);
		}
	}

	onFocus(evt) {
		evt.target.select();
	}

	async onChangeSite(evt) {
		try {
			let id = "";
			try {
				id = evt.target.dataset.id;
			} catch (error) {}
			const pickerName = evt.target.name;

			if (pickerName === "customerSiteId") {
				const siteAlreadySelected = this.summaries.findIndex((i) => i.customerSiteId === evt.detail.recordId);
				// console.log(this.summaries);
				// console.log(siteAlreadySelected);
				if (siteAlreadySelected > -1) {
					this.showToast({
						message: "Esta sucursal ya fue seleccionada previamente",
						title: "Sucursal repetida",
						variant: "warning"
					});
				}
			}

			this.summaries = this.summaries.map((e) => {
				if (e.id === id) {
					if (pickerName !== "transportation") {
						e[pickerName] = evt.detail.recordId;
					} else {
						e[pickerName] = evt.target.value;
					}
				}
				return e;
			});

			// already is filled?
			await this.loadCustomerPrice(id);

			this.loadTotalSummary();
			this.validateCheck();
		} catch (error) {
			console.log(error);
		}
	}

	onChangeSummary(evt) {
		try {
			const { name, value, dataset } = evt.target;
			this.summaries = this.summaries.map((e) => {
				if (e.id === dataset.id) {
					e[name] = value;
					if (name === "monthVolume") {
						// console.log("===========+++++++++++++++++++++++++++++===========");
						// console.log(e.freightCost, e[name]);
						// console.log("===========+++++++++++++++++++++++++++++===========");
						e.mxpMt = e.freightCost / e[name];
					}
				}
				return e;
			});
			this.loadTotalSummary();
			this.validateCheck();
		} catch (error) {
			console.log(error);
		}
	}

	// loads
	loadRighResult() {
		this.rightResults = calculateRightQuote(this.rightResults, this.averages, this.marketAverages);
	}

	loadLeftResult() {
		this.leftResults = calculateLeftQuote(
			this.leftResults,
			this.rightResults,
			this.marketAverages,
			this.marketReference
		);
	}

	loadInitSummary() {
		const initSummary = this.getInitSummary();
		this.summaries = this.summaries.map((s) => {
			s.update(initSummary);
			return s;
		});
		this.loadTotalSummary();
	}

	// generate summary
	getInitSummary() {
		try {
			if (!this.currentLeftPrice || !this.currentRightPrice) {
				return false;
			}
			return {
				index: this.summaries.length + 1,
				cost: this.currentRightPrice.totalCost.value,
				margin: this.currentLeftPrice.totalMarginUsdMt.value,
				fxAverage: this.marketAverages.Fx__c
			};
		} catch (error) {
			return false;
		}
	}

	// validate check
	validateCheck() {
		let checked = false;
		try {
			const allDatesFilled = ObjectValidator.isValid(this.referenceDate);
			const cloneGlobalVolume = { ...this.globalVolume };
			cloneGlobalVolume.bookedMtons = Number(cloneGlobalVolume.bookedMtons);
			cloneGlobalVolume.pointsNumebr = Number(cloneGlobalVolume.pointsNumebr);
			const volumeAreEquals = ObjectValidator.areValuesEqual(cloneGlobalVolume, this.totalSummaries, [
				"pointsNumebr=customerSiteId",
				"bookedMtons=volume"
			]);
			const rResult = this.rightResults.find((rr) => rr.option === "A");
			if (allDatesFilled && volumeAreEquals) {
				checked = true;
				// if (this.invoiceSellingPrice === "almex-plant") {
				// 	if (String(rResult.flete.value) === "0") checked = true;
				// } else {
				// 	if (String(rResult.flete.value) !== "0") checked = true;
				// }
			}
		} catch (error) {
			// console.log(error);
			checked = false;
		}

		this.checked = !checked;
		this.completeClass = checked ? "complete-check" : "";
		this.checkCompleto = `Check - ${checked ? "Completo" : "Incompleto"}`;
	}

	// methods
	async loadCustomerPrice(id) {
		const { transportation, plantId, customerSiteId } = this.summaries.find((e) => e.id === id);
		if ([transportation, plantId, customerSiteId].every(Boolean)) {
			try {
				const customerSiteRecord = await getClientSiteById({
					id: customerSiteId
				});
				const { city, stateCode } = customerSiteRecord.Datos_de_direccion__c;
				const flete = await getFleteByParams({
					city,
					state: stateCode,
					plant: plantId,
					transport: transportation,
					moneda: "USD", // Siempre buscara el precio en dolares de ese producto y de nuestro lado lo convertimos a MXN
					initDate: this.agreementDate.init
				});
				if (this.invoiceSellingPrice !== "almex-plant") {
					if (flete.Tipo_de_moneda__c === "MXN") {
						this.summaries = this.summaries.map((e) => {
							if (e.id === id) {
								e.freightCost = flete.Costo_de_flete__c;
								e.mxpMt = flete.Costo_de_flete__c / Number(e.monthVolume);
							}
							return e;
						});
					} else {
						this.summaries = this.summaries.map((e) => {
							if (e.id === id) {
								// console.log("===========+++++++++++++++++++++++++++++===========");
								// console.log({
								// 	convertionPrice,
								// 	costoFlete: flete.Costo_de_flete__c,
								// 	marketReference: this.marketAverages.Fx__c,
								// 	monthVolume: e.monthVolume
								// });
								// console.log("===========+++++++++++++++++++++++++++++===========");
								/**
								 * El valor del dolar que viene desde SF se pasa a pesos para
								 * luego poder calcular el precio por mes del flete
								 */
								const convertionPrice =
									Number(flete.Costo_de_flete__c) * Number(this.marketAverages.Fx__c);
								e.freightCost = convertionPrice;
								// Calculo del precio del dolar en pesos / cantidad de meses ingresada
								e.mxpMt = convertionPrice / Number(e.monthVolume);
							}
							return e;
						});
					}
				} else {
					this.summaries = this.summaries.map((e) => {
						if (e.id === id) {
							e.mxpMt = 0;
						}
						return e;
					});
				}
			} catch (error) {
				this.showToast({
					title: "Flete no encontrado",
					message:
						"No se encontró ningún flete que coincida con el almacén, sucursal del cliente y tipo de transporte, por favor agregue el registro.",
					variant: "warning"
				});
				this.summaries = this.summaries.map((e) => {
					if (e.id === id) e.mxpMt = 0;
					return e;
				});
			}
		}
	}

	loadTotalSummary() {
		this.totalSummaries = sumObject(this.summaries);
		const result = sumProductDivide(this.summaries, ["monthVolume", "finalFreight", "monthVolume"]);
		const isNotAlmexPlant = this.invoiceSellingPrice !== "almex-plant";
		this.rightResults = this.rightResults.map((rr) => {
			rr.flete.value = isNotAlmexPlant ? truncate(result, 3) : 0;
			return rr;
		});
		if (this.currentRightPrice) {
			this.currentRightPrice = this.rightResults.find((e) => e.key === this.currentRightPrice.key);
		}
		this.updateBreakdownClasses();
		this.loadLeftResult();
		this.validateCheck();
	}
}

function setValueInQuotation(items, name, value, key) {
	return items.map((r) => {
		if (r.key === key) {
			return { ...r, [name]: { ...r[name], value: value } };
		}
		return r;
	});
}

function replicateValue(items, field, value) {
	return items.map((i) => {
		i[field] = { ...i[field], value };
		return i;
	});
}

function parseToNumber(obj, exclude = []) {
	const result = {};
	const keys = Object.keys(obj);
	keys.forEach((e) => {
		if (!exclude.includes(e)) {
			result[e] = Number(obj[e]);
		} else {
			result[e] = obj[e];
		}
	});
	return result;
}

function calculateLeftQuote(items, right, market, reference) {
	const customerDeliv = "ABCD";
	const exwAlmexUsd = "AB";
	const exwAlmexUsdC = "C";
	const exwAlmexMxn = "ABCD";
	const totalMargin = "ABD";
	const totalMarginMt = "CD";
	const totalMarginDs = "ABCD";

	return items.map((i) => {
		const rightItem = right.find((r) => r.option === i.option);
		if (exwAlmexUsd.includes(i.option)) {
			i.exwUsd = {
				...i.exwUsd,
				value: truncate(Number(rightItem.totalCost.value) + Number(i.totalMarginUsdMt.value), 2)
			};
		}
		if (exwAlmexUsdC.includes(i.option)) {
			const totalMargin = Number(i.totalMargin.value) !== 0 ? Number(i.totalMargin.value) / 100 : 0;
			i.exwUsd = {
				...i.exwUsd,
				value: truncate(Number(rightItem.totalCost.value) / (1 - totalMargin), 2)
			};
		}
		if (exwAlmexMxn.includes(i.option)) {
			i.exwMxn = {
				...i.exwMxn,
				value: truncate(Number(i.exwUsd.value) * Number(market.realValues.Fx__c), 2)
			};
		}
		if (customerDeliv.includes(i.option)) {
			i.customerDeliv = {
				...i.customerDeliv,
				value: truncate(Number(i.exwUsd.value) + Number(rightItem.flete.value), 2)
			};
		}
		if (totalMarginMt.includes(i.option)) {
			i.totalMarginUsdMt = {
				...i.totalMarginUsdMt,
				value: (+Number(i.exwUsd.value) - Number(rightItem.totalCost.value)).toFixed(2)
			};
		}
		if (totalMargin.includes(i.option)) {
			i.totalMargin = {
				...i.totalMargin,
				value: round((Number(i.totalMarginUsdMt.value) / Number(i.exwUsd.value)) * 100, 1)
			};
		}
		if (totalMarginDs.includes(i.option)) {
			i.totalMarginUsdDs = {
				...i.totalMarginUsdDs,
				value: round(Number(i.totalMarginUsdMt.value) / Number(reference.cornUsage), 3)
			};
		}
		return i;
	});
}

function calculateRightQuote(items, average, market) {
	const avg = parseToNumber(average, ["month"]);
	const totalCostUsd = avg.netCornCostUsdGlobal + avg.cogsUsdGlobal + avg.cogsFixedUSD + avg.sgaExpensesUSD;
	console.log({ avg });
	return items.map((r) => {
		r.totalCost = {
			...r.totalCost,
			value: round(totalCostUsd * (1 + r.aditionalCost.value / 100), 2, true, 3)
		};
		r.sgaMxn = {
			...r.sgaMxn,
			value: round(r.sgaUsd.value * parseFloat(market.Fx__c), 3)
		};
		r.sgaUsd = {
			...r.sgaUsd,
			value: round(avg.sgaExpensesUSD, 3)
		};
		return r;
	});
}

function marketAverages(e) {
	const result = averages(e);
	return {
		Corn__c: round(result.Corn__c, 4),
		Basis__c: round(result.Basis__c, 2),
		Fx__c: round(result.Fx__c, 4),
		Gas__c: truncate(result.Gas__c, 4),
		realValues: result
	};
}

function breakdownAverages(e) {
	const result = averages(e);
	return {
		basis: result.basis,
		gas: result.gas,
		cornPricePerBushelUSD: round(result.cornPricePerBushelUSD, 4),
		exchangeRate: round(result.exchangeRate, 2),
		month: "Average",
		sellingPriceLabAlmexUSDPerMT: round(result.sellingPriceLabAlmexUSDPerMT, 2),
		netCornCostUSDFixed: round(result.netCornCostUSDFixed, 2),
		cogsVariableUSD: round(result.cogsVariableUSD, 2),
		cogsFixedUSD: round(result.cogsFixedWithInflation, 2),
		sgaExpensesUSD: round(result.sgaExpensesUSDWithInflation, 2),
		netCornCostUSD: round(result.netCornCostUSD, 2),
		cogsUsd: round(result.cogsUsd, 2),
		variableMargin: round(result.variableMargin, 2),
		directMargin: round(result.directMargin, 2),
		directMarginPercentage: round(result.directMarginPercentage, 0),
		pbitUSD: round(result.pbitUSD, 2),
		pbitPercentage: round(result.pbitPercentage, 0),
		monthlyCostUSDPerMT: round(result.monthlyCostUSDPerMT, 2),
		netCornCostPerBushelUSD: round(result.netCornCostPerBushelUSD, 2),
		cogsVariablePerBushelUSD: round(result.cogsVariablePerBushelUSD, 2),
		netCornCostUsdGlobal: round(result.netCornCostUsdGlobal, 2),
		cogsUsdGlobal: round(result.cogsUsdGlobal, 2),
		cogsFixedPerBushelUSD: round(result.cogsFixedPerBushelUSD, 2)
	};
}