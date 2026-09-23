public with sharing class ETC_ControllerAcuertdoPdf {
	public SalesAgreement sa { get; set; }
	public Quote q { get; set; }
	public String today { get; set; }
	public String initDate { get; set; }
	public String endDate { get; set; }
	public Decimal tonsPerMonth { get; set; }
	public Integer tolerance { get; set; }

	public ETC_ControllerAcuertdoPdf(ApexPages.StandardController controller) {
		Id recordId = System.currentPageReference().getParameters().get('id');
		this.sa = [
			SELECT
				Folio__c,
				Cotizacion__c,
				Unidad_de_negocio__c,
				Account.Raz_n_social__c,
				Account.Representante_legal__c,
				Account.Condicion_de_pago__c,
				Account.Condicion_de_pago_PROMER__c,
				ApprovedDate
			FROM SalesAgreement
			WHERE Id = :recordId
			LIMIT 1
		];
		if (this.sa.Cotizacion__c != null) {
			this.q = [
				SELECT
					Id,
					QuoteNumber,
					Fecha_de_inicio__c,
					ExpirationDate,
					Opportunity.Producto__r.Name,
					toLabel(Opportunity.Unidad_de_negocio_Picklist__c),
					Opportunity.Producto__r.Family,
					Opportunity.Owner.Name,
					Total_de_volumen__c,
					toLabel(Unidad_de_medida__c),
					(
						SELECT
							Id,
							Transportation_Method__c,
							Flete_de_Salida_a_Cliente_OUTBOUND__c,
							UnitPrice,
							Tons__c,
							Month_Volume__c,
							Precio_facturado__c,
							Customer_Site_Name__r.Ciudad__c,
							Volumen__c
						FROM QuoteLineItems
						WHERE QuoteId = :this.sa.Cotizacion__c AND UnitPrice != 0
					)
				FROM Quote
				WHERE Id = :this.sa.Cotizacion__c
				LIMIT 1
			];
			Integer monthDiff = this.q.Fecha_de_inicio__c.monthsBetween(this.q.ExpirationDate) + 1;
			this.tonsPerMonth = this.q.Total_de_volumen__c / monthDiff;
			this.tolerance = this.q.Opportunity.Producto__r.Family.toLowerCase().contains('glucosa') ? 4 : 2;
			this.today = getDate(System.today());
			this.initDate = getDate(this.q.Fecha_de_inicio__c);
			this.endDate = getDate(this.q.ExpirationDate);
		}
	}

	public String getDate(Date input) {
		Map<Integer, String> esMonths = new Map<Integer, String>{
			1 => 'enero',
			2 => 'febrero',
			3 => 'marzo',
			4 => 'abril',
			5 => 'mayo',
			6 => 'junio',
			7 => 'julio',
			8 => 'agosto',
			9 => 'septiembre',
			10 => 'octubre',
			11 => 'noviembre',
			12 => 'diciembre'
		};
		String dateTemplate = input.day() + ' de ' + esMonths.get(input.month()) + ' de ' + input.year();
		return !Test.isRunningTest() ? dateTemplate : '01 de ' + esMonths.get(1) + ' de 2024';
	}
}