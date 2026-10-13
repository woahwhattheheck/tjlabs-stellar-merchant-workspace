### Register the existing TIND workspace for customer-agent tools

Keep the complete installed tind-migration source. Its source-owned merchant provider is tind-workspaces; the common host reads that registration from the existing TIND contribution.

Create the private connection document using the TIND connection schema and the real existing workspace aliases. Choose managed mode to attach to the Applications listener, or owned mode when this merchant is to own that original process. Keep the connection in an operator-owned private file, and keep the new merchant directory beneath an existing canonical private directory.

Call the maintained host API:

    import {initializeMerchantProvider} from './stellar-forge/mcp-merchant-operator/providers.mjs';
    const result = await initializeMerchantProvider('tind-workspaces', {
      directory: '/private/tind-merchant',
      connection: '/private/tind-workspaces.json',
      name: 'Original repository migration'
    });

Use the returned merchant-mcp.json with the existing MCP host launcher. Setup registers the original connection, creates its own release store and customer-exports directory, and validates the complete installed provider. It does not launch TIND or create another repository workspace.

For an existing complete release store, pass releaseStore with its actual path. That store is validated and retained. Repeating setup with the same original inputs completes an interrupted attempt or reopens its completed configuration. An already saved merchant configuration is preserved byte-for-byte, including other configured source families and its selected export directory. Changed connection bytes, an explicit different name or a different release store require an intentionally selected new setup directory; the existing original directory is not rewritten.

The setup intent and completed configuration are retained privately. Interrupted original release-store stages remain available; only an unchanged empty initialization stage is promoted. Customer tools then open the chosen alias and return its actual instance identity. Browser and agent continue the same saved project. Managed detach leaves Applications in charge of Stop and reopen; an owned close drains that same original process.

For complete handovers, retain the original downloadable file and expected SHA256, finish all returned chunks, and verify its final byte count and digest. Chunk read IDs are temporary; after a reader restart, select the same original artifact, SHA256 and offset without the old read ID. Customer receiving should reopen the full editable handover, not just its report or batch summary.
