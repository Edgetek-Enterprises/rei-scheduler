import React from 'react';
import moment from 'moment';
import './App.css';
import { useDropzone } from 'react-dropzone';
import { Typography, makeStyles, Button, TableCell, Table, TableHead, TableRow, TableSortLabel, TableBody, TablePagination, Theme } from '@material-ui/core';
import CloudUploadIcon from '@material-ui/icons/CloudUpload';
import { isCSV, parseCsv, toCSVInspections, toCSVSchedule } from './csvutil';
import { Property, buildSchedule, PropertySchedule, ScheduleOptions } from './property';
import { ColumnData, handleSortChange, SortData, sortRows } from './tableutil';

export const DATE_FORMAT = 'MM/DD/YYYY';

const DropZone = (props: {
	message: any;
	handleData: (p: Property[], ps: PropertySchedule[] | undefined) => string | undefined
}) => {
	const [errMsg, setErrMsg] = React.useState<string | undefined>();
	const [processing, setProcessing] = React.useState<boolean>(false);

	const onDrop = React.useCallback((acceptedFiles: File[]) => {
		if (acceptedFiles.length < 1) {
			setErrMsg('Only single CSV file drop allowed');
			return;
		}
		const f = acceptedFiles[0];
		const iscsv = isCSV(f);
		if (!iscsv) {
			setErrMsg('File is not CSV');
			return;
		}
		setProcessing(true);
		parseCsv(f, (r, ps) => {
				const msg = props.handleData(r, ps);
				setProcessing(false);
				if (msg) {
					setErrMsg(msg);
				}
			}, setErrMsg);
	}, [])
	const onDragEnter = React.useCallback(() => {
		if (errMsg) {
			setErrMsg(undefined);
		}
	}, [errMsg]);
	const {getRootProps, getInputProps, isDragActive} = useDropzone({
		onDrop,
		onDragEnter,
		multiple: false
	})

	let divCls = 'dropZone MuiTypography-root MuiTypography-h5 dropzoneTextStyle';
	if (isDragActive) {
		divCls += ' stripes';
	} else if (errMsg) {
		divCls += ' rejectStripes';
	} else if (processing) {
		divCls += ' processingStripes';
	}
	return (
		<div className={divCls} {...getRootProps()}>
			<input {...getInputProps()} />
			<div>{props.message}</div>
			{errMsg && <div>{errMsg}</div>}
			<CloudUploadIcon style={{width: '51', height: '51', color: '#909090' }} />
		</div>
	)
}

