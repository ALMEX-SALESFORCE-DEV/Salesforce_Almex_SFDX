import createActivityApex from '@salesforce/apex/ALMEX_AgendaDataController.createActivity';
import completeActivityApex from '@salesforce/apex/ALMEX_AgendaDataController.completeActivity';
import updateActivityDetailsApex from '@salesforce/apex/ALMEX_AgendaDataController.updateActivityDetails';
import cancelActivityApex from '@salesforce/apex/ALMEX_AgendaDataController.cancelActivity';
import rescheduleActivityApex from '@salesforce/apex/ALMEX_AgendaDataController.rescheduleActivity';
import getCurrentUserActivitiesApex from '@salesforce/apex/ALMEX_AgendaDataController.getCurrentUserActivities';
import getActivityDetailApex from '@salesforce/apex/ALMEX_AgendaDataController.getActivityDetail';
import getManagementActivitiesApex from '@salesforce/apex/ALMEX_AgendaDataController.getManagementActivities';
import getAlmexSupplyAgreementsApex from '@salesforce/apex/ALMEX_AgendaDataController.getAlmexSupplyAgreements';
import getCurrentUserBranchesApex from '@salesforce/apex/ALMEX_AgendaDataController.getCurrentUserBranches';
import searchCurrentUserProspectsApex from '@salesforce/apex/ALMEX_AgendaDataController.searchCurrentUserProspects';
import searchManagementBranchesApex from '@salesforce/apex/ALMEX_AgendaDataController.searchManagementBranches';
import searchManagementProspectsApex from '@salesforce/apex/ALMEX_AgendaDataController.searchManagementProspects';
import improveAgendaTextApex from '@salesforce/apex/ALMEX_AgendaDataController.improveAgendaText';
import { normalizeAgendaActivityType } from 'c/agendaUtils';

function normalizeActivityRecord(record) {
    return record ? {
        ...record,
        Tipo_de_actividad__c: normalizeAgendaActivityType(record.Tipo_de_actividad__c)
    } : record;
}

export function createAgendaActivity(formData) {
    return runApex(createActivityApex, {
        title: formData.title,
        activityType: formData.activityType,
        activityDate: formData.date,
        state: formData.state || null,
        city: formData.city || null,
        prospectId: formData.prospectId || null,
        branchId: formData.branchId || null,
        followUp: Boolean(formData.followUp),
        notes: formData.notes || null,
        countsTowardFrequency: Boolean(formData.countsTowardFrequency),
        exceptionJustification: formData.exceptionJustification || null,
        manualProspectName: formData.manualProspectName || null
    });
}

export function completeAgendaActivity(
    activityId,
    followUpResolution = null
) {
    return runApex(completeActivityApex, {
        activityId,
        followUpResolution: followUpResolution || null
    });
}

export function updateAgendaActivityDetails(
    activityId,
    followUp,
    notes,
    exceptionJustification
) {
    return runApex(updateActivityDetailsApex, {
        activityId,
        followUp: Boolean(followUp),
        notes: notes || null,
        exceptionJustification: exceptionJustification || null
    });
}

export function cancelAgendaActivity(activityId, justification) {
    return runApex(cancelActivityApex, {
        activityId,
        justification
    });
}

export function rescheduleAgendaActivity(
    activityId,
    newDate,
    justification
) {
    return runApex(rescheduleActivityApex, {
        activityId,
        newDate,
        justification
    });
}

export async function getAgendaActivities(monthDate) {
    const activities = await runApex(
        getCurrentUserActivitiesApex,
        { monthDate }
    );

    return (activities || []).map(normalizeActivityRecord);
}

export async function getAgendaActivityDetail(activityId) {
    return normalizeActivityRecord(await runApex(getActivityDetailApex, { activityId }));
}

export async function getManagementActivities(filters) {
    const response = await runApex(
        getManagementActivitiesApex,
        {
            dateFrom: filters.dateFrom || null,
            dateTo: filters.dateTo || null,
            executives: filters.executives || [],
            activityType: filters.activityType || null,
            state: filters.state || null,
            branchId: filters.branchId || null,
            prospect: filters.prospect || null,
            followUp: filters.followUp,
            status: filters.status || null,
            cursorDate: filters.cursor?.date || null,
            cursorCreatedDate: filters.cursor?.createdDate || null,
            cursorId: filters.cursor?.id || null,
            pageSize: filters.pageSize || 50
        }
    );

    if (response) {
        return { ...response, records: (response.records || []).map(normalizeActivityRecord) };
    }
    return {
        records: [],
        executiveOptions: [],
        totalRecords: 0,
        hasNext: false
    };
}

export async function getAlmexSupplyAgreements() {
    const agreements = await runApex(getAlmexSupplyAgreementsApex);

    return agreements || [];
}

export async function improveAgendaText(originalText, context) {
    return runApex(improveAgendaTextApex, {
        originalText,
        context
    });
}

async function runApex(action, parameters) {
    try {
        return await action(parameters);
    } catch (error) {
        throw new Error(getErrorMessage(error));
    }
}

function getErrorMessage(error) {
    if (Array.isArray(error?.body)) {
        return error.body
            .map(item => item.message)
            .join(', ');
    }

    return (
        error?.body?.message ||
        error?.message ||
        'Ocurrió un error procesando las actividades.'
    );
}

export async function getAssignedBranches() {
    const branches = await runApex(getCurrentUserBranchesApex);

    return branches || [];
}

export async function searchAssignedProspects(searchTerm) {
    const prospects = await runApex(
        searchCurrentUserProspectsApex,
        { searchTerm }
    );

    return prospects || [];
}

export async function searchManagementBranches(searchTerm) {
    const branches = await runApex(
        searchManagementBranchesApex,
        { searchTerm }
    );

    return branches || [];
}

export async function searchManagementProspects(searchTerm) {
    const prospects = await runApex(
        searchManagementProspectsApex,
        { searchTerm }
    );

    return prospects || [];
}
