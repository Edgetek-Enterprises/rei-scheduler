import moment, { isMoment } from 'moment';
// https://www.papaparse.com/
import Papa from 'papaparse';
import { Property, TenantDetails } from '../property';
import { DATE_FORMAT } from '../App';

export enum CsvType {
	PropertiesBase,
	PropertiesTenants,
	PropertiesSchedules,
	PropertiesLastInspection,
}

interface CsvHeader {
	title: string;
	field: string;
	type?: undefined | 'number' | 'date';
	isImportOptional?: boolean;
	/** If true, will go as part of the schedule, otherwise will be a part of the property */
	isSchedField?: boolean;
}

const HEADER_FIELDS_LIST : CsvHeader[] = [
	{ title: 'Property Street Address 1', field: 'address' },
	{ title: 'Property City', field: 'city' },
	{ title: 'Property State', field: 'state' },
	{ title: 'Property Zip', field: 'zip', type: 'number' },
	{ title: 'Unit', field: 'unit', isImportOptional: true},
	{ title: 'Lease From', field: 'leaseStart', type: 'date', isImportOptional: true},
	{ title: 'Lease To', field: 'leaseEnd', type: 'date', isImportOptional: true},
	{ title: 'Move-out', field: 'moveOut', type: 'date', isImportOptional: true},
];
const TENANT_FIELDS_LIST : CsvHeader[] = [
	{ title: 'Tenant', field: 'name', isImportOptional: true},
	{ title: 'Phone Numbers', field: 'phone', isImportOptional: true},
	{ title: 'Emails', field: 'email', isImportOptional: true},
];

const HEADER_FIELDS_SCHEDULE_LIST : CsvHeader[] = [
	{ title: 'Inspection Date', field: 'date', isSchedField: true, type: 'date' },
	{ title: 'Inspection Number', field: 'number', isSchedField: true },
	{ title: 'Property Street Address 1', field: 'address' },
	{ title: 'Property City',  field: 'city' },
	{ title: 'Property State', field: 'state' },
	{ title: 'Property Zip', field: 'zip', type: 'number' },
	{ title: 'Unit', field: 'unit' },
	{ title: 'Lease From', field: 'leaseStart', type: 'date' },
	{ title: 'Lease To', field: 'leaseEnd', type: 'date' },
	{ title: 'Move-out', field: 'moveOut', type: 'date' },
	{ title: 'Inspection Type', field: 'type', isSchedField: true },
];

const HEADER_INSPECTION_REGEX = /Inspection \d+/;
const HEADER_INSPECTION_PREFIX = 'Inspection ';
const HEADER_FIRST_COLUMN = HEADER_FIELDS_LIST[0].title;
const FIRST_COLUMN_TOTAL_VALUE = 'Total';

/**
 * These columns are used for the property input file as well as for the previous schedule input file.
 * The previous schedule input file also contains inspection columns
 */
export const HEADER_FIELDS : {[title:string]: CsvHeader} = {};
HEADER_FIELDS_LIST.reduce((p,c) => { p[c.title] = c; return p; } , HEADER_FIELDS);

/**
 * Additional columns used in the tenant data import
 */
export const TENANT_FIELDS : {[title:string]: CsvHeader} = {};
TENANT_FIELDS_LIST.reduce((p,c) => { p[c.title] = c; return p; } , TENANT_FIELDS);

/**
 * These columns are used for the one-inspection-per-row export
 */
const HEADER_FIELDS_SCHEDULE : {[title:string]: CsvHeader} = {};
HEADER_FIELDS_SCHEDULE_LIST.reduce((p,c) => { p[c.title] = c; return p; } , HEADER_FIELDS_SCHEDULE);


export function isCSV(f: File) : boolean {
	return f.name.endsWith('.csv');
}

/**
 * Parse a CSV of property instances, which may or may not include previous schedule and tenant information
 */
