// MIT. Authenticated publication desk and streaming complete original files.
import { randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { need } from '../model.mjs';
import { listFredDdpPublicationOperations, readFredDdpPublicationOperation, readFredDdpPublicationReport,
  pageFredDdpPublicationRows, openFredDdpPublicationFile, readFredDdpPublicationFileChunk } from './published-workspace.mjs';

const headers = {'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; frame-ancestors 'none'; sandbox"};
const uint = (value,fallback) => { if(value === null || value === undefined) return fallback;
  need(/^\d+$/.test(value) && Number.isSafeInteger(Number(value)),'Choose a complete original page offset.'); return Number(value); };
const selection = url => ({id:url.searchParams.get('operation'),name:url.searchParams.get('name'),expectedSha256:url.searchParams.get('sha256')});
export function createFredDdpPublicationHttp({directory}) {
  const tickets = new Map();
  const clean = () => { for(const [id,ticket] of tickets) if(ticket.expiresAt <= Date.now()) tickets.delete(id); };
  async function stream(res,selected) {
    const opened = await openFredDdpPublicationFile({directory,...selected});
    try {
      const file = opened.descriptor;
      res.writeHead(200,{...headers,'content-type':file.contentType,'content-length':file.bytes,
        'content-disposition':'attachment; filename="' + file.name.split('/').at(-1) + '"',
        'x-content-sha256':file.sha256});
      await pipeline(opened.file.createReadStream({autoClose:false}),res);
    } finally { await opened.file.close(); }
  }
  return {
    /** This route is reached only after the workspace's original local-origin check. */
    async ticket(req,res,url) {
      if(req.method !== 'GET' || url.pathname !== '/api/ddp-publication-download') return false;
      clean(); const id = url.searchParams.get('ticket'), selected = tickets.get(id);
      need(selected,'Request a fresh original-file download from this workspace session.','FRED_PUBLISHED_DOWNLOAD_EXPIRED',403);
      tickets.delete(id); await stream(res,selected); return true;
    },
    async handle({req,res,url,body,send}) {
      if(req.method === 'GET' && url.pathname === '/api/ddp-publications') {
        send(res,200,await listFredDdpPublicationOperations({directory,offset:uint(url.searchParams.get('offset'),0),limit:uint(url.searchParams.get('limit'),100)})); return true;
      }
      if(req.method === 'GET' && url.pathname === '/api/ddp-publication') {
        send(res,200,await readFredDdpPublicationOperation({directory,id:url.searchParams.get('operation')})); return true;
      }
      if(req.method === 'GET' && url.pathname === '/api/ddp-publication-report') {
        send(res,200,await readFredDdpPublicationReport({directory,id:url.searchParams.get('operation'),
          offset:uint(url.searchParams.get('offset'),0),limit:uint(url.searchParams.get('limit'),100),query:url.searchParams.get('query') ?? ''})); return true;
      }
      if(req.method === 'GET' && url.pathname === '/api/ddp-publication-rows') {
        send(res,200,await pageFredDdpPublicationRows({directory,id:url.searchParams.get('operation'),
          comparisonId:url.searchParams.get('comparison'),offset:uint(url.searchParams.get('offset'),0),limit:uint(url.searchParams.get('limit'),100),
          seriesId:url.searchParams.get('series') || null,status:url.searchParams.get('status') || null})); return true;
      }
      if(req.method === 'GET' && url.pathname === '/api/ddp-publication-file') {
        await stream(res,selection(url)); return true;
      }
      if(req.method === 'GET' && url.pathname === '/api/ddp-publication-file-chunk') {
        send(res,200,await readFredDdpPublicationFileChunk({directory,...selection(url),
          offset:uint(url.searchParams.get('offset'),0),limit:uint(url.searchParams.get('limit'),192 * 1024)})); return true;
      }
      if(req.method === 'POST' && url.pathname === '/api/ddp-publication-download-ticket') {
        const request = await body(req,16384);
        const selected = {id:request.id,name:request.name,expectedSha256:request.expectedSha256};
        const opened = await openFredDdpPublicationFile({directory,...selected}); await opened.file.close(); clean();
        need(tickets.size < 64,'Use the original pending download before requesting more files.','FRED_PUBLISHED_DOWNLOAD_BUSY',429);
        const id = randomBytes(32).toString('hex'), expiresAt = Date.now() + 60000;
        tickets.set(id,{...selected,expiresAt});
        send(res,200,{projectId:opened.projectId,operationId:selected.id,file:opened.descriptor,
          expiresAt:new Date(expiresAt).toISOString(),url:'/api/ddp-publication-download?ticket=' + id}); return true;
      }
      return false;
    },
    close() { tickets.clear(); }
  };
}
