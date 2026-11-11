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
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
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
 * <p>这条端点的安全面全在「答到什么范围」上——故这里钉的是几个边界：账本点过名的才有名字、从没进过账本的不给、
 * 被拒那次从**确认记录**里答得出、表外的类型不答、账本读不出来时只是少给名字而不抛错。授权分两档：
 * 管理员与审计读者读得到整个账本；**其余调用方按行收窄**，只答出现在他自己账本行里的引用，别人的静默省略，
 * 混合请求也只回他自己的。外加两条纯函数用例：掩码只留首字符；提议里的 `id` **精确**匹配（90040 不是 9004）。
 *
 * <p>The **server-side join** behind the ledger's "which business object" cell: which records may be named
 * and which may not. The safety is entirely in how far the answer goes, so these tests pin those bounds —
 * only references the ledger named, nothing for an id that never entered one, the refused call answered
 * from the **confirmation record**, and an unreadable ledger that narrows instead of throwing. Authorization
 * has two tiers: administrators and audit readers read the whole ledger; **every other caller is narrowed
 * row by row** — only references in his own ledger rows are named, someone else's are silently omitted, and
 * a mixed request answers only his. Two pure cases sit beside them: the mask keeps only the first
 * character, and the proposal's `id` matches **exactly** (90040 is not 9004).
 */
class YudaoRecordNamesTest {

    private DataSource dataSource;
    private YudaoAdministrator administrators;
    private YudaoAuditReaderRules auditReaders;
    private CrmCustomerMapper customers;
    private ToolRegistry tools;
    private YudaoRecordNames directory;

    @BeforeEach
    void setUp() throws Exception {
        dataSource = new DriverManagerDataSource("jdbc:h2:mem:recordnames;DB_CLOSE_DELAY=-1", "sa", "");
        resetSchema();

        administrators = mock(YudaoAdministrator.class);
        when(administrators.isAdmin(1L)).thenReturn(true); // 管理员 / the administrator
        auditReaders = mock(YudaoAuditReaderRules.class);
        when(auditReaders.isAuditReader("9002")).thenReturn(true); // 审计读者 / the audit reader

        customers = mock(CrmCustomerMapper.class);
        when(customers.selectById(9005L)).thenReturn(CrmCustomerDO.builder().name("万科").build());
        when(customers.selectById(9006L)).thenReturn(CrmCustomerDO.builder().name("中兴").build());
        when(customers.selectById(9004L)).thenReturn(CrmCustomerDO.builder().name("海康").build());
        when(customers.selectById(9007L)).thenReturn(CrmCustomerDO.builder().name("比亚迪").build());

        tools = new ToolRegistry(List.of(
                new FakeTool("update_crm_customer", "crm_customer"),
                new FakeTool("create_crm_customer", "crm_customer")));

        directory = new YudaoRecordNames(customers, mock(CrmFollowUpRecordMapper.class),
                mock(Demo01ContactMapper.class), mock(ProductsMapper.class),
                tools, dataSource, administrators, auditReaders);
    }

