import { LightningElement } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import MEXICO_LOCATIONS from '@salesforce/resourceUrl/ALMEX_MexicoLocations';
import US_LOCATIONS from '@salesforce/resourceUrl/ALMEX_USLocations';
import CONTRACT_CALENDAR from '@salesforce/resourceUrl/ALMEX_ContractCalendar';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import savePrice from '@salesforce/apex/ALMEX_FormPricesController.savePrice';
import searchAccounts from '@salesforce/apex/ALMEX_FormPricesController.searchAccounts';
import getBranchesForAccount from '@salesforce/apex/ALMEX_FormPricesController.getBranchesForAccount';

const MAX_LOOKUP_RESULTS = 10;
const CATALOG_ROOT = 'catalogmx/data/inegi';
const LIQUID_SUGAR_VALUE = 'Azúcar líquida';
const OTHER_SUPPLIER_VALUE = '__OTHER__';
const NOT_APPLICABLE_SUPPLIER_VALUE = 'N/A';
const CLIENT_MODE = 'client';
const PROSPECT_MODE = 'prospect';
const BRANCH_SEARCH_DELAY = 250;
const LEGACY_STATE_NAMES = {
    'Distrito Federal': 'Ciudad de México',
    México: 'Estado de México',
    'Querétaro de Arteaga': 'Querétaro'
};

const CORN_DERIVATIVE_SUPPLIERS = [
    'ALMEX',
    'Cargill México',
    'Ingredion México',
    'ADM México',
    'Tate & Lyle México',
    'Roquette México'
];

const SUGAR_SUPPLIERS = [
        'Zucarmex',
        'Beta San Miguel',
        'PIASA',
        'Grupo Azucarero México',
        'Grupo Porres',
        'Ingenio La Gloria'
];

// Cada producto declara proveedores y campos dependientes en el mismo catálogo.
// N/A y Otro se agregan siempre, sin depender de una segunda lista de productos.
const PRODUCT_CATALOG = [
    {
        label: 'Almidón', value: 'Almidón', suppliers: CORN_DERIVATIVE_SUPPLIERS,
        subproducts: ['25 kilos', 'Granel', 'Super saco (500 kilos)' ,'Super saco (1000 kilos)'].map(value => ({ label: value, value })), requiresShipment: true
    },
    {
        label: 'Azúcar', value: 'Azúcar', suppliers: SUGAR_SUPPLIERS,
        subproducts: [
            { label: 'Estándar', value: 'Estandar' },
            { label: 'Refinada', value: 'Refinada' },
            { label: 'Azúcar líquida', value: LIQUID_SUGAR_VALUE }
        ], requiresShipment: false
    },
    ...['Glucosa 43', 'Glucosa 44', 'Glucosa 63', 'Glucosa alta en maltosa', 'Fructosa 42', 'Fructosa 55']
        .map(value => ({ label: value, value, suppliers: CORN_DERIVATIVE_SUPPLIERS, requiresShipment: true })),
    {
        label: 'Fructosa cristalina 99', value: 'Fructosa cristalina 99',
        suppliers: ['ALMEX', 'Tate & Lyle México'], requiresShipment: true
    },
    {
        label: 'Dextrosa monohidratada', value: 'Dextrosa monohidratada',
        suppliers: ['ALMEX', 'Cargill México', 'Ingredion México', 'Roquette México'], requiresShipment: true
    },
    {
        label: 'KRYSTAR líquido', value: 'KRYSTAR líquido',
        suppliers: ['ALMEX', 'Tate & Lyle México'], requiresShipment: true
    },
    {
        label: 'Dextrosa 95% líquida', value: 'Dextrosa 95% líquida',
        suppliers: CORN_DERIVATIVE_SUPPLIERS, requiresShipment: true
    }
];

const UNIT_OPTIONS = [

    { label: 'Dólares/Kilo', value: 'DOLARES_KILO' },
    { label: 'Dólares/Ton', value: 'DOLARES_TON' },
    { label: 'MXN/Kg', value: 'MXN_Kg' },
    { label: 'MXN 25 kg/bulto', value: 'MXN_25KG_BULTO' },
    { label: 'MXN 50 kg/bulto', value: 'MXN_50KG_BULTO' },
];

const SHIPMENT_SIZE_OPTIONS = ['10 Ton', '20 Ton', '30 Ton', '38 Ton', 'N/A', 'Otro'].map((value) => ({
    label: value,
    value
}));

const STARCH_SHIPMENT_SIZE_OPTIONS = ['3 Ton', '10 Ton', '25 Ton', 'N/A', 'Otro'].map((value) => ({
    label: value,
    value
}));

function parseContractDate(text) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(text || '').trim());
    if (!match) return undefined;
    const [, day, month, year] = match.map(Number);
    const date = new Date(year, month - 1, day);
    return year >= 1900 && year <= 2100 && date.getFullYear() === year
        && date.getMonth() + 1 === month && date.getDate() === day ? date : undefined;
}

function formatContractDateEntry(text, deleting) {
    if (!/^[\d/]*$/.test(text)) return text;
    const digits = text.replace(/\D/g, '').slice(0, 8);
    const keepTrailingSlash = !deleting || text.endsWith('/');
    const daySeparator = digits.length > 2 || (digits.length === 2 && keepTrailingSlash);
    const monthSeparator = digits.length > 4 || (digits.length === 4 && keepTrailingSlash);
    return digits.slice(0, 2) + (daySeparator ? '/' : '') + digits.slice(2, 4)
        + (monthSeparator ? '/' : '') + digits.slice(4);
}

function emptyForm() {
    const today = new Date();
    return {
        productName: '',
        subproductType: '',
        periodYear: String(today.getFullYear()),
        commercialName: '',
        state: '',
        municipality: '',
        city: '',
        monthlyConsumption: '',
        consumptionType: 'A',
        importedProduct: false,
        price: '',
        unit: '',
        shipmentSize: '',
        otherShipmentSize: '',
        commercialOperationType: '',
        contractStartDate: '',
        contractEndDate: '',
        supplier: '',
        otherSupplier: '',
        factoryState: '',
        factoryCity: ''
    };
}

export default class AlmexFormPrices extends LightningElement {
    form = emptyForm();
    states = [];
    locationError;
    isSaving = false;
    partyMode = CLIENT_MODE;
    branchSearch = '';
    branchSuggestions = [];
    branchSearchMessage = '';
    isSearchingBranches = false;
    showBranchSuggestions = false;
    selectedBranchId;
    accountSearch = '';
    accountSuggestions = [];
    selectedAccountId;
    showAccountSuggestions = false;
    accountSearchMessage = '';
    accountSearchTimer;
    accountSearchRequest = 0;
    contractDateText = { contractStartDate: '', contractEndDate: '' };
    datePickers = new Map();
    calendarReady = false;
    calendarLoading = false;
    branchSearchTimer;
    branchBlurTimer;
    branchSearchRequest = 0;
    lookupBlurTimer;

