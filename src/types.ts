import { z } from "zod";

// Tailscale Device Schema
export const TailscaleDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  hostname: z.string(),
  clientVersion: z.string(),
  updateAvailable: z.boolean(),
  os: z.string(),
  created: z.string(),
  lastSeen: z.string(),
  keyExpiryDisabled: z.boolean(),
  expires: z.string(),
  authorized: z.boolean(),
  isExternal: z.boolean(),
  machineKey: z.string(),
  nodeKey: z.string(),
  blocksIncomingConnections: z.boolean(),
  enabledRoutes: z.array(z.string()).optional().default([]),
  advertisedRoutes: z.array(z.string()).optional().default([]),
  clientConnectivity: z
    .object({
      endpoints: z.array(z.string()),
      derp: z.string(),
      mappingVariesByDestIP: z.boolean(),
      latency: z.record(z.string(), z.number()).optional(),
      clientSupports: z.object({
        hairPinning: z.boolean(),
        ipv6: z.boolean(),
        pcp: z.boolean(),
        pmp: z.boolean(),
        udp: z.boolean(),
        upnp: z.boolean(),
      }),
    })
    .optional(),
  addresses: z.array(z.string()),
  user: z.string(),
  tags: z.array(z.string()).optional(),
});

export const TailscaleNetworkStatusSchema = z.object({
  self: TailscaleDeviceSchema,
  magicDNSSuffix: z.string(),
  magicDNSEnabled: z.boolean(),
  domainName: z.string(),
  currentTailnet: z.object({
    name: z.string(),
    magicDNSSuffix: z.string(),
    magicDNSEnabled: z.boolean(),
  }),
  peers: z.array(TailscaleDeviceSchema),
});

export const TailscaleCLIStatusSchema = z.object({
  Version: z.string(),
  TUN: z.boolean(),
  BackendState: z.string(),
  AuthURL: z.string().optional(),
  TailscaleIPs: z.array(z.string()),
  Self: z.object({
    ID: z.string(),
    PublicKey: z.string(),
    HostName: z.string(),
    DNSName: z.string(),
    OS: z.string(),
    UserID: z.number(),
    TailscaleIPs: z.array(z.string()),
    Capabilities: z.array(z.string()).optional(),
    Online: z.boolean().optional(),
    ExitNode: z.boolean().optional(),
    ExitNodeOption: z.boolean().optional(),
    Active: z.boolean().optional(),
  }),
  Peer: z
    .record(
      z.string(),
      z.object({
        ID: z.string(),
        PublicKey: z.string(),
        HostName: z.string(),
        DNSName: z.string(),
        OS: z.string(),
        UserID: z.number(),
        TailscaleIPs: z.array(z.string()),
        CurAddr: z.string().optional(),
        Relay: z.string().optional(),
        LastWrite: z.string().optional(),
        LastSeen: z.string().optional(),
        Online: z.boolean().optional(),
        ExitNode: z.boolean().optional(),
        ExitNodeOption: z.boolean().optional(),
        Active: z.boolean().optional(),
        RxBytes: z.number().optional(),
        TxBytes: z.number().optional(),
      }),
    )
    .optional(),
  ExitNodeStatus: z
    .object({
      ID: z.string(),
      Online: z.boolean(),
      TailscaleIPs: z.array(z.string()),
    })
    .optional(),
  MagicDNSSuffix: z.string().optional(),
  CurrentTailnet: z
    .object({
      Name: z.string(),
      MagicDNSSuffix: z.string(),
      MagicDNSEnabled: z.boolean(),
    })
    .optional(),
});

// Tool request/response schemas
export const ListDevicesRequestSchema = z.object({
  includeRoutes: z.boolean().optional().default(false),
});

export const DeviceActionRequestSchema = z.object({
  deviceId: z.string(),
  action: z.enum(["authorize", "deauthorize", "delete", "expire-key"]),
});

export const NetworkStatusRequestSchema = z.object({
  format: z.enum(["json", "summary"]).optional().default("json"),
});

