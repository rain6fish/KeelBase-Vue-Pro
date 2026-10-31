// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import java.sql.Timestamp;
import java.util.List;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 旁路台账的**只读**读取面：一页上游 REST 写，最新的在前。
 *
 * <p><b>它读什么、不读什么。</b>时间、调用方、方法、路径、业务对象、动作、HTTP 状态、信封结果码、耗时。
 * **请求体摘要刻意不读**（`request_digest` 不进 select 列表）：写入方留下的是一份按键脱敏、截断过的投影，
 * 而这条只读面承诺的是「记录了什么」而不是「当初请求里写了什么」；多一列就多一份可能被误读成原文的东西。
 *
 * <p><b>按租户收窄。</b>`keelbase_bypass_audit` 不带芋道的租户拦截器（它是直写的表），故租户谓词由这里
 * 显式加：只看调用方**当前租户**的行。这是个刻意的收窄——跨租户的行不在这条面的射程内。没有租户上下文的
 * 行（`tenant_id is null`，写入时确实没有上下文）因而不会被任何租户看到；一行无法归属到租户，也就不该被
 * 某个租户读成自己的。
 *
 * <p><b>只读。</b>本类只有 `select`；写仍然只有 {@link YudaoBypassAuditWriter} 一条路。
 *
 * A **read-only** face over the bypass ledger: one page of upstream REST writes, newest first.
 *
 * <p><b>What it reads, and what it does not.</b> Time, caller, method, path, business object, action, HTTP
 * status, envelope result code and duration. The request-body digest is **deliberately not read**
 * (`request_digest` is not in the select list): the writer keeps a key-masked, truncated projection, and
 * this face promises "what was recorded", not "what the request once said"; one more column would be one
 * more thing a reader could mistake for the original text.
 *
 * <p><b>Narrowed by tenant.</b> `keelbase_bypass_audit` is written directly and therefore does not meet
 * Yudao's tenant interceptor, so the predicate is added here: only rows of the caller's **current tenant**.
 * That is a declared narrowing — another tenant's rows are out of this face's scope. A row written with no
 * tenant context (`tenant_id is null`) is shown to no tenant: a row that cannot be attributed to a tenant
 * should not be read as someone's.
 *
 * <p><b>Read-only.</b> This class contains `select`s only; writing remains the one path through
 * {@link YudaoBypassAuditWriter}.
 */
public class YudaoBypassAuditReader {

    /** 一页最多多少行——与运行时自己的审计面同一个上界。 / The largest page, the same cap the runtime's audit faces use. */
    static final int MAX_LIMIT = 100;

    private static final String COUNT = "select count(*) from " + YudaoBypassAudit.TABLE
            + " where tenant_id = ?";

    /** 包内可见：单测钉住它**不读**请求体摘要。 / Package-visible so a test can pin that it reads no digest. */
    static final String PAGE = "select id, created_at, user_id, request_method, request_url,"
            + " business_object, action, result_status, result_code, duration_ms"
            + " from " + YudaoBypassAudit.TABLE
            + " where tenant_id = ?"
            + " order by id desc"
            + " limit ? offset ?";

    private final JdbcTemplate jdbcTemplate;

    public YudaoBypassAuditReader(DataSource dataSource) {
        this.jdbcTemplate = new JdbcTemplate(dataSource);
    }

    /**
     * 一页旁路记录。`page` 与 `limit` 都夹到有效范围，返回的是**实际生效**的那两个值 —— 页面据此算
     * 「还有没有下一页」，不自己猜。
     *
     * <p>One page of bypass rows. Both `page` and `limit` are clamped and the **effective** values are
     * returned; the page derives "is there more" from them instead of guessing.
     */
    public Page page(long tenantId, int page, int limit) {
        int effectiveLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
        int effectivePage = Math.max(page, 1);
        Long total = jdbcTemplate.queryForObject(COUNT, Long.class, tenantId);
        List<Row> items = jdbcTemplate.query(PAGE,
                (rs, index) -> new Row(
                        rs.getLong("id"),
                        epochMillis(rs.getTimestamp("created_at")),
                        (Long) rs.getObject("user_id"),
                        rs.getString("request_method"),
                        rs.getString("request_url"),
                        rs.getString("business_object"),
                        rs.getString("action"),
                        rs.getInt("result_status"),
                        (Integer) rs.getObject("result_code"),
                        (Integer) rs.getObject("duration_ms")),
                tenantId,
                effectiveLimit,
                (long) (effectivePage - 1) * effectiveLimit);
        return new Page(total == null ? 0L : total, effectivePage, effectiveLimit, items);
    }

    private static long epochMillis(Timestamp at) {
        return at == null ? 0L : at.getTime();
    }

    /**
     * 一行旁路记录。**字段就是这条面的全部射程**——没有请求体摘要，也没有正文。
     *
     * <p>One bypass row. **These fields are the whole of this face** — no digest, no body.
     */
    public record Row(
            long id,
            long createdAt,
            Long userId,
            String requestMethod,
            String requestUrl,
            String businessObject,
            String action,
            int resultStatus,
            Integer resultCode,
            Integer durationMs) {
    }

    /** 一页：总数、实际页码、实际每页条数、这些行。 / One page: total, effective page and limit, and the rows. */
    public record Page(long total, int page, int limit, List<Row> items) {
    }
}
