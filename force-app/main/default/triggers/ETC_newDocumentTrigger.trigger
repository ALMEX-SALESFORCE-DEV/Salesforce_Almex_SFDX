trigger ETC_newDocumentTrigger on ContentVersion(before insert, after insert) {
	if (Trigger.isAfter) {
		for (ContentVersion cv : Trigger.new) {
			if (cv.sobject__c == 'order-document') {
				// obtener el id de la linea de pedido
				Documento__c[] documentRecord = [SELECT Id FROM Documento__c WHERE DOCUMENT_XID__c = :cv.recordId__c];
				if (documentRecord.size() > 0) {
					List<ContentDocumentLink> cdlList = [
						SELECT Id, LinkedEntityId
						FROM ContentDocumentLink
						WHERE LinkedEntityId = :documentRecord[0].Id AND ContentDocumentId = :cv.ContentDocumentId
					];
					System.debug(cdlList);
					if (cdlList.size() == 0) {
						ContentDocumentLink cdl = new ContentDocumentLink();
						cdl.ContentDocumentId = cv.ContentDocumentId;
						cdl.LinkedEntityId = documentRecord[0].Id;
						cdl.ShareType = 'V';
						cdl.Visibility = 'AllUsers';
						insert cdl;
					}
				}
			}
		}
	} else {
		for (ContentVersion cv : Trigger.new) {
			if (cv.sobject__c == 'order-document') {
				List<ContentVersion> cvList = [
					SELECT ContentDocumentId
					FROM ContentVersion
					WHERE sobject__c = :cv.sobject__c AND recordId__c = :cv.recordId__c AND Title = :cv.Title
					LIMIT 1
				];
				cv.PathOnClient = cv.Title;
				if (cvList.size() > 0) {
					cv.ContentDocumentId = cvList[0].ContentDocumentId;
				}
			}
		}
	}
}