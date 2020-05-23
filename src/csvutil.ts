import moment, { isMoment } from 'moment';
// https://www.papaparse.com/
import Papa from 'papaparse';
import { Property, PropertySchedule, ScheduleItem } from './property';
import { DATE_FORMAT } from './App';

const HEADER_FIELDS : {[header:string]:{name: string, type?: string, optional?:boolean}} = {
  'Property Street Address 1':{ name: 'address' },
  'Property City':{ name: 'city' },
  'Property State':{ name: 'state' },
  'Property Zip':{ name: 'zip', type: 'number' },
  'Unit':{ name: 'unit', optional: true},
  'Lease From':{ name: 'leaseStart', type: 'date', optional: true},
  'Lease To':{ name: 'leaseEnd', type: 'date', optional: true}
}

const HEADER_INSPECTION_PREFIX = 'Inspection ';

const HEADER_FIELDS_SCHEDULE : {[header:string]:{name: string, type?: string, sched?:boolean}} = {
  'Inspection Date': {name: 'date', sched: true, type: 'date' },
  'Inspection Number': {name: 'number', sched: true },
  'Property Street Address 1':{ name: 'address' },
  'Property City':{ name: 'city' },
  'Property State':{ name: 'state' },
  'Property Zip':{ name: 'zip', type: 'number' },
  'Unit':{ name: 'unit' },
  'Lease From':{ name: 'leaseStart', type: 'date'},
  'Lease To':{ name: 'leaseEnd', type: 'date'}
}

export function isCSV(f: File) : boolean {
  return f.name.endsWith('.csv');
}

export function parseCsv(f: File, done: (result: Property[], schedule: PropertySchedule[] | undefined) => void, err: (msg: string) => void) : void {
  let props : Property[] = [];
  let scheds : PropertySchedule[] = [];
  let line = 0;
  let hasSchedule = false;

  const config: Papa.ParseConfig = {
    header: true,
    worker: false,
    skipEmptyLines: true,
    
    transform: (value, field) => {
      if (value.length <= 0) {
        const h = HEADER_FIELDS[field];
        // not a Property field
        if (!h) {
          if (String(field).startsWith(HEADER_INSPECTION_PREFIX)) {
            return moment(value, DATE_FORMAT);
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

      let prop : any = { pid: ''+line };
      let sched : PropertySchedule = {
        p: prop,
        schedule: []
      }

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
          prop[h.name] = rowObj[key];
        } else if (key.startsWith(HEADER_INSPECTION_PREFIX)) {
            const d = rowObj[key] as moment.Moment;
            if (d) {
              sched.schedule.push({
                d,
                isImport: true
              });
            }
        } else {
          err('Unhandled column in input file: ' + key);
        }
      });
      hasSchedule = hasSchedule || sched.schedule.length > 0;

      // Sort inspections in case they are out of order in the input file
      sched.schedule.sort((a,b) => a.d.unix() - b.d.unix());

      props.push(prop as Property);
      scheds.push(sched);
    },
    complete: () => {
      console.log('Parsed ' + props.length + ' properties' + (hasSchedule ? ' and schedules' : ''));
      done(props, hasSchedule ? scheds : undefined);
    }
  };
  Papa.parse(f, config);
}

export function toCSVInspections(data: PropertySchedule[]) : string {
  const headers = Object.keys(HEADER_FIELDS);
  let extras : string[] = [];

  let out = data.map(ps => {
    let rv : any = {};
    headers.forEach(h => {
      const head = HEADER_FIELDS[h];
      let v = (ps.p as any)[head.name];

      switch (head?.type) {
        case 'date': v = (v as moment.Moment)?.format(DATE_FORMAT); break;
        //case 'number': return parseInt(value);
      }

      rv[h] = v;
    });
    ps.schedule.forEach((s,i) => {
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

export function toCSVSchedule(data: PropertySchedule[]) : string {
  interface Row {
    p: Property;
    date: moment.Moment;
    number: number;
  }
  // First, transform the schedule into a sorted output
  let schedule : Row[] = [];
  data.forEach(ps => {
    ps.schedule.forEach((s,i) => {
      schedule.push({
        p: ps.p,
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
  let extras : string[] = [];

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
    return rv;
  });

  return Papa.unparse(out, {
    skipEmptyLines: true,
    columns: [...headers, ...extras],
    newline: '\n',
  });
}