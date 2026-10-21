import { normalizeAgendaActivityType } from 'c/agendaUtils';

const MONTH_NAMES = [
    'ene',
    'feb',
    'mar',
    'abr',
    'may',
    'jun',
    'jul',
    'ago',
    'sep',
    'oct',
    'nov',
    'dic'
];

const FULL_MONTH_NAMES = [
    'enero',
    'febrero',
    'marzo',
    'abril',
    'mayo',
    'junio',
    'julio',
    'agosto',
    'septiembre',
    'octubre',
    'noviembre',
    'diciembre'
];

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;
const STATUS_COMPLETED = 'Completada';
const STATUS_SCHEDULED = 'Programada';
const NEXT_DATE_BASE_STYLE =
    'display:inline-block;font-size:12px;font-weight:600;';
const STATUS_BASE_STYLE =
    'display:inline-flex;align-items:center;justify-content:center;' +
    'min-height:24px;padding:2px 9px;font-size:11px;font-weight:700;' +
    'white-space:nowrap;border:1px solid;border-radius:5px;';
const MEXICAN_STATES_BY_CODE = {
    AG: 'Aguascalientes',
    BC: 'Baja California',
    BS: 'Baja California Sur',
    CH: 'Chihuahua',
    CL: 'Colima',
    CM: 'Campeche',
    CO: 'Coahuila',
    COAH: 'Coahuila',
    CS: 'Chiapas',
    DF: 'Ciudad de México',
    CDMX: 'Ciudad de México',
    DG: 'Durango',
    GR: 'Guerrero',
    GT: 'Guanajuato',
    HG: 'Hidalgo',
    JA: 'Jalisco',
    JAL: 'Jalisco',
    ME: 'Estado de México',
    MI: 'Michoacán',
    MO: 'Morelos',
    NA: 'Nayarit',
    NL: 'Nuevo León',
    OA: 'Oaxaca',
    PB: 'Puebla',
    QE: 'Querétaro',
    QR: 'Quintana Roo',
    QRO: 'Quintana Roo',
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

export function buildVisitLogRows(response) {
    const today =
        parseSalesforceDate(response?.today) || startOfDay(new Date());

    const year = Number(response?.year) || today.getFullYear();
    const branches = Array.isArray(response?.branches)
        ? response.branches
        : [];

    return branches.map(branch => buildBranchRow(branch, year, today));
}

function buildBranchRow(branch, year, today) {
    const frequency = parseAnnualFrequency(branch.annualFrequency);
    const activities = normalizeActivities(branch.activities);

    const completedActivities = activities.filter(
        activity => activity.status === STATUS_COMPLETED
    );

    const scheduledActivities = activities.filter(
        activity => activity.status === STATUS_SCHEDULED
    );

    const completedFrequencyActivities = completedActivities.filter(
        activity => activity.countsTowardFrequency
    );

    const scheduledFrequencyActivities = scheduledActivities.filter(
        activity => activity.countsTowardFrequency
    );

    const targetDates = buildTargetDates(year, frequency);
    const suggestedDates = buildSuggestedDates(
        targetDates,
        frequency,
        completedFrequencyActivities,
        scheduledFrequencyActivities,
        today,
        year
    );

    const status = resolveComplianceStatus(
        frequency,
        targetDates,
        completedFrequencyActivities.length,
        scheduledFrequencyActivities,
        suggestedDates,
        today
    );

    const lastVisit = completedFrequencyActivities.length
        ? completedFrequencyActivities[
            completedFrequencyActivities.length - 1
        ].date
        : null;

    const nextVisit = resolveNextVisit(
        frequency,
        completedFrequencyActivities.length,
        scheduledFrequencyActivities,
        suggestedDates,
        today
    );

    const progressPercentage = frequency
        ? Math.min(100, Math.round(
            completedFrequencyActivities.length * 100 / frequency
        ))
        : 0;

    const months = buildMonthCells(
        completedActivities,
        scheduledActivities,
        suggestedDates
    );

    const branchName = branch.branchName || 'Sucursal sin nombre';
    const accountName = branch.accountName || 'Sin cuenta relacionada';
    const stateName = normalizeState(branch.state);

    return {
        id: branch.branchId,
        branchName,
        accountName,
        branchClientLabel: `${branchName} - (${accountName})`,
        stateName,
        location: formatLocation(branch.state, branch.city),
        frequencyValue: frequency,
        frequencyLabel: frequency
            ? `${frequency} al año`
            : 'Sin definir',
        progressLabel: frequency
            ? `${completedFrequencyActivities.length} de ${frequency}`
            : 'Sin frecuencia',
        completedCount: completedFrequencyActivities.length,
        progressValue: progressPercentage,
        progressStyle:
            'display:block;height:100%;border-radius:inherit;' +
            `width:${progressPercentage}%;` +
            `background-color:${status.progressColor};`,
        lastVisitLabel: lastVisit
            ? formatDate(lastVisit)
            : 'Sin visitas',
        lastVisitSortValue: lastVisit ? toDateKey(lastVisit) : '',
        nextVisitLabel: nextVisit.label,
        nextVisitStyle: nextVisit.style,
        nextVisitSortValue: nextVisit.sortValue,
        statusLabel: status.label,
        statusStyle: status.style,
        statusPriority: getStatusPriority(status.label),
        hasSuggestions: suggestedDates.length > 0,
        activityFilterValues: buildActivityFilterValues(activities),
        ...buildMonthEventFields(months)
    };
}

function buildActivityFilterValues(activities) {
    return [...new Set(activities.map(activity => {
        if (activity.activityType === 'Llamada') {
            return 'call';
        }

        if (activity.activityType === 'Visitas urgentes') {
            return 'extraordinary';
        }

        if (activity.status === STATUS_COMPLETED) {
            return 'completed';
        }

        if (activity.status === STATUS_SCHEDULED) {
            return 'scheduled';
        }

        return null;
    }).filter(Boolean))];
}

function buildMonthEventFields(months) {
    return months.reduce((fields, month, index) => {
        fields[`month${index}Events`] = month.events;
        fields[`month${index}SortValue`] = month.events.length
            ? month.events[0].sortDay
            : null;

        return fields;
    }, {});
}

function normalizeActivities(activities) {
    return (Array.isArray(activities) ? activities : [])
        .map(activity => ({
            id: activity.activityId,
            folio: activity.folio || '',
            status: activity.status || '',
            activityType: normalizeAgendaActivityType(activity.activityType) || 'Actividad',
            countsTowardFrequency:
                activity.countsTowardFrequency === true,
            date: parseSalesforceDate(activity.activityDate)
        }))
        .filter(activity => activity.date)
        .sort((first, second) => first.date - second.date);
}

function parseAnnualFrequency(value) {
    const match = String(value || '').match(/\d+/);

    if (!match) {
        return 0;
    }

    const frequency = Number.parseInt(match[0], 10);

    if (!Number.isFinite(frequency) || frequency <= 0) {
        return 0;
    }

    return Math.min(frequency, 366);
}

function buildTargetDates(year, frequency) {
    if (!frequency) {
        return [];
    }

    if (frequency <= 12) {
        return Array.from({ length: frequency }, (_, index) => {
            const targetMonth = Math.ceil((index + 1) * 12 / frequency);

            return new Date(year, targetMonth, 0);
        });
    }

    const firstDayOfYear = new Date(year, 0, 1);
    const firstDayOfNextYear = new Date(year + 1, 0, 1);
    const daysInYear = Math.round(
        (firstDayOfNextYear - firstDayOfYear) / DAY_IN_MILLISECONDS
    );

    return Array.from({ length: frequency }, (_, index) => {
        const dayOffset = Math.min(
            daysInYear - 1,
            Math.ceil((index + 1) * daysInYear / frequency) - 1
        );

        return new Date(year, 0, dayOffset + 1);
    });
}

function buildSuggestedDates(
    targetDates,
    frequency,
    completedActivities,
    scheduledActivities,
    today,
    year
) {
    if (!frequency) {
        return [];
    }

    const existingActivities = [
        ...completedActivities,
        ...scheduledActivities
    ].sort((first, second) => first.date - second.date);

    const remainingVisits = Math.max(
        0,
        frequency - existingActivities.length
    );

    if (!remainingVisits) {
        return [];
    }

    const coveredTargetIndexes = matchActivitiesToTargets(
        targetDates,
        existingActivities
    );

    const occupiedMonths = new Set(
        existingActivities.map(activity => toMonthKey(activity.date))
    );

    const selectedMonths = new Set();
    const suggestions = [];

    targetDates.forEach((targetDate, index) => {
        const monthKey = toMonthKey(targetDate);

        if (
            suggestions.length >= remainingVisits ||
            coveredTargetIndexes.has(index) ||
            targetDate < today ||
            occupiedMonths.has(monthKey) ||
            selectedMonths.has(monthKey)
        ) {
            return;
        }

        suggestions.push(targetDate);
        selectedMonths.add(monthKey);
    });

    const adaptiveCandidates = buildFutureMonthCandidates(year, today)
        .filter(candidate => {
            const monthKey = toMonthKey(candidate);

            return !occupiedMonths.has(monthKey) &&
                !selectedMonths.has(monthKey);
        });

    const planningAnchors = [
        today,
        ...existingActivities.map(activity => activity.date),
        ...suggestions
    ];

    while (
        suggestions.length < remainingVisits &&
        adaptiveCandidates.length
    ) {
        const bestCandidateIndex = findBestSpacedCandidateIndex(
            adaptiveCandidates,
            planningAnchors
        );

        const [bestCandidate] = adaptiveCandidates.splice(
            bestCandidateIndex,
            1
        );

        suggestions.push(bestCandidate);
        planningAnchors.push(bestCandidate);
    }

    return suggestions.sort((first, second) => first - second);
}

function matchActivitiesToTargets(targetDates, activities) {
    const coveredTargetIndexes = new Set();

    activities.forEach(activity => {
        let nearestTargetIndex = -1;
        let nearestDistance = Number.POSITIVE_INFINITY;

        targetDates.forEach((targetDate, index) => {
            if (coveredTargetIndexes.has(index)) {
                return;
            }

            const distance = Math.abs(targetDate - activity.date);

            if (distance < nearestDistance) {
                nearestDistance = distance;
                nearestTargetIndex = index;
            }
        });

        if (nearestTargetIndex >= 0) {
            coveredTargetIndexes.add(nearestTargetIndex);
        }
    });

    return coveredTargetIndexes;
}

function buildFutureMonthCandidates(year, today) {
    const firstCandidateMonth = today.getFullYear() === year
        ? today.getMonth()
        : 0;

    return Array.from(
        { length: 12 - firstCandidateMonth },
        (_, index) => new Date(year, firstCandidateMonth + index + 1, 0)
    ).filter(candidate => candidate >= today);
}

function findBestSpacedCandidateIndex(candidates, anchors) {
    let bestCandidateIndex = 0;
    let bestMinimumDistance = -1;

    candidates.forEach((candidate, index) => {
        const minimumDistance = anchors.reduce(
            (distance, anchor) => Math.min(
                distance,
                Math.abs(candidate - anchor)
            ),
            Number.POSITIVE_INFINITY
        );

        if (minimumDistance > bestMinimumDistance) {
            bestMinimumDistance = minimumDistance;
            bestCandidateIndex = index;
        }
    });

    return bestCandidateIndex;
}

function resolveComplianceStatus(
    frequency,
    targetDates,
    completedCount,
    scheduledActivities,
    suggestedDates,
    today
) {
    if (!frequency) {
        return {
            label: 'Sin frecuencia',
            className: 'visit-log-status visit-log-status-neutral',
            style: buildStatusStyle('#586174', '#f4f5f7', '#c9cdd3'),
            progressColor: '#9ca3af'
        };
    }

    if (completedCount >= frequency) {
        return {
            label: 'Al corriente',
            className: 'visit-log-status visit-log-status-current',
            style: buildStatusStyle('#176938', '#edf9f0', '#9dd6ab'),
            progressColor: '#25854a'
        };
    }

    const expectedVisits = targetDates.filter(
        targetDate => targetDate < today
    ).length;

    if (completedCount < expectedVisits) {
        return {
            label: 'Atrasado',
            className: 'visit-log-status visit-log-status-late',
            style: buildStatusStyle('#b4232e', '#fff1f2', '#f0a0a7'),
            progressColor: '#d64550'
        };
    }

    const nextTarget = [
        ...scheduledActivities.map(activity => activity.date),
        ...suggestedDates
    ]
        .filter(date => date >= today)
        .sort((first, second) => first - second)[0];

    const daysUntilNextTarget = nextTarget
        ? Math.ceil((nextTarget - today) / DAY_IN_MILLISECONDS)
        : null;

    if (
        daysUntilNextTarget !== null &&
        daysUntilNextTarget >= 0 &&
        daysUntilNextTarget <= 30
    ) {
        return {
            label: 'Por vencer',
            className: 'visit-log-status visit-log-status-warning',
            style: buildStatusStyle('#855b00', '#fff9e7', '#f1cd68'),
            progressColor: '#e2a600'
        };
    }

    return {
        label: 'Al corriente',
        className: 'visit-log-status visit-log-status-current',
        style: buildStatusStyle('#176938', '#edf9f0', '#9dd6ab'),
        progressColor: '#25854a'
    };
}

function resolveNextVisit(
    frequency,
    completedCount,
    scheduledActivities,
    suggestedDates,
    today
) {
    if (!frequency) {
        return {
            label: 'Sin definir',
            className: 'visit-log-next-date visit-log-next-date-neutral',
            style: buildNextDateStyle('#697386'),
            sortValue: ''
        };
    }

    if (completedCount >= frequency) {
        return {
            label: 'Meta cumplida',
            className: 'visit-log-next-date visit-log-next-date-complete',
            style: buildNextDateStyle('#176938'),
            sortValue: '9999-12-31'
        };
    }

    const futureScheduledDates = scheduledActivities
        .map(activity => activity.date)
        .filter(date => date >= today);

    const futureSuggestedDates = suggestedDates.filter(
        date => date >= today
    );

    const nextCandidates = [
        ...futureScheduledDates.map(date => ({ date, scheduled: true })),
        ...futureSuggestedDates.map(date => ({ date, scheduled: false }))
    ].sort((first, second) => first.date - second.date);

    if (nextCandidates.length) {
        const nextCandidate = nextCandidates[0];

        return {
            label: formatMonthYear(nextCandidate.date),
            className: nextCandidate.scheduled
                ? 'visit-log-next-date visit-log-next-date-scheduled'
                : 'visit-log-next-date visit-log-next-date-suggested',
            style: buildNextDateStyle(
                nextCandidate.scheduled ? '#1669d5' : '#6d28d9'
            ),
            sortValue: toDateKey(nextCandidate.date)
        };
    }

    if (suggestedDates.some(date => date < today)) {
        return {
            label: 'Lo antes posible',
            className: 'visit-log-next-date visit-log-next-date-overdue',
            style: buildNextDateStyle('#b4232e'),
            sortValue: toDateKey(today)
        };
    }

    return {
        label: 'Sin visita pendiente',
        className: 'visit-log-next-date visit-log-next-date-neutral',
        style: buildNextDateStyle('#697386'),
        sortValue: ''
    };
}

function buildMonthCells(
    completedActivities,
    scheduledActivities,
    suggestedDates
) {
    const monthEvents = Array.from({ length: 12 }, () => []);
    const occupiedDates = new Set();

    completedActivities.forEach(activity => {
        if (activity.countsTowardFrequency) {
            occupiedDates.add(toDateKey(activity.date));
        }
        addActivityEvent(monthEvents, activity, 'completed');
    });

    scheduledActivities.forEach(activity => {
        if (activity.countsTowardFrequency) {
            occupiedDates.add(toDateKey(activity.date));
        }
        addActivityEvent(monthEvents, activity, 'scheduled');
    });

    suggestedDates.forEach((date, index) => {
        if (occupiedDates.has(toDateKey(date))) {
            return;
        }

        monthEvents[date.getMonth()].push({
            key: `suggested-${index}-${toDateKey(date)}`,
            day: String(date.getDate()).padStart(2, '0'),
            sortDay: date.getDate(),
            sortOrder: 5,
            isSuggested: true,
            className: 'visit-log-suggestion-dot',
            style:
                'width:11px;height:11px;display:inline-block;' +
                'background:#7c3aed;border-radius:50%;' +
                'box-shadow:0 0 0 3px rgba(124,58,237,0.1);',
            title: `Visita sugerida para ${formatDate(date)}`
        });
    });

    return monthEvents.map((events, monthIndex) => ({
        key: `month-${monthIndex}`,
        label: MONTH_NAMES[monthIndex],
        events: events.sort((first, second) =>
            first.sortDay - second.sortDay ||
            first.sortOrder - second.sortOrder
        )
    }));
}

function addActivityEvent(monthEvents, activity, type) {
    const isCompleted = type === 'completed';
    const isCall = activity.activityType === 'Llamada';
    const isExtraordinaryVisit =
        activity.activityType === 'Visitas urgentes';
    const activityLabel = isCall
        ? 'Llamada'
        : isExtraordinaryVisit
            ? 'Visitas urgentes'
            : 'Visita';
    const color = isCall
        ? '#d97706'
        : isExtraordinaryVisit
            ? '#0891b2'
            : isCompleted
                ? '#25854a'
                : '#2d7ce5';
    const className = isCall
        ? 'visit-log-day visit-log-day-call'
        : isExtraordinaryVisit
            ? 'visit-log-day visit-log-day-extraordinary'
            : isCompleted
                ? 'visit-log-day visit-log-day-completed'
                : 'visit-log-day visit-log-day-scheduled';
    const frequencyLabel = activity.countsTowardFrequency
        ? 'Cuenta para la frecuencia anual'
        : 'No contabiliza para la frecuencia anual';

    monthEvents[activity.date.getMonth()].push({
        key: `${type}-${activity.id}`,
        activityId: activity.id,
        day: String(activity.date.getDate()).padStart(2, '0'),
        sortDay: activity.date.getDate(),
        sortOrder: isCompleted ? 1 : 3,
        isSuggested: false,
        className,
        style: buildActivityDayStyle(isCompleted, color),
        title:
            `${activityLabel} ${isCompleted ? 'completada' : 'programada'} ` +
            `${formatDate(activity.date)}` +
            `${activity.folio ? ` · ${activity.folio}` : ''}` +
            ` · ${frequencyLabel}`
    });
}

function buildStatusStyle(color, backgroundColor, borderColor) {
    return (
        STATUS_BASE_STYLE +
        `color:${color};background:${backgroundColor};` +
        `border-color:${borderColor};`
    );
}

function getStatusPriority(statusLabel) {
    const priorityByStatus = {
        Atrasado: 1,
        'Por vencer': 2,
        'Al corriente': 3,
        'Sin frecuencia': 4
    };

    return priorityByStatus[statusLabel] || 5;
}

function buildNextDateStyle(color) {
    return NEXT_DATE_BASE_STYLE + `color:${color};`;
}

function buildActivityDayStyle(isCompleted, color) {
    const baseStyle =
        'width:28px;height:28px;display:inline-flex;align-items:center;' +
        'justify-content:center;font-size:10px;font-weight:750;' +
        'border-radius:50%;';

    return isCompleted
        ? baseStyle +
            `color:#fff;background:${color};` +
            'box-shadow:0 1px 3px rgba(15,23,42,0.2);'
        : baseStyle +
            `color:${color};background:#fff;border:2px solid ${color};`;
}

function formatLocation(state, city) {
    const normalizedState = normalizeState(state);
    const locationParts = [normalizedState, city]
        .map(value => String(value || '').trim())
        .filter(Boolean);

    return locationParts.length
        ? locationParts.join(' · ')
        : 'Sin ubicación';
}

function normalizeState(value) {
    const state = String(value || '').trim();

    return MEXICAN_STATES_BY_CODE[state.toUpperCase()] || state;
}

function parseSalesforceDate(value) {
    if (!value) {
        return null;
    }

    const [year, month, day] = String(value)
        .slice(0, 10)
        .split('-')
        .map(Number);

    if (!year || !month || !day) {
        return null;
    }

    return new Date(year, month - 1, day);
}

function startOfDay(value) {
    return new Date(
        value.getFullYear(),
        value.getMonth(),
        value.getDate()
    );
}

function formatDate(value) {
    return (
        `${String(value.getDate()).padStart(2, '0')} ` +
        `${MONTH_NAMES[value.getMonth()]} ${value.getFullYear()}`
    );
}

function formatMonthYear(value) {
    return `${FULL_MONTH_NAMES[value.getMonth()]} ${value.getFullYear()}`;
}

function toDateKey(value) {
    return (
        `${value.getFullYear()}-` +
        `${String(value.getMonth() + 1).padStart(2, '0')}-` +
        String(value.getDate()).padStart(2, '0')
    );
}

function toMonthKey(value) {
    return (
        `${value.getFullYear()}-` +
        String(value.getMonth() + 1).padStart(2, '0')
    );
}
