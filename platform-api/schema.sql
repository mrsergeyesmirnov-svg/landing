-- Академия / платформа консультантов.
-- Живёт в ТОЙ ЖЕ Postgres (Railway), что и Pulse-бот.
-- Таблицы с префиксом academy_ — не трогают feedback_events / problems.

CREATE TABLE IF NOT EXISTS academy_clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  telegram TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'lead',
  notes TEXT NOT NULL DEFAULT '',
  comments JSONB NOT NULL DEFAULT '[]'::jsonb,
  docs JSONB NOT NULL DEFAULT '[]'::jsonb,
  lead_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_academy_clients_updated
  ON academy_clients (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_academy_clients_phone
  ON academy_clients (phone);

CREATE INDEX IF NOT EXISTS idx_academy_clients_status
  ON academy_clients (status);

CREATE TABLE IF NOT EXISTS academy_leads (
  id BIGSERIAL PRIMARY KEY,
  client_id TEXT REFERENCES academy_clients(id) ON DELETE SET NULL,
  restaurant TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  contact TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  size_code TEXT NOT NULL DEFAULT '',
  problem_label TEXT NOT NULL DEFAULT '',
  expert_label TEXT NOT NULL DEFAULT '',
  price_min NUMERIC,
  price_max NUMERIC,
  note TEXT NOT NULL DEFAULT '',
  consent BOOLEAN NOT NULL DEFAULT false,
  contact_consent BOOLEAN NOT NULL DEFAULT false,
  consent_version TEXT NOT NULL DEFAULT '',
  preferred_contact TEXT NOT NULL DEFAULT '',
  consented_at TIMESTAMPTZ,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE academy_leads ADD COLUMN IF NOT EXISTS contact_consent BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE academy_leads ADD COLUMN IF NOT EXISTS consent_version TEXT NOT NULL DEFAULT '';
ALTER TABLE academy_leads ADD COLUMN IF NOT EXISTS preferred_contact TEXT NOT NULL DEFAULT '';
ALTER TABLE academy_leads ADD COLUMN IF NOT EXISTS consented_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_academy_leads_created
  ON academy_leads (created_at DESC);
