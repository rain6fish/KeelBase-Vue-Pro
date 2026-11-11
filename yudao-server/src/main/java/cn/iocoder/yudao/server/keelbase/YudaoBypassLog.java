// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.List;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 旁路留痕的**读面**：`keelbase_bypass_log` 的一页，最新在前。
 *
 * <p><b>它读的是那张表，不是审计链。</b>旁路行说「这个请求发生过、答的是这两个码」；审计行说「这次提议走到了
 * 什么结局」。两者**不联、不并、不重排**成一条 —— 读面把这件事做实在，页面才有资格把两张表并排摆着说
 * 「它们是两件事」。
 *
 * <p><b>按租户收窄。</b>这张表把调用时的租户当**数据**存，故读的时候也按它筛：控制台是某个租户的控制台，
 * 一个租户不该读到另一个租户写了什么。`tenant_id` 为空的那些行（记录时没有租户的请求）不出现 —— 那是**少报**，
 * 不是串租户。
 *
 * <p><b>只读。</b>没有写入口、没有删除、没有「标记已读」：一张留痕表能被改，就不再是留痕。
 *
 * <p>The **read face** of the bypass trail: one page of `keelbase_bypass_log`, newest first.
 *
 * <p><b>It reads that table, not the audit chain.</b> A bypass row says "this request happened and answered
 * with these two codes"; an audit row says "this proposal came to this end". The two are never joined,
 * merged or re-sorted into one line — making that real here is what lets a page put the two tables side by
 * side and say they are different facts.
 *
 * <p><b>Narrowed by tenant.</b> The table stores the caller's tenant **as data**, so the read filters by it
 * too: a console belongs to one tenant, and one tenant must not read what another wrote. Rows whose
 * `tenant_id` is null (a request recorded with no tenant) do not appear — that is a **shallow reading**,
 * not a crossing of tenants.
 *
 * <p><b>Read-only.</b> No write entry, no delete, no "mark as read": a trail that can be edited is no
 * longer a trail.
 */
@Component
public class YudaoBypassLog {

    /** 默认一页。 / The default page size. */
    static final int DEFAULT_LIMIT = 50;

    /**
     * 一页的上限。一段突发写可能留下上千行，故翻页而不是一次全给 —— 也让这条端点不可能被当成一次全表导出。
     *
     * <p>The page-size cap. A burst can leave thousands of rows, so the face pages rather than dumping
     * everything — which also keeps it from being usable as a whole-table export.
     */
    static final int MAX_LIMIT = 200;

    private static final String SELECT =
            "select id, occurred_at, method, path, module, object_name, caller_id, tenant_id,"
                    + " http_status, result_code, duration_ms, body_length, body_sha256, body_fields"
                    + " from keelbase_bypass_log where tenant_id = ?"
                    + " order by occurred_at desc, id desc limit ? offset ?";

    private final DataSource dataSource;
    private volatile JdbcTemplate jdbc;

    public YudaoBypassLog(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    /**
     * 一页。页码与页大小都夹到可用范围：越界不是错误，是「给你第一页 / 上限那么多」—— 一个读面不该因为翻过头
     * 就答 500。
     *
     * <p>One page. Both page and size are clamped into range: going past the end is not an error but "first
     * page" / "the cap" — a read face should not answer 500 because somebody paged too far.
     */
    public Page page(long tenantId, long page, int limit) {
        int size = limit <= 0 ? DEFAULT_LIMIT : Math.min(limit, MAX_LIMIT);
        int number = (int) Math.max(page, 1L);
        long total = jdbc().queryForObject(
                "select count(*) from keelbase_bypass_log where tenant_id = ?", Long.class, tenantId);
        List<Row> items = jdbc().query(SELECT,
                (rs, rowNumber) -> row(rs), tenantId, size, (long) (number - 1) * size);
        return new Page(total, number, size, items);
    }

    private static Row row(ResultSet rs) throws SQLException {
        return new Row(
                rs.getLong("id"),
                rs.getObject("occurred_at", OffsetDateTime.class),
                rs.getString("method"),
                rs.getString("path"),
                rs.getString("module"),
                rs.getString("object_name"),
                (Long) rs.getObject("caller_id"),
                (Long) rs.getObject("tenant_id"),
                rs.getInt("http_status"),
                (Integer) rs.getObject("result_code"),
                rs.getLong("duration_ms"),
                (Integer) rs.getObject("body_length"),
                rs.getString("body_sha256"),
                rs.getString("body_fields"));
    }

    private JdbcTemplate jdbc() {
        JdbcTemplate template = jdbc;
        if (template == null) {
            synchronized (this) {
                template = jdbc;
                if (template == null) {
                    template = new JdbcTemplate(dataSource);
                    jdbc = template;
                }
            }
        }
        return template;
    }

    /**
     * 一行，按它被记下的样子。`module` / `object` / `callerId` / `resultCode` 为空都是「不知道」，不是「没有」。
     * 正文三列同时为空是「没读」（见 {@link YudaoBypassAuditBody}）。
     *
     * <p>One row as it was recorded. Null `module` / `object` / `callerId` / `resultCode` all mean "not
     * known", never "none". All three body columns null means "not read" (see {@link YudaoBypassAuditBody}).
     */
    public record Row(
            long id,
            OffsetDateTime occurredAt,
            String method,
            String path,
            String module,
            String object,
            Long callerId,
            Long tenantId,
            int httpStatus,
            Integer resultCode,
            long durationMs,
            Integer bodyLength,
            String bodySha256,
            String bodyFields) {
    }

    /** 一页：总数、页码、页大小与这些行。 / One page: total, number, size and the rows. */
    public record Page(long total, int page, int limit, List<Row> items) {
    }
}
