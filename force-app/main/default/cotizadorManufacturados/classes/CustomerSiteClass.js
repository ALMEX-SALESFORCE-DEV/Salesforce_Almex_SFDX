import { truncate, generateUniqueId, round } from "../scripts/utils.js";

class CustomerSite {
	#id = generateUniqueId();
	index = 0;
	customerSiteId = "";
	volume = 0; // input
	mxpMt = 0; // input
	cost = 0;
	margin = 0;
	fxAverage = 0;
	plantId = "";
	transportation = "";
	monthVolume = 1;
	freightAddition = 0;
	freightCost = 0;
	#labClientManual = null; // captura manual de Lab Client (override persistente)

	constructor(init) {
		this.index = Number(init.index);
		this.cost = Number(init.cost);
		this.margin = Number(init.margin);
		this.fxAverage = Number(init.fxAverage);
	}

	get id() {
		return this.#id;
	}

	//TODO: Review
	get visibleMxpMt() {
		return round(this.mxpMt, 3);
	}

	//TODO: Review
	// col08 LAB Almex DERIVADO de Lab Client (col12) menos Freight usd/mt (col09.2
	// = usdMt, sin Ajuste): labAlmex = labClient − usdMt. Al editar Lab Client a
	// mano, LAB Almex se recalcula. Es getter: sumObject() no lo agrega, se suma
	// aparte en loadTotalSummary().
	get labAlmex() {
		return round(Number(this.labClient) - Number(this.usdMt), 3);
	}

	//TODO: Review
	get usdMt() {
		return truncate(Number(this.mxpMt) / Number(this.fxAverage), 2, 3);
	}

	//TODO: Review
	get finalFreight() {
		return (Number(this.usdMt) || 0) + (Number(this.freightAddition) || 0);
	}

	//TODO: Review
	// col12 Lab Client EDITABLE = fuente. Si hay captura manual, esa gana y persiste
	// (no se recalcula al cambiar volumen/flete/precio). Sin captura, default =
	// (cost+margin) + usdMt, de modo que labAlmex (= labClient − usdMt) arranque en
	// cost+margin.
	get labClient() {
		if (this.#labClientManual !== null && this.#labClientManual !== "") {
			return this.#labClientManual;
		}
		return truncate(
			Number(this.cost) + Number(this.margin) + Number(this.usdMt),
			2,
			3
		);
	}

	set labClient(value) {
		this.#labClientManual =
			value === "" || value === null || value === undefined
				? null
				: Number(value);
	}

	update(init) {
		this.index = init.index;
		this.cost = init.cost;
		this.margin = init.margin;
		this.fxAverage = init.fxAverage;
	}

	json() {
		return {
			id: this.#id,
			index: this.index,
			customerSiteName: this.customerSiteId,
			volume: this.volume,
			totalProductCost: this.cost,
			marginManufactured: this.margin,
			labAlmex: this.labAlmex,
			mxpMt: this.mxpMt,
			usdMt: truncate(this.usdMt, 2, 3),
			labClient: this.labClient,
			storage: this.plantId,
			transportation: this.transportation,
			visibleMxpMt: this.visibleMxpMt,
			monthVolume: this.monthVolume,
			finalFreight: this.finalFreight,
			freightAddition: this.freightAddition,
			freightCost: this.freightCost
		};
	}
}

export default CustomerSite;
