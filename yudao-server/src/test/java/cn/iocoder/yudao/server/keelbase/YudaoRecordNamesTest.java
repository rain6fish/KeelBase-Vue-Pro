// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolRegistry;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.module.crm.dal.dataobject.customer.CrmCustomerDO;
import cn.iocoder.yudao.module.crm.dal.mysql.customer.CrmCustomerMapper;
import cn.iocoder.yudao.module.crm.dal.mysql.followup.CrmFollowUpRecordMapper;
import cn.iocoder.yudao.module.infra.dal.mysql.demo.demo01.Demo01ContactMapper;
import cn.iocoder.yudao.module.products.dal.mysql.products.ProductsMapper;
import java.sql.Connection;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/**
 * 台账「哪个业务对象」那一格的**服务端联名**：哪条记录能被叫出名字，哪条不能。
 *
 * <p>这条端点的安全面全在「答到什么范围」上——故这里钉的是六个边界：账本点过名的才有名字、从没进过账本的不给、
 * 被拒那次从**确认记录**里答得出、普通调用方什么都不给、表外的类型不答、账本读不出来时只是少给名字而不抛错。
 * 外加两条纯函数用例：掩码只留首字符；提议里的 `id` **精确**匹配（90040 不是 9004）。
 *
 * <p>英文：
 *
 * <p>The **server-side join** behind the ledger's "which business object" cell: which records may be named
 * and which may not. The safety is entirely in how far the answer goes, so these tests pin six bounds —
 * only references the ledger named, nothing for an id that never entered one, the refused call answered
 * from the **confirmation record**, nothing at all for an ordinary caller, no answer for a type outside the
 * closed table, and an unreadable ledger that narrows instead of throwing. Two pure cases sit beside them:
 * the mask keeps only the first character, and the proposal's `id` matches **exactly** (90040 is not 9004).
 */
class YudaoRecordNamesTest {

    private DataSource dataSource;
    private YudaoAdministrator administrators;
    private YudaoAuditReaderRules auditReaders;
    private YudaoRecordNames directory;

    @BeforeEach
    void setUp() throws Exception {
        dataSource = new DriverManagerDataSource("jdbc:h2:mem:recordnames;DB_CLOSE_DELAY=-1", "sa", "");
        resetSchema();

        administrators = mock(YudaoAdministrator.class);
        when(administrators.isAdmin(1L)).thenReturn(true); // 管理员 / the administrator
        auditReaders = mock(YudaoAuditReaderRules.class);
        when(auditReaders.isAuditReader("9002")).thenReturn(true); // 审计读者 / the audit reader

        CrmCustomerMapper customers = mock(CrmCustomerMapper.class);
        when(customers.selectById(9005L)).thenReturn(CrmCustomerDO.builder().name("万科").build());
        when(customers.selectById(9004L)).thenReturn(CrmCustomerDO.builder().name("海康").build());

        ToolRegistry tools = new ToolRegistry(List.of(
                new FakeTool("update_crm_customer", "crm_customer"),
                new FakeTool("create_crm_customer", "crm_customer")));

        directory = new YudaoRecordNames(customers, mock(CrmFollowUpRecordMapper.class),
                mock(Demo01ContactMapper.class), mock(ProductsMapper.class),
                tools, dataSource, administrators, auditReaders);
    }

