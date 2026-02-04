/**
 * Council Type Definitions
 * Core types for the Agent Council system
 */

// ============================================================================
// Type Literals
// ============================================================================

/**
 * Domains that councils can operate in
 */
export type CouncilDomain = 'lifestyle' | 'creative' | 'direction';

/**
 * Phases of a debate session
 */
export type DebatePhase = 'position' | 'challenge' | 'synthesis' | 'complete';

/**
 * Sources of memory creation
 */
export type MemorySourceType = 'debate' | 'user_feedback' | 'observation' | 'seed';

// ============================================================================
// Core Entity Interfaces
// ============================================================================

/**
 * Represents a Council - a group of agents discussing a specific domain
 */
export interface Council {
  /** Unique identifier for the council */
  id: string;
  /** Human-readable name */
  name: string;
  /** Domain this council operates in */
  domain: CouncilDomain;
  /** Optional description of the council's purpose */
  description?: string;
  /** Timestamp of creation (milliseconds) */
  createdAt: number;
}

/**
 * Represents an Agent's disposition - their perspective, priorities, and voice
 */
export interface AgentDisposition {
  /** Core orientation/philosophy of the agent */
  orientation: string;
  /** Criteria for filtering and evaluating information */
  filterCriteria: {
    /** Keywords this agent focuses on */
    keywords: string[];
    /** Sentiment bias: positive, negative, or neutral */
    sentimentBias: 'positive' | 'negative' | 'neutral';
    /** Preference for novel vs. proven approaches */
    noveltyPreference: 'high' | 'low' | 'balanced';
    /** Tolerance for risk and uncertainty */
    riskTolerance: 'high' | 'low' | 'moderate';
  };
  /** Weighted priorities for decision-making (sum should be ~1.0) */
  priorities: {
    /** Weight for cost considerations */
    cost: number;
    /** Weight for quality considerations */
    quality: number;
    /** Weight for novelty/innovation */
    novelty: number;
    /** Weight for reliability/proven methods */
    reliability: number;
  };
  /** How the agent communicates */
  voice: {
    /** Tone of communication */
    tone: string;
    /** Preferred vocabulary and phrases */
    vocabulary: string[];
  };
}

/**
 * Represents an Agent - a participant in council debates
 */
export interface Agent {
  /** Unique identifier for the agent */
  id: string;
  /** ID of the council this agent belongs to */
  councilId: string;
  /** Human-readable name */
  name: string;
  /** The agent's disposition and perspective */
  disposition: AgentDisposition;
  /** Current generation number (increments on succession) */
  generation: number;
  /** Maximum memories this agent can store */
  memoryCapacity: number;
  /** Current number of memories stored */
  memoryUsed: number;
  /** ID of the agent this one succeeded (if applicable) */
  predecessorId?: string;
  /** Whether this agent is currently active */
  isActive: boolean;
  /** Timestamp of creation (milliseconds) */
  createdAt: number;
}

/**
 * Represents a Memory - a stored insight or observation
 */
export interface Memory {
  /** Unique identifier for the memory */
  id: string;
  /** ID of the agent that owns this memory */
  agentId: string;
  /** The memory content */
  content: string;
  /** Score indicating how well this aligns with agent disposition (0-1) */
  dispositionScore: number;
  /** Source of this memory */
  sourceType: MemorySourceType;
  /** Reference to the source (e.g., session ID, feedback ID) */
  sourceRef?: string;
  /** ID of the embedding vector (if stored in vector DB) */
  embeddingId?: string;
  /** Timestamp of creation (milliseconds) */
  createdAt: number;
}

/**
 * Represents a Generation - a snapshot of an agent at a point in time
 */
export interface Generation {
  /** Unique identifier for this generation */
  id: string;
  /** ID of the agent this generation belongs to */
  agentId: string;
  /** Generation number */
  generationNum: number;
  /** Memory IDs used as seeds for this generation */
  seedMemories?: string[];
  /** Snapshot of the agent's disposition at this generation */
  dispositionSnapshot: AgentDisposition;
  /** Timestamp of creation (milliseconds) */
  createdAt: number;
  /** Timestamp when this generation was retired (if applicable) */
  retiredAt?: number;
}

/**
 * Represents a Debate Session - a structured discussion among agents
 */
export interface DebateSession {
  /** Unique identifier for the session */
  id: string;
  /** ID of the council conducting this debate */
  councilId: string;
  /** The user's prompt that initiated the debate */
  userPrompt: string;
  /** Current phase of the debate */
  phase: DebatePhase;
  /** Synthesized conclusion (populated in synthesis phase) */
  synthesis?: string;
  /** Timestamp of creation (milliseconds) */
  createdAt: number;
  /** Timestamp when debate completed (if applicable) */
  completedAt?: number;
}

/**
 * Represents a Turn in a Debate - one agent's contribution
 */
export interface DebateTurn {
  /** Unique identifier for this turn */
  id: string;
  /** ID of the session this turn belongs to */
  sessionId: string;
  /** ID of the agent making this turn */
  agentId: string;
  /** Phase this turn belongs to */
  phase: 'position' | 'challenge';
  /** The agent's contribution */
  content: string;
  /** Timestamp of creation (milliseconds) */
  createdAt: number;
}

/**
 * Represents an Adoption Record - user feedback on a debate outcome
 */
export interface AdoptionRecord {
  /** Unique identifier for this record */
  id: string;
  /** ID of the agent whose position was evaluated */
  agentId: string;
  /** ID of the session this feedback relates to */
  sessionId: string;
  /** Whether the user adopted, rejected, or partially adopted the position */
  decision: 'adopted' | 'rejected' | 'partial';
  /** Optional user feedback text */
  userFeedback?: string;
  /** Changes to the agent's disposition based on feedback */
  dispositionDelta?: Partial<AgentDisposition>;
  /** Timestamp of creation (milliseconds) */
  createdAt: number;
}