    private void resetSchema() throws Exception {
        try (Connection connection = dataSource.getConnection(); Statement statement = connection.createStatement()) {
            statement.execute("drop all objects");
            // `result_id` 按真栈的形状建：运行时 0.1.16（迁移 V18）把它改成了文本列；`user_id` / `operator_id`
            // 同样是文本列（V1 的 DDL），故属主也按文本比。
            // `result_id` mirrors the real stack: runtime 0.1.16 (migration V18) turned it into a text column;
            // `user_id` / `operator_id` are text columns too (V1's DDL), so ownership compares as text as well.
            statement.execute("create table side_effects (id bigint auto_increment primary key,"
                    + " result_type varchar(64), result_id varchar(255), user_id varchar(255))");
            statement.execute("create table confirmation_requests (id bigint auto_increment primary key,"
                    + " tool_name varchar(128), args_json varchar(2000), operator_id varchar(255))");
            // 9001（走查读者）自己的一次真写落在 9005，一次被拒的提议动 9004；9003（另一个普通用户）的是 9006 与 9007。
            // 9001's own real write landed on 9005 and his refused proposal named 9004; 9003 (another ordinary
            // caller) owns 9006 and 9007.
            statement.execute("insert into side_effects (result_type, result_id, user_id) values"
                    + " ('crm_customer', 9005, '9001'), ('crm_customer', 9006, '9003')");
            statement.execute("insert into confirmation_requests (tool_name, args_json, operator_id) values"
                    + " ('update_crm_customer', '{\"id\":9004,\"name\":\"x\"}', '9001'),"
                    + " ('update_crm_customer', '{\"id\":9007,\"name\":\"y\"}', '9003')");
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
    void anOrdinaryCallerNamesHisOwnLedgerRow() {
        // 9001 不是管理员也不是审计读者，但 9005 是他自己写下的那一行——按行收窄答得出。
        // 9001 is neither an administrator nor an audit reader, but 9005 is his own ledger row — the row-by-row
        // tier answers it.
        List<YudaoRecordNames.Named> named =
                directory.namesFor(9001L, List.of(new YudaoRecordNames.Ref("crm_customer", 9005)));

        assertEquals(List.of(new YudaoRecordNames.Named("crm_customer", "9005", "万****")), named);
    }

    @Test
    void anOrdinaryCallerIsNotToldAboutSomeoneElsesLedgerRow() {
        // 9006 在台账里，但不是 9001 的行：静默省略，与「账本没点过名」同一个形状。
        // 9006 is in the ledger but not 9001's row: silently omitted, the same shape as "no ledger named it".
        List<YudaoRecordNames.Named> named =
                directory.namesFor(9001L, List.of(new YudaoRecordNames.Ref("crm_customer", 9006)));

        assertTrue(named.isEmpty(), "an ordinary caller must not be answered about someone else's row: " + named);
    }

    @Test
    void anOrdinaryCallerNamesHisOwnRefusedProposal() {
        // 被拒那次没有台账行，属主从确认记录的 `operator_id` 认。
        // A refused call writes no ledger row; ownership comes from the confirmation's `operator_id`.
        List<YudaoRecordNames.Named> named =
                directory.namesFor(9001L, List.of(new YudaoRecordNames.Ref("crm_customer", 9004)));

        assertEquals(List.of(new YudaoRecordNames.Named("crm_customer", "9004", "海****")), named);
    }

    @Test
    void anOrdinaryCallerIsNotToldAboutSomeoneElsesProposal() {
        List<YudaoRecordNames.Named> named =
                directory.namesFor(9001L, List.of(new YudaoRecordNames.Ref("crm_customer", 9007)));

        assertTrue(named.isEmpty(), "someone else's proposal must not be named: " + named);
    }

    @Test
    void anOrdinaryCallerLearnsNothingAboutAReferenceNoLedgerNamed() {
        List<YudaoRecordNames.Named> named =
                directory.namesFor(9001L, List.of(new YudaoRecordNames.Ref("crm_customer", 9003)));

        assertTrue(named.isEmpty(), "a reference no ledger ever named must not be answered: " + named);
    }

    @Test
    void aMixedRequestAnswersOnlyTheCallersOwnReferences() {
        // 一次请求里混着自己的（9005、9004）与别人的（9006、9007）：只回自己的那些，不因有一条自己的就整批放行。
        // A request mixing his own references (9005, 9004) with someone else's (9006, 9007) answers only his —
        // one own reference must not open the whole batch.
        List<YudaoRecordNames.Named> named = directory.namesFor(9001L, List.of(
                new YudaoRecordNames.Ref("crm_customer", 9005),
                new YudaoRecordNames.Ref("crm_customer", 9006),
                new YudaoRecordNames.Ref("crm_customer", 9004),
                new YudaoRecordNames.Ref("crm_customer", 9007)));

        assertEquals(List.of(
                new YudaoRecordNames.Named("crm_customer", "9005", "万****"),
                new YudaoRecordNames.Named("crm_customer", "9004", "海****")), named);
    }

    @Test
    void theAdministratorMayAsk() {
        // 管理员读得到整个账本：9005 是 9001 的行，管理员照样答得出。
        // The administrator reads the whole ledger: 9005 is 9001's row, and he is answered anyway.
        List<YudaoRecordNames.Named> named =
                directory.namesFor(1L, List.of(new YudaoRecordNames.Ref("crm_customer", 9005)));

        assertEquals(1, named.size(), "the administrator holds this read anyway: " + named);
    }

    @Test
    void theAuditReaderMayStillAskAboutAnyLedgerRow() {
        // 审计读者的口径不变：别人（9003）的行也答。
        // The audit reader's tier is unchanged: someone else's (9003's) row is answered too.
        List<YudaoRecordNames.Named> named =
                directory.namesFor(9002L, List.of(new YudaoRecordNames.Ref("crm_customer", 9006)));

        assertEquals(List.of(new YudaoRecordNames.Named("crm_customer", "9006", "中****")), named);
    }

    @Test
    void theLedgerKeyIsComparedAsTextSoAStrictServerStillAnswers() {
        // 真栈上这一腿曾经**谁都答不出**（2026-11-04 实测：管理员与审计读者都拿到空表）。`side_effects.result_id`
        // 自运行时 0.1.16 起是文本列，而以 `setLong` 交主键时 PostgreSQL 拒绝
        // `character varying = bigint` 这种比较；本类把那个错误收成「没有名字」，于是一条台账行也配不上名。
        // H2 的普通模式与 PostgreSQL 模式都会把文本列悄悄转成数字，看不见这个缺陷 —— 故这里用一个**在
        // `setLong` 上就拒绝**的数据源复现那种服务器的严格，断言这一腿照样答得出名字。
        //
        // On a real stack this leg answered **nobody** (measured 2026-11-04: the administrator and the audit
        // reader both got an empty list). `side_effects.result_id` is a text column since runtime 0.1.16, and
        // handing the key to JDBC as a `Long` makes PostgreSQL refuse the `character varying = bigint`
        // comparison; the class turns that error into "no name", so not one ledger row could be named. Both
        // H2 modes quietly convert the text column to a number and cannot see it, so this test hands the class
        // a data source that **refuses `setLong`** — the strict server, reproduced — and asserts the leg still
        // answers.
        YudaoRecordNames strict = new YudaoRecordNames(
                customers, mock(CrmFollowUpRecordMapper.class), mock(Demo01ContactMapper.class),
                mock(ProductsMapper.class), tools, refusesNumbers(dataSource), administrators, auditReaders);

        // 用普通调用方（9001）：属主条件与主键一样必须按文本绑，否则严格服务器上这一腿同样会空。
        // Ask as an ordinary caller (9001): the owner predicate must bind text like the key, or this leg goes
        // empty on the strict server too.
        List<YudaoRecordNames.Named> named =
                strict.namesFor(9001L, List.of(new YudaoRecordNames.Ref("crm_customer", 9005)));

        assertEquals(List.of(new YudaoRecordNames.Named("crm_customer", "9005", "万****")), named);
    }

    /**
     * 包一层数据源：凡 SQL 里出现 `side_effects` 的语句，`setLong` 一律抛错 —— 与 PostgreSQL 对
     * `character varying = bigint` 的拒绝同一个形状。
     *
     * Wraps the data source so that `setLong` on any statement naming `side_effects` throws — the same shape
     * as PostgreSQL refusing `character varying = bigint`.
     */
    private static DataSource refusesNumbers(DataSource underlying) {
        return (DataSource) Proxy.newProxyInstance(
                YudaoRecordNamesTest.class.getClassLoader(), new Class<?>[]{DataSource.class},
                (proxy, method, arguments) -> {
                    Object result = method.invoke(underlying, arguments);
                    if (result instanceof Connection connection) {
                        return Proxy.newProxyInstance(
                                YudaoRecordNamesTest.class.getClassLoader(), new Class<?>[]{Connection.class},
                                (connectionProxy, connectionMethod, connectionArguments) -> {
                                    Object made = connectionMethod.invoke(connection, connectionArguments);
                                    if (!(made instanceof PreparedStatement statement)) {
                                        return made;
                                    }
                                    String sql = connectionArguments != null && connectionArguments.length > 0
                                            ? String.valueOf(connectionArguments[0]) : "";
                                    return Proxy.newProxyInstance(
                                            YudaoRecordNamesTest.class.getClassLoader(),
                                            new Class<?>[]{PreparedStatement.class},
                                            (statementProxy, statementMethod, statementArguments) -> {
                                                // 绑一个数字给文本列，PG 就走不了；`setLong` 与
                                                // `setObject(…, Long)` 两条都算（Spring 用哪条随版本）。
                                                // A number bound to a text column is what PG refuses; both
                                                // `setLong` and `setObject(…, Long)` count (Spring's choice
                                                // varies by version).
                                                String name = statementMethod.getName();
                                                boolean bindsANumber = statementArguments != null
                                                        && statementArguments.length >= 2
                                                        && statementArguments[1] instanceof Number
                                                        && ("setLong".equals(name) || "setInt".equals(name)
                                                            || "setShort".equals(name) || "setByte".equals(name)
                                                            || "setObject".equals(name));
                                                if (bindsANumber && sql.contains("side_effects")) {
                                                    throw new SQLException(
                                                            "operator does not exist: character varying = bigint");
                                                }
                                                return statementMethod.invoke(statement, statementArguments);
                                            });
                                });
                    }
                    return result;
                });
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