    clientStateSearch = '';
    municipalitySearch = '';
    factoryStateSearch = '';
    factoryCitySearch = '';

    clientStateMatches = [];
    municipalityMatches = [];
    factoryStateMatches = [];
    factoryCityMatches = [];

    showClientStateResults = false;
    showMunicipalityResults = false;
    showFactoryStateResults = false;
    showFactoryCityResults = false;
    handleViewportChange = () => this.positionFloatingMenus();

    connectedCallback() {
        window.addEventListener('resize', this.handleViewportChange);
        window.addEventListener('scroll', this.handleViewportChange, true);
        this.syncLocationSearches();
        this.loadLocations();
        this.loadContractCalendar();
    }

    renderedCallback() {
        // Al reemplazar las opciones, el navegador puede seleccionar la primera
        // aunque el modelo esté vacío. Sincronizar la propiedad, no el atributo.
        const supplier = this.template.querySelector('select[name="supplier"]');
        if (supplier && supplier.value !== this.form.supplier) {
            supplier.value = this.form.supplier;
        }
        this.syncContractCalendars();
        this.positionFloatingMenus();
    }

    disconnectedCallback() {
        window.removeEventListener('resize', this.handleViewportChange);
        window.removeEventListener('scroll', this.handleViewportChange, true);
        this.accountSearchRequest += 1;
        this.branchSearchRequest += 1;
        clearTimeout(this.branchSearchTimer);
        clearTimeout(this.branchBlurTimer);
        clearTimeout(this.lookupBlurTimer);
        clearTimeout(this.accountSearchTimer);
        this.datePickers.forEach(picker => picker.destroy());
        this.datePickers.clear();
    }

    async loadLocations() {
        try {
            const [municipalityResponse, localityResponse, usResponse] = await Promise.all([
                fetch(`${MEXICO_LOCATIONS}/${CATALOG_ROOT}/municipios_completo.json`),
                fetch(`${MEXICO_LOCATIONS}/${CATALOG_ROOT}/localidades.json`),
                fetch(US_LOCATIONS).catch(() => null)
            ]);
            if (!municipalityResponse.ok || !localityResponse.ok) {
                throw new Error(
                    `HTTP municipios ${municipalityResponse.status}; localidades ${localityResponse.status}`
                );
            }
            const [municipalities, localities] = await Promise.all([
                municipalityResponse.json(),
                localityResponse.json()
            ]);
            this.states = this.buildLocationCatalog(municipalities, localities);
            try {
                if (!usResponse?.ok) throw new Error('US catalog unavailable');
                const us = await usResponse.json();
                this.states = [...this.states, ...this.buildUSLocationCatalog(us)];
            } catch {
                this.locationError = 'El catálogo de EE. UU. no está disponible; el catálogo de México sigue disponible.';
            }
            this.form = {
                ...this.form,
                state: this.resolveStateName(LEGACY_STATE_NAMES[this.form.state] || this.form.state),
                factoryState: this.resolveStateName(LEGACY_STATE_NAMES[this.form.factoryState] || this.form.factoryState)
            };
            this.branchSuggestions = this.branchSuggestions.map(branch => {
                const state = this.resolveStateName(branch.state);
                return { ...branch, state, subtitle: [branch.city, state].filter(Boolean).join(' · ') };
            });
            this.syncLocationSearches();
            // La búsqueda puede terminar antes de que el catálogo esté listo.
            if (this.selectedBranchId && !this.form.municipality) {
                this.form = {
                    ...this.form,
                    municipality: this.resolveBranchMunicipality(this.form.state, this.form.city)
                };
                this.syncLocationSearches();
                if (this.form.state && this.form.city && this.form.municipality) {
                    this.branchSearchMessage = '';
                }
            }
        } catch {
            this.locationError =
                'No se pudo cargar el catálogo de ubicaciones. Actualiza la página o contacta al administrador.';
        }
    }

    get productOptions() {
        return PRODUCT_CATALOG.map(({ label, value }) => ({ label, value }));
    }

    get selectedProductConfig() {
        return PRODUCT_CATALOG.find(product =>
            this.normalize(product.value) === this.normalize(this.form.productName)
        );
    }

    get subproductOptions() {
        return this.selectedProductConfig?.subproducts || [];
    }

    get supplierOptions() {
        if (!this.form.productName) {
            return [];
        }
        const supplierNames = this.selectedProductConfig?.suppliers || [];
        const suppliers = supplierNames.map((value) => ({
            label: value,
            value
        }));
        return [
            ...suppliers,
            { label: 'N/A', value: NOT_APPLICABLE_SUPPLIER_VALUE },
            { label: 'Otro', value: OTHER_SUPPLIER_VALUE }
        ];
    }

    get unitOptions() {
        return UNIT_OPTIONS;
    }

    get shipmentSizeOptions() {
        return this.form.productName === 'Almidón' ? STARCH_SHIPMENT_SIZE_OPTIONS : SHIPMENT_SIZE_OPTIONS;
    }

    get commercialOperationOptions() {
        return ['Contrato', 'Spot', 'Propuesta'].map(value => ({ label: value, value }));
    }

    get isContract() {
        return this.form.commercialOperationType === 'Contrato';
    }

    get showOtherShipmentSize() {
        return this.showShipmentSize && this.form.shipmentSize === 'Otro';
    }

    get shipmentFieldClass() {
        return this.showOtherShipmentSize ? 'shipment-field shipment-field--other' : 'shipment-field';
    }

    get resolvedShipmentSize() {
        if (!this.showShipmentSize) return null;
        return this.showOtherShipmentSize
            ? `${Number(this.form.otherShipmentSize)} Ton` : this.form.shipmentSize;
    }

    handleOtherShipmentInput(event) {
        const control = event.target;
        const value = control.value;
        if (!/^[0-9]*$/.test(value)) {
            control.value = this.form.otherShipmentSize;
            return;
        }
        this.form = { ...this.form, otherShipmentSize: value };
    }

    get isNationalProduct() { return !this.form.importedProduct; }
    get isImportedProduct() { return this.form.importedProduct; }
    get nationalProductClass() {
        return `product-origin-option${this.isNationalProduct ? ' product-origin-option--selected' : ''}`;
    }
    get importedProductClass() {
        return `product-origin-option${this.isImportedProduct ? ' product-origin-option--selected' : ''}`;
    }
    get accountLookupClass() {
        return `account-lookup client-account-lookup${this.showAccountSuggestions ? ' account-lookup--open' : ''}`;
    }
    get branchLookupClass() {
        return `account-lookup branch-lookup${this.showBranchSuggestions ? ' account-lookup--open' : ''}`;
    }
    handleProductOriginChange(event) {
        this.form = { ...this.form, importedProduct: event.target.dataset.origin === 'imported' };
        // Exactamente una selección, también al pulsar la opción ya seleccionada.
        event.target.checked = true;
    }

