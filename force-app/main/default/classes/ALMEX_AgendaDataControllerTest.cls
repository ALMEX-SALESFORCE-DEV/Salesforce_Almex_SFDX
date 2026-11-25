/**
 * Clase de pruebas del controlador principal del proyecto de Agendas.
 *
 * OBJETIVO:
 * Simular los flujos que ejecuta el LWC contra ALMEX_AgendaDataController y
 * comprobar que las actividades se guardan, consultan y cambian de estatus
 * correctamente.
 *
 * AISLAMIENTO:
 * SeeAllData=false impide que la prueba dependa de información real del
 * sandbox o de producción. Todos los registros utilizados se crean dentro de
 * esta clase y Salesforce revierte automáticamente esos datos al terminar.
 */
@IsTest(SeeAllData=false)
private class ALMEX_AgendaDataControllerTest {

    // =====================================================================
    // 1. DATOS BASE COMPARTIDOS POR TODAS LAS PRUEBAS
    // =====================================================================

    /**
     * @TestSetup se ejecuta antes de cada método de prueba.
     *
     * Crea:
     * - Un Prospecto propiedad del usuario que ejecuta la prueba.
     * - Una Sucursal propiedad del mismo usuario, con frecuencia anual.
     *
     * El correo y teléfono permiten cumplir las reglas de validación que el
     * objeto Prospecto tiene configuradas actualmente en Salesforce.
     */
    @TestSetup
    static void createTestData() {
        LeadStatus openStatus = [
            SELECT MasterLabel
            FROM LeadStatus
            WHERE IsConverted = false
            ORDER BY SortOrder
            LIMIT 1
        ];

        insert new Lead(
            FirstName = 'Prospecto',
            LastName = 'Prueba Agenda',
            Company = 'ALMEX Test',
            Status = openStatus.MasterLabel,
            Email = 'prospecto.agenda@example.com',
            Phone = '3330000000'
        );

        // El Flow corporativo asigna la sucursal al propietario de su Cuenta.
        Account testAccount = new Account(Name = 'Cuenta Prueba Agenda',
            OwnerId = UserInfo.getUserId());
        insert as system testAccount;

        // Solo la fábrica de datos usa modo sistema: los perfiles de Agendas
        // necesitan leer la frecuencia, no editar sucursales de la empresa.
        insert as system new Sucursal__c(
            Name = 'Sucursal Prueba Agenda',
            Cuenta__c = testAccount.Id,
            Frecuencia_visitas__c = '4'
        );
    }

    // =====================================================================
    // 2. FLUJO PRINCIPAL: PROSPECTO, EDICIÓN Y FINALIZACIÓN
    // =====================================================================

    /**
     * Comprueba el ciclo principal de una actividad relacionada con Prospecto:
     * crearla, actualizar sus notas, completarla y volver a consultarla.
     *
     * También valida la normalización del estado "JA" a "Jalisco", el cierre
     * del seguimiento y la aparición del registro en el calendario mensual.
     */
    @IsTest
    static void createsUpdatesCompletesAndReadsProspectActivity() {
        Lead prospect = [
            SELECT Id, Name
            FROM Lead
            WHERE Company = 'ALMEX Test'
            LIMIT 1
        ];
        Date activityDate = Date.today().addDays(5);

        // Reinicia los límites de ejecución para medir únicamente el código
        // productivo invocado dentro de este bloque.
        Test.startTest();
        Id activityId = ALMEX_AgendaDataController.createActivity(
            'Visita al prospecto',
            'Visita',
            activityDate,
            'JA',
            'Guadalajara',
            prospect.Id,
            null,
            true,
            'Notas iniciales',
            false,
            null,
            null, null
        );

        ALMEX_AgendaDataController.updateActivityDetails(
            activityId,
            true,
            'Notas actualizadas',
            null
        );
        ALMEX_AgendaDataController.completeActivity(
            activityId,
            'Los pendientes quedaron resueltos.'
        );
        Actividad_de_Agenda__c detail =
            ALMEX_AgendaDataController.getActivityDetail(activityId);
        List<Actividad_de_Agenda__c> monthActivities =
            ALMEX_AgendaDataController.getCurrentUserActivities(activityDate);
        User sessionUser = ALMEX_AgendaDataController.getCurrentUser();
        List<Lead> prospects =
            ALMEX_AgendaDataController.searchCurrentUserProspects('Prospecto Prueba');
        Test.stopTest();

        System.assertEquals('Visita al prospecto', detail.Titulo__c);
        System.assertEquals('Visita', detail.Tipo_de_actividad__c);
        System.assertEquals(activityDate, detail.Fecha__c);
        System.assertEquals('Jalisco', detail.Estado__c);
        System.assertEquals('Guadalajara', detail.Ciudad__c);
        System.assertEquals(prospect.Name, detail.Prospecto__c);
        System.assertEquals(null, detail.Sucursal__c);
        System.assertEquals('Notas actualizadas', detail.Notas__c);
        System.assertEquals(false, detail.Seguimiento__c);
        System.assertEquals('Completada', detail.Estatus__c);
        System.assertEquals(
            'Los pendientes quedaron resueltos.',
            detail.Justificacion__c
        );
        System.assertEquals(false, detail.Cuenta_para_frecuencia__c);
        System.assertEquals(UserInfo.getUserId(), sessionUser.Id);
        System.assertEquals(1, prospects.size());
        System.assertEquals(true, containsActivity(monthActivities, activityId));
    }

    /**
     * Permite programar una actividad para un prospecto aún no dado de alta
     * como Lead. El nombre manual se conserva en Prospecto__c sin crear ni
     * modificar registros del objeto Lead.
     */
    @IsTest
    static void createsManualProspectActivity() {
        Date activityDate = Date.today().addDays(6);

        Test.startTest();
        Id activityId = ALMEX_AgendaDataController.createActivity(
            'Visita a prospecto por registrar',
            'Visita',
            activityDate,
            'NL',
            'Monterrey',
            null,
            null,
            false,
            'Primer acercamiento comercial.',
            false,
            null,
            'Prospecto manual de prueba', null
        );
        Test.stopTest();

        Actividad_de_Agenda__c stored = [
            SELECT Prospecto__c, Sucursal__c, Estado__c, Ciudad__c
            FROM Actividad_de_Agenda__c
            WHERE Id = :activityId
        ];

        System.assertEquals('Prospecto manual de prueba', stored.Prospecto__c);
        System.assertEquals(null, stored.Sucursal__c);
        System.assertEquals('Nuevo León', stored.Estado__c);
        System.assertEquals('Monterrey', stored.Ciudad__c);
    }

    // =====================================================================
    // 3. FLUJO CON SUCURSAL Y GENERACIÓN DE LA BITÁCORA
    // =====================================================================

    /**
     * Crea una visita relacionada con Sucursal y verifica que:
     * - Quede asignada al ejecutivo de la sesión.
     * - Inicie con estatus Programada.
     * - Cuente para el cálculo de frecuencia.
     * - Aparezca en la respuesta utilizada por la Bitácora de visitas.
     */
    @IsTest
    static void createsBranchVisitAndBuildsVisitLog() {
        Sucursal__c branch = [
            SELECT Id, Name
            FROM Sucursal__c
            WHERE Name = 'Sucursal Prueba Agenda'
            LIMIT 1
        ];
        Date activityDate = Date.today().addDays(10);

        Test.startTest();
        Id activityId = ALMEX_AgendaDataController.createActivity(
            'Visita a sucursal',
            'Visita',
            activityDate,
            null,
            null,
            null,
            branch.Id,
            false,
            'Validar inventario',
            true,
            null,
            null, null
        );
        ALMEX_AgendaDataController.VisitLogResponse visitLog =
            ALMEX_AgendaDataController.getCurrentUserVisitLog();
        List<Sucursal__c> assignedBranches =
            ALMEX_AgendaDataController.getCurrentUserBranches();
        Test.stopTest();

        Actividad_de_Agenda__c stored = [
            SELECT Sucursal__c, Ejecutivo__c, Estatus__c,
                Cuenta_para_frecuencia__c, Notas__c
            FROM Actividad_de_Agenda__c
            WHERE Id = :activityId
        ];

        System.assertEquals(branch.Id, stored.Sucursal__c);
        System.assertEquals(UserInfo.getName(), stored.Ejecutivo__c);
        System.assertEquals('Programada', stored.Estatus__c);
        System.assertEquals(true, stored.Cuenta_para_frecuencia__c);
        System.assertEquals('Validar inventario', stored.Notas__c);
        System.assertEquals(Date.today().year(), visitLog.year);
        System.assertEquals(Date.today(), visitLog.today);
        System.assertEquals(1, visitLog.branches.size());
        System.assertEquals(branch.Id, visitLog.branches[0].branchId);
        System.assertEquals(1, visitLog.branches[0].activities.size());
        System.assertEquals(
            activityId,
            visitLog.branches[0].activities[0].activityId
        );
        System.assertEquals(
            true,
            visitLog.branches[0].activities[0].countsTowardFrequency
        );
        System.assertEquals(1, assignedBranches.size());
    }

