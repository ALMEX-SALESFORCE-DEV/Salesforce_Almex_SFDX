public with sharing class ETC_SavePdfServicio {
	public void attachPDF(String recordId, String pdfName) {
		PageReference pdfPage;

		if (pdfName == 'promer') {
			pdfPage = Page.ETC_PromerSalesAgreementPDF;
		} else {
			pdfPage = Page.ETC_AlmexSalesAgreementPDF;
		}

		pdfPage.getParameters().put('id', recordId);
		Blob pdfBlob = (!Test.isRunningTest()) ? pdfpage.getContentAsPDF() : blob.valueOf('Unit.Test');

		ContentVersion cv = new ContentVersion();
		cv.ContentLocation = 'S';
		cv.VersionData = pdfBlob;
		cv.FirstPublishLocationId = recordId;
		cv.Title = pdfName + '_sales_agreement';
		cv.PathOnClient = cv.Title + '.' + 'pdf';

		try {
			insert cv;
			System.debug(cv);
		} catch (Exception e) {
			System.debug('Error: ' + e.getMessage());
		}
	}

	@InvocableMethod(callout=true label='Save PDF in realated files')
	public static void savePdf(List<InvocableRequest> request) {
		ETC_SavePdfServicio savefile = new ETC_SavePdfServicio();
		savefile.attachPDF(request.get(0).recordId, request.get(0).pdfName);
	}

	public class InvocableRequest {
		@InvocableVariable
		public String recordId;
		@InvocableVariable
		public String pdfName;
	}
}