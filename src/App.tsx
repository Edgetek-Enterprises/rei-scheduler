import React from 'react';
import moment from 'moment';
import './App.css';
import { makeStyles, Button, TableCell, Table, TableHead, TableRow, TableSortLabel, TableBody, Theme } from '@material-ui/core';
import { KeyboardDatePicker, MuiPickersUtilsProvider } from "@material-ui/pickers";
import { toCSVInspections, toCSVSchedule } from './csvutil';
import { Property, buildSchedule, ScheduleOptions, mergeTenants } from './property';
import { ColumnData, handleSortChange, SortData, sortRows } from './tableutil';
import { DropZone } from './components/DropZone';
import MomentUtils from '@date-io/moment';

export const DATE_FORMAT = 'MM/DD/YYYY';

export default function App() {
	const tomorrow = moment().add(1, 'd').startOf('d');
	const [propertyList, setPropertyList] = React.useState<Property[]>([]);
	const [startDate, setStartDate] = React.useState<moment.Moment>(tomorrow);

	const columnData = getColumns();
	const [sorted, setSorted] = React.useState<SortData<Property>>({ col: columnData[0], dir: 'asc' });
	const [filterText, setFilterText] = React.useState<string>('');
	const classes = STYLES();

	let items = propertyList;
	if (filterText) {
		items = items.filter(i => filterItems(i, filterText!.toLowerCase()))
	}
	items = sortRows(items, sorted);
	const hasSchedule = propertyList.find(p => p.schedule?.some(si => si.isImport)) !== undefined;

	return <div className="App">
			<header className="App-header">
				<p>
					REI Scheduler
				</p>
			</header>
			<div className='dropzones'>
				<DropZone message={<>Drop the <strong>base properties list</strong> file here <span style={{fontSize: 'smaller' }}>(or click to select file)</span></>}
					handleData={propertyListUpdated} />
				<DropZone message={<>Drop the <strong>properties list with tenant details</strong> file here <span style={{fontSize: 'smaller' }}>(or click to select file)</span></>}
					handleData={propertyListTenantsUpdated} />
				<DropZone message={<>Drop the <strong>previous schedule</strong> file here <span style={{fontSize: 'smaller' }}>(or click to select file)</span></>}
					handleData={priorScheduleUpdated} />
			</div>
			{ propertyList.length > 0 && <span style={{color: '#0f0' }}>{propertyList.length} properties available.</span>}
			{ propertyList.length == 0 && <span style={{color: '#f00' }}>{propertyList.length} properties available.</span>}
			{ hasSchedule && <span style={{color: '#0f0', marginLeft: '10px' }}>Previous schedule loaded.</span>}
			{ !hasSchedule && <span style={{color: '#f00', marginLeft: '10px' }}>No previous schedule loaded.</span>}
			<div className={classes.scrollContent}>
				<input type="text"
					placeholder='Filter'
					onChange={(evt) => setFilterText(evt.target.value ?? '')}
					value={filterText}
				/>
				<Button variant='contained'
					className={classes.button}
					onClick={(evt: any) => download()}
				>Download Schedule CSV</Button>

				Schedule Start Date:
				<MuiPickersUtilsProvider utils={MomentUtils}>
					<KeyboardDatePicker
						value={startDate}
						placeholder={startDate.format(DATE_FORMAT)}
						onChange={(date) => setStartDate((date as moment.Moment) ?? moment())}
						format={DATE_FORMAT}
						rifmFormatter={(str) => str}
					/>
				</MuiPickersUtilsProvider>
				<Table
					aria-labelledby="tableTitle"
					className={classes.table}
				>
					<TableHead className={classes.tableHead}>
							<TableRow>
								{columnData.map((cd, idx) => <TableCell
										key={idx}
										className={classes.tableHeaderCell}
										sortDirection={sorted.dir}
								>
										<TableSortLabel
											active={sorted.col.id === cd.id}
											direction={sorted.dir}
											onClick={() => handleSortChange(sorted, cd, setSorted)}
										>
											{cd.title}
										</TableSortLabel>
								</TableCell>)}
							</TableRow>
					</TableHead>
					<TableBody className={classes.scrollContent}>
							{ items.map((p, idx) => {
								return <TableRow key={p.pid} >
										{columnData.map((cd, idx) => <TableCell className={classes.tableCell} key={p.pid + '.' + cd.id}
											scope="row">
												<div className={classes.tableCellText}>
													{cd.value(p)}
												</div>
										</TableCell>)
										}
								</TableRow>;})
							}
					</TableBody>
				</Table>
		</div>
	</div>;

	/**
	 * Provides parsed property details
	 */
	function propertyListUpdated(plist: Property[]) : string | undefined {
		if (plist.find(p => p.tenants)) {
			return 'Invalid format for base property list - expecting no tenant columns'
		}
		const pss = buildSchedule(plist, getOptions(), undefined);
		setPropertyList(pss);
		return undefined;
	}

	/**
	 *
	 */
	function propertyListTenantsUpdated(plist: Property[]) : string | undefined {
		if (propertyList.length == 0) {
			return 'No base property list, upload one first';
		}
		if (!plist.find(p => p.tenants)) {
			return 'Invalid format for property list with tenants - expecting tenant columns'
		}
		if (plist.find(p => p.schedule)) {
			return 'Invalid format for previous schedule - expecting no schedule columns'
		}

		try {
			let pss = mergeTenants(propertyList, plist);
			pss = buildSchedule(pss, getOptions(), undefined);
			setPropertyList(pss);
		} catch (msg) {
			return msg as string;
		}
		return undefined;
	}

	/**
	 * Provides parsed property details including schedules
	 */
	function priorScheduleUpdated(plist: Property[]) : string | undefined {
		if (propertyList.length == 0) {
			return 'No base property list, upload one first';
		}
		if (plist.find(p => p.tenants)) {
			return 'Invalid format for base property list - expecting no tenant columns'
		}

		if (!plist.find(p => p.schedule)) {
			return 'Invalid format for previous schedule - expecting schedule columns'
		}

		const pss = buildSchedule(propertyList, getOptions(), plist);
		setPropertyList(pss);
		return undefined;
	};

	function getOptions() : ScheduleOptions {
		const blackoutDates : moment.Moment[] = [];

		return {
			scheduleStart: startDate,
			scheduleMax: moment(startDate).add(3, 'years'),
			moveInBuffer: (d) => moment(d).add(3, 'months'),
			// No move-out buffer
			moveOutBuffer: (d) => d,//moment(d).add(-3, 'months'),
			maxPerDay: 5,
			maxPerWeek: 7,
			pushBlackout: (d) => {
				let pass = false;
				while (!pass) {
					pass = true;

					let dow = d.day();
					if (dow == 0 || dow == 6) {
						d = d.clone().add(1, 'day');
						pass = false;
					}

					if (blackoutDates.find(b => b.isSame(d))) {
						d = d.clone().add(1, 'day');
						pass = false;
					}
					// TODO: if day is blacked out, push and don't pass
				}

				return d;
			}
		};
	}

	function getColumns() : ColumnData<Property>[] {
		let cols: ColumnData<Property>[] = [{
				id : 'address',
				title : 'Address',
				value: (dto) => dto.address,
			},{
				id : 'city',
				title : 'City',
				value : (dto) => dto.city,
			}, {
				id: 'state',
				title: 'State',
				value: (dto) => dto.state
			}, {
				id: 'zip',
				title: 'Zip',
				value: (dto) => dto.zip
			}, {
				id: 'unit',
				title: 'Unit',
				value: (dto) => dto.unit
			}, {
				id: 'leaseStart',
				title: 'Lease Start',
				value: (dto) => dto.leaseStart?.format(DATE_FORMAT)
			}, {
				id: 'leaseEnd',
				title: 'Lease End',
				value: (dto) => dto.leaseEnd?.format(DATE_FORMAT)
			}, {
				id: 'moveOut',
				title: 'Move-out',
				value: (dto) => dto.moveOut?.format(DATE_FORMAT)
			}, {
				id: 'tenants',
				title: 'Tenants',
				value: (dto) => dto.tenants?.map(t => t.name + ' ' + t.phone + ' ' + t.email).join('; ')
			}, {
				id: 'schedule',
				title: 'Schedule',
				value: (dto) => {
					// if (!dto.schedule || dto.schedule.length == 0) {
					// 	if (dto.scheduleMessage) {
					// 		return dto.scheduleMessage;
					// 	}
					// 	return <></>;
					// }
					return <>{dto.scheduleMessage} {(dto.schedule ?? []).map(m => {
						const fd = m.d.format(DATE_FORMAT);
						let prefix = '';

						//FIXME: can't get this styling to work right - the bold ones overlap with the others
						if (m.isImport) {
							prefix = 'Hist:';
						}
						if (m.isMoveOut) {
							prefix = 'MoveOut:';
						}
						return prefix + fd + '   ';
					})}</>;
				}
			}
		];

		return cols;
	}

	function filterItems(item: Property, searchString: string) {
		return searchString.split(';').some(segment => {
			 if (segment.trim().length == 0) return false;
			 return segment.split(' ').every(text => {
					if (text.trim().length == 0) return false;

					if ((item.address??'').toLowerCase().indexOf(text) > -1) {
						 return true;
					}
					if ((item.city ?? '').toLowerCase().indexOf(text) > -1) {
						 return true;
					}
					if ((item.state ?? '').toLowerCase().indexOf(text) > -1) {
						 return true;
					}
					if ((item.unit ?? '').toLowerCase().indexOf(text) > -1) {
						 return true;
					}
					if (((item.zip ?? '') + '').toLowerCase().indexOf(text) > -1) {
						 return true;
					}
					if ((item.leaseStart?.format(DATE_FORMAT) ?? '').toLowerCase().indexOf(text) > -1) {
						 return true;
					}
					if ((item.leaseEnd?.format(DATE_FORMAT) ?? '').toLowerCase().indexOf(text) > -1) {
						 return true;
					}

					return false;
			 });
		});
	}

	function download() {
		const doctag = document.createElement('a');
		let data = toCSVInspections(propertyList);
		let file = new Blob([data], { type: 'text/csv' });
		doctag.href = URL.createObjectURL(file);
		doctag.download = 'rei-property-inspections.csv';
		doctag.click();

		data = toCSVSchedule(propertyList);
		file = new Blob([data], { type: 'text/csv' });
		doctag.href = URL.createObjectURL(file);
		doctag.download = 'rei-schedule.csv';
		doctag.click();
	}
}