    /**
     * Verifica los 16 campos personalizados contra las respuestas reales del
     * controlador. La edición y la reprogramación deben conservar el cliente,
     * la sucursal y la justificación de excepción, además de sus demás datos.
     */
    @IsTest
    static void preservesEveryBranchFieldAcrossReadsEditsAndRescheduling() {
        Sucursal__c branch = [
            SELECT Id, Cuenta__c
            FROM Sucursal__c
            WHERE Name = 'Sucursal Prueba Agenda'
            LIMIT 1
        ];
        Date activityDate = Date.today();
        Date replacementDate = activityDate.addDays(1);

        Test.startTest();
        Id activityId = ALMEX_AgendaDataController.createActivity(
            '  Llamada de auditoría  ', 'Llamada', activityDate,
            'NL', 'Monterrey', null, branch.Id, true,
            '  Confirmar entrega  ', true,
            '  El cliente solicita sustituir la visita  ', null, branch.Cuenta__c
        );
        Actividad_de_Agenda__c created =
            ALMEX_AgendaDataController.getActivityDetail(activityId);
        Map<Id, Actividad_de_Agenda__c> calendarRecords =
            new Map<Id, Actividad_de_Agenda__c>(
                ALMEX_AgendaDataController.getCurrentUserActivities(activityDate)
            );

        ALMEX_AgendaDataController.updateActivityDetails(
            activityId, false, '  Entrega confirmada  ',
            '  El cliente confirma la atención telefónica  '
        );
        Actividad_de_Agenda__c edited =
            ALMEX_AgendaDataController.getActivityDetail(activityId);
        Id replacementId = ALMEX_AgendaDataController.rescheduleActivity(
            activityId, replacementDate, '  Cambio solicitado por el cliente  '
        );
        Actividad_de_Agenda__c original =
            ALMEX_AgendaDataController.getActivityDetail(activityId);
        Actividad_de_Agenda__c replacement =
            ALMEX_AgendaDataController.getActivityDetail(replacementId);
        Test.stopTest();

        Map<String, Object> expected = new Map<String, Object>{
            'Titulo__c' => 'Llamada de auditoría',
            'Tipo_de_actividad__c' => 'Llamada',
            'Ejecutivo__c' => UserInfo.getName(),
            'Fecha__c' => activityDate,
            // La sucursal de prueba no tiene dirección: no se debe guardar
            // en su lugar la ubicación que haya enviado el formulario.
            'Estado__c' => null,
            'Ciudad__c' => null,
            'Prospecto__c' => null,
            'Cliente__c' => branch.Cuenta__c,
            'Sucursal__c' => branch.Id,
            'Seguimiento__c' => true,
            'Notas__c' => 'Confirmar entrega',
            'Cuenta_para_frecuencia__c' => true,
            'Justificacion_de_excepcion__c' => 'El cliente solicita sustituir la visita',
            'Estatus__c' => 'Programada',
            'Justificacion__c' => null,
            'Actividad_Original__c' => null
        };
        System.assertEquals(activityId, created.Id);
        System.assert(!String.isBlank(created.Name), 'La actividad debe tener folio.');
        assertActivityFieldValues(created, expected, 'Detalle al crear');
        assertActivityFieldValues(calendarRecords.get(activityId), expected, 'Calendario');

        expected.put('Seguimiento__c', false);
        expected.put('Notas__c', 'Entrega confirmada');
        expected.put('Justificacion_de_excepcion__c', 'El cliente confirma la atención telefónica');
        assertActivityFieldValues(edited, expected, 'Detalle después de editar');

        expected.put('Estatus__c', 'Reagendada');
        expected.put('Justificacion__c', 'Cambio solicitado por el cliente');
        assertActivityFieldValues(original, expected, 'Registro histórico');

        expected.put('Fecha__c', replacementDate);
        expected.put('Estatus__c', 'Programada');
        expected.put('Justificacion__c', null);
        expected.put('Actividad_Original__c', activityId);
        System.assertNotEquals(activityId, replacementId);
        assertActivityFieldValues(replacement, expected, 'Actividad reprogramada');
    }

    /**
     * Comprueba los valores de prospecto y ubicación, la resolución del
     * seguimiento y su recuperación desde el calendario después del cierre.
     */
    @IsTest
    static void preservesProspectFieldsAndFollowUpResolutionInCalendar() {
        Date activityDate = Date.today();

        Test.startTest();
        Id activityId = ALMEX_AgendaDataController.createActivity(
            '  Seguimiento al prospecto  ', 'Visita', activityDate,
            'JA', '  Guadalajara  ', null, null, true,
            '  Enviar propuesta comercial  ', true, null,
            '  Prospecto auditoría de campos  ', null
        );
        Actividad_de_Agenda__c created =
            ALMEX_AgendaDataController.getActivityDetail(activityId);
        ALMEX_AgendaDataController.completeActivity(
            activityId, '  Propuesta enviada y recibida  '
        );
        Actividad_de_Agenda__c completed =
            ALMEX_AgendaDataController.getActivityDetail(activityId);
        Map<Id, Actividad_de_Agenda__c> calendarRecords =
            new Map<Id, Actividad_de_Agenda__c>(
                ALMEX_AgendaDataController.getCurrentUserActivities(activityDate)
            );
        Test.stopTest();

        Map<String, Object> expected = new Map<String, Object>{
            'Titulo__c' => 'Seguimiento al prospecto',
            'Tipo_de_actividad__c' => 'Visita',
            'Ejecutivo__c' => UserInfo.getName(),
            'Fecha__c' => activityDate,
            'Estado__c' => 'Jalisco',
            'Ciudad__c' => 'Guadalajara',
            'Prospecto__c' => 'Prospecto auditoría de campos',
            'Cliente__c' => null,
            'Sucursal__c' => null,
            'Seguimiento__c' => true,
            'Notas__c' => 'Enviar propuesta comercial',
            'Cuenta_para_frecuencia__c' => false,
            'Justificacion_de_excepcion__c' => null,
            'Estatus__c' => 'Programada',
            'Justificacion__c' => null,
            'Actividad_Original__c' => null
        };
        assertActivityFieldValues(created, expected, 'Prospecto al crear');

        expected.put('Seguimiento__c', false);
        expected.put('Estatus__c', 'Completada');
        expected.put('Justificacion__c', 'Propuesta enviada y recibida');
        assertActivityFieldValues(completed, expected, 'Prospecto completado');
        assertActivityFieldValues(calendarRecords.get(activityId), expected, 'Prospecto en calendario');
    }

    /**
     * La bandera de frecuencia debe cambiar el resultado de la bitácora:
     * dos llamadas a la misma sucursal no necesariamente cuentan igual.
     */
    @IsTest
    static void frequencyFlagChangesCallContributionToVisitLog() {
        Sucursal__c branch = [
            SELECT Id, Cuenta__c
            FROM Sucursal__c
            WHERE Name = 'Sucursal Prueba Agenda'
            LIMIT 1
        ];

        Test.startTest();
        Id countedId = ALMEX_AgendaDataController.createActivity(
            'Llamada que sustituye visita', 'Llamada', Date.today(),
            null, null, null, branch.Id, false, null, true,
            'Atención telefónica acordada con el cliente', null, branch.Cuenta__c
        );
        Id ordinaryId = ALMEX_AgendaDataController.createActivity(
            'Llamada ordinaria', 'Llamada', Date.today(),
            null, null, null, branch.Id, false, null, false,
            null, null, branch.Cuenta__c
        );
        ALMEX_AgendaDataController.VisitLogResponse visitLog =
            ALMEX_AgendaDataController.getCurrentUserVisitLog();
        Test.stopTest();

        Map<Id, ALMEX_AgendaDataController.VisitActivity> activitiesById =
            new Map<Id, ALMEX_AgendaDataController.VisitActivity>();
        for (ALMEX_AgendaDataController.VisitBranch visitBranch : visitLog.branches) {
            for (ALMEX_AgendaDataController.VisitActivity activity : visitBranch.activities) {
                activitiesById.put(activity.activityId, activity);
            }
        }
        System.assertEquals(2, activitiesById.size());
        System.assertEquals(true, activitiesById.get(countedId).countsTowardFrequency);
        System.assertEquals(false, activitiesById.get(ordinaryId).countsTowardFrequency);
    }

