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
	isMoveOut?: boolean;
}

export interface ScheduleOptions {
	scheduleStart: moment.Moment;
	moveInBuffer: (d: moment.Moment) => moment.Moment;
	moveOutBuffer: (d: moment.Moment) => moment.Moment;
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

/**
 * The main logic for generating an inspection schedule
 */
function computeScheduleDates(data: Property[], options: ScheduleOptions) : Property[] {
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

		// First inspection is no sooner than 3 months after lease start / move-in
		// and no sooner than the specified schedule start (default is tomorrow)
		let scheduleStart = options.moveInBuffer(p.leaseStart!);
		if (scheduleStart.isBefore(options.scheduleStart)) {
			scheduleStart = options.scheduleStart;
		}

		// If no lease end date, schedule up to the max schedule date
		if (!p.leaseEnd) {
			//TODO: look for existing schedule items
			for (let date = moment(scheduleStart); date.isBefore(options.scheduleMax); date.add(3, 'months')) {
				ps.schedule!.push({ d: moment(date) });
			}

			return ps;
		}

		// Schedule at next available date for move-out
		if (p.leaseEnd!.isBefore(options.scheduleStart)) {
			ps.scheduleMessage = 'Term ended';
			ps.schedule!.push({
				d: moment(options.scheduleStart).add(1, 'day'),
				isMoveOut: true
			});

			return ps;
		}

		let scheduleEnd = options.moveOutBuffer(p.leaseEnd!);
		if (scheduleEnd.isAfter(options.scheduleMax)) {
			scheduleEnd = options.scheduleMax;
		}

		// Schedule at next available date for move-out
		if (scheduleEnd.isBefore(options.scheduleStart)) {
			ps.scheduleMessage = 'Term end is too soon';
			ps.schedule!.push({
				d: moment(p.leaseEnd!).add(1, 'day'),
				isMoveOut: true
			});
			//console.log('Error in property ' + p.address + ', term end is too soon to schedule dates');
			return ps;
		}

		//TODO: look for existing schedule items
		if (scheduleEnd.isBefore(scheduleStart)) {
			// property term is narrower than the configured window, schedule asap
			console.log('Property ' + p.pid + ' ' + p.address + ' term is shorter than buffer, need to schedule asap');
			ps.schedule!.push({ d: moment(options.scheduleStart), isAsap: true });
			// Also schedule a move-out date
			ps.schedule!.push({
				d: moment(p.leaseEnd!).add(1, 'day'),
				isMoveOut: true
			});
			return ps;
		}

		// schedule the first one at start, then every 3 months (every quarter year)
		for (let date = moment(scheduleStart); date.isBefore(scheduleEnd); date.add(3, 'months')) {
			ps.schedule!.push({ d: moment(date) });
		}

		// didn't schedule anything - go ahead and push one
		if (ps.schedule!.length == 0) {
			ps.schedule!.push({ d: moment(options.scheduleStart) });
		}

		// Also schedule a move-out inspection
		ps.schedule!.push({
			d: moment(p.leaseEnd!).add(1, 'day'),
			isMoveOut: true
		});

		return ps;
	});

	return rv;
}

/**
 * Enforce schedule constraints, such as not too many on the same day or in the same week, and shift
 * back inspections to meet the constraints.
 */
function applyScheduleConstraints(schedule: ScheduleEntry[], options: ScheduleOptions) : ScheduleEntry[] {
	let rv = schedule;
	let start = 0;
	let curr = start;

	while (curr < rv.length) {
		let entry = rv[curr];
		// skip imported entries which denote the actual schedule followed
		if (entry.si.isImport) {
			++curr;
			start = curr;
			continue;
		}
		let date = entry.si.d;
		// remove dates after schedule max
		if (date.isAfter(options.scheduleMax)) {
			rv.splice(curr, 1);
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
			// Only shift the schedule items that are not move-out inspections.
			// If there are too many of them, then keep them all.
			const sameDayMoveout = sameDay.filter(se => se.si.isMoveOut);
			if (sameDayMoveout.length < sameDay.length) {
				const sameDayNotMoveout = sameDay.filter(se => !se.si.isMoveOut);
				capacityShift(sameDayNotMoveout, options.maxPerDay - 1 - sameDayMoveout.length);
				sortSchedule(rv);
				curr = start;
				continue;
			}
		}

		const sameWeek = rv.filter((se,i) => i != curr && se.si.d.week() == date.week());
		if (sameWeek.length > options.maxPerWeek - 1) {
			const sameWeekMoveout = sameWeek.filter(se => se.si.isMoveOut);
			if (sameWeekMoveout.length < sameWeek.length) {
				const sameWeekNotMoveout = sameWeek.filter(se => !se.si.isMoveOut);
				capacityShift(sameWeekNotMoveout, options.maxPerWeek - 1 - sameWeekMoveout.length);
				sortSchedule(rv);
				curr = start;
				continue;
			}
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
			const mo = toMove.filter(se => se.si.isMoveOut);
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
