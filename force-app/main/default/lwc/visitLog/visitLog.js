import { LightningElement, api } from 'lwc';
import { getCurrentUserVisitLog } from './visitLogService';
import { buildVisitLogRows } from './visitLogLogic';

// Referencia temporal solicitada para probar la planeación anual.
const TEST_REFERENCE_DATE = '2026-01-01';
const TEST_REFERENCE_YEAR = 2026;
const VISIT_LOG_PAGE_SIZE = 50;

const MEXICAN_STATE_NAMES = [
    'Aguascalientes',
    'Baja California',
    'Baja California Sur',
    'Campeche',
    'Chiapas',
    'Chihuahua',
    'Ciudad de México',
    'Coahuila',
    'Colima',
    'Durango',
    'Estado de México',
    'Guanajuato',
    'Guerrero',
    'Hidalgo',
    'Jalisco',
    'Michoacán',
    'Morelos',
    'Nayarit',
    'Nuevo León',
    'Oaxaca',
    'Puebla',
    'Querétaro',
    'Quintana Roo',
    'San Luis Potosí',
    'Sinaloa',
    'Sonora',
    'Tabasco',
    'Tamaulipas',
    'Tlaxcala',
    'Veracruz',
    'Yucatán',
    'Zacatecas'
];

const STATE_FILTER_OPTIONS = [
    { label: 'Todos los estados', value: '' },
    ...MEXICAN_STATE_NAMES.map(state => ({ label: state, value: state }))
];

const PROGRESS_FILTER_OPTIONS = [
    { label: 'Todos los avances', value: '' },
    { label: 'Sin avance (0 de X)', value: 'none' },
    { label: 'Con avance (1 o más)', value: 'with' }
];

const STATUS_FILTER_OPTIONS = [
    { label: 'Todos los status', value: '' },
    { label: 'Atrasado', value: 'Atrasado' },
    { label: 'Por vencer', value: 'Por vencer' },
    { label: 'Al corriente', value: 'Al corriente' },
    { label: 'Sin frecuencia', value: 'Sin frecuencia' }
];

const ACTIVITY_FILTER_OPTIONS = [
    {
        label: 'Realizada',
        value: 'completed',
        markerClass:
            'visit-log-filter-marker visit-log-filter-marker-completed'
    },
    {
        label: 'Programada',
        value: 'scheduled',
        markerClass:
            'visit-log-filter-marker visit-log-filter-marker-scheduled'
    },
    {
        label: 'Llamada',
        value: 'call',
        markerClass: 'visit-log-filter-marker visit-log-filter-marker-call'
    },
    {
        label: 'Visitas urgentes',
        value: 'extraordinary',
        markerClass:
            'visit-log-filter-marker visit-log-filter-marker-extraordinary'
    }
];

const MONTHS = [
    'Ene',
    'Feb',
    'Mar',
    'Abr',
    'May',
    'Jun',
    'Jul',
    'Ago',
    'Sep',
    'Oct',
    'Nov',
    'Dic'
];

const MONTH_COLUMNS = MONTHS.map((label, index) => ({
    label,
    fieldName: `month${index}Events`,
    type: 'visitMonth',
    initialWidth: 66,
    sortable: true,
    hideDefaultActions: true,
    typeAttributes: {
        events: { fieldName: `month${index}Events` }
    },
    cellAttributes: {
        alignment: 'center'
    }
}));

