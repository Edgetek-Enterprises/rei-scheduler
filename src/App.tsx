import React from 'react';
import moment from 'moment';
import './App.css';
import { makeStyles, TableCell, Table, TableHead, TableRow, TableSortLabel, TableBody, Theme, Slider } from '@material-ui/core';
import MomentUtils from '@date-io/moment';
import { KeyboardDatePicker, MuiPickersUtilsProvider } from "@material-ui/pickers";
import { CsvType, toCSVInspections, toCSVSchedule } from './util/csvutil';
import { Property, mergeTenants, mergeSchedules, pstring, truncateSchedules } from './property';
import { ColumnData, handleSortChange, SortData, sortRows } from './util/tableutil';
import { DropZone } from './components/DropZone';
import { AppHeader } from './components/AppHeader';
import { buildSchedule, ScheduleOptions } from './scheduler';
import { ButtonOption, MultiButton } from './components/MultiButton';

export const DATE_FORMAT = 'MM/DD/YYYY';

export default function App() {
	const tomorrow = moment().add(1, 'd').startOf('d');
	const [propertyList, setPropertyList] = React.useState<Property[]>([]);
	const [startDate, setStartDate] = React.useState<moment.Moment>(tomorrow);

	const columnData = getColumns();
	const [sorted, setSorted] = React.useState<SortData<Property>>({ col: columnData[0], dir: 'asc' });
	const [filterText, setFilterText] = React.useState<string>('');
	const [maxPerDay, setMaxPerDay] = React.useState<number>(5);
	const [maxPerWeek, setMaxPerWeek] = React.useState<number>(7);
	const classes = STYLES();

	let items = propertyList;
	if (filterText) {
		items = items.filter(i => filterItems(i, filterText!.toLowerCase()))
	}
	items = sortRows(items, sorted);
	const hasSchedule = propertyList.find(p => p.schedule?.some(si => si.isImport)) !== undefined;
	const hasTenants = propertyList.find(p => p.tenants?.some(ti => !!ti)) !== undefined;

	return <div className="App">
		<AppHeader />
		<div className='dropzones'>
			<DropZone message={<>Drop the <strong>base properties list</strong> file here <span style={{fontSize: 'smaller' }}>(or click to select file)</span></>}
				type={CsvType.PropertiesBase}
				handleData={propertyListUpdated} />
			<DropZone message={<>Drop the <strong>properties list with tenant details</strong> file here <span style={{fontSize: 'smaller' }}>(or click to select file)</span></>}
				type={CsvType.PropertiesTenants}
				handleData={propertyListTenantsUpdated} />
			<DropZone message={<>Drop the <strong>previous schedule</strong> file here <span style={{fontSize: 'smaller' }}>(or click to select file)</span></>}
				type={CsvType.PropertiesSchedules}
				handleData={priorScheduleUpdated} />
			<DropZone message={<>Drop the <strong>last inspection dates list</strong> file here <span style={{fontSize: 'smaller' }}>(or click to select file)</span></>}
				type={CsvType.PropertiesLastInspection}
				handleData={priorScheduleTruncated} />
		</div>
		{ propertyList.length > 0 && <span style={{color: '#0f0' }}>{propertyList.length} properties available.</span>}
		{ propertyList.length == 0 && <span style={{color: '#f00' }}>{propertyList.length} properties available.</span>}
		{ hasTenants && <span style={{color: '#0f0', marginLeft: '10px' }}>Tenant data loaded.</span>}
		{ !hasTenants && <span style={{color: '#f00', marginLeft: '10px' }}>No tenant data loaded.</span>}
		{ hasSchedule && <span style={{color: '#0f0', marginLeft: '10px' }}>Previous schedule loaded.</span>}
		{ !hasSchedule && <span style={{color: '#f00', marginLeft: '10px' }}>No previous schedule loaded.</span>}
		<div className={classes.scrollContent}>
			<div className={classes.configBar}>
				<input type="text"
					placeholder='Filter'
					onChange={(evt) => setFilterText(evt.target.value ?? '')}
					value={filterText}
				/>
				<span style={{padding: '0px 20px'}}>
					<MultiButton
						title={(bo) => 'Download CSV'}
						content={[
							{title:'Inspections', handler: downloadInspections},
							{title:'Schedule', handler: downloadSchedule}]}
					/>
				</span>

				Schedule Start Date:
				<MuiPickersUtilsProvider utils={MomentUtils}>
					<KeyboardDatePicker
						value={startDate}
						style={{width:'140px'}}
						placeholder={startDate.format(DATE_FORMAT)}
						onChange={(date) => {
							const m = (date as moment.Moment) ?? moment();
							if (!m.isValid()) {
								return;
							}
							setStartDate(m);
							optionsUpdated();
						}}
						format={DATE_FORMAT}
						rifmFormatter={(str) => str}
					/>
				</MuiPickersUtilsProvider>

				<span style={{padding: '0px 20px'}}>
					<MultiButton
						title={(bo,i) => 'Max per day: ' + (i+1)}
						content={Array.from({length: 30}, (value, key) => key).map(
							i => {return {title:''+(i+1), handler: () => {setMaxPerDay(i+1); optionsUpdated(); }} as ButtonOption;}
						)}
						selectedIndex={maxPerDay-1}
					/>
				</span>
				<span style={{padding: '0px 20px'}}>
					<MultiButton
						title={(bo,i) => 'Max per week: ' + (i+1)}
						content={Array.from({length: 30}, (value, key) => key).map(
							i => {return {title:''+(i+1), handler: () => {setMaxPerWeek(i+1); optionsUpdated(); }} as ButtonOption;}
						)}
						selectedIndex={maxPerWeek-1}
					/>
				</span>
			</div>
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
									{columnData.map((cd, idx) => <TableCell
											className={classes.tableCell}
											key={p.pid + '.' + cd.id}
											scope="row"
										>
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

	function optionsUpdated() {
		propertyList.forEach(p => {
			p.schedule = (p.schedule ?? []).filter(s => s.isImport);
			console.log('Computed schedule reset for ' + pstring(p));
		})
		let pss = buildSchedule(propertyList, getOptions());
		setPropertyList(pss);
	}

	/**
	 * Provides parsed property details
	 */
	function propertyListUpdated(plist: Property[]) : string | undefined {
		if (plist.find(p => p.tenants)) {
			return 'Invalid format for base property list - expecting no tenant columns'
		}
		plist.forEach(p => {
			if (p.schedule && p.schedule.length > 0) {
				console.log('Lease dates imported for ' + pstring(p));
			}
		})
		const pss = buildSchedule(plist, getOptions());
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
			pss = buildSchedule(pss, getOptions());
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

		let pss = mergeSchedules(propertyList, plist);
		pss = buildSchedule(pss, getOptions());
		setPropertyList(pss);
		return undefined;
	};

	/**
	 * Provides parsed property details including schedules
	 */
	function priorScheduleTruncated(plist: Property[]) : string | undefined {
		if (propertyList.length == 0) {
			return 'No base property list, upload one first';
		}
		if (plist.find(p => p.tenants)) {
			return 'Invalid format for last-dates property list - expecting no tenant columns'
		}

		if (!plist.find(p => p.schedule)) {
			return 'Invalid format for last-dates property list - expecting schedule columns'
		}

		let pss = truncateSchedules(propertyList, plist);
		pss = buildSchedule(pss, getOptions());
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
			maxPerDay: maxPerDay,
			maxPerWeek: maxPerWeek,
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
					if (item.schedule && item.schedule.map(si => {
							const fd = si.d.format(DATE_FORMAT);
							let prefix = '';

							if (si.isImport) {
								prefix = 'Hist:';
							}
							if (si.isMoveOut) {
								prefix = 'MoveOut:';
							}
							return prefix + fd + '   ';
						}).join(' ').toLowerCase().includes(text)
					) {
						return true;
					}

					return false;
			 });
		});
	}
	function downloadInspections() {
		const doctag = document.createElement('a');
		let data = toCSVInspections(propertyList);
		let file = new Blob([data], { type: 'text/csv' });
		doctag.href = URL.createObjectURL(file);
		doctag.download = 'rei-property-inspections.csv';
		doctag.click();
	}
	function downloadSchedule() {
		const doctag = document.createElement('a');
		let data = toCSVSchedule(propertyList);
		let file = new Blob([data], { type: 'text/csv' });
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
	configBar: {
		display: 'inline',
	}
}));
