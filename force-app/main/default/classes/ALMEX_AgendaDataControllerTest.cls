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
            null
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
            null
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
            true, 'Solicitud urgente del cliente');
        Id meetingId = ALMEX_AgendaDataController.createActivity(
            'Reunión virtual', 'Reunión', Date.today(), 'Jalisco',
            'Guadalajara', null, branch.Id, false, null, false, null);
        ALMEX_AgendaDataController.VisitLogResponse visitLog =
            ALMEX_AgendaDataController.getCurrentUserVisitLog();
        if (ALMEX_AgendaDataController.canViewActivityBreakdown()) {
            ALMEX_AgendaDataController.ManagementActivityPage urgentPage =
                ALMEX_AgendaDataController.getManagementActivities(
                    Date.today(), Date.today(), null, 'Visitas urgentes',
                    null, branch.Id, null, null, null, null, null, null, 50);
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
                'Visita',
                'Jalisco',
                null,
                prospect.Name,
                false,
                'Programada',
                null,
                null,
                null,
                1
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
                50
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
     * Simula una respuesta exitosa de OpenRouter y verifica:
     * - El controlador realiza un POST al endpoint de chat configurado.
     * - El texto original viaja dentro del cuerpo de la solicitud.
     * - Se utiliza openrouter/free sin fijar modelos ni proveedores concretos.
     * - ZDR y la prohibición de recolección permanecen obligatorios.
     * - El límite de precio cero impide pasar a un endpoint de pago.
     * - La respuesta se extrae de choices[0].message.content.
     *
     * La prueba nunca consume la API real ni necesita conocer su token.
     */
    @IsTest
    static void improvesAgendaTextWithOpenRouter() {
        ALMEX_AgendaDataController.bypassAiPermissionCheck = true;
        Test.setMock(HttpCalloutMock.class, new OpenRouterSuccessMock());

        Test.startTest();
        String improvedText = ALMEX_AgendaDataController.improveAgendaText(
            'visitamos al cliente y quedo pendiente la cotizacion',
            'notes'
        );
        Test.stopTest();

        System.assertEquals(
            'Visitamos al cliente y quedó pendiente la cotización.',
            improvedText,
            'Debe devolver únicamente el texto mejorado por el proveedor.'
        );
    }

    /**
     * Reproduce falta de endpoints (404) y saturación temporal (429).
     * Ambos solicitan nuevamente selección automática sin relajar privacidad.
     */
    @IsTest
    static void improvesTextWithFallbackWhenModelIsUnavailable() {
        assertOpenRouterFallback(404);
    }

    @IsTest
    static void improvesTextWithFallbackWhenModelIsRateLimited() {
        assertOpenRouterFallback(429);
    }

    @IsTest
    static void improvesTextWithRouterRetryWhenProviderFails() {
        assertOpenRouterFallback(503);
    }

    @IsTest
    static void improvesTextWithRouterRetryWhenRequestTimesOut() {
        assertOpenRouterFallback(408);
    }

    @IsTest
    static void retriesOpenRouterErrorInsideHttpSuccess() {
        // Un HTTP 200 con error 429 en el cuerpo no es una propuesta válida.
        assertOpenRouterFallback(200);
    }

    private static void assertOpenRouterFallback(Integer firstStatus) {
        ALMEX_AgendaDataController.bypassAiPermissionCheck = true;
        OpenRouterFallbackMock mock = new OpenRouterFallbackMock(firstStatus);
        Test.setMock(HttpCalloutMock.class, mock);

        Test.startTest();
        String result = ALMEX_AgendaDataController.improveAgendaText(
            'visitamos al cliente y quedo pendiente la cotizacion', 'notes'
        );
        Test.stopTest();

        System.assertEquals(2, mock.attempts, 'Debe solicitar selección nuevamente al router.');
        System.assertEquals(
            'Visitamos al cliente y quedó pendiente la cotización.', result
        );
    }

    /**
     * Si todos los endpoints faltan, informa del problema y conserva el texto.
     * Un error de credenciales no debe provocar reintentos con otros modelos.
     */
    @IsTest
    static void rejectsTextImprovementWhenNoModelIsAvailable() {
        assertOpenRouterFailure(404, 2);
    }

    @IsTest
    static void rejectsTextImprovementWithoutRetryingUnauthorizedCredential() {
        assertOpenRouterFailure(401, 1);
    }

    @IsTest
    static void rejectsTextImprovementWithoutRetryingForbiddenRequest() {
        assertOpenRouterFailure(403, 1);
    }

    @IsTest
    static void rejectsTextImprovementWithoutRetryingAccountPaymentError() {
        assertOpenRouterFailure(402, 1);
    }

    private static void assertOpenRouterFailure(Integer statusCode, Integer expectedAttempts) {
        ALMEX_AgendaDataController.bypassAiPermissionCheck = true;
        OpenRouterFailureMock mock = new OpenRouterFailureMock(statusCode);
        Test.setMock(HttpCalloutMock.class, mock);
        Boolean thrown = false;

        Test.startTest();
        try {
            ALMEX_AgendaDataController.improveAgendaText(
                'visitamos al cliente y quedo pendiente la cotizacion', 'notes'
            );
        } catch (AuraHandledException expectedException) {
            thrown = true;
        }
        Test.stopTest();

        System.assert(thrown, 'Debe devolver un error controlado.');
        System.assertEquals(expectedAttempts, mock.attempts);
    }

    private class OpenRouterFallbackMock implements HttpCalloutMock {
        Integer attempts = 0;
        Integer firstStatus;
        String originalRequestBody;

        OpenRouterFallbackMock(Integer firstStatus) {
            this.firstStatus = firstStatus;
        }

        public HttpResponse respond(HttpRequest request) {
            attempts++;
            HttpResponse response = new OpenRouterSuccessMock().respond(request);
            if (attempts == 1) {
                originalRequestBody = request.getBody();
                response.setStatusCode(firstStatus);
                response.setBody(JSON.serialize(new Map<String, Object>{
                    'error' => new Map<String, Object>{
                        'code' => firstStatus == 200 ? 429 : firstStatus,
                        'message' => 'Endpoint unavailable'
                    }
                }));
            } else {
                System.assertEquals(originalRequestBody, request.getBody(),
                    'Los reintentos deben conservar texto, prompt y restricciones.');
            }
            return response;
        }
    }

    private class OpenRouterFailureMock implements HttpCalloutMock {
        Integer attempts = 0;
        Integer statusCode;

        OpenRouterFailureMock(Integer statusCode) {
            this.statusCode = statusCode;
        }

        public HttpResponse respond(HttpRequest request) {
            attempts++;
            HttpResponse response = new OpenRouterSuccessMock().respond(request);
            response.setStatusCode(statusCode);
            response.setBody('{"error":{"message":"Endpoint unavailable"}}');
            return response;
        }
    }

    /**
     * Sustituye el callout HTTP durante la prueba para que sea determinista,
     * rápida y no exponga ni consuma la credencial configurada en Salesforce.
     */
    private class OpenRouterSuccessMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest request) {
            System.assertEquals('POST', request.getMethod());
            System.assert(
                request.getEndpoint().endsWith('/api/v1/chat/completions'),
                'Debe utilizar el endpoint de chat completions de OpenRouter.'
            );
            System.assertEquals(
                'application/json',
                request.getHeader('Content-Type')
            );

            Map<String, Object> requestBody =
                (Map<String, Object>) JSON.deserializeUntyped(
                    request.getBody()
                );
            System.assertEquals('openrouter/free', requestBody.get('model'));
            System.assertEquals(false, requestBody.get('stream'));
            System.assertEquals(false, requestBody.containsKey('models'),
                'No debe mantener una lista fija de modelos.');

            Map<String, Object> provider =
                (Map<String, Object>) requestBody.get('provider');
            System.assertEquals(true, provider.get('zdr'));
            System.assertEquals('deny', provider.get('data_collection'));
            System.assertEquals(true, provider.get('allow_fallbacks'));

            System.assertEquals(false, provider.containsKey('only'),
                'Cualquier proveedor que cumpla ZDR y precio cero es elegible.');
            System.assertEquals(false, provider.containsKey('order'));
            System.assertEquals(false, provider.containsKey('ignore'));

            Map<String, Object> maxPrice =
                (Map<String, Object>) provider.get('max_price');
            System.assertEquals(0, maxPrice.get('prompt'));
            System.assertEquals(0, maxPrice.get('completion'));
            System.assertEquals(0, maxPrice.get('request'));

            Map<String, Object> reasoning =
                (Map<String, Object>) requestBody.get('reasoning');
            System.assertEquals(false, reasoning.get('enabled'));
            System.assertEquals(0.1, requestBody.get('temperature'));
            System.assert(
                request.getBody().contains(
                    'visitamos al cliente y quedo pendiente la cotizacion'
                ),
                'La solicitud debe incluir el texto proporcionado por el usuario.'
            );

            HttpResponse response = new HttpResponse();
            response.setStatusCode(200);
            response.setHeader('Content-Type', 'application/json');
            response.setBody(
                '{"choices":[{"message":{"role":"assistant",' +
                '"content":"Visitamos al cliente y quedó pendiente la cotización."}}]}'
            );
            return response;
        }
    }

    // =====================================================================
    // 8. FÁBRICA DE REGISTROS DE PRUEBA Y FUNCIONES AUXILIARES
    // =====================================================================

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
                    null, null, false, null, false, null
                );
            }
            if (actionName == 'CREATE_WITH_TWO_TARGETS') {
                return ALMEX_AgendaDataController.createActivity(
                    'Dos destinos', 'Visita', Date.today(), null, null,
                    prospectId, branchId, false, null, false, null
                );
            }
            if (actionName == 'CALL_WITHOUT_JUSTIFICATION') {
                return ALMEX_AgendaDataController.createActivity(
                    'Llamada', 'Llamada', Date.today(), null, null,
                    null, branchId, false, null, true, null
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