const BITACORA_COLUMNS = [
    {
        label: 'Sucursal / Cliente',
        fieldName: 'branchClientLabel',
        type: 'text',
        initialWidth: 230,
        sortable: true,
        hideDefaultActions: true,
        wrapText: true
    },
    {
        label: 'Ubicación',
        fieldName: 'location',
        type: 'text',
        initialWidth: 190,
        sortable: true,
        hideDefaultActions: true,
        wrapText: true
    },
    {
        label: 'Frecuencia anual',
        fieldName: 'frequencyLabel',
        type: 'text',
        initialWidth: 140,
        sortable: true,
        hideDefaultActions: true
    },
    {
        label: 'Avance',
        fieldName: 'progressLabel',
        type: 'visitProgress',
        initialWidth: 140,
        sortable: true,
        hideDefaultActions: true,
        typeAttributes: {
            label: { fieldName: 'progressLabel' },
            progressStyle: { fieldName: 'progressStyle' }
        }
    },
    {
        label: 'Última visita',
        fieldName: 'lastVisitLabel',
        type: 'text',
        initialWidth: 135,
        sortable: true,
        hideDefaultActions: true
    },
    {
        label: 'Próxima visita sugerida',
        fieldName: 'nextVisitLabel',
        type: 'visitNextDate',
        initialWidth: 145,
        sortable: true,
        hideDefaultActions: true,
        typeAttributes: {
            label: { fieldName: 'nextVisitLabel' },
            textStyle: { fieldName: 'nextVisitStyle' }
        }
    },
    {
        label: 'Status',
        fieldName: 'statusLabel',
        type: 'visitStatus',
        initialWidth: 135,
        sortable: true,
        hideDefaultActions: true,
        typeAttributes: {
            label: { fieldName: 'statusLabel' },
            pillStyle: { fieldName: 'statusStyle' }
        }
    },
    ...MONTH_COLUMNS
];

const SUGGESTION_COLUMNS = [
    {
        ...BITACORA_COLUMNS[0],
        label: 'Cliente Sucursal'
    },
    BITACORA_COLUMNS[1],
    BITACORA_COLUMNS[2],
    BITACORA_COLUMNS[3],
    BITACORA_COLUMNS[4],
    BITACORA_COLUMNS[6]
];

export default class VisitLog extends LightningElement {
    allRows = [];
    filteredRows = [];
    rows = [];
    columns = BITACORA_COLUMNS;
    scheduledVisits = [];
    selectedScheduledActivityId = '';
    selectedActivityDetailId = '';
    summaryMetrics = {
        assignedBranches: 0,
        completedVisits: 0,
        annualCompliance: 0,
        scheduledVisits: 0
    };
    stateFilterOptions = STATE_FILTER_OPTIONS;
    progressFilterOptions = PROGRESS_FILTER_OPTIONS;
    statusFilterOptions = STATUS_FILTER_OPTIONS;
    isLoading = true;
    errorMessage = '';
    searchTerm = '';
    stateFilter = '';
    progressFilter = '';
    statusFilter = '';
    selectedActivityFilters = [];
    isActivityFilterOpen = false;
    sortedBy = 'branchClientLabel';
    sortDirection = 'asc';
    isSuggestionView = false;
    pageSize = VISIT_LOG_PAGE_SIZE;
    currentPage = 1;
    totalFilteredRows = 0;
    loadInProgress = false;
    refreshQueued = false;
    _refreshToken = 0;

    @api
    get refreshToken() {
        return this._refreshToken;
    }

    set refreshToken(value) {
        const nextToken = Number(value) || 0;

        if (nextToken === this._refreshToken) {
            return;
        }

        this._refreshToken = nextToken;
        this.requestVisitLogRefresh();
    }

    requestVisitLogRefresh() {
        if (this.loadInProgress) {
            this.refreshQueued = true;
            return;
        }

        this.loadVisitLog();
    }

    get hasRows() {
        return this.allRows.length > 0;
    }

    get hasVisibleRows() {
        return this.rows.length > 0;
    }

    get hasPaginationResults() {
        return this.totalFilteredRows > 0;
    }

    get totalPages() {
        return Math.max(
            1,
            Math.ceil(this.totalFilteredRows / this.pageSize)
        );
    }

    get pageLabel() {
        return `Página ${this.currentPage} de ${this.totalPages}`;
    }