    async loadContractCalendar() {
        if (this.calendarLoading || this.calendarReady) return;
        this.calendarLoading = true;
        try {
            await Promise.all([
                loadScript(this, `${CONTRACT_CALENDAR}/flatpickr.min.js`),
                loadStyle(this, `${CONTRACT_CALENDAR}/flatpickr.min.css`),
                loadStyle(this, `${CONTRACT_CALENDAR}/almex-theme.css`)
            ]);
            await loadScript(this, `${CONTRACT_CALENDAR}/es.js`);
            this.calendarReady = true;
            this.syncContractCalendars();
        } catch {
            // La captura manual dd/mm/aaaa sigue disponible sin el recurso.
            this.calendarReady = false;
        } finally { this.calendarLoading = false; }
    }

    get contractStartDateDisplay() { return this.contractDateText.contractStartDate; }
    get contractEndDateDisplay() { return this.contractDateText.contractEndDate; }

    syncContractCalendars() {
        if (!this.isContract) {
            this.datePickers.forEach(picker => picker.destroy());
            this.datePickers.clear();
            return;
        }
        if (!this.calendarReady || typeof window.flatpickr !== 'function') return;
        this.template.querySelectorAll('.contract-date-input').forEach(input => {
            const field = input.name;
            if (this.datePickers.has(field)) return;
            const calendar = this.template.querySelector(`[data-calendar="${field}"]`);
            const picker = window.flatpickr(input, {
                locale: 'es', dateFormat: 'd/m/Y', allowInput: true, disableMobile: true,
                parseDate: parseContractDate, minDate: '01/01/1900', maxDate: '31/12/2100',
                monthSelectorType: 'dropdown', clickOpens: false, appendTo: calendar,
                // Document listeners see the LWC host when events cross its shadow boundary.
                // Ignore that retargeted host; the form closes calendars on real outside interactions.
                ignoredFocusElements: [this.hostElement],
                position: instance => this.positionContractCalendar(field, instance),
                onChange: (dates, text, instance) => {
                    this.contractDateText = { ...this.contractDateText, [field]: text };
                    this.form = { ...this.form, [field]: dates[0] ? instance.formatDate(dates[0], 'Y-m-d') : '' };
                    input.setCustomValidity('');
                }
            });
            picker.calendarContainer.classList.add('almex-contract-calendar');
            // La librería crea este nodo fuera del CSS scoped de LWC.
            // La superficie debe ser opaca aunque los estilos globales cambien.
            picker.calendarContainer.style.setProperty('background-color', '#ffffff', 'important');
            this.datePickers.set(field, picker);
        });
    }

    handleContractDateInput(event) {
        const input = event.target;
        const field = input.name;
        const raw = input.value;
        const cursor = input.selectionStart ?? raw.length;
        const deleting = String(event.inputType || '').startsWith('delete');
        const text = formatContractDateEntry(raw, deleting);
        let formattedCursor = cursor;
        if (text !== raw) {
            const digitsBeforeCursor = Math.min(raw.slice(0, cursor).replace(/\D/g, '').length, 8);
            formattedCursor = digitsBeforeCursor + (digitsBeforeCursor > 2 ? 1 : 0)
                + (digitsBeforeCursor > 4 ? 1 : 0);
            if (text[formattedCursor] === '/' && (!deleting || raw.slice(0, cursor).endsWith('/')
                || event.inputType === 'deleteContentForward')) formattedCursor++;
            input.value = text;
        }
        this.contractDateText = { ...this.contractDateText, [field]: text };
        const iso = parseContractDate(text) ? text.trim().split('/').reverse().join('-') : '';
        this.form = { ...this.form, [field]: iso };
        input.setCustomValidity(iso || !text ? '' : 'Escribe una fecha válida en formato dd/mm/aaaa.');
        const picker = this.datePickers.get(field);
        if (picker?.isOpen && (iso || !text)) picker.setDate(text, false, 'd/m/Y');
        input.setSelectionRange(formattedCursor, formattedCursor);
        // LWC vuelve a escribir value al renderizar; restaurar la posición después.
        Promise.resolve().then(() => {
            if (input.isConnected && input.value === text) input.setSelectionRange(formattedCursor, formattedCursor);
        });
    }

    handleContractDateBlur(event) {
        // Do not let the vendor redraw/remove the month selector while it is receiving focus.
        if (event.target.closest('[data-contract-field]')?.contains(event.relatedTarget)) {
            event.stopImmediatePropagation();
        }
    }

    handleFormCalendarInteraction(event) {
        const activeField = event.target.closest('[data-contract-field]')?.dataset.contractField;
        this.datePickers.forEach((picker, field) => {
            if (field !== activeField && picker.isOpen) picker.close();
        });
    }

    openContractCalendar(event) {
        const field = event.currentTarget.dataset.dateField;
        const picker = this.datePickers.get(field);
        if (picker) {
            if (picker.isOpen) { picker.close(); return; }
            this.datePickers.forEach((other, key) => { if (key !== field) other.close(); });
            picker.setDate(this.contractDateText[field] || '', false, 'd/m/Y');
            picker.open();
        } else {
            this.template.querySelector(`input[name="${field}"]`)?.focus();
        }
    }

    getVisibleBounds(anchor) {
        const viewport = window.visualViewport;
        const bounds = {
            top: (viewport?.offsetTop || 0) + 8,
            bottom: (viewport ? viewport.offsetTop + viewport.height : window.innerHeight) - 8,
            left: (viewport?.offsetLeft || 0) + 8,
            right: (viewport ? viewport.offsetLeft + viewport.width : window.innerWidth) - 8
        };
        // Lightning pages often scroll inside a panel, not in window.
        let parent = anchor.parentElement;
        while (parent) {
            const style = window.getComputedStyle(parent);
            const rect = parent.getBoundingClientRect();
            if (rect.height > 0 && /(auto|scroll|hidden|clip)/.test(style.overflowY)) {
                bounds.top = Math.max(bounds.top, rect.top + 4);
                bounds.bottom = Math.min(bounds.bottom, rect.bottom - 4);
            }
            if (rect.width > 0 && /(auto|scroll|hidden|clip)/.test(style.overflowX)) {
                bounds.left = Math.max(bounds.left, rect.left + 4);
                bounds.right = Math.min(bounds.right, rect.right - 4);
            }
            parent = parent.parentElement || parent.getRootNode()?.host;
        }
        return bounds;
    }