    // =====================================================================
    // 4. CAMBIOS DE ESTATUS: CANCELACIÓN Y REAGENDAMIENTO
    // =====================================================================

    /**
     * Los nuevos nombres conservan la semántica anterior. Los alias permiten
     * consultar registros históricos sin migrarlos y las visitas urgentes
     * nunca cuentan para frecuencia, incluso si el cliente envía true.
     */
    @IsTest
    static void supportsRenamedActivityTypesAndLegacyRecords() {
        System.assertEquals('Reunión Teams',
            ALMEX_AgendaDataController.normalizeActivityType('Reunión'));
        System.assertEquals('Visitas urgentes',
            ALMEX_AgendaDataController.normalizeActivityType('Visita extraordinaria'));
        System.assert(ALMEX_AgendaDataController.getActivityTypeFilterValues(
            'Reunión Teams').contains('Reunión'));
        System.assert(ALMEX_AgendaDataController.getActivityTypeFilterValues(
            'Visitas urgentes').contains('Visita extraordinaria'));

        Sucursal__c branch = [SELECT Id FROM Sucursal__c
            WHERE Name = 'Sucursal Prueba Agenda' LIMIT 1];
        Actividad_de_Agenda__c legacy = buildActivity(
            'Urgencia histórica', Date.today(), branch.Id, null);
        legacy.Tipo_de_actividad__c = 'Visita extraordinaria';
        legacy.Cuenta_para_frecuencia__c = true;
        insert legacy;

        Test.startTest();
        Id urgentId = ALMEX_AgendaDataController.createActivity(
            'Visita urgente', 'Visitas urgentes', Date.today(), 'Jalisco',
            'Guadalajara', null, branch.Id, false, 'Urgencia del cliente',
            true, 'Solicitud urgente del cliente', null, null);
        Id meetingId = ALMEX_AgendaDataController.createActivity(
            'Reunión virtual', 'Reunión', Date.today(), 'Jalisco',
            'Guadalajara', null, branch.Id, false, null, false, null, null, null);
        ALMEX_AgendaDataController.VisitLogResponse visitLog =
            ALMEX_AgendaDataController.getCurrentUserVisitLog();
        if (ALMEX_AgendaDataController.canViewActivityBreakdown()) {
            ALMEX_AgendaDataController.ManagementActivityPage urgentPage =
                ALMEX_AgendaDataController.getManagementActivities(
                    Date.today(), Date.today(), null, new List<String>{'Visitas urgentes'},
                    null, branch.Id, null, null, null, null, null, null, 50, null);
            System.assertEquals(2, urgentPage.totalRecords,
                'El filtro nuevo debe recuperar también el registro histórico.');
        }
        Test.stopTest();

        Map<Id, Actividad_de_Agenda__c> stored = new Map<Id, Actividad_de_Agenda__c>([
            SELECT Id, Tipo_de_actividad__c, Cuenta_para_frecuencia__c
            FROM Actividad_de_Agenda__c WHERE Id IN :new Set<Id>{urgentId, meetingId}
        ]);
        System.assertEquals('Visitas urgentes', stored.get(urgentId).Tipo_de_actividad__c);
        System.assertEquals(false, stored.get(urgentId).Cuenta_para_frecuencia__c);
        System.assertEquals('Reunión Teams', stored.get(meetingId).Tipo_de_actividad__c);
        System.assertEquals(2, visitLog.branches[0].activities.size());
        for (ALMEX_AgendaDataController.VisitActivity activity : visitLog.branches[0].activities) {
            System.assertEquals('Visitas urgentes', activity.activityType);
            System.assertEquals(false, activity.countsTowardFrequency);
        }
    }

    /**
     * Comprueba dos operaciones independientes:
     *
     * CANCELAR:
     * Conserva el registro original, cambia su estatus y guarda el motivo.
     *
     * REAGENDAR:
     * Marca la actividad original como Reagendada y crea una nueva actividad
     * Programada, enlazada mediante Actividad_Original__c.
     */
    @IsTest
    static void cancelsAndReschedulesActivities() {
        Actividad_de_Agenda__c toCancel = insertScheduledActivity(
            'Actividad para cancelar',
            Date.today().addDays(2)
        );
        Actividad_de_Agenda__c toReschedule = insertScheduledActivity(
            'Actividad para reagendar',
            Date.today().addDays(3)
        );
        Date newDate = Date.today().addDays(15);

        Test.startTest();
        ALMEX_AgendaDataController.cancelActivity(
            toCancel.Id,
            'El cliente solicitó cancelar.'
        );
        Id newActivityId = ALMEX_AgendaDataController.rescheduleActivity(
            toReschedule.Id,
            newDate,
            'El cliente solicitó otra fecha.'
        );
        Test.stopTest();

        Map<Id, Actividad_de_Agenda__c> recordsById =
            new Map<Id, Actividad_de_Agenda__c>([
                SELECT Id, Estatus__c, Fecha__c, Justificacion__c,
                    Actividad_Original__c
                FROM Actividad_de_Agenda__c
                WHERE Id IN :new Set<Id>{
                    toCancel.Id,
                    toReschedule.Id,
                    newActivityId
                }
            ]);

        System.assertEquals(
            'Cancelada',
            recordsById.get(toCancel.Id).Estatus__c
        );
        System.assertEquals(
            'El cliente solicitó cancelar.',
            recordsById.get(toCancel.Id).Justificacion__c
        );
        System.assertEquals(
            'Reagendada',
            recordsById.get(toReschedule.Id).Estatus__c
        );
        System.assertEquals(
            'Programada',
            recordsById.get(newActivityId).Estatus__c
        );
        System.assertEquals(newDate, recordsById.get(newActivityId).Fecha__c);
        System.assertEquals(
            toReschedule.Id,
            recordsById.get(newActivityId).Actividad_Original__c
        );
    }

    /**
     * La original reagendada se conserva de solo lectura; las notas y el
     * seguimiento se actualizan únicamente en la actividad nueva programada.
     */
    @IsTest
    static void editsReplacementWithoutChangingHistoricalOriginal() {
        Actividad_de_Agenda__c original = insertScheduledActivity(
            'Seguimiento reagendado', Date.today().addDays(2)
        );
        Date replacementDate = Date.today().addDays(12);

        Test.startTest();
        Id replacementId = ALMEX_AgendaDataController.rescheduleActivity(
            original.Id, replacementDate, 'Cambio de fecha solicitado.'
        );
        assertAuraException(new TestAction('UPDATE_CLOSED', null, null, original.Id));
        ALMEX_AgendaDataController.updateActivityDetails(
            replacementId, false, 'Se confirmó la nueva fecha.', null
        );
        Test.stopTest();

        Map<Id, Actividad_de_Agenda__c> records = new Map<Id, Actividad_de_Agenda__c>([
            SELECT Estatus__c, Fecha__c, Notas__c, Seguimiento__c, Actividad_Original__c
            FROM Actividad_de_Agenda__c
            WHERE Id IN :new Set<Id>{original.Id, replacementId}
        ]);
        System.assertEquals('Reagendada', records.get(original.Id).Estatus__c);
        System.assertEquals(true, records.get(original.Id).Seguimiento__c);
        System.assertEquals('Registro de prueba', records.get(original.Id).Notas__c);
        System.assertEquals('Programada', records.get(replacementId).Estatus__c);
        System.assertEquals(replacementDate, records.get(replacementId).Fecha__c);
        System.assertEquals(original.Id, records.get(replacementId).Actividad_Original__c);
        System.assertEquals(false, records.get(replacementId).Seguimiento__c);
        System.assertEquals('Se confirmó la nueva fecha.', records.get(replacementId).Notas__c);
    }