    get pageSummary() {
        if (!this.totalFilteredRows) {
            return '0 registros';
        }

        const firstRecord = (this.currentPage - 1) * this.pageSize + 1;
        const lastRecord = Math.min(
            firstRecord + this.rows.length - 1,
            this.totalFilteredRows
        );

        return `${firstRecord}-${lastRecord} de ${this.totalFilteredRows}`;
    }

    get isPreviousPageDisabled() {
        return this.currentPage === 1 || this.isLoading;
    }

    get isNextPageDisabled() {
        return this.currentPage >= this.totalPages || this.isLoading;
    }

    get showVisitControls() {
        return !this.isLoading && !this.errorMessage;
    }

    get isBitacoraView() {
        return !this.isSuggestionView;
    }

    get activityFilterOptions() {
        const selectedValues = new Set(this.selectedActivityFilters);

        return ACTIVITY_FILTER_OPTIONS.map(option => ({
            ...option,
            checked: selectedValues.has(option.value)
        }));
    }

    get activityFilterLabel() {
        if (!this.selectedActivityFilters.length) {
            return 'Todas las actividades';
        }

        if (this.selectedActivityFilters.length === 1) {
            return ACTIVITY_FILTER_OPTIONS.find(
                option => option.value === this.selectedActivityFilters[0]
            )?.label || '1 actividad';
        }

        return `${this.selectedActivityFilters.length} actividades`;
    }

    get activityFilterButtonClass() {
        return this.isActivityFilterOpen
            ? 'visit-log-activity-filter-button is-open'
            : 'visit-log-activity-filter-button';
    }

    get tableTitle() {
        return this.isSuggestionView
            ? `Sugerencias de visitas · ${this.selectedScheduledVisit.stateName}`
            : 'Control anual por cliente';
    }

    get emptyTableMessage() {
        return this.isSuggestionView
            ? `No hay sucursales asignadas en ${this.selectedScheduledVisit.stateName}.`
            : 'No se encontraron sucursales que coincidan con la búsqueda.';
    }

    get scheduledVisitOptions() {
        if (!this.scheduledVisits.length) {
            return [{
                label: 'Sin visitas programadas',
                value: ''
            }];
        }

        return this.scheduledVisits.map(visit => ({
            label: visit.optionLabel,
            value: visit.id
        }));
    }

    get hasScheduledVisits() {
        return this.scheduledVisits.length > 0;
    }

    get scheduledVisitSelectDisabled() {
        return !this.hasScheduledVisits;
    }

    get suggestionsButtonDisabled() {
        return this.isSuggestionView ||
            !this.hasScheduledVisits ||
            !this.selectedScheduledVisit.stateName;
    }

    get complianceRingStyle() {
        const completedDegrees =
            this.summaryMetrics.annualCompliance * 3.6;

        return (
            'background:conic-gradient(' +
            `#3277df ${completedDegrees}deg,` +
            `#dce9f9 ${completedDegrees}deg);`
        );
    }

    get selectedScheduledVisit() {
        return this.scheduledVisits.find(
            visit => visit.id === this.selectedScheduledActivityId
        ) || this.scheduledVisits[0] || {
            stateName: '',
            location: 'Sin ubicación',
            dateLabel: 'Sin fecha programada',
            executiveName: 'Sin ejecutivo'
        };
    }

    get tableViewportStyle() {
        const headerHeight = 44;
        const rowHeight = 58;
        const horizontalScrollbarHeight = 18;
        const contentHeight = headerHeight +
            this.rows.length * rowHeight +
            horizontalScrollbarHeight;

        return `height:${Math.min(520, contentHeight)}px;`;
    }

    renderedCallback() {
        const filterValues = {
            state: this.stateFilter,
            progress: this.progressFilter,
            status: this.statusFilter
        };

        Object.entries(filterValues).forEach(([filterName, value]) => {
            const field = this.template.querySelector(
                `[data-filter="${filterName}"]`
            );

            if (field && field.value !== value) {
                field.value = value;
            }
        });
    }

