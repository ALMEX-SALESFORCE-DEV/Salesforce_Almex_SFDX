public with sharing class ETC_wsCreatePriceList extends ETC_Callout {
	public static final String ENDPOINT_NAME = 'wsCreatePriceList';

	public ETC_wsCreatePriceList() {
		this.claseApex = ETC_wsCreatePriceList.class.getName();
	}

	@TestVisible
	private String create(String recordId) {
		String wsResponse = '';
		System.debug(recordId);
		endpoint__mdt mdt = mdt != null ? this.mdt : ETC_Utility.getEndpoint(ENDPOINT_NAME);
		ETC_ControllerWsCreatePriceList controller = new ETC_ControllerWsCreatePriceList(recordId);

		String authHeader = '';
		if (mdt.auth_type__c == 'Token' || mdt.auth_type__c == null) {
			String token = ETC_wsOAuth.callToken();
			System.debug(token);
			authHeader = 'Bearer ' + token;
		} else if (mdt.auth_type__c == 'Basic') {
			Blob headerValue = Blob.valueOf(mdt.client_id__c + ':' + mdt.client_secret__c);
			authHeader = 'Basic ' + EncodingUtil.base64Encode(headerValue);
		}

		Callout callout = createCallout(ENDPOINT_NAME);
		callout.request.setHeader('Authorization', authHeader);
		System.debug('set body to request');
		callout.request.setBody(controller.sync());
		System.debug('finish set body controller');

		HttpResponse response = sendCallout(callout);
		System.debug(response.getBody());
		System.debug(response.getStatusCode());

		Pricebook2 pricebook = [SELECT Id, Request_Body_FlagN__c FROM Pricebook2 WHERE Id = :recordId];
		pricebook.Request_Body_FlagN__c = callout.request.getBody();
		update pricebook;

		System.debug(pricebook);
		if (response.getStatusCode() == 200 || Test.isRunningTest()) {
			System.debug('Proceso terminado con éxito - ETC_wsCreatePriceList');
			wsResponse = Test.isRunningTest() ? mdt.Response__c : response.getBody();
			Map<String, Object> parseBody = (Map<String, Object>) JSON.deserializeUntyped(wsResponse);
			System.debug('===START_ParseBody===');
			System.debug(parseBody.get('PriceListId'));
			System.debug('===END_ParseBody===');
			return controller.saveResponse(String.valueOf(parseBody.get('PriceListId')));
		} else {
			System.debug('===START_error===');
			System.debug('Service error in - ETC_wsCreatePriceList');
			System.debug('===END_error===');
			System.debug(response.getBody());
			return 'No fue posible crear la lista de precios';
		}
	}

	public static void callService(String id) {
		ETC_wsCreatePriceList ws = new ETC_wsCreatePriceList();
		String response = ws.create(id);
		System.debug('response=' + response);
	}

	@InvocableMethod(label='Create Price List' description='Crea la lista de precios en Oracle')
	public static List<ReturnVars> callCreate(List<InputVars> inputs) {
		ETC_wsCreatePriceList ws = new ETC_wsCreatePriceList();
		ReturnVars response = new ReturnVars();
		String result = ws.create(inputs.get(0).priceListId);
		System.debug('===START_result===');
		System.debug(result);
		System.debug('===END_result===');
		response.removeResult = result;
		return new List<ReturnVars>{ response };
	}

	public class InputVars {
		@InvocableVariable
		public String priceListId;
	}

	public class ReturnVars {
		@InvocableVariable
		public String removeResult;
	}
}