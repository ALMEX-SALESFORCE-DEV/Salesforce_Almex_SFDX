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

	constructor(init) {
		this.index = Number(init.index);
		this.cost = Number(init.cost);
		this.margin = Number(init.margin);
		this.fxAverage = Number(init.fxAverage);
	}

	get id() {
		return this.#id;
	}

	get visibleMxpMt() {
		return round(this.mxpMt, 3);
	}

	get labAlmex() {
		return round(Number(this.cost) + Number(this.margin), 3);
	}

	get usdMt() {
		return truncate(Number(this.mxpMt) / Number(this.fxAverage), 2, 3);
	}

	get finalFreight() {
		return (Number(this.usdMt) || 0) + (Number(this.freightAddition) || 0);
	}

	get labClient() {
		return truncate(Number(this.labAlmex) + Number(this.finalFreight), 2, 3);
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