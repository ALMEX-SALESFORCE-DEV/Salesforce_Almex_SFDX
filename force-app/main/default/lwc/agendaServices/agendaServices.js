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
import searchActivityClientsApex from '@salesforce/apex/ALMEX_AgendaDataController.searchActivityClients';
import getActivityClientBranchesApex from '@salesforce/apex/ALMEX_AgendaDataController.getActivityClientBranches';
import searchCurrentUserProspectsApex from '@salesforce/apex/ALMEX_AgendaDataController.searchCurrentUserProspects';
import searchManagementBranchesApex from '@salesforce/apex/ALMEX_AgendaDataController.searchManagementBranches';
import searchManagementClientsApex from '@salesforce/apex/ALMEX_AgendaDataController.searchManagementClients';
import searchManagementProspectsApex from '@salesforce/apex/ALMEX_AgendaDataController.searchManagementProspects';
import improveAgendaTextApex from '@salesforce/apex/ALMEX_AgendaDataController.improveAgendaText';
import getAgendaAiCandidatesApex from '@salesforce/apex/ALMEX_AgendaDataController.getAgendaAiCandidates';
import { normalizeAgendaActivityType } from 'c/agendaUtils';

// Solo metadatos de modelos en memoria; nunca se cachean notas ni propuestas.
const AI_CATALOG_TTL_MS = 15 * 60 * 1000;
const MANUAL_BRANCH_NOTES_PREFIX = 'Sucursal (captura manual): ';
let aiCatalogPromise;
let aiCatalogExpiresAt = 0;

function getCachedAgendaAiCandidates() {
    if (aiCatalogPromise && Date.now() < aiCatalogExpiresAt) {
        return aiCatalogPromise;
    }
    aiCatalogExpiresAt = Date.now() + AI_CATALOG_TTL_MS;
    const pending = runApex(getAgendaAiCandidatesApex).then(candidates => {
        if (!Array.isArray(candidates) || candidates.length === 0) {
            throw new Error('No hay modelos gratuitos con la privacidad requerida disponibles.');
        }
        return candidates;
    }).catch(error => {
        if (aiCatalogPromise === pending) {
            aiCatalogPromise = undefined;
            aiCatalogExpiresAt = 0;
        }
        throw error;
    });
    aiCatalogPromise = pending;
    return pending;
}

function normalizeActivityRecord(record) {
    if (!record) return record;
    const normalized = {
        ...record,
        Tipo_de_actividad__c: normalizeAgendaActivityType(record.Tipo_de_actividad__c)
    };
    // La captura libre se conserva en Notas, sin modificar el lookup ni el objeto.
    const notes = String(record.Notas__c || '');
    if (record.Cliente__c && !record.Sucursal__c && notes.startsWith(MANUAL_BRANCH_NOTES_PREFIX)) {
        const lines = notes.split(/\r?\n/);
        normalized.manualBranchName = lines.shift().slice(MANUAL_BRANCH_NOTES_PREFIX.length);
        normalized.Notas__c = lines.join('\n').replace(/^\n/, '');
    }
    return normalized;
}

export function createAgendaActivity(formData) {
    const manualBranchName = formData.clientId && !formData.branchId
        ? String(formData.manualBranchName || '').replace(/[\r\n]+/g, ' ').trim()
        : '';
    let notes = String(formData.notes || '').trim();
    if (manualBranchName) {
        notes = `${MANUAL_BRANCH_NOTES_PREFIX}${manualBranchName}${notes ? `\n\n${notes}` : ''}`;
    }
    if (notes.length > 32768) {
        throw new Error('Las notas y el nombre de la sucursal superan el límite de 32768 caracteres.');
    }
    return runApex(createActivityApex, {
        title: formData.title,
        activityType: formData.activityType,
        activityDate: formData.date,
        state: formData.state || null,
        city: formData.city || null,
        prospectId: formData.prospectId || null,
        branchId: formData.branchId || null,
        clientId: formData.clientId || null,
        followUp: Boolean(formData.followUp),
        notes: notes || null,
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
            activityTypes: filters.activityTypes || [],
            states: filters.states || [],
            branchId: filters.branchId || null,
            accountId: filters.accountId || null,
            prospect: filters.prospect || null,
            followUps: filters.followUps || [],
            statuses: filters.statuses || [],
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
    const candidateModels = await getCachedAgendaAiCandidates();
    try {
        return await runApex(improveAgendaTextApex, {
            originalText,
            context,
            candidateModels
        });
    } catch (error) {
        // Un catálogo obsoleto no queda fijado: el siguiente clic lo renueva.
        // No se reenvía automáticamente el texto tras un error de cuota.
        aiCatalogPromise = undefined;
        aiCatalogExpiresAt = 0;
        throw error;
    }
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

export async function searchActivityClients(searchTerm) {
    return (await runApex(searchActivityClientsApex, { searchTerm })) || [];
}

export async function getActivityClientBranches(clientId) {
    return (await runApex(getActivityClientBranchesApex, { clientId })) || [];
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

export async function searchManagementClients(searchTerm) {
    const clients = await runApex(searchManagementClientsApex, { searchTerm });
    return clients || [];
}
