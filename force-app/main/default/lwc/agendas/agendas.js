import { LightningElement } from 'lwc';
import canViewActivityBreakdownApex from '@salesforce/apex/ALMEX_AgendaDataController.canViewActivityBreakdown';

export default class Agendas extends LightningElement {
    activeTabValue = 'calendar';
    activityBreakdownInitialized = false;
    visitLogInitialized = false;
    calendarMonthDate = '';
    activityBreakdownRefreshToken = 0;
    visitLogRefreshToken = 0;
    canViewActivityBreakdown = false;

    connectedCallback() {
        this.loadActivityBreakdownAccess();
    }

    async loadActivityBreakdownAccess() {
        try {
            this.canViewActivityBreakdown =
                await canViewActivityBreakdownApex();
        } catch (error) {
            this.canViewActivityBreakdown = false;
            console.error(
                'Error validando el acceso al desglose de actividades:',
                error
            );
        }
    }

    handleCalendarMonthChange(event) {
        this.calendarMonthDate = event.detail?.monthDate || '';
    }

    get calendarTabClass() {
        return this.getTabClass('calendar');
    }

    get activityBreakdownTabClass() {
        return this.getTabClass('activities');
    }

    get visitLogTabClass() {
        return this.getTabClass('suggestions');
    }

    get isCalendarTabSelected() {
        return this.activeTabValue === 'calendar' ? 'true' : 'false';
    }

    get isActivityBreakdownTabSelected() {
        return this.activeTabValue === 'activities' ? 'true' : 'false';
    }

    get isVisitLogTabSelected() {
        return this.activeTabValue === 'suggestions' ? 'true' : 'false';
    }

    get isCalendarPanelHidden() {
        return this.activeTabValue !== 'calendar';
    }

    get isActivityBreakdownPanelHidden() {
        return this.activeTabValue !== 'activities';
    }

    get isVisitLogPanelHidden() {
        return this.activeTabValue !== 'suggestions';
    }

    getTabClass(tabValue) {
        return `agenda-tab agenda-tab-${tabValue}` +
            (this.activeTabValue === tabValue ? ' is-active' : '');
    }

    handleTabSelect(event) {
        this.activateTab(event.currentTarget.dataset.tab);
    }

    handleTabKeydown(event) {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
            return;
        }

        event.preventDefault();

        const availableTabs = ['calendar'];

        if (this.canViewActivityBreakdown) {
            availableTabs.push('activities');
        }

        availableTabs.push('suggestions');

        const currentIndex = availableTabs.indexOf(this.activeTabValue);
        let nextIndex = currentIndex;

        if (event.key === 'Home') {
            nextIndex = 0;
        } else if (event.key === 'End') {
            nextIndex = availableTabs.length - 1;
        } else if (event.key === 'ArrowRight') {
            nextIndex = (currentIndex + 1) % availableTabs.length;
        } else {
            nextIndex = (currentIndex - 1 + availableTabs.length) % availableTabs.length;
        }

        const nextTab = availableTabs[nextIndex];

        this.activateTab(nextTab);

        requestAnimationFrame(() => {
            this.template.querySelector(
                `[data-tab="${nextTab}"]`
            )?.focus();
        });
    }

    activateTab(tabValue) {
        if (
            tabValue === 'activities' &&
            !this.canViewActivityBreakdown
        ) {
            return;
        }

        this.activeTabValue = tabValue;

        if (tabValue === 'activities') {
            this.activityBreakdownInitialized = true;
            this.activityBreakdownRefreshToken += 1;
        }

        if (tabValue === 'suggestions') {
            this.visitLogInitialized = true;
            this.visitLogRefreshToken += 1;
        }
    }
}
