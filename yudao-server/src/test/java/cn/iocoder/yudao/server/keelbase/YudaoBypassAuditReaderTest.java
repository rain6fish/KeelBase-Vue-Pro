// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.Statement;
import java.util.Arrays;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * 旁路台账只读面的四个边界：最新在前、租户收窄、页码与每页条数被夹到有效范围、**不读请求体摘要**。
 *
 * <p>第四条不是习惯问题：这条面承诺的是「记录了什么」，而摘要是一份按键脱敏、截断过的投影。它不进
 * select 列表，故一条再完整的摘要也到不了读者眼前。
 *
 * <p>英文：
 *
 * <p>The read face's four bounds: newest first, narrowed by tenant, page and limit clamped, and
 * **no request-body digest**. The fourth is not a matter of taste: this face promises "what was
 * recorded", while the digest is a key-masked, truncated projection. It is absent from the select list,
 * so no digest — however complete — reaches a reader.
 */
class YudaoBypassAuditReaderTest {

    private YudaoBypassAuditReader reader;

    @BeforeEach
    void setUp() throws Exception {
        DataSource dataSource = new DriverManagerDataSource(
                "jdbc:h2:mem:bypassreader;DB_CLOSE_DELAY=-1", "sa", "");
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.execute("drop all objects");
            statement.execute("create table keelbase_bypass_audit ("
                    + " id bigint primary key,"
                    + " tenant_id bigint null,"
                    + " trace_id varchar(64) null,"
                    + " user_id bigint null,"
                    + " user_type int2 null,"
                    + " request_method varchar(10) not null,"
                    + " request_url varchar(512) not null,"
                    + " business_object varchar(128) null,"
                    + " action varchar(128) null,"
                    + " result_status int4 not null,"
                    + " result_code int4 null,"
                    + " request_digest varchar(1024) null,"
                    + " duration_ms int4 null,"
                    + " created_at timestamp not null default CURRENT_TIMESTAMP)");
            statement.execute("insert into keelbase_bypass_audit"
                    + " (id, tenant_id, trace_id, user_id, request_method, request_url, business_object,"
                    + "  action, result_status, result_code, request_digest, duration_ms, created_at)"
                    + " values"
                    + " (1, 1, 't1', 9001, 'POST', '/admin-api/crm/customer/create', 'crm.customer',"
                    + "  'create', 200, 0, '{\"name\":\"***\"}', 12, timestamp '2026-10-31 10:00:00'),"
                    + " (2, 1, 't2', 9001, 'PUT', '/admin-api/crm/customer/update', 'crm.customer',"
                    + "  'update', 200, 0, '{\"mobile\":\"***\"}', 7, timestamp '2026-10-31 10:01:00'),"
                    + " (3, 1, 't3', 1, 'DELETE', '/admin-api/crm/customer/delete', 'crm.customer',"
                    + "  'delete', 400, 1004009000, null, 3, timestamp '2026-10-31 10:02:00'),"
                    + " (4, 2, 't4', 42, 'POST', '/admin-api/crm/customer/create', 'crm.customer',"
                    + "  'create', 200, 0, null, 5, timestamp '2026-10-31 10:03:00')");
        }
        reader = new YudaoBypassAuditReader(dataSource);
    }

    @Test
    void readsNewestFirstAndCountsOnlyThisTenant() {
        YudaoBypassAuditReader.Page page = reader.page(1L, 1, 20);

        assertEquals(3L, page.total());
        assertEquals(List.of(3L, 2L, 1L), page.items().stream().map(YudaoBypassAuditReader.Row::id).toList());
        assertTrue(page.items().stream().noneMatch(row -> row.userId() == 42L));
        assertTrue(page.items().stream().allMatch(row -> row.createdAt() > 0L));
    }

    @Test
    void carriesTheFieldsTheConsoleDraws() {
        YudaoBypassAuditReader.Row row = reader.page(1L, 1, 1).items().get(0);

        assertEquals(3L, row.id());
        assertEquals(1L, row.userId());
        assertEquals("DELETE", row.requestMethod());
        assertEquals("/admin-api/crm/customer/delete", row.requestUrl());
        assertEquals("crm.customer", row.businessObject());
        assertEquals("delete", row.action());
        assertEquals(400, row.resultStatus());
        assertEquals(1004009000, row.resultCode());
        assertEquals(3, row.durationMs());
    }

    @Test
    void clampsPageAndLimitAndReportsWhatItApplied() {
        YudaoBypassAuditReader.Page first = reader.page(1L, 0, 0);
        assertEquals(1, first.page());
        assertEquals(1, first.limit());
        assertEquals(1, first.items().size());

        YudaoBypassAuditReader.Page wide = reader.page(1L, 1, 1000);
        assertEquals(YudaoBypassAuditReader.MAX_LIMIT, wide.limit());
        assertEquals(3, wide.items().size());

        YudaoBypassAuditReader.Page second = reader.page(1L, 2, 2);
        assertEquals(2, second.page());
        assertEquals(List.of(1L), second.items().stream().map(YudaoBypassAuditReader.Row::id).toList());
    }

    @Test
    void anotherTenantSeesOnlyItsOwnRows() {
        YudaoBypassAuditReader.Page page = reader.page(2L, 1, 20);
        assertEquals(1L, page.total());
        assertEquals(4L, page.items().get(0).id());

        // 谓词是 `tenant_id = ?`：没有租户上下文的行（null）不匹配任何租户，故不会被某个租户读成自己的。
        // The predicate is `tenant_id = ?`: a row with no tenant context (null) matches no tenant, so it is
        // never read as someone's own.
        assertFalse(YudaoBypassAuditReader.PAGE.contains("is null"));
    }

    @Test
    void theDigestIsNotEvenSelected() {
        assertFalse(YudaoBypassAuditReader.PAGE.contains("request_digest"),
                "the read face must not select the request-body digest");
        // 摘要列确实有值（夹具里有两行），但返回的那张形状里根本没有承载它的成员。
        // The digest column does hold values (two fixture rows), yet the returned shape has no member for it.
        assertTrue(Arrays.stream(YudaoBypassAuditReader.Row.class.getMethods())
                .noneMatch(method -> method.getName().toLowerCase().contains("digest")));
    }
}
