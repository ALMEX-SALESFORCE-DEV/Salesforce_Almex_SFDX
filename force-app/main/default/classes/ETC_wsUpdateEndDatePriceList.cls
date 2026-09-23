public with sharing class ETC_wsUpdateEndDatePriceList extends ETC_Callout {
	public static final String ENDPOINT_NAME = 'wsUpdateEndDatePriceList';

	public ETC_wsUpdateEndDatePriceList() {
		this.claseApex = ETC_wsUpdateEndDatePriceList.class.getName();
	}

	@TestVisible
	public String callService(String recordId, DateTime endDate) {
		String wsResponse = '';
		endpoint__mdt mdt = mdt != null ? this.mdt : ETC_Utility.getEndpoint(ENDPOINT_NAME);

		String authHeader = '';
		if (mdt.auth_type__c == 'Token' || mdt.auth_type__c == null) {
			String token = ETC_wsOAuth.callToken();
			authHeader = 'Bearer ' + token;
		} else if (mdt.auth_type__c == 'Basic') {
			Blob headerValue = Blob.valueOf(mdt.client_id__c + ':' + mdt.client_secret__c);
			authHeader = 'Basic ' + EncodingUtil.base64Encode(headerValue);
		}
		System.debug('===START_authHeader===');
		System.debug(authHeader);
		System.debug('===END_authHeader===');

		Pricebook2 pbEntry = [
			SELECT
				External_Id__c,
				Fecha_de_Fin__c,
				Hora_Fin__c,
				Cotizacion__r.Hora_Inicio__c,
				Cotizacion__r.Fecha_de_inicio__c
			FROM Pricebook2
			WHERE Id = :recordId
		];
		String endDateString;
		if (endDate == null) {
			endDateString = ETC_Utility.getStringDateTime(
				pbEntry.Cotizacion__r.Fecha_de_inicio__c,
				pbEntry.Cotizacion__r.Hora_Inicio__c,
				''
			);
		} else {
			endDateString = endDate.format('yyyy-MM-dd\'T\'HH:mm:ss');
		}
		System.debug('===START_endDateString===');
		System.debug(endDateString);
		System.debug('===END_endDateString===');
		Callout callout = createCallout(ENDPOINT_NAME);
		callout.request.setEndpoint(callout.request.getEndpoint() + pbEntry.External_Id__c);
		callout.request.setHeader('Authorization', authHeader);
		callout.request.setBody('{"EndDate":"{0}"}'.replace('{0}', endDateString));
		HttpResponse response = sendCallout(callout);

		System.debug('===START_Body===');
		System.debug(response.getBody());
		System.debug(response.getStatusCode());
		System.debug('===END_Body===');

		if (response.getStatusCode() == 200 || Test.isRunningTest()) {
			System.debug('Proceso terminado con éxito - ETC_wsRemovePriceList');
			wsResponse = Test.isRunningTest() ? mdt.Response__c : response.getBody();
			Map<String, Object> parseBody = (Map<String, Object>) JSON.deserializeUntyped(wsResponse);
			if (endDate != null) {
				pbEntry.Fecha_de_Fin__c = Date.valueOf(endDate);
				pbEntry.Hora_Fin__c = endDate.time();
			}
			update pbEntry;
			wsResponse =
				'La lista de precios ' +
				String.valueOf(parseBody.get('PriceListId')) +
				' se ha actualizado correctamente';
		} else {
			wsResponse = 'No fue posible actualizar la lista de precios';
		}
		System.debug(wsResponse);
		return wsResponse;
	}

	public static void updateDate(String priceListId, Date endDate) {
		ETC_wsUpdateEndDatePriceList ws = new ETC_wsUpdateEndDatePriceList();
		String response = ws.callService(priceListId, endDate);
		System.debug('response=' + response);
	}

	@InvocableMethod(
		label='Update End Date Price List'
		description='Actualiza el fin de vigencia de la lista de precios en Oracle'
	)
	public static List<ReturnVars> callUpdateEndDate(List<InputVars> inputs) {
		ETC_wsUpdateEndDatePriceList ws = new ETC_wsUpdateEndDatePriceList();
		ReturnVars response = new ReturnVars();
		String result = ws.callService(inputs.get(0).priceListId, inputs.get(0).endDate);
		System.debug('===START_result===');
		System.debug(result);
		System.debug('===END_result===');
		response.updateResult = result;
		return new List<ReturnVars>{ response };
	}

	public class InputVars {
		@InvocableVariable
		public String priceListId;
		@InvocableVariable
		public DateTime endDate;
	}

	public class ReturnVars {
		@InvocableVariable
		public String updateResult;
	}
}