import moment from "moment";
import { DATE_FORMAT } from "./App";
import { Property, pstring, sameUnit, selist } from "./property";

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

export interface ScheduleEntry {
	p: Property;
	si: ScheduleItem;
}

//TODO: need a way to pass errors out
export function buildSchedule(data: Property[], options: ScheduleOptions) : Property[] {
	let scheduledProps = [...data];

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

		let pLeaseEndMoveOut = p.moveOut ?? p.leaseEnd;

		// Skip handling of empty units
		if (!p.leaseStart && !pLeaseEndMoveOut) {
			p.scheduleMessage = 'Unoccupied';
			console.log(pstring(p) + ' missing lease start and lease end: Unoccupied');
			return ps;
		}

		if (!p.leaseStart) {
			p.scheduleMessage = 'Missing lease start';
			console.log(pstring(p) + ' missing lease start');
			return ps;
		}

		// First inspection is no sooner than 3 months after lease start / move-in
		// and no sooner than the specified schedule start (default is tomorrow)
		let scheduleStart = options.moveInBuffer(p.leaseStart!);
		if (scheduleStart.isBefore(options.scheduleStart)) {
			scheduleStart = options.scheduleStart;
		}
		console.log(pstring(ps) + ' lease start is ' + ps.leaseStart!.format(DATE_FORMAT) + ' starting schedule after buffer at ' + scheduleStart.format(DATE_FORMAT));

		// If no lease end date, schedule up to the max schedule date without a move-out inspection
		if (!pLeaseEndMoveOut) {
			// no existing schedule, just add dates
			if (ps.schedule.length == 0) {
				console.log('No existing schedule for ' + pstring(ps) + ', adding dates every 3 months');
				for (let date = moment(scheduleStart); date.isBefore(options.scheduleMax); date.add(3, 'months')) {
					ps.schedule!.push({ d: moment(date) });
					console.log('  ' + pstring(ps) + ' added ' + date.format(DATE_FORMAT));
				}
			} else {
				console.log(pstring(ps) + ' has ' + ps.schedule.length + ' existing schedule items');
				// look for gaps in the schedule of 1.5x the buffer and insert

				// can't add fractional months, so convert to hours
				const duration = moment.duration(3 * 1.5, "months");
				const maxGap = duration.asHours();
				sortScheduleItems(ps.schedule);

				for (let i=0; i<ps.schedule.length-1; ++i) {
					const diff = ps.schedule[i+1].d.diff(ps.schedule[i].d, 'hours');
					if (diff > maxGap) {
						const entry = moment(ps.schedule[i].d).add( maxGap / 2, 'hours').startOf('day');
						ps.schedule!.push({ d: entry });
						console.log(pstring(ps) + ': inserted ' + entry.format(DATE_FORMAT) + ' into schedule with a gap after ' + ps.schedule[i].d.format(DATE_FORMAT));
					}
				}
			}

			return ps;
		}

		const scheduledMoveOut = ps.schedule.find(si => si.isMoveOut);

		// Schedule at next available date for move-out
		if (pLeaseEndMoveOut!.isBefore(options.scheduleStart)) {
			ps.scheduleMessage = 'Term ended';
			if (!scheduledMoveOut) {
				const dd = moment(options.scheduleStart).add(1, 'day');
				console.log(pstring(ps) + ' term ended ' + pLeaseEndMoveOut.format(DATE_FORMAT) + '; scheduling move-out at ' + dd.format(DATE_FORMAT));
				ps.schedule!.push({
					d: dd,
					isMoveOut: true
				});
			} else {
				console.log(pstring(ps) + ' term ended' + pLeaseEndMoveOut.format(DATE_FORMAT) + '; move-out already scheduled at ' + scheduledMoveOut.d.format(DATE_FORMAT));
			}

			return ps;
		}

		let scheduleEnd = options.moveOutBuffer(pLeaseEndMoveOut!);
		if (scheduleEnd.isAfter(options.scheduleMax)) {
			scheduleEnd = options.scheduleMax;
		}

		// Schedule at next available date for move-out
		if (scheduleEnd.isBefore(options.scheduleStart)) {
			ps.scheduleMessage = 'Term end is too soon';
			if (!scheduledMoveOut) {
				const dd = moment(pLeaseEndMoveOut!).add(1, 'day');
				console.log(pstring(ps) + ' term end is too soon ' + scheduleEnd.format(DATE_FORMAT) + '; scheduling move-out at ' + dd.format(DATE_FORMAT));
				ps.schedule!.push({
					d: dd,
					isMoveOut: true
				});
			} else {
				console.log(pstring(ps) + ' term end is too soon' + scheduleEnd.format(DATE_FORMAT) + '; move-out already scheduled at ' + scheduledMoveOut.d.format(DATE_FORMAT));
			}

			return ps;
		}

		if (scheduleEnd.isBefore(scheduleStart)) {
			// property term is narrower than the configured window, schedule asap
			console.log(pstring(ps) + ' term is shorter than buffer, need to schedule asap');
			if (ps.schedule.length == 0) {
				console.log(pstring(ps) + ' scheduling asap ' + options.scheduleStart.format(DATE_FORMAT));
				ps.schedule!.push({ d: moment(options.scheduleStart), isAsap: true });
			}
			// Also schedule a move-out date
			if (!scheduledMoveOut) {
				const dd = moment(pLeaseEndMoveOut!).add(1, 'day');
				console.log(pstring(ps) + ' term is shorter than buffer ' + scheduleEnd.format(DATE_FORMAT) + '; scheduling move-out at ' + dd.format(DATE_FORMAT));
				ps.schedule!.push({
					d: dd,
					isMoveOut: true
				});
			}
			return ps;
		}

		// schedule exists, check for gaps
		if (ps.schedule.length > 0) {
			// look for gaps in the schedule of 1.5x the buffer and insert

			// can't add fractional months, so convert to hours
			const duration = moment.duration(3 * 1.5, "months");
			const maxGap = duration.asHours();
			sortScheduleItems(ps.schedule);

			for (let i=0; i<ps.schedule.length-1; ++i) {
				// Skip past existing schedule dates before the scheduler algorithm should consider them
				if (ps.schedule[i+1].d.isBefore(scheduleStart)) {
					continue;
				}
				const diff = ps.schedule[i+1].d.diff(ps.schedule[i].d, 'hours');
				if (diff > maxGap) {
					const entry = moment(ps.schedule[i].d).add( maxGap / 2, 'hours').startOf('day');
					ps.schedule!.push({ d: entry });
					console.log(pstring(ps) + ': inserted ' + entry.format(DATE_FORMAT) + ' into schedule with a gap after ' + ps.schedule[i].d.format(DATE_FORMAT));
				}
			}

			// reset scheduling start to the last scheduled date plus a buffer if it is later
			const last = ps.schedule[ps.schedule.length-1].d;
			if (scheduleStart.isBefore(last)) {
				scheduleStart = moment(last).add(3, 'months');
				console.log(pstring(ps) + ': moved schedule start due to existing schedule ending at ' + last.format(DATE_FORMAT));
			}
		}

		//console.log(pstring(ps) + ': adding dates every 3 months until ' + scheduleEnd.format(DATE_FORMAT));
		// schedule the first one at start, then every 3 months (every quarter year)
		for (let date = moment(scheduleStart); date.isBefore(scheduleEnd); date.add(3, 'months')) {
			ps.schedule!.push({ d: moment(date) });
			console.log(pstring(ps) + ' scheduled ' + date.format(DATE_FORMAT));
		}

		// didn't schedule anything - go ahead and push one
		if (ps.schedule!.length == 0) {
			ps.schedule!.push({ d: moment(options.scheduleStart) });
			console.log(pstring(ps) + ' scheduled single entry at ' + options.scheduleStart.format(DATE_FORMAT));
		}

		if (!scheduledMoveOut) {
			const dd = moment(pLeaseEndMoveOut!).add(1, 'day');
			// Also schedule a move-out inspection
			ps.schedule!.push({
				d: dd,
				isMoveOut: true
			});
			console.log(pstring(ps) + ' scheduled move-out entry (after lease-end / move-out ' + pLeaseEndMoveOut.format(DATE_FORMAT) + ') at ' + dd.format(DATE_FORMAT));
		}

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
			console.log(pstring(entry.p) + ' removing ' + date.format(DATE_FORMAT) + ' which is after schedule max: ' + options.scheduleMax.format(DATE_FORMAT));
			rv.splice(curr, 1);
			curr = start;
			continue;
		}
		const scheduledMoveOut = schedule.find(se => se.p.pid === entry.p.pid && se.si.isMoveOut);
		// remove dates after or close to moveout inspection
		if (scheduledMoveOut && !entry.si.isMoveOut) {
			const isAfter = date.isAfter(scheduledMoveOut.si.d);
			const isNear = date.week() === scheduledMoveOut.si.d.week();
			if (isAfter || isNear) {
				if (isAfter) {
					console.log(pstring(entry.p) + ' removing ' + date.format(DATE_FORMAT) + ' which is after scheduled move-out: ' + scheduledMoveOut.si.d.format(DATE_FORMAT));
				} else {
					console.log(pstring(entry.p) + ' removing ' + date.format(DATE_FORMAT) + ' which is near scheduled move-out: ' + scheduledMoveOut.si.d.format(DATE_FORMAT));
				}
				rv.splice(curr, 1);
				curr = start;
				continue;
			}
		}

		let open = options.pushBlackout(date);
		if (!date.isSame(open)) {
			console.log(pstring(entry.p) + ' pushed ' + date.format(DATE_FORMAT) + ' past a blackout period to ' + open.format(DATE_FORMAT));
			entry.si.d = open;
			sortSchedule(rv);
			curr = start;
			continue;
		}

		const sameDay = rv.filter((se,i) => i != curr && se.si.d.isSame(date));
		if (sameDay.length > options.maxPerDay - 1) {
			console.log('Inpsections ('+sameDay.length+') passes max per day (' + options.maxPerDay + ') for ' + date.format(DATE_FORMAT) + ': ' + selist(sameDay));
			// Only shift the schedule items that are not move-out inspections or previously scheduled.
			// If there are too many of them, then keep them all.
			const sameDayLocked = sameDay.filter(se => se.si.isMoveOut || se.si.isImport);
			if (sameDayLocked.length < sameDay.length) {
				const sameDayNotLocked = sameDay.filter(se => !se.si.isMoveOut && !se.si.isImport);
				const moved = capacityShift(sameDayNotLocked, options.maxPerDay - 1 - sameDayLocked.length);
				console.log('Moved ('+moved.length+') inspections of '+sameDayNotLocked.length+' moveable for ' + date.format(DATE_FORMAT)+ ': ' + selist(moved));
				sortSchedule(rv);
				curr = start;
				continue;
			} else {
				console.log('Inpsections not moveable ('+sameDayLocked.length+') (move-out or historical) for ' + date.format(DATE_FORMAT)+ ': ' + selist(sameDayLocked));
			}
		}

		const sameWeek = rv.filter((se,i) => i != curr && se.si.d.week() == date.week());
		if (sameWeek.length > options.maxPerWeek - 1) {
			console.log('Inpsections ('+sameWeek.length+') passes max per week (' + options.maxPerWeek + ') for week ' + date.week()+ ': ' + selist(sameWeek));
			const sameWeekLocked = sameWeek.filter(se => se.si.isMoveOut || se.si.isImport);
			if (sameWeekLocked.length < sameWeek.length) {
				const sameWeekNotLocked = sameWeek.filter(se => !se.si.isMoveOut && !se.si.isImport);
				const moved = capacityShift(sameWeekNotLocked, options.maxPerWeek - 1 - sameWeekLocked.length);
				console.log('Moved ('+moved.length+') inspections of '+sameWeekNotLocked.length+' moveable for week ' + date.week()+ ': ' + selist(moved));
				sortSchedule(rv);
				curr = start;
				continue;
			} else {
				console.log('Inpsections not moveable ('+sameWeekLocked.length+') (move-out or historical) for week ' + date.week()+ ': ' + selist(sameWeekLocked));
			}
		}

		function capacityShift(same: ScheduleEntry[], max: number) : ScheduleEntry[] {
			let countToMove = same.length - max;
			let toMove : ScheduleEntry[] = [];

			let groups : ScheduleEntry[][] = [];
			// First, group by address match
			const sameProp = same.filter(se => sameUnit(se.p, entry.p));
			if (sameProp.length > 0) {
				groups.push(sameProp);
			}
			const notSameProp = same.filter(se => !sameProp.includes(se));

			// Next, group by zip code
			const sameZip = notSameProp.filter(se => se.p.zip === entry.p.zip);
			if (sameZip.length > 0) {
				groups.push(sameZip);
			}
			let otherZip = notSameProp.filter(se => se.p.zip !== entry.p.zip);
			if (otherZip.length > 0) {
				groups.push(otherZip);
			}

			groups.reverse();

			for (let g= 0; g < groups.length; ++g) {
				// If the group is not enough, move the whole group
				if (countToMove >= groups[g].length) {
					groups[g].forEach(se => toMove.push(se));
					countToMove -= groups[g].length;
					groups[g] = [];
				}
				// if there are enough to move from the group, take them by unit groups
				while (countToMove > 0 && groups[g].length > 0) {
					const mv = groups[g].filter(se => sameUnit(se.p, groups[g][groups[g].length-1].p));
					mv.forEach(se => toMove.push(se));
					countToMove -= mv.length;
					groups[g] = groups[g].filter(se => !mv.includes(se));
				}
			}
			toMove.forEach(e => e.si.d.add(1, 'day'));
			return toMove;
		}

		++curr;
		start = curr;
	}

	return rv;
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

function sortScheduleItems(s: ScheduleItem[]) {
	s.sort((a,b) => a.d.unix() - b.d.unix());
}
