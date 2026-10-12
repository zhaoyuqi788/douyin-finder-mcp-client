import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {ListToolsRequestSchema, CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {connectRemote} from './https-oauth.mjs';

// Only this small client runs on Qoder's computer. KOL data and the model stay on the host.
// OAuth tokens stay in this process's memory and never enter config files or stdout.
let remote, server;
try {
  remote = await connectRemote({onPhase: phase => process.stderr.write('Douyin Finder: ' + phase + '\n')});
  const {tools} = await remote.client.listTools();
  const allowed = new Set(tools.map(tool => tool.name));
  server = new Server({name: 'douyin-finder-https-client', version: '0.4.6'}, {capabilities: {tools: {}}, instructions: remote.client.getInstructions()});
  server.setRequestHandler(ListToolsRequestSchema, async () => ({tools}));
  server.setRequestHandler(CallToolRequestSchema, async (request,{signal}) => {
    if (!allowed.has(request.params.name)) throw new Error('Unknown tool');
    return remote.client.callTool({name: request.params.name, arguments: request.params.arguments ?? {}},undefined,{signal});
  });
  await server.connect(new StdioServerTransport());
  let stopping = false;
  const close = async () => {if (stopping) return; stopping = true; await server.close(); await remote.close();};
  process.on('SIGINT', () => close().finally(() => process.exit(0)));
  process.on('SIGTERM', () => close().finally(() => process.exit(0)));
  process.stdin.once('end', () => close().finally(() => process.exit(0)));
} catch (e) {
  const diagnostic={type:['Error','TypeError','McpError','StreamableHTTPError','TimeoutError'].includes(e?.name)?e.name:'Error',
    network_code:/^[A-Z_]{1,50}$/.test(e?.cause?.code??'')?e.cause.code:null,
    http_code:Number.isSafeInteger(e?.code)&&e.code>=400&&e.code<=599?e.code:null,
    frames:(e?.stack??'').split('\n').slice(1).map(line=>line.match(/([^/()\s]+\.m?js):(\d+):(\d+)/)?.slice(1)).filter(Boolean)};
  process.stderr.write('Douyin Finder HTTPS connection failed. Check login, email verification, invitation, network and callback port 53682.\n');
  process.stderr.write('Douyin Finder diagnostic: '+JSON.stringify(diagnostic)+'\n');
  await remote?.close().catch(()=>{}); process.exitCode = 1;
}
