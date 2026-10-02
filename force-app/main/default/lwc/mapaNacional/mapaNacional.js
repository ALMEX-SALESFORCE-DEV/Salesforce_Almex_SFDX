import { LightningElement } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import HIGHMAPS from '@salesforce/resourceUrl/Highmaps';
import MEXICO_STATES_MAP from '@salesforce/resourceUrl/MexicoStatesMap';
import sheetjs from '@salesforce/resourceUrl/sheetjs';
import getPrices from '@salesforce/apex/ALMEX_MapDataController.getPrices';

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
    'Estado de Mexico': 'México',
    'Estado de México': 'México',
    'Ciudad de Mexico': 'Distrito Federal',
    'Ciudad de México': 'Distrito Federal',
    'Queretaro': 'Querétaro',
    'San Luis Potosi': 'San Luis Potosí',
    'Yucatan': 'Yucatán',
    'Nuevo Leon': 'Nuevo León'
});

const PRODUCT_NAME_ALIASES = Object.freeze({
    'Fructuosa 42': 'Fructosa 42',
    'Dextrosa Líquida': 'Dextrosa liquida',
    'Dextrosa líquida': 'Dextrosa liquida',
    'Dextrosa Liquida': 'Dextrosa liquida'
});

const PROVIDER_NAME_ALIASES = Object.freeze({
    'ADM México': 'ADM',
    'ADM Mexico': 'ADM',
    'Cargill México': 'Cargill',
    'Cargill Mexico': 'Cargill',
    'Ingredion México': 'Ingredion',
    'Ingredion Mexico': 'Ingredion'
});

function normalizeStateName(state) {
    return STATE_NAME_ALIASES[state] || state;
}

function normalizeProductName(product) {
    return PRODUCT_NAME_ALIASES[product] || product;
}

