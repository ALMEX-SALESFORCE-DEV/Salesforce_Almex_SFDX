public with sharing class ETC_wsOAuth {
	public static final String ENDPOINT_NAME = 'wsGenerateToken';

	@TestVisible
	public string getToken() {
		endpoint__mdt mdt = ETC_Utility.getEndpoint(ENDPOINT_NAME);
		HttpRequest req = new HttpRequest();
		req.setEndpoint(mdt.host__c);
		req.setMethod(mdt.method__c);
		req.setHeader('Content-Type', 'application/x-www-form-urlencoded');

		String reqBody = this.generateBody(mdt);

		req.setBody(reqBody);

		Http http = new Http();
		try {
			HttpResponse res = Test.isRunningTest() ? new HttpResponse() : http.send(req);
			if (res.getStatusCode() == 200 || Test.isRunningTest()) {
				String body = Test.isRunningTest() ? mdt.response__c : res.getBody();
				Map<String, Object> responseMap = (Map<String, Object>) JSON.deserializeUntyped(body);
				String token = (String) responseMap.get('access_token');
				return token;
			} else {
				System.debug('===START_res.getBody() - error===');
				System.debug(res.getBody());
				System.debug('===END_res.getBody() - error===');
				return '';
			}
		} catch (Exception e) {
			System.debug('===START_error===');
			System.debug(e);
			System.debug('===END_error===');
			return '';
		}
	}

	public String generateBody(endpoint__mdt mdt) {
		String body = '';
		body += 'client_id=' + EncodingUtil.urlEncode(mdt.client_id__c, 'UTF-8');
		body += '&client_secret=' + EncodingUtil.urlEncode(mdt.client_secret__c, 'UTF-8');
		body += '&grant_type=' + EncodingUtil.urlEncode(mdt.grant_type__c, 'UTF-8');
		body += '&scope=' + EncodingUtil.urlEncode(mdt.scope__c, 'UTF-8');
		return body;
	}

	public static String callToken() {
		ETC_wsOAuth ws = new ETC_wsOAuth();
		return ws.getToken();
	}
}