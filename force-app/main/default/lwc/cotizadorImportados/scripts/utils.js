export function hasEmptyFields(products) {
	if (products.length === 0) return false;
	return products.some((product) => {
		return Object.values(product.fields).some((field) => {
			return field === "" || field.trim() === "";
		});
	});
}

export function removeEmptyFields(products) {
	return products.filter((product) => {
		return !Object.values(product.fields).some((field) => {
			return field === "" || field.trim() === "";
		});
	});
}

export function getPriceLabel(_, unitMeasure, currency = "usd") {
	const measureLabels = { mt: "Mton", kg: "Kg", lt: "Lt" };
	return `${currency.toUpperCase()}/${measureLabels[unitMeasure]}`;
}

export function getVolume(unitMeasure) {
	const labels = { mt: "M Tons", kg: "Kilograms", lt: "Litros" };
	return labels[unitMeasure];
}

export function getCalendarPeriods(start, end) {
	const startDate = new Date(`${start}T00:00:00-06:00`);
	const endDate = new Date(`${end}T00:00:00-06:00`);

	const totalMonths = calcularRangoDeMeses(startDate, endDate);

	return {
		calendarYearPeriod: `${startDate.getFullYear()} - ${endDate.getFullYear()}`,
		calendarPeriod: `${ESP_MONTH[startDate.getMonth()]} - ${startDate.getFullYear()} to ${
			ESP_MONTH[endDate.getMonth()]
		} - ${endDate.getFullYear()}`,
		totalMonths
	};
}

function calcularRangoDeMeses(fechaInicio, fechaFin) {
	const anios = fechaFin.getFullYear() - fechaInicio.getFullYear();
	const meses = fechaFin.getMonth() - fechaInicio.getMonth();

	return anios * 12 + meses + 1;
}

export function truncate(value, decimals, zeros = 3) {
	const roundVar = Math.pow(10, decimals);
	const roundNumber = Math.trunc(value * roundVar) / roundVar;
	return roundNumber.toFixed(zeros);
}

const ESP_MONTH = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export const sumProductDivide = (items, properties) => {
	if (!Array.isArray(items) || !Array.isArray(properties)) return 0;
	const sumProduct = items.reduce((acc, item) => {
		const product = properties.slice(0, 2).reduce((prodAcc, prop) => prodAcc * Number(item[prop]), 1);
		return acc + product;
	}, 0);
	const sumThirdArray = items.reduce((acc, item) => acc + Number(item[properties[2]]), 0);
	if (sumThirdArray === 0) return 0;
	return sumProduct / sumThirdArray;
};

export function averages(data) {
	const averages = {};
	const keys = Object.keys(data[0]);
	keys.forEach((key) => {
		if (typeof data[0][key] === "number") {
			const sum = data.reduce((acc, obj) => acc + obj[key], 0);
			averages[key] = sum / data.length;
		} else {
			averages[key] = data[0][key];
		}
	});
	return averages;
}

export function round(value, decimals, toNumber = false, extension = undefined) {
	const roundVar = Math.pow(10, decimals);
	const roundNumber = Math.round(value * roundVar) / roundVar;
	if (toNumber) {
		if (extension) {
			return Number(roundNumber.toFixed(decimals)).toFixed(extension);
		}
		return Number(roundNumber.toFixed(decimals));
	}
	return roundNumber.toFixed(decimals);
}