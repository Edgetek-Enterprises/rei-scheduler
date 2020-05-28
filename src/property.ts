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
}

export interface PropertySchedule {
  p: Property;
  message?: string;
  schedule: ScheduleItem[];
}

export interface ScheduleItem {
  d: moment.Moment;
  isImport?: boolean;
  isAsap?: boolean;
}

export interface ScheduleOptions {
  scheduleMax: moment.Moment;
  maxPerDay: number;
  maxPerWeek: number;
  pushBlackout: (d: moment.Moment) => moment.Moment;
}

interface ScheduleEntry {
  p: Property;
  ps: PropertySchedule;
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
export function buildSchedule(data: Property[], options: ScheduleOptions, prev: PropertySchedule[] | undefined) : PropertySchedule[] {
  let base = computeScheduleDates(data, options, prev);

  if (prev) {
    //TODO: incorporate previous schedule into new base schedule
  }

  // transform the schedule into discrete events
  let schedule : ScheduleEntry[] = [];
  base.forEach(ps => {
    ps.schedule.forEach((s,i) => {
      schedule.push({
        p: ps.p,
        si: s,
        ps,
      });
    });
  });
  sortSchedule(schedule);

  schedule = applyScheduleConstraints(schedule, options);

  let out : { [pid:string] : PropertySchedule } = {};
  schedule.forEach(s => {
    let p = out[s.p.pid] ?? { p: s.p, message: s.ps.message, schedule: []};
    out[s.p.pid] = p;
    p.schedule.push(s.si);
  });
  // Also add back properties that didn't get scheduled
  base.filter(ps => ps.schedule.length === 0).forEach(ps => {
    out[ps.p.pid] = {
      p: ps.p,
      message: ps.message,
      schedule: [],
    };
  });

  return Object.keys(out).map(k => out[k]);
}

function computeScheduleDates(data: Property[], options: ScheduleOptions, prev: PropertySchedule[] | undefined) : PropertySchedule[] {
  // build schedule starting tomorrow (no inspections today)
  const tomorrow = moment().add(1, 'd').startOf('d');

  let rv = data.map<PropertySchedule>(p => {
    let ps : PropertySchedule = {
      p,
      schedule: []
    };
    // Skip handling of empty units
    if (!p.leaseStart && !p.leaseEnd) {
      ps.message = 'Unoccupied';
      return ps;
    }

    if (!p.leaseStart) {
      ps.message = 'Missing lease start';
      //console.log('Error in property ' + p.address + ', missing lease start');
      return ps;
    }
    
    //FIXME: need to handle monthly (no end)
    if (!p.leaseEnd) {
      ps.message = '(TODO handle monthly term)';
      return ps;
    }

    const start = p.leaseStart!;
    const end = p.leaseEnd!;

    if (end.isBefore(tomorrow)) {
      ps.message = 'Term ended';
      return ps;
    }

    // find 3 month buffer for start and end
    let scheduleStart = moment(start).add(3, 'months');
    let scheduleEnd = moment(end).add(-3, 'months');
    const scheduleMax = moment(tomorrow).add(3, 'years');
    if (scheduleEnd.isAfter(scheduleMax)) {
      scheduleEnd = scheduleMax;
    }

    if (scheduleEnd.isBefore(tomorrow)) {
      ps.message = 'Term end is too soon';
      //console.log('Error in property ' + p.address + ', term end is too soon to schedule dates');
      return ps;
    }
    if (scheduleEnd.isBefore(scheduleStart)) {
      // property term is narrower than the configured window, schedule asap
      console.log('Property ' + p.pid + ' ' + p.address + ', has short term, need to schedule asap');
      ps.schedule.push({ d: moment(tomorrow), isAsap: true });
    }
    if (scheduleStart.isBefore(tomorrow)) {
      scheduleStart = tomorrow;
    }

    // schedule the first one at start, then every 3 months (every quarter year)
    for (let date = moment(scheduleStart); date.isBefore(scheduleEnd); date.add(3, 'months')) {
      ps.schedule.push({ d: moment(date) });
    }

    // didn't schedule anything - go ahead and push one
    if (ps.schedule.length == 0) {
      ps.schedule.push({ d: moment(tomorrow) });
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
  }

  return rv;
}