export const RouteActionRequestSchema = z.object({
  deviceId: z.string(),
  routes: z.array(z.string()),
  action: z.enum(["enable", "disable"]),
});

// ACL Types
export const ACLRuleSchema = z.object({
  action: z.enum(["accept", "drop"]),
  src: z.array(z.string()),
  dst: z.array(z.string()),
  proto: z.string().optional(),
});

export const ACLTestSchema = z.object({
  src: z.string(),
  accept: z.array(z.string()),
  deny: z.array(z.string()).optional(),
});

export const SSHRuleSchema = z.object({
  action: z.enum(["accept", "check"]),
  src: z.array(z.string()),
  dst: z.array(z.string()),
  users: z.array(z.string()),
  checkPeriod: z.string().optional(),
});

export const ACLConfigSchema = z.object({
  groups: z.record(z.string(), z.array(z.string())).optional(),
  tagOwners: z.record(z.string(), z.array(z.string())).optional(),
  acls: z.array(ACLRuleSchema),
  tests: z.array(ACLTestSchema).optional(),
  ssh: z.array(SSHRuleSchema).optional(),
});

// DNS Types
export const DNSConfigSchema = z.object({
  dns: z.array(z.string()),
  magicDNS: z.boolean().optional(),
  nameservers: z
    .object({
      global: z.array(z.string()).optional(),
      restricted: z.record(z.string(), z.array(z.string())).optional(),
    })
    .optional(),
});

export const SearchPathSchema = z.object({
  searchPaths: z.array(z.string()),
});

// Key Management Types
export const AuthKeySchema = z.object({
  id: z.string(),
  key: z.string(),
  description: z.string().optional(),
  created: z.string(),
  expires: z.string(),
  revoked: z.boolean(),
  capabilities: z.object({
    devices: z.object({
      create: z.object({
        reusable: z.boolean(),
        ephemeral: z.boolean(),
        preauthorized: z.boolean(),
        tags: z.array(z.string()).optional(),
      }),
    }),
  }),
});

export const CreateAuthKeyRequestSchema = z.object({
  capabilities: z.object({
    devices: z.object({
      create: z.object({
        reusable: z.boolean().optional(),
        ephemeral: z.boolean().optional(),
        preauthorized: z.boolean().optional(),
        tags: z.array(z.string()).optional(),
      }),
    }),
  }),
  expirySeconds: z.number().optional(),
  description: z.string().optional(),
});

// Request schemas for new tools
export const ACLRequestSchema = z.object({
  operation: z.enum(["get", "update", "validate"]),
  aclConfig: ACLConfigSchema.optional(),
});

export const DNSRequestSchema = z.object({
  operation: z.enum([
    "get_nameservers",
    "set_nameservers",
    "get_preferences",
    "set_preferences",
    "get_searchpaths",
    "set_searchpaths",
  ]),
  nameservers: z.array(z.string()).optional(),
  magicDNS: z.boolean().optional(),
  searchPaths: z.array(z.string()).optional(),
});

export const KeyManagementRequestSchema = z.object({
  operation: z.enum(["list", "create", "delete"]),
  keyId: z.string().optional(),
  keyConfig: CreateAuthKeyRequestSchema.optional(),
});

export const TailnetInfoRequestSchema = z.object({
  includeDetails: z.boolean().optional(),
});

// File Sharing Types
export const FileSharingRequestSchema = z.object({
  operation: z.enum(["get_status", "enable", "disable"]),
  deviceId: z.string().optional(),
});

// Exit Node Types
export const ExitNodeRequestSchema = z.object({
  operation: z.enum(["list", "set", "clear", "advertise", "stop_advertising"]),
  deviceId: z.string().optional(),
  routes: z.array(z.string()).optional(),
});

// Network Lock Types
export const NetworkLockRequestSchema = z.object({
  operation: z.enum([
    "status",
    "enable",
    "disable",
    "add_key",
    "remove_key",
    "list_keys",
  ]),
  publicKey: z.string().optional(),
  keyId: z.string().optional(),
});

