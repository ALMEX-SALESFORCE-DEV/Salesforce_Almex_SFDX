import { LightningElement, api, track } from "lwc";
import { FlowAttributeChangeEvent } from "lightning/flowSupport";
import FORM_FACTOR from "@salesforce/client/formFactor";

export default class PdfScreenFlow extends LightningElement {
	@api recordId = "";
	@api pdfName = "";
	@api formFactor = "";
	@track srcPdf = "";

	connectedCallback() {
		this.setFormFactor();
		this.srcPdf = `/apex/${this.pdfName}?Id=${this.recordId}`;
	}

	setFormFactor() {
		const attributeChangeEvent = new FlowAttributeChangeEvent("formFactor", FORM_FACTOR);
		this.dispatchEvent(attributeChangeEvent);
	}
}