    positionFloatingMenus() {
        this.template.querySelectorAll('.lookup, .account-lookup').forEach(container => {
            const menu = container.querySelector('.lookup__menu, .account-lookup__menu');
            container.classList.toggle('lookup--open', Boolean(menu));
            if (!menu) return;
            const rect = container.getBoundingClientRect();
            const bounds = this.getVisibleBounds(container);
            const below = Math.max(0, bounds.bottom - rect.bottom - 4);
            const above = Math.max(0, rect.top - bounds.top - 4);
            const desired = Math.min(224, menu.scrollHeight || 224);
            const opensAbove = below < desired && above > below;
            menu.dataset.placement = opensAbove ? 'above' : 'below';
            menu.style.top = opensAbove ? 'auto' : 'calc(100% + 0.2rem)';
            menu.style.bottom = opensAbove ? 'calc(100% + 0.2rem)' : 'auto';
            menu.style.maxHeight = `${Math.max(32, Math.min(224, opensAbove ? above : below))}px`;
        });
        this.datePickers.forEach((picker, field) => {
            if (picker.isOpen) this.positionContractCalendar(field, picker);
        });
    }

    positionContractCalendar(field, picker) {
        const input = this.template.querySelector(`input[name="${field}"]`);
        const host = this.template.querySelector(`[data-calendar="${field}"]`);
        if (!input || !host || !picker.calendarContainer) return;
        const bounds = this.getVisibleBounds(input);
        const rect = input.getBoundingClientRect();
        const hostRect = host.getBoundingClientRect();
        const calendar = picker.calendarContainer;
        const height = calendar.offsetHeight || 310;
        const width = calendar.offsetWidth || 308;
        const below = bounds.bottom - rect.bottom - 4;
        const above = rect.top - bounds.top - 4;
        const opensAbove = below < height && above > below;
        const left = Math.max(bounds.left, Math.min(rect.left, bounds.right - width));
        calendar.style.top = `${opensAbove ? rect.top - hostRect.top - height - 4 : rect.bottom - hostRect.top + 4}px`;
        calendar.style.left = `${left - hostRect.left}px`;
        calendar.style.right = 'auto';
        calendar.style.bottom = 'auto';
        calendar.classList.toggle('arrowBottom', opensAbove);
        calendar.classList.toggle('arrowTop', !opensAbove);
    }

    get consumptionLabel() {
        return 'Consumo anual (Ton)';
    }

    get yearOptions() {
        const currentYear = new Date().getFullYear();
        return Array.from({ length: 11 }, (_, index) => {
            const value = String(currentYear - 5 + index);
            return { label: value, value };
        });
    }

    get showSubproduct() {
        return this.subproductOptions.length > 0;
    }

    get isClientMode() {
        return this.partyMode === CLIENT_MODE;
    }

    get isProspectMode() {
        return this.partyMode === PROSPECT_MODE;
    }

    get clientModeClass() {
        return `party-mode__option${this.isClientMode ? ' party-mode__option--active' : ''}`;
    }

    get prospectModeClass() {
        return `party-mode__option${this.isProspectMode ? ' party-mode__option--active' : ''}`;
    }

    get isSupplierDisabled() {
        return !this.form.productName;
    }

    get showShipmentSize() {
        return Boolean(this.selectedProductConfig?.requiresShipment) ||
            this.normalize(this.form.subproductType) === this.normalize(LIQUID_SUGAR_VALUE);
    }

    get priceDisplay() {
        const [integer, decimals] = String(this.form.price).split('.');
        const groupedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return decimals === undefined ? groupedInteger : `${groupedInteger}.${decimals}`;
    }

    get productGridClass() {
        if (this.showShipmentSize) {
            if (!this.showSubproduct) {
                return 'field-grid field-grid--product field-grid--product-with-shipment-no-subproduct';
            }
            return 'field-grid field-grid--product field-grid--product-with-shipment';
        }
        if (!this.showSubproduct) {
            return 'field-grid field-grid--product field-grid--product-without-subproduct';
        }
        return 'field-grid field-grid--product';
    }

    get showOtherSupplierInput() {
        return this.form.supplier === OTHER_SUPPLIER_VALUE;
    }

    get isSupplierNotApplicable() {
        return this.form.supplier === NOT_APPLICABLE_SUPPLIER_VALUE;
    }

    get showFactoryLocationFields() {
        return !this.isSupplierNotApplicable;
    }

    get supplierGridClass() {
        if (this.isSupplierNotApplicable) {
            return 'field-grid field-grid--supplier-na';
        }
        return this.showOtherSupplierInput
            ? 'field-grid field-grid--four'
            : 'field-grid field-grid--three';
    }

    get resolvedSupplier() {
        return this.showOtherSupplierInput
            ? (this.form.otherSupplier || '').trim()
            : this.form.supplier;
    }

    get isLocationDisabled() {
        return this.states.length === 0;
    }

    get isMunicipalityDisabled() {
        return !this.form.state || this.isLocationDisabled;
    }

    get isFactoryCityDisabled() {
        return !this.form.factoryState || this.isLocationDisabled;
    }

    get productSummary() {
        const product = this.selectedProductConfig?.label;
        const subproduct = this.findLabel(this.subproductOptions, this.form.subproductType);
        return [product, subproduct].filter(Boolean).join(' · ') || 'Sin seleccionar';
    }

    get periodSummary() {
        return this.form.periodYear || 'Sin seleccionar';
    }

    get unitSummary() {
        return this.findLabel(UNIT_OPTIONS, this.form.unit) || 'Sin seleccionar';
    }

    handleProductChange(event) {
        this.form = {
            ...this.form,
            productName: event.detail.value,
            subproductType: '',
            shipmentSize: '',
            supplier: '',
            otherSupplier: '',
            factoryState: '',
            factoryCity: ''
        };
        this.clearFactoryLocation();
    }

    handleSubproductChange(event) {
        const subproductType = event.detail.value;
        const isLiquidSugar =
            this.normalize(subproductType) === this.normalize(LIQUID_SUGAR_VALUE);
        const requiresShipment = Boolean(this.selectedProductConfig?.requiresShipment) || isLiquidSugar;
        this.form = {
            ...this.form,
            subproductType,
            shipmentSize: requiresShipment ? this.form.shipmentSize : '',
            otherShipmentSize: requiresShipment ? this.form.otherShipmentSize : ''
        };
    }

    handleFieldChange(event) {
        const { name } = event.target;
        const value = event.detail?.value ?? event.target.value;
        this.form = { ...this.form, [name]: value };
        if (name === 'commercialOperationType' && value !== 'Contrato') {
            this.form = { ...this.form, contractStartDate: '', contractEndDate: '' };
            this.contractDateText = { contractStartDate: '', contractEndDate: '' };
        }
        if (name === 'shipmentSize') this.form = { ...this.form, otherShipmentSize: '' };
    }

    handleSupplierChange(event) {
        const supplier = event.detail?.value ?? event.target.value;
        if (supplier === this.form.supplier) {
            return;
        }
        this.form = {
            ...this.form,
            supplier,
            otherSupplier: '',
            factoryState: '',
            factoryCity: ''
        };
        this.clearFactoryLocation();
    }