// Subnet Router Types
export const SubnetRouterRequestSchema = z.object({
  operation: z.enum([
    "list_routes",
    "advertise_routes",
    "accept_routes",
    "remove_routes",
  ]),
  deviceId: z.string().optional(),
  routes: z.array(z.string()).optional(),
});

// Webhook Management Types
export const WebhookRequestSchema = z.object({
  operation: z.enum(["list", "create", "delete", "test"]),
  webhookId: z.string().optional(),
  config: z
    .object({
      endpointUrl: z.string(),
      secret: z.string().optional(),
      events: z.array(z.string()),
      description: z.string().optional(),
    })
    .optional(),
});

// Policy File Types
export const PolicyFileRequestSchema = z.object({
  operation: z.enum(["get", "update", "test_access"]),
  policy: z.string().optional(),
  testRequest: z
    .object({
      src: z.string(),
      dst: z.string(),
      proto: z.string().optional(),
    })
    .optional(),
});

// Device Tagging Types
export const DeviceTaggingRequestSchema = z.object({
  operation: z.enum(["get_tags", "set_tags", "add_tags", "remove_tags"]),
  deviceId: z.string(),
  tags: z.array(z.string()).optional(),
});

// SSH Management Types
export const SSHManagementRequestSchema = z.object({
  operation: z.enum([
    "get_ssh_users",
    "add_ssh_user",
    "remove_ssh_user",
    "get_ssh_settings",
    "update_ssh_settings",
  ]),
  deviceId: z.string().optional(),
  username: z.string().optional(),
  sshSettings: z
    .object({
      checkPeriod: z.string().optional(),
      enabled: z.boolean().optional(),
    })
    .optional(),
});

// Network Statistics Types
export const NetworkStatsRequestSchema = z.object({
  operation: z.enum([
    "get_device_stats",
    "get_network_overview",
    "get_traffic_stats",
  ]),
  deviceId: z.string().optional(),
  timeRange: z.enum(["1h", "24h", "7d", "30d"]).optional(),
});

// Logging Configuration Types
export const LoggingRequestSchema = z.object({
  operation: z.enum(["get_log_config", "set_log_level", "get_audit_logs"]),
  logLevel: z.enum(["debug", "info", "warn", "error"]).optional(),
  component: z.string().optional(),
});

// User Management Types
export const UserManagementRequestSchema = z.object({
  operation: z.enum(["list_users", "get_user", "update_user_role"]),
  userId: z.string().optional(),
  role: z.enum(["admin", "user", "auditor"]).optional(),
});

// Device Posture Types
export const DevicePostureRequestSchema = z.object({
  operation: z.enum(["get_posture", "set_posture_policy", "check_compliance"]),
  deviceId: z.string().optional(),
  policy: z
    .object({
      requireUpdate: z.boolean().optional(),
      allowedOSVersions: z.array(z.string()).optional(),
      requiredSoftware: z.array(z.string()).optional(),
    })
    .optional(),
});

// Additional API Response Types
export const TailnetInfoSchema = z.object({
  name: z.string(),
  id: z.string(),
  domain: z.string(),
  accountId: z.string(),
  dnsConfig: z
    .object({
      nameservers: z.array(z.string()),
      domains: z.array(z.string()),
      magicDNS: z.boolean(),
    })
    .optional(),
  organizationName: z.string().optional(),
  organization: z.string().optional(),
  createdAt: z.string(),
  created: z.string().optional(),
  dns: z
    .object({
      nameservers: z.array(z.string()),
      magicDNS: z.boolean(),
    })
    .optional(),
  fileSharing: z.boolean().optional(),
  serviceCollection: z.boolean().optional(),
  networkLockEnabled: z.boolean().optional(),
  oidcIdentityProviderURL: z.string().optional(),
  keyExpiryDisabled: z.boolean().optional(),
  machineAuthorizationTimeout: z.string().optional(),
  deviceApprovalRequired: z.boolean().optional(),
});

export const ACLValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
});

export const AuthKeyListSchema = z.object({
  keys: z.array(AuthKeySchema),
});

