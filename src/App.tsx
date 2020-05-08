import React from 'react';
import './App.css';
import { useDropzone } from 'react-dropzone';
import { Typography, makeStyles, Button, TableCell, Table, TableHead, TableRow, TableSortLabel, TableBody, TablePagination, Theme } from '@material-ui/core';
import CloudUploadIcon from '@material-ui/icons/CloudUpload';
import { isCSV, parseCsv } from './csvutil';
import { Property } from './property';
import { ColumnData, handleSortChange, SortData } from './tableutil';

const DropZone = (props: {
  handleData: (p: Property[]) => void
}) => {
  const [errMsg, setErrMsg] = React.useState<string | undefined>();
  const [processing, setProcessing] = React.useState<boolean>(false);

  const onDrop = React.useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length < 1) {
      setErrMsg("Only single CSV file drop allowed");
      return;
    }
    const f = acceptedFiles[0];
    const iscsv = isCSV(f);
    if (!iscsv) {
      setErrMsg("File is not CSV");
      return;
    }
    setProcessing(true);
    parseCsv(f, (r) => { props.handleData(r); setProcessing(false); }, setErrMsg);
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
  const [data, setData] = React.useState<Property[]>([]);
  const columnData = getColumns();
  const [sorted, setSorted] = React.useState<SortData<Property>>({ col: columnData[0], dir: 'asc' });
  const classes = STYLES();

  return <div className="App">
      <header className="App-header">
        <p>
          REI Scheduler
        </p>
      </header>
      <DropZone handleData={setData} />
      { data.length > 0 && <>{data.length} properties available.</>}
      <div className={classes.scrollContent}>
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
              { data.map((p, idx) => {
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
        value: (dto) => dto.leaseStart?.format("MM/DD/YYYY")
      }, {
        id: 'leaseEnd',
        title: 'Lease End',
        value: (dto) => dto.leaseEnd?.format("MM/DD/YYYY")
      }
    ];

    return cols;
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
}));
