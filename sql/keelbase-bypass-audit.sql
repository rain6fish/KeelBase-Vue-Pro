-- SPDX-License-Identifier: Apache-2.0
--
-- 上游自己的 REST 写（`/admin-api/**` 的 POST/PUT/DELETE/PATCH）在这里留一条**只记不改**的旁路记录。
--
-- 这张表**故意**不是 `ai_audit_logs`：后者是一条哈希链，掺进一条不是由治理引擎写下的行就是把链剪断。
-- 这里只追加、不参与任何链；行的用途是回答「谁、何时、对哪个业务对象、用哪个方法、结果如何」。
-- 它**不是**受治理路径 —— 记录与否都不改变请求、不扣人、不弹确认。两条路径靠 `trace_id` 关联。
--
-- 旁路记录的写入方是宿主 `YudaoBypassAudit`；开关是 `keelbase.bypass-audit.enabled`（默认开）。
-- 记录失败只写日志，故这张表缺了也只是丢旁路行，不影响任何业务请求。
--
-- A **record-only** trail for upstream's own REST writes (POST/PUT/DELETE/PATCH under `/admin-api/**`).
--
-- This table is deliberately **not** `ai_audit_logs`: that one is a hash chain, and a row not written by
-- the governance engine would cut the chain. This table only appends and takes part in no chain; its job
-- is to answer "who, when, which business object, which method, what result". It is **not** a governed
-- path — recording changes no request, detains nobody, asks nobody. The two paths are joined by `trace_id`.
--
-- The writer is the host's `YudaoBypassAudit`; the switch is `keelbase.bypass-audit.enabled` (on by
-- default). A failed insert is only logged, so a missing table costs bypass rows and nothing else.

create table if not exists keelbase_bypass_audit (
    id               bigint        not null,
    tenant_id        bigint        null default null,
    trace_id         varchar(64)   null default null,
    user_id          bigint        null default null,
    user_type        int2          null default null,
    request_method   varchar(10)   not null,
    request_url      varchar(512)  not null,
    business_object  varchar(128)  null default null,
    action           varchar(128)  null default null,
    result_status    int4          not null,
    result_code      int4          null default null,
    request_digest   varchar(1024) null default null,
    duration_ms      int4          null default null,
    created_at       timestamp     not null default CURRENT_TIMESTAMP,
    primary key (id)
);

create sequence if not exists keelbase_bypass_audit_seq;

-- 按行查找与按时间清扫都会用到；不做唯一约束，同一次请求只写一行的约束在过滤器里，不在库里。
-- Used by row lookups and time-ordered sweeps; no unique constraint — "one row per request" is the
-- filter's rule, not the table's.
create index if not exists idx_keelbase_bypass_audit_created_at
    on keelbase_bypass_audit (created_at);
create index if not exists idx_keelbase_bypass_audit_user_id
    on keelbase_bypass_audit (user_id);
create index if not exists idx_keelbase_bypass_audit_object
    on keelbase_bypass_audit (business_object);
