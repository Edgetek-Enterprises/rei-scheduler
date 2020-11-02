import React from "react";
import CloudUploadIcon from '@material-ui/icons/CloudUpload';
import { useDropzone } from 'react-dropzone';
import { Property } from "../property";
import { isCSV, parseCsvProperties } from '../csvutil';

export const DropZone = (props: {
	message: any;
	handleData: (p: Property[]) => string | undefined;
}) => {
	const [errMsg, setErrMsg] = React.useState<string | undefined>();
	const [processing, setProcessing] = React.useState<boolean>(false);

	const onDrop = (acceptedFiles: File[]) => {
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
		parseCsvProperties(f, (ps) => {
				const msg = props.handleData(ps);
				setProcessing(false);
				if (msg) {
					console.log('Failed parsing: ' + msg);
					setErrMsg(msg);
				}
			}, (err) => {
				console.log('Failed parsing: ' + err);
				setErrMsg(err);
			});
	};
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

	let divCls = 'dropZone dropzoneTextStyle';
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