    /**
     * Una segunda reagendación se hace sobre la nueva Programada. Se conserva
     * toda la cadena histórica y únicamente se completa la actividad vigente.
     */
    @IsTest
    static void managesCurrentReplacementAndPreservesHistory() {
        Actividad_de_Agenda__c original = insertScheduledActivity(
            'Visita con cambios de fecha', Date.today().addDays(2)
        );
        Date finalDate = Date.today().addDays(14);

        Test.startTest();
        Id replacementId = ALMEX_AgendaDataController.rescheduleActivity(
            original.Id, Date.today().addDays(7), 'Primer cambio de fecha.'
        );
        Id currentId = ALMEX_AgendaDataController.rescheduleActivity(
            replacementId, finalDate, 'Segundo cambio de fecha.'
        );
        assertAuraException(new TestAction('COMPLETE_WITHOUT_RESOLUTION', null, null, currentId));
        ALMEX_AgendaDataController.completeActivity(currentId, 'Pendientes resueltos.');
        Test.stopTest();

        Set<Id> recordIds = new Set<Id>{original.Id, replacementId, currentId};
        Map<Id, Actividad_de_Agenda__c> stored = new Map<Id, Actividad_de_Agenda__c>([
            SELECT Estatus__c, Justificacion__c, Seguimiento__c, Fecha__c, Actividad_Original__c
            FROM Actividad_de_Agenda__c WHERE Id IN :recordIds
        ]);
        System.assertEquals('Reagendada', stored.get(original.Id).Estatus__c);
        System.assertEquals('Reagendada', stored.get(replacementId).Estatus__c);
        System.assertEquals(original.Id, stored.get(replacementId).Actividad_Original__c);
        System.assertEquals('Completada', stored.get(currentId).Estatus__c);
        System.assertEquals(false, stored.get(currentId).Seguimiento__c);
        System.assertEquals('Pendientes resueltos.', stored.get(currentId).Justificacion__c);
        System.assertEquals(finalDate, stored.get(currentId).Fecha__c);
        System.assertEquals(replacementId, stored.get(currentId).Actividad_Original__c);
    }

    /** Los estados finales e históricos están protegidos también al invocar Apex directamente. */
    @IsTest
    static void rejectsActionsOnClosedAndRescheduledActivities() {
        List<Actividad_de_Agenda__c> closedActivities = new List<Actividad_de_Agenda__c>();
        for (String status : new List<String>{'Completada', 'Cancelada', 'Reagendada'}) {
            Actividad_de_Agenda__c activity = buildActivity(
                status, Date.today().addDays(2), null, 'Prospecto Prueba Agenda'
            );
            activity.Estatus__c = status;
            closedActivities.add(activity);
        }
        insert closedActivities;

        Test.startTest();
        for (Actividad_de_Agenda__c activity : closedActivities) {
            assertAuraException(new TestAction('COMPLETE_WITHOUT_RESOLUTION', null, null, activity.Id));
            assertAuraException(new TestAction('CANCEL_CLOSED', null, null, activity.Id));
            assertAuraException(new TestAction('RESCHEDULE_CLOSED', null, null, activity.Id));
            assertAuraException(new TestAction('UPDATE_CLOSED', null, null, activity.Id));
        }
        Test.stopTest();
    }

    // =====================================================================
    // 5. DESGLOSE ADMINISTRATIVO Y BÚSQUEDAS ASÍNCRONAS
    // =====================================================================

    /**
     * Confirma qué perfiles pueden abrir el Desglose de actividades.
     * El acceso depende del Id y permisos del perfil, nunca de su etiqueta.
     */
    @IsTest
    static void recognizesProfilesWithManagementAccess() {
        for (String label : new List<String>{
            'Administrador del sistema', 'System Administrator', 'Administrador renombrado'
        }) {
            User admin = new User(Profile = new Profile(Name = label, PermissionsModifyAllData = true));
            System.assertEquals(true, ALMEX_AgendaDataController.hasManagementAccess(admin));
        }
        User manager = createBranchAccessTestUser(true, 'etiqueta');
        manager.Profile = new Profile(
            Name = 'Dirección renombrada / Commercial Management', PermissionsModifyAllData = false);
        System.assertEquals(true, ALMEX_AgendaDataController.hasManagementAccess(manager));
        User seller = createBranchAccessTestUser(false, 'etiqueta');
        // Una etiqueta que imite a Gerencia no debe elevar al vendedor.
        seller.Profile = new Profile(Name = 'Gerencia y Dirección Comercial', PermissionsModifyAllData = false);
        System.assertEquals(false, ALMEX_AgendaDataController.hasManagementAccess(seller));
        System.assertEquals(false, ALMEX_AgendaDataController.hasManagementAccess(null));
        System.assertEquals(false, ALMEX_AgendaDataController.hasManagementAccess(new User()));
        System.assertEquals(false, ALMEX_AgendaDataController.hasManagementAccess(
            new User(Profile = new Profile(PermissionsModifyAllData = false))));
    }

    @IsTest
    static void managementRequiresExistingProfileCapabilities() {
        ObjectPermissions permissions = new ObjectPermissions(
            PermissionsRead = true, PermissionsCreate = true,
            PermissionsEdit = true, PermissionsViewAllRecords = true);
        System.assertEquals(true, ALMEX_AgendaDataController.grantsManagementAccess(permissions));
        for (String field : new List<String>{'PermissionsRead', 'PermissionsCreate',
            'PermissionsEdit', 'PermissionsViewAllRecords'}) {
            ObjectPermissions restricted = permissions.clone(false, false, false, false);
            restricted.put(field, false);
            System.assertEquals(false, ALMEX_AgendaDataController.grantsManagementAccess(restricted),
                'No debe elevar privilegios si falta ' + field);
        }
        System.assertEquals(false, ALMEX_AgendaDataController.grantsManagementAccess(null));
        System.assertEquals(false, ALMEX_AgendaDataController.grantsManagementAccess(new ObjectPermissions()));
    }

    @IsTest
    static void profileAccessLookupIsCachedAndFailsClosed() {
        User manager = createBranchAccessTestUser(true, 'cache');
        manager.Profile = new Profile(PermissionsModifyAllData = false);
        Integer beforeQueries = Limits.getQueries();
        System.assertEquals(true, ALMEX_AgendaDataController.hasManagementAccess(manager));
        System.assertEquals(true, ALMEX_AgendaDataController.hasManagementAccess(manager));
        System.assertEquals(beforeQueries + 1, Limits.getQueries(),
            'Consultar dos veces el mismo perfil no debe duplicar la consulta de permisos.');
        User unknown = new User(ProfileId = Id.valueOf('00e000000000001'),
            Profile = new Profile(PermissionsModifyAllData = false));
        System.assertEquals(false, ALMEX_AgendaDataController.hasManagementAccess(unknown),
            'Un perfil sin permisos de Agendas nunca debe recibir acceso gerencial.');
    }

    @IsTest
    static void managementCanListAndCreateActivityForAnotherUsersBranch() {
        Sucursal__c branch = [
            SELECT Id, OwnerId
            FROM Sucursal__c
            WHERE Name = 'Sucursal Prueba Agenda'
            LIMIT 1
        ];
        User manager = createBranchAccessTestUser(true, 'gerencia');
        insert manager;
        manager = [SELECT Id, Name FROM User WHERE Id = :manager.Id];

        System.assertNotEquals(manager.Id, branch.OwnerId);

        System.runAs(manager) {
            Test.startTest();
            List<Sucursal__c> availableBranches =
                ALMEX_AgendaDataController.getCurrentUserBranches();
            Id activityId = ALMEX_AgendaDataController.createActivity(
                'Visita de gerencia a sucursal de otro ejecutivo',
                'Visita', Date.today(), null, null, null, branch.Id,
                false, 'Prueba de acceso por perfil.', true, null, null, null
            );
            Test.stopTest();

            System.assertEquals(1, availableBranches.size(),
                'Gerencia debe poder elegir la sucursal aunque pertenezca a otro usuario.');
            System.assertEquals(branch.Id, availableBranches[0].Id);
            Actividad_de_Agenda__c created = [
                SELECT Sucursal__c, OwnerId, Ejecutivo__c
                FROM Actividad_de_Agenda__c
                WHERE Id = :activityId
            ];
            System.assertEquals(branch.Id, created.Sucursal__c);
            System.assertEquals(manager.Id, created.OwnerId,
                'La actividad debe seguir siendo del usuario que la registró.');
            System.assertEquals(manager.Name, created.Ejecutivo__c);
        }

        System.assertEquals(branch.OwnerId,
            [SELECT OwnerId FROM Sucursal__c WHERE Id = :branch.Id].OwnerId,
            'Registrar la actividad no debe reasignar la sucursal.');
    }