// ============================================================================
// Configuration Interfaces
// ============================================================================

/**
 * Configuration for initializing councils
 */
export interface CouncilConfig {
  /** Array of council definitions */
  councils: CouncilDefinition[];
}

/**
 * Definition of a council to be created
 */
export interface CouncilDefinition {
  /** Domain this council operates in */
  domain: CouncilDomain;
  /** Name of the council */
  name: string;
  /** Description of the council's purpose */
  description: string;
  /** Agents to initialize in this council */
  agents: AgentDefinition[];
}

/**
 * Definition of an agent to be created
 */
export interface AgentDefinition {
  /** Name of the agent */
  name: string;
  /** The agent's disposition */
  disposition: AgentDisposition;
  /** Optional memory capacity (defaults to 100) */
  memoryCapacity?: number;
}

// ============================================================================
// Debate Protocol Interfaces
// ============================================================================

/**
 * Request to initiate a debate
 */
export interface DebateRequest {
  /** The prompt/question to debate */
  prompt: string;
  /** Optional council domain to use (defaults to first available) */
  council?: CouncilDomain;
  /** Optional debate configuration */
  options?: DebateOptions;
}

/**
 * Options for configuring a debate
 */
export interface DebateOptions {
  /** Whether to include predecessor agents in the debate */
  includeAncestors?: boolean;
  /** Maximum number of debate rounds */
  maxRounds?: number;
  /** Whether to include verbose output */
  verbose?: boolean;
}

/**
 * Result of a completed debate
 */
export interface DebateResult {
  /** ID of the debate session */
  sessionId: string;
  /** Domain of the council that debated */
  council: CouncilDomain;
  /** Phases of the debate with contributions */
  phases: {
    /** Positions taken by agents */
    positions: AgentPosition[];
    /** Challenges raised during debate */
    challenges: AgentChallenge[];
    /** Synthesized conclusion */
    synthesis: string;
  };
  /** Overall recommendation from the council */
  recommendation: string;
  /** Confidence level in the recommendation (0-1) */
  confidence: number;
  /** Number of memories created during this debate */
  memoriesCreated: number;
}

/**
 * An agent's position in a debate
 */
export interface AgentPosition {
  /** ID of the agent */
  agentId: string;
  /** Name of the agent */
  agentName: string;
  /** The position statement */
  position: string;
  /** Key points supporting the position */
  keyPoints: string[];
  /** IDs of memories relevant to this position */
  relevantMemories: string[];
}

/**
 * A challenge raised during debate
 */
export interface AgentChallenge {
  /** ID of the agent raising the challenge */
  challengerId: string;
  /** Name of the challenging agent */
  challengerName: string;
  /** ID of the agent being challenged */
  targetId: string;
  /** Name of the target agent */
  targetName: string;
  /** The challenge statement */
  challenge: string;
  /** Counter-points to the target's position */
  counterPoints: string[];
}

// ============================================================================
// Memory Management Interfaces
// ============================================================================

/**
 * Evaluation of whether a memory should be stored
 */
export interface MemoryEvaluation {
  /** The memory content being evaluated */
  content: string;
  /** Score indicating disposition alignment (0-1) */
  dispositionScore: number;
  /** Whether this memory should be stored */
  shouldStore: boolean;
  /** ID of a memory that could be displaced if needed */
  displacementCandidate?: string;
  /** Reasoning for the evaluation decision */
  reasoning: string;
}

/**
 * Event representing agent succession
 */
export interface SuccessionEvent {
  /** ID of the predecessor agent */
  predecessorId: string;
  /** ID of the successor agent */
  successorId: string;
  /** Generation number of the successor */
  generationNum: number;
  /** Memory IDs passed to the successor */
  seedMemories: string[];
  /** Disposition inherited by the successor */
  inheritedDisposition: AgentDisposition;
}

// ============================================================================
// Vector Store Interfaces
// ============================================================================

/**
 * Result from vector store similarity query
 */
export interface SimilarityResult {
  /** ID of the memory */
  memoryId: string;
  /** Similarity score (0-1) */
  similarity: number;
}

/**
 * Vector store for semantic memory retrieval
 */
export interface VectorStore {
  /** Initialize the vector store */
  initialize(): Promise<void>;
  /** Add a memory to the vector store */
  addMemory(memoryId: string, agentId: string, content: string): Promise<string>;
  /** Query for similar memories */
  querySimilar(agentId: string, query: string, limit: number): Promise<SimilarityResult[]>;
  /** Delete a memory from the vector store */
  deleteMemory(embeddingId: string): Promise<void>;
  /** Clear all memories from the vector store */
  clear(): Promise<void>;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for CouncilDomain
 */
export function isCouncilDomain(value: unknown): value is CouncilDomain {
  return value === 'lifestyle' || value === 'creative' || value === 'direction';
}

/**
 * Type guard for DebatePhase
 */
export function isDebatePhase(value: unknown): value is DebatePhase {
  return (
    value === 'position' ||
    value === 'challenge' ||
    value === 'synthesis' ||
    value === 'complete'
  );
}

/**
 * Type guard for MemorySourceType
 */
export function isMemorySourceType(value: unknown): value is MemorySourceType {
  return (
    value === 'debate' ||
    value === 'user_feedback' ||
    value === 'observation' ||
    value === 'seed'
  );
}
