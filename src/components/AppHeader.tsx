import React from 'react';
import { Button, Popover } from '@material-ui/core';

export const AppHeader = () => {
	const [popInstructionAnchor, setPopInstructionAnchor] = React.useState<HTMLButtonElement | undefined>();
	const popInstructionOpen = Boolean(popInstructionAnchor);
	const popInstructionOpenId = popInstructionOpen ? 'simple-popover' : undefined;

	return <>
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
	</>;
}
