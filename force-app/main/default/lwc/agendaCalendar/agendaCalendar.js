import { LightningElement } from 'lwc';
import getCurrentUser from '@salesforce/apex/ALMEX_AgendaDataController.getCurrentUser';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import {
    createAgendaActivity,
    completeAgendaActivity,
    updateAgendaActivityDetails,
    cancelAgendaActivity,
    rescheduleAgendaActivity,
    getAgendaActivities,
    getAssignedBranches,
    searchAssignedProspects,
    improveAgendaText
} from 'c/agendaServices';
import {
    buildExecutivePalette,
    normalizeAgendaSearchText,
    resolveMexicanState
} from 'c/agendaUtils';
import agendaCalendarStyles from '@salesforce/resourceUrl/agendaCalendarStyles';
import fullCalendarResource from '@salesforce/resourceUrl/fullCalendar';
import hasAgendaAiPermission from '@salesforce/customPermission/ALMEX_Agendas_IA';

const NOTES_MAX_LENGTH = 32768;
const ACTION_JUSTIFICATION_MAX_LENGTH = 1000;
const EXCEPTION_JUSTIFICATION_MAX_LENGTH = 160;
const NOTES_SPEECH_LANGUAGE = 'es-MX';
const TEXT_IMPROVEMENT_INPUT_LIMIT = 6000;

export default class AgendaCalendar extends LightningElement {
    // =========================================================
    // INTERFACES CONFIGURABLES
    // Cambia cualquiera de estos valores a false para ocultar
    // la propuesta correspondiente sin borrar HTML, JS o CSS.
    // =========================================================
    enableFollowUpCompletionInterface = true;
    enableCallReplacementInterface = true;
    enableNotesSpeechRecognition = true;
    enableTextImprovement = hasAgendaAiPermission === true;

    calendar;
    calendarResizeObserver;
    calendarResizeFrame;
    libraryLoaded = false;
    currentMonthDate = '';

    selectedBranchId = '';
    assignedBranches = [];
    filteredBranches = [];
    branchSearch = '';
    isBranchDropdownOpen = false;
    isLoadingBranches = false;

    selectedProspectId = '';
    prospectSearch = '';
    prospectResults = [];
    isProspectDropdownOpen = false;
    isSearchingProspects = false;
    prospectSearchError = '';
    prospectSearchTimer;
    prospectSearchRequest = 0;

    calendarTitle = '';
    totalActivities = 0;

    activeCalendarSection = 'calendar';
    myActivityEvents = [];
    myActivityStatusFilter = 'Programada';
    myActivityPeriodFilter = 'month';
    isLoadingMyActivities = false;
    myActivitiesRequest = 0;

    isActivityModalOpen = false;
    isSavingActivity = false;
    activityTargetType = 'client';

    notesSpeechRecognition;
    notesSpeechRecognitionSupported = false;
    isDictatingNotes = false;
    isStoppingNotesDictation = false;
    notesDictationStatus = '';
    notesBeforeDictation = '';
    notesDictationHadError = false;
    notesDictationHasText = false;
    speechDictationTarget = 'notes';

    isImprovingText = false;
    isTextImprovementPreviewOpen = false;
    textImprovementTarget = '';
    textImprovementOriginal = '';
    textImprovementSuggestion = '';
    textImprovementRequest = 0;

    currentUserId = '';
    currentUserName = '';
    currentUserExecutiveAliases = [];
    isViewingActivity = false;
    selectedActivityId = '';
    activityAction = '';
    isProcessingActivityAction = false;
    isUpdatingActivityDetails = false;

    activityActionForm = {
        newDate: '',
        justification: ''
    };
    followUpCompletionSummary = '';

    executives = [];
    calendarExecutives = [];
    executivePalettes = {};
    calendarEvents = [];
    allCalendarEvents = [];
    calendarFilters = {
        executive: '',
        client: '',
        state: '',
        followUp: ''
    };
    calendarPalette;
    activityForm = this.getEmptyActivityForm();

    boundDocumentClickHandler =
        event => this.handleDocumentClick(event);

    constructor() {
        super();

        this.calendarPalette = buildExecutivePalette('Sin ejecutivo');
    }

    connectedCallback() {
        this.detectNotesSpeechRecognitionSupport();

        document.addEventListener(
            'click',
            this.boundDocumentClickHandler
        );

        this.loadCurrentUser();
        this.loadCurrentMonthActivities();
    }

    getEmptyActivityForm() {
        return {
            title: '',
            activity: '',
            executive: this.currentUserId || '',
            startDate: '',
            state: '',
            city: '',
            client: '',
            prospect: '',
            prospectId: '',
            prospectCompany: '',
            branchId: '',
            branchName: '',
            callReplacement: '',
            callExceptionReason: '',
            exceptionJustification: '',
            countsTowardFrequency: false,
            followUp: false,
            notes: '',
            folio: '',
            status: 'Programada',
            justification: '',
            originalId: '',
            originalFolio: ''
        };
    }

