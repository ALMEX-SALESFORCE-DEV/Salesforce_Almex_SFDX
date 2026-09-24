// Matriz de acceso total: pares (Profile.Name, UserRole.Name).
// Solo estos pares ven TODOS los campos del cotizador; el resto recibe la
// vista reducida. `role: null` = cualquier rol (o sin rol) para ese perfil.
// Nombres EXACTOS confirmados contra las orgs (SELECT Profile.Name,
// UserRole.Name FROM User).
export const FULL_ACCESS_MATRIX = [
	// Administradores: acceso total sin importar el rol (red de seguridad).
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
];

// Fail-closed: si el par (perfil, rol) no está en la matriz => sin acceso total.
// Cubre el estado inicial (false/null) antes de que resuelva el wire de usuario.
export function isFullAccess(profileName, roleName) {
	return FULL_ACCESS_MATRIX.some(
		(entry) =>
			entry.profile === profileName &&
			(entry.role === null || entry.role === roleName)
	);
}

// ---------------------------------------------------------------------------
// Visibilidad granular por campo/columna.
//
// Config central: cada clave es un identificador de campo/columna usado en el
// HTML como `fieldVisibility.<clave>`. Se OCULTAN a los perfiles SIN acceso
// total (vista reducida). Los de acceso total ven todo.
//
// Para ocultar un campo nuevo: agrega su clave aquí y envuelve su markup en
// `<template lwc:if={fieldVisibility.<clave>}>` en el HTML.
// ---------------------------------------------------------------------------
export const REDUCED_VIEW_HIDDEN_FIELDS = [
	// Market References - tabla supplies
	"basis", // columna Basis
	"fx", // columna Fx
	// Market References - tabla de referencias (Corn date, Fx, Inflation, etc.)
	"marketReferenceTable",
	// Sales Quotation Scenarios
	"scenarioCostTable", // tabla derecha de costos (Total Cost, SG&A, Flete...)
	"scenarioMarginColumns", // columnas A/B/C + Definitiva de la tabla de margen (deja solo D)
	// Calculations Breakdown - seccion completa
	"breakdownSection",
	// Sales Summary by Plant: Freight usd/mt siempre visible; se ocultan juntas
	// las columnas Ajuste Flete y Flete Final.
	"summaryFinalFreight"
];

// Devuelve un mapa { <clave>: boolean } donde true = visible para el usuario.
// El HTML consume `fieldVisibility.<clave>` en un lwc:if.
export function getFieldVisibility(profileName, roleName) {
	const fullAccess = isFullAccess(profileName, roleName);
	const visibility = {};
	for (const fieldKey of REDUCED_VIEW_HIDDEN_FIELDS) {
		visibility[fieldKey] = fullAccess;
	}
	return visibility;
}