    clearFactoryLocation() {
        this.factoryStateSearch = '';
        this.factoryCitySearch = '';
        this.factoryStateMatches = [];
        this.factoryCityMatches = [];
        this.showFactoryStateResults = false;
        this.showFactoryCityResults = false;
        this.clearLocationValidity('factoryState', '');
        this.clearLocationValidity('factoryCity', '');
    }

    handleTextChange(event) {
        const field = event.target.dataset.field;
        this.form = { ...this.form, [field]: event.target.value };
    }

    handlePriceInput(event) {
        const control = event.target;
        const typedValue = control.value;
        const rawValue = typedValue.replace(/,/g, '');
        if ((event.data && /[^0-9.]/.test(event.data)) || !/^\d*(?:\.\d*)?$/.test(rawValue)) {
            control.value = this.priceDisplay;
            return;
        }

        // Cuenta solo caracteres del importe para conservar el cursor al añadir comas.
        const rawCursor = typedValue.slice(0, control.selectionStart ?? typedValue.length)
            .replace(/,/g, '').length;
        this.form = { ...this.form, price: rawValue };
        const formattedValue = this.priceDisplay;
        control.value = formattedValue;
        let cursor = 0;
        let rawCharacters = 0;
        while (cursor < formattedValue.length && rawCharacters < rawCursor) {
            if (formattedValue[cursor] !== ',') {
                rawCharacters += 1;
            }
            cursor += 1;
        }
        if (formattedValue[cursor] === ',') {
            cursor += 1;
        }
        control.setSelectionRange(cursor, cursor);
    }

    handlePriceKeyDown(event) {
        if (event.ctrlKey || event.metaKey || event.altKey) {
            return;
        }
        const control = event.target;
        const { selectionStart: start, selectionEnd: end } = control;
        const unselectedValue = control.value.slice(0, start) + control.value.slice(end);
        if (event.key.length === 1 && (!/[0-9.]/.test(event.key)
            || (event.key === '.' && unselectedValue.includes('.')))) {
            event.preventDefault();
        } else if (start === end && event.key === 'Backspace' && control.value[start - 1] === ',') {
            control.setSelectionRange(start - 1, start - 1);
        } else if (start === end && event.key === 'Delete' && control.value[start] === ',') {
            control.setSelectionRange(start + 1, start + 1);
        }
    }

    handlePricePaste(event) {
        const pastedValue = event.clipboardData?.getData('text') || '';
        const control = event.target;
        const candidate = (control.value.slice(0, control.selectionStart) + pastedValue
            + control.value.slice(control.selectionEnd)).replace(/,/g, '');
        if (!/^\d*(?:\.\d*)?$/.test(pastedValue) || !/^\d*(?:\.\d*)?$/.test(candidate)) {
            event.preventDefault();
        }
    }

    handlePriceBlur() {
        if (this.form.price.endsWith('.')) {
            this.form = { ...this.form, price: this.form.price.slice(0, -1) };
        }
    }

    handlePartyModeChange(event) {
        const partyMode = event.currentTarget.dataset.mode;
        if (partyMode === this.partyMode) {
            return;
        }

        this.partyMode = partyMode;
        this.accountSearch = '';
        this.accountSuggestions = [];
        this.selectedAccountId = undefined;
        this.showAccountSuggestions = false;
        this.accountSearchRequest += 1;
        clearTimeout(this.accountSearchTimer);
        clearTimeout(this.branchSearchTimer);
        clearTimeout(this.branchBlurTimer);
        this.branchSearchRequest += 1;
        this.branchSearch = '';
        this.branchSuggestions = [];
        this.branchSearchMessage = '';
        this.isSearchingBranches = false;
        this.showBranchSuggestions = false;
        this.selectedBranchId = undefined;
        this.form = {
            ...this.form,
            commercialName: '',
            state: '',
            municipality: '',
            city: ''
        };
        this.syncLocationSearches();
        this.closeLookups();
    }

    get selectedBranch() { return this.branchSuggestions.find(branch => branch.branchId === this.selectedBranchId); }
    get branchSelectorDisabled() { return !this.selectedAccountId || this.isSearchingBranches; }
    get branchSelectorLabel() { return this.selectedBranch?.name || (this.isSearchingBranches ? 'Cargando sucursales…' : 'Selecciona una sucursal'); }
    get branchSelectorSubtitle() { return this.selectedBranch?.subtitle || ''; }
    get branchOptions() { return this.branchSuggestions.map(branch => ({ ...branch, selected: branch.branchId === this.selectedBranchId })); }

    handleAccountSearch(event) {
        this.accountSearch = event.target.value;
        this.branchSearchRequest += 1;
        this.isSearchingBranches = false;
        this.branchSearchMessage = '';
        this.selectedAccountId = undefined;
        this.selectedBranchId = undefined;
        this.branchSuggestions = [];
        this.showBranchSuggestions = false;
        this.form = { ...this.form, commercialName: '', state: '', municipality: '', city: '' };
        this.syncLocationSearches();
        clearTimeout(this.accountSearchTimer);
        const requestId = ++this.accountSearchRequest;
        const term = this.accountSearch.trim();
        this.accountSuggestions = [];
        this.showAccountSuggestions = false;
        if (term.length < 2) { this.accountSearchMessage = term ? 'Escribe al menos 2 caracteres.' : ''; return; }
        this.accountSearchMessage = '';
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.accountSearchTimer = setTimeout(async () => {
            try {
                const result = await searchAccounts({ searchTerm: term });
                if (requestId !== this.accountSearchRequest) return;
                this.accountSuggestions = result || [];
                this.showAccountSuggestions = this.accountSuggestions.length > 0;
                this.accountSearchMessage = this.accountSuggestions.length ? '' : 'No se encontraron clientes a los que tengas acceso.';
            } catch (error) {
                if (requestId === this.accountSearchRequest) this.accountSearchMessage = this.getErrorMessage(error);
            }
        }, BRANCH_SEARCH_DELAY);
    }

    handleAccountFocus() {
        clearTimeout(this.branchBlurTimer);
        this.showBranchSuggestions = false;
        this.showAccountSuggestions = this.accountSuggestions.length > 0;
    }
    handleAccountBlur() {
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.branchBlurTimer = setTimeout(() => { this.showAccountSuggestions = false; }, 150);
    }