    async loadVisitLog() {
        this.loadInProgress = true;
        this.isLoading = true;
        this.errorMessage = '';

        await new Promise(resolve => {
            setTimeout(resolve, 0);
        });

        try {
            const response = await getCurrentUserVisitLog();
            const testResponse = {
                ...response,
                today: TEST_REFERENCE_DATE,
                year: TEST_REFERENCE_YEAR
            };

            this.allRows = buildVisitLogRows(testResponse);
            this.summaryMetrics = buildSummaryMetrics(
                response,
                this.allRows
            );
            this.scheduledVisits = buildScheduledVisits(
                response,
                this.allRows,
                TEST_REFERENCE_DATE
            );

            if (!this.scheduledVisits.some(
                visit => visit.id === this.selectedScheduledActivityId
            )) {
                this.selectedScheduledActivityId =
                    this.scheduledVisits[0]?.id || '';
            }

            this.applyTableView();
        } catch (error) {
            console.error('Error cargando bitácora de visitas:', error);
            this.allRows = [];
            this.filteredRows = [];
            this.rows = [];
            this.currentPage = 1;
            this.totalFilteredRows = 0;
            this.scheduledVisits = [];
            this.selectedScheduledActivityId = '';
            this.summaryMetrics = {
                assignedBranches: 0,
                completedVisits: 0,
                annualCompliance: 0,
                scheduledVisits: 0
            };
            this.errorMessage = error?.message ||
                'No fue posible cargar la bitácora de visitas.';
        } finally {
            this.isLoading = false;
            this.loadInProgress = false;

            if (this.refreshQueued) {
                this.refreshQueued = false;
                this.requestVisitLogRefresh();
            }
        }
    }

    handleRetry() {
        this.requestVisitLogRefresh();
    }

    handleSearch(event) {
        this.searchTerm = event.target.value || '';
        this.applyTableView();
    }

    handleScheduledVisitChange(event) {
        this.selectedScheduledActivityId = event.detail.value;

        if (this.isSuggestionView) {
            this.stateFilter = this.selectedScheduledVisit.stateName;
            this.applyTableView();
        }
    }

    handleStateFilterChange(event) {
        this.stateFilter = event.detail?.value ?? event.target.value;
        this.applyTableView();
    }

    handleProgressFilterChange(event) {
        this.progressFilter = event.detail?.value ?? event.target.value;
        this.applyTableView();
    }

    handleStatusFilterChange(event) {
        this.statusFilter = event.detail?.value ?? event.target.value;
        this.applyTableView();
    }

    handleActivitySelect(event) {
        event.stopPropagation();

        const activityId = event.detail?.activityId;

        if (!activityId) {
            return;
        }

        this.selectedActivityDetailId = activityId;
    }

    handleCloseActivityDetail() {
        this.selectedActivityDetailId = '';
    }

    handleToggleActivityFilter() {
        this.isActivityFilterOpen = !this.isActivityFilterOpen;
    }

    handleActivityFilterChange(event) {
        const selectedValue = event.target.value;
        const selectedValues = new Set(this.selectedActivityFilters);

        if (event.target.checked) {
            selectedValues.add(selectedValue);
        } else {
            selectedValues.delete(selectedValue);
        }

        this.selectedActivityFilters = ACTIVITY_FILTER_OPTIONS
            .map(option => option.value)
            .filter(value => selectedValues.has(value));
        this.applyTableView();
    }

    handleActivityFilterBlur(event) {
        if (
            event.relatedTarget &&
            event.currentTarget.contains(event.relatedTarget)
        ) {
            return;
        }

        this.isActivityFilterOpen = false;
    }

    handleShowSuggestions() {
        if (this.suggestionsButtonDisabled) {
            return;
        }

        this.isSuggestionView = true;
        this.columns = SUGGESTION_COLUMNS;
        this.searchTerm = '';
        this.stateFilter = this.selectedScheduledVisit.stateName;
        this.progressFilter = '';
        this.statusFilter = '';
        this.selectedActivityFilters = [];
        this.isActivityFilterOpen = false;
        this.sortedBy = 'statusLabel';
        this.sortDirection = 'asc';
        this.applyTableView();
    }

