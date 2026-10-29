import { LightningElement } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import HIGHMAPS from '@salesforce/resourceUrl/Highmaps';
import MEXICO_STATES_MAP from '@salesforce/resourceUrl/MexicoStatesMap';
import sheetjs from '@salesforce/resourceUrl/sheetjs';
import getPrices from '@salesforce/apex/ALMEX_MapDataController.getPrices';
import getExchangeRate from '@salesforce/apex/ALMEX_MapDataController.getExchangeRate';
import USER_TIME_ZONE from '@salesforce/i18n/timeZone';

function toExcelRegistrationDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: USER_TIME_ZONE,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(date).map(part => [part.type, part.value]));
    // Excel no almacena zona horaria: conservar la fecha/hora local del usuario de Salesforce.
    const localTime = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
        Number(parts.hour), Number(parts.minute), Number(parts.second));
    return { t: 'n', v: (localTime - Date.UTC(1899, 11, 30)) / 86400000, z: 'dd/mm/yyyy hh:mm:ss' };
}

const PRICE_UNITS = Object.freeze({
    MXN_PER_KG: 'MXN_Kg',
    MXN_25_KG_BAG: 'MXN_25KG_BULTO',
    MXN_50_KG_BAG: 'MXN_50KG_BULTO',
    USD_PER_TON: 'DOLARES_TON',
    USD_PER_KG: 'DOLARES_KILO'
});

const CURRENCIES = Object.freeze({
    MXN: 'MXN',
    USD: 'USD'
});

const PRICE_UNIT_CONFIG = Object.freeze({
    [PRICE_UNITS.MXN_PER_KG]: Object.freeze({
        currency: CURRENCIES.MXN,
        divisor: 1
    }),
    [PRICE_UNITS.MXN_25_KG_BAG]: Object.freeze({
        currency: CURRENCIES.MXN,
        divisor: 25
    }),
    [PRICE_UNITS.MXN_50_KG_BAG]: Object.freeze({
        currency: CURRENCIES.MXN,
        divisor: 50
    }),
    [PRICE_UNITS.USD_PER_TON]: Object.freeze({
        currency: CURRENCIES.USD,
        divisor: 1000
    }),
    [PRICE_UNITS.USD_PER_KG]: Object.freeze({
        currency: CURRENCIES.USD,
        divisor: 1
    })
});

const STATE_NAME_ALIASES = Object.freeze({
    México: 'Estado de México',
    'Estado de Mexico': 'Estado de México',
    'Estado de México': 'Estado de México',
    'Distrito Federal': 'Ciudad de México',
    'Ciudad de Mexico': 'Ciudad de México',
    'Ciudad de México': 'Ciudad de México',
    Michoacan: 'Michoacán',
    'Queretaro': 'Querétaro',
    'San Luis Potosi': 'San Luis Potosí',
    'Yucatan': 'Yucatán',
    'Nuevo Leon': 'Nuevo León'
});

// Highmaps conserva estos nombres históricos dentro de su geometría.
// Se usan solo para localizar el polígono; nunca se muestran al usuario.
const HIGHMAPS_STATE_NAMES = Object.freeze({
    'Estado de México': 'México',
    'Ciudad de México': 'Distrito Federal'
});

const PRODUCT_NAME_ALIASES = Object.freeze({
    'Almidon': 'Almidón',
    'Azucar': 'Azúcar',
    'Fructuosa 42': 'Fructosa 42',
    // Compatibilidad de lectura: el nombre anterior corresponde al mismo producto.
    'Dextrosa líquida': 'Dextrosa 95% líquida',
    'Dextrosa Líquida': 'Dextrosa 95% líquida',
    'Dextrosa Liquida': 'Dextrosa 95% líquida',
    'Dextrosa liquida': 'Dextrosa 95% líquida',
    'Glucosa Alta Maltosa': 'Glucosa alta en maltosa',
    'Glucosa alta maltosa': 'Glucosa alta en maltosa',
    'Fructosa Cristalina 99': 'Fructosa cristalina 99',
    'Krystar Liquido': 'KRYSTAR líquido',
    'Krystar líquido': 'KRYSTAR líquido',
    'KRYSTAR Liquido': 'KRYSTAR líquido',
    'Dextrosa 95% liquida': 'Dextrosa 95% líquida',
    'Dextrosa 95% Líquida': 'Dextrosa 95% líquida'
});

const DEFAULT_PROVIDER_COLOR = '#5B6573';
// Una sola definición de identidad y color, compartida por mapa, leyendas,
// filtros, tablas y exportación. Conservar los colores existentes de PIASA/BSM.
const PROVIDER_CATALOG = Object.freeze([
    { name: 'ALMEX', color: '#D32F2F' },
    { name: 'Ingredion México', color: '#6CB33E', aliases: ['Ingredion'] },
    { name: 'Cargill México', color: '#00843D', aliases: ['Cargill'] },
    { name: 'ADM México', color: '#012169', aliases: ['ADM'] },
    { name: 'Tate & Lyle México', color: '#4D6987', aliases: ['Tate & Lyle'] },
    { name: 'Roquette México', color: '#0052D2', aliases: ['Roquette'] },
    { name: 'Primient', color: '#757575' },
    { name: 'PIASA', color: '#B71C1C' },
    { name: 'Mill Foods', color: '#7ACDE2' },
    { name: 'Beta San Miguel', color: '#3949AB' },
    { name: 'Grupo Azucarero México', color: '#795548', aliases: ['Grupo Azucarero Mexico', 'GAM'] },
    { name: 'Grupo Porres', color: '#009633' },
    { name: 'Zucarmex', color: '#0D662C' },
    { name: 'Ingenio La Gloria', color: '#F57C00' },
    { name: 'MC Sugar', color: '#37B1E0' },
    { name: 'N/A', color: DEFAULT_PROVIDER_COLOR }
]);