    get minimumActivityDate() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }

    getExecutivePalette(executiveName) {
        if (!this.executivePalettes[executiveName]) {
            this.executivePalettes[executiveName] =
                buildExecutivePalette(executiveName);
        }

        return this.executivePalettes[executiveName];
    }

    buildCurrentUserExecutiveAliases(currentUser) {
        // Compatibilidad con registros históricos guardados como
        // primer nombre + primer apellido.
        const firstGivenName = String(currentUser?.FirstName || '')
            .trim()
            .split(/\s+/)[0];
        const firstLastName = String(currentUser?.LastName || '')
            .trim()
            .split(/\s+/)[0];
        const abbreviatedName = firstGivenName && firstLastName
            ? `${firstGivenName} ${firstLastName}`
            : '';

        return [
            ...new Set(
                [currentUser?.Name, abbreviatedName]
                    .map(name => normalizeAgendaSearchText(name))
                    .filter(Boolean)
            )
        ];
    }

    isCurrentUserExecutive(executiveName) {
        const normalizedExecutiveName =
            normalizeAgendaSearchText(executiveName);

        return this.currentUserExecutiveAliases.includes(
            normalizedExecutiveName
        );
    }

    async loadCurrentUser() {
        try {
            const currentUser = await getCurrentUser();

            this.currentUserId = currentUser.Id;
            this.currentUserName = currentUser.Name;
            this.currentUserExecutiveAliases =
                this.buildCurrentUserExecutiveAliases(currentUser);
            this.calendarPalette = this.getExecutivePalette(currentUser.Name);

            this.executives = [
                {
                    id: currentUser.Id,
                    name: currentUser.Name,
                    dotStyle: `background-color: ${this.calendarPalette.dotColor};`
                }
            ];

            this.activityForm = {
                ...this.activityForm,
                executive: currentUser.Id
            };
        } catch (error) {
            console.error('Error obteniendo usuario:', error);

            this.showToast(
                'Error',
                'No fue posible obtener el usuario actual.',
                'error'
            );
        }
    }

    async loadCurrentMonthActivities(referenceDate = new Date()) {
        const year = referenceDate.getFullYear();
        const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
        const monthDate = `${year}-${month}-01`;

        this.currentMonthDate = monthDate;
        this.dispatchEvent(new CustomEvent('monthchange', {
            detail: { monthDate }
        }));

        try {
            const records = await getAgendaActivities(monthDate);

            this.allCalendarEvents = records.map(record =>
                this.mapActivityToEvent(record)
            );

            // Conserva los filtros que ya estaban seleccionados.
            this.applyCalendarFilters();

        } catch (error) {
            console.error('Error cargando actividades:', error);

            this.showToast(
                'Error',
                'No fue posible cargar las actividades.',
                'error'
            );
        }
    }

    async loadMyActivities() {
        const requestId = ++this.myActivitiesRequest;
        this.isLoadingMyActivities = true;

        try {
            if (!this.currentUserName) {
                await this.loadCurrentUser();
            }

            const today = new Date();
            const year = today.getFullYear();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const records = await getAgendaActivities(`${year}-${month}-01`);

            if (requestId !== this.myActivitiesRequest) {
                return;
            }

            this.myActivityEvents = records
                .map(record => this.mapActivityToEvent(record))
                .filter(event =>
                    this.isCurrentUserExecutive(
                        event.extendedProps.executiveName
                    )
                );
        } catch (error) {
            if (requestId !== this.myActivitiesRequest) {
                return;
            }

            console.error('Error cargando mis actividades:', error);
            this.myActivityEvents = [];
            this.showToast(
                'Error',
                'No fue posible consultar tus actividades.',
                'error'
            );
        } finally {
            if (requestId === this.myActivitiesRequest) {
                this.isLoadingMyActivities = false;
            }
        }
    }

    async handleCalendarSectionSelect(event) {
        const section = event.currentTarget.dataset.section;

        if (!['calendar', 'activities'].includes(section)) {
            return;
        }

        this.activeCalendarSection = section;

        if (section === 'activities') {
            await this.loadMyActivities();
            return;
        }

        requestAnimationFrame(() => {
            this.calendar?.updateSize();
        });
    }

    get isCalendarSectionSelected() {
        return this.activeCalendarSection === 'calendar';
    }

    get isMyActivitiesSectionSelected() {
        return this.activeCalendarSection === 'activities';
    }

    get isCalendarSectionHidden() {
        return !this.isCalendarSectionSelected;
    }

    get isMyActivitiesSectionHidden() {
        return !this.isMyActivitiesSectionSelected;
    }

    get calendarSectionButtonClass() {
        return this.isCalendarSectionSelected
            ? 'calendar-section-button is-active'
            : 'calendar-section-button';
    }

    get myActivitiesSectionButtonClass() {
        return this.isMyActivitiesSectionSelected
            ? 'calendar-section-button is-active'
            : 'calendar-section-button';
    }

    get executiveFilterOptions() {
        return this.createFilterOptions(
            [
                ...this.allCalendarEvents.map(event =>
                    event.extendedProps.executiveName
                ),
                this.calendarFilters.executive
            ]
        );
    }

    get activityExecutiveOptions() {
        if (!this.isViewingActivity) {
            return this.executives;
        }

        const executiveName = String(
            this.activityForm.executive || ''
        ).trim();

        return executiveName
            ? [{ id: executiveName, name: executiveName }]
            : [{ id: '', name: 'Sin ejecutivo' }];
    }

    get clientFilterOptions() {
        return this.createFilterOptions(
            [
                ...this.allCalendarEvents.map(event =>
                    event.extendedProps.partyName
                ),
                this.calendarFilters.client
            ]
        );
    }

    get stateFilterOptions() {
        return this.createFilterOptions(
            [
                ...this.allCalendarEvents.map(event =>
                    event.extendedProps.state
                ),
                this.calendarFilters.state
            ]
        );
    }

    get hasSelectedBranch() {
        return Boolean(this.selectedBranchId);
    }

    get hasSelectedProspect() {
        return Boolean(this.selectedProspectId);
    }

    createFilterOptions(values) {
        return [...new Set(values.filter(Boolean))]
            .sort((first, second) =>
                first.localeCompare(second, 'es-MX')
            )
            .map(value => ({
                label: value,
                value
            }));
    }

    handleCalendarFilterChange(event) {
        const { name, value } = event.target;

        this.calendarFilters = {
            ...this.calendarFilters,
            [name]: value
        };

        this.applyCalendarFilters();
    }

    handleClearCalendarFilters() {
        this.calendarFilters = {
            executive: '',
            client: '',
            state: '',
            followUp: ''
        };

        this.template
            .querySelectorAll('.calendar-filter-field select')
            .forEach((selectElement) => {
                selectElement.value = '';
            });

        this.applyCalendarFilters();
    }

    applyCalendarFilters() {
        const { executive, client, state, followUp } = this.calendarFilters;

        this.calendarEvents = this.allCalendarEvents.filter(event => {
            const details = event.extendedProps;
            const hiddenStatuses = ['Cancelada', 'Reagendada'];

            return (
                !hiddenStatuses.includes(details.status) &&
                (!executive || details.executiveName === executive) &&
                (!client || details.partyName === client) &&
                (!state || details.state === state) &&
                (followUp === '' || String(details.followUp) === followUp)
            );
        });

        this.updateCalendarExecutives();
        this.totalActivities = this.calendarEvents.length;

        if (this.calendar) {
            this.calendar.removeAllEvents();
            this.calendar.addEventSource(this.calendarEvents);
        }
    }

    updateCalendarExecutives() {
        const executiveNames = [
            ...new Set(
                this.calendarEvents
                    .map(event => event.extendedProps.executiveName)
                    .filter(Boolean)
            )
        ];

        this.calendarExecutives = executiveNames.map(name => {
            const palette = this.getExecutivePalette(name);

            return {
                id: name,
                name,
                dotStyle: `background-color: ${palette.dotColor};`
            };
        });
    }

    mapActivityToEvent(record) {
        const activityType = record.Tipo_de_actividad__c || 'Actividad';
        const executiveName = record.Ejecutivo__c || '';
        const status = record.Estatus__c || 'Programada';
        const palette = this.getExecutivePalette(executiveName);
        const isClientActivity = Boolean(record.Sucursal__c);
        const client = record.Sucursal__r?.Cuenta__r?.Name || '';
        const prospect = record.Prospecto__c || '';
        const activityContent = this.normalizeStoredActivityContent(
            activityType,
            record.Notas__c,
            record.Justificacion_de_excepcion__c
        );

        const statusPrefix =
            status === 'Programada'
                ? ''
                : `[${status}] `;

        return {
            id: record.Id,
            title: `${statusPrefix}${activityType} - ${record.Titulo__c}`,
            start: record.Fecha__c,
            allDay: true,
            display: 'block',
            backgroundColor: palette.backgroundColor,
            borderColor: palette.borderColor,
            textColor: palette.textColor,
            extendedProps: {
                folio: record.Name || '',
                executiveName,
                activityTitle: record.Titulo__c || '',
                activity: activityType,
                state: resolveMexicanState(record.Estado__c),
                city: record.Ciudad__c || '',
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
                followUp: Boolean(record.Seguimiento__c),
                notes: activityContent.notes,
                exceptionJustification:
                    activityContent.exceptionJustification,
                countsTowardFrequency:
                    activityType === 'Visita' ||
                    (
                        activityType === 'Llamada' &&
                        record.Cuenta_para_frecuencia__c === true
                    ),
                status,
                justification: record.Justificacion__c || '',
                originalId: record.Actividad_Original__c || '',
                originalFolio:
                    record.Actividad_Original__r?.Name || '',
                dotColor: palette.dotColor
            }
        };
    }

    async renderedCallback() {
        // Los textarea nativos usan la propiedad .value, también durante el dictado.
        this.syncNotesInputValue();

        if (this.isViewingActivity) {
            [
                ['activity-type', this.activityForm.activity],
                [
                    'exception-justification-preview',
                    this.activityForm.exceptionJustification
                ]
            ].forEach(([elementName, savedValue]) => {
                const field = this.template.querySelector(
                    `[data-element="${elementName}"]`
                );
                const normalizedValue = savedValue || '';

                if (field && field.value !== normalizedValue) {
                    field.value = normalizedValue;
                }
            });
        }

        if (this.libraryLoaded) {
            return;
        }

        this.libraryLoaded = true;

        try {
            await loadScript(this,`${fullCalendarResource}/index.global.js`);

            await loadScript(this,`${fullCalendarResource}/es.global.min.js`);

            await loadStyle(this, agendaCalendarStyles);

            this.initializeCalendar();
        } catch (error) {
            this.libraryLoaded = false;

            console.error('Error cargando FullCalendar:',error?.message || error, error);
        }
    }

    initializeCalendar() {
        const container =
            this.template.querySelector(
                '.agenda-fullcalendar'
            );

        const FullCalendarLibrary =
            globalThis.FullCalendar;

        if (!container) {
            console.error(
                'No se encontró .agenda-fullcalendar.'
            );

            return;
        }

        if (!FullCalendarLibrary) {
            console.error(
                'FullCalendar no está disponible.'
            );

            return;
        }

        this.calendar =
            new FullCalendarLibrary.Calendar(
                container,
                {
                    locale: 'es',

                    initialView:
                        'dayGridMonth',

                    headerToolbar:
                        false,

                    firstDay:
                        0,

                    fixedWeekCount:
                        true,

                    showNonCurrentDates:
                        true,

                    height:
                        '100%',

                    expandRows:
                        true,

                    eventDisplay:
                        'block',

                    displayEventTime:
                        false,

                    dayMaxEvents:
                        3,

                    events:
                        this.calendarEvents,

                    moreLinkContent:
                        information => {
                            return `+${information.num} más`;
                        },

                    dateClick:
                        information => {
                            this.openActivityModal(
                                information.dateStr
                            );
                        },

                    eventClick:
                        information => {
                            this.openLoadedActivityDetail(
                                information.event.id
                            );
                        },

                    datesSet:
                        information => {
                            this.calendarTitle =
                                this.getViewTitle(
                                    information.view
                                );

                            requestAnimationFrame(
                                () => {
                                    this.calendar
                                        ?.updateSize();
                                }
                            );
                        },

                    eventContent:
                        information => {
                            return this
                                .createEventContent(
                                    information
                                );
                        },

                    eventDidMount:
                        information => {
                            this.styleCalendarEvent(
                                information
                            );
                        }
                }
            );

        this.calendar.render();

        // Salesforce puede ocultar la pestaña o cambiar el ancho del contenedor
        // sin emitir un resize de window. Recalcular al recuperar dimensiones.
        if (typeof ResizeObserver === 'function') {
            let previousWidth = 0;
            let previousHeight = 0;
            this.calendarResizeObserver = new ResizeObserver(entries => {
                if (!entries.length) {
                    return;
                }
                const { width, height } = entries[0].contentRect;
                if (width === previousWidth && height === previousHeight) {
                    return;
                }
                previousWidth = width;
                previousHeight = height;
                if (this.calendarResizeFrame != null) {
                    cancelAnimationFrame(this.calendarResizeFrame);
                    this.calendarResizeFrame = undefined;
                }
                if (width > 0 && height > 0) {
                    this.calendarResizeFrame = requestAnimationFrame(() => {
                        this.calendarResizeFrame = undefined;
                        this.calendar?.updateSize();
                    });
                }
            });
            this.calendarResizeObserver.observe(container);
        }

        requestAnimationFrame(() => {
            this.calendar?.updateSize();
        });
    }

    createEventContent(information) {
        const calendarEvent =
            information.event;

        const textColor =
            calendarEvent.textColor ||
            this.calendarPalette.textColor;

        const dotColor =
            calendarEvent
                .extendedProps
                .dotColor ||
            this.calendarPalette.dotColor;

        const content =
            document.createElement('div');

        content.className =
            'agenda-event-content';

        content.style.display =
            'flex';

        content.style.alignItems =
            'center';

        content.style.gap =
            '5px';

        content.style.width =
            '100%';

        content.style.minWidth =
            '0';

        content.style.overflow =
            'hidden';

        const dot =
            document.createElement('span');

        dot.className =
            'agenda-event-dot';

        dot.style.width =
            '7px';

        dot.style.height =
            '7px';

        dot.style.display =
            'inline-block';

        dot.style.flex =
            '0 0 7px';

        dot.style.borderRadius =
            '50%';

        dot.style.backgroundColor =
            dotColor;

        const label =
            document.createElement('span');

        label.className =
            'agenda-event-label';

        label.style.minWidth =
            '0';

        label.style.overflow =
            'hidden';

        label.style.color =
            textColor;

        label.style.fontSize =
            '11px';

        label.style.fontWeight =
            '600';

        label.style.lineHeight =
            '16px';

        label.style.textOverflow =
            'ellipsis';

        label.style.whiteSpace =
            'nowrap';

        label.textContent =
            calendarEvent.title;

        content.appendChild(dot);
        content.appendChild(label);

        return {
            domNodes: [content]
        };
    }

    styleCalendarEvent(information) {
        const calendarEvent =
            information.event;

        const element =
            information.el;

        const backgroundColor =
            calendarEvent.backgroundColor ||
            this.calendarPalette.backgroundColor;

        const borderColor =
            calendarEvent.borderColor ||
            this.calendarPalette.borderColor;

        const textColor =
            calendarEvent.textColor ||
            this.calendarPalette.textColor;

        element.style.setProperty(
            'display',
            'block',
            'important'
        );

        element.style.setProperty(
            'padding',
            '2px 6px',
            'important'
        );

        element.style.setProperty(
            'border',
            `1px solid ${borderColor}`,
            'important'
        );

        element.style.setProperty(
            'border-radius',
            '4px',
            'important'
        );

        element.style.setProperty(
            'background-color',
            backgroundColor,
            'important'
        );

        element.style.setProperty(
            'background-image',
            'none',
            'important'
        );

        element.style.setProperty(
            'color',
            textColor,
            'important'
        );

        element.style.setProperty(
            'overflow',
            'hidden',
            'important'
        );

        element.style.setProperty(
            'box-sizing',
            'border-box',
            'important'
        );

        element.style.setProperty(
            'text-decoration',
            'none',
            'important'
        );

        element.style.setProperty(
            'cursor',
            'pointer',
            'important'
        );

        if (
            information.view.type
                .startsWith('dayGrid')
        ) {
            element.style.setProperty(
                'margin',
                '2px 5px',
                'important'
            );
        }

        const executiveName =
            calendarEvent
                .extendedProps
                .executiveName;

        element.title =
            executiveName
                ? `${executiveName} - ${calendarEvent.title}`
                : calendarEvent.title;
    }

    getViewTitle(view) {
        if (
            view.type ===
            'dayGridMonth'
        ) {
            const formatter =
                new Intl.DateTimeFormat(
                    'es-MX',
                    {
                        month: 'long',
                        year: 'numeric'
                    }
                );

            const title =
                formatter
                    .format(view.currentStart)
                    .replace(' de ', ' ');

            return (
                title.charAt(0)
                    .toUpperCase() +
                title.slice(1)
            );
        }

        return view.title;
    }

    openActivityModal(selectedDate) {
        if (selectedDate < this.minimumActivityDate) {
            this.showToast(
                'Fecha no disponible',
                'No puedes registrar actividades en una fecha que ya pasó.',
                'warning'
            );

            return;
        }

        this.activityForm = {
            ...this.getEmptyActivityForm(),
            executive: this.currentUserId,
            startDate: selectedDate
        };

        this.activityTargetType = 'client';
        this.resetBranchSelection();
        this.resetProspectSelection();

        this.loadAssignedBranches();

        this.isViewingActivity = false;
        this.isActivityModalOpen = true;
    }

    closeActivityModal() {
        this.disposeNotesSpeechRecognition();
        this.resetTextImprovementState();

        this.isActivityModalOpen = false;
        this.isViewingActivity = false;
        this.selectedActivityId = '';
        this.resetBranchSelection();
        this.resetProspectSelection();
        this.activityAction = '';
        this.isUpdatingActivityDetails = false;

        this.activityActionForm = {
            newDate: '',
            justification: ''
        };
        this.followUpCompletionSummary = '';

        this.activityForm = this.getEmptyActivityForm();
    }

    detectNotesSpeechRecognitionSupport() {
        try {
            this.notesSpeechRecognitionSupported = Boolean(
                window.SpeechRecognition ||
                window.webkitSpeechRecognition
            );
        } catch {
            this.notesSpeechRecognitionSupported = false;
        }

        this.notesDictationStatus = this.notesSpeechRecognitionSupported
            ? ''
            : 'El dictado por voz no est\u00e1 disponible en este navegador.';
    }

    get showNotesSpeechControl() {
        return (
            this.enableNotesSpeechRecognition &&
            !this.isActivityDetailReadOnly
        );
    }

    get showExceptionJustificationSpeechControl() {
        return (
            this.enableNotesSpeechRecognition &&
            this.isCallVisitReplacement
        );
    }

    get showTextImprovementControl() {
        return this.enableTextImprovement;
    }

    get isNotesImproveButtonDisabled() {
        return this.isTextImprovementDisabled('notes');
    }

    get isExceptionJustificationImproveButtonDisabled() {
        return this.isTextImprovementDisabled('exceptionJustification');
    }

    get isActionJustificationImproveButtonDisabled() {
        return this.isTextImprovementDisabled('actionJustification');
    }

    get isNotesSpeechButtonDisabled() {
        return (
            !this.notesSpeechRecognitionSupported ||
            this.isActivityDetailReadOnly ||
            this.isSavingActivity ||
            this.isUpdatingActivityDetails ||
            this.isStoppingNotesDictation
        );
    }

    get isNotesInputReadOnly() {
        return (
            this.isActivityDetailReadOnly ||
            this.isDictatingNotes ||
            this.isStoppingNotesDictation ||
            this.isImprovingText
        );
    }

    get isExceptionJustificationSpeechButtonDisabled() {
        return (
            !this.notesSpeechRecognitionSupported ||
            this.isSavingActivity ||
            this.isStoppingNotesDictation
        );
    }

    get isExceptionJustificationInputReadOnly() {
        return (
            this.isDictatingTarget('exceptionJustification') ||
            this.isStoppingTarget('exceptionJustification') ||
            this.isImprovingText
        );
    }

    get isActivityActionSpeechButtonDisabled() {
        return (
            !this.notesSpeechRecognitionSupported ||
            this.isProcessingActivityAction ||
            this.isStoppingNotesDictation
        );
    }

    get isActivityActionJustificationInputReadOnly() {
        return (
            this.isDictatingTarget('actionJustification') ||
            this.isStoppingTarget('actionJustification') ||
            this.isImprovingText
        );
    }

    get isActivityActionButtonDisabled() {
        return (
            this.isProcessingActivityAction ||
            this.isDictatingNotes ||
            this.isStoppingNotesDictation ||
            this.isImprovingText
        );
    }

    get notesSpeechButtonClass() {
        return this.isDictatingNotes
            ? 'notes-speech-button is-listening'
            : 'notes-speech-button';
    }

    get notesSpeechButtonLabel() {
        if (this.isStoppingNotesDictation) {
            return 'Finalizando...';
        }

        return this.isDictatingNotes
            ? 'Detener dictado'
            : 'Dictar notas';
    }

    get justificationSpeechButtonLabel() {
        if (this.isStoppingNotesDictation) {
            return 'Finalizando...';
        }

        return this.isDictatingNotes
            ? 'Detener dictado'
            : 'Dictar justificación';
    }

    get notesSpeechIconName() {
        return 'utility:stop';
    }

    get showSpeechMicrophoneIcon() {
        return !this.isDictatingNotes && !this.isStoppingNotesDictation;
    }

    get notesSpeechButtonTitle() {
        if (!this.notesSpeechRecognitionSupported) {
            return 'El navegador no admite dictado por voz';
        }

        return this.isDictatingNotes
            ? 'Detener el dictado de notas'
            : 'Escribir las notas utilizando el micr\u00f3fono';
    }

    get showNotesDictationStatus() {
        return this.shouldShowDictationStatusFor('notes');
    }

    get showExceptionJustificationDictationStatus() {
        return this.shouldShowDictationStatusFor('exceptionJustification');
    }

    get showActivityActionJustificationDictationStatus() {
        return this.shouldShowDictationStatusFor('actionJustification');
    }

    get notesDictationStatusClass() {
        return this.isDictatingNotes
            ? 'notes-dictation-status is-listening'
            : 'notes-dictation-status';
    }

    handleToggleNotesDictation() {
        this.handleToggleSpeechDictation('notes');
    }

    handleToggleExceptionJustificationDictation() {
        this.handleToggleSpeechDictation('exceptionJustification');
    }

    handleToggleActivityActionJustificationDictation() {
        this.handleToggleSpeechDictation('actionJustification');
    }

    handleToggleSpeechDictation(target) {
        if (this.isStoppingNotesDictation) {
            return;
        }

        if (this.isDictatingNotes) {
            this.stopNotesDictation();
            return;
        }

        if (!this.notesSpeechRecognitionSupported) {
            this.showToast(
                'Dictado no disponible',
                'Este navegador no es compatible con el reconocimiento de voz.',
                'warning'
            );
            return;
        }

        const targetConfig = this.getSpeechTargetConfig(target);

        if (
            !targetConfig ||
            this.isSpeechTargetDisabled(target) ||
            !this.isActivityModalOpen ||
            !this.template.querySelector(targetConfig.selector)
        ) {
            return;
        }

        // Cada intento tiene sus propios resultados y callbacks.
        this.disposeNotesSpeechRecognition();
        this.speechDictationTarget = target;
        this.notesSpeechRecognition = this.createNotesSpeechRecognition();

        if (!this.notesSpeechRecognition) {
            return;
        }

        this.notesBeforeDictation = String(
            this.getSpeechTargetConfig(target)?.value || ''
        ).trimEnd();
        this.notesDictationHadError = false;
        this.notesDictationHasText = false;
        this.isStoppingNotesDictation = false;
        this.notesDictationStatus =
            'Solicitando acceso al micr\u00f3fono...';
        this.isDictatingNotes = true;

        try {
            this.notesSpeechRecognition.start();
        } catch (error) {
            this.handleNotesSpeechError({ error: 'start-failed', message: error?.message });
        }
    }

    createNotesSpeechRecognition() {
        let SpeechRecognitionConstructor;

        try {
            SpeechRecognitionConstructor =
                window.SpeechRecognition ||
                window.webkitSpeechRecognition;
        } catch {
            SpeechRecognitionConstructor = null;
        }

        if (!SpeechRecognitionConstructor) {
            this.notesSpeechRecognitionSupported = false;
            this.notesDictationStatus =
                'El dictado por voz no est\u00e1 disponible en este navegador.';
            return null;
        }

        let recognition;

        try {
            recognition = new SpeechRecognitionConstructor();
        } catch {
            this.notesSpeechRecognitionSupported = false;
            this.notesDictationStatus =
                'Salesforce o el navegador bloquearon el reconocimiento de voz.';
            return null;
        }

        recognition.lang = NOTES_SPEECH_LANGUAGE;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        const sessionTarget = this.speechDictationTarget;
        const isCurrentSession = () => (
            this.notesSpeechRecognition === recognition &&
            this.speechDictationTarget === sessionTarget &&
            this.isActivityModalOpen
        );

        recognition.onstart = () => {
            if (!isCurrentSession() || this.isStoppingNotesDictation) {
                return;
            }
            this.isDictatingNotes = true;
            this.notesDictationStatus =
                'Reconocimiento iniciado. Esperando audio del micrófono...';
        };

        recognition.onaudiostart = () => {
            if (isCurrentSession() && !this.isStoppingNotesDictation) {
                this.notesDictationStatus = 'Micrófono activo. Habla para dictar el texto.';
            }
        };

        recognition.onspeechstart = () => {
            if (isCurrentSession() && !this.isStoppingNotesDictation) {
                this.notesDictationStatus = 'Voz detectada. Esperando la transcripción...';
            }
        };

        recognition.onresult = event => {
            if (!isCurrentSession()) {
                return;
            }
            try {
                this.handleNotesSpeechResult(event);
            } catch (error) {
                this.handleNotesSpeechError({ error: 'result-unavailable', message: error?.message });
            }
        };

        recognition.onerror = event => {
            if (isCurrentSession()) {
                this.handleNotesSpeechError(event);
            }
        };

        recognition.onend = () => {
            if (!isCurrentSession()) {
                return;
            }
            this.isDictatingNotes = false;
            this.isStoppingNotesDictation = false;
            this.syncNotesInputValue();

            if (!this.notesDictationHadError) {
                this.notesDictationStatus = this.notesDictationHasText
                    ? 'Dictado finalizado. Puedes editar el texto antes de guardar.'
                    : 'El navegador terminó sin devolver texto. No se añadió información. Vuelve a intentar el dictado.';
            }
        };

        return recognition;
    }

    handleNotesSpeechResult(event) {
        // Son colecciones nativas, no arrays. item() también permite leerlas
        // cuando los objetos del navegador están envueltos por Lightning.
        const results = event.results;
        if (!results) {
            throw new Error('El evento de reconocimiento no expuso sus resultados.');
        }
        const transcripts = [];
        for (let index = 0; index < results.length; index += 1) {
            const result = typeof results.item === 'function'
                ? results.item(index)
                : results[index];
            const alternative = typeof result?.item === 'function'
                ? result.item(0)
                : result?.[0];
            if (alternative?.transcript) {
                transcripts.push(alternative.transcript);
            }
        }
        // La lista contiene toda la sesión, incluidos los parciales corregidos.
        // Reemplazar el sufijo dictado evita repetir las mismas frases.
        const transcribedText = transcripts.join(' ').replace(/\s+/g, ' ').trim();

        if (!transcribedText) {
            return;
        }

        const separator = this.notesBeforeDictation ? ' ' : '';
        const targetConfig = this.getSpeechTargetConfig();
        if (!targetConfig) {
            return;
        }
        const updatedText = (
            `${this.notesBeforeDictation}${separator}${transcribedText}`
        ).slice(0, targetConfig.maxLength);

        this.setSpeechTargetValue(this.speechDictationTarget, updatedText);
        this.notesDictationHasText = true;
        this.syncNotesInputValue();
        if (!this.isStoppingNotesDictation) {
            this.notesDictationStatus = 'Transcribiendo... Pulsa Detener dictado para editar o guardar.';
        }
    }

    syncNotesInputValue() {
        ['notes', 'exceptionJustification', 'actionJustification']
            .map(target => this.getSpeechTargetConfig(target))
            .forEach(config => {
                const field = this.template.querySelector(config.selector);
                const value = String(config.value || '');
                if (field && field.value !== value) {
                    field.value = value;
                }
            });
    }

    getSpeechTargetConfig(target = this.speechDictationTarget) {
        const configs = {
            notes: {
                selector: '[data-element="activity-notes"]',
                value: this.activityForm.notes,
                maxLength: NOTES_MAX_LENGTH
            },
            exceptionJustification: {
                selector: '[data-element="activity-exception-justification"]',
                value: this.activityForm.exceptionJustification,
                maxLength: EXCEPTION_JUSTIFICATION_MAX_LENGTH
            },
            actionJustification: {
                selector: '[data-element="activity-action-justification"]',
                value: this.activityActionForm.justification,
                maxLength: ACTION_JUSTIFICATION_MAX_LENGTH
            }
        };

        return configs[target] || null;
    }

    setSpeechTargetValue(target, value) {
        if (target === 'actionJustification') {
            this.activityActionForm = {
                ...this.activityActionForm,
                justification: value
            };
            return;
        }

        const fieldName = target === 'exceptionJustification'
            ? 'exceptionJustification'
            : 'notes';
        this.activityForm = {
            ...this.activityForm,
            [fieldName]: value
        };
    }

    isTextImprovementDisabled(target) {
        const targetConfig = this.getSpeechTargetConfig(target);
        const hasText = Boolean(String(targetConfig?.value || '').trim());

        if (!this.enableTextImprovement || !hasText || this.isImprovingText) {
            return true;
        }

        if (this.isDictatingNotes || this.isStoppingNotesDictation) {
            return true;
        }

        if (target === 'actionJustification') {
            return this.isProcessingActivityAction;
        }

        if (target === 'exceptionJustification') {
            return this.isSavingActivity;
        }

        return (
            this.isActivityDetailReadOnly ||
            this.isSavingActivity ||
            this.isUpdatingActivityDetails
        );
    }

    async handleImproveText(event) {
        const target = event.currentTarget.dataset.target;
        const targetConfig = this.getSpeechTargetConfig(target);
        const originalText = String(targetConfig?.value || '').trim();

        if (!targetConfig || !originalText) {
            this.showToast(
                'Texto requerido',
                'Escribe o dicta un texto antes de solicitar la mejora.',
                'warning'
            );
            return;
        }

        if (originalText.length > TEXT_IMPROVEMENT_INPUT_LIMIT) {
            this.showToast(
                'Texto demasiado largo',
                `La mejora admite hasta ${TEXT_IMPROVEMENT_INPUT_LIMIT} caracteres.`,
                'warning'
            );
            return;
        }

        const requestId = ++this.textImprovementRequest;
        this.isImprovingText = true;
        this.textImprovementTarget = target;

        try {
            const suggestion = String(
                await improveAgendaText(originalText, target) || ''
            ).trim();

            if (
                requestId !== this.textImprovementRequest ||
                !this.isActivityModalOpen
            ) {
                return;
            }

            if (!suggestion) {
                throw new Error(
                    'El servicio no devolvió una propuesta de texto.'
                );
            }

            if (suggestion.length > targetConfig.maxLength) {
                throw new Error(
                    'La propuesta supera el tamaño permitido para este campo.'
                );
            }

            this.textImprovementOriginal = originalText;
            this.textImprovementSuggestion = suggestion;
            this.isTextImprovementPreviewOpen = true;
        } catch (error) {
            if (requestId !== this.textImprovementRequest) {
                return;
            }

            this.showToast(
                'No fue posible mejorar el texto',
                error?.message || 'Inténtalo nuevamente.',
                'error'
            );
        } finally {
            if (requestId === this.textImprovementRequest) {
                this.isImprovingText = false;
            }
        }
    }

    handleUseImprovedText() {
        const targetConfig = this.getSpeechTargetConfig(
            this.textImprovementTarget
        );

        if (!targetConfig || !this.textImprovementSuggestion) {
            this.closeTextImprovementPreview();
            return;
        }

        this.setSpeechTargetValue(
            this.textImprovementTarget,
            this.textImprovementSuggestion
        );
        this.syncNotesInputValue();
        this.closeTextImprovementPreview();
    }

    closeTextImprovementPreview() {
        this.isTextImprovementPreviewOpen = false;
        this.textImprovementOriginal = '';
        this.textImprovementSuggestion = '';
        this.textImprovementTarget = '';
    }

    resetTextImprovementState() {
        this.textImprovementRequest += 1;
        this.isImprovingText = false;
        this.closeTextImprovementPreview();
    }

    isDictatingTarget(target) {
        return this.isDictatingNotes && this.speechDictationTarget === target;
    }

    isStoppingTarget(target) {
        return this.isStoppingNotesDictation && this.speechDictationTarget === target;
    }

    isSpeechTargetDisabled(target) {
        if (target === 'actionJustification') {
            return this.isActivityActionSpeechButtonDisabled;
        }
        if (target === 'exceptionJustification') {
            return this.isExceptionJustificationSpeechButtonDisabled;
        }
        return this.isNotesSpeechButtonDisabled;
    }

    shouldShowDictationStatusFor(target) {
        return (
            this.enableNotesSpeechRecognition &&
            Boolean(this.notesDictationStatus) &&
            (
                !this.notesSpeechRecognitionSupported ||
                this.speechDictationTarget === target
            )
        );
    }

    handleNotesSpeechError(event) {
        const errorCode = event?.error || '';

        const errorMessages = {
            'aborted': 'El navegador interrumpió el dictado. Puedes iniciarlo otra vez.',
            'start-failed': 'No fue posible iniciar el reconocimiento de voz. Intenta nuevamente.',
            'result-unavailable': 'No se pudo leer la transcripción del navegador. El dictado se detuvo.',
            'not-allowed':
                'Permite el acceso al micr\u00f3fono desde el navegador para usar el dictado.',
            'service-not-allowed':
                'El navegador bloque\u00f3 el servicio de reconocimiento de voz.',
            'audio-capture':
                'No se encontr\u00f3 un micr\u00f3fono disponible.',
            'no-speech':
                'No se detect\u00f3 voz. Intenta hablar m\u00e1s cerca del micr\u00f3fono.',
            'network':
                'No fue posible conectar con el servicio de reconocimiento de voz.',
            'language-not-supported':
                'El navegador no admite el reconocimiento en espa\u00f1ol de M\u00e9xico.'
        };

        const message = errorMessages[errorCode] ||
            'Ocurri\u00f3 un problema durante el dictado. Intenta nuevamente.';

        // Solo diagnóstico técnico; nunca registrar las notas ni el audio.
        console.warn('[Dictado de voz]', errorCode, event?.message || '');
        const failedTarget = this.speechDictationTarget;
        this.disposeNotesSpeechRecognition();
        this.speechDictationTarget = failedTarget;
        this.notesDictationHadError = true;
        this.isDictatingNotes = false;
        this.isStoppingNotesDictation = false;
        this.notesDictationStatus = message;

        this.showToast(
            'Dictado interrumpido',
            message,
            'warning'
        );
    }

    stopNotesDictation() {
        if (
            !this.notesSpeechRecognition ||
            this.isStoppingNotesDictation
        ) {
            return;
        }

        this.isStoppingNotesDictation = true;
        this.notesDictationStatus = 'Finalizando dictado...';

        try {
            this.notesSpeechRecognition.stop();
        } catch {
            this.isDictatingNotes = false;
            this.isStoppingNotesDictation = false;
            this.notesDictationStatus =
                'Dictado finalizado. Puedes editar el texto antes de guardar.';
        }
    }

    disposeNotesSpeechRecognition() {
        if (this.notesSpeechRecognition) {
            this.notesSpeechRecognition.onstart = null;
            this.notesSpeechRecognition.onaudiostart = null;
            this.notesSpeechRecognition.onspeechstart = null;
            this.notesSpeechRecognition.onresult = null;
            this.notesSpeechRecognition.onerror = null;
            this.notesSpeechRecognition.onend = null;

            try {
                this.notesSpeechRecognition.abort();
            } catch {
                // El reconocimiento ya estaba detenido.
            }
        }

        this.notesSpeechRecognition = null;
        this.isDictatingNotes = false;
        this.isStoppingNotesDictation = false;
        this.notesBeforeDictation = '';
        this.notesDictationHadError = false;
        this.notesDictationHasText = false;
        this.speechDictationTarget = 'notes';
        this.notesDictationStatus = this.notesSpeechRecognitionSupported
            ? ''
            : 'El dictado por voz no est\u00e1 disponible en este navegador.';
    }

    handleActivityInputChange(event) {
        const fieldName =
            event.target.name;

        const fieldValue =
            event.target.type ===
            'checkbox'
                ? event.target.checked
                : event.detail?.value ??
                    event.target.value;

        if (
            ['notes', 'exceptionJustification'].includes(fieldName) &&
            this.speechDictationTarget === fieldName &&
            (this.isDictatingNotes || this.isStoppingNotesDictation)
        ) {
            this.disposeNotesSpeechRecognition();
        }

        if (
            ['activity', 'callReplacement'].includes(fieldName) &&
            (this.isDictatingNotes || this.isStoppingNotesDictation)
        ) {
            this.disposeNotesSpeechRecognition();
        }

        const updatedForm = {
            ...this.activityForm,
            [fieldName]: fieldValue
        };

        if (fieldName === 'activity') {
            updatedForm.exceptionJustification = '';

            if (fieldValue !== 'Llamada') {
                updatedForm.callReplacement = '';
                updatedForm.callExceptionReason = '';
            }
        }

        if (fieldName === 'callReplacement' && fieldValue !== 'yes') {
            updatedForm.callExceptionReason = '';
            updatedForm.exceptionJustification = '';
        }

        this.activityForm = updatedForm;
    }

    async handleSaveActivity(event) {
        event.preventDefault();

        if (this.isActivitySaveDisabled) {
            return;
        }

        this.syncNotesInputValue();
        const submittedForm = new FormData(event.currentTarget);

        const title = String(
            submittedForm.get('title') || ''
        ).trim();

        const activity = String(
            submittedForm.get('activity') || ''
        );

        const startDate = String(
            submittedForm.get('startDate') ||
            this.activityForm.startDate ||
            ''
        );

        const state = String(
            submittedForm.get('state') || ''
        );

        const city = String(
            submittedForm.get('city') || ''
        ).trim();

        const notes = String(
            submittedForm.get('notes') || ''
        ).trim();

        const followUp = submittedForm.has('followUp');

        if (!title || !activity || !startDate) {
            this.showToast(
                'Falta información',
                'Completa título, actividad y fecha.',
                'warning'
            );

            return;
        }

        if (
            this.enableCallReplacementInterface &&
            this.isClientTarget &&
            activity === 'Llamada' &&
            !this.activityForm.callReplacement
        ) {
            this.showToast(
                'Falta información',
                'Indica si la llamada sustituye una visita presencial.',
                'warning'
            );

            return;
        }

        if (
            this.isCallVisitReplacement &&
            !this.activityForm.callExceptionReason
        ) {
            this.showToast(
                'Falta información',
                'Selecciona el motivo de la excepción.',
                'warning'
            );

            return;
        }

        if (
            this.requiresExceptionJustification &&
            !this.activityForm.exceptionJustification.trim()
        ) {
            this.showToast(
                'Falta información',
                'Escribe la justificación de la excepción.',
                'warning'
            );

            return;
        }

        if (startDate < this.minimumActivityDate) {
            this.showToast(
                'Fecha no disponible',
                'No puedes registrar actividades en una fecha que ya pasó.',
                'warning'
            );

            return;
        }

        if (this.isClientTarget && !this.hasSelectedBranch) {
            this.showToast(
                'Selecciona una sucursal',
                'Debes seleccionar una sucursal asignada.',
                'warning'
            );

            return;
        }

        if (this.isProspectTarget && !this.hasSelectedProspect) {
            this.showToast(
                'Selecciona un prospecto',
                'Debes elegir un prospecto de la lista de sugerencias.',
                'warning'
            );

            return;
        }

        const exceptionJustification =
            this.buildExceptionJustification();

        this.isSavingActivity = true;

        try {
            await createAgendaActivity({
                title,
                activityType: activity,
                date: startDate,
                state,
                city,
                prospectId: this.isProspectTarget
                    ? this.selectedProspectId
                    : null,
                branchId: this.isClientTarget
                    ? this.selectedBranchId
                    : null,
                followUp,
                notes,
                countsTowardFrequency:
                    this.shouldCountActivityForFrequency,
                exceptionJustification
            });

            await this.loadCurrentMonthActivities(
                this.calendar?.getDate() || new Date()
            );

            if (this.isMyActivitiesSectionSelected) {
                await this.loadMyActivities();
            }

            this.showToast(
                'Actividad guardada',
                'La actividad se registró correctamente.',
                'success'
            );

            this.closeActivityModal();
        } catch (error) {
            console.error(
                'Error guardando actividad:',
                error
            );

            this.showToast(
                'Error al guardar',
                error?.message ||
                'No fue posible guardar la actividad.',
                'error'
            );
        } finally {
            this.isSavingActivity = false;
        }
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

    handlePrevious() {
        if (!this.calendar) {
            return;
        }

        this.calendar.prev();

        this.loadCurrentMonthActivities(
            this.calendar.getDate()
        );
    }

    handleNext() {
        if (!this.calendar) {
            return;
        }

        this.calendar.next();

        this.loadCurrentMonthActivities(
            this.calendar.getDate()
        );
    }

    get activityStatusNavigation() {
        const events = this.myActivitiesForSelectedPeriod;
        const navigation = [
            {
                value: 'Programada',
                label: 'Programadas',
                iconName: 'utility:event'
            },
            {
                value: 'Seguimiento',
                label: 'Seguimiento',
                iconName: 'utility:refresh'
            },
            {
                value: 'Completada',
                label: 'Completadas',
                iconName: 'utility:success'
            },
            {
                value: 'Todas',
                label: 'Todas',
                iconName: 'utility:list'
            }
        ];

        return navigation.map(item => {
            const isActive = this.myActivityStatusFilter === item.value;

            return {
                ...item,
                isActive,
                count: this.countActivitiesByStatus(events, item.value),
                className: isActive
                    ? 'activities-navigation-button is-active'
                    : 'activities-navigation-button'
            };
        });
    }

    get activityPeriodNavigation() {
        const navigation = [
            { value: 'today', label: 'Hoy', iconName: 'utility:date_input' },
            { value: 'week', label: 'Esta semana', iconName: 'utility:event' },
            { value: 'month', label: 'Este mes', iconName: 'utility:monthlyview' }
        ];

        return navigation.map(item => {
            const isActive = this.myActivityPeriodFilter === item.value;

            return {
                ...item,
                isActive,
                className: isActive
                    ? 'activities-navigation-button is-active'
                    : 'activities-navigation-button'
            };
        });
    }

    get myActivitiesForSelectedPeriod() {
        return this.myActivityEvents.filter(event =>
            this.isActivityInSelectedPeriod(event.start)
        );
    }

    get filteredMyActivityEvents() {
        const events = this.myActivitiesForSelectedPeriod.filter(event =>
            this.matchesMyActivityStatusFilter(event)
        );
        const direction = this.myActivityStatusFilter === 'Completada'
            ? -1
            : 1;

        return [...events].sort((first, second) =>
            direction * first.start.localeCompare(second.start)
        );
    }

    get myActivityRows() {
        return this.filteredMyActivityEvents.map(event => {
            const details = event.extendedProps;
            const context = details.branchId
                ? [details.branchName, details.client]
                    .filter(Boolean)
                    .join(' - ')
                : details.prospect
                    ? `Prospecto - ${details.prospect}`
                    : 'Sin relación comercial';
            const location = [details.state, details.city]
                .filter(Boolean)
                .join(' · ');

            return {
                id: event.id,
                title: details.activityTitle || 'Actividad sin título',
                context,
                dateLabel: this.formatActivityDate(event.start),
                location: location || 'Sin ubicación',
                status: details.status || 'Sin estatus',
                statusClass: this.getActivityStatusClass(details.status),
                followUpLabel: details.followUp
                    ? 'Requiere seguimiento'
                    : 'Sin seguimiento',
                followUpClass: details.followUp
                    ? 'activity-follow-up-pill is-required'
                    : 'activity-follow-up-pill',
                iconName: this.getActivityTypeIcon(details.activity),
                iconClass: this.getActivityTypeIconClass(details.activity)
            };
        });
    }

    get hasMyActivityRows() {
        return this.myActivityRows.length > 0;
    }

    get myActivitiesListTitle() {
        const statusLabels = {
            Programada: 'Actividades programadas',
            Seguimiento: 'Actividades con seguimiento',
            Completada: 'Actividades completadas',
            Todas: 'Todas mis actividades'
        };
        const periodLabels = {
            today: 'Hoy',
            week: 'Esta semana',
            month: 'Este mes'
        };

        return `${statusLabels[this.myActivityStatusFilter]} · ` +
            periodLabels[this.myActivityPeriodFilter];
    }

    get myActivitiesResultSummary() {
        const total = this.myActivityRows.length;
        return `${total} ${total === 1 ? 'actividad encontrada' : 'actividades encontradas'}`;
    }

    handleMyActivityStatusFilter(event) {
        this.myActivityStatusFilter = event.currentTarget.dataset.filter;
    }

    handleMyActivityPeriodFilter(event) {
        this.myActivityPeriodFilter = event.currentTarget.dataset.filter;
    }

    countActivitiesByStatus(events, status) {
        if (status === 'Todas') {
            return events.length;
        }

        if (status === 'Seguimiento') {
            return events.filter(event => event.extendedProps.followUp).length;
        }

        return events.filter(event => event.extendedProps.status === status).length;
    }

    matchesMyActivityStatusFilter(event) {
        if (this.myActivityStatusFilter === 'Todas') {
            return true;
        }

        if (this.myActivityStatusFilter === 'Seguimiento') {
            return event.extendedProps.followUp === true;
        }

        return event.extendedProps.status === this.myActivityStatusFilter;
    }

    isActivityInSelectedPeriod(dateValue) {
        if (this.myActivityPeriodFilter === 'month') {
            return true;
        }

        const activityDate = this.parseLocalActivityDate(dateValue);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (this.myActivityPeriodFilter === 'today') {
            return activityDate.getTime() === today.getTime();
        }

        const startOfWeek = new Date(today);
        const mondayOffset = (today.getDay() + 6) % 7;
        startOfWeek.setDate(today.getDate() - mondayOffset);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 7);

        return activityDate >= startOfWeek && activityDate < endOfWeek;
    }

    parseLocalActivityDate(dateValue) {
        const [year, month, day] = String(dateValue || '')
            .split('-')
            .map(Number);
        return new Date(year, month - 1, day);
    }

    getActivityTypeIcon(activityType) {
        const normalizedType = normalizeAgendaSearchText(activityType);

        if (normalizedType.includes('llamada')) {
            return 'utility:call';
        }

        if (normalizedType.includes('visita')) {
            return 'utility:checkin';
        }

        if (normalizedType.includes('reunion')) {
            return 'utility:groups';
        }

        return 'utility:event';
    }

    getActivityTypeIconClass(activityType) {
        const normalizedType = normalizeAgendaSearchText(activityType);

        if (normalizedType.includes('llamada')) {
            return 'activity-type-icon is-call';
        }

        if (normalizedType.includes('visitas urgentes')) {
            return 'activity-type-icon is-extraordinary';
        }

        if (normalizedType.includes('visita')) {
            return 'activity-type-icon is-visit';
        }

        if (normalizedType.includes('reunion')) {
            return 'activity-type-icon is-meeting';
        }

        return 'activity-type-icon';
    }

    getActivityStatusClass(status) {
        const statusClasses = {
            Programada: 'activity-status-pill is-programmed',
            Completada: 'activity-status-pill is-completed',
            Cancelada: 'activity-status-pill is-cancelled',
            Reagendada: 'activity-status-pill is-rescheduled'
        };

        return statusClasses[status] || 'activity-status-pill';
    }

    get activityModalTitle() {
        if (this.isFollowUpCompletionFlow) {
            return 'Cerrar actividad con seguimiento';
        }

        if (this.activityAction === 'reschedule') {
            return 'Reagendar actividad';
        }

        if (this.activityAction === 'cancel') {
            return 'Cancelar actividad';
        }

        return this.isViewingActivity
            ? 'Detalle de actividad'
            : 'Nueva actividad';
    }

    get isClientTarget() {
        return this.activityTargetType === 'client';
    }

    get isProspectTarget() {
        return this.activityTargetType === 'prospect';
    }

    // =========================================================
    // INICIO: INTERFAZ OPCIONAL DE LLAMADA EN SUSTITUCIÓN
    // Se oculta cambiando enableCallReplacementInterface a false.
    // Persiste con los campos de frecuencia y justificación de excepción.
    // =========================================================
    get showCallReplacementInterface() {
        return (
            this.enableCallReplacementInterface &&
            !this.isViewingActivity &&
            this.isClientTarget &&
            this.activityForm.activity === 'Llamada'
        );
    }

    get isCallVisitReplacement() {
        return (
            this.showCallReplacementInterface &&
            this.activityForm.callReplacement === 'yes'
        );
    }

    get isRegularCall() {
        return (
            this.showCallReplacementInterface &&
            this.activityForm.callReplacement === 'no'
        );
    }

    get callReplacementYesClass() {
        return this.isCallVisitReplacement
            ? 'call-replacement-option is-selected'
            : 'call-replacement-option';
    }

    get callReplacementNoClass() {
        return this.isRegularCall
            ? 'call-replacement-option is-selected'
            : 'call-replacement-option';
    }

    get isExtraordinaryVisit() {
        return this.activityForm.activity === 'Visitas urgentes';
    }

    get showExtraordinaryVisitNotice() {
        return !this.isViewingActivity && this.isExtraordinaryVisit;
    }

    get requiresExceptionJustification() {
        return this.isCallVisitReplacement || this.isExtraordinaryVisit;
    }

    get showEditableExceptionJustification() {
        return (
            !this.isViewingActivity &&
            this.requiresExceptionJustification
        );
    }

    get showExceptionJustificationPreview() {
        return (
            this.isViewingActivity &&
            Boolean(this.activityForm.exceptionJustification)
        );
    }

    get shouldCountActivityForFrequency() {
        if (!this.isClientTarget) {
            return false;
        }

        if (this.activityForm.activity === 'Visita') {
            return true;
        }

        if (this.activityForm.activity === 'Llamada') {
            return this.isCallVisitReplacement;
        }

        return false;
    }

    normalizeStoredActivityContent(
        activityType,
        storedNotes,
        storedExceptionJustification
    ) {
        const notes = String(storedNotes || '').trim();
        const exceptionJustification = String(
            storedExceptionJustification || ''
        ).trim();

        if (exceptionJustification) {
            return {
                notes,
                exceptionJustification
            };
        }

        const isLegacyException =
            ['Llamada', 'Visitas urgentes'].includes(activityType) &&
            (
                notes.startsWith('Motivo de la excepción:') ||
                notes.startsWith('Tipo de excepción:')
            );

        if (!isLegacyException) {
            return {
                notes,
                exceptionJustification: ''
            };
        }

        const notesMarker = /\r?\nNotas de la llamada:\s*/;
        const markerMatch = notes.match(notesMarker);

        if (!markerMatch || markerMatch.index === undefined) {
            return {
                notes: '',
                exceptionJustification: notes
            };
        }

        return {
            notes: notes
                .slice(markerMatch.index + markerMatch[0].length)
                .trim(),
            exceptionJustification:
                notes.slice(0, markerMatch.index).trim()
        };
    }

    buildExceptionJustification() {
        const justification = String(
            this.activityForm.exceptionJustification || ''
        ).trim();

        if (this.isCallVisitReplacement) {
            return (
                `Motivo de la excepción: ${this.activityForm.callExceptionReason}\n` +
                `Justificación: ${justification}`
            );
        }

        if (this.isExtraordinaryVisit) {
            return (
                'Tipo de excepción: Visitas urgentes\n' +
                `Justificación: ${justification}`
            );
        }

        return '';
    }
    // FIN: INTERFAZ OPCIONAL DE LLAMADA EN SUSTITUCIÓN

    get clientTargetButtonClass() {
        return this.isClientTarget
            ? 'activity-target-button is-active'
            : 'activity-target-button';
    }

    get prospectTargetButtonClass() {
        return this.isProspectTarget
            ? 'activity-target-button is-active'
            : 'activity-target-button';
    }

    get showBranchResults() {
        return (
            this.isBranchDropdownOpen &&
            !this.isLoadingBranches
        );
    }

    get hasFilteredBranches() {
        return this.filteredBranches.length > 0;
    }

    get isBranchInputDisabled() {
        return this.isLoadingBranches;
    }

    get showProspectResults() {
        return (
            this.isProspectDropdownOpen &&
            normalizeAgendaSearchText(this.prospectSearch).length >= 2
        );
    }

    get hasProspectResults() {
        return this.prospectResults.length > 0;
    }

    get prospectEmptyMessage() {
        return this.prospectSearchError ||
            'No se encontraron prospectos asignados.';
    }

    get hasActivityClient() {
        return Boolean(this.activityForm.branchId);
    }

    get isLocationReadOnly() {
        return this.isViewingActivity || this.isClientTarget;
    }

    get isActivityActionOpen() {
        return this.activityAction !== '';
    }

    // =========================================================
    // INICIO: CIERRE DE ACTIVIDAD CON SEGUIMIENTO
    // Se oculta cambiando enableFollowUpCompletionInterface a false.
    // La resolución se guarda mediante el controlador Apex.
    // =========================================================
    get isFollowUpCompletionFlow() {
        return (
            this.enableFollowUpCompletionInterface &&
            this.activityAction === 'complete-follow-up'
        );
    }
    // FIN: CIERRE DE ACTIVIDAD CON SEGUIMIENTO

    get isReschedulingActivity() {
        return this.activityAction === 'reschedule';
    }

    get showActivityHeaderActions() {
        return (
            this.isViewingActivity &&
            !this.isActivityActionOpen &&
            this.activityForm.status === 'Programada'
        );
    }

    get isActivityHeaderActionDisabled() {
        return (
            this.isProcessingActivityAction ||
            this.isDictatingNotes ||
            this.isStoppingNotesDictation ||
            this.isImprovingText
        );
    }

    get canEditActivityDetails() {
        return (
            this.isViewingActivity &&
            !['Completada', 'Cancelada', 'Reagendada'].includes(
                this.activityForm.status
            )
        );
    }

    get isActivityDetailReadOnly() {
        return this.isViewingActivity && !this.canEditActivityDetails;
    }

    get showActivityFrequencyIndicator() {
        return (
            this.isViewingActivity &&
            ['Llamada', 'Visitas urgentes'].includes(
                this.activityForm.activity
            )
        );
    }

    get activityFrequencyLabel() {
        return this.activityForm.countsTowardFrequency ? 'Sí' : 'No';
    }

    get isUpdateActivityDisabled() {
        return (
            !this.canEditActivityDetails ||
            this.isUpdatingActivityDetails ||
            this.isDictatingNotes ||
            this.isStoppingNotesDictation ||
            this.isImprovingText
        );
    }

    get isActivitySaveDisabled() {
        return (
            this.isSavingActivity ||
            this.isDictatingNotes ||
            this.isStoppingNotesDictation ||
            this.isImprovingText
        );
    }

    formatActivityDate(dateValue) {
        const [year, month, day] = dateValue.split('-');
        return `${day}/${month}/${year}`;
    }

    handleMyActivityClick(event) {
        const activityId = event.currentTarget.dataset.id;

        this.openLoadedActivityDetail(activityId);
    }

    handleMyActivityAction(event) {
        if (event.detail.value !== 'edit') {
            return;
        }

        const activityId = event.currentTarget.dataset.id;
        this.openLoadedActivityDetail(activityId);
    }

    handleNewActivityFromList() {
        this.openActivityModal(this.minimumActivityDate);
    }

    openLoadedActivityDetail(activityId) {
        const selectedActivity = [
            ...this.allCalendarEvents,
            ...this.myActivityEvents
        ].find(activity => activity.id === activityId);

        if (!selectedActivity) {
            return false;
        }

        this.populateActivityDetail(selectedActivity);
        return true;
    }

    populateActivityDetail(selectedActivity) {

        const details = selectedActivity.extendedProps;

        this.selectedActivityId = selectedActivity.id;
        this.activityAction = '';
        this.isViewingActivity = true;
        this.activityTargetType = details.branchId
            ? 'client'
            : 'prospect';

        this.activityForm = {
            title: details.activityTitle,
            activity: details.activity,
            executive: details.executiveName || '',
            startDate: selectedActivity.start,
            state: details.state,
            city: details.city,
            client: details.client,
            prospect: details.prospect,
            prospectId: '',
            prospectCompany: '',
            branchId: details.branchId,
            branchName: details.branchName,
            callReplacement: '',
            callExceptionReason: '',
            exceptionJustification:
                details.exceptionJustification || '',
            countsTowardFrequency:
                details.countsTowardFrequency === true,
            followUp: details.followUp,
            notes: details.notes,
            folio: details.folio,
            status: details.status,
            justification: details.justification,
            originalId: details.originalId,
            originalFolio: details.originalFolio
        };

        this.isActivityModalOpen = true;
    }

    handleMobileAddActivity() {
        const date = this.calendar?.getDate() || new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        this.openActivityModal(`${year}-${month}-${day}`);
    }

    openRescheduleActivity() {
        this.disposeNotesSpeechRecognition();

        this.activityAction = 'reschedule';
        this.followUpCompletionSummary = '';
        this.activityActionForm = {
            newDate: '',
            justification: ''
        };
    }

    openCancelActivity() {
        this.disposeNotesSpeechRecognition();

        this.activityAction = 'cancel';
        this.followUpCompletionSummary = '';
        this.activityActionForm = {
            newDate: '',
            justification: ''
        };
    }

    returnToActivityDetails() {
        this.disposeNotesSpeechRecognition();
        this.activityAction = '';
        this.followUpCompletionSummary = '';
        this.activityActionForm = {
            newDate: '',
            justification: ''
        };
    }

    handleActivityActionInputChange(event) {
        const fieldName = event.target.name;
        const fieldValue = event.target.value;

        if (
            fieldName === 'justification' &&
            this.speechDictationTarget === 'actionJustification' &&
            (this.isDictatingNotes || this.isStoppingNotesDictation)
        ) {
            this.disposeNotesSpeechRecognition();
        }

        this.activityActionForm = {
            ...this.activityActionForm,
            [fieldName]: fieldValue
        };
    }

    async handleCompleteActivity() {
        if (!this.selectedActivityId || this.isProcessingActivityAction) {
            return;
        }

        this.disposeNotesSpeechRecognition();

        if (
            this.enableFollowUpCompletionInterface &&
            this.activityForm.followUp
        ) {
            this.activityAction = 'complete-follow-up';
            this.followUpCompletionSummary = '';
            return;
        }

        await this.completeSelectedActivity();
    }

    async completeSelectedActivity(followUpResolution = null) {
        if (!this.selectedActivityId || this.isProcessingActivityAction) {
            return;
        }

        this.isProcessingActivityAction = true;

        try {
            const referenceDate = this.calendar?.getDate() || new Date();

            await completeAgendaActivity(
                this.selectedActivityId,
                followUpResolution
            );
            this.closeActivityModal();
            await this.loadCurrentMonthActivities(referenceDate);

            if (this.isMyActivitiesSectionSelected) {
                await this.loadMyActivities();
            }

            this.showToast(
                'Actividad completada',
                'La actividad se marcó como completada.',
                'success'
            );
        } catch (error) {
            this.showToast(
                'Error',
                error?.message || 'No fue posible completar la actividad.',
                'error'
            );
        } finally {
            this.isProcessingActivityAction = false;
        }
    }

    // =========================================================
    // INICIO: CIERRE DE ACTIVIDAD CON SEGUIMIENTO
    // Valida y guarda la resolución antes de completar la actividad.
    // =========================================================
    handleFollowUpCompletionInput(event) {
        this.followUpCompletionSummary = event.target.value;
    }

    async handleCompleteFollowUp(event) {
        event.preventDefault();

        const followUpResolution =
            this.followUpCompletionSummary.trim();

        if (!followUpResolution) {
            this.showToast(
                'Falta información',
                'Escribe el resumen de resolución.',
                'warning'
            );
            return;
        }

        await this.completeSelectedActivity(followUpResolution);
    }
    // FIN: CIERRE DE ACTIVIDAD CON SEGUIMIENTO

    async handleUpdateActivityDetails() {
        if (
            !this.selectedActivityId ||
            this.isUpdateActivityDisabled
        ) {
            return;
        }

        const followUp = this.activityForm.followUp === true;
        const notes = String(this.activityForm.notes || '').trim();

        this.isUpdatingActivityDetails = true;

        try {
            await updateAgendaActivityDetails(
                this.selectedActivityId,
                followUp,
                notes,
                this.activityForm.exceptionJustification
            );

            this.activityForm = {
                ...this.activityForm,
                followUp,
                notes
            };

            this.allCalendarEvents = this.allCalendarEvents.map(
                activity => {
                    if (activity.id !== this.selectedActivityId) {
                        return activity;
                    }

                    return {
                        ...activity,
                        extendedProps: {
                            ...activity.extendedProps,
                            followUp,
                            notes
                        }
                    };
                }
            );

            this.myActivityEvents = this.myActivityEvents.map(
                activity => {
                    if (activity.id !== this.selectedActivityId) {
                        return activity;
                    }

                    return {
                        ...activity,
                        extendedProps: {
                            ...activity.extendedProps,
                            followUp,
                            notes
                        }
                    };
                }
            );

            this.applyCalendarFilters();
            this.closeActivityModal();

            this.showToast(
                'Actividad actualizada',
                'Las notas y el seguimiento se actualizaron correctamente.',
                'success'
            );
        } catch (error) {
            console.error(
                'Error actualizando notas y seguimiento:',
                error
            );

            this.showToast(
                'Error al actualizar',
                error?.message ||
                    'No fue posible actualizar la actividad.',
                'error'
            );
        } finally {
            this.isUpdatingActivityDetails = false;
        }
    }

    async handleConfirmActivityAction(event) {
        event.preventDefault();

        if (
            !this.selectedActivityId ||
            this.isProcessingActivityAction ||
            this.isDictatingNotes ||
            this.isStoppingNotesDictation
        ) {
            return;
        }

        const justification =
            this.activityActionForm.justification.trim();

        if (!justification) {
            this.showToast(
                'Falta información',
                'Escribe la justificación.',
                'warning'
            );

            return;
        }

        if (
            this.isReschedulingActivity &&
            !this.activityActionForm.newDate
        ) {
            this.showToast(
                'Falta información',
                'Selecciona la nueva fecha.',
                'warning'
            );

            return;
        }

        this.isProcessingActivityAction = true;

        try {
            const referenceDate = this.calendar?.getDate() || new Date();
            let successTitle;
            let successMessage;

            if (this.isReschedulingActivity) {
                await rescheduleAgendaActivity(
                    this.selectedActivityId,
                    this.activityActionForm.newDate,
                    justification
                );

                successTitle = 'Actividad reagendada';
                successMessage =
                    'La actividad anterior se conservó y se creó la nueva fecha.';
            } else {
                await cancelAgendaActivity(
                    this.selectedActivityId,
                    justification
                );

                successTitle = 'Actividad cancelada';
                successMessage =
                    'La cancelación y su justificación quedaron registradas.';
            }

            this.closeActivityModal();
            await this.loadCurrentMonthActivities(referenceDate);

            if (this.isMyActivitiesSectionSelected) {
                await this.loadMyActivities();
            }

            this.showToast(
                successTitle,
                successMessage,
                'success'
            );
        } catch (error) {
            this.showToast(
                'Error',
                error?.message ||
                    'No fue posible actualizar la actividad.',
                'error'
            );
        } finally {
            this.isProcessingActivityAction = false;
        }
    }

    async loadAssignedBranches() {
        this.isLoadingBranches = true;

        try {
            const records = await getAssignedBranches();

            this.assignedBranches = records.map(branch => ({
                id: branch.Id,
                name: branch.Name,
                client: branch.Cuenta__r?.Name || '',
                city: branch.Ciudad__c || '',
                state: resolveMexicanState(branch.Estado__c)
            }));

            this.filterAssignedBranches('');
        } catch (error) {
            console.error('Error cargando sucursales asignadas:', error);

            this.showToast(
                'Error',
                'No fue posible cargar las sucursales asignadas.',
                'error'
            );
        } finally {
            this.isLoadingBranches = false;
        }
    }

    filterAssignedBranches(searchTerm) {
        const search = normalizeAgendaSearchText(searchTerm);

        this.filteredBranches = this.assignedBranches
            .filter(branch =>
                !search ||
                normalizeAgendaSearchText(
                    `${branch.name} ${branch.client}`
                ).includes(search)
            )
            .slice(0, 8);
    }

    resetBranchSelection() {
        this.selectedBranchId = '';
        this.assignedBranches = [];
        this.filteredBranches = [];
        this.branchSearch = '';
        this.isBranchDropdownOpen = false;
        this.isLoadingBranches = false;
    }

    handleActivityTargetChange(event) {
        this.activityTargetType = event.currentTarget.dataset.type;
        this.resetBranchSelection();
        this.resetProspectSelection();

        this.activityForm = {
            ...this.activityForm,
            client: '',
            prospect: '',
            prospectId: '',
            prospectCompany: '',
            branchId: '',
            branchName: '',
            state: '',
            city: ''
        };

        if (!this.isClientTarget) {
            this.activityForm = {
                ...this.activityForm,
                callReplacement: '',
                callExceptionReason: '',
                exceptionJustification: ''
            };
        }

        if (this.isClientTarget) {
            this.loadAssignedBranches();
        }
    }

    handleBranchSearch(event) {
        this.branchSearch = event.target.value;
        this.selectedBranchId = '';
        this.isBranchDropdownOpen = true;

        this.activityForm = {
            ...this.activityForm,
            client: '',
            branchId: '',
            branchName: '',
            state: '',
            city: ''
        };

        this.filterAssignedBranches(this.branchSearch);
    }

    handleBranchFocus() {
        this.filterAssignedBranches(this.branchSearch);
        this.isBranchDropdownOpen = true;
    }

    handleBranchBlur() {
        setTimeout(() => {
            this.isBranchDropdownOpen = false;
        }, 150);
    }

    handleBranchSelect(event) {
        const branchId = event.currentTarget.dataset.branchId;

        const branch = this.assignedBranches.find(
            item => item.id === branchId
        );

        if (!branch) {
            return;
        }

        this.selectedBranchId = branch.id;
        this.branchSearch = branch.name;
        this.isBranchDropdownOpen = false;

        this.activityForm = {
            ...this.activityForm,
            client: branch.client,
            prospect: '',
            prospectId: '',
            prospectCompany: '',
            branchId: branch.id,
            branchName: branch.name,
            state: branch.state,
            city: branch.city
        };
    }

    handleProspectSearch(event) {
        const prospectSearch = event.target.value;

        this.prospectSearch = prospectSearch;
        this.selectedProspectId = '';
        this.activityForm = {
            ...this.activityForm,
            prospect: '',
            prospectId: '',
            prospectCompany: ''
        };

        this.scheduleProspectSearch(prospectSearch);
    }

    handleProspectFocus() {
        if (this.hasSelectedProspect) {
            return;
        }

        if (normalizeAgendaSearchText(this.prospectSearch).length >= 2) {
            if (this.prospectResults.length) {
                this.isProspectDropdownOpen = true;
            } else {
                this.scheduleProspectSearch(this.prospectSearch);
            }
        }
    }

    handleProspectBlur() {
        setTimeout(() => {
            this.isProspectDropdownOpen = false;
        }, 180);
    }

    scheduleProspectSearch(searchTerm) {
        this.resetProspectAutocomplete();

        if (normalizeAgendaSearchText(searchTerm).length < 2) {
            return;
        }

        const requestId = this.prospectSearchRequest;

        this.isProspectDropdownOpen = true;
        this.isSearchingProspects = true;
        this.prospectSearchTimer = setTimeout(() => {
            this.prospectSearchTimer = undefined;
            this.searchProspectOptions(searchTerm, requestId);
        }, 300);
    }

    async searchProspectOptions(searchTerm, requestId) {
        try {
            const prospects = await searchAssignedProspects(searchTerm);

            if (requestId !== this.prospectSearchRequest) {
                return;
            }

            this.prospectResults = prospects.map(prospect => ({
                id: prospect.Id,
                name: prospect.Name,
                company: prospect.Company || 'Sin compañía'
            }));
        } catch (error) {
            if (requestId !== this.prospectSearchRequest) {
                return;
            }

            console.error('Error buscando prospectos asignados:', error);
            this.prospectResults = [];
            this.prospectSearchError = error?.message ||
                'No fue posible buscar prospectos.';
        } finally {
            if (requestId === this.prospectSearchRequest) {
                this.isSearchingProspects = false;
            }
        }
    }

    handleProspectSelect(event) {
        const prospectId = event.currentTarget.dataset.prospectId;
        const prospect = this.prospectResults.find(
            item => item.id === prospectId
        );

        if (!prospect) {
            return;
        }

        this.selectedProspectId = prospect.id;
        this.prospectSearch = prospect.name;
        this.activityForm = {
            ...this.activityForm,
            prospect: prospect.name,
            prospectId: prospect.id,
            prospectCompany: prospect.company
        };

        this.resetProspectAutocomplete();
    }

    resetProspectAutocomplete() {
        if (this.prospectSearchTimer) {
            clearTimeout(this.prospectSearchTimer);
            this.prospectSearchTimer = undefined;
        }

        this.prospectSearchRequest += 1;
        this.prospectResults = [];
        this.prospectSearchError = '';
        this.isSearchingProspects = false;
        this.isProspectDropdownOpen = false;
    }

    resetProspectSelection() {
        this.selectedProspectId = '';
        this.prospectSearch = '';
        this.resetProspectAutocomplete();
    }

    handleDocumentClick() {
        this.isProspectDropdownOpen = false;
    }

    disconnectedCallback() {
        this.calendarResizeObserver?.disconnect();
        this.calendarResizeObserver = undefined;
        if (this.calendarResizeFrame != null) {
            cancelAnimationFrame(this.calendarResizeFrame);
            this.calendarResizeFrame = undefined;
        }
        this.disposeNotesSpeechRecognition();

        document.removeEventListener(
            'click',
            this.boundDocumentClickHandler
        );

        if (this.prospectSearchTimer) {
            clearTimeout(this.prospectSearchTimer);
            this.prospectSearchTimer = undefined;
        }

        this.prospectSearchRequest += 1;

        if (this.calendar) {
            this.calendar.destroy();
            this.calendar = null;
        }

        this.libraryLoaded = false;
    }
}
