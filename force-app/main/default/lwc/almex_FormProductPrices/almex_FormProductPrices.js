import { LightningElement } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import MEXICO_LOCATIONS from '@salesforce/resourceUrl/ALMEX_MexicoLocations';
import savePrice from '@salesforce/apex/ALMEX_FormPricesController.savePrice';
import searchAccounts from '@salesforce/apex/ALMEX_FormPricesController.searchAccounts';

const MAX_LOOKUP_RESULTS = 10;
const CATALOG_ROOT = 'catalogmx/data/inegi';
const LIQUID_SUGAR_VALUE = 'Azucar liquida';
const OTHER_SUPPLIER_VALUE = '__OTHER__';
const NOT_APPLICABLE_SUPPLIER_VALUE = 'N/A';
const CLIENT_MODE = 'client';
const PROSPECT_MODE = 'prospect';
const ACCOUNT_SEARCH_DELAY = 250;
const LEGACY_STATE_NAMES = {
    'Distrito Federal': 'Ciudad de México',
    México: 'Estado de México',
    'Querétaro de Arteaga': 'Querétaro'
};

const PRODUCT_OPTIONS = [
    { label: 'Almidón', value: 'Almidon' },
    { label: 'Azúcar', value: 'Azucar' },
    { label: 'Glucosa 44', value: 'Glucosa 44' },
    { label: 'Fructuosa 42', value: 'Fructuosa 42' },
    { label: 'Glucosa 43', value: 'Glucosa 43' },
    { label: 'Dextrosa líquida', value: 'Dextrosa liquida' }
];

const SUBPRODUCTS = {
    Almidon: [{ label: 'Genérico', value: 'Generico' }],
    Azucar: [
        { label: 'Estándar', value: 'Estandar' },
        { label: 'Refinada', value: 'Refinada' },
        { label: 'Azúcar líquida', value: 'Azucar liquida' }
    ],
    'Glucosa 44': [{ label: 'Genérico', value: 'Generico' }],
    'Fructuosa 42': [{ label: 'Genérico', value: 'Generico' }],
    'Glucosa 43': [{ label: 'Genérico', value: 'Generico' }],
    'Dextrosa liquida': [{ label: 'Genérico', value: 'Generico' }]
};

const CORN_DERIVATIVE_SUPPLIERS = [
    'ALMEX',
    'Cargill México',
    'Ingredion México',
    'ADM México',
    'Tate & Lyle México',
    'Roquette México'
];

const SUPPLIERS = {
    Almidon: CORN_DERIVATIVE_SUPPLIERS,
    Azucar: [
        'Zucarmex',
        'Beta San Miguel',
        'PIASA',
        'Grupo Azucarero México',
        'Grupo Porres',
        'Ingenio La Gloria'
    ],
    'Glucosa 44': CORN_DERIVATIVE_SUPPLIERS,
    'Fructuosa 42': CORN_DERIVATIVE_SUPPLIERS,
    'Glucosa 43': CORN_DERIVATIVE_SUPPLIERS,
    'Dextrosa liquida': CORN_DERIVATIVE_SUPPLIERS
};

const UNIT_OPTIONS = [

    { label: 'Dólares/Kilo', value: 'DOLARES_KILO' },
    { label: 'Dólares/Ton', value: 'DOLARES_TON' },
    { label: 'MXN/Kg', value: 'MXN_Kg' },
    { label: 'MXN 25 kg/bulto', value: 'MXN_25KG_BULTO' },
    { label: 'MXN 50 kg/bulto', value: 'MXN_50KG_BULTO' },
];

const SHIPMENT_SIZE_OPTIONS = ['10 Ton', '20 Ton', '30 Ton', 'N/A'].map((value) => ({
    label: value,
    value
}));

const MONTH_OPTIONS = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre'
].map((label, index) => ({ label, value: String(index + 1) }));