export function parseCsvProperties(f: File, t: CsvType, done: (result: Property[]) => void, err: (msg: string) => void) : void {
	let props : Property[] = [];
	let line = 0;
	let hasSchedule = false;

	const NODATA = '<no data>';

	const config: Papa.ParseConfig = {
		header: true,
		worker: false,
		skipEmptyLines: false,

		// parses date/numeric values; return 'undefined' to indicate no value (convert from empty string in most cases) or NODATA
		transform: (value, field) => {
			// If the value for this column is an empty string
			if (value.length <= 0) {
				const h = HEADER_FIELDS[field];
				// not an expected column; this only handles empty values, step() handles failing due to unexpected column title
				if (!h) {
					if (t == CsvType.PropertiesSchedules && HEADER_INSPECTION_REGEX.test(String(field))) {
						return undefined;
					}
					if (t == CsvType.PropertiesTenants && Object.keys(TENANT_FIELDS).find(k => k === field)) {
						return undefined;
					}
					// Handle this in 'step' where we can abort parse
					return value;
				}

				if (h.isImportOptional) {
					// convert empty string to undefined value
					return undefined;
				}
				// First column can have undefined value indicating a blank row; other rows get NODATA
				if (field === HEADER_FIRST_COLUMN) {
					return undefined;
				}
				return NODATA;
			}

			//TODO: this perhaps could be done in Papa.ParseConfig.dynamicTyping
			switch (HEADER_FIELDS[field]?.type) {
				case 'date': return moment(value, DATE_FORMAT);
				case 'number': return parseInt(value);
			}
			if (t == CsvType.PropertiesSchedules && HEADER_INSPECTION_REGEX.test(String(field))) {
				return moment(value, DATE_FORMAT);
			}
			return value;
		},
		step: (results, parser) => {
			line++;
			if (results.errors.length > 0) {
				if (results.errors.length == 1) {
					if (results.errors[0].code === 'TooFewFields') {
						console.log('Skipping empty line ' + (line+1));
						return;
					}
				}
				// add 1 assuming a header row is uncounted and the first row is zero
				err(results.errors.map(pe => 'Line ' + (pe.row+1) + ': ' + pe.message).join());
				parser.abort();
				return;
			}

			let prop : Property = {
				pid: ''+line,
				address: '',
			};

			//HACK: to fix bug in lib; if streaming with a header, this is an object and not an array
			let rowObj : any | undefined;
			if (typeof results.data === 'object') {
				rowObj = results.data as any;
			}
			if (!rowObj) {
				err('Internal error; failed to parse CSV row with headers');
				parser.abort();
				return;
			}

			const empty = Object.keys(rowObj).every(key => !rowObj[key] || String(rowObj[key]).trim().length == 0 || rowObj[key] === NODATA);
			if (empty) {
				console.log('Skipping empty line ' + (line+1));
				return;
			}
			const totalRow = rowObj[HEADER_FIRST_COLUMN] === FIRST_COLUMN_TOTAL_VALUE;
			if (totalRow) {
				console.log('Skipping \'' + FIRST_COLUMN_TOTAL_VALUE +'\' row ' + (line+1));
				return;
			}

			Object.keys(rowObj).forEach(key => {
				const h = HEADER_FIELDS[key];
				if (h) {
					if (h.type == 'number') {
						if (isNaN(rowObj[key])) {
							err('Invalid data \'' + rowObj[key] + '\' for column \'' + key + '\' in row ' + (line+1));
							parser.abort();
							return;
						}
					}
					(prop as any)[h.field] = rowObj[key];
				} else if (t == CsvType.PropertiesSchedules && HEADER_INSPECTION_REGEX.test(key)) {
					const d = rowObj[key] as moment.Moment;
					if (d && d.isValid()) {
						let ps = prop.schedule ?? [];
						prop.schedule = ps;
						prop.schedule.push({
							d,
							isImport: true
						});
					}
				} else if (t == CsvType.PropertiesTenants && Object.keys(TENANT_FIELDS).find(k => k === key)) {
					const ht = TENANT_FIELDS[key];
					if (!prop.tenants) {
						prop.tenants = [];
					}
					let t : TenantDetails | undefined = prop.tenants.find(pt => pt.tid === ''+line);
					if (!t) {
						t = {
							tid: ''+line,
							name: '',
						};
						prop.tenants.push(t);
					}

					(t as any)[ht.field] = rowObj[key];
				} else {
					// Don't allow unexpected columns from these import types
					if (t == CsvType.PropertiesSchedules || t == CsvType.PropertiesLastInspection) {
						err('Unhandled column in input file: ' + key);
						parser.abort();
						return;
					}

					prop.extra = prop.extra ?? {};
					prop.extra[key] = rowObj[key];
				}
			});

			// Sort inspections in case they are out of order in the input file
			prop.schedule?.sort((a,b) => a.d.unix() - b.d.unix());
			props.push(prop);
		},
		complete: (results) => {
			console.log('Parsed ' + props.length + ' properties' + (hasSchedule ? ' and schedules' : ''));
			done(props);
		}
	};
	Papa.parse(f, config);
}