    handleClearSuggestions() {
        this.isSuggestionView = false;
        this.columns = BITACORA_COLUMNS;
        this.searchTerm = '';
        this.stateFilter = '';
        this.progressFilter = '';
        this.statusFilter = '';
        this.selectedActivityFilters = [];
        this.isActivityFilterOpen = false;
        this.sortedBy = 'branchClientLabel';
        this.sortDirection = 'asc';
        this.applyTableView();
    }

    handleSort(event) {
        this.sortedBy = event.detail.fieldName;
        this.sortDirection = event.detail.sortDirection;
        this.applyTableView();
    }

    handlePreviousPage() {
        if (this.isPreviousPageDisabled) {
            return;
        }

        this.currentPage -= 1;
        this.updateVisiblePage();
    }

    handleNextPage() {
        if (this.isNextPageDisabled) {
            return;
        }

        this.currentPage += 1;
        this.updateVisiblePage();
    }

    applyTableView() {
        const normalizedSearch = normalizeSearchValue(this.searchTerm);
        const suggestionState = normalizeSearchValue(
            this.selectedScheduledVisit.stateName
        );
        const selectedState = normalizeSearchValue(this.stateFilter);
        const selectedActivityFilters = new Set(
            this.selectedActivityFilters
        );
        let visibleRows = this.allRows.filter(row => {
            if (
                this.isSuggestionView &&
                normalizeSearchValue(row.stateName) !== suggestionState
            ) {
                return false;
            }

            if (
                selectedState &&
                normalizeSearchValue(row.stateName) !== selectedState
            ) {
                return false;
            }

            if (
                this.progressFilter === 'none' &&
                row.completedCount !== 0
            ) {
                return false;
            }

            if (
                this.progressFilter === 'with' &&
                row.completedCount < 1
            ) {
                return false;
            }

            if (
                this.statusFilter &&
                row.statusLabel !== this.statusFilter
            ) {
                return false;
            }

            if (
                selectedActivityFilters.size > 0 &&
                !(row.activityFilterValues || []).some(
                    value => selectedActivityFilters.has(value)
                )
            ) {
                return false;
            }

            if (!normalizedSearch) {
                return true;
            }

            return normalizeSearchValue([
                row.branchName,
                row.accountName,
                row.location,
                row.frequencyLabel,
                row.progressLabel,
                row.lastVisitLabel,
                row.nextVisitLabel,
                row.statusLabel
            ].join(' ')).includes(normalizedSearch);
        });

        visibleRows = [...visibleRows].sort((first, second) => {
            const firstValue = getSortValue(first, this.sortedBy);
            const secondValue = getSortValue(second, this.sortedBy);
            const emptyComparison = compareEmptyValues(
                firstValue,
                secondValue
            );

            if (emptyComparison !== null) {
                return emptyComparison;
            }

            const comparison = compareValues(firstValue, secondValue);

            return this.sortDirection === 'asc'
                ? comparison
                : comparison * -1;
        });

        this.filteredRows = visibleRows;
        this.totalFilteredRows = visibleRows.length;
        this.currentPage = 1;
        this.updateVisiblePage();
    }

    updateVisiblePage() {
        this.currentPage = Math.min(
            Math.max(this.currentPage, 1),
            this.totalPages
        );

        const firstRecordIndex =
            (this.currentPage - 1) * this.pageSize;

        this.rows = this.filteredRows.slice(
            firstRecordIndex,
            firstRecordIndex + this.pageSize
        );
    }
}

