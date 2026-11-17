const { pool } = require('../config/db');

async function seedDatabase() {
  const client = await pool.connect();
  try {
    console.log('🌱 Starting database seeding...');
    await client.query('BEGIN');

    // 1. Seed Dummy Users
    const usersData = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'dev.lead@wcmih.local',
        daily_token_limit: 200000
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        email: 'demo.user@wcmih.local',
        daily_token_limit: 50000
      }
    ];

    for (const u of usersData) {
      await client.query(
        `INSERT INTO users (id, email, daily_token_limit)
         VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET daily_token_limit = EXCLUDED.daily_token_limit`,
        [u.id, u.email, u.daily_token_limit]
      );
    }
    console.log('✅ Seeded dummy users');

    // 2. Seed Daily Token Quotas theo từng model cho ngày hôm nay
    const quotasData = [
      { user_id: '11111111-1111-1111-1111-111111111111', model_name: 'gemini-2.5-pro', tokens: 42500 },
      { user_id: '11111111-1111-1111-1111-111111111111', model_name: 'claude-3-7-sonnet', tokens: 18200 },
      { user_id: '22222222-2222-2222-2222-222222222222', model_name: 'gemini-2.5-flash', tokens: 46500 }
    ];

    for (const q of quotasData) {
      await client.query(
        `INSERT INTO user_daily_token_usage (user_id, model_name, usage_date, total_tokens_used)
         VALUES ($1, $2, CURRENT_DATE, $3)
         ON CONFLICT (user_id, model_name, usage_date)
         DO UPDATE SET total_tokens_used = EXCLUDED.total_tokens_used`,
        [q.user_id, q.model_name, q.tokens]
      );
    }
    console.log('✅ Seeded daily token usage quotas');

    // 3. Seed Sample Session & Pending Action để UI team test Approval Card
    const sessionId = '33333333-3333-3333-3333-333333333333';
    await client.query(
      `INSERT INTO sessions (id, user_id, title, workspace_type)
       VALUES ($1, $2, 'MVP Architecture Orchestration', 'CHAT')
       ON CONFLICT (id) DO NOTHING`,
      [sessionId, '11111111-1111-1111-1111-111111111111']
    );

    const actionId = '44444444-4444-4444-4444-444444444444';
    await client.query(
      `INSERT INTO pending_actions (
         id, user_id, session_id, action_type, target_agent, status,
         action_payload, supervisor_state, estimated_tokens
       )
       VALUES ($1, $2, $3, 'ESCALATE_PREMIUM_MODEL', 'architect_agent', 'PENDING', $4::jsonb, $5::jsonb, 4500)
       ON CONFLICT (id) DO NOTHING`,
      [
        actionId,
        '11111111-1111-1111-1111-111111111111',
        sessionId,
        JSON.stringify({
          target_model: 'claude-3-7-sonnet',
          reason: 'Complex multi-step SQL & architectural reasoning required'
        }),
        JSON.stringify({
          thread_id: 'thread_mvp_demo_01',
          current_step: 'awaiting_human_approval'
        })
      ]
    );
    console.log('✅ Seeded sample session and pending action');

    await client.query('COMMIT');
    console.log('🎉 Database seeding completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seedDatabase();
