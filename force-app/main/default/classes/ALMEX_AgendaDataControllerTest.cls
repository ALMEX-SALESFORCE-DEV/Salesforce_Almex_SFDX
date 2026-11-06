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
     * La comparación ignora diferencias de mayúsculas y espacios externos.
     */
    @IsTest
    static void recognizesProfilesWithManagementAccess() {
        System.assertEquals(
            true,
            ALMEX_AgendaDataController.isManagementProfileName(
                'Administrador del sistema'
            )
        );
        System.assertEquals(
            true,
            ALMEX_AgendaDataController.isManagementProfileName(
                ' Gerencia y Dirección comercial '
            )
        );
        System.assertEquals(
            false,
            ALMEX_AgendaDataController.isManagementProfileName(
                'Ejecutivo comercial'
            )
        );
    }

    @IsTest
    static void managementCanListAndCreateActivityForAnotherUsersBranch() {
        Sucursal__c branch = [
            SELECT Id, OwnerId
            FROM Sucursal__c
            WHERE Name = 'Sucursal Prueba Agenda'
            LIMIT 1
        ];
        User manager = createBranchAccessTestUser('Gerencia y Dirección Comercial', 'gerencia');
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
        User seller = createBranchAccessTestUser('Supervisor y Ejecutivo Comercial', 'vendedor');
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
        User seller = createBranchAccessTestUser('Supervisor y Ejecutivo Comercial', 'vendedor');
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
    // 7. INTEGRACIÓN DE MEJORA DE TEXTO CON OPENROUTER
    // =====================================================================

    /**
     * CUATRO ESCENARIOS de IA con HttpCalloutMock: no consumen solicitudes
     * reales ni necesitan exponer la API key de la credencial nombrada.
     */
    @IsTest
    static void discoversFreeTextZdrModelsDynamically() {
        ALMEX_AgendaDataController.bypassAiPermissionCheck = true;
        OpenRouterAiMock mock = new OpenRouterAiMock('success', 200);
        Test.setMock(HttpCalloutMock.class, mock);
        Test.startTest();
        List<String> candidates = ALMEX_AgendaDataController.getAgendaAiCandidates();
        Test.stopTest();
        System.assertEquals(new List<String>{
            'mock/beta:free', 'mock/alpha:free', 'mock/gamma:free'
        }, candidates, 'Ordena por disponibilidad y latencia, elimina duplicados y limita a tres.');
        System.assertEquals(2, mock.catalogCalls);
        System.assertEquals(0, mock.inferenceCalls, 'Descubrir modelos no envía notas.');
    }

    @IsTest
    static void sendsModelFallbacksWithStrictPrivacyInOnePost() {
        ALMEX_AgendaDataController.bypassAiPermissionCheck = true;
        OpenRouterAiMock mock = new OpenRouterAiMock('success', 200);
        Test.setMock(HttpCalloutMock.class, mock);
        Test.startTest();
        String improved = ALMEX_AgendaDataController.improveAgendaText(
            'visitamos al cliente y quedo pendiente la cotizacion', 'notes', null);
        String resolution = ALMEX_AgendaDataController.improveAgendaText(
            'visitamos al cliente y quedo pendiente la cotizacion',
            'followUpResolution', new List<String>{
                'openrouter/free', 'mock/beta:free', 'mock/beta:free',
                'mock/alpha:free', 'mock/gamma:free', 'mock/delta:free'
            });
        Test.stopTest();
        System.assertEquals('Visitamos al cliente y quedó pendiente la cotización.', improved);
        System.assertEquals(improved, resolution);
        System.assertEquals(2, mock.catalogCalls, 'El plan del navegador evita consultar el catálogo otra vez.');
        System.assertEquals(2, mock.inferenceCalls, 'Un POST por cada clic, sin reenviar a ciegas.');
        System.assert(mock.lastBody.contains('resumen de resolución'));
        System.assert(mock.lastBody.contains('1000 caracteres'));
    }

    @IsTest
    static void failsClosedWhenCatalogHasNoEligibleModelsOrIsUnavailable() {
        ALMEX_AgendaDataController.bypassAiPermissionCheck = true;
        Test.startTest();
        for (String scenario : new List<String>{'empty', 'malformed', 'catalogError', 'catalogTimeout'}) {
            OpenRouterAiMock mock = new OpenRouterAiMock(scenario, 200);
            Test.setMock(HttpCalloutMock.class, mock);
            Boolean rejected = false;
            try {
                ALMEX_AgendaDataController.improveAgendaText(
                    'visitamos al cliente y quedo pendiente la cotizacion', 'notes', null);
            } catch (AuraHandledException expected) {
                rejected = true;
            }
            System.assert(rejected, 'No debe inferir si el catálogo es inválido o no hay candidatos.');
            System.assertEquals(0, mock.inferenceCalls);
        }
        Test.stopTest();
    }

    @IsTest
    static void handlesInferenceErrorsWithoutMultiplyingRequests() {
        ALMEX_AgendaDataController.bypassAiPermissionCheck = true;
        Test.startTest();
        for (Integer code : new List<Integer>{404, 429, 503, 408, 401, 403, 402, 200}) {
            // El 200 incluye un error 429 en JSON; no debe tratarse como éxito.
            OpenRouterAiMock mock = new OpenRouterAiMock('failure', code);
            Test.setMock(HttpCalloutMock.class, mock);
            Boolean rejected = false;
            try {
                ALMEX_AgendaDataController.improveAgendaText(
                    'visitamos al cliente y quedo pendiente la cotizacion', 'notes',
                    new List<String>{'mock/beta:free', 'mock/alpha:free', 'mock/gamma:free'});
            } catch (AuraHandledException expected) {
                rejected = true;
            }
            System.assert(rejected);
            System.assertEquals(1, mock.inferenceCalls, 'Los respaldos son internos a OpenRouter.');
            System.assertEquals(0, mock.catalogCalls);
        }
        for (String scenario : new List<String>{'blank', 'tooLong', 'truncated', 'inferenceTimeout'}) {
            OpenRouterAiMock mock = new OpenRouterAiMock(scenario, 200);
            Test.setMock(HttpCalloutMock.class, mock);
            Boolean rejected = false;
            try {
                ALMEX_AgendaDataController.improveAgendaText(
                    'visitamos al cliente y quedo pendiente la cotizacion',
                    'exceptionJustification', new List<String>{'mock/alpha:free'});
            } catch (AuraHandledException expected) {
                rejected = true;
            }
            System.assert(rejected, 'No acepta respuestas vacías, demasiado largas o desconexiones.');
            System.assertEquals(1, mock.inferenceCalls);
        }
        Test.stopTest();
    }

    private class OpenRouterAiMock implements HttpCalloutMock {
        String scenario;
        Integer responseCode;
        Integer catalogCalls = 0;
        Integer inferenceCalls = 0;
        String lastBody;

        OpenRouterAiMock(String scenario, Integer responseCode) {
            this.scenario = scenario;
            this.responseCode = responseCode;
        }

        public HttpResponse respond(HttpRequest request) {
            HttpResponse response = new HttpResponse();
            response.setHeader('Content-Type', 'application/json');
            response.setStatusCode(200);
            if (request.getMethod() == 'GET') {
                catalogCalls++;
                System.assert(String.isBlank(request.getBody()), 'El catálogo nunca recibe notas.');
                if (scenario == 'catalogTimeout') { throw new CalloutException('Simulated timeout'); }
                if (scenario == 'catalogError') {
                    response.setStatusCode(429);
                    response.setBody('{"error":{"code":429}}');
                } else if (scenario == 'malformed') {
                    response.setBody('{"data":{}}');
                } else if (request.getEndpoint().endsWith('/api/v1/endpoints/zdr')) {
                    response.setBody(JSON.serialize(new Map<String, Object>{
                        'data' => scenario == 'empty' ? new List<Object>() : buildAiEndpointCatalog()
                    }));
                } else {
                    System.assert(request.getEndpoint().endsWith('/api/v1/models'));
                    response.setBody(JSON.serialize(new Map<String, Object>{'data' => buildAiModelCatalog()}));
                }
                return response;
            }
            inferenceCalls++;
            System.assertEquals('POST', request.getMethod());
            System.assert(request.getEndpoint().endsWith('/api/v1/chat/completions'));
            lastBody = request.getBody();
            Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(lastBody);
            List<Object> models = (List<Object>) body.get('models');
            System.assert(models.size() > 0 && models.size() <= 3);
            System.assertEquals(models.size(), new Set<Object>(models).size(), 'No repite candidatos.');
            System.assertEquals(false, body.containsKey('model'), 'No utiliza el router aleatorio.');
            Map<String, Object> provider = (Map<String, Object>) body.get('provider');
            System.assertEquals(true, provider.get('zdr'));
            System.assertEquals('deny', provider.get('data_collection'));
            System.assertEquals(true, provider.get('allow_fallbacks'));
            Map<String, Object> prices = (Map<String, Object>) provider.get('max_price');
            for (String key : new List<String>{'prompt', 'completion', 'request'}) {
                System.assertEquals(0, prices.get(key), 'Nunca permite pago ni al cambiar de modelo.');
            }
            System.assertEquals(false, provider.containsKey('only'));
            System.assertEquals(false, body.get('stream'));
            System.assertEquals(0.1, body.get('temperature'));
            Map<String, Object> format = (Map<String, Object>) body.get('response_format');
            System.assertEquals('json_schema', format.get('type'));
            Map<String, Object> jsonSchema = (Map<String, Object>) format.get('json_schema');
            System.assertEquals(true, jsonSchema.get('strict'));
            Map<String, Object> schema = (Map<String, Object>) jsonSchema.get('schema');
            System.assertEquals(false, schema.get('additionalProperties'));
            System.assertEquals(new List<Object>{'texto'}, schema.get('required'));
            System.assert(lastBody.contains('TRES toneladas solicitadas ahora y CINCO de la compra anterior'));
            System.assert(lastBody.contains('la ficha sigue PENDIENTE'));
            System.assert(lastBody.contains('No describas, evalúes ni justifiques'));
            System.assert(lastBody.contains('visitamos al cliente y quedo pendiente la cotizacion'));
            System.assert(lastBody.contains('No inventes información'));
            if (scenario == 'inferenceTimeout') { throw new CalloutException('Simulated timeout'); }
            response.setStatusCode(responseCode);
            if (scenario == 'failure') {
                response.setBody(JSON.serialize(new Map<String, Object>{
                    'error' => new Map<String, Object>{'code' => responseCode == 200 ? 429 : responseCode}
                }));
            } else {
                String content = scenario == 'blank' ? ' ' :
                    scenario == 'tooLong' ? 'X'.repeat(161) :
                    'Visitamos al cliente y quedó pendiente la cotización.';
                response.setBody(JSON.serialize(new Map<String, Object>{
                    'model' => models[models.size() - 1],
                    'choices' => new List<Object>{new Map<String, Object>{
                        'finish_reason' => scenario == 'truncated' ? 'length' : 'stop',
                        'message' => new Map<String, Object>{
                            'content' => JSON.serialize(new Map<String, Object>{'texto' => content})
                        }
                    }}
                }));
            }
            return response;
        }
    }

    /**
     * Regresión del caso reportado: ningún análisis, encabezado ni explicación
     * debe alcanzar la vista previa, incluso si viene dentro de un JSON válido.
     * Solo prueba el validador local; no realiza callouts ni consume cuota.
     */
    @IsTest
    static void rejectsEditorialAnalysisAndUnresolvedDictation() {
        List<String> invalidOutputs = new List<String>{
            'Revisé el texto y lo he mejorado en los siguientes puntos:\n' +
                '- Corregí errores tipográficos.\n- La cantidad correcta es cinco toneladas.\n\n' +
                'Texto mejorado:\nHoy fui con Laura. Necesitan cinco toneladas... no, perdón, tres.',
            '{"texto":"Revisé el texto y lo he mejorado en los siguientes puntos: correcciones."}',
            '{"texto":"Hoy fui con Laura.\\n\\nTexto mejorado:\\nEl cliente solicita tres toneladas."}',
            '{"texto":"El cliente necesita cinco toneladas... no, perdón, tres."}',
            '{"texto":"Nota correcta.","explicacion":"Corregí la gramática."}',
            '{"texto":["No es un texto"]}',
            '{"texto":"   "}',
            '```json\n{"texto":"No debe extraer fragmentos de Markdown."}\n```'
        };
        for (String content : invalidOutputs) {
            Boolean rejected = false;
            try {
                ALMEX_AgendaDataController.validateAgendaAiTextOutput(content, 6000);
            } catch (AuraHandledException expected) {
                rejected = true;
            }
            System.assert(rejected, 'Una respuesta fuera del contrato no debe mostrarse.');
        }
    }

    @IsTest
    static void extractsOnlyTheCorrectedCommercialNote() {
        String note = 'Durante la visita a Laura, de Compras de Alimentos del Centro, ' +
            'se solicitó una cotización de tres toneladas de glucosa para el 12 de noviembre. ' +
            'La compra anterior fue de cinco toneladas. El pedido aún no está confirmado. ' +
            'El último embarque tuvo dos días de retraso y afectó la producción. ' +
            'Quedó pendiente revisar la incidencia con Logística, enviar la cotización mañana ' +
            'y enviar la ficha técnica. No se acordó descuento ni se cerró la venta. ' +
            'Se acordó hablar el viernes.';
        String content = JSON.serialize(new Map<String, Object>{'texto' => '  ' + note + '  '});
        System.assertEquals(note,
            ALMEX_AgendaDataController.validateAgendaAiTextOutput(content, 6000));
        System.assertEquals('X'.repeat(160),
            ALMEX_AgendaDataController.validateAgendaAiTextOutput(
                JSON.serialize(new Map<String, Object>{
                    'texto' => 'X'.repeat(160)
                }), 160));
    }

    private static Map<String, Object> buildAiModel(String modelId, String output, String promptPrice) {
        return new Map<String, Object>{
            'id' => modelId,
            'pricing' => new Map<String, Object>{'prompt' => promptPrice, 'completion' => '0'},
            'architecture' => new Map<String, Object>{
                'input_modalities' => new List<String>{'text'},
                'output_modalities' => new List<String>{output}
            }
        };
    }

    private static List<Object> buildAiModelCatalog() {
        List<Object> models = new List<Object>();
        for (String name : new List<String>{'alpha', 'beta', 'gamma', 'delta', 'small', 'noParams', 'requestFee'}) {
            models.add(buildAiModel('mock/' + name + ':free', 'text', '0'));
        }
        models.add(buildAiModel('mock/paid', 'text', '0.1'));
        models.add(buildAiModel('mock/image', 'image', '0'));
        models.add(buildAiModel('openrouter/free', 'text', '0'));
        Map<String, Object> reasoner = buildAiModel('mock/reasoner', 'text', '0');
        reasoner.put('reasoning', new Map<String, Object>{'mandatory' => true});
        models.add(reasoner);
        return models;
    }

    private static List<Object> buildAiEndpointCatalog() {
        List<Object> endpoints = new List<Object>();
        Integer index = 0;
        for (String name : new List<String>{
            'alpha', 'beta', 'gamma', 'delta', 'paid', 'image',
            'reasoner', 'small', 'noParams', 'requestFee'
        }) {
            index++;
            endpoints.add(new Map<String, Object>{
                'model_id' => 'mock/' + name +
                    (new Set<String>{'paid', 'image', 'reasoner'}.contains(name) ? '' : ':free'),
                'pricing' => new Map<String, Object>{
                    'prompt' => '0', 'completion' => '0', 'request' => name == 'requestFee' ? '0.01' : '0'
                },
                'context_length' => name == 'small' ? 4096 : 32768,
                'max_completion_tokens' => 2000,
                'supported_parameters' => name == 'noParams' ?
                    new List<String>() : new List<String>{'temperature', 'max_tokens'},
                'uptime_last_30m' => index < 3 ? 100 : 100 - index,
                'latency_last_30m' => name == 'beta' ? 1 : 2,
                'native_tools' => new Map<String, Object>{'extra' => new List<Object>{true, null}},
                'supports_tool_choice' => new Map<String, Object>{'none' => true, 'auto' => true},
                'future_metadata' => new Map<String, Object>{'nested' => new Map<String, Object>{'value' => 1}}
            });
        }
        endpoints.add(endpoints[0]); // Un mismo modelo con dos endpoints no se duplica.
        return endpoints;
    }

    // =====================================================================
    // 8. FÁBRICA DE REGISTROS DE PRUEBA Y FUNCIONES AUXILIARES
    // =====================================================================

    private static User createBranchAccessTestUser(String profileName, String alias) {
        Profile userProfile = [SELECT Id FROM Profile WHERE Name = :profileName LIMIT 1];
        return new User(
            FirstName = 'Prueba',
            LastName = alias,
            Alias = alias,
            Email = alias + '@example.com',
            Username = alias + '.' + UserInfo.getOrganizationId() + '.' +
                String.valueOf(DateTime.now().getTime()) + '@agenda.example.com',
            ProfileId = userProfile.Id,
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
