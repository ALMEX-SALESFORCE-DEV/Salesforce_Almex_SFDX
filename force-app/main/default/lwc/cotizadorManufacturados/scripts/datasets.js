import { generateUniqueId, roundAndAddZeros } from "./utils.js";

export const resultL = [
	{
		key: "left-a",
		read: true,
		option: "A",
		marginLabel: "Margin U",
		customerDeliv: { name: "customerDeliv", value: 0, read: true },
		exwUsd: { name: "exwUsd", value: 0, read: true },
		exwMxn: { name: "exwMxn", value: 0, read: true },
		totalMargin: { name: "totalMargin", value: 0, read: true },
		totalMarginUsdMt: { name: "totalMarginUsdMt", value: 0, read: false },
		totalMarginUsdDs: { name: "totalMarginUsdDs", value: 0, read: true }
	},
	{
		key: "left-b",
		read: true,
		option: "B",
		marginLabel: "Margin U",
		customerDeliv: { name: "customerDeliv", value: 0, read: true },
		exwUsd: { name: "exwUsd", value: 0, read: true },
		exwMxn: { name: "exwMxn", value: 0, read: true },
		totalMargin: { name: "totalMargin", value: 0, read: true },
		totalMarginUsdMt: { name: "totalMarginUsdMt", value: 0, read: false },
		totalMarginUsdDs: { name: "totalMarginUsdDs", value: 0, read: true }
	},
	{
		key: "left-c",
		read: true,
		option: "C",
		marginLabel: "Margin %",
		customerDeliv: { name: "customerDeliv", value: 0, read: true },
		exwUsd: { name: "exwUsd", value: 0, read: true },
		exwMxn: { name: "exwMxn", value: 0, read: true },
		totalMargin: { name: "totalMargin", value: 0, read: false },
		totalMarginUsdMt: { name: "totalMarginUsdMt", value: 0, read: true },
		totalMarginUsdDs: { name: "totalMarginUsdDs", value: 0, read: true }
	},
	{
		key: "left-d",
		read: true,
		option: "D",
		marginLabel: "Price",
		customerDeliv: { name: "customerDeliv", value: 0, read: true },
		exwUsd: { name: "exwUsd", value: 0, read: false },
		exwMxn: { name: "exwMxn", value: 0, read: true },
		totalMargin: { name: "totalMargin", value: 0, read: true },
		totalMarginUsdMt: { name: "totalMarginUsdMt", value: 0, read: true },
		totalMarginUsdDs: { name: "totalMarginUsdDs", value: 0, read: true }
	}
];

export const resultR = ({ sgaUsd = 0, coproductRecov = 0 }) => {
	return [
		{
			key: "right-a",
			option: "A",
			marginLabel: "Margin U",
			totalCost: { read: true, value: 0, name: "totalCost" },
			sgaUsd: { read: true, value: sgaUsd, name: "sgaUsd" },
			sgaMxn: { read: true, value: 0, name: "sgaMxn" },
			flete: { read: true, value: 0, name: "flete" },
			coproductRecov: { read: true, value: coproductRecov, name: "coproductRecov" },
			aditionalCost: { read: false, value: 0, name: "aditionalCost" }
		},
		{
			read: true,
			key: "right-b",
			option: "B",
			marginLabel: "Margin U",
			totalCost: { read: true, value: 0, name: "totalCost" },
			sgaUsd: { read: true, value: sgaUsd, name: "sgaUsd" },
			sgaMxn: { read: true, value: 0, name: "sgaMxn" },
			flete: { read: true, value: 0, name: "flete" },
			coproductRecov: { read: true, value: coproductRecov, name: "coproductRecov" },
			aditionalCost: { read: false, value: 0, name: "aditionalCost" }
		},
		{
			read: true,
			key: "right-c",
			option: "C",
			marginLabel: "Margin %",
			totalCost: { read: true, value: 0, name: "totalCost" },
			sgaUsd: { read: true, value: sgaUsd, name: "sgaUsd" },
			sgaMxn: { read: true, value: 0, name: "sgaMxn" },
			flete: { read: true, value: 0, name: "flete" },
			coproductRecov: { read: true, value: coproductRecov, name: "coproductRecov" },
			aditionalCost: { read: false, value: 0, name: "aditionalCost" }
		},
		{
			read: true,
			key: "right-d",
			option: "D",
			marginLabel: "Price",
			totalCost: { read: true, value: 0, name: "totalCost" },
			sgaUsd: { read: true, value: sgaUsd, name: "sgaUsd" },
			sgaMxn: { read: true, value: 0, name: "sgaMxn" },
			flete: { read: true, value: 0, name: "flete" },
			coproductRecov: { read: true, value: coproductRecov, name: "coproductRecov" },
			aditionalCost: { read: false, value: 0, name: "aditionalCost" }
		}
	];
};

export const breakdownHeaders = [
	{ id: generateUniqueId(), value: "Corn Price USD/Bushel", class: "row" },
	{ id: generateUniqueId(), value: "Exchange Rate", class: "row" },
	{ id: generateUniqueId(), value: "Month", class: "row" },
	{ id: generateUniqueId(), value: "Selling Price LAB Almex USD/MT", class: "row bold" },
	{ id: generateUniqueId(), value: "Net Corn Cost USD", class: "row bold" },
	{ id: generateUniqueId(), value: "COGS USD Variable", class: "row bold" },
	// { id: generateUniqueId(), value: "Net Corn Cost USD", class: "row bg-lorange" },
	// { id: generateUniqueId(), value: "Net Corn Cost USD", class: "row bg-lorange" },
	// { id: generateUniqueId(), value: "COGS USD Variable", class: "row bg-lorange" },
	// { id: generateUniqueId(), value: "COGS USD Variable", class: "row bg-lorange" },
	{ id: generateUniqueId(), value: "Variable Margin", class: "row bg-gray bold" },
	{ id: generateUniqueId(), value: "COGS USD Fixed", class: "row" },
	{ id: generateUniqueId(), value: "Direct Margin USD", class: "row bg-gray bold" },
	{ id: generateUniqueId(), value: "%", class: "row" },
	{ id: generateUniqueId(), value: "SG&A USD", class: "row bg-lorange" },
	{ id: generateUniqueId(), value: "PBIT USD", class: "row bg-gray bold" },
	{ id: generateUniqueId(), value: "%", class: "row" },
	{ id: generateUniqueId(), value: "Monthly Cost USD/MT", class: "row" },
	{ id: generateUniqueId(), value: "Net Corn Cost USD/Bushel", class: "row" },
	{ id: generateUniqueId(), value: "COGS USD/Bushel Variable", class: "row" },
	{ id: generateUniqueId(), value: "COGS USD/Bushel Fixed", class: "row" }
];

export const parseSupplies = (supplies = [], isUpdate) => {
	if (isUpdate) {
		return supplies.map((s, i) => ({ ...s, index: i + 1 }));
	}
	return supplies.map((s, index) => ({
		...s,
		index: index + 1,
		Corn__c: roundAndAddZeros(Number(s.Corn__c), 4),
		Basis__c: roundAndAddZeros(Number(s.Basis__c), 4),
		Fx__c: roundAndAddZeros(Number(s.Fx__c), 4),
		Gas__c: roundAndAddZeros(Number(s.Gas__c), 4)
	}));
};

export const references = {
	inflation: 0,
	cornUsage: 0
};

export const globalVolume = {
	pointsNumebr: "0",
	proposedMtons: "0",
	bookedMtons: "0"
};

export const referenceDates = {
	cornDate: "",
	basisDate: "",
	fxDate: "",
	gasDate: ""
};