function providerIdentityKey(provider) {
    return String(provider || '').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const PROVIDERS_BY_KEY = Object.freeze(Object.fromEntries(PROVIDER_CATALOG.flatMap(provider =>
    [provider.name, ...(provider.aliases || [])].map(name => [providerIdentityKey(name), provider])
)));
const PROVIDER_COLORS = Object.freeze(Object.fromEntries(
    PROVIDER_CATALOG.map(({ name, color }) => [name, color])
));

function normalizeStateName(state) {
    const normalizedState = String(state || '').trim();
    return STATE_NAME_ALIASES[normalizedState] || normalizedState;
}

function getHighmapsStateName(state) {
    const displayState = normalizeStateName(state);
    return HIGHMAPS_STATE_NAMES[displayState] || displayState;
}

function normalizeProductName(product) {
    return PRODUCT_NAME_ALIASES[product] || product;
}

function normalizeProvider(provider) {
    const normalizedProvider = String(provider || '').trim();

    if (!normalizedProvider) {
        return 'N/A';
    }

    return PROVIDERS_BY_KEY[providerIdentityKey(normalizedProvider)]?.name || normalizedProvider;
}

function normalizeUnitKey(unit) {
    return String(unit || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}

function getPriceUnitConfig(unit) {
    switch (normalizeUnitKey(unit)) {
        case 'MXN_KG':
        case 'MXN_KLG':
        case 'MXN_KILO':
            return PRICE_UNIT_CONFIG[PRICE_UNITS.MXN_PER_KG];

        case 'MXN_25KG_BULTO':
        case 'MXN_25_KG_BULTO':
            return PRICE_UNIT_CONFIG[PRICE_UNITS.MXN_25_KG_BAG];

        case 'MXN_50KG_BULTO':
        case 'MXN_50_KG_BULTO':
            return PRICE_UNIT_CONFIG[PRICE_UNITS.MXN_50_KG_BAG];

        case 'DOLARES_TON':
        case 'DOLARES_TONELADA':
        case 'USD_TON':
        case 'USD_TONELADA':
            return PRICE_UNIT_CONFIG[PRICE_UNITS.USD_PER_TON];

        case 'DOLARES_KILO':
        case 'DOLARES_KG':
        case 'USD_KILO':
        case 'USD_KG':
            return PRICE_UNIT_CONFIG[PRICE_UNITS.USD_PER_KG];

        default:
            return null;
    }
}

function getRecordConsumptionType(record) {
    return String(record?.Tipo_consumo_toneladas__c || '').trim().toUpperCase() || 'M';
}

function normalizePricePerTon(price, unit, mxnPerUsd) {
    const numericPrice = Number(price);
    const unitConfig = getPriceUnitConfig(unit);

    if (!Number.isFinite(numericPrice) || numericPrice <= 0 || !unitConfig) {
        return null;
    }

    const perTon = numericPrice / unitConfig.divisor * 1000;
    if (unitConfig.currency === CURRENCIES.USD) return perTon;
    return Number.isFinite(mxnPerUsd) && mxnPerUsd > 0 ? perTon / mxnPerUsd : null;
}

function normalizePeriodValue(value, record) {
    return getRecordConsumptionType(record) === 'A' ? value : value * 12;
}

function normalizeConsumption(record) {
    return normalizePeriodValue(Number(record.Consumo_mensual__c) || 0, record);
}

function normalizePeriodPrice(record, mxnPerUsd) {
    const pricePerTon = normalizePricePerTon(record.Precio_producto__c, record.Unidad__c, mxnPerUsd);
    // Regla comercial: homologar cada precio al periodo elegido ANTES de promediar.
    // No redondear aquí ni modificar el precio registrado en Salesforce.
    return pricePerTon === null ? null : normalizePeriodValue(pricePerTon, record);
}

function formatRegisteredPrice(price, unit) {
    if (price === null || price === undefined || price === '' || !Number.isFinite(Number(price))) return '';
    const amount = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(price));
    const currency = getPriceUnitConfig(unit)?.currency;
    return currency ? `${currency} ${amount}` : `${amount} (${unit || 'Sin unidad'})`;
}

function productUsesShipmentSize(product) {
    const normalizedProduct = String(product || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();

    return (
        normalizedProduct === 'almidon' ||
        normalizedProduct.includes('glucosa') ||
        normalizedProduct.includes('fructosa') ||
        normalizedProduct.includes('fructuosa') ||
        normalizedProduct === 'krystar liquido' ||
        normalizedProduct === 'dextrosa monohidratada' ||
        (
            normalizedProduct.includes('dextrosa') &&
            normalizedProduct.includes('liquida')
        )
    );
}

function getRecordYears(record) {
    const period = getRecordPeriod(record);
    return period ? [period.year] : [];
}

function getRecordPeriod(record) {
    const periodYear = Number(record?.Periodo_Anio__c);

    if (
        Number.isInteger(periodYear) &&
        periodYear >= 2000 &&
        periodYear <= 2100
    ) {
        return {
            year: periodYear,
            key: periodYear,
            label: String(periodYear)
        };
    }

    return null;
}

export default class MapaNacional extends LightningElement {

    prices = [];
    mapData;
    worldMapData;
    highmapsInitialized = false;

    selectedProduct = 'Azúcar';
    summaryTableData = [];
    cityTableData = [];

    monitoredProducts = 0;
    analyzedStates = 0;
    averagePrice = 0;
    outOfRangeStates = 0;

    dataLoadError = '';

    selectedProvider = 'ALL';
    selectedMapProviders = [];
    get selectedCurrency() { return CURRENCIES.USD; }
    get selectedConsumptionType() { return 'A'; }
    selectedPeriodYear = '';
    exchangeRate;
    exchangeRateError = '';
    historyProvider = 'ALL';
    lastLegendClickProvider = '';
    lastLegendClickTime = 0;

    get isUsdSelected() {
        return true;
    }

    get currentPriceUnitLabel() {
        return 'USD/Ton';
    }

    get fxRate() { return Number(this.exchangeRate?.mxnPerUsd) || null; }

    get exchangeRateLabel() {
        return this.fxRate
            ? `Banxico FIX · 1 USD = ${this.fxRate} MXN · Fecha ${this.exchangeRate.rateDate}`
            : 'Sin tipo de cambio: los precios MXN no están convertidos';
    }

    get periodYearOptions() {
        const years = new Set(this.prices.flatMap(getRecordYears));
        return [{ label: 'Selecciona el año', value: '' }, ...[...years].sort((a, b) => b - a).map(y => ({ label: String(y), value: String(y) }))];
    }

    get periodFilterLabel() {
        return this.selectedPeriodYear ? `Año ${this.selectedPeriodYear}` : 'Todos los años';
    }

    matchesPeriod(record) {
        return !this.selectedPeriodYear || getRecordYears(record).includes(Number(this.selectedPeriodYear));
    }

    get historyContextLabel() {
        return `Solo propuestas · Vista anual · ${this.periodFilterLabel} · ${this.currentPriceUnitLabel}`;
    }

    handlePeriodChange(event) {
        const value = event.detail?.value ?? event.target.value;
        if (event.target.name === 'periodFilterYear') {
            this.selectedPeriodYear = value;
            if (this.selectedPeriodYear) this.selectedYear = this.selectedPeriodYear;
        }
        this.refreshProviderFilteredViews();
    }

    get hasPeriodFilter() { return Boolean(this.selectedPeriodYear); }

    clearPeriodFilters() {
        this.selectedPeriodYear = '';
        this.refreshProviderFilteredViews();
    }

    get historyProviderOptions() {
        return [{ label: 'Todos los proveedores', value: 'ALL' }, ...[...new Set(this.prices
            .filter(p => p.Nombre_producto__c === this.selectedProduct && p.Tipo_operacion_comercial__c === 'Propuesta' && this.matchesPeriod(p) && this.matchesActiveProvider(p))
            .map(p => normalizeProvider(p.Proveedor__c)))].sort().map(value => ({ label: value, value }))];
    }

    handleHistoryProviderChange(event) { this.historyProvider = event.detail?.value ?? event.target.value; }

    get historyTableColumns() {
        // Una propuesta no tiene vigencia contractual: esas columnas pertenecen al desglose.
        return this.cityTableColumns.filter(column => ![
            'operationType', 'contractStartDate', 'contractEndDate'
        ].includes(column.fieldName));
    }

    tableColumnWidths = {};

    getTableStyle(columns, key, selectable = false) {
        const signature = columns.map(column => column.fieldName).join('|');
        const resized = this.tableColumnWidths[key];
        const columnsWidth = resized?.signature === signature ? resized.width : columns.reduce(
            (total, column) => total + (column.fixedWidth || column.initialWidth || 150), 0
        );
        // La tabla debe caber completa en su host. Solo el div exterior desplaza.
        const width = Math.ceil(columnsWidth) + (selectable ? 52 : 0) + 2;
        return `width: ${width}px; min-width: 100%;`;
    }

    get summaryTableStyle() { return this.getTableStyle(this.summaryTableColumns, 'state', true); }
    get cityTableStyle() { return this.getTableStyle(this.cityTableColumns, 'city'); }
    get historyTableStyle() { return this.getTableStyle(this.historyTableColumns, 'history'); }
    handleTableResize(event) {
        if (!event.detail?.isUserTriggered || !Array.isArray(event.detail.columnWidths)) return;
        const key = event.currentTarget.dataset.table;
        const columns = key === 'state' || key === 'expandedState' ? this.summaryTableColumns
            : key === 'history' ? this.historyTableColumns : this.cityTableColumns;
        const widths = event.detail.columnWidths;
        const selectable = key === 'state';
        const dataWidths = selectable && widths.length === columns.length + 1 ? widths.slice(1) : widths;
        if (dataWidths.length !== columns.length || dataWidths.some(width => !Number.isFinite(width) || width < 50)) return;
        this.tableColumnWidths = { ...this.tableColumnWidths, [key]: {
            signature: columns.map(column => column.fieldName).join('|'),
            width: dataWidths.reduce((total, width) => total + width, 0)
        } };
    }

    get historyTableData() {
        return this.buildCityTableData(this.prices.filter(record => record.Nombre_producto__c === this.selectedProduct &&
            record.Tipo_operacion_comercial__c === 'Propuesta' && this.matchesPeriod(record) && this.matchesActiveProvider(record) &&
            (this.historyProvider === 'ALL' || normalizeProvider(record.Proveedor__c) === this.historyProvider)), this.selectedConsumptionType);
    }

    get consumptionPeriodLabel() {
        return 'anual';
    }

    get averagePriceTitle() {
        return `Precio promedio ${this.consumptionPeriodLabel}`;
    }

    get mapSubtitle() {
        return `Proveedor líder por consumo ${this.consumptionPeriodLabel} en cada estado`;
    }

    get averagePriceDisplay() {
        const numericPrice = Number(this.averagePrice) || 0;
        const prefix = this.isUsdSelected ? 'US$' : '$';

        return this.averagePrice === null ? '—' : `${prefix}${numericPrice.toFixed(2)}`;
    }

    get usesShipmentSize() {
        return productUsesShipmentSize(this.selectedProduct);
    }

    get hasSubproduct() {
        return ['Almidón', 'Azúcar'].includes(this.selectedProduct);
    }

    get hasShipmentColumn() {
        return this.usesShipmentSize || (this.selectedProduct === 'Azúcar' && this.prices.some(record =>
            record.Nombre_producto__c === this.selectedProduct && this.matchesPeriod(record) &&
            String(record.Tipo_subproducto__c || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() === 'azucar liquida'
        ));
    }

    get priceDataWarning() {
        const excluded = this.getSelectedProductRecords().filter(record =>
            normalizePricePerTon(record.Precio_producto__c, record.Unidad__c, this.fxRate) === null
        ).length;
        return excluded ? `${excluded} registro(s) sin precio unitario comparable (precio ausente o cero, unidad no reconocida o conversión no disponible). Se muestran en el detalle, pero no se incluyen en los promedios.` : '';
    }

    get cityContextLabel() {
        const states = this.selectedStates.length ? `Estados seleccionados: ${this.selectedStates.join(', ')}` : 'Todos los estados';
        return `${this.selectedProduct} · ${states} · Vista ${this.consumptionPeriodLabel} · ${this.currentPriceUnitLabel}`;
    }

    get summaryRowCount() {
        return this.summaryTableData.length;
    }

    get cityRowCount() {
        return this.cityTableData.length;
    }

    get activeProviderNames() {
        if (this.selectedMapProviders.length) {
            return this.selectedMapProviders;
        }

        return this.selectedProvider === 'ALL'
            ? []
            : [this.selectedProvider];
    }

    get hasActiveProviderSelection() {
        return this.activeProviderNames.length > 0;
    }

    get selectedProviderBadges() {
        return this.activeProviderNames.map(provider => {
            const color = this.providerColors[provider] || DEFAULT_PROVIDER_COLOR;

            return {
                name: provider,
                style: `color: ${color}; border-color: ${color};`
            };
        });
    }

    get providerSelectionLabel() {
        return this.hasActiveProviderSelection
            ? this.activeProviderNames.join(', ')
            : 'Todos los proveedores';
    }

    get summaryContextLabel() {
        return `${this.providerSelectionLabel} · ${this.currentPriceUnitLabel} · Vista ${this.consumptionPeriodLabel}`;
    }

    matchesActiveProvider(record) {
        if (!this.hasActiveProviderSelection) {
            return true;
        }

        return this.activeProviderNames.includes(
            normalizeProvider(record?.Proveedor__c)
        );
    }

    get providerOptions() {
        const providers = [
            ...new Set(
                (this.prices || [])
                    .filter(
                        price =>
                            price.Nombre_producto__c ===
                                this.selectedProduct &&
                            this.matchesPeriod(price)
                    )
                    .map(
                        price =>
                            normalizeProvider(price.Proveedor__c)
                    )
                    .filter(Boolean)
            )
        ].sort((a, b) =>
            a.localeCompare(b, 'es', {
                sensitivity: 'base'
            })
        );

        return [
            {
                label: this.selectedMapProviders.length
                    ? `${this.selectedMapProviders.length} proveedor(es) seleccionados en el mapa`
                    : 'Todos los proveedores',
                value: 'ALL'
            },
            ...providers.map(provider => ({
                label: provider,
                value: provider
            }))
        ];
    }

    expandedTable = null;
    expandedColumnWidths = {};
    expandedColumnDrag = null;
    expandedTableTrigger;

    get isTableExpanded() {
        return this.expandedTable !== null;
    }

    get isStateTableExpanded() {
        return this.expandedTable === 'state';
    }

    get expandedTableTitle() {
        return this.isStateTableExpanded ? 'Resumen estatal' : 'Desglose por ciudad';
    }

    get expandedTableContext() {
        const count = this.isStateTableExpanded ? this.summaryTableData.length : this.cityTableData.length;
        return `${this.selectedProduct} · ${count} ${this.isStateTableExpanded ? 'estados' : 'registros'} · Vista ${this.consumptionPeriodLabel} · ${this.currentPriceUnitLabel}`;
    }

    get expandedTableColumns() {
        const columns = this.isStateTableExpanded ? this.summaryTableColumns : this.cityTableColumns;
        const widths = this.expandedColumnWidths[this.expandedTable] || {};
        return columns.map(column => {
            const width = widths[column.fieldName] || column.initialWidth || 150;
            return { ...column, width, style: `width: ${width}px;`, resizeLabel: `Cambiar ancho de ${column.label}` };
        });
    }

    get expandedTableStyle() {
        const width = this.expandedTableColumns.reduce((total, column) => total + column.width, 0);
        return `width: ${width}px; min-width: 100%;`;
    }

    get expandedTableRows() {
        const rows = this.isStateTableExpanded ? this.summaryTableData : this.cityTableData;
        return rows.map(row => ({
            id: row.id,
            cells: this.expandedTableColumns.map(column => ({
                key: column.fieldName,
                text: this.formatExpandedCell(row[column.fieldName], column),
                className: column.type === 'currency' || column.type === 'number'
                    || column.cellAttributes?.alignment === 'right' ? 'expanded-cell expanded-cell-number' : 'expanded-cell'
            }))
        }));
    }

    get expandedTableEmpty() {
        return (this.isStateTableExpanded ? this.summaryTableData : this.cityTableData).length === 0;
    }

    get expandedColumnCount() {
        return this.expandedTableColumns.length;
    }

    formatExpandedCell(value, column) {
        if (value === null || value === undefined || value === '') return '';
        if (column.type === 'currency' || column.type === 'number') {
            const attributes = column.typeAttributes || {};
            const options = {
                minimumFractionDigits: attributes.minimumFractionDigits ?? 0,
                maximumFractionDigits: attributes.maximumFractionDigits ?? 2
            };
            if (column.type === 'currency') {
                Object.assign(options, { style: 'currency', currency: attributes.currencyCode || 'USD', currencyDisplay: 'code' });
            }
            return new Intl.NumberFormat('en-US', options).format(Number(value));
        }
        if (column.type === 'date-local') {
            const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
            return Number.isNaN(date.getTime()) ? String(value)
                : new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(date);
        }
        return String(value);
    }

    setExpandedColumnWidth(field, width) {
        if (!this.expandedTableColumns.some(column => column.fieldName === field)) return;
        this.expandedColumnWidths = {
            ...this.expandedColumnWidths,
            [this.expandedTable]: {
                ...this.expandedColumnWidths[this.expandedTable],
                [field]: Math.max(90, Math.min(1000, Math.round(width)))
            }
        };
    }

    readExpandedColumnWidths() {
        const columns = this.expandedTableColumns;
        const headers = [...this.template.querySelectorAll('.expanded-native-table th')];
        // Si la tabla se ha estirado al ancho del modal, partir del ancho REAL
        // evita saltos y permite crecer sin encoger las columnas vecinas.
        const widths = Object.fromEntries(columns.map((column, index) => [
            column.fieldName, Math.round(headers[index]?.getBoundingClientRect().width || column.width)
        ]));
        this.expandedColumnWidths = { ...this.expandedColumnWidths, [this.expandedTable]: widths };
        return widths;
    }

    handleExpandedResizeStart(event) {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        const field = event.currentTarget.dataset.field;
        const column = this.expandedTableColumns.find(item => item.fieldName === field);
        if (!column) return;
        const widths = this.readExpandedColumnWidths();
        this.expandedColumnDrag = { field, startX: event.clientX, width: widths[field], pointerId: event.pointerId };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    }

    handleExpandedResizeMove(event) {
        const drag = this.expandedColumnDrag;
        if (!drag || event.pointerId !== drag.pointerId) return;
        event.preventDefault();
        this.setExpandedColumnWidth(drag.field, drag.width + event.clientX - drag.startX);
    }

    handleExpandedResizeEnd(event) {
        const drag = this.expandedColumnDrag;
        if (!drag || event.pointerId !== drag.pointerId) return;
        this.expandedColumnDrag = null;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }

    handleExpandedResizeKey(event) {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const field = event.currentTarget.dataset.field;
        const widths = this.readExpandedColumnWidths();
        const step = event.shiftKey ? 50 : 20;
        const width = event.key === 'Home' ? 90 : event.key === 'End' ? 1000
            : widths[field] + (event.key === 'ArrowRight' ? step : -step);
        this.setExpandedColumnWidth(field, width);
    }

    resetExpandedColumnWidths() {
        this.expandedColumnWidths = { ...this.expandedColumnWidths, [this.expandedTable]: {} };
    }

    handleExpandedKeyDown(event) {
        if (event.key === 'Escape') {
            event.preventDefault();
            this.closeExpandedTable();
        } else if (event.key === 'Tab') {
            const controls = [...this.template.querySelector('.table-expanded').querySelectorAll('button, [tabindex="0"]')];
            const index = controls.indexOf(event.target);
            if (event.shiftKey && index === 0) {
                event.preventDefault();
                controls[controls.length - 1].focus();
            } else if (!event.shiftKey && index === controls.length - 1) {
                event.preventDefault();
                controls[0].focus();
            }
        }
    }

    selectedYear = String(new Date().getFullYear());

    trendChart;

    sheetJsLoaded = false;
    isDownloading = false;

    selectedStateRowIds = [];
    selectedStates = [];

    get yearOptions() {
        const years = [
            ...new Set(
                this.prices.filter(record => record.Nombre_producto__c === this.selectedProduct && this.matchesActiveProvider(record))
                    .flatMap(getRecordYears)
                    .filter(Number.isInteger)
            )
        ].sort((first, second) => second - first);

        return years.map(year => ({
            label: String(year),
            value: String(year)
        }));
    }

    syncSelectedYear() {
        const availableYears = this.yearOptions.map(option => option.value);

        if (
            availableYears.length &&
            !availableYears.includes(this.selectedYear)
        ) {
            [this.selectedYear] = availableYears;
        }
    }


    get cityTableColumns() {
        return this.getCityTableColumns(this.selectedConsumptionType);
    }

    getCityTableColumns() {
        const productDetailColumns = [];
        if (this.hasSubproduct) productDetailColumns.push({
                label: 'Subproducto', fieldName: 'subproduct', type: 'text', wrapText: true, initialWidth: 165
            });
        if (this.hasShipmentColumn) productDetailColumns.push({
                label: 'Tamaño de embarque',
                fieldName: 'shipmentSize',
                type: 'text',
                wrapText: true,
                initialWidth: 165
            });

        return [
            { label: 'Producto', fieldName: 'product', type: 'text', wrapText: true, initialWidth: 170 },
            ...productDetailColumns,
            {
                label: 'Estado',
                fieldName: 'state',
                type: 'text',
                initialWidth: 115
            },
            {
                label: 'Ciudad',
                fieldName: 'city',
                type: 'text',
                initialWidth: 115
            },
            {
                label: 'Cliente',
                fieldName: 'client',
                type: 'text',
                wrapText: true,
                initialWidth: 180
            },
            {
                label: 'Proveedor',
                fieldName: 'provider',
                type: 'text',
                initialWidth: 130
            },
            {
                label: 'Consumo anual (Ton)',
                fieldName: 'consumption',
                type: 'number',
                typeAttributes: {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2
                },
                initialWidth: 155
            },
            {
                label: 'Precio (USD/Ton)',
                fieldName: 'price',
                type: 'currency',
                typeAttributes: {
                    currencyCode: this.selectedCurrency,
                    currencyDisplayAs: 'code',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                },
                initialWidth: 220
            },
            {
                label: 'Precio registrado', fieldName: 'registeredPrice', type: 'text', initialWidth: 160,
                cellAttributes: { alignment: 'right' }
            },
            {
                label: 'Unidad original',
                fieldName: 'unit',
                type: 'text',
                initialWidth: 135
            },
            { label: 'Periodo', fieldName: 'period', initialWidth: 125 },
            { label: 'Origen del producto', fieldName: 'productOrigin', initialWidth: 155 },
            { label: 'Tipo de operación comercial', fieldName: 'operationType', wrapText: true, initialWidth: 190 },
            { label: 'Contrato: De', fieldName: 'contractStartDate', type: 'date-local', initialWidth: 150 },
            { label: 'Contrato: A', fieldName: 'contractEndDate', type: 'date-local', initialWidth: 150 }
        ];
    }

    get summaryTableColumns() {
        return this.getSummaryTableColumns(this.selectedConsumptionType);
    }

    getSummaryTableColumns() {
        return [
            {
                label: 'Estado',
                fieldName: 'state',
                type: 'text',
                initialWidth: 120
            },
            {
                label: 'Consumo anual (Ton)',
                fieldName: 'consumption',
                type: 'number',
                typeAttributes: {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2
                },
                initialWidth: 170
            },
            {
                label: `Precio competidores (${this.currentPriceUnitLabel})`,
                fieldName: 'averagePrice',
                type: 'currency',
                typeAttributes: {
                    currencyCode: this.selectedCurrency,
                    currencyDisplayAs: 'code',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                },
                initialWidth: 210
            },
            {
                label: `Precio ALMEX (${this.currentPriceUnitLabel})`,
                fieldName: 'Nuestro_precio',
                type: 'currency',
                typeAttributes: {
                    currencyCode: this.selectedCurrency,
                    currencyDisplayAs: 'code',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                },
                initialWidth: 190
            },
            {
                label: 'Estatus',
                fieldName: 'status',
                type: 'text',
                initialWidth: 100
            },
            {
                label: 'Proveedor líder',
                fieldName: 'provider',
                type: 'text',
                initialWidth: 150
            },
            {
                label: 'Periodo',
                fieldName: 'period',
                type: 'text',
                initialWidth: 150
            },
            { label: 'Origen del producto', fieldName: 'productOrigin', type: 'text', wrapText: true, initialWidth: 180 }
        ];
    }


    // ==============================
    // ESTADOS DE MÉXICO
    // ==============================

    mexicanStates = [
        'Aguascalientes',
        'Baja California',
        'Baja California Sur',
        'Campeche',
        'Chiapas',
        'Chihuahua',
        'Coahuila',
        'Colima',
        'Ciudad de México',
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

    // ==============================
    // COLOR POR PROVEEDOR
    // ==============================

    providerColors = PROVIDER_COLORS;


    // ==============================
    // CARGAR DATOS
    // ==============================

    connectedCallback() {
        this.loadPrices();
    }


    async loadPrices() {
        this.dataLoadError = '';
        this.exchangeRateError = '';
        const [priceResult, rateResult] = await Promise.allSettled([getPrices(), getExchangeRate()]);
        if (rateResult.status === 'fulfilled' && Number(rateResult.value?.mxnPerUsd) > 0) {
            this.exchangeRate = rateResult.value;
        } else {
            this.exchangeRate = null;
            this.exchangeRateError = 'No se pudo consultar Banxico. Los precios MXN quedan sin conversión y no participan en los promedios; los precios USD siguen disponibles.';
        }
        try {
                if (priceResult.status === 'rejected') throw priceResult.reason;
                const result = priceResult.value;
                const records = Array.isArray(result) ? result : [];

                this.prices = records.map(record => ({
                    ...record,
                    Estado__c: normalizeStateName(record.Estado__c),
                    Nombre_producto__c: normalizeProductName(
                        record.Nombre_producto__c
                    ),
                    Proveedor__c: normalizeProvider(
                        record.Proveedor__c
                    )
                }));

                this.syncSelectedYear();
                this.updateCards();
                this.updateSummaryTable();
                this.updateCityTable();
                this.renderMap();
                this.renderTrendChart();
        } catch (error) {
                console.error('Error obteniendo Registros:', error);
                this.prices = [];
                this.dataLoadError =
                    error?.body?.message ||
                    error?.message ||
                    'Salesforce no devolvió el detalle del error.';
        }
    }


    // ==============================
    // CARGAR HIGHMAPS
    // ==============================

    renderedCallback() {
        for (const [name, value] of [['periodFilterYear', this.selectedPeriodYear], ['providerFilter', this.selectedProvider]]) {
            const periodSelect = this.template.querySelector(`select[name="${name}"]`);
            if (periodSelect && periodSelect.value !== value) periodSelect.value = value;
        }
        const historyProviderSelect = this.template.querySelector('select[name="historyProvider"]');
        if (historyProviderSelect && historyProviderSelect.value !== this.historyProvider) {
            historyProviderSelect.value = this.historyProvider;
        }
        const productSelect = this.template.querySelector('.product-select');
        if (productSelect && productSelect.value !== this.selectedProduct) {
            productSelect.value = this.selectedProduct;
        }
        if (this.highmapsInitialized) {
            return;
        }

        this.highmapsInitialized = true;

        loadScript(this, HIGHMAPS + '/highmaps/highmaps.js')
            .then(() =>
                Promise.all([
                    this.loadMapResource(MEXICO_STATES_MAP),
                    this.loadMapResource(
                        HIGHMAPS + '/highmaps/custom/world.topo.json'
                    )
                ])
            )
            .then(([mapData, worldMapData]) => {
                this.mapData = mapData;
                this.worldMapData = worldMapData;

                this.renderMap();
            })
            .catch(error => {
                console.error('Error cargando Highmaps:', error);
            });
    }

    loadMapResource(resourceUrl) {
        return fetch(resourceUrl).then(response => {
            if (!response.ok) {
                throw new Error(
                    `Error cargando mapa: ${response.status}`
                );
            }

            return response.json();
        });
    }

    initializeMap(mapData) {
        const container = this.template.querySelector(
            '.map-container'
        );

        if (!container || !window.Highcharts) {
            return;
        }

        const result = this.prices.filter(
            price =>
                price.Nombre_producto__c === this.selectedProduct &&
                this.matchesPeriod(price)
        );

        const currencyPrefix = this.isUsdSelected ? 'US$' : '$';
        const priceUnitLabel = this.currentPriceUnitLabel;
        const consumptionPeriodLabel = this.consumptionPeriodLabel;

        const activeProviders = this.activeProviderNames;
        const hasProviderSelection = activeProviders.length > 0;
        const allLeadingProviders = this.getLeadingProviders(result);
        const filteredMapRecords = hasProviderSelection
            ? result.filter(price => this.matchesActiveProvider(price))
            : result;
        const leadingProviders = this.getLeadingProviders(filteredMapRecords);
        const providerStateCounts =
            this.getProviderStateCounts(leadingProviders);
        const allProviderStateCounts =
            this.getProviderStateCounts(allLeadingProviders);
        const legendProviders = [
            ...new Set(
                Object.values(allLeadingProviders)
                    .map(stateData => stateData?.provider)
                    .filter(Boolean)
                    .concat(activeProviders)
            )
        ];

        // ==========================================
        // SERIE BASE: ESTADOS SIN DATOS
        // ==========================================

        const mapFeatures =
            mapData.features ||
            mapData.objects?.default?.geometries ||
            [];

        const baseSeriesData = mapFeatures.map(feature => {
            return {
                'hc-key': feature.properties['hc-key'],
                value: 0
            };
        });

        // ==========================================
        // AGRUPAR ESTADOS POR PROVEEDOR
        // ==========================================

        const statesByProvider = {};

        Object.entries(leadingProviders).forEach(
            ([stateName, stateData]) => {

                const provider = stateData.provider;

                if (!statesByProvider[provider]) {
                    statesByProvider[provider] = [];
                }

                const feature = mapFeatures.find(
                    candidate =>
                        candidate.properties.name ===
                            getHighmapsStateName(stateName)
                );

                if (!feature) {
                    return;
                }

                statesByProvider[provider].push({
                    'hc-key': feature.properties['hc-key'],
                    value: 1,
                    custom: {
                        state: stateName,
                        provider: stateData.provider,
                        consumption: stateData.totalConsumption,
                        averagePrice: stateData.averagePrice,
                        almexPrice: stateData.almexPrice
                    }
                });
            }
        );

        // ==========================================
        // SERIES DEL MAPA POR PROVEEDOR
        // ==========================================

        const providerSeries = legendProviders.map(provider => {

            const stateData = statesByProvider[provider] || [];

            const stateCount =
                hasProviderSelection && activeProviders.includes(provider)
                    ? providerStateCounts[provider] || 0
                    : allProviderStateCounts[provider] || 0;

            return {
                type: 'map',

                name: `${provider} (${stateCount})`,

                color:
                    this.providerColors[provider] ||
                    DEFAULT_PROVIDER_COLOR,

                showInLegend: true,

                visible:
                    !hasProviderSelection ||
                    activeProviders.includes(provider),

                mapData: mapData,

                data: stateData,

                // Cada proveedor debe renderizar unicamente sus estados.
                // Si Highmaps crea las demas areas como puntos transparentes,
                // esas areas quedan encima e interceptan el hover.
                allAreas: false,

                nullColor: 'transparent',

                cursor: 'pointer',

                point: {
                    events: {
                        click: event => {
                            event?.originalEvent?.preventDefault?.();
                            event?.originalEvent?.stopPropagation?.();
                            this.handleMapProviderLegendClick(provider);
                        }
                    }
                },

                events: {
                    legendItemClick: event => {
                        event?.browserEvent?.preventDefault?.();
                        event?.browserEvent?.stopPropagation?.();
                        this.handleMapProviderLegendClick(provider);
                        return false;
                    }
                },

                tooltip: {
                    pointFormatter: function () {
                        const state =
                            this.custom?.state || '-';

                        const pointProvider =
                            this.custom?.provider || '-';

                        const consumption =
                            Number(this.custom?.consumption) || 0;

                        const averagePrice =
                            this.custom?.averagePrice;

                        const almexPrice =
                            this.custom?.almexPrice;

                        const averagePriceText =
                            Number.isFinite(averagePrice)
                                ? `${currencyPrefix}${averagePrice.toFixed(2)} ${priceUnitLabel}`
                                : 'Sin datos';

                        const almexPriceText =
                            Number.isFinite(almexPrice)
                                ? `${currencyPrefix}${almexPrice.toFixed(2)} ${priceUnitLabel}`
                                : 'Sin datos';

                        return `
                            <b>${state}</b><br>
                            <b>Proveedor líder:</b> ${pointProvider}<br>
                            <b>Consumo ${consumptionPeriodLabel}:</b>
                            ${consumption.toLocaleString('es-MX')} Ton<br>
                            <b>Precio promedio ${consumptionPeriodLabel} del estado:</b>
                            ${averagePriceText}<br>
                            <b>Precio ALMEX:</b>
                            ${almexPriceText}
                        `;
                    }
                }
            };
        });

        // ==========================================
        // MAPA
        // ==========================================

        window.Highcharts.mapChart(container, {

            chart: {
                map: mapData,
                backgroundColor: '#dce9f0',
                spacing: [12, 12, 12, 12],
                style: {
                    fontFamily: 'Arial, sans-serif'
                }
            },

            mapView: {
                projection: {
                    name: 'WebMercator'
                },
                fitToGeometry: {
                    type: 'Polygon',
                    coordinates: [[
                        [-119.5, 13.5],
                        [-85, 13.5],
                        [-85, 34],
                        [-119.5, 34],
                        [-119.5, 13.5]
                    ]]
                },
                padding: '2%'
            },

            title: {
                text: null
            },

            credits: {
                enabled: false
            },

            mapNavigation: {
                enabled: true,
                enableButtons: false,
                enableDoubleClickZoom: false,
                enableDoubleClickZoomTo: false,
                enableMouseWheelZoom: true,
                enableTouchZoom: false,
                buttonOptions: {
                    align: 'left',
                    verticalAlign: 'bottom',
                    theme: {
                        fill: '#ffffff',
                        stroke: '#cbd5e1',
                        r: 6,
                        states: {
                            hover: {
                                fill: '#eff6ff'
                            },
                            select: {
                                fill: '#dbeafe'
                            }
                        }
                    }
                }
            },

            legend: {
                enabled: true,
                align: 'center',
                verticalAlign: 'bottom',
                layout: 'horizontal',
                floating: true,
                y: -8,
                padding: 9,
                itemDistance: 16,
                backgroundColor: 'rgba(255,255,255,0.92)',
                borderColor: '#cbd8e3',
                borderWidth: 1,
                borderRadius: 8,
                shadow: true,
                itemStyle: {
                    color: '#24364b',
                    fontSize: '11px',
                    fontWeight: '600'
                }
            },

            tooltip: {
                useHTML: true,
                backgroundColor: 'rgba(255,255,255,0.97)',
                borderColor: '#b8c8d8',
                borderRadius: 10,
                padding: 12,
                shadow: true,
                style: {
                    color: '#1f3147',
                    fontSize: '12px',
                    lineHeight: '18px'
                }
            },

            plotOptions: {
                series: {
                    borderColor: '#ffffff',
                    borderWidth: 0.8,
                    states: {
                        inactive: {
                            enabled: false
                        },
                        hover: {
                            brightness: 0.12,
                            borderColor: '#102a43',
                            borderWidth: 2
                        }
                    }
                }
            },


            series: [
                {
                    type: 'map',
                    name: 'Contexto geográfico',
                    mapData: this.worldMapData,
                    data: [],
                    affectsMapView: false,
                    allAreas: true,
                    nullColor: 'rgba(248, 250, 252, 0.94)',
                    borderColor: 'rgba(154, 174, 191, 0.82)',
                    borderWidth: 0.7,
                    showInLegend: false,
                    enableMouseTracking: false,
                    zIndex: 0
                },
                {
                    type: 'map',

                    name: 'Sin datos',

                    mapData: mapData,

                    data: baseSeriesData,

                    color: '#d7e0e9',

                    borderColor: '#ffffff',

                    borderWidth: 0.9,

                    showInLegend: false,

                    enableMouseTracking: false,

                    zIndex: 1
                },

                ...providerSeries.map(series => ({
                    ...series,
                    zIndex: 2
                }))
            ]
        });
    }
    // ==============================
    // ACTUALIZAR TODOS LOS CARDS
    // ==============================

    updateCards() {

        this.calculateMonitoredProducts();

        this.calculateAnalyzedStates();

        this.calculateAveragePrice();

        this.calculateOutOfRangeStates();
    }


    // ==============================
    // CARD 1
    // PRODUCTOS MONITOREADOS
    // ==============================

    calculateMonitoredProducts() {

        const products = new Set(
            this.prices
                .filter(price => this.matchesPeriod(price) && this.matchesActiveProvider(price))
                .map(price => price.Nombre_producto__c)
                .filter(product => product)
        );

        this.monitoredProducts = products.size;
    }


    // ==============================
    // CARD 2
    // ESTADOS ANALIZADOS
    // ==============================

    calculateAnalyzedStates() {

        const filteredPrices = this.getSelectedProductRecords();

        const states = new Set(
            filteredPrices
                .map(price => normalizeStateName(price.Estado__c))
                .filter(state => state)
        );

        this.analyzedStates = states.size;
    }


    // ==============================
    // CARD 3
    // PRECIO PROMEDIO
    // ==============================

    calculateAveragePrice() {
        const filteredPrices = this.getSelectedProductRecords();

        const records = filteredPrices
            .map(record => normalizePeriodPrice(record, this.fxRate, this.selectedConsumptionType))
            .filter(record => record !== null);

        if (records.length === 0) {
            this.averagePrice = null;
            return;
        }

        const totalPrice = records.reduce(
            (sum, pricePerTon) => sum + pricePerTon,
            0
        );

        this.averagePrice = (totalPrice / records.length).toFixed(2);
    }


    // ==============================
    // CARD 4
    // ESTADOS FUERA DE RANGO
    // ==============================

    calculateOutOfRangeStates() {

        const filteredPrices = this.getSelectedProductRecords();

        const statesWithRecords = new Set(
            filteredPrices
                .map(price => normalizeStateName(price.Estado__c))
                .filter(state => state)
        );

        this.outOfRangeStates = this.mexicanStates.filter(
            state => !statesWithRecords.has(normalizeStateName(state))
        ).length;
    }


    // ==============================
    // FILTRAR POR PRODUCTO
    // ==============================

    getSelectedProductRecords() {
        return this.prices.filter(
            price =>
                price.Nombre_producto__c === this.selectedProduct &&
                this.matchesPeriod(price) &&
                this.matchesActiveProvider(price)
        );
    }


    // ==============================
    // CAMBIO DE PRODUCTO
    // ==============================

    handleProductChange(event) {
        this.historyProvider = 'ALL';
        this.selectedProvider = 'ALL';
        this.selectedMapProviders = [];
        this.selectedStateRowIds = [];
        this.selectedStates = [];
        this.selectedProduct = event.target.value;

        this.syncSelectedYear();
        this.updateCards();
        this.updateSummaryTable();
        this.updateCityTable();
        this.renderMap();
        this.renderTrendChart();
    }

     // ==============================
    // OBTENER PROVEEDORES LIDERES
    // ==============================

    getLeadingProviders(result, consumptionType = this.selectedConsumptionType) {
        const totalsByState = {};

        result.forEach(price => {
            const rawState = price.Estado__c;
            const state = normalizeStateName(rawState);
            const provider = price.Proveedor__c;
            const consumption =
                normalizeConsumption(price, consumptionType);

            if (!state || !provider) {
                return;
            }

            if (!totalsByState[state]) {
                totalsByState[state] = {
                    providers: {},
                    prices: [],
                    almexPrices: [],
                    totalConsumption: 0
                };
            }

            if (!totalsByState[state].providers[provider]) {
                totalsByState[state].providers[provider] = 0;
            }

            // Consumo de cada proveedor en el estado
            totalsByState[state].providers[provider] +=
                consumption;

            // Consumo total de todo el estado
            totalsByState[state].totalConsumption +=
                consumption;

            // ==============================
            // CONVERSIÓN DE PRECIO A USD/TON
            // ==============================

            const normalizedPrice = normalizePeriodPrice(price, this.fxRate, consumptionType);

            if (normalizedPrice !== null) {
                totalsByState[state].prices.push(
                    normalizedPrice
                );

                if (provider === 'ALMEX') {
                    totalsByState[state].almexPrices.push(
                        normalizedPrice
                    );
                }
            }
        });

        const leadingProviders = {};

        Object.keys(totalsByState).forEach(state => {
            const stateData = totalsByState[state];
            const providers = stateData.providers;

            const winner = Object.entries(providers)
                .sort((a, b) => b[1] - a[1])[0];

            if (winner) {
                const prices = stateData.prices;

                const averagePrice = prices.length
                    ? prices.reduce(
                        (sum, price) => sum + price,
                        0
                    ) / prices.length
                    : null;

                const almexPrice =
                    stateData.almexPrices.length
                        ? stateData.almexPrices.reduce(
                            (sum, price) => sum + price,
                            0
                        ) / stateData.almexPrices.length
                        : null;

                leadingProviders[state] = {
                    provider: winner[0],

                    // Consumo del proveedor líder
                    consumption: winner[1],

                    // Consumo total del estado
                    totalConsumption:
                        stateData.totalConsumption,

                    averagePrice: averagePrice,

                    almexPrice: almexPrice,

                    color:
                        this.providerColors[winner[0]] ||
                        DEFAULT_PROVIDER_COLOR
                };
            }
        });

        return leadingProviders;
    }

    getProviderStateCounts(leadingProviders) {
        const providerCounts = {};

        Object.values(leadingProviders).forEach(stateData => {
            if (!stateData || !stateData.provider) {
                return;
            }

            const provider = stateData.provider;

            if (!providerCounts[provider]) {
                providerCounts[provider] = 0;
            }

            providerCounts[provider]++;
        });

        return providerCounts;
    }

    renderMap() {
        if (!this.mapData) {
            return;
        }

        this.initializeMap(this.mapData);
    }

    handleMapProviderLegendClick(provider) {
        const clickTime = Date.now();

        if (
            this.lastLegendClickProvider === provider &&
            clickTime - this.lastLegendClickTime < 350
        ) {
            return;
        }

        this.lastLegendClickProvider = provider;
        this.lastLegendClickTime = clickTime;
        const selectedProviders = new Set(this.selectedMapProviders);

        if (this.selectedProvider !== 'ALL') {
            selectedProviders.add(this.selectedProvider);
        }

        this.selectedProvider = 'ALL';

        if (selectedProviders.has(provider)) {
            selectedProviders.delete(provider);
        } else {
            selectedProviders.add(provider);
        }

        this.selectedMapProviders = [...selectedProviders];
        this.refreshProviderFilteredViews();
    }

    refreshProviderFilteredViews() {
        const availableProviders = new Set(this.providerOptions.map(option => option.value));
        if (!availableProviders.has(this.selectedProvider)) this.selectedProvider = 'ALL';
        this.selectedMapProviders = this.selectedMapProviders.filter(provider => availableProviders.has(provider));
        if (!this.historyProviderOptions.some(option => option.value === this.historyProvider)) this.historyProvider = 'ALL';
        this.selectedStateRowIds = [];
        this.selectedStates = [];
        this.syncSelectedYear();
        this.updateCards();
        this.updateSummaryTable();
        this.updateCityTable();
        this.renderMap();
        this.renderTrendChart();
    }

    // ==============================
    // ACTUALIZAR TABLA RESUMEN ESTATAL
    // ==============================

    updateSummaryTable() {
        this.summaryTableData = this.buildSummaryTableData(
            this.getSelectedProductRecords(), this.selectedConsumptionType
        );
    }

    buildSummaryTableData(result, consumptionType) {

        const leadingProviders = this.getLeadingProviders(result, consumptionType);
        const stateOrigins = {};
        result.forEach(record => {
            const state = normalizeStateName(record.Estado__c);
            if (!state) return;
            if (!stateOrigins[state]) stateOrigins[state] = new Set();
            stateOrigins[state].add(record.Producto_importado__c ? 'Importado' : 'Nacional');
        });

        const statePrices = {};

        result.forEach(price => {
            const rawState = price.Estado__c;
            const state = normalizeStateName(rawState);

            const provider = price.Proveedor__c;

            const rawPrice =
                Number(price.Precio_producto__c) || 0;

            if (!state || !provider || rawPrice <= 0) {
                return;
            }

            // ==========================================
            // NORMALIZAR A USD/TON, CONSERVANDO EL IMPORTE ORIGINAL
            // ==========================================

            const normalizedPrice = normalizePeriodPrice(price, this.fxRate, consumptionType);

            // ==========================================
            // CREAR ESTRUCTURA DEL ESTADO
            // ==========================================

            if (!statePrices[state]) {
                statePrices[state] = {
                    almex: [],
                    competition: [],
                    latestPeriodKey: null,
                    latestPeriod: '—'
                };
            }

            // ==========================================
            // SEPARAR ALMEX DE COMPETENCIA
            // ==========================================

            if (normalizedPrice !== null && provider === 'ALMEX') {
                statePrices[state].almex.push(
                    normalizedPrice
                );
            } else if (normalizedPrice !== null) {
                statePrices[state].competition.push(
                    normalizedPrice
                );
            }

            // ==========================================
            // PERIODO MÁS RECIENTE DEL ESTADO
            // ==========================================

            const period = getRecordPeriod(price);

            if (period) {
                if (
                    statePrices[state].latestPeriodKey === null ||
                    period.key > statePrices[state].latestPeriodKey
                ) {
                    statePrices[state].latestPeriodKey = period.key;
                    statePrices[state].latestPeriod = period.label;
                }
            }
        });

        // ==========================================
        // ARMAR TABLA
        // ==========================================

        return Object.entries(
            leadingProviders
        ).map(([state, stateData], index) => {
            const prices = statePrices[state] || {
                almex: [],
                competition: [],
                latestPeriodKey: null,
                latestPeriod: '—'
            };

            const almexAverage = prices.almex.length
                ? prices.almex.reduce(
                    (sum, price) => sum + price,
                    0
                ) / prices.almex.length
                : null;
            const competitionAverage =
                prices.competition.length
                    ? prices.competition.reduce(
                        (sum, price) => sum + price,
                        0
                    ) / prices.competition.length
                    : null;

            return {
                id: `${this.selectedProduct}-${this.selectedCurrency}-${consumptionType}-${index}`,

                state: state,

                consumption: stateData.totalConsumption,

                averagePrice: competitionAverage,

                Nuestro_precio: almexAverage,

                status: '—',

                provider: stateData.provider,

                period: prices.latestPeriod,
                productOrigin: stateOrigins[state]?.size === 2
                    ? 'Nacional e importado'
                    : [...(stateOrigins[state] || [])][0] || '—'
            };
        });
    }

    // ==============================
    // ACTUALIZAR TABLA RESUMEN POR CIUDAD
    // ==============================

    updateCityTable() {
        this.allCityTableData = this.buildCityTableData(
            this.getSelectedProductRecords(), this.selectedConsumptionType
        );
        this.cityTableData = [...this.allCityTableData];
    }

    buildCityTableData(result, consumptionType) {
        return result.map((price, index) => {
            const rawState = price.Estado__c;
            const normalizedState = normalizeStateName(rawState);

            return {
                id: `city-${this.selectedProduct}-${this.selectedCurrency}-${consumptionType}-${index}-${price.Id}`,
                state: normalizedState,
                city: price.Ciudad__c || '',
                client: price.Nombre_comercial__c || '',
                product: price.Nombre_producto__c || '',
                subproduct: price.Tipo_subproducto__c || '',
                shipmentSize: price.Tama_o_embarque__c || '—',
                provider: normalizeProvider(price.Proveedor__c),
                consumption: normalizeConsumption(price, consumptionType),
                price: normalizePeriodPrice(price, this.fxRate, consumptionType),
                originalPrice: price.Precio_producto__c ?? null,
                registeredPrice: formatRegisteredPrice(price.Precio_producto__c, price.Unidad__c),
                createdDate: price.CreatedDate || null,
                period: getRecordPeriod(price)?.label || '',
                productOrigin: price.Producto_importado__c ? 'Importado' : 'Nacional',
                operationType: price.Tipo_operacion_comercial__c || '',
                contractStartDate: price.Fecha_inicio_contrato__c || null,
                contractEndDate: price.Fecha_fin_contrato__c || null,
                unit: price.Unidad__c || ''
            };
        });

    }

    // ==============================
    // FILTRAR TABLA POR SELECCIÓN
    // ==============================

    handleStateSelection(event) {
        const selectedRows = event.detail.selectedRows || [];

        this.selectedStateRowIds = selectedRows.map(
            row => row.id
        );

        this.selectedStates = selectedRows.map(
            row => row.state
        );

        // Si no hay estados seleccionados, mostrar todas las ciudades
        if (this.selectedStates.length === 0) {
            this.cityTableData = [...this.allCityTableData];
            return;
        }

        const selectedStateSet = new Set(
            this.selectedStates
        );

        // Mostrar ciudades pertenecientes a cualquiera
        // de los estados seleccionados
        this.cityTableData = this.allCityTableData.filter(
            row => selectedStateSet.has(row.state)
        );
    }

    handleYearChange(event) {
        this.selectedYear = event.detail.value;
        this.selectedPeriodYear = this.selectedYear;
        this.refreshProviderFilteredViews();
    }

    renderTrendChart() {
        const container = this.template.querySelector(
            '.trend-chart'
        );

        if (!container || !window.Highcharts) {
            return;
        }

        const annualPrices = new Map();

        (this.prices || []).forEach(record => {
            const recordYears = getRecordYears(record).filter(year =>
                !this.selectedPeriodYear || year === Number(this.selectedPeriodYear));

            if (
                record.Nombre_producto__c !== this.selectedProduct ||
                !this.matchesPeriod(record) ||
                !this.matchesActiveProvider(record) ||
                !recordYears.length
            ) {
                return;
            }

            const normalizedPrice = normalizePeriodPrice(record, this.fxRate, this.selectedConsumptionType);

            if (normalizedPrice !== null) {
                recordYears.forEach(year => {
                    if (!annualPrices.has(year)) annualPrices.set(year, []);
                    annualPrices.get(year).push(normalizedPrice);
                });
            }
        });

        const years = [...annualPrices.keys()].sort((a, b) => a - b);
        const categories = years.map(String);
        const annualAveragePrices = years.map(year => {
            const prices = annualPrices.get(year);
            if (!prices.length) {
                return null;
            }

            const average =
                prices.reduce((sum, price) => sum + price, 0) /
                prices.length;

            return Number(average.toFixed(2));
        });
        const populatedYears = annualAveragePrices.filter(
            price => price !== null
        ).length;

        if (this.trendChart) {
            this.trendChart.destroy();
            this.trendChart = null;
        }

        const currencyPrefix = this.isUsdSelected ? 'US$' : '$';

        this.trendChart = window.Highcharts.chart(
            container,
            {
                chart: {
                    type: 'areaspline',
                    backgroundColor: 'transparent',
                    spacing: [26, 26, 24, 20],
                    style: {
                        fontFamily: 'Arial, sans-serif'
                    }
                },

                title: {
                    text: 'Tendencia anual de precios',
                    align: 'left',
                    style: {
                        color: '#102a43',
                        fontSize: '18px',
                        fontWeight: '700'
                    }
                },

                subtitle: {
                    text: populatedYears
                        ? `${this.selectedProduct} · ${this.providerSelectionLabel} · ${this.currentPriceUnitLabel} · ${populatedYears} años con información`
                        : `${this.selectedProduct} · ${this.providerSelectionLabel} · Sin registros para el año seleccionado`,
                    align: 'left',
                    style: {
                        color: populatedYears ? '#5c6f84' : '#b54708',
                        fontSize: '12px'
                    }
                },

                credits: {
                    enabled: false
                },

                legend: {
                    enabled: false
                },

                xAxis: {
                    categories: categories,
                    lineColor: '#b9c8d8',
                    tickColor: '#b9c8d8',
                    tickLength: 5,
                    crosshair: {
                        color: '#9bb7cf',
                        dashStyle: 'ShortDot'
                    },
                    labels: {
                        style: {
                            color: '#4d6075',
                            fontSize: '12px',
                            fontWeight: '600'
                        }
                    },
                    title: {
                        text: 'Periodo',
                        style: {
                            color: '#526176',
                            fontSize: '11px',
                            fontWeight: '600'
                        }
                    }
                },

                yAxis: {
                    gridLineColor: '#e2eaf2',
                    gridLineDashStyle: 'ShortDash',
                    lineWidth: 0,
                    title: {
                        text: `Precio (${this.currentPriceUnitLabel})`,
                        style: {
                            color: '#526176',
                            fontSize: '11px',
                            fontWeight: '600'
                        }
                    },

                    labels: {
                        formatter: function () {
                            return `${currencyPrefix}${this.value.toFixed(2)}`;
                        },
                        style: {
                            color: '#64748b',
                            fontSize: '11px'
                        }
                    }
                },

                tooltip: {
                    shared: true,
                    backgroundColor: 'rgba(255,255,255,0.97)',
                    borderColor: '#b8c8d8',
                    borderRadius: 10,
                    shadow: {
                        color: 'rgba(15, 42, 67, 0.18)',
                        offsetX: 0,
                        offsetY: 4,
                        opacity: 0.18,
                        width: 8
                    },
                    headerFormat: '<b>Periodo {point.key}</b><br/>',
                    valueDecimals: 2,
                    valuePrefix: currencyPrefix,
                    valueSuffix: ` ${this.currentPriceUnitLabel}`
                },

                plotOptions: {
                    series: {
                        connectNulls: false,
                        marker: {
                            enabled: true,
                            radius: 4,
                            lineWidth: 2,
                            lineColor: '#ffffff',
                            fillColor: '#1769aa',
                            states: {
                                hover: {
                                    radius: 6
                                }
                            }
                        },
                        lineWidth: 3,
                        states: {
                            hover: {
                                lineWidthPlus: 1
                            }
                        }
                    }
                },

                series: [
                    {
                        name: this.averagePriceTitle,
                        data: annualAveragePrices,
                        color: '#1769aa',
                        threshold: null,
                        fillColor: {
                            linearGradient: {
                                x1: 0,
                                y1: 0,
                                x2: 0,
                                y2: 1
                            },
                            stops: [
                                [0, 'rgba(23,105,170,0.30)'],
                                [1, 'rgba(23,105,170,0.02)']
                            ]
                        }
                    }
                ]
            }
        );
    }

    handleChartsTabActive() {
        // Espera a que Salesforce monte el contenido de la pestaña de gráficas.
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        setTimeout(() => {

            const yearSelect = this.template.querySelector(
                '#year'
            );

            if (yearSelect) {
                yearSelect.value = this.selectedYear;
            }

            this.renderTrendChart();

        }, 100);
    }

    handleStateTableDoubleClick(event) {
        this.expandedTableTrigger = event.currentTarget;
        this.expandedTable = 'state';
        this.focusExpandedTable();
    }

    handleCityTableDoubleClick(event) {
        this.expandedTableTrigger = event.currentTarget;
        this.expandedTable = 'city';
        this.focusExpandedTable();
    }

    focusExpandedTable() {
        Promise.resolve().then(() => this.template.querySelector('.close-expanded-table')?.focus());
    }

    handleProviderChange(event) {
        this.selectedProvider = event.detail?.value ?? event.target.value;
        this.selectedMapProviders = [];
        this.refreshProviderFilteredViews();
    }

    clearProviderFilter() {
        this.selectedProvider = 'ALL';
        this.selectedMapProviders = [];
        this.refreshProviderFilteredViews();
    }

    closeExpandedTable() {
        this.expandedColumnDrag = null;
        this.expandedTable = null;
        this.expandedTableTrigger?.focus();
    }

    getExcelTableData(data, columns) {
        const exportColumns = columns.filter(
            column =>
                column.label &&
                column.fieldName &&
                column.type !== 'action'
        );

        return [
            exportColumns.map(column => column.label),

            ...data.map(row =>
                exportColumns.map(column => {
                    const value = row[column.fieldName];
                    if (column.type === 'datetime') return toExcelRegistrationDate(value);

                    return value === null || value === undefined
                        ? ''
                        : value;
                })
            )
        ];
    }

    getExcelContextRows(sectionTitle) {
        return [
            [sectionTitle],
            ['Producto', this.selectedProduct],
            ['Proveedor(es)', this.providerSelectionLabel],
            ['Estados', this.selectedStates.length ? this.selectedStates.join(', ') : 'Todos los estados'],
            ['Moneda', this.selectedCurrency],
            ['Vista de precios y consumo', 'Anual'],
            ['Unidad normalizada', this.currentPriceUnitLabel],
            ['Zona horaria de fecha de registro', USER_TIME_ZONE],
            ['Periodo seleccionado', this.periodFilterLabel],
            ['Fuente de conversión', this.exchangeRateLabel],
            ['Regla de precios', 'Mensual × 12; anual sin cambios; después se promedia.'],
            ['Observaciones', this.exchangeRateError || 'Precios y consumos homologados al periodo de esta hoja; importes registrados originales conservados.'],
            []
        ];
    }

    async handleDownloadExcel() {
        if (this.isDownloading) {
            return;
        }

        this.isDownloading = true;

        try {
            if (!this.sheetJsLoaded) {
                await loadScript(this, sheetjs);
                this.sheetJsLoaded = true;
            }

            const XLSXLibrary = globalThis.XLSX;

            if (!XLSXLibrary) {
                throw new Error('SheetJS no pudo cargarse.');
            }

            const workbook = XLSXLibrary.utils.book_new();

            const selectedStateSet = new Set(this.selectedStates);
            for (const consumptionType of ['A']) {
                const sheetName = 'Resumen por consumo anual';
                const records = this.getSelectedProductRecords().filter(
                    record => !selectedStateSet.size
                        || selectedStateSet.has(normalizeStateName(record.Estado__c))
                );
                const stateRows = this.buildSummaryTableData(records, consumptionType);
                const cityRows = this.buildCityTableData(records, consumptionType);
                const stateColumns = this.getSummaryTableColumns(consumptionType);
                const cityColumns = [
                    ...this.getCityTableColumns(consumptionType),
                    { label: 'Fecha de registro', fieldName: 'createdDate', type: 'datetime' }
                ];
                const contextRows = this.getExcelContextRows(sheetName, consumptionType);
                const stateTable = this.getExcelTableData(stateRows, stateColumns);
                const cityTitleRow = contextRows.length + 1 + stateTable.length + 2;
                const excelData = [
                    ...contextRows,
                    ['Resumen estatal'],
                    ...stateTable,
                    [],
                    [],
                    ['Desglose por ciudad'],
                    ...this.getExcelTableData(cityRows, cityColumns)
                ];
                const worksheet = XLSXLibrary.utils.aoa_to_sheet(excelData);
                const columnCount = Math.max(stateColumns.length, cityColumns.length);
                worksheet['!cols'] = Array.from({ length: columnCount }, (_, columnIndex) => ({
                    wch: cityColumns[columnIndex]?.type === 'datetime' ? 23 : Math.min(45, excelData.reduce(
                        (width, row) => Math.max(width, String(row[columnIndex] ?? '').length + 2), 18
                    ))
                }));
                worksheet['!merges'] = [0, contextRows.length, cityTitleRow].map(row => ({
                    s: { r: row, c: 0 }, e: { r: row, c: columnCount - 1 }
                }));
                XLSXLibrary.utils.book_append_sheet(workbook, worksheet, sheetName);
            }

            const productName = (
                this.selectedProduct || 'Productos'
            ).replace(/[\\/:*?"<>|]/g, '_');
            const providerName = this.providerSelectionLabel
                .replace(/[\\/:*?"<>|]/g, '_')
                .replace(/\s*,\s*/g, '_');

            XLSXLibrary.writeFile(
                workbook,
                `Mapeo_de_mercado_${productName}_${providerName}_${this.selectedCurrency}.xlsx`
            );

        } catch (error) {
            console.error('Error descargando Excel:', error);
        } finally {
            this.isDownloading = false;
        }
    }


}
