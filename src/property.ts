import moment from 'moment';

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

export interface ScheduleItem {
	d: moment.Moment;
	isImport?: boolean;
	isAsap?: boolean;
}

export interface ScheduleOptions {
	scheduleStart: moment.Moment;
	scheduleMax: moment.Moment;
	maxPerDay: number;
	maxPerWeek: number;
	pushBlackout: (d: moment.Moment) => moment.Moment;
}

interface ScheduleEntry {
	p: Property;
	si: ScheduleItem;
}

function sortSchedule(s: ScheduleEntry[]) {
	s.sort((a,b) => {
		const d = a.si.d.unix() - b.si.d.unix();
		if (d != 0) {
			return d;
		}

		// Group by zip code
		const z = (a.p.zip ?? 0) - (b.p.zip ?? 0);
		if (z != 0) {
			return z;
		}

		const c = (a.p.city ?? '').localeCompare(b.p.city ?? '');
		if (c != 0) {
			return c;
		}
		return a.p.address.localeCompare(b.p.address);
	});
}

//TODO: need a way to pass errors out
export function buildSchedule(data: Property[], options: ScheduleOptions, prev: Property[] | undefined) : Property[] {
	let scheduledProps = [...data];

	if (prev) {
		//TODO: incorporate previous schedule into base schedule
	}

	scheduledProps = computeScheduleDates(scheduledProps, options);

	// transform the schedule into discrete events
	let schedule : ScheduleEntry[] = [];
	scheduledProps.forEach(p => {
		p.schedule!.forEach((s,i) => {
			schedule.push({
				p,
				si: s,
			});
		});
	});
	sortSchedule(schedule);

	// Apply scheduling to all discrete schedule events
	schedule = applyScheduleConstraints(schedule, options);

	// Recombine schedule events back into properties
	let out : { [pid:string] : Property } = {};
	schedule.forEach(s => {
		let p : Property = out[s.p.pid];
		if (!p) {
			p = { ...s.p, schedule: []};
			out[s.p.pid] = p;
		}
		p.schedule?.push(s.si);
	});
	// Also add back properties that didn't get scheduled
	scheduledProps.filter(p => p.schedule!.length === 0).forEach(p => {
		out[p.pid] = {
			...p,
			scheduleMessage: p.scheduleMessage,
			schedule: [],
		};
	});

	return Object.keys(out).map(k => out[k]);
}

function computeScheduleDates(data: Property[], options: ScheduleOptions) : Property[] {
	// build schedule starting tomorrow (no inspections today)

	let rv = data.map<Property>(p => {
		let ps : Property = {
			...p,
		};
		if (!ps.schedule) {
			ps.schedule = [];
		}

		// Skip handling of empty units
		if (!p.leaseStart && !p.leaseEnd) {
			p.scheduleMessage = 'Unoccupied';
			return ps;
		}

		if (!p.leaseStart) {
			p.scheduleMessage = 'Missing lease start';
			//console.log('Error in property ' + p.address + ', missing lease start');
			return ps;
		}

		const start = p.leaseStart!;
		let scheduleStart = moment(start).add(3, 'months');
		if (scheduleStart.isBefore(options.scheduleStart)) {
			scheduleStart = options.scheduleStart;
		}
		const scheduleMax = moment(options.scheduleStart).add(3, 'years');

		if (!p.leaseEnd) {
			//TODO: look for existing schedule items
			for (let date = moment(scheduleStart); date.isBefore(scheduleMax); date.add(3, 'months')) {
				ps.schedule!.push({ d: moment(date) });
			}

			return ps;
		}

		const end = p.leaseEnd!;
		let scheduleEnd = moment(end).add(-3, 'months');
		if (scheduleEnd.isAfter(scheduleMax)) {
			scheduleEnd = scheduleMax;
		}

		if (end.isBefore(options.scheduleStart)) {
			ps.scheduleMessage = 'Term ended';
			return ps;
		}

		if (scheduleEnd.isBefore(options.scheduleStart)) {
			ps.scheduleMessage = 'Term end is too soon';
			//console.log('Error in property ' + p.address + ', term end is too soon to schedule dates');
			return ps;
		}

		//TODO: look for existing schedule items
		if (scheduleEnd.isBefore(scheduleStart)) {
			// property term is narrower than the configured window, schedule asap
			console.log('Property ' + p.pid + ' ' + p.address + ', has short term, need to schedule asap');
			ps.schedule!.push({ d: moment(options.scheduleStart), isAsap: true });
		}

		// schedule the first one at start, then every 3 months (every quarter year)
		for (let date = moment(scheduleStart); date.isBefore(scheduleEnd); date.add(3, 'months')) {
			ps.schedule!.push({ d: moment(date) });
		}

		// didn't schedule anything - go ahead and push one
		if (ps.schedule!.length == 0) {
			ps.schedule!.push({ d: moment(options.scheduleStart) });
		}

		return ps;
	});

	return rv;
}

function applyScheduleConstraints(schedule: ScheduleEntry[], options: ScheduleOptions) : ScheduleEntry[] {
	let rv = schedule;
	let start = 0;
	let curr = start;

	while (curr < rv.length) {
		let entry = rv[curr];
		if (entry.si.isImport) {
			++curr;
			start = curr;
			continue;
		}
		let date = entry.si.d;
		if (date.isAfter(options.scheduleMax)) {
			rv = rv.splice(curr, 1);
			curr = start;
			continue;
		}

		let open = options.pushBlackout(date);
		if (!date.isSame(open)) {
			entry.si.d = open;
			sortSchedule(rv);
			curr = start;
			continue;
		}

		const sameDay = rv.filter((se,i) => i != curr && se.si.d.isSame(date));
		if (sameDay.length > options.maxPerDay - 1) {
			capacityShift(sameDay, options.maxPerDay - 1);
			sortSchedule(rv);
			curr = start;
			continue;
		}

		const sameWeek = rv.filter((se,i) => i != curr && se.si.d.week() == date.week());
		if (sameWeek.length > options.maxPerWeek - 1) {
			capacityShift(sameWeek, options.maxPerWeek - 1);
			sortSchedule(rv);
			curr = start;
			continue;
		}

		function capacityShift(same: ScheduleEntry[], max: number) {
			let countToMove = same.length - max;
			let toMove : ScheduleEntry[] = [];
			let sameGroup = same.filter(se => se.p.zip === entry.p.zip);
			let otherGroups = same.filter(se => se.p.zip !== entry.p.zip);

			if (otherGroups.length >= countToMove) {
				// if there are enough to move in a different group than curr, take the whole group
				while (countToMove > 0 && otherGroups.length > 1) {
					const mv = otherGroups.filter(se => se.p.zip === otherGroups[otherGroups.length-1].p.zip);
					mv.forEach(se => toMove.push(se));
					countToMove -= mv.length;
					otherGroups = otherGroups.filter(se => !mv.includes(se));
				}
			}
			if (countToMove > 0 && otherGroups.length > 0) {
				otherGroups.forEach(se => toMove.push(se));
				countToMove -= otherGroups.length;
			}

			// still more to move and groups exhausted, just pick the tail
			if (countToMove > 0) {
				toMove.push(...sameGroup.slice(sameGroup.length - countToMove));
			}
			toMove.forEach(e => e.si.d.add(1, 'day'));
		}

		++curr;
		start = curr;
	}

	return rv;
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
