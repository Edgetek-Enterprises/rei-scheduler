import React from 'react';
import { makeStyles, Theme, MenuItem, Select } from '@material-ui/core';

export interface ButtonOptions {
	handler: () => void;
	title: string;
}
export const MultiButton = (props: {
	content: ButtonOptions[]
}) => {
	const classes = STYLES();

	return <div className={classes.openControlBar}>
		<Select
			displayEmpty
			value=''
			// className={classes.selectEmpty}
			inputProps={{ 'aria-label': 'Without label' }}
		>
			<MenuItem value='' disabled>Download CSV</MenuItem>
			{ props.content.map((c,i) =>
				<MenuItem
					onClick={event => props.content[i].handler()}
				>
					{ props.content[i].title }
				</MenuItem>
			)}
		</Select>
	</div>;
}

const STYLES = makeStyles((theme: Theme) => ({
	 openControlBar: {
		display: 'inline'
		// flex: '0 0 auto',
		// display: 'flex',
		// flexDirection: 'row' as 'row',
		// justifyContent: 'center' as 'center'
	 }
}));
