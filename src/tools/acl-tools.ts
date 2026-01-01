import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { logger } from "../logger.js";
import { returnToolError, returnToolSuccess } from "../utils.js";
import type { ToolContext, ToolModule } from "./index.js";

// Schemas
const ACLSchema = z.object({
  operation: z
    .enum(["get", "update", "validate"])
    .describe("ACL operation to perform"),
  aclConfig: z
    .object({
      acls: z
        .array(
          z.object({
            action: z.enum(["accept", "drop"]),
            src: z.array(z.string()),
            dst: z.array(z.string()),
          }),
        )
        .optional()
        .describe("Access control rules"),
      groups: z
        .record(z.string(), z.array(z.string()))
        .optional()
        .describe("User groups definition"),
      tagOwners: z
        .record(z.string(), z.array(z.string()))
        .optional()
        .describe("Tag ownership mapping"),
    })
    .optional()
    .describe("ACL configuration (required for update/validate operations)"),
});

const DNSSchema = z.object({
  operation: z
    .enum([
      "get_nameservers",
      "set_nameservers",
      "get_preferences",
      "set_preferences",
      "get_searchpaths",
      "set_searchpaths",
    ])
    .describe("DNS operation to perform"),
  nameservers: z
    .array(z.string())
    .optional()
    .describe("DNS nameservers (for set_nameservers operation)"),
  magicDNS: z
    .boolean()
    .optional()
    .describe("Enable/disable MagicDNS (for set_preferences operation)"),
  searchPaths: z
    .array(z.string())
    .optional()
    .describe("DNS search paths (for set_searchpaths operation)"),
});