function emptyForm() {
    const today = new Date();
    return {
        productName: '',
        subproductType: '',
        periodYear: String(today.getFullYear()),
        periodMonth: String(today.getMonth() + 1),
        commercialName: '',
        state: '',
        municipality: '',
        city: '',
        monthlyConsumption: '',
        price: '',
        unit: '',
        shipmentSize: '',
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
    accountSearch = '';
    accountSuggestions = [];
    accountSearchMessage = '';
    isSearchingAccounts = false;
    showAccountSuggestions = false;
    selectedAccountId;
    accountSearchTimer;
    accountBlurTimer;
    accountSearchRequest = 0;
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

    connectedCallback() {
        this.syncLocationSearches();
        this.loadLocations();
    }

    disconnectedCallback() {
        clearTimeout(this.accountSearchTimer);
        clearTimeout(this.accountBlurTimer);
        clearTimeout(this.lookupBlurTimer);
    }

    async loadLocations() {
        try {
            const [municipalityResponse, localityResponse] = await Promise.all([
                fetch(`${MEXICO_LOCATIONS}/${CATALOG_ROOT}/municipios_completo.json`),
                fetch(`${MEXICO_LOCATIONS}/${CATALOG_ROOT}/localidades.json`)
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
            this.form = {
                ...this.form,
                state: LEGACY_STATE_NAMES[this.form.state] || this.form.state,
                factoryState: LEGACY_STATE_NAMES[this.form.factoryState] || this.form.factoryState
            };
            this.syncLocationSearches();
        } catch {
            this.locationError =
                'No se pudo cargar el catálogo de ubicaciones. Actualiza la página o contacta al administrador.';
        }
    }

    get productOptions() {
        return PRODUCT_OPTIONS;
    }

    get subproductOptions() {
        return SUBPRODUCTS[this.form.productName] || [];
    }

    get supplierOptions() {
        const supplierNames = SUPPLIERS[this.form.productName] || [];
        if (supplierNames.length === 0) {
            return [];
        }
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
        return SHIPMENT_SIZE_OPTIONS;
    }

    get monthOptions() {
        return MONTH_OPTIONS;
    }

    get yearOptions() {
        const currentYear = new Date().getFullYear();
        return Array.from({ length: 11 }, (_, index) => {
            const value = String(currentYear - 5 + index);
            return { label: value, value };
        });
    }

    get showSubproduct() {
        return ['Almidon', 'Azucar'].includes(this.form.productName);
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
        const normalizedProduct = this.normalize(this.form.productName);
        return (
            this.normalize(this.form.subproductType) === this.normalize(LIQUID_SUGAR_VALUE) ||
            normalizedProduct.startsWith('glucosa') ||
            normalizedProduct.startsWith('fructuosa') ||
            normalizedProduct === this.normalize('Dextrosa liquida')
        );
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
        const product = this.findLabel(PRODUCT_OPTIONS, this.form.productName);
        const subproduct = this.findLabel(this.subproductOptions, this.form.subproductType);
        return [product, subproduct].filter(Boolean).join(' · ') || 'Sin seleccionar';
    }

    get periodSummary() {
        const month = this.findLabel(MONTH_OPTIONS, this.form.periodMonth);
        return month && this.form.periodYear
            ? `${month} ${this.form.periodYear}`
            : 'Sin seleccionar';
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
            otherSupplier: ''
        };
    }

    handleSubproductChange(event) {
        const subproductType = event.detail.value;
        const isLiquidSugar =
            this.normalize(subproductType) === this.normalize(LIQUID_SUGAR_VALUE);
        this.form = {
            ...this.form,
            subproductType,
            shipmentSize: isLiquidSugar ? this.form.shipmentSize : ''
        };
    }

    handleFieldChange(event) {
        const { name, value } = event.target;
        this.form = { ...this.form, [name]: value };
    }

    handleSupplierChange(event) {
        const supplier = event.target.value;
        const isNotApplicable = supplier === NOT_APPLICABLE_SUPPLIER_VALUE;
        this.form = {
            ...this.form,
            supplier,
            otherSupplier: supplier === OTHER_SUPPLIER_VALUE ? this.form.otherSupplier : '',
            factoryState: isNotApplicable ? '' : this.form.factoryState,
            factoryCity: isNotApplicable ? '' : this.form.factoryCity
        };
        if (isNotApplicable) {
            this.factoryStateSearch = '';
            this.factoryCitySearch = '';
            this.factoryStateMatches = [];
            this.factoryCityMatches = [];
            this.showFactoryStateResults = false;
            this.showFactoryCityResults = false;
        }
    }

    handleTextChange(event) {
        const field = event.target.dataset.field;
        this.form = { ...this.form, [field]: event.target.value };
    }

    handlePartyModeChange(event) {
        const partyMode = event.currentTarget.dataset.mode;
        if (partyMode === this.partyMode) {
            return;
        }

        this.partyMode = partyMode;
        clearTimeout(this.accountSearchTimer);
        this.accountSearchRequest += 1;
        this.accountSearch = '';
        this.accountSuggestions = [];
        this.accountSearchMessage = '';
        this.isSearchingAccounts = false;
        this.showAccountSuggestions = false;
        this.selectedAccountId = undefined;
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

    handleAccountSearch(event) {
        const searchTerm = event.target.value;
        const trimmedTerm = searchTerm.trim();
        this.accountSearch = searchTerm;
        this.selectedAccountId = undefined;
        this.accountSuggestions = [];
        this.showAccountSuggestions = false;
        this.form = {
            ...this.form,
            commercialName: '',
            state: '',
            municipality: '',
            city: ''
        };
        clearTimeout(this.accountSearchTimer);

        if (trimmedTerm.length < 2) {
            this.accountSearchRequest += 1;
            this.isSearchingAccounts = false;
            this.accountSearchMessage = trimmedTerm
                ? 'Escribe al menos 2 caracteres.'
                : '';
            return;
        }

        const requestId = ++this.accountSearchRequest;
        this.accountSearchMessage = '';
        // Debounce intencional; el temporizador se cancela al cambiar la búsqueda o desmontar el LWC.
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.accountSearchTimer = setTimeout(
            () => this.loadAccountSuggestions(trimmedTerm, requestId),
            ACCOUNT_SEARCH_DELAY
        );
    }

    async loadAccountSuggestions(searchTerm, requestId) {
        this.isSearchingAccounts = true;
        try {
            const results = await searchAccounts({ searchTerm });
            if (requestId !== this.accountSearchRequest) {
                return;
            }
            this.accountSuggestions = results;
            this.showAccountSuggestions = results.length > 0;
            this.accountSearchMessage = results.length ? '' : 'No se encontraron clientes.';
        } catch (error) {
            if (requestId === this.accountSearchRequest) {
                this.accountSuggestions = [];
                this.showAccountSuggestions = false;
                this.accountSearchMessage = this.getErrorMessage(error);
            }
        } finally {
            if (requestId === this.accountSearchRequest) {
                this.isSearchingAccounts = false;
            }
        }
    }

    handleAccountFocus() {
        clearTimeout(this.accountBlurTimer);
        this.showAccountSuggestions = this.accountSuggestions.length > 0;
    }

    handleAccountBlur() {
        clearTimeout(this.accountBlurTimer);
        // Conserva la lista durante el clic y se cancela si el componente se desmonta.
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        this.accountBlurTimer = window.setTimeout(() => {
            this.showAccountSuggestions = false;
        }, 150);
    }

    selectAccount(event) {
        const accountId = event.currentTarget.dataset.id;
        const account = this.accountSuggestions.find((item) => item.accountId === accountId);
        if (!account) {
            return;
        }

        this.selectedAccountId = account.accountId;
        this.accountSearch = account.name;
        this.showAccountSuggestions = false;
        this.accountSearchMessage =
            account.state && account.city ? '' : 'Completa los datos de ubicación faltantes.';
        this.form = {
            ...this.form,
            commercialName: account.name,
            state: account.state || '',
            municipality: account.municipality || '',
            city: account.city || ''
        };
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
        return this.states.map(({ id, label, value }) => ({ id, label, value }));
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
        return value
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
        this.showAccountSuggestions = false;
    }

    async handleSubmit(event) {
        event.preventDefault();
        this.closeLookups();
        this.validateLocationSelections();

        if (this.isClientMode && !this.selectedAccountId) {
            this.showToast(
                'Selecciona un cliente',
                'Busca y elige un cliente de las sugerencias antes de registrar el mapeo.',
                'error'
            );
            return;
        }

        const controls = [
            ...this.template.querySelectorAll('lightning-input, lightning-combobox, select')
        ];
        const isValid = controls.reduce((valid, control) => {
            control.reportValidity();
            return valid && control.checkValidity();
        }, true);

        if (!isValid) {
            this.showToast('Revisa el formulario', 'Completa todos los campos obligatorios.', 'error');
            return;
        }

        this.isSaving = true;
        try {
            const requestInput = {
                ...this.form,
                periodYear: Number(this.form.periodYear),
                periodMonth: Number(this.form.periodMonth),
                monthlyConsumption: Number(this.form.monthlyConsumption),
                price: Number(this.form.price),
                shipmentSize: this.showShipmentSize ? this.form.shipmentSize : null,
                supplier: this.resolvedSupplier
            };
            delete requestInput.otherSupplier;
            const response = await savePrice({
                input: requestInput
            });
            this.showToast(
                'Registro guardado',
                'La información se guardó correctamente.',
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
        this.form = emptyForm();
        clearTimeout(this.accountSearchTimer);
        this.accountSearchRequest += 1;
        this.accountSearch = '';
        this.accountSuggestions = [];
        this.accountSearchMessage = '';
        this.isSearchingAccounts = false;
        this.showAccountSuggestions = false;
        this.selectedAccountId = undefined;
        this.syncLocationSearches();
        this.closeLookups();
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
