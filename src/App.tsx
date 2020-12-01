import React from 'react';
import moment from 'moment';
import './App.css';
import { makeStyles, Button, Popover, TableCell, Table, TableHead, TableRow, TableSortLabel, TableBody, Theme } from '@material-ui/core';
import MomentUtils from '@date-io/moment';
import { KeyboardDatePicker, MuiPickersUtilsProvider } from "@material-ui/pickers";
import { toCSVInspections, toCSVSchedule } from './csvutil';
import { Property, mergeTenants, mergeSchedules, pstring } from './property';
import { ColumnData, handleSortChange, SortData, sortRows } from './tableutil';
import { DropZone } from './components/DropZone';
import { buildSchedule, ScheduleOptions } from './scheduler';
import { MultiButton } from './components/MultiButton';

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
	const hasTenants = propertyList.find(p => p.tenants?.some(ti => !!ti)) !== undefined;

	const [popInstructionAnchor, setPopInstructionAnchor] = React.useState<HTMLButtonElement | undefined>();

	const popInstructionOpen = Boolean(popInstructionAnchor);
	const popInstructionOpenId = popInstructionOpen ? 'simple-popover' : undefined;

	return <div className="App">
			<header className="App-header">
				<p>
					REI Scheduler
					<Button
						aria-describedby={popInstructionOpenId}
						style={{marginLeft: '10px'}}
						variant="contained"
						color="primary"
						onClick={(evt) => setPopInstructionAnchor(evt.currentTarget)}
					>
						Instructions
					</Button>
				</p>
			</header>
			<Popover
				id={popInstructionOpenId}
				open={popInstructionOpen}
				anchorEl={popInstructionAnchor}
				onClose={() => setPopInstructionAnchor(undefined)}
				anchorOrigin={{
					vertical: 'bottom',
					horizontal: 'center',
				}}
				transformOrigin={{
					vertical: 'top',
					horizontal: 'center',
				}}
			>
				<div>
					Input a <strong>base properties list</strong> to determine what properties to use. If it contains a historical schedule, this will also be imported.
					The scheduler will execute and generate schedules.
					Columns: Property Street Address 1, Property City, Property State,
					Property Zip (numeric), Unit, Lease From (mm/dd/yyyy), Lease To (mm/dd/yyyy), Move-out (mm/dd/yyyy); optional columns: Inspection 1 (mm/dd/yyyy),
					Inspection 2 (mm/dd/yyyy), ..., Inspection N (mm/dd/yyyy)
				</div>
				<div>
					Input a <strong>properties list with tenant details</strong> to decorate the current properties with tenant details. No new property rows are created.
					A base properties list must already exist. Row addresses may be duplicates, and each row will create a tenant record on the existing imported property list.
					Columns: Property Street Address 1, Property City, Property State,
					Property Zip (numeric), Unit, Lease From (mm/dd/yyyy), Lease To (mm/dd/yyyy), Move-out (mm/dd/yyyy), Tenant, Phone Numbers, Emails
				</div>
				<div>
					Input a <strong>previous schedule</strong> to replace the schedule for the current properties list. No new property rows are created.
					The scheduler will execute and generate schedules.
					Schedule dates with <em>Hist</em> are "historical" imported schedule events and are not moved by the scheduler. Remove the schedule for the input row
					to generate a new schedule for a property.
					Columns: Property Street Address 1, Property City, Property State,
					Property Zip (numeric), Unit, Lease From (mm/dd/yyyy), Lease To (mm/dd/yyyy), Move-out (mm/dd/yyyy); optional columns: Inspection 1 (mm/dd/yyyy),
					Inspection 2 (mm/dd/yyyy), ..., Inspection N (mm/dd/yyyy)
				</div>
				<div>
					Schedule dates with <em>MoveOut</em> are "move-out" inspections, scheduled the next day after a move-out or lease end and are not moved by the scheduler.
				</div>
			</Popover>
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
						<MultiButton content={[
							{title:'Inspections', handler: downloadInspections},
							{title:'Schedule', handler: downloadSchedule}]}
						/>
					</span>

					Schedule Start Date:
					<MuiPickersUtilsProvider utils={MomentUtils}>
						<KeyboardDatePicker
							value={startDate}
							style={{width:'120px'}}
							placeholder={startDate.format(DATE_FORMAT)}
							onChange={(date) => startDateUpdated((date as moment.Moment) ?? moment())}
							format={DATE_FORMAT}
							rifmFormatter={(str) => str}
						/>
					</MuiPickersUtilsProvider>
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

	function startDateUpdated(m: moment.Moment) {
		if (!m.isValid()) {
			return;
		}
		setStartDate(m);
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
