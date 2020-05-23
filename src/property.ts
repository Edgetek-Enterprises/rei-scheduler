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
  isImport: boolean;
}

export interface ScheduleOptions {
  maxPerDay: number;
  maxPerWeek: number;
}

//TODO: need a way to pass errors out
export function buildSchedule(data: Property[], options: ScheduleOptions) : PropertySchedule[] {
  // build schedule starting today
  const tomorrow = moment().add(1, 'd').startOf('d');

  //console.log(today);
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

    if (scheduleEnd.isBefore(tomorrow)) {
      ps.message = 'Term end is too soon';
      //console.log('Error in property ' + p.address + ', term end is too soon to schedule dates');
      return ps;
    }
    if (scheduleEnd.isBefore(scheduleStart)) {
      // property term is narrower than 6 months, schedule asap
      console.log('Property ' + p.pid + ' ' + p.address + ', has short term, need to schedule asap');
    }
    if (scheduleStart.isBefore(tomorrow)) {
      scheduleStart = tomorrow;
    }

    // flush non-imported dates
    ps.schedule = ps.schedule.filter(s => s.isImport);

    // examine existing schedule to see if there are any gaps
    ps.schedule.sort((a,b) => b.d.unix() - a.d.unix());

    // schedule the first one at start, then every 3 months (every quarter year)
    for (let date = moment(scheduleStart); date.isBefore(scheduleEnd); date.add(3, 'months')) {
      ps.schedule.push({ d: moment(date), isImport: false });
    }

    // didn't schedule anything - go ahead and push one
    if (ps.schedule.length == 0) {
      ps.schedule.push({ d: moment(tomorrow), isImport: false });
    }

    //console.log(tomorrow.format('YYYY-MM-DD'));
    return ps;
  });

  return rv;
}
