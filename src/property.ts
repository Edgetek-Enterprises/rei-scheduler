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
  message?: string;
  schedule: ScheduleItem[];
}

export interface ScheduleItem {
  d: moment.Moment;
  import: boolean;
}

export interface ScheduleOptions {
  maxPerDay: number;
  maxPerWeek: number;
}

//TODO: need a way to pass errors out
export function buildSchedule(data: Property[], options: ScheduleOptions) {
  // build schedule starting today
  const tomorrow = moment().add(1, 'd').startOf('d');

  //console.log(today);

  data.forEach(p => {
    // Skip handling of empty units
    if (!p.leaseStart && !p.leaseEnd) {
      p.message = "Unoccupied";
      return;
    }

    if (!p.leaseStart) {
      p.message = "Missing lease start";
      //console.log("Error in property " + p.address + ", missing lease start");
      return;
    }
    
    //FIXME: need to handle monthly (no end)
    if (!p.leaseEnd) {
      p.message = "(TODO handle monthly term)";
      return;
    }

    const start = p.leaseStart!;
    const end = p.leaseEnd!;

    if (end.isBefore(tomorrow)) {
      p.message = "Term ended";
      return;
    }

    // find 3 month buffer for start and end
    let scheduleStart = moment(start).add(3, 'months');
    let scheduleEnd = moment(end).add(-3, 'months');

    if (scheduleEnd.isBefore(tomorrow)) {
      p.message = "Term end is too soon";
      //console.log("Error in property " + p.address + ", term end is too soon to schedule dates");
      return;
    }
    if (scheduleEnd.isBefore(scheduleStart)) {
      // property term is narrower than 6 months, schedule asap
      console.log("Property " + p.pid + " " + p.address + ", has short term, need to schedule asap");
    }
    if (scheduleStart.isBefore(tomorrow)) {
      scheduleStart = tomorrow;
    }

    // flush non-imported dates
    p.schedule = p.schedule.filter(s => s.import);

    // examine existing schedule to see if there are any gaps
    p.schedule.sort((a,b) => b.d.unix() - a.d.unix());

    // schedule the first one at start, then every 3 months (every quarter year)
    for (let date = moment(scheduleStart); date.isBefore(scheduleEnd); date.add(3, 'months')) {
      p.schedule.push({ d: moment(date), import: false });
    }

    // didn't schedule anything - go ahead and push one
    if (p.schedule.length == 0) {
      p.schedule.push({ d: moment(tomorrow), import: false });
    }

    console.log(tomorrow.format("yyyy-mm-dd"));
  });
}
