import moment, { isMoment } from 'moment';
// https://www.papaparse.com/
import Papa from 'papaparse';
import { Property } from './property';
import { DATE_FORMAT } from './App';

const HEADER_FIELDS : {[header:string]:{name: string, type?: string, optional?:boolean}} = {
  "Property Street Address 1":{ name: "address" },
  "Property City":{ name: "city" },
  "Property State":{ name: "state" },
  "Property Zip":{ name: "zip", type: "number" },
  "Unit":{ name: "unit", optional: true},
  "Lease From":{ name: "leaseStart", type: "date", optional: true},
  "Lease To":{ name: "leaseEnd", type: "date", optional: true}
}

export function isCSV(f: File) : boolean {
  return f.name.endsWith(".csv");
}

export function parseCsv(f: File, done: (result: Property[]) => void, err: (msg: string) => void) : void {
  let parsed : Property[] = [];
  let line = 0;

  const config: Papa.ParseConfig = {
    header: true,
    worker: false,
    skipEmptyLines: true,
    
    transform: (value, field) => {
      if (value.length <= 0) {
        if (HEADER_FIELDS[field]?.optional) {
          return undefined;
        }
        return "<no data>";
      }
      switch (HEADER_FIELDS[field]?.type) {
        case "date": return moment(value, DATE_FORMAT);
        case "number": return parseInt(value);
      }
      return value;
    },
    step: (results, parser) => {
      line++;
      if (results.errors.length > 0) {
        // add 2 assuming a header row is zero
        err(results.errors.map(pe => "Line " + (pe.row+2) + ": " + pe.message).join());
        parser.abort();
        return;
      }

      let prop : any = { pid: ""+line, schedule: [] };
      //TODO: need to parse existing schedule
      Object.keys(HEADER_FIELDS).forEach(h => {
        prop[HEADER_FIELDS[h].name] = (results.data as any)[h];
      });
      parsed.push(prop)
    },
    complete: () => {
      console.log("Parsed " + parsed.length + " properties");
      done(parsed);
    }
  };
  Papa.parse(f, config);
}

export function toCSV(data: Property[]) : string {
  const headers = Object.keys(HEADER_FIELDS);
  let extras : string[] = [];

  let out = data.map(p => {
    let rv : any = {};
    headers.forEach(h => {
      const head = HEADER_FIELDS[h];
      let v = (p as any)[head.name];

      switch (head?.type) {
        case "date": v = (v as moment.Moment)?.format(DATE_FORMAT); break;
        //case "number": return parseInt(value);
      }

      rv[h] = v;
    });
    p.schedule.forEach((s,i) => {
      let t = 'Inspection ' + (i+1);
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