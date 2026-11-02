-- SPDX-License-Identifier: Apache-2.0
--
-- 上游 REST 写的**旁路留痕**表 —— 只记，不改。
--
-- 治理路径（AI 经 `GovernedExecutionEngine` 的那几条）留下的行在运行时的审计链上：
-- 有策略、有确认、有副作用台账。这张表记的是**另一类事实**：有人从上游控制台的 REST 改了东西。
-- 那里没有任何东西被确认过，故它**不能**混进审计链 —— 混进去会让一条「留痕」读成「有人批过」。
-- 分表就是那道分开：链页只读链，这张表由宿主自己读，两者在页面上不共用一行。
--
-- 上游控制台的写端点在本部署有 435 个（7 个模块），此前一个都没有旁路痕迹。
--
-- The **bypass trail** for upstream REST writes — recorded, never altered.
--
-- A governed path (AI through `GovernedExecutionEngine`) leaves its rows on the runtime's audit chain:
-- policy, confirmation, the side-effect ledger. This table records a different fact: somebody changed
-- something through the upstream console's REST surface. Nothing there was ever confirmed, so it must
-- **not** join the audit chain — joined, a trail row would read as "a human approved this". A separate
-- table is that separation: the chain page reads the chain, this one is the host's own, and no page
-- mixes the two in one row.
--
-- The upstream console has 435 write endpoints on this deployment (7 modules), none of which left a
-- bypass trace before this file.

create table if not exists keelbase_bypass_log (
    -- 请求结束的时刻。用请求结束而不是开始，与「结果码」同一个时点。
    -- When the request ended — the same instant the result code belongs to.
    id          bigserial     primary key,
    occurred_at timestamptz   not null,
    method      varchar(8)    not null,
    -- 只到 512：够放最长的管理端路径，且不让一行因为一个异常长的 URL 写不进去。
    -- Capped at 512: room for the longest admin path, and no row lost to an absurd URL.
    path        varchar(512)  not null,
    -- 从路径解析出来的业务对象，解析不出时为空 —— 空是「不知道」，不是「没有对象」。
    -- The business object parsed off the path; empty when the path does not name two segments.
    -- Empty means "not known", not "no object".
    module      varchar(64),
    object_name varchar(64),
    -- 调用方与租户按记录时的真实读数写；没有登录用户时为空。
    -- Caller and tenant as read at record time; empty when nobody was logged in.
    caller_id   bigint,
    tenant_id   bigint,
    -- **两个码，不是一个。** 本宿主把业务拒绝包在 HTTP 200 里（信封 `code` 403、HTTP 200），只记前者会让一行
    -- 200 被读成「写成功了」。`http_status` 是线缆上的状态；`result_code` 是宿主自己留在请求上的信封业务码
    -- （`GlobalResponseBodyHandler` → `CommonResult.code`），请求没产出信封时为空 —— 空是「宿主没答业务码」，
    -- 不是 0，也不是成功。
    --
    -- **Two codes, not one.** This host wraps a business refusal in HTTP 200 (envelope `code` 403, HTTP 200),
    -- so the wire status alone would let a 200 row read as "the write succeeded". `http_status` is what the
    -- wire carried; `result_code` is the envelope's business code the host left on the request
    -- (`GlobalResponseBodyHandler` → `CommonResult.code`), null when the request produced no envelope —
    -- null is "the host answered no business code", not 0 and not success.
    http_status integer       not null,
    result_code integer,
    duration_ms bigint        not null
);

comment on table keelbase_bypass_log is
    '上游 REST 写的旁路留痕：有痕，不代表受治理、有确认。 / Bypass trail for upstream REST writes: a trace is not governance and not a confirmation.';

-- 读面按时间倒序翻页；两个索引对应这一种读法。
-- The read face pages newest-first; these two indexes serve exactly that.
create index if not exists idx_keelbase_bypass_log_occurred_at
    on keelbase_bypass_log (occurred_at desc, id desc);
create index if not exists idx_keelbase_bypass_log_subject
    on keelbase_bypass_log (module, object_name);
