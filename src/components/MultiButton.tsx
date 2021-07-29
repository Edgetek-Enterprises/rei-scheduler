import React from 'react';
import { makeStyles, Theme, MenuItem, Select } from '@material-ui/core';

export interface ButtonOption {
	handler: () => void;
	title: string;
}
export const MultiButton = (props: {
	content: ButtonOption[];
	title: (current:ButtonOption,index:number) => string;
	selectedIndex?: number;
}) => {
	const classes = STYLES();
	const [title, setTitle] = React.useState<string>('Select');

	React.useEffect(() => {
		if (props.selectedIndex !== undefined) {
			const bo = props.content[props.selectedIndex];
			setTitle(props.title(bo, props.selectedIndex));
		} else {
			setTitle(props.title(props.content[0], 0));
		}
	}, [props.selectedIndex]);

	function change(bo: ButtonOption, i:number) {
		setTitle(props.title(bo, i));
		bo.handler();
	}

	return <div className={classes.openControlBar}>
		<Select
			displayEmpty
			value=''
			// className={classes.selectEmpty}
			inputProps={{ 'aria-label': 'Without label' }}
		>
			<MenuItem value='' disabled>{title}</MenuItem>
			{ props.content.map((c,i) => {
				const si = props.selectedIndex;
				return <MenuItem
					key={i}
					onClick={event => change(props.content[i],i)}
				>
					{ props.content[i].title }
				</MenuItem>;
			}
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
