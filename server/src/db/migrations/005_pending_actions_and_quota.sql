-- 1. Tạo kiểu ENUM cho trạng thái pending_actions
DO $$ BEGIN
    CREATE TYPE pending_action_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Tạo bảng pending_actions cho Human-in-the-loop Checkpoint
CREATE TABLE IF NOT EXISTS pending_actions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    action_type VARCHAR(100) NOT NULL,
    target_agent VARCHAR(100) NOT NULL,
    status pending_action_status NOT NULL DEFAULT 'PENDING',
    action_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    supervisor_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    estimated_tokens INT DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '15 minutes'),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Đảm bảo cột expires_at luôn có giá trị DEFAULT ngay cả khi bảng đã được tạo từ trước
ALTER TABLE pending_actions
    ALTER COLUMN expires_at SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '15 minutes');

CREATE INDEX IF NOT EXISTS idx_pending_actions_session_status
    ON pending_actions(session_id, status);

-- 3. Cập nhật bảng user_daily_token_usage theo khóa (user_id, model_name, usage_date)
ALTER TABLE user_daily_token_usage
    ADD COLUMN IF NOT EXISTS model_name VARCHAR(100) NOT NULL DEFAULT 'default';

ALTER TABLE user_daily_token_usage
    DROP CONSTRAINT IF EXISTS user_daily_token_usage_pkey;

ALTER TABLE user_daily_token_usage
    ADD PRIMARY KEY (user_id, model_name, usage_date);