    private void resetSchema() throws Exception {
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.execute("drop all objects");
            statement.execute("create table side_effects (id bigint auto_increment primary key,"
                    + " result_type varchar(64), result_id bigint)");
            statement.execute("create table confirmation_requests (id bigint auto_increment primary key,"
                    + " tool_name varchar(128), args_json varchar(2000))");
            // 一次真的写落在 9005；一次被拒的调用提议动 9004（没有台账行）。
            // One real write landed on 9005; one refused call proposed 9004 (no ledger row).
            statement.execute("insert into side_effects (result_type, result_id) values ('crm_customer', 9005)");
            statement.execute("insert into confirmation_requests (tool_name, args_json) values"
                    + " ('update_crm_customer', '{\"id\":9004,\"name\":\"x\"}')");
        }
    }

    @Test
    void anAuditReaderNamesTheRecordTheLedgerNamed() {
        List<YudaoRecordNames.Named> named =
                directory.namesFor(9002L, List.of(new YudaoRecordNames.Ref("crm_customer", 9005)));

        assertEquals(List.of(new YudaoRecordNames.Named("crm_customer", "9005", "万****")), named);
    }

    @Test
    void theRefusedCallsProposalIsNamedToo() {
        // 被拒那次没有台账行——它的对象只在确认记录里。这一格正是 `YD-42` C③ 的题眼。
        // The refused call writes no ledger row; its object lives only in the confirmation record — the cell
        // this whole read face exists for.
        List<YudaoRecordNames.Named> named =
                directory.namesFor(9002L, List.of(new YudaoRecordNames.Ref("crm_customer", 9004)));

        assertEquals(List.of(new YudaoRecordNames.Named("crm_customer", "9004", "海****")), named);
    }

    @Test
    void aReferenceThatNeverEnteredALedgerIsNotNamed() {
        List<YudaoRecordNames.Named> named =
                directory.namesFor(9002L, List.of(new YudaoRecordNames.Ref("crm_customer", 9003)));

        assertTrue(named.isEmpty(), "a reference no ledger ever named must not be answered: " + named);
    }

    @Test
    void anOrdinaryCallerLearnsNothing() {
        // 9003 既不是管理员也不是审计读者——即便这条引用真的在台账里，也不给。
        // 9003 is neither an administrator nor an audit reader; the reference is in the ledger and it still
        // must not be named.
        List<YudaoRecordNames.Named> named =
                directory.namesFor(9003L, List.of(new YudaoRecordNames.Ref("crm_customer", 9005)));

        assertTrue(named.isEmpty(), "an ordinary caller must not be answered: " + named);
    }

    @Test
    void theAdministratorMayAsk() {
        List<YudaoRecordNames.Named> named =
                directory.namesFor(1L, List.of(new YudaoRecordNames.Ref("crm_customer", 9005)));

        assertEquals(1, named.size(), "the administrator holds this read anyway: " + named);
    }

    @Test
    void aTypeOutsideTheClosedTableIsNotAnswered() {
        // `fms_voucher` 有补偿器，但本类说不出它的名字——编一个比缺一个更糟。
        // `fms_voucher` has a compensator, but this class cannot name it — an invention is worse than a gap.
        List<YudaoRecordNames.Named> named =
                directory.namesFor(9002L, List.of(new YudaoRecordNames.Ref("fms_voucher", 7)));

        assertTrue(named.isEmpty(), "a type this class cannot name must not be answered: " + named);
    }

    @Test
    void anUnreadableLedgerNarrowsInsteadOfThrowing() throws Exception {
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.execute("drop table side_effects");
            statement.execute("drop table confirmation_requests");
        }

        assertTrue(directory.namesFor(9002L, List.of(new YudaoRecordNames.Ref("crm_customer", 9005))).isEmpty());
    }

    @Test
    void theMaskKeepsOnlyTheFirstCharacter() {
        assertEquals("万****", YudaoRecordNames.mask("万科"));
        assertEquals("", YudaoRecordNames.mask(""));
        assertEquals("", YudaoRecordNames.mask(null));
    }

    @Test
    void theProposalIdIsMatchedExactly() {
        assertEquals(9004L, YudaoRecordNames.idIn("{\"id\":9004,\"name\":\"x\"}"));
        assertEquals(9004L, YudaoRecordNames.idIn("{ \"id\" : 9004 }"));
        assertNotEquals(9004L, YudaoRecordNames.idIn("{\"id\":90040}"));
        assertNull(YudaoRecordNames.idIn("{\"customerId\":9004}"), "only a key named exactly `id` counts");
        assertNull(YudaoRecordNames.idIn(null));
    }

    @Test
    void theRefListIsCappedDeduplicatedAndShapeChecked() {
        List<YudaoRecordNames.Ref> parsed = YudaoRecordNamesController.parse(
                "crm_customer:9005, crm_customer:9005, CRM:1, bad, products:0, products:7:8, fms_voucher:12");

        assertEquals(List.of(
                new YudaoRecordNames.Ref("crm_customer", 9005),
                new YudaoRecordNames.Ref("fms_voucher", 12)), parsed);
    }

    /** 一个只声明名字与结果类型的工具——本条端点只问这两样。 / A tool that declares only what this face asks. */
    private record FakeTool(String name, String resultType) implements AiTool {

        @Override
        public String description() {
            return "";
        }

        @Override
        public String riskLevel() {
            return "R2";
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            return null;
        }
    }
}
