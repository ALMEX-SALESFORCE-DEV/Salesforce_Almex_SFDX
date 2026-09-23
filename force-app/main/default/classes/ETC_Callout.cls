public virtual with sharing class ETC_Callout {
	public endpoint__mdt mdt;
	public String claseApex;

	public class Callout {
		public Http http;
		public HttpRequest request;
		public HttpResponse response;
		public Callout(Http http, HttpRequest request, HttpResponse response) {
			this.http = http;
			this.request = request;
			this.response = response;
		}
	}

	public ETC_Callout() {
	}

	public ETC_Callout(String metadataName) {
		this.mdt = ETC_Utility.getEndpoint(metadataName);
	}

	public ETC_Callout(endpoint__mdt mdt) {
		this.mdt = mdt;
	}

	public virtual Callout createCallout(String metadataName) {
		endpoint__mdt mdt = mdt != null ? this.mdt : ETC_Utility.getEndpoint(metadataName);

		this.mdt = mdt;

		Http http = new Http();
		HttpRequest request = new HttpRequest();
		HttpResponse response = new HttpResponse();
		request.setEndpoint(mdt.host__c + mdt.path__c);
		request.setMethod(mdt.method__c);
		request.setHeader('Accept-Encoding', 'gzip, deflate, br');
		request.setHeader('Accept', '*/*');
		request.setHeader('Content-Type', 'application/json');
		request.setHeader('User-Agent', 'Salesforce');
		request.setHeader('Connection', 'Keep-Alive');
		// request.setCompressed(true);
		request.setTimeout(120000);
		return new Callout(http, request, response);
	}

	public virtual HttpResponse sendCallout(Callout callout) {
		callout.response = new HttpResponse();
		if (!Test.isRunningTest()) {
			callout.response = callout.http.send(callout.request);
		}
		return callout.response;
	}
}