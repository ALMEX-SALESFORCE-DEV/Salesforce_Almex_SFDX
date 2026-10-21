import { LightningElement, api } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import {
    getAlmexSupplyAgreements,
    getManagementActivities,
    searchManagementBranches,
    searchManagementProspects
} from 'c/agendaServices';
import {
    buildExecutivePalette,
    normalizeAgendaSearchText,
    resolveMexicanState
} from 'c/agendaUtils';
import sheetjs from '@salesforce/resourceUrl/sheetjs';

export default class AgendaActivityBreakdown extends LightningElement {
    sheetJsLoaded = false;
    isDownloadingManagementExcel = false;
    isLoadingManagementActivities = false;
    refreshQueued = false;
    _refreshToken = 0;
    currentMonthDate = '';
    activeBreakdownSection = 'consultation';
    isLoadingAdvancedAccounts = false;
    advancedAccounts = [];
    goldAccounts = [];
    silverAccounts = [];
    bronzeAccounts = [];

    managementSortBy = 'date';
    managementSortDirection = 'desc';
    managementActivities = [];
    allManagementActivities = [];
    executivePalettes = {};

    boundDocumentClickHandler =
        event => this.handleDocumentClick(event);

    managementExecutiveNames = [];
    managementTotalRecords = 0;
    managementPageSize = 50;
    managementCurrentPage = 1;
    managementHasNext = false;
    managementCurrentCursor = null;
    managementNextCursor = null;
    managementCursorHistory = [];

    managementPartyResults = [];
    isManagementPartyDropdownOpen = false;
    isSearchingManagementParties = false;
    managementPartySearchError = '';
    managementPartySearchTimer;
    managementPartySearchRequest = 0;
    managementPartyStateAutofilled = false;

    tableFilters = {
        executives: [],
        partyType: 'branch',
        partySearch: '',
        branchId: '',
        prospect: '',
        activityType: '',
        state: '',
        followUp: '',
        status: '',
        dateFrom: '',
        dateTo: ''
    };

    managementColumns = [
        {
            label: 'Fecha',
            fieldName: 'date',
            type: 'date-local',
            sortable: true,
            typeAttributes: {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            },
            cellAttributes: {
                class: { fieldName: 'rowClass' }
            },
            initialWidth: 120
        },
        {
            label: 'Folio actividad',
            fieldName: 'folio',
            type: 'text',
            sortable: true,
            cellAttributes: {
                class: { fieldName: 'rowClass' }
            },
            initialWidth: 150
        },
        {
            label: 'Ejecutivo',
            fieldName: 'ejecutivo',
            type: 'text',
            wrapText: true,
            cellAttributes: {
                class: { fieldName: 'rowClass' }
            },
            initialWidth: 190
        },
        {
            label: 'Título',
            fieldName: 'title',
            type: 'text',
            wrapText: true,
            cellAttributes: {
                class: { fieldName: 'rowClass' }
            },
            initialWidth: 220
        },
        {
            label: 'Tipo de actividad',
            fieldName: 'activityType',
            type: 'agendaActivityType',
            typeAttributes: {
                label: { fieldName: 'activityType' },
                iconName: { fieldName: 'activityIcon' },
                pillStyle: { fieldName: 'activityPillStyle' },
                iconStyle: { fieldName: 'activityIconStyle' }
            },
            initialWidth: 190
        },
        {
            label: 'Relación',
            fieldName: 'partyType',
            type: 'text',
            cellAttributes: {
                class: { fieldName: 'rowClass' }
            },
            initialWidth: 115
        },
        {
            label: 'Cliente / Prospecto',
            fieldName: 'partyName',
            type: 'text',
            wrapText: true,
            cellAttributes: {
                class: { fieldName: 'rowClass' }
            },
            initialWidth: 180
        },
        {
            label: 'Sucursal',
            fieldName: 'branchName',
            type: 'text',
            wrapText: true,
            cellAttributes: {
                class: { fieldName: 'rowClass' }
            },
            initialWidth: 180
        },
        {
            label: 'Estado',
            fieldName: 'state',
            type: 'text',
            cellAttributes: {
                class: { fieldName: 'rowClass' }
            },
            initialWidth: 160
        },
        {
            label: 'Ciudad',
            fieldName: 'city',
            type: 'text',
            cellAttributes: {
                class: { fieldName: 'rowClass' }
            },
            initialWidth: 160
        },
        {
            label: 'Estatus',
            fieldName: 'status',
            type: 'agendaStatus',
            typeAttributes: {
                label: { fieldName: 'status' },
                symbol: { fieldName: 'statusSymbol' },
                pillStyle: { fieldName: 'statusPillStyle' }
            },
            initialWidth: 150
        },
        {
        label: 'Seguimiento',
        fieldName: 'followUp',
        type: 'boolean',
        cellAttributes: {
            class: { fieldName: 'rowClass' }
        },
        initialWidth: 125
    },
    {
        label: 'Notas',
        fieldName: 'notes',
        type: 'text',
        wrapText: true,
        cellAttributes: {
            class: { fieldName: 'rowClass' }
        },
        initialWidth: 260
    },
    {
        label: 'Justificación',
        fieldName: 'justification',
        type: 'text',
        wrapText: true,
        cellAttributes: {
            class: { fieldName: 'rowClass' }
        },
        initialWidth: 260
    },
    {
        label: 'Actividad original',
        fieldName: 'originalActivity',
        type: 'text',
        cellAttributes: {
            class: { fieldName: 'rowClass' }
        },
        initialWidth: 170
    }
    ];