export const DeviceRoutesSchema = z.object({
  advertisedRoutes: z.array(z.string()),
  enabledRoutes: z.array(z.string()),
  isExitNode: z.boolean().optional(),
});

export const NetworkLockStatusSchema = z.object({
  enabled: z.boolean(),
  nodeKey: z.string().optional(),
  publicKey: z.string().optional(),
  key: z.string().optional(),
  trustedKeys: z
    .array(
      z.object({
        key: z.string(),
        votes: z.number(),
      }),
    )
    .optional(),
});

export const WebhookSchema = z.object({
  id: z.string(),
  endpointUrl: z.string(),
  description: z.string().optional(),
  secret: z.string().optional(),
  events: z.array(z.string()),
  createdAt: z.string(),
  lastDelivery: z.string().optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const WebhookListSchema = z.object({
  webhooks: z.array(WebhookSchema),
});

export const ACLTestResultSchema = z.object({
  matches: z.boolean(),
  match: z.boolean().optional(),
  allowed: z.boolean().optional(),
  rule: z.string().optional(),
  error: z.string().optional(),
});

export const SSHSettingsSchema = z.object({
  enabled: z.boolean(),
  checkPeriod: z.string().optional(),
  rules: z.array(SSHRuleSchema).optional(),
});

export const NetworkStatsSchema = z.object({
  totalDevices: z.number(),
  activeDevices: z.number(),
  totalTraffic: z
    .object({
      bytesIn: z.number(),
      bytesOut: z.number(),
    })
    .optional(),
  period: z.string().optional(),
});

export const DeviceStatsSchema = z.object({
  deviceId: z.string(),
  traffic: z.object({
    bytesIn: z.number(),
    bytesOut: z.number(),
    packetsIn: z.number(),
    packetsOut: z.number(),
  }),
  connections: z
    .array(
      z.object({
        peer: z.string(),
        latency: z.number().optional(),
        bytesIn: z.number(),
        bytesOut: z.number(),
      }),
    )
    .optional(),
});

export const UserSchema = z.object({
  id: z.string(),
  loginName: z.string(),
  displayName: z.string(),
  profilePicUrl: z.string().optional(),
  role: z.enum(["admin", "user", "auditor"]),
  created: z.string(),
  lastSeen: z.string().optional(),
});

export const UserListSchema = z.object({
  users: z.array(UserSchema),
});

export const AuditLogEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  action: z.string(),
  actor: z.string(),
  target: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const AuditLogListSchema = z.object({
  logs: z.array(AuditLogEntrySchema),
});

export const DevicePostureSchema = z.object({
  deviceId: z.string(),
  osVersion: z.string(),
  updateAvailable: z.boolean(),
  requiredSoftware: z
    .array(
      z.object({
        name: z.string(),
        version: z.string(),
        installed: z.boolean(),
      }),
    )
    .optional(),
  compliance: z.object({
    status: z.enum(["compliant", "non-compliant", "unknown"]),
    issues: z.array(z.string()).optional(),
  }),
});

export const PosturePolicySchema = z.object({
  requireUpdate: z.boolean().optional(),
  allowedOSVersions: z.array(z.string()).optional(),
  requiredSoftware: z.array(z.string()).optional(),
  blockNonCompliant: z.boolean().optional(),
});

// API Response types
export interface TailscaleAPIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

export interface CLIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  stderr?: string;
}

// MCP Tool result types
export interface ToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

// Configuration types
export interface TailscaleConfig {
  /** API key for authentication (mutually exclusive with OAuth) */
  apiKey?: string;
  /** Tailnet name or "-" for the default tailnet */
  tailnet?: string;
  /** Path to the Tailscale CLI binary */
  cliPath?: string;
  /** OAuth client ID (for OAuth authentication) */
  oauthClientId?: string;
  /** OAuth client secret (for OAuth authentication) */
  oauthClientSecret?: string;
  /** Base URL for Tailscale API (default: https://api.tailscale.com) */
  apiBaseUrl?: string;
}

// Error types
export class TailscaleError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "TailscaleError";
  }
}

