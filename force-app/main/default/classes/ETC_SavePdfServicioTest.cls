@IsTest
public with sharing class ETC_SavePdfServicioTest {
	@TestSetup
	static void makeData() {
		Account acc = new Account();
		acc.Name = 'acc';
		insert acc;

		Opportunity opp = new Opportunity();
		opp.Name = 'opp';
		opp.AccountId = acc.Id;
		opp.StageName = 'Nuevo';
		opp.CloseDate = Date.newInstance(2023, 8, 15);
		insert opp;

		Quote newQuote = new Quote(Name = 'Test Example', OpportunityId = opp.Id);
		insert newQuote;
	}

	@IsTest
	static void addFileToRecord() {
		Quote quoteRecord = [SELECT Id FROM Quote LIMIT 1];
		ETC_SavePdfServicio.InvocableRequest request = new ETC_SavePdfServicio.InvocableRequest();
		request.recordId = quoteRecord.Id;
		request.pdfName = 'almex';
		Test.startTest();
		ETC_SavePdfServicio.savePdf(new List<ETC_SavePdfServicio.InvocableRequest>{ request });
		Test.stopTest();
		List<ContentDocumentLink> cdls = [SELECT Id FROM ContentDocumentLink WHERE LinkedEntityId = :quoteRecord.Id];
		System.assertEquals(1, cdls.size(), 'File was not created');
	}
}