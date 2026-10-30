// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolRegistry;
import cn.iocoder.yudao.module.crm.dal.dataobject.customer.CrmCustomerDO;
import cn.iocoder.yudao.module.crm.dal.dataobject.followup.CrmFollowUpRecordDO;
import cn.iocoder.yudao.module.crm.dal.mysql.customer.CrmCustomerMapper;
import cn.iocoder.yudao.module.crm.dal.mysql.followup.CrmFollowUpRecordMapper;
import cn.iocoder.yudao.module.infra.dal.dataobject.demo.demo01.Demo01ContactDO;
import cn.iocoder.yudao.module.infra.dal.mysql.demo.demo01.Demo01ContactMapper;
import cn.iocoder.yudao.module.products.dal.dataobject.products.ProductsDO;
import cn.iocoder.yudao.module.products.dal.mysql.products.ProductsMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 把台账里的记录引用换成**这条记录叫什么**——**由服务端做这次联结**，审计读者的授予一条不动。
 *
 * <p>为什么需要它：审计行与写入台账只说得出「哪条记录」的一个类型加一个主键（`客户 · #9005`），记录自己的名字
 * 在宿主的业务表里，而控制台原先自己去问 `GET /crm/customer/get`——那条要 `crm:customer:query`，只挂
 * `audit_reader` 的账号拿不到，于是第三问只剩类型与主键（`YD-42` 的 C③）。这与 F-14（人名）是同一类缺口，治法也
 * 同一种：**把 id → 名字这次联结交给服务端，读者的授予不动**（用户 2026-10-27 裁定；本条 2026-10-30 按提案甲-1 批准）。
 *
 * <p><b>这不是一个名录。</b>本类只答**账本里出现过**的引用：
 *
 * <ul>
 *   <li>`side_effects` 记下的 `(result_type, result_id)`——一次真的写落在那条记录上；</li>
 *   <li>`confirmation_requests` 的 `args_json` 里带 `id` 的那次提议——一次被扣下或被拒的调用**原本要动**哪条
 *       记录（审计行本身不记它，这正是被拒那次此前答不出的原因）。</li>
 * </ul>
 *
 * <p>于是点查一个**从未进过账本**的 id 得到空表——它当不了枚举工具。名字**在服务端就掩码**（留首字符），
 * 故线缆上也拿不到原文；整条记录（手机、微信、跟进内容）**一个字段都不在这里流转**，这里也从不转发
 * `/crm/customer/get`。读不出来时**收窄**：查不到就是查不到，页面回落到类型与主键，与从前一样；从不抛错。
 *
 * <p><b>封闭表。</b>只答本宿主**认得名字**的结果类型，且它们都必须是补偿器认识的那几种（`YudaoLocalCompensators`
 * 与各模块 `*Governance` 的声明；`scripts/check-effect-target-existence.mjs` 钉着这条相等）。表外的类型不查、
 * 不答——编一个名字比缺一个更糟。
 *
 * <p><b>English</b>
 *
 * <p>Puts a name on a ledger's record reference, with **the server doing the join**, so no reader's grant
 * changes. An audit row and the write ledger say which record a write landed on — a type and a key — while
 * the record's own name lives in the host's business tables; the console used to ask
 * `GET /crm/customer/get`, which needs `crm:customer:query`, so an `audit_reader`-only account saw a type
 * and a key and nothing more (YD-42's C③). Same class of gap as F-14 (people's names), same remedy.
 *
 * <p>**This is not a directory.** It answers only references that appear in a ledger: `side_effects`
 * `(result_type, result_id)` for a write that really happened, and the `id` inside a
 * `confirmation_requests.args_json` proposal for a call that was held or refused (the audit row does not
 * record it — that is why the refused cell could not answer). Asking about an id that never entered a
 * ledger returns nothing. Names are **masked server-side** (first character kept), so the wire never
 * carries the record's text, no other field of the record is ever transferred, and `/crm/customer/get` is
 * never forwarded. A failed read narrows — no row simply means no name. It never throws.
 */
@Component
@Slf4j
public class YudaoRecordNames {

    /**
     * 一次最多认多少个引用。页面一屏用不了更多；上限让这条端点不可能被当成表来遍历。
     *
     * <p>The most references one call may ask about. A screen of the ledger needs fewer, and the cap keeps
     * this endpoint from being walked like a table.
     */
    static final int MAX_REFS = 100;