function normalizeProvider(provider) {
    const normalizedProvider = String(provider || '').trim();

    if (!normalizedProvider) {
        return 'N/A';
    }

    return PROVIDER_NAME_ALIASES[normalizedProvider] || normalizedProvider;
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

function getRecordCurrency(record) {
    return getPriceUnitConfig(record?.Unidad__c)?.currency || null;
}

function normalizePricePerKg(price, unit) {
    const numericPrice = Number(price);
    const unitConfig = getPriceUnitConfig(unit);

    if (!Number.isFinite(numericPrice) || numericPrice <= 0 || !unitConfig) {
        return null;
    }

    return numericPrice / unitConfig.divisor;
}

function isLiquidProduct(product) {
    const normalizedProduct = String(product || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

    return (
        normalizedProduct.includes('glucosa') ||
        normalizedProduct.includes('fructosa') ||
        (
            normalizedProduct.includes('dextrosa') &&
            normalizedProduct.includes('liquida')
        )
    );
}

function getRecordPeriod(record) {
    const periodYear = Number(record?.Periodo_Anio__c);
    const periodMonth = Number(record?.Periodo_Mes__c);

    if (
        Number.isInteger(periodYear) &&
        Number.isInteger(periodMonth) &&
        periodMonth >= 1 &&
        periodMonth <= 12
    ) {
        return {
            year: periodYear,
            month: periodMonth,
            key: periodYear * 100 + periodMonth,
            label: `${String(periodMonth).padStart(2, '0')}/${periodYear}`
        };
    }

    return null;
}

export default class MapaNacional extends LightningElement {

    prices = [];
    mapData;
    worldMapData;
    highmapsInitialized = false;

    selectedProduct = 'Azucar';
    summaryTableData = [];
    cityTableData = [];

    monitoredProducts = 0;
    analyzedStates = 0;
    averagePrice = 0;
    outOfRangeStates = 0;

    dataLoadError = '';

    selectedProvider = 'ALL';
    selectedMapProviders = [];
    selectedCurrency = CURRENCIES.MXN;
    lastLegendClickProvider = '';
    lastLegendClickTime = 0;

    get isMxnSelected() {
        return this.selectedCurrency === CURRENCIES.MXN;
    }

    get isUsdSelected() {
        return this.selectedCurrency === CURRENCIES.USD;
    }

    get mxnCurrencyButtonClass() {
        return this.isMxnSelected
            ? 'currency-option currency-option-active'
            : 'currency-option';
    }

    get usdCurrencyButtonClass() {
        return this.isUsdSelected
            ? 'currency-option currency-option-active'
            : 'currency-option';
    }

    get currentPriceUnitLabel() {
        return `${this.selectedCurrency}/Kg`;
    }

    get averagePriceDisplay() {
        const numericPrice = Number(this.averagePrice) || 0;
        const prefix = this.isUsdSelected ? 'US$' : '$';

        return `${prefix}${numericPrice.toFixed(2)}`;
    }

    get usesShipmentSize() {
        return isLiquidProduct(this.selectedProduct);
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
            const color = this.providerColors[provider] || '#5B6573';

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
        return `${this.providerSelectionLabel} · ${this.currentPriceUnitLabel}`;
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
                            this.isRecordInSelectedCurrency(price)
                    )
                    .map(
                        price =>
                            price.Proveedor__c?.trim()
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
    
    get isTableExpanded() {
        return this.expandedTable !== null;
    }

    get isStateTableExpanded() {
        return this.expandedTable === 'state';
    }

    get isCityTableExpanded() {
        return this.expandedTable === 'city';
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
                (this.prices || [])
                    .map(record => getRecordPeriod(record)?.year)
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
        const productDetailColumn = this.usesShipmentSize
            ? {
                label: 'Tamaño de embarque',
                fieldName: 'shipmentSize',
                type: 'text',
                wrapText: true,
                initialWidth: 165
            }
            : {
                label: 'Subproducto',
                fieldName: 'subproduct',
                type: 'text',
                wrapText: true,
                initialWidth: 165
            };

        return [
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
            productDetailColumn,
            {
                label: 'Proveedor',
                fieldName: 'provider',
                type: 'text',
                initialWidth: 130
            },
            {
                label: 'Venta mensual (Ton)',
                fieldName: 'consumption',
                type: 'number',
                typeAttributes: {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2
                },
                initialWidth: 155
            },
            {
                label: `Precio registrado (${this.selectedCurrency})`,
                fieldName: 'price',
                type: 'currency',
                typeAttributes: {
                    currencyCode: this.selectedCurrency,
                    currencyDisplayAs: 'code',
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                },
                initialWidth: 180
            },
            {
                label: 'Unidad original',
                fieldName: 'unit',
                type: 'text',
                initialWidth: 135
            }
        ];
    }

    get summaryTableColumns() {
        return [
            {
                label: 'Estado',
                fieldName: 'state',
                type: 'text',
                initialWidth: 120
            },
            {
                label: 'Consumo mensual (Ton)',
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
            }
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
        'Durango',
        'Guanajuato',
        'Guerrero',
        'Hidalgo',
        'Jalisco',
        'Estado de Mexico',
        'Michoacan',
        'Morelos',
        'Nayarit',
        'Nuevo Leon',
        'Oaxaca',
        'Puebla',
        'Queretaro',
        'Quintana Roo',
        'San Luis Potosi',
        'Sinaloa',
        'Sonora',
        'Tabasco',
        'Tamaulipas',
        'Tlaxcala',
        'Veracruz',
        'Yucatan',
        'Zacatecas',
        'Ciudad de Mexico'
    ];

    // ==============================
    // COLOR POR PROVEEDOR
    // ==============================

    providerColors = {
        'ALMEX': '#D32F2F',
        'Ingredion': '#4CAF50',
        'Cargill': '#F9A825',
        'ADM': '#1A237E',
        'Tate & Lyle': '#00897B',
        'Primient': '#757575',
        'PIASA': '#B71C1C',
        'Mill Foods': '#7ACDE2',
        'Beta San Miguel': '#3949AB',
        'Grupo Azucarero Mexico': '#795548',
        'GAM': '#A1887F',
        'Zucarmex': '#388E3C',
        'Ingenio La Gloria': '#F57C00',
        'MC Sugar': '#37B1E0',
        'N/A': '#5B6573'
    };


    // ==============================
    // CARGAR DATOS
    // ==============================

    connectedCallback() {
        this.loadPrices();
    }


    loadPrices() {
        this.dataLoadError = '';

        getPrices()
            .then(result => {
                const records = Array.isArray(result) ? result : [];

                this.prices = records.map(record => ({
                    ...record,
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
            })
            .catch(error => {
                console.error('Error obteniendo Registros:', error);
                this.prices = [];
                this.dataLoadError =
                    error?.body?.message ||
                    error?.message ||
                    'Salesforce no devolvió el detalle del error.';
            });
    }


    // ==============================
    // CARGAR HIGHMAPS
    // ==============================

    renderedCallback() {
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

        if (!container) {
            return;
        }

        const result = this.prices.filter(
            price =>
                price.Nombre_producto__c === this.selectedProduct &&
                this.isRecordInSelectedCurrency(price)
        );

        const currencyPrefix = this.isUsdSelected ? 'US$' : '$';
        const priceUnitLabel = this.currentPriceUnitLabel;

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
                    feature =>
                        feature.properties.name === stateName
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
                    '#CCCCCC',

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

                        const provider =
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
                            <b>Proveedor líder:</b> ${provider}<br>
                            <b>Consumo mensual:</b>
                            ${consumption.toLocaleString('es-MX')} Ton<br>
                            <b>Precio promedio del estado:</b>
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

        Highcharts.mapChart(container, {

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
                .map(price => price.Estado__c)
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
            .map(record => {
                const price = Number(record.Precio_producto__c);
                const unit = record.Unidad__c;
                const weight = Number(record.Consumo_mensual__c);

                const pricePerKg = normalizePricePerKg(price, unit);
            
                if (
                    isNaN(price) ||
                    isNaN(weight) ||
                    weight <= 0 ||
                    pricePerKg === null
                ) {
                    return null;
                }
            
                return {
                    pricePerKg,
                    weight
                };
            })
            .filter(record => record !== null);
        
        if (records.length === 0) {
            this.averagePrice = 0;
            return;
        }
    
        const weightedTotal = records.reduce(
            (sum, record) =>
                sum + (record.pricePerKg * record.weight),
            0
        );
    
        const totalWeight = records.reduce(
            (sum, record) =>
                sum + record.weight,
            0
        );
    
        this.averagePrice = (weightedTotal / totalWeight).toFixed(2);
    }


    // ==============================
    // CARD 4
    // ESTADOS FUERA DE RANGO
    // ==============================

    calculateOutOfRangeStates() {

        const filteredPrices = this.getSelectedProductRecords();

        const statesWithRecords = new Set(
            filteredPrices
                .map(price => price.Estado__c)
                .filter(state => state)
        );

        this.outOfRangeStates = this.mexicanStates.filter(
            state => !statesWithRecords.has(state)
        ).length;
    }


    // ==============================
    // FILTRAR POR PRODUCTO
    // ==============================

    getSelectedProductRecords() {
        return this.prices.filter(
            price =>
                price.Nombre_producto__c === this.selectedProduct &&
                this.isRecordInSelectedCurrency(price) &&
                this.matchesActiveProvider(price)
        );
    }

    isRecordInSelectedCurrency(record) {
        return getRecordCurrency(record) === this.selectedCurrency;
    }


    // ==============================
    // CAMBIO DE PRODUCTO
    // ==============================

    handleProductChange(event) {
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

    handleCurrencyChange(event) {
        const currency = event.currentTarget.dataset.currency;

        if (
            !Object.values(CURRENCIES).includes(currency) ||
            currency === this.selectedCurrency
        ) {
            return;
        }

        this.selectedCurrency = currency;
        this.selectedProvider = 'ALL';
        this.selectedMapProviders = [];
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
    // OBTENER PROVEEDORES LIDERES
    // ==============================

    getLeadingProviders(result) {
        const totalsByState = {};

        result.forEach(price => {
            const rawState = price.Estado__c;
            const state = normalizeStateName(rawState);
            const provider = price.Proveedor__c;
            const consumption =
                Number(price.Consumo_mensual__c) || 0;
            const productPrice =
                Number(price.Precio_producto__c) || 0;
            const unit = price.Unidad__c;

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
            // CONVERSIÓN DE PRECIO A KG
            // ==============================

            const normalizedPrice = normalizePricePerKg(
                productPrice,
                unit
            );

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
                    : 0;

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
                        '#CCCCCC'
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
        if (!this.mapData || !this.prices.length) {
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
        this.selectedStateRowIds = [];
        this.selectedStates = [];
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
        const result = this.prices.filter(
            price =>
                price.Nombre_producto__c ===
                    this.selectedProduct &&
                this.isRecordInSelectedCurrency(price) &&
                this.matchesActiveProvider(price)
        );

        const leadingProviders = this.getLeadingProviders(result);

        const statePrices = {};

        result.forEach(price => {
            const rawState = price.Estado__c;
            const state = normalizeStateName(rawState);

            const provider = price.Proveedor__c;

            const rawPrice =
                Number(price.Precio_producto__c) || 0;

            const unit = price.Unidad__c;

            if (!state || !provider || rawPrice <= 0) {
                return;
            }

            // ==========================================
            // NORMALIZAR A LA MONEDA SELECCIONADA POR KG
            // ==========================================

            const normalizedPrice = normalizePricePerKg(rawPrice, unit);

            if (normalizedPrice === null) {
                return;
            }

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

            if (provider === 'ALMEX') {
                statePrices[state].almex.push(
                    normalizedPrice
                );
            } else {
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

        this.summaryTableData = Object.entries(
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
                id: `${this.selectedProduct}-${this.selectedCurrency}-${index}`,

                state: state,

                consumption: stateData.consumption,

                averagePrice: competitionAverage,

                Nuestro_precio: almexAverage,

                status: '—',

                provider: stateData.provider,

                period: prices.latestPeriod
            };
        });
    }

    // ==============================
    // ACTUALIZAR TABLA RESUMEN POR CIUDAD
    // ==============================

    updateCityTable() {
        const result = this.prices.filter(
            price =>
                price.Nombre_producto__c ===
                    this.selectedProduct &&
                this.isRecordInSelectedCurrency(price) &&
                this.matchesActiveProvider(price)
        );

        this.allCityTableData = result.map((price, index) => {
            const rawState = price.Estado__c;
            const normalizedState = normalizeStateName(rawState);

            return {
                id: `city-${this.selectedProduct}-${this.selectedCurrency}-${index}-${price.Id}`,
                state: normalizedState,
                city: price.Ciudad__c || '',
                client: price.Nombre_comercial__c || '',
                subproduct: price.Tipo_subproducto__c || '',
                shipmentSize: price.Tama_o_embarque__c || '—',
                provider: normalizeProvider(price.Proveedor__c),
                consumption: Number(price.Consumo_mensual__c) || 0,
                price: Number(price.Precio_producto__c) || 0,
                unit: price.Unidad__c || ''
            };
        });

        this.cityTableData = [...this.allCityTableData];
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

        this.renderTrendChart();
    }

    renderTrendChart() {
        const container = this.template.querySelector(
            '.trend-chart'
        );

        if (!container || typeof Highcharts === 'undefined') {
            return;
        }

        const selectedYear = Number(this.selectedYear);
        const pricesByMonth = Array.from({ length: 12 }, () => []);

        (this.prices || []).forEach(record => {
            const period = getRecordPeriod(record);

            if (
                record.Nombre_producto__c !== this.selectedProduct ||
                !this.isRecordInSelectedCurrency(record) ||
                !this.matchesActiveProvider(record) ||
                !period ||
                period.year !== selectedYear
            ) {
                return;
            }

            const normalizedPrice = normalizePricePerKg(
                record.Precio_producto__c,
                record.Unidad__c
            );

            if (normalizedPrice !== null) {
                pricesByMonth[period.month - 1].push(normalizedPrice);
            }
        });

        const shortYear = String(selectedYear).slice(-2);
        const categories = pricesByMonth.map((prices, index) =>
            `${String(index + 1).padStart(2, '0')}/${shortYear}`
        );
        const monthlyAveragePrices = pricesByMonth.map(prices => {
            if (!prices.length) {
                return null;
            }

            const average =
                prices.reduce((sum, price) => sum + price, 0) /
                prices.length;

            return Number(average.toFixed(2));
        });
        const populatedMonths = monthlyAveragePrices.filter(
            price => price !== null
        ).length;

        if (this.trendChart) {
            this.trendChart.destroy();
            this.trendChart = null;
        }

        const currencyPrefix = this.isUsdSelected ? 'US$' : '$';

        this.trendChart = Highcharts.chart(
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
                    text: `Tendencia mensual · ${selectedYear}`,
                    align: 'left',
                    style: {
                        color: '#102a43',
                        fontSize: '18px',
                        fontWeight: '700'
                    }
                },

                subtitle: {
                    text: populatedMonths
                        ? `${this.selectedProduct} · ${this.providerSelectionLabel} · ${this.currentPriceUnitLabel} · ${populatedMonths} meses con información`
                        : `${this.selectedProduct} · ${this.providerSelectionLabel} · Sin registros con periodo para ${selectedYear}`,
                    align: 'left',
                    style: {
                        color: populatedMonths ? '#5c6f84' : '#b54708',
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
                        name: 'Precio promedio mensual',
                        data: monthlyAveragePrices,
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

    handleStateTableDoubleClick() {
        this.expandedTable = 'state';
    }

    handleCityTableDoubleClick() {
        this.expandedTable = 'city';
    }

    handleProviderChange(event) {
        this.selectedProvider = event.detail.value;
        this.selectedMapProviders = [];
        this.refreshProviderFilteredViews();
    }

    closeExpandedTable() {
        this.expandedTable = null;
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
            ['Moneda', this.selectedCurrency],
            ['Unidad normalizada', this.currentPriceUnitLabel],
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

            // Datos que aparecen actualmente en Resumen Estatal
            const selectedStateSet = new Set(
                this.selectedStates
            );

            const stateRowsToExport =
                this.selectedStates.length > 0
                    ? this.summaryTableData.filter(
                        row => selectedStateSet.has(row.state)
                    )
                    : this.summaryTableData;

            const stateExcelData = [
                ...this.getExcelContextRows('Resumen Estatal'),
                ...this.getExcelTableData(
                    stateRowsToExport,
                    this.summaryTableColumns
                )
            ];

            const stateWorksheet =
                XLSXLibrary.utils.aoa_to_sheet(stateExcelData);

            XLSXLibrary.utils.book_append_sheet(
                workbook,
                stateWorksheet,
                'Resumen Estatal'
            );

            // Datos que aparecen actualmente en Desglose por ciudad
            const cityExcelData = [
                ...this.getExcelContextRows('Desglose por ciudad'),
                ...this.getExcelTableData(
                    this.cityTableData,
                    this.cityTableColumns
                )
            ];

            const cityWorksheet =
                XLSXLibrary.utils.aoa_to_sheet(cityExcelData);

            XLSXLibrary.utils.book_append_sheet(
                workbook,
                cityWorksheet,
                'Resumen Ciudades'
            );

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
