import LightningDatatable from 'lightning/datatable';
import monthCell from './monthCell.html';
import nextDateCell from './nextDateCell.html';
import progressCell from './progressCell.html';
import statusCell from './statusCell.html';

export default class VisitLogDatatable extends LightningDatatable {
    static customTypes = {
        visitMonth: {
            template: monthCell,
            standardCellLayout: true,
            typeAttributes: ['events']
        },
        visitNextDate: {
            template: nextDateCell,
            standardCellLayout: true,
            typeAttributes: ['label', 'textStyle']
        },
        visitProgress: {
            template: progressCell,
            standardCellLayout: true,
            typeAttributes: ['label', 'progressStyle']
        },
        visitStatus: {
            template: statusCell,
            standardCellLayout: true,
            typeAttributes: ['label', 'pillStyle']
        }
    };
}