    get isActivityConsultationSelected() {
        return this.activeBreakdownSection === 'consultation';
    }

    get isAdvancedSearchSelected() {
        return this.activeBreakdownSection === 'advanced';
    }

    get consultationSectionButtonClass() {
        return this.isActivityConsultationSelected
            ? 'breakdown-section-button is-active'
            : 'breakdown-section-button';
    }

    get advancedSearchSectionButtonClass() {
        return this.isAdvancedSearchSelected
            ? 'breakdown-section-button is-active'
            : 'breakdown-section-button';
    }

    async handleBreakdownSectionSelect(event) {
        const section = event.currentTarget.dataset.section;

        if (!['consultation', 'advanced'].includes(section)) {
            return;
        }

        this.activeBreakdownSection = section;
        this.closeTableFilterMenus();
        this.isManagementPartyDropdownOpen = false;

        // El primer diseño del Tablero de cobertura de visitas de clientes es un mockup estático.
        // La consulta de Acuerdos de suministros se conectará al aprobar
        // los criterios comerciales y sustituirá estos datos ilustrativos.
    }

    async loadAdvancedAccountSegments() {
        if (this.isLoadingAdvancedAccounts) {
            return;
        }

        this.isLoadingAdvancedAccounts = true;

        try {
            const agreements = await getAlmexSupplyAgreements();
            const accountsById = new Map();

            agreements.forEach(agreement => {
                const accountId = agreement.AccountId;
                const accountName = String(
                    agreement.Account?.Name || ''
                ).trim();

                if (!accountId || !accountName) {
                    return;
                }

                const currentAccount = accountsById.get(accountId) || {
                    accountId,
                    accountName,
                    totalVolume: 0,
                    agreementCount: 0
                };

                currentAccount.totalVolume +=
                    Number(agreement.Volumen_total__c) || 0;
                currentAccount.agreementCount += 1;
                accountsById.set(accountId, currentAccount);
            });

            const accounts = [...accountsById.values()].sort(
                (first, second) =>
                    second.totalVolume - first.totalVolume ||
                    first.accountName.localeCompare(second.accountName)
            );
            const totalVolume = accounts.reduce(
                (total, account) => total + account.totalVolume,
                0
            );
            let cumulativeVolume = 0;

            this.advancedAccounts = accounts.map(account => {
                const previousShare = totalVolume > 0
                    ? cumulativeVolume / totalVolume
                    : 1;
                const tier = previousShare < 0.7
                    ? 'Oro'
                    : previousShare < 0.9
                        ? 'Plata'
                        : 'Bronce';

                cumulativeVolume += account.totalVolume;

                return {
                    ...account,
                    tier,
                    volumeShare: totalVolume > 0
                        ? account.totalVolume / totalVolume
                        : 0,
                    cumulativeShare: totalVolume > 0
                        ? cumulativeVolume / totalVolume
                        : 0
                };
            });

            this.goldAccounts = this.advancedAccounts.filter(
                account => account.tier === 'Oro'
            );
            this.silverAccounts = this.advancedAccounts.filter(
                account => account.tier === 'Plata'
            );
            this.bronzeAccounts = this.advancedAccounts.filter(
                account => account.tier === 'Bronce'
            );

            this.logAdvancedAccountSegments(totalVolume);
        } catch (error) {
            this.advancedAccounts = [];
            this.goldAccounts = [];
            this.silverAccounts = [];
            this.bronzeAccounts = [];

            console.error(
                '[Tablero de cobertura de visitas de clientes] No fue posible segmentar las cuentas:',
                error
            );
            this.showToast(
                'Error',
                error?.message ||
                    'No fue posible consultar los acuerdos de suministro.',
                'error'
            );
        } finally {
            this.isLoadingAdvancedAccounts = false;
        }
    }

