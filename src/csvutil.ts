import moment, { isMoment } from 'moment';
// https://www.papaparse.com/
import Papa from 'papaparse';
import { Property, ScheduleItem, TenantDetails } from './property';
import { DATE_FORMAT } from './App';

/**
 * These columns are used for the property input file as well as for the previous schedule input file.
 * The previous schedule input file also contains inspection columns
 */
const HEADER_FIELDS : {[header:string]:{name: string, type?: string, optional?:boolean}} = {
	'Property Street Address 1':{ name: 'address' },
	'Property City':{ name: 'city' },
	'Property State':{ name: 'state' },
	'Property Zip':{ name: 'zip', type: 'number' },
	'Unit':{ name: 'unit', optional: true},
	'Lease From':{ name: 'leaseStart', type: 'date', optional: true},
	'Lease To':{ name: 'leaseEnd', type: 'date', optional: true},
	'Move-out':{ name: 'moveOut', type: 'date', optional: true},
}

const TENANT_FIELDS : {[header:string]:{name: string, type?: string, optional?:boolean}} = {
	'Tenant':{ name: 'name', optional: true},
	'Phone Numbers':{ name: 'phone', optional: true},
	'Emails':{ name: 'email', optional: true},
};

const HEADER_INSPECTION_REGEX = /Inspection \d+/;
const HEADER_INSPECTION_PREFIX = 'Inspection ';

/**
 * These columns are used for the one-inspection-per-row export
 */
const HEADER_FIELDS_SCHEDULE : {[header:string]:{name: string, type?: string, sched?:boolean}} = {
	'Inspection Date': {name: 'date', sched: true, type: 'date' },
	'Inspection Number': {name: 'number', sched: true },
	'Property Street Address 1':{ name: 'address' },
	'Property City':{ name: 'city' },
	'Property State':{ name: 'state' },
	'Property Zip':{ name: 'zip', type: 'number' },
	'Unit':{ name: 'unit' },
	'Lease From':{ name: 'leaseStart', type: 'date' },
	'Lease To':{ name: 'leaseEnd', type: 'date' },
	'Move-out':{ name: 'moveOut', type: 'date' },
}

export function isCSV(f: File) : boolean {
	return f.name.endsWith('.csv');
}

/**
 * Parse a CSV of property instances, which may or may not include previous schedule and tenant information
 */
export function parseCsvProperties(f: File, done: (result: Property[]) => void, err: (msg: string) => void) : void {
	let props : Property[] = [];
	// let scheds : PropertySchedule[] = [];
	let line = 0;
	let hasSchedule = false;

	const config: Papa.ParseConfig = {
		header: true,
		worker: false,
		skipEmptyLines: true,

		// Detects whether the row contains headers; parses date/numeric values; return 'undefined' to indicate failure
		transform: (value, field) => {
			if (value.length <= 0) {
				const h = HEADER_FIELDS[field];
				// not a Property field
				if (!h) {
					if (HEADER_INSPECTION_REGEX.test(String(field))) {
						return undefined;
					}
					if (Object.keys(TENANT_FIELDS).find(k => k === field)) {
						return undefined;
					}
					// Handle this in 'step' where we can abort parse
					return value;
				}

				if (h.optional) {
					return undefined;
				}
				return '<no data>';
			}
			switch (HEADER_FIELDS[field]?.type) {
				case 'date': return moment(value, DATE_FORMAT);
				case 'number': return parseInt(value);
			}
			if (HEADER_INSPECTION_REGEX.test(String(field))) {
				return moment(value, DATE_FORMAT);
			}
			return value;
		},
		step: (results, parser) => {
			line++;
			if (results.errors.length > 0) {
				// add 2 assuming a header row is zero
				err(results.errors.map(pe => 'Line ' + (pe.row+2) + ': ' + pe.message).join());
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

			Object.keys(rowObj).forEach(key => {
				const h = HEADER_FIELDS[key];
				if (h) {
					(prop as any)[h.name] = rowObj[key];
				} else if (HEADER_INSPECTION_REGEX.test(key)) {
					const d = rowObj[key] as moment.Moment;
					if (d && d.isValid()) {
						let ps = prop.schedule ?? [];
						prop.schedule = ps;
						prop.schedule.push({
							d,
							isImport: true
						});
					}
				} else if (Object.keys(TENANT_FIELDS).find(k => k === key)) {
					const h = TENANT_FIELDS[key];
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

					(t as any)[h.name] = rowObj[key];
				} else {
					err('Unhandled column in input file: ' + key);
					parser.abort();
					return;
				}
			});

			// Sort inspections in case they are out of order in the input file
			prop.schedule?.sort((a,b) => a.d.unix() - b.d.unix());
			props.push(prop);
		},
		complete: () => {
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
	let extras : string[] = [];

	let out = data.map(p => {
		let rv : any = {};
		headers.forEach(h => {
			const head = HEADER_FIELDS[h];
			let v = (p as any)[head.name];

			switch (head?.type) {
				case 'date': v = (v as moment.Moment)?.format(DATE_FORMAT); break;
				//case 'number': return parseInt(value);
			}

			rv[h] = v;
		});
		p.schedule?.forEach((s,i) => {
			let t = HEADER_INSPECTION_PREFIX + (i+1);
			rv[t] = s.d.format(DATE_FORMAT);
			if (extras.length < (i + 1)) {
				extras.push(t);
			}
		});
		return rv;
	});

	return Papa.unparse(out, {
		skipEmptyLines: true,
		columns: [...headers, ...extras],
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
	}
	// First, transform the schedule into a sorted output
	let schedule : Row[] = [];
	data.forEach(p => {
		p.schedule?.forEach((s,i) => {
			schedule.push({
				p,
				date: s.d,
				number: i+1
			});
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

	let out = schedule.map(r => {
		let rv : any = {};
		headers.forEach(h => {
			const head = HEADER_FIELDS_SCHEDULE[h];
			let v = undefined;
			if (head.sched) {
				v = (r as any)[head.name];
			} else {
				v = (r.p as any)[head.name];
			}

			switch (head?.type) {
				case 'date': v = (v as moment.Moment)?.format(DATE_FORMAT); break;
				//case 'number': return parseInt(value);
			}

			rv[h] = v;
		});
		tenant.forEach(h => {
			const head = TENANT_FIELDS[h];
			let v = r.p.tenants?.map((t,i) => '['+(i+1)+'] ' + (t as any)[head.name]).join(' ');

			rv[h] = v;
		});
		return rv;
	});

	return Papa.unparse(out, {
		skipEmptyLines: true,
		columns: [...headers, ...tenant],
		newline: '\n',
	});
}