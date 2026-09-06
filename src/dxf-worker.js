import {parseDXF} from './dxf.js';
self.onmessage=({data})=>{try{const t=performance.now(),document=parseDXF(data.text);self.postMessage({job:data.job,document,milliseconds:performance.now()-t});}catch(error){self.postMessage({job:data.job,error:error.message});}};