    /**
     * 被拒 / 被扣下那条的候选窗口：按最新在前读这么多次提议。更早的提议答不出名字——**收窄**，不是错答。
     *
     * <p>How many proposals the confirmation path reads, newest first. Older proposals get no name — that
     * is narrowing, not a wrong answer.
     */
    static final int PROPOSAL_WINDOW = 2000;

    /** 台账里的一个引用：记录类型加业务主键。 / One ledger reference: a result type and a business key. */
    public record Ref(String type, long id) {
    }

    /** 一条答复：这个引用叫什么（**已掩码**）。 / One answer: what that reference is called (**masked**). */
    public record Named(String type, String id, String name) {
    }

    /** 一个模块对「这条记录叫什么」的答复 —— 一次 mapper 读，不是重推。 / One module's answer, a mapper read. */
    @FunctionalInterface
    interface NameProbe {
        String name(long id);
    }

    private final Map<String, NameProbe> probes;
    private final ToolRegistry tools;
    private final DataSource dataSource;
    private final YudaoAdministrator administrators;
    private final YudaoAuditReaderRules auditReaders;

    /** 与 `YudaoCallerDirectory` 一样按需构建一个、全局复用 —— 不额外向容器要一个 `JdbcTemplate` bean。 */
    /** Built once on first use and reused, as `YudaoCallerDirectory` does. */
    private volatile JdbcTemplate jdbc;

    public YudaoRecordNames(CrmCustomerMapper customers,
                            CrmFollowUpRecordMapper followUps,
                            Demo01ContactMapper contacts,
                            ProductsMapper products,
                            ToolRegistry tools,
                            DataSource dataSource,
                            YudaoAdministrator administrators,
                            YudaoAuditReaderRules auditReaders) {
        Map<String, NameProbe> found = new LinkedHashMap<>();
        found.put("crm_customer", id -> {
            CrmCustomerDO row = customers.selectById(id);
            return row == null ? null : row.getName();
        });
        // 跟进记录没有标题，它自己的那一行文字就是它的名字；掩码之后与别处同一个口径。
        // A follow-up has no title: its own text is what identifies it, masked like everything else here.
        found.put("crm_follow_up_record", id -> {
            CrmFollowUpRecordDO row = followUps.selectById(id);
            return row == null ? null : row.getContent();
        });
        found.put("infra_demo01_contact", id -> {
            Demo01ContactDO row = contacts.selectById(id);
            return row == null ? null : row.getName();
        });
        found.put("products", id -> {
            ProductsDO row = products.selectById(id);
            return row == null ? null : row.getName();
        });
        this.probes = Map.copyOf(found);
        this.tools = tools;
        this.dataSource = dataSource;
        this.administrators = administrators;
        this.auditReaders = auditReaders;
    }

    /**
     * 这些引用里，这个调用方**可以**知道名字的那些。名字已掩码。
     *
     * <p>谁能问：管理员（他本来就读得到这些记录）与持有启用 `audit_reader` 的账号。**其余人得到空表**——
     * 不是拒绝，是收窄，与 `caller-names` 的 `alex` 那条实测同一口径。
     *
     * <p>能问谁：只在账本里出现过的那几个；类型还须在本类认得名字的表里。
     *
     * <p>id → name for those of {@code requested} this caller may name, already masked. Administrators and
     * enabled `audit_reader` holders may ask; everyone else gets an empty list — narrowing, not a refusal,
     * the same shape measured for `caller-names`. Only references that appear in a ledger, and only types
     * this class can name.
     */
    public List<Named> namesFor(Long callerId, List<Ref> requested) {
        if (callerId == null || requested == null || requested.isEmpty() || !mayAsk(callerId)) {
            return List.of();
        }
        Map<String, Ref> wanted = new LinkedHashMap<>();
        for (Ref ref : requested) {
            if (ref == null || ref.type() == null || !probes.containsKey(ref.type())) {
                continue;
            }
            wanted.putIfAbsent(ref.type() + "#" + ref.id(), ref);
            if (wanted.size() >= MAX_REFS) {
                break;
            }
        }
        if (wanted.isEmpty()) {
            return List.of();
        }
        Set<String> allowed = new LinkedHashSet<>(ledgerRefs(wanted));
        allowed.addAll(proposalRefs(wanted));
        List<Named> out = new ArrayList<>();
        for (Ref ref : wanted.values()) {
            if (!allowed.contains(ref.type() + "#" + ref.id())) {
                continue;
            }
            String name = mask(nameOf(ref));
            if (!name.isEmpty()) {
                out.add(new Named(ref.type(), String.valueOf(ref.id()), name));
            }
        }
        return out;
    }

