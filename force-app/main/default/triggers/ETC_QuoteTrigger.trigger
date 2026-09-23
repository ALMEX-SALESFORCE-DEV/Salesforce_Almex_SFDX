trigger ETC_QuoteTrigger on Quote(after update) {
	new ETC_QuoteTriggerHandler();
}