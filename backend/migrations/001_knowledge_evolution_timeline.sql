-- Migration: Knowledge Evolution Timeline
-- Description: Creates tables for tracking personal conceptual growth over time
-- Date: 2026-03-01
--
-- This migration adds 5 new tables:
--   1. concepts          - Canonical concept registry
--   2. document_concept_links - Links documents to concepts with depth scores
--   3. concept_snapshots  - Timeline data points for level progression
--   4. concept_relationships - Hierarchy and connections between concepts
--   5. user_concept_state - Denormalized current state for fast reads

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- Table 1: concepts
-- Canonical concept registry with aliases and domain info
-- ============================================================
CREATE TABLE IF NOT EXISTS concepts (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canonical_name    VARCHAR(200) NOT NULL,
    aliases           JSONB DEFAULT '[]'::jsonb,
    embedding_id      VARCHAR(255),
    domain            VARCHAR(200),
    parent_concept_id UUID REFERENCES concepts(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_concepts_canonical_name ON concepts(canonical_name);
CREATE INDEX IF NOT EXISTS idx_concepts_domain ON concepts(domain);
CREATE INDEX IF NOT EXISTS idx_concepts_parent ON concepts(parent_concept_id);

-- ============================================================
-- Table 2: document_concept_links
-- Maps which documents contain which concepts, with scores
-- ============================================================
CREATE TABLE IF NOT EXISTS document_concept_links (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id       UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    concept_id        UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    similarity_score  FLOAT,
    depth_score       FLOAT,
    raw_concept_text  VARCHAR(200),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(document_id, concept_id)
);

CREATE INDEX IF NOT EXISTS idx_dcl_user_concept ON document_concept_links(user_id, concept_id);
CREATE INDEX IF NOT EXISTS idx_dcl_document ON document_concept_links(document_id);

-- ============================================================
-- Table 3: concept_snapshots
-- Timeline data points recording level changes over time
-- ============================================================
CREATE TABLE IF NOT EXISTS concept_snapshots (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    concept_id        UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    level             INTEGER NOT NULL CHECK (level BETWEEN 1 AND 5),
    raw_score         FLOAT NOT NULL,
    signal_breakdown  JSONB NOT NULL,
    document_count    INTEGER DEFAULT 0,
    note_count        INTEGER DEFAULT 0,
    quiz_accuracy     FLOAT,
    snapshot_trigger  VARCHAR(50),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_user_concept_time ON concept_snapshots(user_id, concept_id, created_at);
CREATE INDEX IF NOT EXISTS idx_snapshots_user_time ON concept_snapshots(user_id, created_at);

-- ============================================================
-- Table 4: concept_relationships
-- Hierarchy and connections between concepts
-- ============================================================
CREATE TABLE IF NOT EXISTS concept_relationships (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parent_concept_id   UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    child_concept_id    UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    relationship_type   VARCHAR(50) NOT NULL DEFAULT 'parent_child',
    strength            FLOAT DEFAULT 0.5,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(parent_concept_id, child_concept_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_cr_parent ON concept_relationships(parent_concept_id);
CREATE INDEX IF NOT EXISTS idx_cr_child ON concept_relationships(child_concept_id);

-- ============================================================
-- Table 5: user_concept_state
-- Denormalized current concept state per user for fast reads
-- ============================================================
CREATE TABLE IF NOT EXISTS user_concept_state (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    concept_id        UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
    current_level     INTEGER NOT NULL DEFAULT 1,
    current_raw_score FLOAT NOT NULL DEFAULT 0.0,
    current_signals   JSONB,
    first_seen_at     TIMESTAMPTZ,
    last_updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    pending_snapshot  BOOLEAN DEFAULT FALSE,
    UNIQUE(user_id, concept_id)
);

CREATE INDEX IF NOT EXISTS idx_ucs_user ON user_concept_state(user_id);
CREATE INDEX IF NOT EXISTS idx_ucs_pending ON user_concept_state(pending_snapshot) WHERE pending_snapshot = TRUE;