export class CLIError extends Error {
  constructor(
    message: string,
    public readonly stderr?: string,
    public readonly exitCode?: number,
  ) {
    super(message);
    this.name = "CLIError";
  }
}

// Type exports
export type TailscaleDevice = z.infer<typeof TailscaleDeviceSchema>;
export type TailscaleNetworkStatus = z.infer<
  typeof TailscaleNetworkStatusSchema
>;

export type ACLConfig = z.infer<typeof ACLConfigSchema>;
export type ACLRequest = z.infer<typeof ACLRequestSchema>;
export type ACLRule = z.infer<typeof ACLRuleSchema>;
export type ACLTest = z.infer<typeof ACLTestSchema>;
export type ACLTestResult = z.infer<typeof ACLTestResultSchema>;
export type ACLValidationResult = z.infer<typeof ACLValidationResultSchema>;
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;
export type AuditLogList = z.infer<typeof AuditLogListSchema>;
export type AuthKey = z.infer<typeof AuthKeySchema>;
export type AuthKeyList = z.infer<typeof AuthKeyListSchema>;
export type CreateAuthKeyRequest = z.infer<typeof CreateAuthKeyRequestSchema>;
export type DeviceActionRequest = z.infer<typeof DeviceActionRequestSchema>;
export type DevicePosture = z.infer<typeof DevicePostureSchema>;
export type DevicePostureRequest = z.infer<typeof DevicePostureRequestSchema>;
export type DeviceRoutes = z.infer<typeof DeviceRoutesSchema>;
export type DeviceStats = z.infer<typeof DeviceStatsSchema>;
export type DeviceTaggingRequest = z.infer<typeof DeviceTaggingRequestSchema>;
export type DNSConfig = z.infer<typeof DNSConfigSchema>;
export type DNSRequest = z.infer<typeof DNSRequestSchema>;
export type ExitNodeRequest = z.infer<typeof ExitNodeRequestSchema>;
export type FileSharingRequest = z.infer<typeof FileSharingRequestSchema>;
export type KeyManagementRequest = z.infer<typeof KeyManagementRequestSchema>;
export type ListDevicesRequest = z.infer<typeof ListDevicesRequestSchema>;
export type LoggingRequest = z.infer<typeof LoggingRequestSchema>;
export type NetworkLockRequest = z.infer<typeof NetworkLockRequestSchema>;
export type NetworkLockStatus = z.infer<typeof NetworkLockStatusSchema>;
export type NetworkStats = z.infer<typeof NetworkStatsSchema>;
export type NetworkStatsRequest = z.infer<typeof NetworkStatsRequestSchema>;
export type NetworkStatusRequest = z.infer<typeof NetworkStatusRequestSchema>;
export type PolicyFileRequest = z.infer<typeof PolicyFileRequestSchema>;
export type PosturePolicy = z.infer<typeof PosturePolicySchema>;
export type RouteActionRequest = z.infer<typeof RouteActionRequestSchema>;
export type SearchPath = z.infer<typeof SearchPathSchema>;
export type SSHManagementRequest = z.infer<typeof SSHManagementRequestSchema>;
export type SSHRule = z.infer<typeof SSHRuleSchema>;
export type SSHSettings = z.infer<typeof SSHSettingsSchema>;
export type SubnetRouterRequest = z.infer<typeof SubnetRouterRequestSchema>;
export type TailnetInfo = z.infer<typeof TailnetInfoSchema>;
export type TailnetInfoRequest = z.infer<typeof TailnetInfoRequestSchema>;
export type TailscaleCLIStatus = z.infer<typeof TailscaleCLIStatusSchema>;
export type User = z.infer<typeof UserSchema>;
export type UserList = z.infer<typeof UserListSchema>;
export type UserManagementRequest = z.infer<typeof UserManagementRequestSchema>;
export type Webhook = z.infer<typeof WebhookSchema>;
export type WebhookList = z.infer<typeof WebhookListSchema>;
export type WebhookRequest = z.infer<typeof WebhookRequestSchema>;