    @IsTest
    static void sellersRemainRestrictedToTheirAssignedBranches() {
        Sucursal__c foreignBranch = [
            SELECT Id
            FROM Sucursal__c
            WHERE Name = 'Sucursal Prueba Agenda'
            LIMIT 1
        ];
        User seller = createBranchAccessTestUser(false, 'vendedor');
        insert seller;

        System.runAs(seller) {
            Account ownAccount = new Account(Name = 'Cuenta propia del ejecutivo', OwnerId = seller.Id);
            insert as system ownAccount;
            Sucursal__c ownBranch = new Sucursal__c(
                Name = 'Sucursal propia del ejecutivo',
                Cuenta__c = ownAccount.Id,
                Frecuencia_visitas__c = '4'
            );
            insert as system ownBranch;

            Test.startTest();
            List<Sucursal__c> availableBranches =
                ALMEX_AgendaDataController.getCurrentUserBranches();
            System.assertEquals(1, availableBranches.size());
            System.assertEquals(ownBranch.Id, availableBranches[0].Id,
                'El ejecutivo solo debe ver sus sucursales asignadas.');

            Boolean rejectedForeignBranch = false;
            try {
                ALMEX_AgendaDataController.createActivity(
                    'Intento de visitar sucursal ajena', 'Visita', Date.today(),
                    null, null, null, foreignBranch.Id, false, null, true, null, null, null
                );
            } catch (AuraHandledException expectedException) {
                rejectedForeignBranch = true;
            }
            System.assertEquals(true, rejectedForeignBranch,
                'Tampoco debe poder saltarse el filtro enviando un Id ajeno a Apex.');

            Id activityId = ALMEX_AgendaDataController.createActivity(
                'Visita a sucursal propia', 'Visita', Date.today(),
                null, null, null, ownBranch.Id, false, null, true, null, null, null
            );
            Test.stopTest();
            System.assertNotEquals(null, activityId);
        }
    }

    @IsTest
    static void createsClientOnlyActivityAndPreservesClientWhenRescheduled() {
        Account client = new Account(Name = 'Cliente sin sucursales Agenda', OwnerId = UserInfo.getUserId());
        insert as system client;

        Test.startTest();
        System.assertEquals(client.Id,
            ALMEX_AgendaDataController.searchActivityClients('Cliente sin sucursales')[0].Id);
        System.assertEquals(0, ALMEX_AgendaDataController.searchActivityClients('C').size());
        System.assertEquals(0, ALMEX_AgendaDataController.getActivityClientBranches(client.Id).size());
        System.assertEquals(0, ALMEX_AgendaDataController.getActivityClientBranches(null).size());

        Id activityId = ALMEX_AgendaDataController.createActivity(
            'Comida de trabajo con el cliente', 'Visita', Date.today(),
            'JA', 'Guadalajara', null, null, false, 'Revisión comercial.', true, null, null, client.Id
        );
        Actividad_de_Agenda__c detail = ALMEX_AgendaDataController.getActivityDetail(activityId);
        Id replacementId = ALMEX_AgendaDataController.rescheduleActivity(
            activityId, Date.today().addDays(2), 'Cambio solicitado por el cliente.'
        );
        Actividad_de_Agenda__c replacement = ALMEX_AgendaDataController.getActivityDetail(replacementId);
        Test.stopTest();

        System.assertEquals(client.Id, detail.Cliente__c);
        System.assertEquals(client.Name, detail.Cliente__r.Name);
        System.assertEquals(null, detail.Sucursal__c);
        System.assertEquals(false, detail.Cuenta_para_frecuencia__c,
            'Una actividad sin sucursal no debe descontar su frecuencia anual.');
        System.assertEquals('Jalisco', detail.Estado__c);
        System.assertEquals(client.Id, replacement.Cliente__c);
        System.assertEquals(null, replacement.Sucursal__c);
        System.assertEquals(activityId, replacement.Actividad_Original__c);
    }

    @IsTest
    static void preservesManualBranchInNotesWithoutNewFields() {
        Account client = new Account(Name = 'Cliente sucursal libre Agenda', OwnerId = UserInfo.getUserId());
        insert as system client;
        String header = 'Sucursal (captura manual): Oficina regional';
        Test.startTest();
        Id activityId = ALMEX_AgendaDataController.createActivity(
            'Visita a oficina', 'Visita', Date.today(), 'JA', 'Guadalajara',
            null, null, false, header + '\n\nNotas originales.', true, null, null, client.Id
        );
        ALMEX_AgendaDataController.updateActivityDetails(activityId, false, 'Notas actualizadas.', null);
        Actividad_de_Agenda__c edited = ALMEX_AgendaDataController.getActivityDetail(activityId);
        System.assertEquals(header + '\n\nNotas actualizadas.', edited.Notas__c);
        ALMEX_AgendaDataController.updateActivityDetails(activityId, false, null, null);
        System.assertEquals(header, ALMEX_AgendaDataController.getActivityDetail(activityId).Notas__c);
        Id replacementId = ALMEX_AgendaDataController.rescheduleActivity(
            activityId, Date.today().addDays(1), 'Cambio solicitado.'
        );
        Actividad_de_Agenda__c replacement = ALMEX_AgendaDataController.getActivityDetail(replacementId);
        Test.stopTest();
        System.assertEquals(header, replacement.Notas__c);
        System.assertEquals(client.Id, replacement.Cliente__c);
        System.assertEquals(null, replacement.Sucursal__c);
        System.assertEquals(false, replacement.Cuenta_para_frecuencia__c);
    }

    @IsTest
    static void storesClientAndRejectsBranchesFromAnotherAccount() {
        Sucursal__c branch = [SELECT Id, Cuenta__c FROM Sucursal__c
            WHERE Name = 'Sucursal Prueba Agenda' LIMIT 1];
        Account anotherClient = new Account(Name = 'Cuenta incompatible Agenda', OwnerId = UserInfo.getUserId());
        insert as system anotherClient;

        Test.startTest();
        System.assertEquals(branch.Id,
            ALMEX_AgendaDataController.getActivityClientBranches(branch.Cuenta__c)[0].Id);
        Id activityId = ALMEX_AgendaDataController.createActivity(
            'Visita con cliente y sucursal', 'Visita', Date.today(), null, null,
            null, branch.Id, false, null, false, null, null, branch.Cuenta__c
        );
        Actividad_de_Agenda__c detail = ALMEX_AgendaDataController.getActivityDetail(activityId);
        Boolean rejectedMismatch = false;
        try {
            ALMEX_AgendaDataController.createActivity(
                'Sucursal de otro cliente', 'Visita', Date.today(), null, null,
                null, branch.Id, false, null, false, null, null, anotherClient.Id
            );
        } catch (AuraHandledException expectedException) {
            rejectedMismatch = true;
        }
        Boolean rejectedMixedTarget = false;
        try {
            ALMEX_AgendaDataController.createActivity(
                'Cliente y prospecto', 'Visita', Date.today(), null, null,
                null, null, false, null, false, null, 'Prospecto manual', anotherClient.Id
            );
        } catch (AuraHandledException expectedException) {
            rejectedMixedTarget = true;
        }
        Test.stopTest();

        System.assertEquals(branch.Cuenta__c, detail.Cliente__c);
        System.assertEquals(branch.Id, detail.Sucursal__c);
        System.assertEquals(true, detail.Cuenta_para_frecuencia__c);
        System.assertEquals(true, rejectedMismatch);
        System.assertEquals(true, rejectedMixedTarget);
    }