const KeyManagementSchema = z.object({
  operation: z
    .enum(["list", "create", "delete"])
    .describe("Key management operation"),
  keyConfig: z
    .object({
      description: z.string().optional(),
      expirySeconds: z.number().optional(),
      capabilities: z
        .object({
          devices: z
            .object({
              create: z
                .object({
                  reusable: z.boolean().optional(),
                  ephemeral: z.boolean().optional(),
                  preauthorized: z.boolean().optional(),
                  tags: z.array(z.string()).optional(),
                })
                .optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional()
    .describe("Key configuration (for create operation)"),
  keyId: z
    .string()
    .optional()
    .describe("Authentication key ID (for delete operation)"),
});

const NetworkLockSchema = z.object({
  operation: z
    .enum(["status", "enable", "disable", "add_key", "remove_key", "list_keys"])
    .describe("Network lock operation to perform"),
  publicKey: z
    .string()
    .optional()
    .describe("Public key for add/remove operations"),
  keyId: z.string().optional().describe("Key ID for remove operations"),
});

const PolicyFileSchema = z.object({
  operation: z
    .enum(["get", "update", "test_access"])
    .describe("Policy file operation to perform"),
  policy: z
    .string()
    .optional()
    .describe("Policy content (HuJSON format) for update operation"),
  testRequest: z
    .object({
      src: z.string(),
      dst: z.string(),
      proto: z.string().optional(),
    })
    .optional()
    .describe("Access test parameters for test_access operation"),
});

// Tool handlers
async function manageACL(
  args: z.infer<typeof ACLSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug("Managing ACL configuration:", args);

    switch (args.operation) {
      case "get": {
        const result = await context.api.getACL();
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `Current ACL configuration:\n\n${
            typeof result.data === "string"
              ? result.data
              : JSON.stringify(result.data, null, 2)
          }`,
        );
      }

      case "update": {
        if (!args.aclConfig) {
          return returnToolError(
            "ACL configuration is required for update operation",
          );
        }

        const aclString = JSON.stringify(args.aclConfig, null, 2);
        const result = await context.api.updateACL(aclString);

        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess("ACL configuration updated successfully");
      }

      case "validate": {
        if (!args.aclConfig) {
          return returnToolError(
            "ACL configuration is required for validation",
          );
        }

        const aclString = JSON.stringify(args.aclConfig, null, 2);
        const result = await context.api.validateACL(aclString);

        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess("ACL configuration is valid");
      }

      default:
        return returnToolError(
          "Invalid ACL operation. Use: get, update, or validate",
        );
    }
  } catch (error) {
    logger.error("Error managing ACL:", error);
    return returnToolError(error);
  }
}

async function manageDNS(
  args: z.infer<typeof DNSSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug("Managing DNS configuration:", args);

    switch (args.operation) {
      case "get_nameservers": {
        const result = await context.api.getDNSNameservers();
        if (!result.success) {
          return returnToolError(result.error);
        }

        const nameservers = result.data?.dns || [];
        return returnToolSuccess(
          `DNS Nameservers:\n${
            nameservers.length > 0
              ? nameservers.map((ns) => `  - ${ns}`).join("\n")
              : "  No custom nameservers configured"
          }`,
        );
      }

      case "set_nameservers": {
        if (!args.nameservers) {
          return returnToolError(
            "Nameservers array is required for set_nameservers operation",
          );
        }

        const result = await context.api.setDNSNameservers(args.nameservers);
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `DNS nameservers updated to: ${args.nameservers.join(", ")}`,
        );
      }

      case "get_preferences": {
        const result = await context.api.getDNSPreferences();
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `DNS Preferences:\n  MagicDNS: ${
            result.data?.magicDNS ? "Enabled" : "Disabled"
          }`,
        );
      }

      case "set_preferences": {
        if (args.magicDNS === undefined) {
          return returnToolError(
            "magicDNS boolean is required for set_preferences operation",
          );
        }

        const result = await context.api.setDNSPreferences(args.magicDNS);
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `MagicDNS ${args.magicDNS ? "enabled" : "disabled"}`,
        );
      }

      case "get_searchpaths": {
        const result = await context.api.getDNSSearchPaths();
        if (!result.success) {
          return returnToolError(result.error);
        }

        const searchPaths = result.data?.searchPaths || [];
        return returnToolSuccess(
          `DNS Search Paths:\n${
            searchPaths.length > 0
              ? searchPaths.map((path) => `  - ${path}`).join("\n")
              : "  No search paths configured"
          }`,
        );
      }

      case "set_searchpaths": {
        if (!args.searchPaths) {
          return returnToolError(
            "searchPaths array is required for set_searchpaths operation",
          );
        }

        const result = await context.api.setDNSSearchPaths(args.searchPaths);
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `DNS search paths updated to: ${args.searchPaths.join(", ")}`,
        );
      }

      default:
        return returnToolError(
          "Invalid DNS operation. Use: get_nameservers, set_nameservers, get_preferences, set_preferences, get_searchpaths, set_searchpaths",
        );
    }
  } catch (error: unknown) {
    logger.error("Error managing DNS:", error);
    return returnToolError(error);
  }
}

async function manageKeys(
  args: z.infer<typeof KeyManagementSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug("Managing authentication keys:", args);

    switch (args.operation) {
      case "list": {
        const result = await context.api.listAuthKeys();
        if (!result.success) {
          return returnToolError(result.error);
        }

        const keys = result.data?.keys || [];
        if (keys.length === 0) {
          return returnToolSuccess("No authentication keys found");
        }

        const keyList = keys
          .map((key, index: number) => {
            return `**Key ${index + 1}**
  - ID: ${key.id}
  - Description: ${key.description || "No description"}
  - Created: ${key.created}
  - Expires: ${key.expires}
  - Revoked: ${key.revoked ? "Yes" : "No"}
  - Reusable: ${key.capabilities?.devices?.create?.reusable ? "Yes" : "No"}
  - Preauthorized: ${
    key.capabilities?.devices?.create?.preauthorized ? "Yes" : "No"
  }`;
          })
          .join("\n\n");

        return returnToolSuccess(
          `Found ${keys.length} authentication keys:\n\n${keyList}`,
        );
      }

      case "create": {
        if (!args.keyConfig) {
          return returnToolError(
            "Key configuration is required for create operation",
          );
        }

        const keyConfig = {
          ...args.keyConfig,
          capabilities: {
            devices: {
              create: {
                ...args.keyConfig.capabilities?.devices?.create,
              },
            },
          },
        };
        const result = await context.api.createAuthKey(keyConfig);
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `Authentication key created successfully:
  - ID: ${result.data?.id}
  - Key: ${result.data?.key}
  - Description: ${result.data?.description || "No description"}`,
        );
      }

      case "delete": {
        if (!args.keyId) {
          return returnToolError("Key ID is required for delete operation");
        }

        const result = await context.api.deleteAuthKey(args.keyId);
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `Authentication key ${args.keyId} deleted successfully`,
        );
      }

      default:
        return returnToolError(
          "Invalid key operation. Use: list, create, or delete",
        );
    }
  } catch (error: unknown) {
    logger.error("Error managing keys:", error);
    return returnToolError(error);
  }
}

