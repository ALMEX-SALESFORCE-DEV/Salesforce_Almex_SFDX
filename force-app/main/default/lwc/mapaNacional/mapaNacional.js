import { LightningElement } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import HIGHMAPS from '@salesforce/resourceUrl/Highmaps';
import sheetjs from '@salesforce/resourceUrl/sheetjs';
import getPrices from '@salesforce/apex/ALMEX_MapDataController.getPrices';

export default class MapaNacional extends LightningElement {

    prices = [];
    mapData;
    highmapsInitialized = false;

    selectedProduct = 'Azucar';
    summaryTableData = [];
    cityTableData = [];

    monitoredProducts = 0;
    analyzedStates = 0;
    averagePrice = 0;
    outOfRangeStates = 0;

    selectedProvider = 'ALL';

    get providerOptions() {
        const providers = [
            ...new Set(
                (this.prices || [])
                    .filter(
                        price =>
                            price.Nombre_producto__c ===
                            this.selectedProduct
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
                label: 'Todos los proveedores',
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
    selectedMonth = String(new Date().getMonth() + 1);

    trendChart;


    get isTableExpanded() {
        return (
                this.isStateTableExpanded ||
                this.isCityTableExpanded
            );
    }

    sheetJsLoaded = false;
    isDownloading = false;

    selectedStateRowIds = [];
    selectedStates = [];

    yearOptions = [
    { label: '2026', value: '2026' },
    { label: '2025', value: '2025' },
    { label: '2024', value: '2024' }
    ];

    monthOptions = [
        { label: 'Enero', value: '1' },
        { label: 'Febrero', value: '2' },
        { label: 'Marzo', value: '3' },
        { label: 'Abril', value: '4' },
        { label: 'Mayo', value: '5' },
        { label: 'Junio', value: '6' },
        { label: 'Julio', value: '7' },
        { label: 'Agosto', value: '8' },
        { label: 'Septiembre', value: '9' },
        { label: 'Octubre', value: '10' },
        { label: 'Noviembre', value: '11' },
        { label: 'Diciembre', value: '12' }
    ];
    

    cityTableColumns = [
        {
            label: 'Estado',
            fieldName: 'state',
            type: 'text'
        },
        {
            label: 'Ciudad',
            fieldName: 'city',
            type: 'text'
        },
        {
            label: 'Cliente',
            fieldName: 'client',
            type: 'text'
        },
        {
            label: 'Subproducto',
            fieldName: 'subproduct',
            type: 'text'
        },
        {
            label: 'Proveedor',
            fieldName: 'provider',
            type: 'text'
        },
        {
            label: 'Venta mensual (Ton)',
            fieldName: 'consumption',
            type: 'number',
            typeAttributes: {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            }
        },
        {
            label: 'Precio',
            fieldName: 'price',
            type: 'currency',
            typeAttributes: {
                currencyCode: 'MXN',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        },
        {
            label: 'Unidad',
            fieldName: 'unit',
            type: 'text'
        }
    ];

    summaryTableColumns = [
        {
            label: 'Estado',
            fieldName: 'state',
            type: 'text'
        },
        {
            label: 'Consumo mensual (Ton)',
            fieldName: 'consumption',
            type: 'number',
            typeAttributes: {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            }
        },
        {
            label: 'Precio Competidores',
            fieldName: 'averagePrice',
            type: 'currency',
            typeAttributes: {
                currencyCode: 'MXN',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        },
        {
            label: 'Precio ALMEX',
            fieldName: 'Nuestro_precio',
            type: 'currency',
            typeAttributes: {
                currencyCode: 'MXN',
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        },
        {
            label: 'Estatus',
            fieldName: 'status',
            type: 'text'
        },
        {
            label: 'Proveedor Líder',
            fieldName: 'provider',
            type: 'text'
        },
        {
            label: 'Última actualización',
            fieldName: 'lastUpdate',
            type: 'text'
        }
    ];


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
    'Primient': '#757575',
    'PIASA': '#B71C1C',
    'Mill Foods' : '#7acde2',
    'Beta San Miguel': '#3949AB',
    'Grupo Azucarero Mexico': '#795548',
    'GAM': '#A1887F',
    'Zucarmex': '#388E3C',
    'Ingenio La Gloria': '#F57C00',
    'MC Sugar' : '#37b1e0'
    };


    // ==============================
    // CARGAR DATOS
    // ==============================

    connectedCallback() {
        this.loadPrices();
    }


    loadPrices() {
        getPrices()
            .then(result => {
                this.prices = result;
                console.log('Registros recibidos:', result);

                this.updateCards();
                this.updateSummaryTable();
                this.updateCityTable();
                this.renderMap();
            })
            .catch(error => {
                console.error('Error obteniendo Registros:', error);
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

        loadScript(
            this,
            HIGHMAPS + '/highmaps/highmaps.js'
        )
            .then(() => {
                return fetch(
                    HIGHMAPS + '/highmaps/mx-all.geo.json'
                );
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(
                        `Error cargando GeoJSON: ${response.status}`
                    );
                }

                return response.json();
            })
            .then(mapData => {
                this.mapData = mapData;

                this.renderMap();
            })
            .catch(error => {
                console.error('Error cargando Highmaps:', error);
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
            price => price.Nombre_producto__c === this.selectedProduct
        );

        const leadingProviders = this.getLeadingProviders(result);

        const providerStateCounts =
            this.getProviderStateCounts(leadingProviders);

        // ==========================================
        // SERIE BASE: ESTADOS SIN DATOS
        // ==========================================

        const baseSeriesData = mapData.features.map(feature => {
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

                const feature = mapData.features.find(
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

        const providerSeries = Object.entries(
            statesByProvider
        ).map(([provider, stateData]) => {

            const stateCount =
                providerStateCounts[provider] || 0;

            return {
                type: 'map',

                name: `${provider} (${stateCount})`,

                color:
                    this.providerColors[provider] ||
                    '#CCCCCC',

                showInLegend: true,

                mapData: mapData,

                data: stateData,

                nullColor: 'transparent',

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
                                ? `$${averagePrice.toFixed(2)}`
                                : 'Sin datos';

                        const almexPriceText =
                            Number.isFinite(almexPrice)
                                ? `$${almexPrice.toFixed(2)}`
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
                backgroundColor: 'transparent'
            },

            title: {
                text: null
            },

            credits: {
                enabled: false
            },

            mapNavigation: {
                enabled: true
            },

            legend: {
                enabled: true
            },

            plotOptions: {
            series: {
                states: {
                    inactive: {
                        enabled: false
                    }
                }
            }
            },


            series: [
                {
                    type: 'map',

                    name: 'Sin datos',

                    mapData: mapData,

                    data: baseSeriesData,

                    color: '#E5E7EB',

                    showInLegend: false,

                    enableMouseTracking: false
                },

                ...providerSeries
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
            
                if (isNaN(price) || isNaN(weight) || weight <= 0) {
                    return null;
                }
            
                let pricePerKg;
            
                switch (unit) {
                    case 'MXN_Kg':
                        pricePerKg = price;
                        break;
                
                    case 'MXN_25KG_BULTO':
                        pricePerKg = price / 25;
                        break;
                
                    case 'MXN_50KG_BULTO':
                        pricePerKg = price / 50;
                        break;
                
                    default:
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
            price => price.Nombre_producto__c === this.selectedProduct
        );
    }


    // ==============================
    // CAMBIO DE PRODUCTO
    // ==============================

    handleProductChange(event) {
        this.selectedProvider = 'ALL';
        this.selectedStateRowIds = [];
        this.selectedStates = [];
        this.selectedProduct = event.target.value;

        this.updateCards();
        this.updateSummaryTable();
        this.updateCityTable();
        this.renderMap();
    }

     // ==============================
    // OBTENER PROVEEDORES LIDERES
    // ==============================

    getLeadingProviders(result) {
        const totalsByState = {};

        const stateNameMap = {
            'Estado de Mexico': 'México',
            'Ciudad de Mexico': 'Distrito Federal',
            'Queretaro': 'Querétaro',
            'San Luis Potosi': 'San Luis Potosí',
            'Yucatan': 'Yucatán',
            'Nuevo Leon': 'Nuevo León'
        };

        result.forEach(price => {
            const rawState = price.Estado__c;
            const state = stateNameMap[rawState] || rawState;
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

            let normalizedPrice = productPrice;

            if (unit === 'MXN_25KG_BULTO') {
                normalizedPrice = productPrice / 25;
            }

            else if (unit === 'MXN_50KG_BULTO') {
                normalizedPrice = productPrice / 50;
            }

            else if (unit === 'DOLARES_TON') {
                normalizedPrice = productPrice / 1000;
            }

            else if (unit === 'DOLARES_KILO') {
                normalizedPrice = productPrice;
            }

            else if (unit === 'MXN_Kg') {
                normalizedPrice = productPrice;
            }


            if (normalizedPrice > 0) {
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

    // ==============================
    // ACTUALIZAR TABLA RESUMEN ESTATAL
    // ==============================

    updateSummaryTable() {
        const result = this.prices.filter(
            price =>
                price.Nombre_producto__c ===
                    this.selectedProduct &&
                (
                    this.selectedProvider === 'ALL' ||
                    price.Proveedor__c?.trim() ===
                        this.selectedProvider
                )
        );

        const leadingProviders = this.getLeadingProviders(result);

        const statePrices = {};

        const stateNameMap = {
            'Estado de Mexico': 'México',
            'Ciudad de Mexico': 'Distrito Federal',
            'Queretaro': 'Querétaro',
            'San Luis Potosi': 'San Luis Potosí',
            'Yucatan': 'Yucatán',
            'Nuevo Leon': 'Nuevo León'
        };

        result.forEach(price => {
            const rawState = price.Estado__c;
            const state = stateNameMap[rawState] || rawState;

            const provider = price.Proveedor__c;

            const rawPrice =
                Number(price.Precio_producto__c) || 0;

            const unit = price.Unidad__c;

            if (!state || !provider || rawPrice <= 0) {
                return;
            }

            // ==========================================
            // CONVERTIR PRIMERO A MXN/KG
            // ==========================================

            let normalizedPrice = null;

            switch (unit) {

                case 'MXN_Kg':
                    normalizedPrice = rawPrice;
                    break;

                case 'MXN_25KG_BULTO':
                    normalizedPrice = rawPrice / 25;
                    break;

                case 'MXN_50KG_BULTO':
                    normalizedPrice = rawPrice / 50;
                    break;

                case 'DOLARES_TON':
                    normalizedPrice = rawPrice / 1000;
                    break;

                case 'DOLARES_KILO':
                    normalizedPrice = rawPrice;
                    break;

                default:
                    return;
            }

            if (normalizedPrice <= 0) {
                return;
            }

            // ==========================================
            // CREAR ESTRUCTURA DEL ESTADO
            // ==========================================

            if (!statePrices[state]) {
                statePrices[state] = {
                    almex: [],
                    competition: [],
                    lastCreatedDate: null
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
            // ÚLTIMA ACTUALIZACIÓN DEL ESTADO
            // ==========================================

            if (price.CreatedDate) {
                const currentDate = new Date(
                    price.CreatedDate
                );

                const lastDate = statePrices[state].lastCreatedDate;

                if (
                    !lastDate ||
                    currentDate > lastDate
                ) {
                    statePrices[state].lastCreatedDate =
                        currentDate;
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
                lastCreatedDate: null
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

            let lastUpdate = '—';

            if (prices.lastCreatedDate) {
                lastUpdate =
                    prices.lastCreatedDate.toLocaleDateString(
                        'es-MX',
                        {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                        }
                    );
            }

            return {
                id: `${this.selectedProduct}-${index}`,

                state: state,

                consumption: stateData.consumption,

                averagePrice: competitionAverage,

                Nuestro_precio: almexAverage,

                status: '—',

                provider: stateData.provider,

                lastUpdate: lastUpdate
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
                (
                    this.selectedProvider === 'ALL' ||
                    price.Proveedor__c?.trim() ===
                        this.selectedProvider
                )
        );

        const stateNameMap = {
            'Estado de Mexico': 'México',
            'Ciudad de Mexico': 'Distrito Federal',
            'Queretaro': 'Querétaro',
            'San Luis Potosi': 'San Luis Potosí',
            'Yucatan': 'Yucatán',
            'Nuevo Leon': 'Nuevo León'
        };

        this.allCityTableData = result.map((price, index) => {
            const rawState = price.Estado__c;
            const normalizedState = stateNameMap[rawState] || rawState;

            return {
                id: `city-${this.selectedProduct}-${index}-${price.Id}`,
                state: normalizedState,
                city: price.Ciudad__c || '',
                client: price.Nombre_comercial__c || '',
                subproduct: price.Tipo_subproducto__c || '',
                provider: price.Proveedor__c || '',
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

    handleMonthChange(event) {
        this.selectedMonth = event.detail.value;

        this.renderTrendChart();
    }

    renderTrendChart() {
    const container = this.template.querySelector(
            '.trend-chart'
        );

        if (!container || typeof Highcharts === 'undefined') {
            return;
        }

        // ==========================================
        // DATOS
        // ==========================================

        const result = this.prices || [];

        // ==========================================
        // FILTRAR PRODUCTO, AÑO Y MES
        // ==========================================

        const selectedYear = Number(this.selectedYear);
        const selectedMonth = Number(this.selectedMonth);

        const filteredResult = result.filter(record => {

            if (!record.CreatedDate) {
                return false;
            }

            if (
                record.Nombre_producto__c !==
                this.selectedProduct
            ) {
                return false;
            }

            const createdDate = new Date(
                record.CreatedDate
            );

            return (
                createdDate.getFullYear() === selectedYear &&
                createdDate.getMonth() + 1 === selectedMonth
            );
        });

        // ==========================================
        // AGRUPAR PRECIOS POR DÍA
        // ==========================================

        const pricesByDay = {};

        filteredResult.forEach(record => {

            const createdDate = new Date(
                record.CreatedDate
            );

            const day = String(
                createdDate.getDate()
            ).padStart(2, '0');

            // ======================================
            // NORMALIZAR PRECIO A MXN/KG
            // ======================================

            const rawPrice =
                Number(record.Precio_producto__c) || 0;

            const unit = record.Unidad__c;

            if (!rawPrice || !unit) {
                return;
            }

            let normalizedPrice = null;

            switch (unit) {

                case 'MXN_Kg':
                    normalizedPrice = rawPrice;
                    break;

                case 'MXN_25KG_BULTO':
                    normalizedPrice = rawPrice / 25;
                    break;

                case 'MXN_50KG_BULTO':
                    normalizedPrice = rawPrice / 50;
                    break;

                case 'DOLARES_TON':
                    normalizedPrice = rawPrice / 1000;
                    break;

                case 'DOLARES_KILO':
                    normalizedPrice = rawPrice;
                    break;

                default:
                    return;
            }

            if (normalizedPrice <= 0) {
                return;
            }

            if (!pricesByDay[day]) {
                pricesByDay[day] = [];
            }

            pricesByDay[day].push(
                normalizedPrice
            );
        });

        // ==========================================
        // DÍAS DEL MES
        // ==========================================

        const daysInMonth = new Date(
            selectedYear,
            selectedMonth,
            0
        ).getDate();

        const categories = [];
        const dailyAveragePrices = [];

        for (
            let day = 1;
            day <= daysInMonth;
            day++
        ) {

            const dayString = String(day).padStart(
                2,
                '0'
            );

            categories.push(dayString);

            const prices =
                pricesByDay[dayString];

            if (!prices || !prices.length) {
                dailyAveragePrices.push(null);
                continue;
            }

            const average =
                prices.reduce(
                    (sum, price) => sum + price,
                    0
                ) / prices.length;

            dailyAveragePrices.push(
                Number(average.toFixed(2))
            );
        }

        // ==========================================
        // DESTRUIR GRÁFICA ANTERIOR
        // ==========================================

        if (this.trendChart) {
            this.trendChart.destroy();
            this.trendChart = null;
        }

        // ==========================================
        // NOMBRE DEL MES
        // ==========================================

        const monthNames = [
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
        ];

        const monthName =
            monthNames[selectedMonth - 1];

        // ==========================================
        // CREAR GRÁFICA
        // ==========================================

        this.trendChart = Highcharts.chart(
            container,
            {

                chart: {
                    type: 'line',
                    backgroundColor: 'transparent'
                },

                title: {
                    text:
                        `Tendencia de precios - ${monthName} ${selectedYear}`
                },

                credits: {
                    enabled: false
                },

                legend: {
                    enabled: false
                },

                xAxis: {
                    categories: categories,

                    title: {
                        text: 'Día'
                    }
                },

                yAxis: {
                    title: {
                        text: 'Precio (MXN/Kg)'
                    },

                    labels: {
                        formatter: function () {
                            return `$${this.value.toFixed(2)}`;
                        }
                    }
                },

                tooltip: {
                    shared: true,

                    valueDecimals: 2,

                    valuePrefix: '$',

                    valueSuffix: ' MXN/Kg'
                },

                plotOptions: {
                    series: {
                        connectNulls: false,

                        marker: {
                            enabled: true,
                            radius: 3
                        },

                        lineWidth: 3
                    }
                },

                series: [
                    {
                        name: 'Precio promedio',
                        data: dailyAveragePrices
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

            const monthSelect = this.template.querySelector(
                '#month'
            );

            if (yearSelect) {
                yearSelect.value = this.selectedYear;
            }

            if (monthSelect) {
                monthSelect.value = this.selectedMonth;
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

        // Limpiar checks de estados anteriores
        this.selectedStateRowIds = [];
        this.selectedStates = [];

        this.updateSummaryTable();
        this.updateCityTable();
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

            const stateExcelData = this.getExcelTableData(
                stateRowsToExport,
                this.summaryTableColumns
            );

            const stateWorksheet =
                XLSXLibrary.utils.aoa_to_sheet(stateExcelData);

            XLSXLibrary.utils.book_append_sheet(
                workbook,
                stateWorksheet,
                'Resumen Estatal'
            );

            // Datos que aparecen actualmente en Desglose por ciudad
            const cityExcelData = this.getExcelTableData(
                this.cityTableData,
                this.cityTableColumns
            );

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

            XLSXLibrary.writeFile(
                workbook,
                `Mapeo_de_mercado_${productName}.xlsx`
            );

        } catch (error) {
            console.error('Error descargando Excel:', error);
        } finally {
            this.isDownloading = false;
        }
    }

    
}