    async selectAccount(event) {
        const account = this.accountSuggestions.find(item => item.Id === event.currentTarget.dataset.id);
        if (!account) return;
        clearTimeout(this.branchBlurTimer);
        this.selectedAccountId = account.Id;
        this.accountSearch = account.Name;
        this.showAccountSuggestions = false;
        this.selectedBranchId = undefined;
        this.branchSuggestions = [];
        this.form = { ...this.form, commercialName: '', state: '', municipality: '', city: '' };
        this.syncLocationSearches();
        const requestId = ++this.branchSearchRequest;
        this.isSearchingBranches = true;
        this.branchSearchMessage = '';
        try {
            const branches = await getBranchesForAccount({ accountId: account.Id });
            if (requestId !== this.branchSearchRequest || account.Id !== this.selectedAccountId) return;
            this.branchSuggestions = (branches || []).map(branch => {
                const state = this.resolveStateName(branch.state);
                return { ...branch, state, subtitle: [branch.city, state].filter(Boolean).join(' · ') };
            });
            this.showBranchSuggestions = this.branchSuggestions.length > 0;
            this.branchSearchMessage = this.branchSuggestions.length ? '' : 'Este cliente no tiene sucursales disponibles para tu usuario.';
        } catch (error) {
            if (requestId === this.branchSearchRequest) this.branchSearchMessage = this.getErrorMessage(error);
        } finally {
            if (requestId === this.branchSearchRequest) this.isSearchingBranches = false;
        }
    }

    toggleBranchOptions() {
        clearTimeout(this.branchBlurTimer);
        this.showAccountSuggestions = false;
        this.showBranchSuggestions = this.branchSuggestions.length > 0 && !this.showBranchSuggestions;
    }

