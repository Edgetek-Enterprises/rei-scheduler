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