function getSortValue(row, fieldName) {
    const sortFieldByColumn = {
        frequencyLabel: 'frequencyValue',
        progressLabel: 'progressValue',
        lastVisitLabel: 'lastVisitSortValue',
        nextVisitLabel: 'nextVisitSortValue',
        statusLabel: 'statusPriority'
    };

    const monthFieldMatch = fieldName?.match(/^month(\d+)Events$/);

    if (monthFieldMatch) {
        return row[`month${monthFieldMatch[1]}SortValue`];
    }

    return row[sortFieldByColumn[fieldName] || fieldName];
}

function compareValues(firstValue, secondValue) {
    if (typeof firstValue === 'number' && typeof secondValue === 'number') {
        return firstValue - secondValue;
    }

    return String(firstValue).localeCompare(
        String(secondValue),
        'es',
        { numeric: true, sensitivity: 'base' }
    );
}

function compareEmptyValues(firstValue, secondValue) {
    const firstIsEmpty = firstValue === null || firstValue === undefined ||
        firstValue === '';
    const secondIsEmpty = secondValue === null || secondValue === undefined ||
        secondValue === '';

    if (!firstIsEmpty && !secondIsEmpty) {
        return null;
    }

    if (firstIsEmpty && secondIsEmpty) {
        return 0;
    }

    return firstIsEmpty ? 1 : -1;
}

function normalizeSearchValue(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function buildScheduledVisits(response, rows, referenceDate) {
    const rowByBranchId = new Map(
        rows.map(row => [row.id, row])
    );

    return (Array.isArray(response?.branches) ? response.branches : [])
        .flatMap(branch => {
            const branchRow = rowByBranchId.get(branch.branchId);
            const activities = Array.isArray(branch.activities)
                ? branch.activities
                : [];

            return activities
                .filter(activity =>
                    activity.status === 'Programada' &&
                    activity.countsTowardFrequency === true &&
                    String(activity.activityDate || '') >= referenceDate
                )
                .map(activity => {
                    const dateLabel = formatScheduledDate(
                        activity.activityDate
                    );
                    const visitName = activity.title ||
                        activity.folio ||
                        'Actividad programada';
                    const branchName = branch.branchName ||
                        'Sucursal sin nombre';

                    return {
                        id: activity.activityId,
                        dateValue: activity.activityDate,
                        dateLabel,
                        stateName: branchRow?.stateName || '',
                        location: branchRow?.location || 'Sin ubicación',
                        executiveName: activity.executiveName ||
                            'Sin ejecutivo',
                        optionLabel:
                            `${dateLabel} · ${branchName} · ${visitName}`
                    };
                });
        })
        .sort((first, second) =>
            String(first.dateValue).localeCompare(String(second.dateValue)) ||
            first.optionLabel.localeCompare(second.optionLabel, 'es')
        );
}

function formatScheduledDate(value) {
    const [year, month, day] = String(value || '')
        .slice(0, 10)
        .split('-')
        .map(Number);

    if (!year || !month || !day) {
        return 'Sin fecha programada';
    }

    return new Intl.DateTimeFormat('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC'
    }).format(new Date(Date.UTC(year, month - 1, day)));
}

function buildSummaryMetrics(response, rows) {
    const activities = (Array.isArray(response?.branches)
        ? response.branches
        : []
    ).flatMap(branch =>
        Array.isArray(branch.activities) ? branch.activities : []
    );

    const completedVisits = activities.filter(
        activity =>
            activity.status === 'Completada' &&
            activity.countsTowardFrequency === true
    ).length;
    const scheduledVisits = activities.filter(
        activity =>
            activity.status === 'Programada' &&
            activity.countsTowardFrequency === true
    ).length;
    const totalAnnualFrequency = rows.reduce(
        (total, row) => total + row.frequencyValue,
        0
    );
    const annualCompliance = totalAnnualFrequency
        ? Math.min(
            100,
            Math.round(completedVisits * 100 / totalAnnualFrequency)
        )
        : 0;

    return {
        assignedBranches: rows.length,
        completedVisits,
        annualCompliance,
        scheduledVisits
    };
}