async function manageNetworkLock(
  args: z.infer<typeof NetworkLockSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug("Managing network lock:", args);

    switch (args.operation) {
      case "status": {
        const result = await context.api.getNetworkLockStatus();
        if (!result.success) {
          return returnToolError(result.error);
        }

        const status = result.data;
        return returnToolSuccess(
          `Network Lock Status:
  - Enabled: ${status?.enabled ? "Yes" : "No"}
  - Node Key: ${status?.nodeKey || "Not available"}
  - Trusted Keys: ${status?.trustedKeys?.length || 0}`,
        );
      }

      case "enable": {
        const result = await context.api.enableNetworkLock();
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `Network lock enabled successfully. Key: ${
            result.data?.key || "Generated"
          }`,
        );
      }

      case "disable": {
        const result = await context.api.disableNetworkLock();
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess("Network lock disabled successfully");
      }

      default:
        return returnToolError(
          "Invalid network lock operation. Use: status, enable, disable, add_key, remove_key, or list_keys",
        );
    }
  } catch (error) {
    logger.error("Error managing network lock:", error);
    return returnToolError(error);
  }
}

async function managePolicyFile(
  args: z.infer<typeof PolicyFileSchema>,
  context: ToolContext,
): Promise<CallToolResult> {
  try {
    logger.debug("Managing policy file:", args);

    switch (args.operation) {
      case "get": {
        const result = await context.api.getPolicyFile();
        if (!result.success) {
          return returnToolError(result.error);
        }

        return returnToolSuccess(
          `Policy File (HuJSON format):\n\n${result.data}`,
        );
      }

      case "test_access": {
        if (!args.testRequest) {
          return returnToolError(
            "Test request parameters are required for test_access operation",
          );
        }

        const { src, dst, proto } = args.testRequest;
        const result = await context.api.testACLAccess(src, dst, proto);

        if (!result.success) {
          return returnToolError(result.error);
        }

        const testResult = result.data;
        return returnToolSuccess(
          `ACL Access Test Result:
  - Source: ${src}
  - Destination: ${dst}
  - Protocol: ${proto || "any"}
  - Result: ${testResult?.allowed ? "ALLOWED" : "DENIED"}
  - Rule: ${testResult?.rule || "No matching rule"}
  - Match: ${testResult?.match || "N/A"}`,
        );
      }

      default:
        return returnToolError(
          "Invalid policy operation. Use: get or test_access",
        );
    }
  } catch (error) {
    logger.error("Error managing policy file:", error);
    return returnToolError(error);
  }
}

// Export the tool module
export const aclTools: ToolModule = {
  tools: [
    {
      name: "manage_acl",
      description: "Manage Tailscale Access Control Lists (ACLs)",
      inputSchema: ACLSchema,
      handler: manageACL,
    },
    {
      name: "manage_dns",
      description: "Manage Tailscale DNS configuration",
      inputSchema: DNSSchema,
      handler: manageDNS,
    },
    {
      name: "manage_keys",
      description: "Manage Tailscale authentication keys",
      inputSchema: KeyManagementSchema,
      handler: manageKeys,
    },
    {
      name: "manage_network_lock",
      description:
        "Manage Tailscale network lock (key authority) for enhanced security",
      inputSchema: NetworkLockSchema,
      handler: manageNetworkLock,
    },
    {
      name: "manage_policy_file",
      description: "Manage policy files and test ACL access rules",
      inputSchema: PolicyFileSchema,
      handler: managePolicyFile,
    },
  ],
};
