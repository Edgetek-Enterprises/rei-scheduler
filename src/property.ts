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
  maxPerDay: number;
  maxPerWeek: number;
}

//TODO: need a way to pass errors out
export function buildSchedule(data: Property[], options: ScheduleOptions, prev: PropertySchedule[] | undefined) : PropertySchedule[] {
  let base = computeScheduleDates(data, options, prev);

  if (prev) {
    //TODO: incorporate previous schedule into new base schedule
  }

  interface Entry {
    p: Property;
    ps: PropertySchedule;
    si: ScheduleItem;
  }
  // transform the schedule into discrete events
  let schedule : Entry[] = [];
  base.forEach(ps => {
    ps.schedule.forEach((s,i) => {
      schedule.push({
        p: ps.p,
        si: s,
        ps,
      });
    });
  });
  schedule.sort((a,b) => {
    const d = a.si.d.unix() - b.si.d.unix();
    if (d != 0) {
      return d;
    }
    const c = (a.p.city ?? '').localeCompare(b.p.city ?? '');
    if (c != 0) {
      return c;
    }
    return a.p.address.localeCompare(b.p.address);
  });

  //TODO: manipulte schedule here

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