const STYLES = makeStyles((theme: Theme) => ({
	// scrollHeader: {
	//    margin: '0px auto',
	//    width: '100%',
	// },
	scrollContent: {
		 overflow: 'auto',
		 minHeight: '200px',
	},
	// scrollFooter: {
	//    flexShrink: 0
	// },
	table: {
		minWidth: '600px'
	},
	tableHead: {
	},
	tableHeaderCell: {
		 backgroundColor: '#fff',
		 padding: '8px',
		 position: 'sticky',
		 top: 0,
		 zIndex: 10,
	},
	tableCell: {
		 color: 'inherit',
		 padding: '0px',
	},
	tableCellText: {
		 display: 'flex',
		 alignItems: 'center',
		 minHeight: '47px',
		 padding: '0px 8px',
	},
	tableCellTextHighlight: {
		 display: 'flex',
		 alignItems: 'center',
		 minHeight: '47px',
		 padding: '0px 8px',
		 backgroundColor: theme.palette.primary.light,
	},
	page: {
		 backgroundColor: '#fff',
		 backgroundRepeat: 'no-repeat',
		 backgroundPosition: 'bottom center',
		 backgroundSize: '100% auto',
		 top: 0,
		 left: 0,
		 bottom: 0,
		 right: 0,
		 height: '100vh',
	},
	mainContainer: {
		 margin: 'auto',
		 padding: '10px 0px 10px 5px',
		 borderRadius: '7px',
		 height: '100%',
		 width: '100%',
		 display: 'flex',
		 flexDirection: 'column',
	},
	logo: {
		 height: '100px',
		 maxWidth: '100%',
		 display: 'block',
		 marginLeft: 'auto',
	},
	title: {
		 padding: '20px 0px',
		 margin: 'auto auto auto 0',
	},
	button: {
		boxShadow: 'none',
		'&:hover': {
			boxShadow: 'none',
		},
	},
}));