export default function App() {
	const [propertyList, setPropertyList] = React.useState<Property[]>([]);
	const [priorSchedule, setPriorSchedule] = React.useState<PropertySchedule[] | undefined>();
	const [computedSchedule, setComputedSchedule] = React.useState<PropertySchedule[]>([]);
	const columnData = getColumns();
	const [sorted, setSorted] = React.useState<SortData<PropertySchedule>>({ col: columnData[0], dir: 'asc' });
	const [filterText, setFilterText] = React.useState<string>('');
	const classes = STYLES();

	React.useEffect(() => {
		if (propertyList.length > 0) {
			const pss = buildSchedule(propertyList, getOptions(), priorSchedule);
			setComputedSchedule(pss);
		}
	}, [propertyList, priorSchedule]);

	let items = computedSchedule;
	if (filterText) {
		items = items.filter(i => filterItems(i, filterText!.toLowerCase()))
	}
	items = sortRows(items, sorted);

	return <div className="App">
			<header className="App-header">
				<p>
					REI Scheduler
				</p>
			</header>
			<div className='dropzones'>
				<DropZone message={<>Drop the <strong>base properties list</strong> file here <span style={{fontSize: 'smaller' }}>(or click to select file)</span></>}
					handleData={propertyListUpdated} />
				<DropZone message={<>Drop the <strong>previous schedule</strong> file here <span style={{fontSize: 'smaller' }}>(or click to select file)</span></>}
					handleData={priorScheduleUpdated} />
			</div>
			{ propertyList.length > 0 && <span style={{color: '#0f0' }}>{propertyList.length} properties available.</span>}
			{ propertyList.length == 0 && <span style={{color: '#f00' }}>{propertyList.length} properties available.</span>}
			{ priorSchedule && <span style={{color: '#0f0', marginLeft: '10px' }}>Previous schedule loaded.</span>}
			{ !priorSchedule && <span style={{color: '#f00', marginLeft: '10px' }}>No previous schedule loaded.</span>}
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
							{ items.map((ps, idx) => {
								return <TableRow key={ps.p.pid} >
										{columnData.map((cd, idx) => <TableCell className={classes.tableCell} key={ps.p.pid + '.' + cd.id}
											scope="row">
												<div className={classes.tableCellText}>
													{cd.value(ps)}
												</div>
										</TableCell>)
										}
								</TableRow>;})
							}
					</TableBody>
				</Table>
		</div>
	</div>;

	function propertyListUpdated(p: Property[], ps: PropertySchedule[] | undefined) : string | undefined {
		if (ps) {
			return 'Invalid format for base properties list - must not include schedule columns'
		}
		setPropertyList(p);
		return undefined;
	}

	function priorScheduleUpdated(p: Property[], ps: PropertySchedule[] | undefined) : string | undefined {
		if (!ps) {
			return 'Invalid format for previous schedule - expecting schedule columns'
		}
		setPriorSchedule(ps);
		return undefined;
	}

	function getOptions() : ScheduleOptions {
		const blackoutDates : moment.Moment[] = [];

		return {
			scheduleMax: moment().add(3, 'years'),
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

	function getColumns() : ColumnData<PropertySchedule>[] {
		let cols: ColumnData<PropertySchedule>[] = [{
				id : 'address',
				title : 'Address',
				value: (dto) => dto.p.address,
			},{
				id : 'city',
				title : 'City',
				value : (dto) => dto.p.city,
			}, {
				id: 'state',
				title: 'State',
				value: (dto) => dto.p.state
			}, {
				id: 'zip',
				title: 'Zip',
				value: (dto) => dto.p.zip
			}, {
				id: 'unit',
				title: 'Unit',
				value: (dto) => dto.p.unit
			}, {
				id: 'leaseStart',
				title: 'Lease Start',
				value: (dto) => dto.p.leaseStart?.format(DATE_FORMAT)
			}, {
				id: 'leaseEnd',
				title: 'Lease End',
				value: (dto) => dto.p.leaseEnd?.format(DATE_FORMAT)
			}, {
				id: 'moveOut',
				title: 'Move-out',
				value: (dto) => dto.p.moveOut?.format(DATE_FORMAT)
			}, {
				id: 'schedule',
				title: 'Schedule',
				value: (dto) => {
					if (dto.message) {
						return dto.message;
					}
					return dto.schedule.map(m => m.d.format(DATE_FORMAT)).join(' ')
				}
			}
		];

		return cols;
	}

	function filterItems(item: PropertySchedule, searchString: string) {
		return searchString.split(';').some(segment => {
			 if (segment.trim().length == 0) return false;
			 return segment.split(' ').every(text => {
					if (text.trim().length == 0) return false;

					if ((item.p.address??'').toLowerCase().indexOf(text) > -1) {
						 return true;
					}
					if ((item.p.city ?? '').toLowerCase().indexOf(text) > -1) {
						 return true;
					}
					if ((item.p.state ?? '').toLowerCase().indexOf(text) > -1) {
						 return true;
					}
					if ((item.p.unit ?? '').toLowerCase().indexOf(text) > -1) {
						 return true;
					}
					if (((item.p.zip ?? '') + '').toLowerCase().indexOf(text) > -1) {
						 return true;
					}
					if ((item.p.leaseStart?.format(DATE_FORMAT) ?? '').toLowerCase().indexOf(text) > -1) {
						 return true;
					}
					if ((item.p.leaseEnd?.format(DATE_FORMAT) ?? '').toLowerCase().indexOf(text) > -1) {
						 return true;
					}

					return false;
			 });
		});
	}

	function download() {
		const doctag = document.createElement('a');
		let data = toCSVInspections(computedSchedule);
		let file = new Blob([data], { type: 'text/csv' });
		doctag.href = URL.createObjectURL(file);
		doctag.download = 'rei-property-inspections.csv';
		doctag.click();

		data = toCSVSchedule(computedSchedule);
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
