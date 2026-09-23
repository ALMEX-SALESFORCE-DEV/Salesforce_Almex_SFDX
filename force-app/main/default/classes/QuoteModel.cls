public with sharing class QuoteModel {
	@AuraEnabled
	public String listaOracle { get; set; }
	@AuraEnabled
	public String marketReferenceMetadata { get; set; }
	@AuraEnabled
	public Boolean isOil { get; set; }
	@AuraEnabled
	public String name { get; set; }
	@AuraEnabled
	public String opportunityId { get; set; }
	@AuraEnabled
	public String pricing { get; set; }
	@AuraEnabled
	public String volume { get; set; }
	@AuraEnabled
	public String products { get; set; }
	@AuraEnabled
	public String customerSites { get; set; }
	@AuraEnabled
	public String warehousePrice { get; set; }
	@AuraEnabled
	public String flete { get; set; }
	@AuraEnabled
	public String labTransfer { get; set; }
	@AuraEnabled
	public String shareholders { get; set; }
	@AuraEnabled
	public String productCost { get; set; }
	@AuraEnabled
	public String railroad { get; set; }
	@AuraEnabled
	public String operativeAlmidon { get; set; }
	@AuraEnabled
	public String operativePacking { get; set; }
	@AuraEnabled
	public String totalBuildCost { get; set; }
	@AuraEnabled
	public String profitMarginPercentage { get; set; }
	@AuraEnabled
	public String profitMargin { get; set; }
	@AuraEnabled
	public String totalProductCost { get; set; }
	@AuraEnabled
	public String isotank { get; set; }
	@AuraEnabled
	public String clientPortals { get; set; }
	@AuraEnabled
	public String dryStorage { get; set; }
	@AuraEnabled
	public String totalOperativeCost { get; set; }
	@AuraEnabled
	public String totalSalesCost { get; set; }
	@AuraEnabled
	public String marginBrute { get; set; }
	@AuraEnabled
	public String marginBruteNetSales { get; set; }
	@AuraEnabled
	public String overhead { get; set; }
	@AuraEnabled
	public String marginBeforeTaxes { get; set; }
	@AuraEnabled
	public String netMarginBeforeSales { get; set; }
	@AuraEnabled
	public String ptu { get; set; }
	@AuraEnabled
	public String isr { get; set; }
	@AuraEnabled
	public String netMargin { get; set; }
	@AuraEnabled
	public String incrementalCostPercentage { get; set; }
	@AuraEnabled
	public String incrementalCostRebate { get; set; }
	@AuraEnabled
	public String exwIncrementals { get; set; }
	@AuraEnabled
	public String finantialCostPercentage { get; set; }
	@AuraEnabled
	public String finantialCost { get; set; }
	@AuraEnabled
	public String exwFinantialCost { get; set; }
	@AuraEnabled
	public String literProductCost { get; set; }
	@AuraEnabled
	public String transferStationCost { get; set; }
	@AuraEnabled
	public String accountCreditDays { get; set; }

	public class QuoteConfigs {
		@AuraEnabled
		public String literOutput { get; set; }
		@AuraEnabled
		public String pointsNumebr { get; set; }
		@AuraEnabled
		public String proposedMtons { get; set; }
		@AuraEnabled
		public String bookedMtons { get; set; }
		@AuraEnabled
		public String startDate { get; set; }
		@AuraEnabled
		public String endDate { get; set; }
		@AuraEnabled
		public String textPeriod { get; set; }
		@AuraEnabled
		public String yearPeriod { get; set; }
		@AuraEnabled
		public String unitMeasure { get; set; }
		@AuraEnabled
		public Boolean incrementalCost { get; set; }
		@AuraEnabled
		public Boolean haveIncrementalDays { get; set; }
		@AuraEnabled
		public Decimal incrementalDays { get; set; }
		@AuraEnabled
		public String plant { get; set; }
		@AuraEnabled
		public String quoteCode { get; set; }
		@AuraEnabled
		public String comments { get; set; }
		@AuraEnabled
		public String totalMonths { get; set; }
		@AuraEnabled
		public String version { get; set; }
		@AuraEnabled
		public String cornUsage { get; set; }
		@AuraEnabled
		public String customerDeliv { get; set; }
		@AuraEnabled
		public String exwAlmexUsd { get; set; }
		@AuraEnabled
		public String exwAlmexMxn { get; set; }
		@AuraEnabled
		public String totalMarginPercentage { get; set; }
		@AuraEnabled
		public String totalMarginUsdMt { get; set; }
		@AuraEnabled
		public String totalMarginUsdDs { get; set; }
		@AuraEnabled
		public String totalCostUstMt { get; set; }
		@AuraEnabled
		public String sgaUsdMt { get; set; }
		@AuraEnabled
		public String sgaMxnMt { get; set; }
		@AuraEnabled
		public String fleteUstMt { get; set; }
		@AuraEnabled
		public String coproductRecov { get; set; }
		@AuraEnabled
		public String additionalCostPercentage { get; set; }
		@AuraEnabled
		public String cornDate { get; set; }
		@AuraEnabled
		public String basisDate { get; set; }
		@AuraEnabled
		public String fxDate { get; set; }
		@AuraEnabled
		public String gasDate { get; set; }
		@AuraEnabled
		public String inflation { get; set; }
		@AuraEnabled
		public String leftDataset { get; set; }
		@AuraEnabled
		public String rightDataset { get; set; }
		@AuraEnabled
		public String currentCurrency { get; set; }
		@AuraEnabled
		public String convertionCurrency { get; set; }
		@AuraEnabled
		public String textMarketReference { get; set; }
	}
}