import LightningDatatable from 'lightning/datatable';
import statusCell from './statusCell.html';
import activityTypeCell from './activityTypeCell.html';

export default class ActivityBreakdownDatatable extends LightningDatatable {
    static customTypes = {
        agendaStatus: {
            template: statusCell,
            standardCellLayout: true,
            typeAttributes: [
                'label',
                'symbol',
                'pillStyle'
            ]
        },
        agendaActivityType: {
            template: activityTypeCell,
            standardCellLayout: true,
            typeAttributes: [
                'label',
                'iconName',
                'pillStyle',
                'iconStyle'
            ]
        }
    };
}
