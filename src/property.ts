import moment from 'moment';
import { ScheduleItem } from './scheduler';

export interface Property {
	pid: string;
	address: string;
	city?: string;
	state?: string;
	zip?: number;
	unit?: string;
	leaseStart?: moment.Moment;
	leaseEnd?: moment.Moment;
	moveOut?: moment.Moment;

	scheduleMessage?: string;
	schedule?: ScheduleItem[];
	tenants?: TenantDetails[];
}

export interface TenantDetails {
	tid: string;
	name: string;
	phone?: string;
	email?: string;
}

export function pstring(p: Property) : string {
	if (!p.unit) {
		return p.address;
	}
	return p.address + ' ' + p.unit;
}

/**
 * Merge tenant details into the base property list.
 * Throw a string on error
 */
export function mergeTenants(base: Property[], tenants: Property[]) : Property[] {
	let rv = [...base];
	// Flush existing tenant lists
	base.forEach(p => p.tenants = undefined);

	tenants.filter(tp => tp.tenants).forEach(tp => {
		const blank = tp.tenants!.some(t => !t.name || t.name.length == 0);
		if (blank) {
			//throw 'Missing tenant name: ' + tp.address;
			console.log('Skipping tenant property with missing name for address ' + tp.address);
			return;
		}

		// Find the property matching the tenant entry
		let prop = base.find(p =>
			p.address === tp.address &&
			p.city === tp.city &&
			p.state === tp.state &&
			p.zip === tp.zip &&
			(p.unit ? p.unit === tp.unit : true) // if base prop has no unit, ignore the comparison
		);
		if (prop) {
			if (!prop.tenants) {
				prop.tenants = [];
			}
			tp.tenants?.forEach(t => prop!.tenants!.push(t));
		}
	});

	return rv;
}

/**
 * Merge tenant details into the base property list.
 * Throw a string on error
 */
export function mergeSchedules(base: Property[], prev: Property[]) : Property[] {
	let rv = [...base];
	base.forEach(p => {
		let prop = prev.find(pp =>
			p.address === pp.address &&
			p.city === pp.city &&
			p.state === pp.state &&
			p.zip === pp.zip &&
			(p.unit ? p.unit === pp.unit : true) // if base prop has no unit, ignore the comparison
		);

		// flush or overwrite schedule
		p.schedule = prop?.schedule ?? [];

		// if lease dates changed, flush schedule
		if (prop?.leaseStart !== p.leaseStart || prop?.leaseEnd !== p.leaseEnd) {
			p.schedule = [];
			if (prop) {
				console.log('Lease dates changed for ' + pstring(p) + ', generating new schedule');
			}
		} else {
			console.log('Lease dates imported for ' + pstring(p));
		}
	});

	return rv;
}
