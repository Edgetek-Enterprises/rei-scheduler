import { Moment, isMoment } from "moment";

export interface ColumnData<T> {
  /** Used to render column data */
  value: (fs: T) => any;
  title: string;
  /** unique column id, used for sort keys and other needs */
  id: string;
  /** Used to sort column data; if not defined, 'value' is used to sort */
  accessor?: (fs: T) => string | number | undefined;
}

export interface SortData<T> {
  col: ColumnData<T>;
  dir: 'asc' | 'desc';
}

export function sortRows<T>(data: T[], sortData: SortData<T>): T[] {
  const dir = sortData.dir === 'desc' ? -1 : 1;
  return data.sort((a, b) => {
    const va = (sortData.col.accessor ? sortData.col.accessor(a) : sortData.col.value(a)) ?? '';
    const vb = (sortData.col.accessor ? sortData.col.accessor(b) : sortData.col.value(b)) ?? '';
    const ma = isDate(va);
    const mb = isDate(vb);
    if (ma !== undefined && mb !== undefined) {
      return dir * (ma.unix() - mb.unix())
    }
    const na = isNumeric(va);
    const nb = isNumeric(vb);
    if (na !== undefined && nb !== undefined) {
      return dir * (na - nb);
    }
    return dir * va.toString().localeCompare(vb.toString());
  });
}

function isNumeric(n: any): number | undefined {
  const f = parseFloat(n);
  if (!isNaN(f) && isFinite(n))
    return f;
  return undefined;
}
function isDate(n: any): Moment | undefined {
  if (isMoment(n)) {
    return n;
  }
  return undefined;
}

export function handleSortChange<T>(curr: SortData<T>, cd: ColumnData<T>, consumer: (cd: SortData<T>) => void): void {
  if (curr.col.id !== cd.id) {
    consumer({ col: cd, dir: 'asc' });
  }
  else {
    consumer({ col: cd, dir: curr.dir === 'asc' ? 'desc' : 'asc' });
  }
}
