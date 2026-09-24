import {
	FULL_ACCESS_MATRIX,
	isFullAccess,
	REDUCED_VIEW_HIDDEN_FIELDS,
	getFieldVisibility
} from "../scripts/profileAccess.js";

describe("isFullAccess", () => {
	it("System Administrator tiene acceso total con cualquier rol", () => {
		expect(isFullAccess("System Administrator", null)).toBe(true);
		expect(isFullAccess("System Administrator", "Cualquier Rol")).toBe(true);
	});

	it("Contraloría requiere el rol Contraloría", () => {
		expect(isFullAccess("Contraloría", "Contraloría")).toBe(true);
		expect(isFullAccess("Contraloría", "Otro Rol")).toBe(false);
	});

	it("Gerencia y Dirección Comercial solo con rol Equipo Directivo", () => {
		expect(
			isFullAccess("Gerencia y Dirección Comercial", "Equipo Directivo")
		).toBe(true);
		// Colaterales del mismo perfil pero otro rol NO tienen acceso
		expect(
			isFullAccess("Gerencia y Dirección Comercial", "Gerente comercial México")
		).toBe(false);
	});

	it("Planeacion y contratos: los cuatro roles listados tienen acceso", () => {
		expect(
			isFullAccess("Planeacion y contratos", "Planeador de la demanda")
		).toBe(true);
		expect(
			isFullAccess(
				"Planeacion y contratos",
				"Gerente de Planeación y contratos"
			)
		).toBe(true);
		expect(
			isFullAccess(
				"Planeacion y contratos",
				"Analista de administración de contratos/precios"
			)
		).toBe(true);
		expect(
			isFullAccess(
				"Planeacion y contratos",
				"Coordinador de Administración de contratos"
			)
		).toBe(true);
	});

	it("un perfil/rol fuera de la matriz no tiene acceso", () => {
		expect(
			isFullAccess("Supervisor y Ejecutivo Comercial", "Ejecutivo Comercial")
		).toBe(false);
		expect(isFullAccess("Planeacion y contratos", "Rol Inventado")).toBe(false);
	});

	it("fail-closed: valores sin resolver no tienen acceso", () => {
		expect(isFullAccess(false, null)).toBe(false);
		expect(isFullAccess(undefined, undefined)).toBe(false);
	});

	it("la matriz contiene los pares esperados", () => {
		expect(FULL_ACCESS_MATRIX).toEqual([
			{ profile: "System Administrator", role: null },
			{ profile: "Contraloría", role: "Contraloría" },
			{ profile: "Gerencia y Dirección Comercial", role: "Equipo Directivo" },
			{ profile: "Planeacion y contratos", role: "Planeador de la demanda" },
			{
				profile: "Planeacion y contratos",
				role: "Gerente de Planeación y contratos"
			},
			{
				profile: "Planeacion y contratos",
				role: "Analista de administración de contratos/precios"
			},
			{
				profile: "Planeacion y contratos",
				role: "Coordinador de Administración de contratos"
			}
		]);
	});
});

describe("getFieldVisibility", () => {
	it("acceso total ve todos los campos controlados", () => {
		const visibility = getFieldVisibility("Contraloría", "Contraloría");
		for (const fieldKey of REDUCED_VIEW_HIDDEN_FIELDS) {
			expect(visibility[fieldKey]).toBe(true);
		}
	});

	it("vista reducida oculta los campos marcados", () => {
		const visibility = getFieldVisibility(
			"Supervisor y Ejecutivo Comercial",
			"Ejecutivo Comercial"
		);
		for (const fieldKey of REDUCED_VIEW_HIDDEN_FIELDS) {
			expect(visibility[fieldKey]).toBe(false);
		}
	});

	it("oculta basis en vista reducida y lo muestra con acceso total", () => {
		expect(getFieldVisibility("Contraloría", "Contraloría").basis).toBe(true);
		expect(
			getFieldVisibility(
				"Supervisor y Ejecutivo Comercial",
				"Ejecutivo Comercial"
			).basis
		).toBe(false);
	});

	it("fail-closed: usuario sin resolver recibe la vista reducida", () => {
		expect(getFieldVisibility(false, null).basis).toBe(false);
	});
});
