// MIT.
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { z } from 'zod';
import type { VideoMcpOptions, VideoMcpWorkspace } from './mcp-workspace.mjs';
export function registerX402VideoTools(server: McpServer, options: VideoMcpOptions & {
  z: typeof z;
  getRequestFetch: () => Promise<typeof globalThis.fetch>;
}): { workspace(): Promise<VideoMcpWorkspace>; close(): Promise<void> };
