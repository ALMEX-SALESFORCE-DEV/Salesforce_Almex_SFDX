import { LightningElement, api } from 'lwc';
import { getAgendaActivityDetail } from 'c/agendaServices';
import { resolveMexicanState } from 'c/agendaUtils';

export default class VisitLogActivityModal extends LightningElement {
    @api activityId;

    isLoading = true;
    errorMessage = '';
    activity = {};

    connectedCallback() {
        this.loadActivityDetail();
    }

    get hasExceptionJustification() {
        return Boolean(this.activity.exceptionJustification);
    }

    get hasRecordJustification() {
        return Boolean(this.activity.recordJustification);
    }

    get hasOriginalActivity() {
        return Boolean(this.activity.originalFolio);
    }

    get showFrequencyIndicator() {
        return ['Llamada', 'Visitas urgentes'].includes(
            this.activity.activityType
        );
    }

    async loadActivityDetail() {
        this.isLoading = true;
        this.errorMessage = '';

        try {
            const record = await getAgendaActivityDetail(this.activityId);

            this.activity = this.mapActivityDetail(record);
        } catch (error) {
            this.errorMessage = error?.message ||
                'No fue posible cargar el detalle de la actividad.';
        } finally {
            this.isLoading = false;
        }
    }

    mapActivityDetail(record) {
        const branchName = record?.Sucursal__r?.Name || '';
        const clientName = record?.Sucursal__r?.Cuenta__r?.Name || '';
        const prospectName = record?.Prospecto__c || '';

        return {
            title: record?.Titulo__c || '',
            activityType: record?.Tipo_de_actividad__c || 'Actividad',
            executiveName: record?.Ejecutivo__c || '',
            dateValue: record?.Fecha__c || '',
            relationshipLabel: branchName ? 'Cliente' : 'Prospecto',
            relationshipName: branchName ? clientName : prospectName,
            branchName,
            state: resolveMexicanState(record?.Estado__c),
            city: record?.Ciudad__c || '',
            followUp: record?.Seguimiento__c === true,
            exceptionJustification:
                record?.Justificacion_de_excepcion__c || '',
            notes: record?.Notas__c || '',
            folio: record?.Name || '',
            status: record?.Estatus__c || '',
            recordJustification: record?.Justificacion__c || '',
            originalFolio: record?.Actividad_Original__r?.Name || '',
            frequencyLabel: record?.Cuenta_para_frecuencia__c
                ? 'Sí'
                : 'No'
        };
    }

    handleClose() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    handleRetry() {
        this.loadActivityDetail();
    }
}
