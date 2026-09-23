import { generateUniqueId } from "./utils";

class DateUtils {
	static generateDate() {
		return this.formatDate(new Date());
	}

	static addDays(date, days) {
		const result = new Date(date);
		result.setUTCDate(result.getUTCDate() + days);
		return this.formatDate(result);
	}

	static addMonths(date, months) {
		const result = new Date(date);
		result.setUTCMonth(result.getUTCMonth() + months);
		return this.formatDate(result);
	}

	static addYears(date, years) {
		const result = new Date(date);
		result.setUTCFullYear(result.getUTCFullYear() + years);
		return this.formatDate(result);
	}

	static subtractDays(date, days) {
		return this.addDays(date, -days);
	}

	static subtractMonths(date, months) {
		return this.addMonths(date, -months);
	}

	static subtractYears(date, years) {
		return this.addYears(date, -years);
	}

	static getDateRangeDetails(startDate, endDate) {
		const start = new Date(startDate);
		const end = new Date(endDate);

		const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

		const yearA = start.getUTCFullYear();
		const yearB = end.getUTCFullYear();
		const monthA = monthNames[start.getUTCMonth()];
		const monthB = monthNames[end.getUTCMonth()];

		const totalMonths = (yearB - yearA) * 12 + (end.getUTCMonth() - start.getUTCMonth()) + 1;

		return {
			yearRange: `${yearA} to ${yearB}`,
			monthRange: `${monthA} - ${yearA} to ${monthB} - ${yearB}`,
			rangeMonth: Array.from({ length: totalMonths }, (_, i) => generateUniqueId()),
			totalMonths
		};
	}
	static formatDate(date) {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}
}

export default DateUtils;