    /** 管理员，或持有启用 `audit_reader` 的调用方。 / An administrator, or an enabled audit-reader holder. */
    private boolean mayAsk(long callerId) {
        return administrators.isAdmin(callerId) || auditReaders.isAuditReader(String.valueOf(callerId));
    }

    /** 那条记录的名字，未掩码；读不出来或没有名字时回空串。 / The record's name, unmasked; empty when unreadable. */
    private String nameOf(Ref ref) {
        try {
            String name = probes.get(ref.type()).name(ref.id());
            return name == null ? "" : name;
        } catch (RuntimeException unreadable) {
            // 读失败不是「没有名字」的证据，但这里能说的只有「这一次答不上」。
            // A failed read is not evidence of anything; the only honest answer here is "not this time".
            log.debug("[nameOf][记录({}#{})读不出来，本次不给名字]", ref.type(), ref.id(), unreadable);
            return "";
        }
    }

    /**
     * 这些引用里，写入台账点过名的那些。一条查询每类型；某类型读不出来只少那一批。
     *
     * <p>Which of these references the write ledger named. One query per type; a failed read drops only
     * that batch.
     */
    private Set<String> ledgerRefs(Map<String, Ref> wanted) {
        Set<String> found = new LinkedHashSet<>();
        for (Map.Entry<String, List<Long>> group : idsByType(wanted).entrySet()) {
            List<Long> ids = group.getValue();
            List<Object> params = new ArrayList<>();
            params.add(group.getKey());
            params.addAll(ids);
            try {
                List<Map<String, Object>> rows = jdbc().queryForList(
                        "select result_id from side_effects where result_type = ? and result_id in ("
                                + placeholders(ids.size()) + ")",
                        params.toArray());
                for (Map<String, Object> row : rows) {
                    Long id = asId(row.get("result_id"));
                    if (id != null) {
                        found.add(group.getKey() + "#" + id);
                    }
                }
            } catch (DataAccessException cannotRead) {
                log.debug("[ledgerRefs] 写入台账读不出来，本批跳过：{}", cannotRead.getMessage());
            }
        }
        return found;
    }

    /**
     * 这些引用里，确认记录点过名的那些 —— 被扣下或被拒的调用没有台账行，它的对象只在这里。
     *
     * <p>提议的参数是 JSON 文本，故读回来之后**在本类里解析**（不依赖某种数据库的 JSON 函数）；两行之间没有键，
     * 这里也不猜时间——只看「这次提议里 `id` 是不是它」。读的是最新的一窗（{@link #PROPOSAL_WINDOW}）。
     *
     * <p>工具到类型的映射取自工具**自己的声明**（`AiTool.resultType()`，经 `ToolRegistry`），不另抄一份表。
     *
     * <p>Which of these references a confirmation named — a held or refused call writes no ledger row, and
     * its object lives only here. The arguments are JSON text, so the match is parsed **in this class**
     * (no database-specific JSON function); there is no key between the two trails, so no timestamp is
     * guessed either — only "did this proposal carry that id". The newest window is read
     * ({@link #PROPOSAL_WINDOW}). The tool-to-type mapping comes from the tool's **own declaration**
     * (`AiTool.resultType()` through `ToolRegistry`); no second table is kept.
     */
    private Set<String> proposalRefs(Map<String, Ref> wanted) {
        Set<String> found = new LinkedHashSet<>();
        Map<String, List<Long>> byType = idsByType(wanted);
        Map<String, Set<String>> toolsByType = toolsByResultType();
        for (Map.Entry<String, List<Long>> group : byType.entrySet()) {
            List<String> toolNames = toolsByType.getOrDefault(group.getKey(), Set.of()).stream().toList();
            if (toolNames.isEmpty()) {
                continue;
            }
            try {
                List<Map<String, Object>> rows = jdbc().queryForList(
                        "select args_json from confirmation_requests where tool_name in ("
                                + placeholders(toolNames.size()) + ") order by id desc limit " + PROPOSAL_WINDOW,
                        toolNames.toArray());
                Set<Long> ids = new LinkedHashSet<>(group.getValue());
                for (Map<String, Object> row : rows) {
                    Long id = idIn(row.get("args_json"));
                    if (id != null && ids.contains(id)) {
                        found.add(group.getKey() + "#" + id);
                    }
                }
            } catch (DataAccessException cannotRead) {
                log.debug("[proposalRefs] 确认记录读不出来，本批跳过：{}", cannotRead.getMessage());
            }
        }
        return found;
    }