    @IsTest
    static void sellersCannotSelectUnassignedClients() {
        Account foreignClient = [SELECT Id FROM Account WHERE Name = 'Cuenta Prueba Agenda' LIMIT 1];
        User seller = createBranchAccessTestUser(false, 'vendedor');
        insert seller;
        System.runAs(seller) {
            Account ownClient = new Account(Name = 'Cuenta propia sin sucursal', OwnerId = seller.Id);
            insert as system ownClient;
            Test.startTest();
            System.assertEquals(0, ALMEX_AgendaDataController.searchActivityClients('Cuenta Prueba Agenda').size());
            System.assertEquals(ownClient.Id,
                ALMEX_AgendaDataController.searchActivityClients('Cuenta propia sin sucursal')[0].Id);
            Boolean rejectedForeignClient = false;
            try {
                ALMEX_AgendaDataController.createActivity(
                    'Cuenta ajena', 'Reunión Teams', Date.today(), null, null,
                    null, null, false, null, false, null, null, foreignClient.Id
                );
            } catch (AuraHandledException expectedException) {
                rejectedForeignClient = true;
            }
            System.assertEquals(true, rejectedForeignClient);
            Id ownActivity = ALMEX_AgendaDataController.createActivity(
                'Reunión con cliente propio', 'Reunión Teams', Date.today(), null, null,
                null, null, false, null, false, null, null, ownClient.Id
            );
            Test.stopTest();
            System.assertNotEquals(null, ownActivity);
        }
    }

    @IsTest
    static void managementUsesStoredClientIncludingActivitiesWithoutBranch() {
        User manager = createBranchAccessTestUser(true, 'clihist');
        insert manager;

        // La consulta gerencial no debe depender del perfil de quien lanza la suite.
        System.runAs(manager) {
            Sucursal__c branch = [SELECT Id, Cuenta__c FROM Sucursal__c
                WHERE Name = 'Sucursal Prueba Agenda' LIMIT 1];
            Id originalClientId = branch.Cuenta__c;
            Account anotherClient = new Account(Name = 'Cuenta reasignada Agenda', OwnerId = UserInfo.getUserId());
            insert as system anotherClient;
            Id activityId = ALMEX_AgendaDataController.createActivity(
                'Visita con cuenta histórica', 'Visita', Date.today(), null, null,
                null, branch.Id, false, null, false, null, null, originalClientId
            );
            Id withoutBranchId = ALMEX_AgendaDataController.createActivity(
                'Comida sin sucursal', 'Otro', Date.today(), null, null,
                null, null, false, null, false, null, null, originalClientId
            );
            branch.Cuenta__c = anotherClient.Id;
            update as system branch;

            Test.startTest();
            System.assertEquals(true, ALMEX_AgendaDataController.canViewActivityBreakdown());
            ALMEX_AgendaDataController.ManagementActivityPage page =
                ALMEX_AgendaDataController.getManagementActivities(
                    Date.today(), Date.today(), null, null, null, null, null,
                    null, null, null, null, null, 50, originalClientId
                );
            Test.stopTest();
            System.assertEquals(2, page.totalRecords,
                'El cliente guardado debe ser independiente de la Cuenta actual de la sucursal.');
            System.assert(containsActivity(page.records, activityId));
            System.assert(containsActivity(page.records, withoutBranchId));
            for (Actividad_de_Agenda__c activity : page.records) {
                System.assertEquals(originalClientId, activity.Cliente__c);
                System.assertEquals('Cuenta Prueba Agenda', activity.Cliente__r.Name);
            }
        }
    }

    /**
     * Prueba las consultas usadas por Desglose de actividades:
     * paginación, filtros por prospecto/sucursal y búsquedas de sugerencias.
     *
     * La prueba se omite cuando el usuario que ejecuta los tests no tiene
     * acceso administrativo al Desglose. Esto evita exigir permisos que un
     * usuario normal del proyecto no debería tener.
     */
    @IsTest
    static void queriesManagementDataAndSearchesWhenAuthorized() {
        if (!ALMEX_AgendaDataController.canViewActivityBreakdown()) {
            return;
        }

        Sucursal__c branch = [
            SELECT Id
            FROM Sucursal__c
            WHERE Name = 'Sucursal Prueba Agenda'
            LIMIT 1
        ];
        Lead prospect = [
            SELECT Id, Name
            FROM Lead
            WHERE Company = 'ALMEX Test'
            LIMIT 1
        ];
        Date activityDate = Date.today();

        insert new List<Actividad_de_Agenda__c>{
            buildActivity('Registro de sucursal', activityDate, branch.Id, null),
            buildActivity('Registro de prospecto', activityDate, null, prospect.Name)
        };

        Test.startTest();
        ALMEX_AgendaDataController.ManagementActivityPage firstPage =
            ALMEX_AgendaDataController.getManagementActivities(
                activityDate.addDays(-1),
                activityDate.addDays(1),
                new List<String>{ UserInfo.getName(), ' ' },
                new List<String>{'Visita'},
                new List<String>{'Jalisco'},
                null,
                prospect.Name,
                new List<Boolean>{false},
                new List<String>{'Programada'},
                null,
                null,
                null,
                1,
                null
            );
        ALMEX_AgendaDataController.ManagementActivityPage branchPage =
            ALMEX_AgendaDataController.getManagementActivities(
                activityDate.addDays(-1),
                activityDate.addDays(1),
                null,
                null,
                null,
                branch.Id,
                null,
                null,
                null,
                null,
                null,
                null,
                50,
                null
            );
        List<Sucursal__c> branchResults =
            ALMEX_AgendaDataController.searchManagementBranches('Sucursal Prueba');
        List<Lead> prospectResults =
            ALMEX_AgendaDataController.searchManagementProspects('Prospecto Prueba');
        List<SalesAgreement> supplyAgreements =
            ALMEX_AgendaDataController.getAlmexSupplyAgreements();
        Test.stopTest();

        System.assertEquals(1, firstPage.totalRecords);
        System.assertEquals(1, firstPage.records.size());
        System.assertEquals(1, branchPage.totalRecords);
        System.assertEquals(1, branchPage.records.size());
        System.assertEquals(1, branchResults.size());
        System.assertEquals(1, prospectResults.size());
        System.assertNotEquals(null, supplyAgreements);
        System.assert(firstPage.executiveOptions.contains(UserInfo.getName()));
    }

    /**
     * Un cliente agrupa actividades de varias sucursales y ejecutivos. La
     * paginación y los filtros adicionales mantienen el mismo alcance.
     */
    @IsTest
    static void filtersManagementActivitiesAcrossClientBranches() {
        if (!ALMEX_AgendaDataController.canViewActivityBreakdown()) {
            return;
        }
        Sucursal__c branchA = [SELECT Id, Cuenta__c FROM Sucursal__c
            WHERE Name = 'Sucursal Prueba Agenda' LIMIT 1];
        Account otherClient = new Account(Name = 'Otro Cliente Agenda');
        insert as system otherClient;
        Sucursal__c branchB = new Sucursal__c(Name = 'Sucursal B Agenda', Cuenta__c = branchA.Cuenta__c);
        Sucursal__c otherBranch = new Sucursal__c(Name = 'Sucursal Ajena Agenda', Cuenta__c = otherClient.Id);
        insert as system new List<Sucursal__c>{branchB, otherBranch};

        Actividad_de_Agenda__c pedrito = buildActivity('Visita A', Date.today(), branchA.Id, null);
        pedrito.Ejecutivo__c = 'Pedrito';
        Actividad_de_Agenda__c juanito = buildActivity('Visita B', Date.today(), branchB.Id, null);
        juanito.Ejecutivo__c = 'Juanito';
        Actividad_de_Agenda__c call = buildActivity('Llamada B', Date.today(), branchB.Id, null);
        call.Tipo_de_actividad__c = 'Llamada';
        call.Ejecutivo__c = 'Juanito';
        insert new List<Actividad_de_Agenda__c>{
            pedrito, juanito, call,
            buildActivity('Otra cuenta', Date.today(), otherBranch.Id, null),
            buildActivity('Prospecto homónimo', Date.today(), null, 'Cuenta Prueba Agenda'),
            buildActivity('Fuera de periodo', Date.today().addMonths(-1), branchA.Id, null)
        };

        Test.startTest();
        ALMEX_AgendaDataController.ManagementActivityPage firstPage =
            ALMEX_AgendaDataController.getManagementActivities(
                Date.today(), Date.today(), null, null, null, null, null,
                null, null, null, null, null, 1, branchA.Cuenta__c
            );
        ALMEX_AgendaDataController.ManagementActivityPage secondPage =
            ALMEX_AgendaDataController.getManagementActivities(
                Date.today(), Date.today(), null, null, null, null, null,
                null, null, firstPage.nextCursorDate, firstPage.nextCursorCreatedDate,
                firstPage.nextCursorId, 1, branchA.Cuenta__c
            );
        ALMEX_AgendaDataController.ManagementActivityPage filtered =
            ALMEX_AgendaDataController.getManagementActivities(
                Date.today(), Date.today(), new List<String>{'Juanito'},
                new List<String>{'Visita'}, new List<String>{'Jalisco'},
                null, null, new List<Boolean>{false}, new List<String>{'Programada'},
                null, null, null, 50, branchA.Cuenta__c
            );
        List<Account> clients = ALMEX_AgendaDataController.searchManagementClients('Cuenta Prueba');
        System.assertEquals(0, ALMEX_AgendaDataController.searchManagementClients('C').size());
        Test.stopTest();

        System.assertEquals(3, firstPage.totalRecords);
        System.assertEquals(true, firstPage.hasNext);
        System.assertEquals(3, secondPage.totalRecords);
        System.assertNotEquals(firstPage.records[0].Id, secondPage.records[0].Id);
        System.assertEquals(1, filtered.totalRecords);
        System.assertEquals(juanito.Id, filtered.records[0].Id);
        System.assertEquals(1, clients.size());
        System.assertEquals(branchA.Cuenta__c, clients[0].Id);
    }

