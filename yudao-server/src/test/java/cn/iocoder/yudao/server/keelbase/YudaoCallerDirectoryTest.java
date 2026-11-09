// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import cn.iocoder.yudao.framework.tenant.core.context.TenantContextHolder;
import java.sql.Connection;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * 台账「谁」那一列的**服务端联名**：谁能被叫出名字，谁不能。
 *
 * <p>这条端点的安全面全在「答到什么范围」上——故这里钉的是五个边界：自己总有名字、普通调用方只知道自己、
 * 审计读者能叫出**账本里出现过**的人、管理员与审计读者同一范围（G-3）、别的租户与从没在账本里出现过的 id
 * 一律不给。外加一条：账本读不出来时只是少给名字，绝不抛错。
 *
 * <p>英文：
 *
 * <p>The **server-side join** behind the ledger's "who" column: who may be named and who may not. The
 * endpoint's safety is entirely in how far the answer goes, so these tests pin five bounds — the caller
 * always gets their own name, an ordinary caller learns nobody else, an audit reader may name the people
 * who appear in a ledger, an administrator gets that same range (G-3), and another tenant's user or an id
 * that never appeared in a ledger is never named. One more: an unreadable ledger drops names and never
 * throws.
 */
class YudaoCallerDirectoryTest {

    private DataSource dataSource;
    private YudaoAuditReaderRules auditReaders;
    private YudaoAdministrator administrators;
    private YudaoCallerDirectory directory;

    @BeforeEach
    void setUp() throws Exception {
        dataSource = new DriverManagerDataSource("jdbc:h2:mem:callerdirectory;DB_CLOSE_DELAY=-1", "sa", "");
        resetSchema();
        auditReaders = mock(YudaoAuditReaderRules.class);
        when(auditReaders.isAuditReader("9002")).thenReturn(true); // 审计读者 / the audit reader
        administrators = mock(YudaoAdministrator.class);
        when(administrators.isAdmin(1L)).thenReturn(true); // 宿主管理员 / the host administrator
        directory = new YudaoCallerDirectory(dataSource, auditReaders, administrators);
        TenantContextHolder.setTenantId(1L);
    }

    @AfterEach
    void tearDown() {
        TenantContextHolder.clear();
    }

    private void resetSchema() throws Exception {
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.execute("drop all objects");
            statement.execute("create table system_users (id bigint primary key, tenant_id bigint,"
                    + " nickname varchar(64), username varchar(64), deleted smallint default 0)");
            statement.execute("create table ai_audit_logs (id bigint auto_increment primary key,"
                    + " user_id varchar(255), action varchar(255))");
            statement.execute("create table system_operate_log (id bigint auto_increment primary key,"
                    + " user_id bigint, tenant_id bigint, deleted smallint default 0)");
            statement.execute("insert into system_users (id, tenant_id, nickname, username) values"
                    + " (1, 1, '管理员', 'admin'),"
                    + " (9001, 1, '走查读者', 'm7reader'),"
                    + " (9002, 1, '审计读者', 'm7audit'),"
                    + " (42, 2, '别的租户', 'other')");
            statement.execute("insert into ai_audit_logs (user_id, action) values ('9001', 'tool_call')");
            statement.execute("insert into system_operate_log (user_id, tenant_id) values (9002, 1)");
        }
    }

    @Test
    void aCallerIsAlwaysNamed() {
        Map<String, String> names = directory.namesFor(9001L, List.of(9001L));

        assertEquals(Map.of("9001", "走查读者"), names);
    }

    @Test
    void anOrdinaryCallerLearnsNobodyElse() {
        // 9002 出现在操作审计里，但 9001 不是审计读者 —— 他不该知道这个名字。
        // 9002 appears in the operation audit, but 9001 is not an audit reader — it must not learn that name.
        Map<String, String> names = directory.namesFor(9001L, List.of(9001L, 9002L, 1L));

        assertEquals(Map.of("9001", "走查读者"), names);
    }

    @Test
    void anAuditReaderNamesThePeopleInTheLedgers() {
        // 9001 在审计链里、9002 在操作审计里；1（管理员）从未在账本里出现 ⇒ 不给。
        // 9001 is in the audit chain, 9002 in the operation audit; 1 (the administrator) never appears in a
        // ledger, so it is not named.
        Map<String, String> names = directory.namesFor(9002L, List.of(1L, 9001L, 9002L, 777L));

        assertEquals(Map.of("9001", "走查读者", "9002", "审计读者"), names);
    }

    @Test
    void aHostAdministratorNamesThePeopleInTheLedgers() {
        // 管理员与审计读者同一范围：账本里出现过的人。过去只有读者读得出姓名，而最常打开审计页的正是
        // 管理员，他看到的是裸 id（2026-11-08 走查 G-3）。1 是调用方本人，故总有名字；777 与 42 不在账本里。
        //
        // An administrator gets the same range as an audit reader: the people who appear in a ledger. The
        // administrator used to see bare ids where the reader saw names (G-3, measured 2026-11-08). 1 is
        // the caller, so they are always named; 777 and 42 do not appear in a ledger.
        Map<String, String> names = directory.namesFor(1L, List.of(1L, 9001L, 777L, 42L));

        assertEquals(Map.of("1", "管理员", "9001", "走查读者"), names);
    }

    @Test
    void anotherTenantsUserIsNeverNamed() {
        Map<String, String> names = directory.namesFor(9002L, List.of(42L));

        assertTrue(names.isEmpty(), "a user of another tenant must not be named: " + names);
    }

    @Test
    void anUnreadableLedgerNarrowsInsteadOfThrowing() throws Exception {
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.execute("drop table ai_audit_logs");
            statement.execute("drop table system_operate_log");
        }

        // 账本没了：审计读者只剩「自己」这一条，而这不抛错。
        // With no ledger left the audit reader keeps only their own name, and nothing throws.
        assertEquals(Map.of("9002", "审计读者"), directory.namesFor(9002L, List.of(9001L, 9002L)));
        assertEquals(Map.of(), directory.namesFor(9001L, List.of(9002L)));
    }

    @Test
    void theIdListIsCappedAndDeduplicated() {
        List<Long> parsed = YudaoCallerNamesController.parse("9001, 9001, 9002,abc,,999999999999999999999,-1");

        assertEquals(List.of(9001L, 9002L), parsed);
    }
}
