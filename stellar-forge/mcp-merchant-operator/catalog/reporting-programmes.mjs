// MIT. Metadata-only declarations for the original Reporting Programmes provider.
export const definitions = [
  [
    "merchant_reporting_workspaces",
    "List configured reporting aliases without opening a project.",
    {},
    [],
    {
      "readOnly": true,
      "idempotent": true
    }
  ],
  [
    "merchant_reporting_open",
    "Open the original configured reporting store and seed under its native lifetime lease.",
    {
      "workspace": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$"
      }
    },
    [
      "workspace"
    ],
    {
      "idempotent": true
    }
  ],
  [
    "merchant_reporting_status",
    "Read the current complete-project identity and pending original operation.",
    {
      "workspace": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$"
      }
    },
    [
      "workspace"
    ],
    {
      "readOnly": true,
      "idempotent": true
    }
  ],
  [
    "merchant_reporting_inputs",
    "List host-declared complete input identities; no arbitrary path is accepted.",
    {
      "workspace": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$"
      },
      "offset": {
        "type": "integer",
        "minimum": 0
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100
      }
    },
    [
      "workspace"
    ],
    {
      "readOnly": true,
      "idempotent": true
    }
  ],
  [
    "merchant_reporting_inspect_input",
    "Retain and inspect the exact complete configured input for preparation and original-file receiving.",
    {
      "workspace": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$"
      },
      "input": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$"
      },
      "expectedSha256": {
        "type": "string",
        "pattern": "^[a-f0-9]{64}$"
      }
    },
    [
      "workspace",
      "input",
      "expectedSha256"
    ],
    {
      "idempotent": true
    }
  ],
  [
    "merchant_reporting_apply",
    "Apply the exact retained native programme request to the current project; preserve its complete original operation.",
    {
      "workspace": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$"
      },
      "input": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$"
      },
      "expectedSha256": {
        "type": "string",
        "pattern": "^[a-f0-9]{64}$"
      },
      "operationId": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$"
      },
      "expectedProjectSha256": {
        "type": [
          "string",
          "null"
        ],
        "pattern": "^[a-f0-9]{64}$"
      }
    },
    [
      "workspace",
      "input",
      "expectedSha256",
      "operationId",
      "expectedProjectSha256"
    ],
    {
      "idempotent": true
    }
  ],
  [
    "merchant_reporting_receive_desk",
    "Receive the original complete reporting desk and recording context through its unchanged native adapter.",
    {
      "workspace": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$"
      },
      "input": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$"
      },
      "expectedSha256": {
        "type": "string",
        "pattern": "^[a-f0-9]{64}$"
      },
      "context": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$"
      },
      "expectedContextSha256": {
        "type": "string",
        "pattern": "^[a-f0-9]{64}$"
      },
      "operationId": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$"
      },
      "expectedProjectSha256": {
        "type": [
          "string",
          "null"
        ],
        "pattern": "^[a-f0-9]{64}$"
      }
    },
    [
      "workspace",
      "input",
      "expectedSha256",
      "context",
      "expectedContextSha256",
      "operationId",
      "expectedProjectSha256"
    ],
    {
      "idempotent": true
    }
  ],
  [
    "merchant_reporting_receive_project",
    "Select a complete returned native project, retaining its full original predecessor and requiring unchanged prior reporting observations.",
    {
      "workspace": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$"
      },
      "input": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$"
      },
      "expectedSha256": {
        "type": "string",
        "pattern": "^[a-f0-9]{64}$"
      },
      "operationId": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$"
      },
      "expectedProjectSha256": {
        "type": [
          "string",
          "null"
        ],
        "pattern": "^[a-f0-9]{64}$"
      }
    },
    [
      "workspace",
      "input",
      "expectedSha256",
      "operationId",
      "expectedProjectSha256"
    ],
    {
      "idempotent": true
    }
  ],
  [
    "merchant_reporting_operation",
    "Read one original retained request fingerprint, state and complete publication outcome.",
    {
      "workspace": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$"
      },
      "operationId": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$"
      }
    },
    [
      "workspace",
      "operationId"
    ],
    {
      "readOnly": true,
      "idempotent": true
    }
  ],
  [
    "merchant_reporting_recover",
    "Resume only the exact retained original operation and request fingerprint after an interrupted local outcome.",
    {
      "workspace": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$"
      },
      "operationId": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$"
      },
      "expectedRequestSha256": {
        "type": "string",
        "pattern": "^[a-f0-9]{64}$"
      }
    },
    [
      "workspace",
      "operationId",
      "expectedRequestSha256"
    ],
    {
      "idempotent": true
    }
  ],
  [
    "merchant_reporting_history",
    "Read original host operation metadata in complete pages.",
    {
      "workspace": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$"
      },
      "offset": {
        "type": "integer",
        "minimum": 0
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100
      }
    },
    [
      "workspace"
    ],
    {
      "readOnly": true,
      "idempotent": true
    }
  ],
  [
    "merchant_reporting_export",
    "Retain a full selected native project or native handover once under its original operation identity.",
    {
      "workspace": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$"
      },
      "operationId": {
        "type": "string",
        "pattern": "^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$"
      },
      "format": {
        "type": "string",
        "enum": [
          "project",
          "native"
        ]
      },
      "expectedProjectSha256": {
        "type": "string",
        "pattern": "^[a-f0-9]{64}$"
      }
    },
    [
      "workspace",
      "operationId",
      "format",
      "expectedProjectSha256"
    ],
    {
      "idempotent": true
    }
  ],
  [
    "merchant_reporting_publications",
    "List original project/archive publications in complete pages.",
    {
      "workspace": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$"
      },
      "offset": {
        "type": "integer",
        "minimum": 0
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 100
      }
    },
    [
      "workspace"
    ],
    {
      "readOnly": true,
      "idempotent": true
    }
  ],
  [
    "merchant_reporting_publication",
    "Inspect one complete retained publication and its exact selected source project.",
    {
      "workspace": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$"
      },
      "publicationId": {
        "type": "string",
        "pattern": "^[a-f0-9]{64}$"
      }
    },
    [
      "workspace",
      "publicationId"
    ],
    {
      "readOnly": true,
      "idempotent": true
    }
  ],
  [
    "merchant_reporting_file_read",
    "Read a bounded byte range from the complete immutable retained publication.",
    {
      "workspace": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$"
      },
      "publicationId": {
        "type": "string",
        "pattern": "^[a-f0-9]{64}$"
      },
      "expectedSha256": {
        "type": "string",
        "pattern": "^[a-f0-9]{64}$"
      },
      "offset": {
        "type": "integer",
        "minimum": 0
      },
      "limit": {
        "type": "integer",
        "minimum": 1,
        "maximum": 196608
      },
      "readId": {
        "type": "string",
        "pattern": "^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$"
      }
    },
    [
      "workspace",
      "publicationId",
      "expectedSha256"
    ],
    {
      "readOnly": true,
      "idempotent": true
    }
  ],
  [
    "merchant_reporting_file_release",
    "Release the original retained read handle.",
    {
      "workspace": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$"
      },
      "readId": {
        "type": "string",
        "pattern": "^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$"
      }
    },
    [
      "workspace",
      "readId"
    ],
    {
      "idempotent": true
    }
  ],
  [
    "merchant_reporting_close",
    "Drain and close only this provider's originally opened reporting workspace.",
    {
      "workspace": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$"
      },
      "instanceId": {
        "type": "string",
        "pattern": "^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$"
      }
    },
    [
      "workspace",
      "instanceId"
    ],
    {
      "idempotent": true
    }
  ]
];

export function reportingProgrammeTools(tool) {
  return definitions.map(([name,description,properties,required,behaviour]) => tool(name,description,properties,required,behaviour));
}
