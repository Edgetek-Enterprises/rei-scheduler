import React from 'react';
import './App.css';
import { DropEvent, useDropzone } from 'react-dropzone';
import CloudUploadIcon from '@material-ui/icons/CloudUpload';
import Papa from 'papaparse';

function DropZone() {
  const [errMsg, setErrMsg] = React.useState<string | undefined>();
  const [processing, setProcessing] = React.useState<boolean>(false);

  const onDrop = React.useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length < 1) {
      setErrMsg("Only single CSV file drop allowed");
      return;
    }
    const f = acceptedFiles[0];
    const iscsv = f.name.endsWith(".csv");
    if (!iscsv) {
      setErrMsg("File is not CSV");
      return;
    }
    setProcessing(true);
    const config: Papa.ParseConfig = {
      header: true,
      worker: false,
      skipEmptyLines: true,
      transform: (value, field) => {
        return value;
      },
      step: (results, parser) => {
        console.log("Row data:", results.data);
        console.log("Row errors:", results.errors);
      },
      complete: () => {
        setProcessing(false);
        //TODO: display results
      }
    };
    Papa.parse(f, config);
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

  let divCls = "dropZone dropzoneParagraph MuiTypography-root MuiTypography-h5 dropzoneTextStyle";
  if (isDragActive) {
    divCls += " stripes";
  } else if (errMsg) {
    divCls += " rejectStripes";
  } else if (processing) {
    divCls += " processingStripes";
  }
  return (
    <div className={divCls} {...getRootProps()}>
      <input {...getInputProps()} />
      <div>Drop the input file here or click to select file</div>
      {errMsg && <div>{errMsg}</div>}
      <CloudUploadIcon style={{width: "51", height: "51", color: "#909090" }} />
    </div>
  )
}

export default function App() {
  return (
    <div className="App">
      <header className="App-header">
        <p>
          Here's the scheduler app
        </p>
        <DropZone />
      </header>
    </div>
  );
}