    /**
     * Los filtros múltiples unen valores de una misma categoría (OR), pero
     * intersectan categorías (AND). Conteo y paginación deben usar ese mismo
     * conjunto, incluyendo tipos históricos y listas vacías = sin restricción.
     */
    @IsTest
    static void filtersMultipleManagementChoicesAndPaginates() {
        if (!ALMEX_AgendaDataController.canViewActivityBreakdown()) {
            return;
        }
        Sucursal__c branch = [SELECT Id, Cuenta__c FROM Sucursal__c
            WHERE Name = 'Sucursal Prueba Agenda' LIMIT 1];
        Date activityDate = Date.today();
        Actividad_de_Agenda__c visit = buildActivity('Visita filtrada', activityDate, branch.Id, null);
        visit.Seguimiento__c = true;
        Actividad_de_Agenda__c call = buildActivity('Llamada filtrada', activityDate, branch.Id, null);
        call.Tipo_de_actividad__c = 'Llamada';
        call.Estado__c = 'Sonora';
        call.Estatus__c = 'Completada';
        Actividad_de_Agenda__c legacy = buildActivity('Urgente histórica', activityDate, branch.Id, null);
        legacy.Tipo_de_actividad__c = 'Visita extraordinaria';
        Actividad_de_Agenda__c otherType = buildActivity('Otro tipo', activityDate, branch.Id, null);
        otherType.Tipo_de_actividad__c = 'Otro';
        Actividad_de_Agenda__c otherState = buildActivity('Otro estado', activityDate, branch.Id, null);
        otherState.Estado__c = 'Nuevo León';
        Actividad_de_Agenda__c cancelled = buildActivity('Cancelada', activityDate, branch.Id, null);
        cancelled.Estatus__c = 'Cancelada';
        insert new List<Actividad_de_Agenda__c>{visit, call, legacy, otherType, otherState, cancelled,
            buildActivity('Fuera de periodo', activityDate.addDays(-1), branch.Id, null)};

        Test.startTest();
        List<String> types = new List<String>{'Visita', 'Llamada', 'Visitas urgentes', 'Visita', ' ', null};
        List<String> states = new List<String>{' Jalisco ', 'Sonora'};
        List<String> statuses = new List<String>{'Programada', 'Completada'};
        ALMEX_AgendaDataController.ManagementActivityPage first =
            ALMEX_AgendaDataController.getManagementActivities(
                activityDate, activityDate, null, types, states, null, null,
                new List<Boolean>{true, false, null}, statuses, null, null, null, 1, branch.Cuenta__c);
        ALMEX_AgendaDataController.ManagementActivityPage second =
            ALMEX_AgendaDataController.getManagementActivities(
                activityDate, activityDate, null, types, states, null, null,
                new List<Boolean>{true, false}, statuses, first.nextCursorDate,
                first.nextCursorCreatedDate, first.nextCursorId, 1, branch.Cuenta__c);
        ALMEX_AgendaDataController.ManagementActivityPage following =
            ALMEX_AgendaDataController.getManagementActivities(
                activityDate, activityDate, null, types, states, null, null,
                new List<Boolean>{true}, statuses, null, null, null, 50, branch.Cuenta__c);
        ALMEX_AgendaDataController.ManagementActivityPage all =
            ALMEX_AgendaDataController.getManagementActivities(
                activityDate, activityDate, new List<String>(), new List<String>(),
                new List<String>(), null, null, new List<Boolean>(), new List<String>(),
                null, null, null, 50, branch.Cuenta__c);
        ALMEX_AgendaDataController.ManagementActivityPage none =
            ALMEX_AgendaDataController.getManagementActivities(
                activityDate, activityDate, null, new List<String>{'Llamada'},
                new List<String>{'Jalisco'}, null, null, null, null, null, null, null,
                50, branch.Cuenta__c);
        Test.stopTest();

        System.assertEquals(3, first.totalRecords, 'Tres combinaciones válidas, sin duplicar por tipo repetido.');
        System.assertEquals(3, second.totalRecords, 'La siguiente página conserva el conteo filtrado.');
        System.assert(first.hasNext);
        System.assertNotEquals(first.records[0].Id, second.records[0].Id);
        System.assertEquals(1, following.totalRecords, 'Solo la visita con seguimiento.');
        System.assertEquals(visit.Id, following.records[0].Id);
        System.assertEquals(6, all.totalRecords, 'Listas vacías incluyen todos los valores del periodo.');
        System.assertEquals(0, none.totalRecords, 'Las categorías se intersectan, no se unen entre sí.');
    }

    // =====================================================================
    // 6. VALIDACIONES: SOLICITUDES QUE EL CONTROLADOR DEBE RECHAZAR
    // =====================================================================

    /**
     * Ejecuta escenarios inválidos y comprueba que el controlador lance una
     * AuraHandledException en lugar de guardar información inconsistente.
     *
     * Casos cubiertos:
     * - Actividad sin Sucursal ni Prospecto.
     * - Actividad relacionada simultáneamente con ambos.
     * - Llamada sustitutiva sin justificación de excepción.
     * - Seguimiento completado sin resolución.
     * - Cancelación sin justificación.
     * - Reagendamiento en la misma fecha.
     * - Consulta de detalle sin Id.
     * - Búsqueda demasiado corta, que debe devolver una lista vacía.
     */
    @IsTest
    static void rejectsInvalidActivityRequests() {
        Lead prospect = [
            SELECT Id
            FROM Lead
            WHERE Company = 'ALMEX Test'
            LIMIT 1
        ];
        Sucursal__c branch = [
            SELECT Id
            FROM Sucursal__c
            WHERE Name = 'Sucursal Prueba Agenda'
            LIMIT 1
        ];
        Actividad_de_Agenda__c scheduled = insertScheduledActivity(
            'Actividad para validar',
            Date.today().addDays(4)
        );

        assertAuraException(new TestAction('CREATE_WITHOUT_TARGET', prospect.Id, branch.Id, scheduled.Id));
        assertAuraException(new TestAction('CREATE_WITH_TWO_TARGETS', prospect.Id, branch.Id, scheduled.Id));
        assertAuraException(new TestAction('CALL_WITHOUT_JUSTIFICATION', prospect.Id, branch.Id, scheduled.Id));
        assertAuraException(new TestAction('COMPLETE_WITHOUT_RESOLUTION', prospect.Id, branch.Id, scheduled.Id));
        assertAuraException(new TestAction('CANCEL_WITHOUT_JUSTIFICATION', prospect.Id, branch.Id, scheduled.Id));
        assertAuraException(new TestAction('RESCHEDULE_SAME_DATE', prospect.Id, branch.Id, scheduled.Id));
        assertAuraException(new TestAction('DETAIL_WITHOUT_ID', prospect.Id, branch.Id, scheduled.Id));
        assertAuraException(new TestAction('SEARCH_TOO_SHORT', prospect.Id, branch.Id, scheduled.Id), false);
    }

