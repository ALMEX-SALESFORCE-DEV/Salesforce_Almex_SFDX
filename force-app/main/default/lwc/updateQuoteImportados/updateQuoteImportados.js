import { api, LightningElement, track, wire } from "lwc";
import getQuoteById from "@salesforce/apex/ETC_QuoterImportadosController.getQuoteById";

export default class UpdateQuoteImportados extends LightningElement {
	@api recordId;
	@track recordType = "";
	@track isOilRecord = false;
	@track quote = null;
	isUpdate = true;

	@wire(getQuoteById, { id: "$recordId" })
	quoteRecord(result) {
		if (result.data && this.recordId) {
			this.quote = result;
			this.isOilRecord = result.data.isOilFlag__c;
			this.recordType = result.data.RecordType.DeveloperName;
		}
	}

	get isImportados() {
		return Boolean(!this.isOilRecord && this.recordType === "Cotizacion_Importados");
	}

	get isManufacturados() {
		return Boolean(this.recordType === "Cotizacion_Manufacturado");
	}

	get isOil() {
		return Boolean(this.isOilRecord && this.recordType === "Cotizacion_Importados");
	}
}