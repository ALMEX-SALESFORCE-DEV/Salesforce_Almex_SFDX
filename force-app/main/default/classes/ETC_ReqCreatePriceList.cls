public class ETC_ReqCreatePriceList {
	public String PriceListName; // "0013_CI _0001_test_a"
	public String PriceListDescription; // "Precios_CI CERVEZA GMBH CY2020 - test"
	public String PriceListTypeCode; // "SEGMENT"
	public String BusinessUnit; // "BU_ALMEX"
	public String CurrencyCode; // "USD"
	public String StatusCode; // "APPROVED"
	public String StartDate; // "2024-12-04"
	public String EndDate; // "2024-12-04"
	public String PricingChargeDefinitionCode; // "QP_SALE_PRICE"
	public String LineTypeCode; // "ORA_BUY"
	public String CalculationMethodCode; // "PRICE"

	public String AssociationStartDate;
	public String AssociationEndDate;
	public String CustomerId;

	public List<Item> items;
	public List<AccessSet> accessSets;

	public class Item {
		public String Item;
		public String PricingUOMCode;
		public String PricingUOMDescription;
		public String LineTypeCode;
		public String PrimaryPricingUOM;
		public String ServiceDurationPeriodCode;
		public String ItemLevelCode;
		public String ItemLevel;
		public List<Charge> charges;
	}

	public class Charge {
		public String PricingChargeDefinitionCode;
		public String PricePeriodicityCode;
		public String CalculationMethodCode;
		public String CalculationTypeCode;
		public String AllowManualAdjustment;
		public Decimal BasePrice;
		public String CostCalculationAmount;
		public String StartDate;
		public String EndDate;
		public Integer ChargeLineNumber;
		public List<PricingMatrix> pricingMatrixes;
	}

	public class PricingMatrix {
		public String MatrixName;
		public List<MatrixRule> rules;
	}

	public class MatrixRule {
		public String Dimension1;
		public String Dimension1Value;
		public String Dimension1KeyValue;
		public String Dimension2;
		public String Dimension2Value;
		public String Dimension2KeyValue;
		public String Dimension3;
		public String Dimension3Value;
		public String Dimension3KeyValue;
		public String Dimension4;
		public String Dimension4Value;
		public String Dimension4KeyValue;
	}

	public class AccessSet {
		public String AccessSetCode;
	}

	public static String parse(ETC_ReqCreatePriceList modelData) {
		return JSON.serialize(modelData);
	}
}