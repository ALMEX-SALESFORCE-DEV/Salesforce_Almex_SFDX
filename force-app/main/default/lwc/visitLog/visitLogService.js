import getCurrentUserVisitLogApex from '@salesforce/apex/ALMEX_AgendaDataController.getCurrentUserVisitLog';

export async function getCurrentUserVisitLog() {
    try {
        const response = await getCurrentUserVisitLogApex();

        return response || {
            year: new Date().getFullYear(),
            today: '',
            branches: []
        };
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
        'No fue posible cargar la bitácora de visitas.'
    );
}
