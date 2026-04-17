-- Prism MTG Database Schema
-- Run this in Supabase SQL Editor (SQL Editor > New Query)

-- ============================================
-- PRISMS TABLE - saved prism configurations
-- ============================================
CREATE TABLE prisms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  split_groups JSONB DEFAULT '[]'::jsonb,
  marked_cards JSONB DEFAULT '[]'::jsonb,
  removed_cards JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- DECKS TABLE - deck metadata within a prism
-- ============================================
CREATE TABLE decks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prism_id UUID REFERENCES prisms(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#888888',
  bracket INTEGER CHECK (bracket >= 1 AND bracket <= 5),
  stripe_position INTEGER CHECK (stripe_position >= 1 AND stripe_position <= 32),
  sort_order INTEGER DEFAULT 0,
  split_group_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- DECK_CARDS TABLE - cards in each deck
-- ============================================
CREATE TABLE deck_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id UUID REFERENCES decks(id) ON DELETE CASCADE NOT NULL,
  card_name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  is_commander BOOLEAN DEFAULT false,
  is_basic_land BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast card lookups
CREATE INDEX idx_deck_cards_name ON deck_cards(card_name);
CREATE INDEX idx_deck_cards_deck ON deck_cards(deck_id);

-- ============================================
-- APP_LOGS TABLE - for debugging
-- ============================================
CREATE TABLE app_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  level TEXT NOT NULL DEFAULT 'info', -- 'debug', 'info', 'warn', 'error'
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for querying logs
CREATE INDEX idx_app_logs_level ON app_logs(level);
CREATE INDEX idx_app_logs_created ON app_logs(created_at DESC);

-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- PRISMS: Users can only see/modify their own prisms
ALTER TABLE prisms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own prisms"
  ON prisms FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own prisms"
  ON prisms FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own prisms"
  ON prisms FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own prisms"
  ON prisms FOR DELETE
  USING (auth.uid() = user_id);

-- DECKS: Access through prism ownership
ALTER TABLE decks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view decks in own prisms"
  ON decks FOR SELECT
  USING (prism_id IN (SELECT id FROM prisms WHERE user_id = auth.uid()));

CREATE POLICY "Users can create decks in own prisms"
  ON decks FOR INSERT
  WITH CHECK (prism_id IN (SELECT id FROM prisms WHERE user_id = auth.uid()));

CREATE POLICY "Users can update decks in own prisms"
  ON decks FOR UPDATE
  USING (prism_id IN (SELECT id FROM prisms WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete decks in own prisms"
  ON decks FOR DELETE
  USING (prism_id IN (SELECT id FROM prisms WHERE user_id = auth.uid()));

-- DECK_CARDS: Access through deck -> prism ownership
ALTER TABLE deck_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view cards in own decks"
  ON deck_cards FOR SELECT
  USING (deck_id IN (
    SELECT d.id FROM decks d
    JOIN prisms p ON d.prism_id = p.id
    WHERE p.user_id = auth.uid()
  ));

CREATE POLICY "Users can create cards in own decks"
  ON deck_cards FOR INSERT
  WITH CHECK (deck_id IN (
    SELECT d.id FROM decks d
    JOIN prisms p ON d.prism_id = p.id
    WHERE p.user_id = auth.uid()
  ));

CREATE POLICY "Users can update cards in own decks"
  ON deck_cards FOR UPDATE
  USING (deck_id IN (
    SELECT d.id FROM decks d
    JOIN prisms p ON d.prism_id = p.id
    WHERE p.user_id = auth.uid()
  ));

CREATE POLICY "Users can delete cards in own decks"
  ON deck_cards FOR DELETE
  USING (deck_id IN (
    SELECT d.id FROM decks d
    JOIN prisms p ON d.prism_id = p.id
    WHERE p.user_id = auth.uid()
  ));

-- APP_LOGS: Users can view/create their own logs
ALTER TABLE app_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own logs"
  ON app_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create logs"
  ON app_logs FOR INSERT
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

-- ============================================
-- RPC: Atomically replace all cards for a deck
-- Accepts an empty array to clear cards safely.
-- ============================================
CREATE OR REPLACE FUNCTION replace_deck_cards(
  p_deck_id UUID,
  p_cards JSONB,
  p_created_at TIMESTAMPTZ DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  DELETE FROM deck_cards WHERE deck_id = p_deck_id;

  INSERT INTO deck_cards (deck_id, card_name, quantity, is_commander, is_basic_land, created_at)
  SELECT
    p_deck_id,
    (c->>'card_name')::TEXT,
    COALESCE((c->>'quantity')::INTEGER, 1),
    COALESCE((c->>'is_commander')::BOOLEAN, false),
    COALESCE((c->>'is_basic_land')::BOOLEAN, false),
    p_created_at
  FROM jsonb_array_elements(p_cards) AS c
  WHERE jsonb_array_length(p_cards) > 0;
END;
$$;

-- SECURITY INVOKER: function runs as the calling user so existing RLS policies
-- on deck_cards apply — users can only replace cards in their own decks.
GRANT EXECUTE ON FUNCTION replace_deck_cards(UUID, JSONB, TIMESTAMPTZ) TO authenticated;

-- ============================================
-- HELPER FUNCTION: Update timestamp
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
CREATE TRIGGER update_prisms_updated_at
  BEFORE UPDATE ON prisms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_decks_updated_at
  BEFORE UPDATE ON decks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