    /**
     * 被掩码的名字：**留首字符**、其余替换。空名字掩成空串（不是一串星号）——「本来就没有」与「有东西」分得开。
     *
     * <p>A masked name: the **first character** kept, the rest replaced. A blank name masks to an empty
     * string, so "there was nothing" and "there was something" stay apart.
     */
    static String mask(String text) {
        if (text == null || text.isBlank()) {
            return "";
        }
        int head = text.offsetByCodePoints(0, 1);
        return text.substring(0, head) + "****";
    }

    /** 请求里每种类型各自的 id 列表（保持请求次序）。 / The requested ids per type, in request order. */
    private static Map<String, List<Long>> idsByType(Map<String, Ref> wanted) {
        Map<String, List<Long>> byType = new LinkedHashMap<>();
        for (Ref ref : wanted.values()) {
            byType.computeIfAbsent(ref.type(), (type) -> new ArrayList<>()).add(ref.id());
        }
        return byType;
    }

    /** 工具自己声明的结果类型 → 工具名。 / Result type declared by each tool, mapped to its name. */
    private Map<String, Set<String>> toolsByResultType() {
        Map<String, Set<String>> byType = new LinkedHashMap<>();
        List<AiTool> catalogue;
        try {
            catalogue = tools.catalogue();
        } catch (RuntimeException unreadable) {
            log.debug("[toolsByResultType] 工具清单读不出来，确认记录那条路本批跳过：{}", unreadable.getMessage());
            return byType;
        }
        for (AiTool tool : catalogue == null ? List.<AiTool>of() : catalogue) {
            if (tool == null || tool.resultType() == null || tool.resultType().isBlank()) {
                continue;
            }
            byType.computeIfAbsent(tool.resultType(), (type) -> new LinkedHashSet<>()).add(tool.name());
        }
        return byType;
    }

    /** `?,?,?` —— 参数个数决定，不含任何外部输入。 / The placeholder list; only the count comes from input. */
    private static String placeholders(int count) {
        return java.util.stream.IntStream.range(0, count).mapToObj((i) -> "?").collect(Collectors.joining(","));
    }

    /** 一个 id 的两种到达形状（数字列或字符串列）。 / An id in either shape a column may hand back. */
    private static Long asId(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text) {
            try {
                return Long.valueOf(text.trim());
            } catch (NumberFormatException notAnId) {
                return null;
            }
        }
        return null;
    }

    /**
     * 一份提议参数里的 `id`。只认**恰好叫 `id`** 的那个键（`customerId` 之类不是它），值必须是十进制整数；
     * 找到就返回，找不到回 null。这一步是**精确**的：不靠模糊匹配，故不会把 90040 认成 9004。
     *
     * <p>The `id` inside a proposal's arguments. Only a key named exactly `id` counts, and its value must be
     * a decimal integer; this step is **exact**, so 90040 is never taken for 9004.
     */
    static Long idIn(Object argsJson) {
        if (argsJson == null) {
            return null;
        }
        String text = String.valueOf(argsJson);
        int at = text.indexOf("\"id\"");
        while (at >= 0) {
            int cursor = at + 4;
            while (cursor < text.length() && Character.isWhitespace(text.charAt(cursor))) {
                cursor++;
            }
            if (cursor < text.length() && text.charAt(cursor) == ':') {
                cursor++;
                while (cursor < text.length() && Character.isWhitespace(text.charAt(cursor))) {
                    cursor++;
                }
                int end = cursor;
                while (end < text.length() && Character.isDigit(text.charAt(end))) {
                    end++;
                }
                if (end > cursor) {
                    try {
                        return Long.valueOf(text.substring(cursor, end));
                    } catch (NumberFormatException tooLong) {
                        return null;
                    }
                }
            }
            at = text.indexOf("\"id\"", at + 4);
        }
        return null;
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
}