    // =====================================================================
    // 8. FÁBRICA DE REGISTROS DE PRUEBA Y FUNCIONES AUXILIARES
    // =====================================================================

    private static User createBranchAccessTestUser(Boolean managementAccess, String alias) {
        List<ObjectPermissions> availableProfiles = [
            SELECT Parent.ProfileId
            FROM ObjectPermissions
            WHERE Parent.IsOwnedByProfile = true
                AND Parent.PermissionsModifyAllData = false
                AND SobjectType = 'Actividad_de_Agenda__c'
                AND PermissionsRead = true
                AND PermissionsCreate = true
                AND PermissionsEdit = true
                AND PermissionsViewAllRecords = :managementAccess
            ORDER BY Parent.ProfileId
            LIMIT 1
        ];
        System.assertEquals(1, availableProfiles.size(),
            'Falta un perfil comercial con los permisos de Agendas requeridos por la prueba.');
        return new User(
            FirstName = 'Prueba',
            LastName = alias,
            Alias = alias,
            Email = alias + '@example.com',
            Username = alias + '.' + UserInfo.getOrganizationId() + '.' +
                String.valueOf(DateTime.now().getTime()) + '@agenda.example.com',
            ProfileId = availableProfiles[0].Parent.ProfileId,
            TimeZoneSidKey = 'America/Mexico_City',
            LocaleSidKey = 'es_MX',
            EmailEncodingKey = 'UTF-8',
            LanguageLocaleKey = 'es_MX'
        );
    }

    /**
     * Inserta rápidamente una actividad Programada que pueda ser usada por
     * las pruebas de completar, cancelar o reagendar.
     */
    private static Actividad_de_Agenda__c insertScheduledActivity(
        String title,
        Date activityDate
    ) {
        Actividad_de_Agenda__c activity = buildActivity(
            title,
            activityDate,
            null,
            'Prospecto Prueba Agenda'
        );
        activity.Seguimiento__c = true;
        insert activity;
        return activity;
    }

    /**
     * Construye una Actividad_de_Agenda__c con los campos mínimos comunes.
     * No realiza DML: quien llama a este método decide cuándo insertarla.
     */
    private static Actividad_de_Agenda__c buildActivity(
        String title,
        Date activityDate,
        Id branchId,
        String prospectName
    ) {
        return new Actividad_de_Agenda__c(
            Titulo__c = title,
            Tipo_de_actividad__c = 'Visita',
            Ejecutivo__c = UserInfo.getName(),
            Fecha__c = activityDate,
            Estado__c = 'Jalisco',
            Ciudad__c = 'Guadalajara',
            Prospecto__c = prospectName,
            Cliente__c = branchId == null ? null :
                [SELECT Cuenta__c FROM Sucursal__c WHERE Id = :branchId].Cuenta__c,
            Sucursal__c = branchId,
            Seguimiento__c = false,
            Notas__c = 'Registro de prueba',
            Cuenta_para_frecuencia__c = true,
            Estatus__c = 'Programada'
        );
    }

    private static void assertActivityFieldValues(
        Actividad_de_Agenda__c actual,
        Map<String, Object> expected,
        String scenario
    ) {
        System.assertNotEquals(null, actual, scenario + ': falta la actividad.');
        for (String fieldName : expected.keySet()) {
            System.assertEquals(
                expected.get(fieldName), actual.get(fieldName),
                scenario + ': valor inesperado en ' + fieldName
            );
        }
    }

    /**
     * Busca un Id concreto dentro de la lista devuelta por el calendario.
     */
    private static Boolean containsActivity(
        List<Actividad_de_Agenda__c> activities,
        Id activityId
    ) {
        for (Actividad_de_Agenda__c activity : activities) {
            if (activity.Id == activityId) {
                return true;
            }
        }
        return false;
    }

    // =====================================================================
    // 9. EJECUTOR REUTILIZABLE DE ESCENARIOS NEGATIVOS
    // =====================================================================

    /**
     * Encapsula las distintas llamadas inválidas en una implementación de
     * Callable. Así todas pueden utilizar la misma función de validación de
     * excepciones sin repetir bloques try/catch en cada escenario.
     */
    private class TestAction implements Callable {
        private String actionName;
        private Id prospectId;
        private Id branchId;
        private Id activityId;

        TestAction(String actionName, Id prospectId, Id branchId, Id activityId) {
            this.actionName = actionName;
            this.prospectId = prospectId;
            this.branchId = branchId;
            this.activityId = activityId;
        }

        public Object call(String ignoredAction, Map<String, Object> ignoredArguments) {
            // Cada constante representa exactamente un escenario negativo de
            // rejectsInvalidActivityRequests().
            if (actionName == 'CREATE_WITHOUT_TARGET') {
                return ALMEX_AgendaDataController.createActivity(
                    'Sin destino', 'Visita', Date.today(), null, null,
                    null, null, false, null, false, null, null, null
                );
            }
            if (actionName == 'CREATE_WITH_TWO_TARGETS') {
                return ALMEX_AgendaDataController.createActivity(
                    'Dos destinos', 'Visita', Date.today(), null, null,
                    prospectId, branchId, false, null, false, null, null, null
                );
            }
            if (actionName == 'CALL_WITHOUT_JUSTIFICATION') {
                return ALMEX_AgendaDataController.createActivity(
                    'Llamada', 'Llamada', Date.today(), null, null,
                    null, branchId, false, null, true, null, null, null
                );
            }
            if (actionName == 'COMPLETE_WITHOUT_RESOLUTION') {
                ALMEX_AgendaDataController.completeActivity(activityId, null);
                return null;
            }
            if (actionName == 'CANCEL_WITHOUT_JUSTIFICATION') {
                ALMEX_AgendaDataController.cancelActivity(activityId, ' ');
                return null;
            }
            if (actionName == 'CANCEL_CLOSED') {
                ALMEX_AgendaDataController.cancelActivity(activityId, 'Intento sobre actividad cerrada.');
                return null;
            }
            if (actionName == 'UPDATE_CLOSED') {
                ALMEX_AgendaDataController.updateActivityDetails(activityId, false, 'Intento de edición.', null);
                return null;
            }
            if (actionName == 'RESCHEDULE_CLOSED') {
                return ALMEX_AgendaDataController.rescheduleActivity(
                    activityId, Date.today().addDays(20), 'Intento sobre actividad cerrada.'
                );
            }
            if (actionName == 'RESCHEDULE_SAME_DATE') {
                ALMEX_AgendaDataController.rescheduleActivity(
                    activityId,
                    Date.today().addDays(4),
                    'Misma fecha'
                );
                return null;
            }
            if (actionName == 'DETAIL_WITHOUT_ID') {
                return ALMEX_AgendaDataController.getActivityDetail(null);
            }
            if (actionName == 'SEARCH_TOO_SHORT') {
                return ALMEX_AgendaDataController.searchCurrentUserProspects('P');
            }
            return null;
        }
    }

    // =====================================================================
    // 10. COMPROBACIÓN COMÚN DE ERRORES CONTROLADOS
    // =====================================================================

    /**
     * Versión corta para los casos que obligatoriamente deben lanzar error.
     */
    private static void assertAuraException(Callable action) {
        assertAuraException(action, true);
    }

    /**
     * Ejecuta una acción y verifica si se recibió la AuraHandledException
     * esperada. Cuando shouldThrow=false, valida que la búsqueda corta haya
     * regresado una lista vacía sin tratarla como un error.
     */
    private static void assertAuraException(Callable action, Boolean shouldThrow) {
        Boolean thrown = false;

        try {
            Object result = action.call(null, new Map<String, Object>());
            if (!shouldThrow) {
                System.assertEquals(0, ((List<Lead>) result).size());
            }
        } catch (AuraHandledException expectedException) {
            thrown = true;
        }

        System.assertEquals(shouldThrow, thrown);
    }
}