    logAdvancedAccountSegments(totalVolume) {
        console.groupCollapsed(
            '[Tablero de cobertura de visitas de clientes] Cuentas por volumen de acuerdos Almex'
        );
        console.info(
            'Periodo: 01/01/2025 a 31/12/2026. ' +
            'Clasificación ABC: Oro 0-70%, Plata 70-90%, Bronce 90-100%.'
        );
        console.info('Volumen total de todas las cuentas:', totalVolume);
        console.table(
            this.advancedAccounts.map(account => ({
                Cuenta: account.accountName,
                Acuerdos: account.agreementCount,
                'Volumen total': account.totalVolume,
                'Participación (%)': Number(
                    (account.volumeShare * 100).toFixed(2)
                ),
                'Acumulado (%)': Number(
                    (account.cumulativeShare * 100).toFixed(2)
                ),
                Segmento: account.tier
            }))
        );
        console.log('Oro:', this.goldAccounts);
        console.log('Plata:', this.silverAccounts);
        console.log('Bronce:', this.bronzeAccounts);
        console.groupEnd();
    }

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
        this.requestManagementRefresh();
    }

    @api
    get monthDate() {
        return this.currentMonthDate;
    }

    set monthDate(value) {
        this.currentMonthDate = value || '';
    }

    connectedCallback() {
        document.addEventListener(
            'click',
            this.boundDocumentClickHandler
        );
    }

    requestManagementRefresh() {
        if (this.isLoadingManagementActivities) {
            this.refreshQueued = true;
            return;
        }

        this.refreshManagementActivities();
    }

    async refreshManagementActivities() {
        await this.loadManagementActivities(true);

        if (this.refreshQueued) {
            this.refreshQueued = false;
            this.requestManagementRefresh();
        }
    }

    get managementActivitiesCount() {
        return this.managementTotalRecords;
    }

    handleDocumentClick() {
        this.closeTableFilterMenus();
        this.isManagementPartyDropdownOpen = false;
    }

    disconnectedCallback() {
        document.removeEventListener(
            'click',
            this.boundDocumentClickHandler
        );

        if (this.managementPartySearchTimer) {
            clearTimeout(this.managementPartySearchTimer);
            this.managementPartySearchTimer = undefined;
        }

        this.managementPartySearchRequest += 1;
    }

    getExecutivePalette(executiveName) {
        if (!this.executivePalettes[executiveName]) {
            this.executivePalettes[executiveName] =
                buildExecutivePalette(executiveName);
        }

        return this.executivePalettes[executiveName];
    }

    showToast(
        title,
        message,
        variant
    ) {
        this.dispatchEvent(
            new ShowToastEvent({
                title,
                message,
                variant
            })
        );
    }

    formatActivityDate(dateValue) {
        const [year, month, day] = dateValue.split('-');
        return `${day}/${month}/${year}`;
    }

    get hasManagementActivities() {
    return this.managementActivities.length > 0;
    }

    getManagementStatusPresentation(status) {
        const baseStyle =
            'display:inline-flex;align-items:center;justify-content:center;' +
            'gap:6px;min-width:110px;padding:5px 9px;border:1px solid;' +
            'border-radius:6px;box-sizing:border-box;font-weight:600;' +
            'line-height:1.2;white-space:nowrap;';

        const presentations = {
            Programada: {
                symbol: '▣',
                pillStyle:
                    `${baseStyle}color:#0b5cab;background:#eef5fc;` +
                    'border-color:#bdd7f4;',
                rowClass: ''
            },
            Completada: {
                symbol: '✓',
                pillStyle:
                    `${baseStyle}color:#08766a;background:#c7f7ef;` +
                    'border-color:#91e5d8;',
                rowClass: ''
            },
            Reagendada: {
                symbol: '↻',
                pillStyle:
                    `${baseStyle}color:#5b37b7;background:#f2edff;` +
                    'border-color:#d6c9fa;',
                rowClass: ''
            },
            Cancelada: {
                symbol: '⊖',
                pillStyle:
                    `${baseStyle}color:#c61a4d;background:#fde1e9;` +
                    'border-color:#f5b9c9;',
                rowClass: 'slds-text-color_error'
            }
        };

        return presentations[status] || presentations.Programada;
    }

    handleManagementSort(event) {
        const { fieldName, sortDirection } = event.detail;
        const direction = sortDirection === 'asc' ? 1 : -1;

        this.managementSortBy = fieldName;
        this.managementSortDirection = sortDirection;

        this.managementActivities = [...this.managementActivities].sort(
            (first, second) => {
                const firstValue = first[fieldName] || '';
                const secondValue = second[fieldName] || '';

                return String(firstValue).localeCompare(
                    String(secondValue)
                ) * direction;
            }
        );
    }

    async handleDownloadManagementExcel() {
        if (this.isDownloadingManagementExcel) {
            return;
        }

        if (!this.managementActivities.length) {
            this.showToast(
                'Sin información',
                'No existen registros para descargar.',
                'warning'
            );

            return;
        }

        this.isDownloadingManagementExcel = true;

        try {
            if (!this.sheetJsLoaded) {
                await loadScript(this, sheetjs);
                this.sheetJsLoaded = true;
            }

            const XLSXLibrary = globalThis.XLSX;

            if (!XLSXLibrary) {
                throw new Error('SheetJS no pudo cargarse.');
            }

            const excelRows = this.managementActivities.map(activity => ({
                Fecha: this.formatActivityDate(activity.date),
                'Folio actividad': activity.folio,
                Ejecutivo: activity.ejecutivo,
                Título: activity.title,
                'Tipo de actividad': activity.activityType,
                Relación: activity.partyType,
                'Sucursal / Prospecto': activity.partyName,
                Sucursal: activity.branchName,
                Estado: activity.state,
                Ciudad: activity.city,
                Seguimiento: activity.followUp ? 'Sí' : 'No',
                Notas: activity.notes,
                Estatus: activity.status,
                Justificación: activity.justification,
                'Actividad original': activity.originalActivity
            }));

            const worksheet = XLSXLibrary.utils.json_to_sheet(excelRows);

            worksheet['!cols'] = [
                { wch: 13 },
                { wch: 18 },
                { wch: 30 },
                { wch: 35 },
                { wch: 20 },
                { wch: 14 },
                { wch: 30 },
                { wch: 30 },
                { wch: 22 },
                { wch: 22 },
                { wch: 14 },
                { wch: 45 },
                { wch: 16 },
                { wch: 45 },
                { wch: 22 }
            ];

            const workbook = XLSXLibrary.utils.book_new();

            XLSXLibrary.utils.book_append_sheet(
                workbook,
                worksheet,
                'Actividades'
            );

            const period = this.tableFilters.dateFrom && this.tableFilters.dateTo
                ? `${this.tableFilters.dateFrom}_${this.tableFilters.dateTo}`
                : this.currentMonthDate || 'periodo_actual';

            XLSXLibrary.writeFile(
                workbook,
                `Desglose_de_actividades_${period}.xlsx`
            );
        } catch (error) {
            console.error('Error descargando Excel:', error);

            this.showToast(
                'Error',
                error?.message || 'No fue posible descargar el archivo.',
                'error'
            );
        } finally {
            this.isDownloadingManagementExcel = false;
        }
    }

    getActivityTypePresentation(activityType) {
        const pillStyle =
            'display:inline-flex;align-items:center;gap:7px;min-width:140px;' +
            'padding:3px 8px 3px 4px;background:#ffffff;' +
            'border:1px solid #d8dde6;border-radius:6px;' +
            'box-sizing:border-box;color:#3e3e3c;white-space:nowrap;';

        const iconBase =
            'width:23px;height:23px;flex:0 0 23px;display:inline-flex;' +
            'align-items:center;justify-content:center;border-radius:5px;';

        const presentations = {
            Visita: {
                iconName: 'utility:location',
                pillStyle,
                iconStyle: `${iconBase}background:#7446c8;`
            },
            'Visitas urgentes': {
                iconName: 'utility:location',
                pillStyle,
                iconStyle: `${iconBase}background:#0891b2;`
            },
            Llamada: {
                iconName: 'utility:call',
                pillStyle,
                iconStyle: `${iconBase}background:#d97706;`
            },
            'Reunión Teams': {
                iconName: 'utility:event',
                pillStyle,
                iconStyle: `${iconBase}background:#d9578a;`
            },
            Seguimiento: {
                iconName: 'utility:check',
                pillStyle,
                iconStyle: `${iconBase}background:#4f86d9;`
            },
            Otro: {
                iconName: 'utility:bookmark',
                pillStyle,
                iconStyle: `${iconBase}background:#df8b22;`
            }
        };

        return presentations[activityType] || presentations.Otro;
    }

    get tableExecutiveOptions() {
        const names = [
            ...new Set([
                ...this.managementExecutiveNames,
                ...this.tableFilters.executives
            ])
        ].sort((first, second) =>
            first.localeCompare(second, 'es')
        );

        const selectedExecutives =
            new Set(this.tableFilters.executives);

        return names.map(name => {
            const palette = this.getExecutivePalette(name);

            return {
                id: name,
                name,
                selected: selectedExecutives.has(name),
                dotStyle:
                    `background-color: ${palette.dotColor};`
            };
        });
    }

    get isManagementBranchTarget() {
        return this.tableFilters.partyType === 'branch';
    }

    get isManagementProspectTarget() {
        return this.tableFilters.partyType === 'prospect';
    }

    get managementPartySearchPlaceholder() {
        return this.isManagementBranchTarget
            ? 'Buscar sucursal o cuenta...'
            : 'Buscar prospecto...';
    }

    get showManagementPartyResults() {
        return (
            this.isManagementPartyDropdownOpen &&
            normalizeAgendaSearchText(
                this.tableFilters.partySearch
            ).length >= 2
        );
    }

    get hasManagementPartyResults() {
        return this.managementPartyResults.length > 0;
    }

    get managementPartyEmptyMessage() {
        if (this.managementPartySearchError) {
            return this.managementPartySearchError;
        }

        return this.isManagementBranchTarget
            ? 'No se encontraron sucursales.'
            : 'No se encontraron prospectos.';
    }

    get tableStateOptions() {
        const states = [
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

        const selectedState = this.tableFilters.state;

        if (selectedState && !states.includes(selectedState)) {
            states.push(selectedState);
        }

        return states.map(state => ({
            label: state,
            value: state,
            selected: selectedState === state
        }));
    }

    get allManagementStatesSelected() {
        return !this.tableFilters.state;
    }

    get tableExecutiveFilterLabel() {
        const selected = this.tableFilters.executives;

        if (selected.length === 0) {
            return 'Todos los ejecutivos';
        }

        if (selected.length === 1) {
            return selected[0];
        }

        return `${selected.length} ejecutivos seleccionados`;
    }

    get tableActivityTypeOptions() {
        const activityTypes = [
            'Visita',
            'Visitas urgentes',
            'Llamada',
            'Reunión Teams',
            'Seguimiento',
            'Otro'
        ];

        return activityTypes.map(activityType => {
            const presentation =
                this.getActivityTypePresentation(activityType);

            return {
                id: activityType,
                label: activityType,
                selected:
                    this.tableFilters.activityType === activityType,
                iconName: presentation.iconName,
                iconStyle: presentation.iconStyle
            };
        });
    }

    get tableStatusOptions() {
        const statuses = [
            'Programada',
            'Completada',
            'Reagendada',
            'Cancelada'
        ];

        return statuses.map(status => {
            const presentation =
                this.getManagementStatusPresentation(status);

            return {
                id: status,
                label: status,
                selected:
                    this.tableFilters.status === status,
                symbol: presentation.symbol,
                pillStyle: presentation.pillStyle
            };
        });
    }

    get tableActivityTypeFilterLabel() {
        return this.tableFilters.activityType || 'Todos los tipos';
    }

    get tableStatusFilterLabel() {
        return this.tableFilters.status || 'Todos los estatus';
    }

    get allActivityTypesSelected() {
        return !this.tableFilters.activityType;
    }

    get allStatusesSelected() {
        return !this.tableFilters.status;
    }

    handleExecutiveTableFilterChange(event) {
        const selectedExecutives =
            new Set(this.tableFilters.executives);

        if (event.target.checked) {
            selectedExecutives.add(event.target.value);
        } else {
            selectedExecutives.delete(event.target.value);
        }

        this.tableFilters = {
            ...this.tableFilters,
            executives: [...selectedExecutives]
        };
    }

    handleManagementPartyTypeChange(event) {
        const partyType = event.target.value;

        if (partyType === this.tableFilters.partyType) {
            return;
        }

        this.tableFilters = {
            ...this.tableFilters,
            partyType,
            partySearch: '',
            branchId: '',
            prospect: '',
            state: this.managementPartyStateAutofilled
                ? ''
                : this.tableFilters.state
        };

        this.managementPartyStateAutofilled = false;
        this.resetManagementPartyAutocomplete();
    }

    handleManagementPartySearch(event) {
        const partySearch = event.target.value;

        this.tableFilters = {
            ...this.tableFilters,
            partySearch,
            branchId: '',
            prospect: '',
            state: this.managementPartyStateAutofilled
                ? ''
                : this.tableFilters.state
        };

        this.managementPartyStateAutofilled = false;
        this.scheduleManagementPartySearch(partySearch);
    }

    handleManagementPartyFocus() {
        const hasSelection = this.isManagementBranchTarget
            ? Boolean(this.tableFilters.branchId)
            : Boolean(this.tableFilters.prospect);

        if (
            !hasSelection &&
            normalizeAgendaSearchText(
                this.tableFilters.partySearch
            ).length >= 2
        ) {
            this.isManagementPartyDropdownOpen = true;
        }
    }

    handleManagementPartyBlur() {
        setTimeout(() => {
            this.isManagementPartyDropdownOpen = false;
        }, 180);
    }

    scheduleManagementPartySearch(searchTerm) {
        this.resetManagementPartyAutocomplete();

        if (normalizeAgendaSearchText(searchTerm).length < 2) {
            return;
        }

        const partyType = this.tableFilters.partyType;
        const requestId = this.managementPartySearchRequest;

        this.isManagementPartyDropdownOpen = true;
        this.isSearchingManagementParties = true;

        this.managementPartySearchTimer = setTimeout(() => {
            this.managementPartySearchTimer = undefined;
            this.searchManagementPartyOptions(
                searchTerm,
                partyType,
                requestId
            );
        }, 300);
    }

    async searchManagementPartyOptions(
        searchTerm,
        partyType,
        requestId
    ) {
        try {
            if (partyType === 'branch') {
                const branches = await searchManagementBranches(
                    searchTerm
                );

                if (requestId !== this.managementPartySearchRequest) {
                    return;
                }

                this.managementPartyResults = branches.map(branch => {
                    const state = resolveMexicanState(branch.Estado__c);
                    const client = branch.Cuenta__r?.Name || '';
                    const city = branch.Ciudad__c || '';

                    return {
                        key: branch.Id,
                        id: branch.Id,
                        name: branch.Name,
                        selectionLabel: client
                            ? `${branch.Name} — ${client}`
                            : branch.Name,
                        client,
                        city,
                        state,
                        secondary: [
                            client ? `Cuenta: ${client}` : '',
                            city,
                            state
                        ]
                            .filter(Boolean)
                            .join(' · '),
                        iconName: 'standard:location',
                        typeLabel: 'Sucursal'
                    };
                });
            } else {
                const prospects = await searchManagementProspects(
                    searchTerm
                );

                if (requestId !== this.managementPartySearchRequest) {
                    return;
                }

                this.managementPartyResults = prospects.map(
                    prospect => ({
                        key: prospect.Id,
                        id: prospect.Id,
                        name: prospect.Name,
                        selectionLabel: prospect.Company
                            ? `${prospect.Name} — ${prospect.Company}`
                            : prospect.Name,
                        client: '',
                        city: '',
                        state: '',
                        secondary: prospect.Company
                            ? `Compañía: ${prospect.Company}`
                            : 'Sin compañía',
                        iconName: 'standard:lead',
                        typeLabel: 'Prospecto'
                    })
                );
            }
        } catch (error) {
            if (requestId !== this.managementPartySearchRequest) {
                return;
            }

            console.error(
                'Error buscando sucursales o prospectos:',
                error
            );

            this.managementPartyResults = [];
            this.managementPartySearchError =
                error?.message || 'No fue posible realizar la búsqueda.';
        } finally {
            if (requestId === this.managementPartySearchRequest) {
                this.isSearchingManagementParties = false;
            }
        }
    }

    handleManagementPartySelect(event) {
        const resultKey = event.currentTarget.dataset.resultKey;
        const selectedResult = this.managementPartyResults.find(
            result => result.key === resultKey
        );

        if (!selectedResult) {
            return;
        }

        if (this.isManagementBranchTarget) {
            this.tableFilters = {
                ...this.tableFilters,
                partySearch: selectedResult.selectionLabel,
                branchId: selectedResult.id,
                prospect: '',
                state: selectedResult.state
            };

            this.managementPartyStateAutofilled = true;
        } else {
            this.tableFilters = {
                ...this.tableFilters,
                partySearch: selectedResult.selectionLabel,
                branchId: '',
                prospect: selectedResult.name
            };

            this.managementPartyStateAutofilled = false;
        }

        this.resetManagementPartyAutocomplete();
    }

    resetManagementPartyAutocomplete() {
        if (this.managementPartySearchTimer) {
            clearTimeout(this.managementPartySearchTimer);
            this.managementPartySearchTimer = undefined;
        }

        this.managementPartySearchRequest += 1;
        this.managementPartyResults = [];
        this.managementPartySearchError = '';
        this.isSearchingManagementParties = false;
        this.isManagementPartyDropdownOpen = false;
    }

    handleTableFilterChange(event) {
        const { name, value, type } = event.target;

        this.tableFilters = {
            ...this.tableFilters,
            [name]: value
        };

        if (name === 'state') {
            this.managementPartyStateAutofilled = false;
        }

        if (type === 'radio') {
            event.target
                .closest('details')
                ?.removeAttribute('open');
        }
    }

    handleTableDateChange(event) {
        const { name, value } = event.target;

        const updatedFilters = {
            ...this.tableFilters,
            [name]: value
        };

        if (name === 'dateFrom' && !value) {
            updatedFilters.dateTo = '';
        }

        if (name === 'dateTo' && !updatedFilters.dateFrom) {
            return;
        }

        this.tableFilters = updatedFilters;
    }

    async handleApplyTableDateRange() {
        const { dateFrom, dateTo } = this.tableFilters;

        if (dateTo && !dateFrom) {
            this.showToast(
                'Falta fecha inicial',
                'Selecciona primero la fecha De.',
                'warning'
            );

            return;
        }

        if (dateFrom && dateTo && dateFrom > dateTo) {
            this.showToast(
                'Periodo incorrecto',
                'La fecha inicial no puede ser posterior a la fecha final.',
                'warning'
            );

            return;
        }

        const hasPartySearch = Boolean(
            this.tableFilters.partySearch.trim()
        );

        const hasPartySelection = this.isManagementBranchTarget
            ? Boolean(this.tableFilters.branchId)
            : Boolean(this.tableFilters.prospect);

        if (hasPartySearch && !hasPartySelection) {
            this.showToast(
                'Selecciona una coincidencia',
                'Elige una sucursal o prospecto de la lista de resultados.',
                'warning'
            );

            return;
        }

        await this.loadManagementActivities(true);
    }

    async handleClearTableFilters() {
        this.tableFilters = {
            executives: [],
            partyType: 'branch',
            partySearch: '',
            branchId: '',
            prospect: '',
            activityType: '',
            state: '',
            followUp: '',
            status: '',
            dateFrom: '',
            dateTo: ''
        };

        this.managementPartyStateAutofilled = false;
        this.resetManagementPartyAutocomplete();

        await this.loadManagementActivities(true);
    }

    handleTableFilterToggle(event) {
        if (!event.target.open) {
            return;
        }

        this.template
            .querySelectorAll('details.multi-select[open]')
            .forEach(details => {
                if (details !== event.target) {
                    details.removeAttribute('open');
                }
            });
    }

    closeTableFilterMenus() {
        this.template
            .querySelectorAll('details.multi-select[open]')
            .forEach(details => {
                details.removeAttribute('open');
            });
    }

    handleFilterMenuClick(event) {
        event.stopPropagation();
    }

    get isDateToDisabled() {
        return !this.tableFilters.dateFrom;
    }

    get managementTotalPages() {
        return Math.max(
            1,
            Math.ceil(
                this.managementTotalRecords /
                this.managementPageSize
            )
        );
    }

    get managementPageLabel() {
        return `Página ${this.managementCurrentPage} de ${this.managementTotalPages}`;
    }

    get managementPageSummary() {
        if (!this.managementTotalRecords) {
            return '0 registros';
        }

        const start =
            (this.managementCurrentPage - 1) *
            this.managementPageSize + 1;

        const end = Math.min(
            start + this.allManagementActivities.length - 1,
            this.managementTotalRecords
        );

        return `${start}-${end} de ${this.managementTotalRecords}`;
    }

    get managementRowNumberOffset() {
        return (
            (this.managementCurrentPage - 1) *
            this.managementPageSize
        );
    }

    get isManagementPreviousDisabled() {
        return (
            this.managementCurrentPage === 1 ||
            this.isLoadingManagementActivities
        );
    }

    get isManagementNextDisabled() {
        return (
            !this.managementHasNext ||
            this.isLoadingManagementActivities
        );
    }

    get hasManagementServerResults() {
        return this.managementTotalRecords > 0;
    }

    resetManagementPagination() {
        this.managementCurrentPage = 1;
        this.managementHasNext = false;
        this.managementCurrentCursor = null;
        this.managementNextCursor = null;
        this.managementCursorHistory = [];
    }

    getManagementQueryDates() {
        const { dateFrom, dateTo } = this.tableFilters;

        if (dateFrom) {
            return {
                dateFrom,
                dateTo: dateTo || null
            };
        }

        let year;
        let month;

        if (this.currentMonthDate) {
            [year, month] =
                this.currentMonthDate
                    .split('-')
                    .map(Number);
        } else {
            const today = new Date();

            year = today.getFullYear();
            month = today.getMonth() + 1;
        }

        const lastDay =
            new Date(year, month, 0).getDate();

        return {
            dateFrom:
                `${year}-${String(month).padStart(2, '0')}-01`,
            dateTo:
                `${year}-${String(month).padStart(2, '0')}-` +
                String(lastDay).padStart(2, '0')
        };
    }

    async loadManagementActivities(resetPagination = false) {
        if (this.isLoadingManagementActivities) {
            return false;
        }

        if (resetPagination) {
            this.resetManagementPagination();
        }

        const dates = this.getManagementQueryDates();

        const followUp =
            this.tableFilters.followUp === ''
                ? null
                : this.tableFilters.followUp === 'true';

        this.isLoadingManagementActivities = true;

        try {
            const response = await getManagementActivities({
                dateFrom: dates.dateFrom,
                dateTo: dates.dateTo,
                executives: this.tableFilters.executives,
                activityType: this.tableFilters.activityType,
                state: this.tableFilters.state,
                branchId: this.tableFilters.branchId,
                prospect: this.tableFilters.prospect,
                followUp,
                status: this.tableFilters.status,
                cursor: this.managementCurrentCursor,
                pageSize: this.managementPageSize
            });

            this.managementExecutiveNames =
                response.executiveOptions || [];

            this.allManagementActivities =
                (response.records || []).map(record =>
                    this.mapManagementActivity(record)
                );

            this.managementActivities = [
                ...this.allManagementActivities
            ];

            this.managementTotalRecords =
                response.totalRecords || 0;

            this.managementHasNext =
                response.hasNext === true;

            this.managementNextCursor =
                this.managementHasNext
                    ? {
                        date: response.nextCursorDate,
                        createdDate:
                            response.nextCursorCreatedDate,
                        id: response.nextCursorId
                    }
                    : null;

            return true;
        } catch (error) {
            console.error(
                'Error cargando desglose de actividades:',
                error
            );

            this.showToast(
                'Error',
                error?.message ||
                    'No fue posible cargar el desglose.',
                'error'
            );

            return false;
        } finally {
            this.isLoadingManagementActivities = false;
        }
    }

    mapManagementActivity(record) {
        const status = record.Estatus__c || 'Programada';
        const statusPresentation =
            this.getManagementStatusPresentation(status);

        const activityType =
            record.Tipo_de_actividad__c || 'Otro';

        const activityPresentation =
            this.getActivityTypePresentation(activityType);

        const isClientActivity = Boolean(record.Sucursal__c);
        const client = record.Sucursal__r?.Cuenta__r?.Name || '';
        const prospect = record.Prospecto__c || '';

        return {
            id: record.Id,
            folio: record.Name || '',
            date: record.Fecha__c,
            ejecutivo: record.Ejecutivo__c || '',
            title: record.Titulo__c || '',
            activityType,
            activityIcon: activityPresentation.iconName,
            activityPillStyle: activityPresentation.pillStyle,
            activityIconStyle: activityPresentation.iconStyle,
            client,
            prospect,
            partyName: isClientActivity
                ? client || record.Sucursal__r?.Name || ''
                : prospect,
            partyType: isClientActivity
                ? 'Cliente'
                : prospect
                    ? 'Prospecto'
                    : '',
            branchId: record.Sucursal__c || '',
            branchName: record.Sucursal__r?.Name || '',
            state: resolveMexicanState(record.Estado__c),
            city: record.Ciudad__c || '',
            followUp: record.Seguimiento__c === true,
            notes: record.Notas__c || '',
            status,
            justification: record.Justificacion__c || '',
            originalActivity:
                record.Actividad_Original__r?.Name || '',
            statusSymbol: statusPresentation.symbol,
            statusPillStyle: statusPresentation.pillStyle,
            rowClass: statusPresentation.rowClass
        };
    }

    async handleManagementNextPage() {
        if (this.isManagementNextDisabled) {
            return;
        }

        this.managementCursorHistory = [
            ...this.managementCursorHistory,
            this.managementCurrentCursor
        ];

        this.managementCurrentCursor =
            this.managementNextCursor;

        this.managementCurrentPage += 1;

        await this.loadManagementActivities();
    }

    async handleManagementPreviousPage() {
        if (this.isManagementPreviousDisabled) {
            return;
        }

        const cursorHistory = [
            ...this.managementCursorHistory
        ];

        this.managementCurrentCursor =
            cursorHistory.pop() || null;

        this.managementCursorHistory =
            cursorHistory;

        this.managementCurrentPage -= 1;

        await this.loadManagementActivities();
    }
}
