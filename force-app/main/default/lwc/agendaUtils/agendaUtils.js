const MEXICAN_STATES_BY_CODE = {
    AG: 'Aguascalientes',
    BC: 'Baja California',
    BS: 'Baja California Sur',
    CH: 'Chihuahua',
    CL: 'Colima',
    CM: 'Campeche',
    COAH: 'Coahuila',
    CO: 'Coahuila',
    CS: 'Chiapas',
    DF: 'Ciudad de México',
    DG: 'Durango',
    GR: 'Guerrero',
    GT: 'Guanajuato',
    HG: 'Hidalgo',
    JA: 'Jalisco',
    JAL: 'Jalisco',
    ME: 'Estado de México',
    MI: 'Michoacán',
    CDMX: 'Ciudad de México',
    MO: 'Morelos',
    NA: 'Nayarit',
    NL: 'Nuevo León',
    OA: 'Oaxaca',
    PB: 'Puebla',
    QE: 'Querétaro',
    QRO: 'Quintana Roo',
    QR: 'Quintana Roo',
    SI: 'Sinaloa',
    SIN: 'Sinaloa',
    SL: 'San Luis Potosí',
    SO: 'Sonora',
    TB: 'Tabasco',
    TL: 'Tlaxcala',
    TM: 'Tamaulipas',
    VE: 'Veracruz',
    YU: 'Yucatán',
    ZA: 'Zacatecas'
};

const EXECUTIVE_COLOR_PALETTES = [
    {
        backgroundColor: '#eaf2ff',
        borderColor: '#9dbcf2',
        textColor: '#173f7a',
        dotColor: '#2f6fd0'
    },
    {
        backgroundColor: '#f2ecff',
        borderColor: '#c4acf2',
        textColor: '#4f2683',
        dotColor: '#7b46c5'
    },
    {
        backgroundColor: '#e6f7f4',
        borderColor: '#8ed1c5',
        textColor: '#155e54',
        dotColor: '#168a78'
    },
    {
        backgroundColor: '#fff1e7',
        borderColor: '#efb78f',
        textColor: '#7d3915',
        dotColor: '#cf641f'
    },
    {
        backgroundColor: '#fdebf3',
        borderColor: '#eca9c5',
        textColor: '#7d2349',
        dotColor: '#c43d75'
    },
    {
        backgroundColor: '#ebedff',
        borderColor: '#adb4ef',
        textColor: '#303a82',
        dotColor: '#5261c7'
    },
    {
        backgroundColor: '#eaf7ea',
        borderColor: '#9fcf9f',
        textColor: '#285f2d',
        dotColor: '#41964a'
    },
    {
        backgroundColor: '#ffeded',
        borderColor: '#efaaaa',
        textColor: '#7d2929',
        dotColor: '#cc4747'
    },
    {
        backgroundColor: '#e7f7fb',
        borderColor: '#91cfde',
        textColor: '#17586a',
        dotColor: '#258ba4'
    },
    {
        backgroundColor: '#fff7df',
        borderColor: '#e8cb78',
        textColor: '#735514',
        dotColor: '#bc8b16'
    },
    {
        backgroundColor: '#f5edfa',
        borderColor: '#cbb0dc',
        textColor: '#5b326f',
        dotColor: '#8c56a7'
    },
    {
        backgroundColor: '#eef2f5',
        borderColor: '#b6c2cc',
        textColor: '#344955',
        dotColor: '#607d8b'
    }
];

function getExecutiveInitials(executiveName) {
    const nameParts = String(executiveName || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase()
        .split(/\s+/)
        .filter(Boolean);
    const firstInitial = nameParts[0]?.charAt(0) || 'X';
    const secondInitial = nameParts[1]?.charAt(0) ||
        nameParts[0]?.charAt(1) ||
        firstInitial;

    return `${firstInitial}${secondInitial}`;
}

function getInitialAlphabetIndex(initial) {
    const characterCode = String(initial || 'A').charCodeAt(0);

    return characterCode >= 65 && characterCode <= 90
        ? characterCode - 65
        : 0;
}

export function buildExecutivePalette(executiveName) {
    const initials = getExecutiveInitials(executiveName);
    const firstInitialIndex = getInitialAlphabetIndex(initials.charAt(0));
    const secondInitialIndex = getInitialAlphabetIndex(initials.charAt(1));
    const paletteIndex = (
        firstInitialIndex * 11 +
        secondInitialIndex * 17
    ) % EXECUTIVE_COLOR_PALETTES.length;

    return EXECUTIVE_COLOR_PALETTES[paletteIndex];
}

export function resolveMexicanState(stateValue) {
    const state = String(stateValue || '').trim();

    return MEXICAN_STATES_BY_CODE[state.toUpperCase()] || state;
}

export function normalizeAgendaSearchText(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

// Alias históricos: cambia la etiqueta sin modificar los registros existentes.
export function normalizeAgendaActivityType(value) {
    const type = String(value || '').trim();
    const normalized = normalizeAgendaSearchText(type);
    if (['reunion', 'reunion teams'].includes(normalized)) {
        return 'Reunión Teams';
    }
    if (['visita extraordinaria', 'visitas extraordinarias',
        'visita urgente', 'visitas urgentes'].includes(normalized)) {
        return 'Visitas urgentes';
    }
    return type;
}

