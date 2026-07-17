"""partners_payroll_clients_wallets

Adds: clients + revenue agreements, countries + fx rates, wallets + transactions,
payroll worker summaries + country cost pools, email log, training modules,
partner is_self, worker work_ready, rdp/session client links, quality composite
component columns, payroll period wallet/paid timestamps.

Revision ID: e4a9c1d2b3f4
Revises: d3e4f5a6b7c8
Create Date: 2026-07-17 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'e4a9c1d2b3f4'
down_revision: Union[str, None] = 'd3e4f5a6b7c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

client_contract_status_enum = postgresql.ENUM(
    'active', 'paused', 'ended', name='client_contract_status_enum', create_type=False,
)
client_owner_type_enum = postgresql.ENUM(
    'gs', 'worker', 'partner_entity', name='client_owner_type_enum', create_type=False,
)
wallet_tx_type_enum = postgresql.ENUM(
    'payroll_credit', 'adjustment', 'payout', name='wallet_tx_type_enum', create_type=False,
)
training_progress_enum = postgresql.ENUM(
    'not_started', 'in_progress', 'completed', name='training_progress_enum', create_type=False,
)


def upgrade() -> None:
    for name, values in [
        ('client_contract_status_enum', "'active', 'paused', 'ended'"),
        ('client_owner_type_enum', "'gs', 'worker', 'partner_entity'"),
        ('wallet_tx_type_enum', "'payroll_credit', 'adjustment', 'payout'"),
        ('training_progress_enum', "'not_started', 'in_progress', 'completed'"),
    ]:
        op.execute(f"""
            DO $$ BEGIN
                CREATE TYPE {name} AS ENUM ({values});
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
        """)

    # ── Existing-table alterations ─────────────────────────────────────────────
    op.add_column('partner_entities', sa.Column('is_self', sa.Boolean(), server_default='false', nullable=False))

    op.add_column('workers', sa.Column('work_ready', sa.Boolean(), server_default='false', nullable=False))
    # Existing workers are already active — mark them work-ready.
    op.execute("UPDATE workers SET work_ready = true")

    op.add_column('payroll_periods', sa.Column('wallet_pushed_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('payroll_periods', sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True))

    op.add_column('quality_composite_scores', sa.Column('assessment_component', sa.Numeric(5, 2), nullable=True))
    op.add_column('quality_composite_scores', sa.Column('rating_component', sa.Numeric(5, 2), nullable=True))
    op.add_column('quality_composite_scores', sa.Column('reliability_component', sa.Numeric(5, 2), nullable=True))
    op.add_column('quality_composite_scores', sa.Column('consistency_component', sa.Numeric(5, 2), nullable=True))
    op.add_column('quality_composite_scores', sa.Column('period_type', sa.String(16), nullable=True))
    op.add_column('quality_composite_scores', sa.Column('period_label', sa.String(64), nullable=True))

    # ── clients ────────────────────────────────────────────────────────────────
    op.create_table(
        'clients',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('platform', sa.String(128), nullable=False),
        sa.Column('account_email', sa.String(255), nullable=True),
        sa.Column('account_id', sa.String(255), nullable=True),
        sa.Column('login_reference', sa.String(255), nullable=True),
        sa.Column('owner_type', client_owner_type_enum, server_default='gs', nullable=False),
        sa.Column('owner_worker_id', sa.UUID(), nullable=True),
        sa.Column('owner_partner_entity_id', sa.UUID(), nullable=True),
        sa.Column('contract_status', client_contract_status_enum, server_default='active', nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('document_urls', postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['owner_worker_id'], ['workers.id']),
        sa.ForeignKeyConstraint(['owner_partner_entity_id'], ['partner_entities.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'client_revenue_agreements',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('client_id', sa.UUID(), nullable=False),
        sa.Column('gs_pct', sa.Numeric(5, 2), nullable=False),
        sa.Column('owner_pct', sa.Numeric(5, 2), nullable=False),
        sa.Column('effective_from', sa.Date(), nullable=False),
        sa.Column('effective_to', sa.Date(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.CheckConstraint('gs_pct + owner_pct = 100.00', name='ck_client_revenue_agreements_splits_sum'),
        sa.ForeignKeyConstraint(['client_id'], ['clients.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_client_revenue_agreements_client_id', 'client_revenue_agreements', ['client_id'])

    op.add_column('rdp_resources', sa.Column('client_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_rdp_resources_client_id', 'rdp_resources', 'clients', ['client_id'], ['id'])

    op.add_column('sessions', sa.Column('client_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_sessions_client_id', 'sessions', 'clients', ['client_id'], ['id'])

    # ── countries + fx rates ───────────────────────────────────────────────────
    op.create_table(
        'countries',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(64), nullable=False),
        sa.Column('currency_code', sa.String(3), nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )

    op.create_table(
        'fx_rates',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('base_currency', sa.String(3), nullable=False),
        sa.Column('quote_currency', sa.String(3), nullable=False),
        sa.Column('rate', sa.Numeric(18, 6), nullable=False),
        sa.Column('source', sa.String(16), nullable=False),
        sa.Column('as_of_date', sa.Date(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('base_currency', 'quote_currency', 'as_of_date', 'source', name='uq_fx_rates_day'),
    )

    op.execute("""
        INSERT INTO countries (name, currency_code) VALUES
        ('UK', 'GBP'),
        ('Kenya', 'KES'),
        ('Uganda', 'UGX'),
        ('South Africa', 'ZAR'),
        ('India', 'INR')
        ON CONFLICT (name) DO NOTHING
    """)

    # ── wallets ────────────────────────────────────────────────────────────────
    op.create_table(
        'wallets',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('worker_id', sa.UUID(), nullable=False),
        sa.Column('balance', sa.Numeric(14, 2), server_default='0.00', nullable=False),
        sa.Column('currency', sa.String(3), server_default='USD', nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('worker_id'),
    )

    op.create_table(
        'wallet_transactions',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('wallet_id', sa.UUID(), nullable=False),
        sa.Column('worker_id', sa.UUID(), nullable=False),
        sa.Column('tx_type', wallet_tx_type_enum, nullable=False),
        sa.Column('amount', sa.Numeric(14, 2), nullable=False),
        sa.Column('currency', sa.String(3), nullable=False),
        sa.Column('payroll_period_id', sa.UUID(), nullable=True),
        sa.Column('note', sa.Text(), nullable=True),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['wallet_id'], ['wallets.id']),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id']),
        sa.ForeignKeyConstraint(['payroll_period_id'], ['payroll_periods.id']),
        sa.ForeignKeyConstraint(['created_by'], ['admin_users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_wallet_transactions_wallet_id', 'wallet_transactions', ['wallet_id'])
    op.create_index('ix_wallet_transactions_worker_id', 'wallet_transactions', ['worker_id'])
    op.create_index(
        'uq_wallet_tx_payroll_credit', 'wallet_transactions', ['worker_id', 'payroll_period_id'],
        unique=True, postgresql_where=sa.text("tx_type = 'payroll_credit'"),
    )

    # ── payroll summaries + cost pools ─────────────────────────────────────────
    op.create_table(
        'payroll_worker_summaries',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('payroll_period_id', sa.UUID(), nullable=False),
        sa.Column('worker_id', sa.UUID(), nullable=False),
        sa.Column('hours_logged', sa.Numeric(8, 2), server_default='0.00', nullable=False),
        sa.Column('rate_per_hour', sa.Numeric(12, 2), server_default='0.00', nullable=False),
        sa.Column('base_pay', sa.Numeric(14, 2), server_default='0.00', nullable=False),
        sa.Column('bonus', sa.Numeric(14, 2), server_default='0.00', nullable=False),
        sa.Column('gross_earned', sa.Numeric(14, 2), server_default='0.00', nullable=False),
        sa.Column('transfer_cost', sa.Numeric(14, 2), server_default='0.00', nullable=False),
        sa.Column('external_cost', sa.Numeric(14, 2), server_default='0.00', nullable=False),
        sa.Column('total_deductions', sa.Numeric(14, 2), server_default='0.00', nullable=False),
        sa.Column('final_net', sa.Numeric(14, 2), server_default='0.00', nullable=False),
        sa.Column('local_currency', sa.String(3), server_default='USD', nullable=False),
        sa.Column('fx_rate', sa.Numeric(18, 6), nullable=True),
        sa.Column('base_currency', sa.String(3), nullable=True),
        sa.Column('base_equivalent', sa.Numeric(14, 2), nullable=True),
        sa.Column('exception_flags', postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['payroll_period_id'], ['payroll_periods.id']),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('payroll_period_id', 'worker_id', name='uq_payroll_summary_period_worker'),
    )
    op.create_index('ix_payroll_worker_summaries_payroll_period_id', 'payroll_worker_summaries', ['payroll_period_id'])
    op.create_index('ix_payroll_worker_summaries_worker_id', 'payroll_worker_summaries', ['worker_id'])

    op.create_table(
        'country_cost_pools',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('payroll_period_id', sa.UUID(), nullable=False),
        sa.Column('country', sa.String(64), nullable=False),
        sa.Column('transfer_cost_total', sa.Numeric(14, 2), server_default='0.00', nullable=False),
        sa.Column('external_cost_total', sa.Numeric(14, 2), server_default='0.00', nullable=False),
        sa.Column('note', sa.String(255), nullable=True),
        sa.ForeignKeyConstraint(['payroll_period_id'], ['payroll_periods.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('payroll_period_id', 'country', name='uq_country_cost_pool_period_country'),
    )
    op.create_index('ix_country_cost_pools_payroll_period_id', 'country_cost_pools', ['payroll_period_id'])

    # ── email log ──────────────────────────────────────────────────────────────
    op.create_table(
        'email_log',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('to_email', sa.String(255), nullable=False),
        sa.Column('subject', sa.String(255), nullable=False),
        sa.Column('template', sa.String(32), nullable=False),
        sa.Column('status', sa.String(16), nullable=False),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('payroll_period_id', sa.UUID(), nullable=True),
        sa.Column('worker_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['payroll_period_id'], ['payroll_periods.id']),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    # ── training ───────────────────────────────────────────────────────────────
    op.create_table(
        'training_modules',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('mcq_set_id', sa.UUID(), nullable=True),
        sa.Column('task_assessment_id', sa.UUID(), nullable=True),
        sa.Column('is_mandatory_for_new_workers', sa.Boolean(), server_default='false', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['mcq_set_id'], ['mcq_assessment_sets.id']),
        sa.ForeignKeyConstraint(['task_assessment_id'], ['task_assessments.id']),
        sa.ForeignKeyConstraint(['created_by'], ['admin_users.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'training_lessons',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('module_id', sa.UUID(), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('content_type', sa.String(16), nullable=False),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('media_url', sa.Text(), nullable=True),
        sa.Column('sort_order', sa.Integer(), server_default='0', nullable=False),
        sa.ForeignKeyConstraint(['module_id'], ['training_modules.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_training_lessons_module_id', 'training_lessons', ['module_id'])

    op.create_table(
        'training_progress',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('module_id', sa.UUID(), nullable=False),
        sa.Column('worker_id', sa.UUID(), nullable=False),
        sa.Column('status', training_progress_enum, server_default='not_started', nullable=False),
        sa.Column('completed_lesson_ids', postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['module_id'], ['training_modules.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['worker_id'], ['workers.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('module_id', 'worker_id', name='uq_training_progress_module_worker'),
    )
    op.create_index('ix_training_progress_module_id', 'training_progress', ['module_id'])
    op.create_index('ix_training_progress_worker_id', 'training_progress', ['worker_id'])


def downgrade() -> None:
    op.drop_table('training_progress')
    op.drop_table('training_lessons')
    op.drop_table('training_modules')
    op.drop_table('email_log')
    op.drop_table('country_cost_pools')
    op.drop_table('payroll_worker_summaries')
    op.drop_table('wallet_transactions')
    op.drop_table('wallets')
    op.drop_table('fx_rates')
    op.drop_table('countries')
    op.drop_constraint('fk_sessions_client_id', 'sessions', type_='foreignkey')
    op.drop_column('sessions', 'client_id')
    op.drop_constraint('fk_rdp_resources_client_id', 'rdp_resources', type_='foreignkey')
    op.drop_column('rdp_resources', 'client_id')
    op.drop_table('client_revenue_agreements')
    op.drop_table('clients')
    for col in ('assessment_component', 'rating_component', 'reliability_component',
                'consistency_component', 'period_type', 'period_label'):
        op.drop_column('quality_composite_scores', col)
    op.drop_column('payroll_periods', 'paid_at')
    op.drop_column('payroll_periods', 'wallet_pushed_at')
    op.drop_column('workers', 'work_ready')
    op.drop_column('partner_entities', 'is_self')
    for name in ('training_progress_enum', 'wallet_tx_type_enum', 'client_owner_type_enum', 'client_contract_status_enum'):
        op.execute(f"DROP TYPE IF EXISTS {name}")