    handleBranchKeyDown(event) {
        if (!['ArrowDown', 'ArrowUp', 'Escape'].includes(event.key)) return;
        event.preventDefault();
        clearTimeout(this.branchBlurTimer);
        this.showAccountSuggestions = false;
        if (event.key === 'Escape') {
            this.showBranchSuggestions = false;
            this.template.querySelector('.branch-selector')?.focus();
            return;
        }
        this.showBranchSuggestions = this.branchSuggestions.length > 0;
        Promise.resolve().then(() => {
            const options = [...this.template.querySelectorAll('.branch-lookup [role="option"]')];
            const index = options.indexOf(event.target);
            const next = index < 0 ? (event.key === 'ArrowDown' ? 0 : options.length - 1)
                : (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
            options[next]?.focus();
        });
    }

    handleBranchBlur(event) {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        clearTimeout(this.branchBlurTimer);
        // Conserva la lista durante el clic y se cancela si el componente se desmonta.
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.branchBlurTimer = window.setTimeout(() => {
            this.showBranchSuggestions = false;
        }, 150);
    }

    selectBranch(event) {
        const branchId = event.currentTarget.dataset.id;
        const branch = this.branchSuggestions.find((item) => item.branchId === branchId);
        if (!branch) {
            return;
        }

        clearTimeout(this.branchSearchTimer);
        clearTimeout(this.branchBlurTimer);
        this.branchSearchRequest += 1;
        this.isSearchingBranches = false;
        this.selectedBranchId = branch.branchId;
        this.branchSearch = branch.name;
        this.showBranchSuggestions = false;
        const state = this.resolveStateName(branch.state);
        const municipality = this.resolveBranchMunicipality(state, branch.city);
        this.branchSearchMessage = branch.state && branch.city && municipality
            ? '' : 'Completa los datos de ubicación faltantes.';
        this.form = {
            ...this.form,
            commercialName: branch.name,
            state,
            municipality,
            city: branch.city || ''
        };
        this.syncLocationSearches();
        Promise.resolve().then(() => this.template.querySelector('.branch-selector')?.focus());
    }

    resolveBranchMunicipality(state, city) {
        const matches = this.getPlaces(state).filter(
            place => this.normalize(place.city) === this.normalize(city || '')
        );
        const municipalities = [...new Set(matches.map(place => place.municipality))];
        if (municipalities.length === 1) {
            return municipalities[0];
        }
        // La ciudad también puede venir escrita como nombre de municipio.
        const normalizedCity = this.normalize(city || '');
        const municipalityMatches = [...new Set(this.getPlaces(state)
            .filter(place => normalizedCity && (
                this.normalize(place.municipality) === normalizedCity
                || this.normalize(place.municipality).startsWith(normalizedCity + ' ')
            ))
            .map(place => place.municipality))];
        return municipalities.length === 0 && municipalityMatches.length === 1
            ? municipalityMatches[0] : '';
    }

    handleClientStateFocus() {
        clearTimeout(this.lookupBlurTimer);
        this.clientStateMatches = this.filterOptions(this.stateOptions, this.clientStateSearch);
        this.closeLookups('clientState');
        this.showClientStateResults = this.clientStateMatches.length > 0;
    }

    handleClientStateSearch(event) {
        this.clientStateSearch = event.target.value;
        this.form = { ...this.form, state: '', municipality: '', city: '' };
        this.municipalitySearch = '';
        this.clientStateMatches = this.filterOptions(this.stateOptions, this.clientStateSearch);
        this.showClientStateResults = this.clientStateMatches.length > 0;
    }

    selectClientState(event) {
        const value = event.currentTarget.dataset.value;
        this.clientStateSearch = value;
        this.municipalitySearch = '';
        this.form = { ...this.form, state: value, municipality: '', city: '' };
        this.showClientStateResults = false;
        this.municipalityMatches = this.filterOptions(this.clientMunicipalityOptions, '');
        this.clearLocationValidity('state', value);
    }

    handleMunicipalityFocus() {
        clearTimeout(this.lookupBlurTimer);
        this.municipalityMatches = this.filterOptions(
            this.clientMunicipalityOptions,
            this.municipalitySearch
        );
        this.closeLookups('municipality');
        this.showMunicipalityResults = this.municipalityMatches.length > 0;
    }

    handleMunicipalitySearch(event) {
        const value = event.target.value;
        this.municipalitySearch = value;
        this.form = { ...this.form, municipality: '', city: '' };
        this.municipalityMatches = this.filterOptions(this.clientMunicipalityOptions, value);
        this.showMunicipalityResults = this.municipalityMatches.length > 0;
    }

    selectMunicipality(event) {
        const municipality = event.currentTarget.dataset.municipality;
        const city = event.currentTarget.dataset.city;
        this.municipalitySearch = municipality;
        this.form = { ...this.form, municipality, city };
        this.showMunicipalityResults = false;
        this.clearLocationValidity('municipality', municipality);
    }

    handleFactoryStateFocus() {
        clearTimeout(this.lookupBlurTimer);
        this.factoryStateMatches = this.filterOptions(this.stateOptions, this.factoryStateSearch);
        this.closeLookups('factoryState');
        this.showFactoryStateResults = this.factoryStateMatches.length > 0;
    }

    handleFactoryStateSearch(event) {
        this.factoryStateSearch = event.target.value;
        this.factoryCitySearch = '';
        this.form = { ...this.form, factoryState: '', factoryCity: '' };
        this.factoryStateMatches = this.filterOptions(this.stateOptions, this.factoryStateSearch);
        this.showFactoryStateResults = this.factoryStateMatches.length > 0;
    }

    selectFactoryState(event) {
        const value = event.currentTarget.dataset.value;
        this.factoryStateSearch = value;
        this.factoryCitySearch = '';
        this.form = { ...this.form, factoryState: value, factoryCity: '' };
        this.showFactoryStateResults = false;
        this.factoryCityMatches = this.filterOptions(this.factoryCityOptions, '');
        this.clearLocationValidity('factoryState', value);
    }

    handleFactoryCityFocus() {
        clearTimeout(this.lookupBlurTimer);
        this.factoryCityMatches = this.filterOptions(this.factoryCityOptions, this.factoryCitySearch);
        this.closeLookups('factoryCity');
        this.showFactoryCityResults = this.factoryCityMatches.length > 0;
    }

    handleFactoryCitySearch(event) {
        const value = event.target.value;
        this.factoryCitySearch = value;
        this.form = { ...this.form, factoryCity: value };
        this.factoryCityMatches = this.filterOptions(this.factoryCityOptions, value);
        this.showFactoryCityResults = this.factoryCityMatches.length > 0;
    }

    selectFactoryCity(event) {
        const value = event.currentTarget.dataset.value;
        this.factoryCitySearch = value;
        this.form = { ...this.form, factoryCity: value };
        this.showFactoryCityResults = false;
        this.clearLocationValidity('factoryCity', value);
    }

    get stateOptions() {
        return this.states.map(({ id, label, value, searchText }) => ({ id, label, value, searchText }));
    }

    resolveStateName(value) {
        const normalized = this.normalize(value);
        return this.states.find(state => this.normalize(state.value) === normalized
            || (state.aliases || []).some(alias => this.normalize(alias) === normalized))?.value || value || '';
    }

    buildUSLocationCatalog(catalog) {
        return (catalog?.states || []).map(state => ({
            id: state.id, label: `${state.name} · EE. UU.`, value: state.name,
            searchText: `${state.name} ${state.code} EE. UU. Estados Unidos USA`, aliases: [state.code],
            places: state.cities.map(city => ({ id: `US${city.id}`, label: city.name, searchText: `${city.name} ${city.officialName}`,
                municipality: city.name, city: city.name })),
            cities: this.uniqueOptions(state.cities.map(city => ({ id: `US${city.id}`, label: city.name, value: city.name, searchText: city.name })), item => item.value)
        }));
    }

    get clientMunicipalityOptions() {
        return this.getPlaces(this.form.state);
    }

    get factoryCityOptions() {
        return this.getCities(this.form.factoryState);
    }

    getPlaces(stateName) {
        return this.states.find((state) => state.value === stateName)?.places || [];
    }

    getCities(stateName) {
        return this.states.find((state) => state.value === stateName)?.cities || [];
    }

    filterOptions(options, searchTerm) {
        const normalizedTerm = this.normalize(searchTerm);
        return options
            .filter((option) =>
                this.normalize(option.searchText || option.label).includes(normalizedTerm)
            )
            .slice(0, MAX_LOOKUP_RESULTS);
    }

    buildLocationCatalog(municipalities, localities) {
        const statesByCode = new Map();

        municipalities.forEach((municipality) => {
            const stateCode = municipality.cve_entidad;
            if (!statesByCode.has(stateCode)) {
                const stateName =
                    stateCode === '15' ? 'Estado de México' : municipality.nom_entidad;
                statesByCode.set(stateCode, {
                    id: `MX${stateCode}`,
                    label: stateName,
                    value: stateName,
                    municipalities: [],
                    localities: []
                });
            }
            statesByCode.get(stateCode).municipalities.push({
                id: `M${municipality.cve_completa}`,
                label: municipality.nom_municipio,
                searchText: municipality.nom_municipio,
                municipality: municipality.nom_municipio,
                city: municipality.nom_cabecera || municipality.nom_municipio
            });
        });

        localities.forEach((locality) => {
            const state = statesByCode.get(locality.cve_entidad);
            if (!state) {
                return;
            }
            state.localities.push({
                id: `L${locality.cvegeo}`,
                label: `${locality.nom_localidad} — ${locality.nom_municipio}`,
                searchText: `${locality.nom_localidad} ${locality.nom_municipio}`,
                municipality: locality.nom_municipio,
                city: locality.nom_localidad
            });
        });

        return [...statesByCode.values()]
            .sort((left, right) => left.id.localeCompare(right.id))
            .map((state) => ({
                ...state,
                places: this.uniqueOptions(
                    [...state.municipalities, ...state.localities],
                    (option) => `${option.municipality}|${option.city}`
                ),
                cities: this.uniqueOptions(
                    [...state.municipalities, ...state.localities].map((option) => ({
                        id: option.id,
                        label: option.city,
                        value: option.city,
                        searchText: option.city
                    })),
                    (option) => option.value
                )
            }));
    }

    uniqueOptions(options, keyFactory) {
        const unique = new Map();
        options.forEach((option) => {
            const key = this.normalize(keyFactory(option));
            if (!unique.has(key)) {
                unique.set(key, option);
            }
        });
        return [...unique.values()].sort((left, right) =>
            left.label.localeCompare(right.label, 'es-MX', { sensitivity: 'base' })
        );
    }

    handleLookupOptionMouseDown(event) {
        clearTimeout(this.lookupBlurTimer);
        event.preventDefault();
    }

    handleLookupBlur() {
        clearTimeout(this.lookupBlurTimer);
        // Conserva las opciones durante el clic; disconnectedCallback cancela el temporizador.
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.lookupBlurTimer = setTimeout(() => this.closeLookups(), 150);
    }

    normalize(value = '') {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase('es-MX')
            .trim();
    }

    closeLookups(except) {
        this.showClientStateResults = except === 'clientState' && this.showClientStateResults;
        this.showMunicipalityResults = except === 'municipality' && this.showMunicipalityResults;
        this.showFactoryStateResults = except === 'factoryState' && this.showFactoryStateResults;
        this.showFactoryCityResults = except === 'factoryCity' && this.showFactoryCityResults;
        this.showBranchSuggestions = false;
    }

    async handleSubmit(event) {
        event.preventDefault();
        if (this.isSaving) {
            return;
        }
        this.closeLookups();
        const valuesAreValid = this.validateFormValues();
        const locationsAreValid = this.validateLocationSelections();

        if (this.isClientMode && !this.selectedBranchId) {
            this.showToast(
                'Selecciona una sucursal',
                'Busca y elige una sucursal de las sugerencias antes de registrar el mapeo.',
                'error'
            );
            return;
        }

        const controls = [
            ...this.template.querySelectorAll('lightning-input, lightning-combobox, select, input')
        ];
        const isValid = controls.reduce((valid, control) => {
            control.reportValidity();
            const controlIsValid = control.checkValidity();
            return valid && controlIsValid;
        }, true);

        if (!isValid || !valuesAreValid || !locationsAreValid) {
            this.showToast('Revisa el formulario',
                this.locationError && (this.isProspectMode || !this.isSupplierNotApplicable)
                    ? this.locationError : 'Completa todos los campos obligatorios con valores válidos.', 'error');
            return;
        }

        this.isSaving = true;
        try {
            const requestInput = {
                ...this.form,
                periodYear: Number(this.form.periodYear),
                consumptionType: 'A',
                clientAccountId: this.isClientMode ? this.selectedAccountId : null,
                branchId: this.isClientMode ? this.selectedBranchId : null,
                monthlyConsumption: Number(this.form.monthlyConsumption),
                price: Number(this.form.price),
                shipmentSize: this.resolvedShipmentSize,
                contractStartDate: this.isContract ? this.form.contractStartDate : null,
                contractEndDate: this.isContract ? this.form.contractEndDate : null,
                supplier: this.resolvedSupplier
            };
            delete requestInput.otherSupplier;
            delete requestInput.otherShipmentSize;
            const response = await savePrice({
                input: requestInput
            });
            if (!response?.success) {
                throw new Error(response?.message || 'Salesforce no confirmó el registro.');
            }
            this.showToast(
                'Registro guardado',
                response.message || (response.periodPersisted
                    ? 'La información se guardó correctamente.'
                    : 'El registro se guardó, pero no se pudo guardar el año. Revisa el campo y sus permisos.'),
                response.periodPersisted ? 'success' : 'warning'
            );
            this.resetForm();
        } catch (error) {
            this.showToast('No se pudo registrar el mapeo', this.getErrorMessage(error), 'error');
        } finally {
            this.isSaving = false;
        }
    }

    resetForm() {
        this.template.querySelectorAll('lightning-input, lightning-combobox, select, input')
            .forEach(control => control.setCustomValidity(''));
        this.form = emptyForm();
        this.contractDateText = { contractStartDate: '', contractEndDate: '' };
        this.accountSearch = '';
        this.accountSuggestions = [];
        this.selectedAccountId = undefined;
        this.showAccountSuggestions = false;
        clearTimeout(this.branchSearchTimer);
        clearTimeout(this.branchBlurTimer);
        this.branchSearchRequest += 1;
        this.branchSearch = '';
        this.branchSuggestions = [];
        this.branchSearchMessage = '';
        this.isSearchingBranches = false;
        this.showBranchSuggestions = false;
        this.selectedBranchId = undefined;
        this.syncLocationSearches();
        this.closeLookups();
    }

    validateFormValues() {
        // Valida también el modelo: no convertir campos vacíos a cero ni aceptar
        // opciones que ya no pertenezcan al producto después de cambiarlo.
        const includes = (options, value) => options.some(option => option.value === value);
        const validations = {
            productName: Boolean(this.selectedProductConfig),
            subproductType: !this.showSubproduct || includes(this.subproductOptions, this.form.subproductType),
            shipmentSize: !this.showShipmentSize || includes(this.shipmentSizeOptions, this.form.shipmentSize),
            periodYear: includes(this.yearOptions, this.form.periodYear),
            clientAccount: !this.isClientMode || Boolean(this.selectedAccountId),
            clientBranch: !this.isClientMode || Boolean(this.selectedBranchId),
            commercialOperationType: includes(this.commercialOperationOptions, this.form.commercialOperationType),
            contractStartDate: !this.isContract || Boolean(this.form.contractStartDate),
            contractEndDate: !this.isContract || (Boolean(this.form.contractEndDate) &&
                this.form.contractEndDate >= this.form.contractStartDate),
            otherShipmentSize: !this.showOtherShipmentSize || (/^[0-9]+$/.test(this.form.otherShipmentSize) &&
                Number(this.form.otherShipmentSize) > 0 && this.form.otherShipmentSize.length <= 10),
            unit: includes(UNIT_OPTIONS, this.form.unit),
            supplier: includes(this.supplierOptions, this.form.supplier),
            price: /^\d*(?:\.\d{1,2})?$/.test(this.form.price) &&
                /\d/.test(this.form.price) && Number.isFinite(Number(this.form.price)),
            monthlyConsumption: String(this.form.monthlyConsumption).trim() !== '' &&
                Number.isFinite(Number(this.form.monthlyConsumption)) && Number(this.form.monthlyConsumption) >= 0
        };
        ['commercialName', 'state', 'municipality', 'city', 'otherSupplier'].forEach(field => {
            validations[field] = field === 'otherSupplier' && !this.showOtherSupplierInput
                ? true : Boolean(String(this.form[field] || '').trim());
        });
        this.template.querySelectorAll('lightning-input, lightning-combobox, select, input').forEach(control => {
            const field = control.dataset.field || control.name;
            if (Object.hasOwn(validations, field)) {
                control.setCustomValidity(validations[field] ? '' : 'Completa este campo con un valor válido.');
            }
        });
        return Object.values(validations).every(Boolean);
    }

    syncLocationSearches() {
        this.clientStateSearch = this.form.state || '';
        this.municipalitySearch = this.form.municipality || '';
        this.factoryStateSearch = this.form.factoryState || '';
        this.factoryCitySearch = this.form.factoryCity || '';
    }

    findLabel(options, value) {
        return options.find((option) => option.value === value)?.label;
    }

    validateLocationSelections() {
        const validations = {
            state: {
                valid: this.stateOptions.some((option) => option.value === this.form.state),
                message: 'Selecciona un estado de la lista.'
            },
            municipality: {
                valid: this.clientMunicipalityOptions.some((option) =>
                    option.municipality === this.form.municipality &&
                    option.city === this.form.city
                ),
                message: 'Selecciona un municipio de la lista.'
            },
            factoryState: {
                valid: this.stateOptions.some((option) => option.value === this.form.factoryState),
                message: 'Selecciona un estado de fabricación de la lista.'
            },
            factoryCity: {
                valid: this.factoryCityOptions.some(
                    (option) => option.value === this.form.factoryCity
                ),
                message: 'Selecciona una ciudad de fabricación de la lista.'
            }
        };

        Object.entries(validations).forEach(([field, validation]) => {
            const control = this.template.querySelector(`[data-location="${field}"]`);
            if (control) {
                control.setCustomValidity(validation.valid ? '' : validation.message);
            }
        });
        return (this.isClientMode || (validations.state.valid && validations.municipality.valid)) &&
            (this.isSupplierNotApplicable || (validations.factoryState.valid && validations.factoryCity.valid));
    }

    clearLocationValidity(field, value) {
        const updateControl = () => {
            const control = this.template.querySelector(`[data-location="${field}"]`);
            if (control) {
                if (value !== undefined) {
                    control.value = value;
                }
                control.setCustomValidity('');
                control.reportValidity();
            }
        };
        updateControl();
        Promise.resolve().then(updateControl);
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }

    getErrorMessage(error) {
        return error?.body?.message || error?.message || 'Ocurrió un error inesperado.';
    }
}
