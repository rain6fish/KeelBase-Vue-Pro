// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import cn.iocoder.yudao.framework.common.exception.ServiceException;
import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import java.sql.Connection;
import java.sql.Statement;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * 旁路读面的三件事：**按租户收窄**、**最新在前**、**页码与页大小夹到范围里**；外加端点那一层的准入——
 * 管理员与审计读者读得到，别人拿到 403。
 *
 * <p>这几条都不是「多测一点」：一张治理读面若把别的租户的写混进来，是把一次留痕读成一次串租；若翻过头答 500，
 * 是把「没有更多」读成「出错了」；若不拦，是把「谁在写」读成人人都能查。
 *
 * <p>Three things about the trail's read face — **narrowed by tenant**, **newest first**, **page and size
 * clamped** — plus the endpoint's admission: administrators and audit readers get in, everyone else gets a
 * 403.
 *
 * <p>None of these is "a little more coverage": a governance read that mixes in another tenant's writes
 * reads a trail as a cross-tenant leak; one that answers 500 when paged too far reads "no more rows" as
 * "something broke"; one that lets everyone in reads "who is writing" as something anyone may look up.
 */
class YudaoBypassLogTest {

    private DataSource dataSource;
    private YudaoBypassLog trail;

    @BeforeEach
    void setUp() throws Exception {
        dataSource = new DriverManagerDataSource("jdbc:h2:mem:bypasslog;DB_CLOSE_DELAY=-1", "sa", "");
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.execute("drop all objects");
            statement.execute("create table keelbase_bypass_log ("
                    + " id bigint auto_increment primary key,"
                    + " occurred_at timestamp with time zone not null,"
                    + " method varchar(8) not null, path varchar(512) not null,"
                    + " module varchar(64), object_name varchar(64),"
                    + " caller_id bigint, tenant_id bigint,"
                    + " http_status integer not null, result_code integer, duration_ms bigint not null,"
                    + " body_length integer, body_sha256 varchar(16), body_fields varchar(512))");
            statement.execute("insert into keelbase_bypass_log (occurred_at, method, path, module, object_name,"
                    + " caller_id, tenant_id, http_status, result_code, duration_ms, body_length, body_sha256,"
                    + " body_fields) values"
                    + " ('2026-10-31T09:00:00Z', 'POST', '/admin-api/crm/contract/create', 'crm', 'contract',"
                    + "  9001, 1, 200, 0, 12, 44, '0123456789ab', 'customerId,note'),"
                    + " ('2026-10-31T09:01:00Z', 'DELETE', '/admin-api/crm/customer/delete', 'crm', 'customer',"
                    + "  9001, 1, 200, 403, 5, null, null, null),"
                    + " ('2026-10-31T09:02:00Z', 'POST', '/admin-api/system/dict-data/create', 'system', 'dict-data',"
                    + "  42, 2, 200, 0, 7, null, null, null)");
        }
        trail = new YudaoBypassLog(dataSource);
    }

    @AfterEach
    void tearDown() {
        TenantContextHolder.clear();
    }

    @Test
    void aTenantSeesOnlyItsOwnWrites() {
        YudaoBypassLog.Page mine = trail.page(1L, 1, 10);
        YudaoBypassLog.Page other = trail.page(2L, 1, 10);

        assertEquals(2, mine.total(), "two writes carry tenant 1");
        assertEquals(1, other.total(), "one write carries tenant 2");
        assertTrue(mine.items().stream().allMatch((row) -> row.tenantId() == 1L),
                "a tenant must not read another tenant's writes");
        assertEquals("system", other.items().get(0).module(), "tenant 2 gets its own row and no other");
    }

    @Test
    void newestIsFirst() {
        YudaoBypassLog.Page page = trail.page(1L, 1, 10);

        assertEquals("/admin-api/crm/customer/delete", page.items().get(0).path(),
                "the read face pages newest-first, as its index serves it");
        assertEquals("/admin-api/crm/contract/create", page.items().get(1).path());
    }

    @Test
    void theBodyColumnsComeBackAsTheyWereRecorded() {
        YudaoBypassLog.Row row = trail.page(1L, 1, 10).items().get(1);

        assertEquals(44, row.bodyLength());
        assertEquals("0123456789ab", row.bodySha256());
        assertEquals("customerId,note", row.bodyFields());
    }

    @Test
    void pagingIsClampedRatherThanAnsweringAnError() {
        YudaoBypassLog.Page capped = trail.page(1L, 0, 9999);
        YudaoBypassLog.Page pastTheEnd = trail.page(1L, 99, 10);

        assertEquals(1, capped.page(), "page 0 is page 1");
        assertEquals(YudaoBypassLog.MAX_LIMIT, capped.limit(), "a page cannot be larger than the cap");
        assertEquals(0, pastTheEnd.items().size(), "past the end is an empty page, not a failure");
        assertEquals(2, pastTheEnd.total(), "and the total still says how many there are");
    }

    @Test
    void theEndpointRefusesCallersWhoHoldNeitherIdentity() {
        YudaoAdministrator administrators = mock(YudaoAdministrator.class);
        YudaoAuditReaderRules readers = mock(YudaoAuditReaderRules.class);
        YudaoCallerId callers = mock(YudaoCallerId.class);
        when(callers.current()).thenReturn(777L);
        YudaoBypassLogController controller =
                new YudaoBypassLogController(trail, administrators, readers, callers);

        ServiceException refused = assertThrows(ServiceException.class, () -> controller.page(1, 50));
        assertEquals(403, refused.getCode().intValue(),
                "a governance read face answers a refusal, not an empty page");
    }

    @Test
    void anAuditReaderAndAnAdministratorBothGetIn() {
        YudaoAdministrator administrators = mock(YudaoAdministrator.class);
        YudaoAuditReaderRules readers = mock(YudaoAuditReaderRules.class);
        YudaoCallerId callers = mock(YudaoCallerId.class);
        when(callers.current()).thenReturn(9002L);
        when(readers.isAuditReader("9002")).thenReturn(true);
        YudaoBypassLogController controller =
                new YudaoBypassLogController(trail, administrators, readers, callers);

        assertEquals(2, controller.page(1, 50).getData().total(),
                "the audit reader reads the trail, narrowed to the tenant in context (the seed fallback)");

        when(callers.current()).thenReturn(1L);
        when(administrators.isAdmin(1L)).thenReturn(true);
        assertEquals(2, controller.page(1, 50).getData().total(), "an administrator reads it too");
    }
}
