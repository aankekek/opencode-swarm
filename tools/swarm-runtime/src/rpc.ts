export interface SwarmBoardInfo {
  url: string;
  token: string;
  swarmId: string;
  title: string;
  status: string;
  activeCount: number;
}

export const SWARM_RPC_DEF = {
  id: "local.swarm-runtime",
  methods: {
    getBoardInfo: {
      input: { type: "object", properties: {} } as const,
      output: {
        type: "object",
        properties: {
          url: { type: "string" },
          token: { type: "string" },
          swarmId: { type: "string" },
          title: { type: "string" },
          status: { type: "string" },
          activeCount: { type: "number" },
        },
        required: ["url", "token", "swarmId", "title", "status", "activeCount"],
      } as const,
    },
  },
  events: {},
} as const;