/**
 * Generates CSV of inspection schedule, one property per row
 */
export function toCSVInspections(data: Property[]) : string {
	const headers = Object.keys(HEADER_FIELDS);
	let inspections : string[] = [];
	let extra : string[] = [];

	let out = data.map(p => {
		let rv : any = {};
		headers.forEach(h => {
			const head = HEADER_FIELDS[h];
			let v = (p as any)[head.field];

			switch (head?.type) {
				case 'date': v = (v as moment.Moment)?.format(DATE_FORMAT); break;
				//case 'number': return parseInt(value);
			}

			rv[h] = v;
		});
		p.schedule?.forEach((s,i) => {
			let t = HEADER_INSPECTION_PREFIX + (i+1);
			rv[t] = s.d.format(DATE_FORMAT);
			if (inspections.length < (i + 1)) {
				inspections.push(t);
			}
		});
		Object.keys(p.extra ?? {}).forEach(kx => {
			if (!extra.includes(kx)) {
				extra.push(kx);
			}
		});

		extra.forEach(h => {
			let v = p.extra?.[h];
			if (v) {
				rv[h] = v;
			}
		})

		return rv;
	});

	[...headers, ...inspections].forEach(h => {
		if (extra.includes(h)) {
			console.log('Warning: exported property contains natural field and unexpected/custom imported column: "'+h+'"');
		}
	})

	return Papa.unparse(out, {
		skipEmptyLines: true,
		columns: [...headers, ...extra, ...inspections],
		newline: '\n',
	});
}

/**
 * Generates CSV of inspection schedule, one inspection per row
 */
export function toCSVSchedule(data: Property[]) : string {
	interface Row {
		p: Property;
		date: moment.Moment;
		number: number;
		type: string;
	}
	// First, transform the schedule into a sorted output
	let schedule : Row[] = [];
	let extra : string[] = [];
	data.forEach(p => {
		p.schedule?.forEach((s,i) => {
			schedule.push({
				p,
				date: s.d,
				number: i+1,
				type: s.isMoveOut ? 'Move-out' : 'Quarterly',
			});
		});
		Object.keys(p.extra ?? {}).forEach(kx => {
			if (!extra.includes(kx)) {
				extra.push(kx);
			}
		});
	});
	schedule.sort((a,b) => {
		const d = a.date.unix() - b.date.unix();
		if (d != 0) {
			return d;
		}
		return a.p.address.localeCompare(b.p.address);
	});

	const headers = Object.keys(HEADER_FIELDS_SCHEDULE);
	const tenant = Object.keys(TENANT_FIELDS);

	[...headers, ...tenant].forEach(h => {
		if (extra.includes(h)) {
			console.log('Warning: exported property contains natural field and unexpected/custom imported column: "'+h+'"');
		}
	})

	let out = schedule.map(r => {
		let rv : any = {};
		headers.forEach(h => {
			const head = HEADER_FIELDS_SCHEDULE[h];
			let v = undefined;
			if (head.isSchedField) {
				v = (r as any)[head.field];
			} else {
				v = (r.p as any)[head.field];
			}

			switch (head?.type) {
				case 'date': v = (v as moment.Moment)?.format(DATE_FORMAT); break;
				//case 'number': return parseInt(value);
			}

			rv[h] = v;
		});
		tenant.forEach(h => {
			const head = TENANT_FIELDS[h];
			let v = r.p.tenants?.map((t,i) => '['+(i+1)+'] ' + (t as any)[head.field]).join(' ');

			rv[h] = v;
		});
		extra.forEach(h => {
			let v = r.p.extra?.[h];
			if (v) {
				rv[h] = v;
			}
		})

		return rv;
	});

	return Papa.unparse(out, {
		skipEmptyLines: true,
		columns: [...headers, ...tenant, ...extra],
		newline: '\n',
	});
}
