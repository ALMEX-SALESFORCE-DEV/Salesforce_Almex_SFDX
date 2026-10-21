import { LightningElement, api } from 'lwc';

export default class VisitLogMonthCell extends LightningElement {
    @api events = [];

    handleActivityClick(event) {
        const activityId = event.currentTarget.dataset.activityId;

        if (!activityId) {
            return;
        }

        this.dispatchEvent(new CustomEvent('activityselect', {
            detail: { activityId },
            bubbles: true,
            composed: true
        }));
    }
}
