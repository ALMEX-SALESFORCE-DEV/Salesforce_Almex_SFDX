import { LightningElement, api, track } from "lwc";

export default class MenuCotizadores extends LightningElement {
	@api recordId;
	@track quoters = { imported: false, manufactured: false, importedOil: false };
	@track showMenu = true;

	onSelectType(evt) {
		evt.stopImmediatePropagation();
		const selected = evt.currentTarget.dataset.id;
		this.quoters[selected] = true;
		this.showMenu = false;
	}

	goBack() {
		this.showMenu = true;
		this.quoters = { imported: false, manufactured: false, importedOil: false };
	}
}