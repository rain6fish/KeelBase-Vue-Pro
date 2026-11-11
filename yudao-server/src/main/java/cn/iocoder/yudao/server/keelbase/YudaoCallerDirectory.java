// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * 把台账里的调用方 id 换成姓名——**由服务端做这次联结**，读者不必再拿宿主的用户查询权限。
 *
 * <p>运行时的审计行只带 `userId`（就是本宿主 `system_users.id`）；控制台原先自己去问
 * `GET /system/user/list` 配名，而那个端点要 `system:user:query`，审计读者与 M7 读者都没有 ⇒ 页面上只剩
 * 一串数字（M7 第三位读者场 F-14）。用户 2026-10-27 裁定走「服务端联名」：由宿主把 id 换成姓名，
 * **不改读者的任何授予**。
 *
 * <p><b>这个名字不是名录。</b>本类只对**这个调用方本来就能在台账里遇到的人**作答：
 *
 * <ul>
 *   <li>调用方**自己**——任何已登录用户都可以知道自己的名字；</li>
 *   <li>持有启用的 `audit_reader` 角色时，**账本里出现过的**调用方——`ai_audit_logs.user_id`（运行时那条
 *       审计链）、`system_operate_log.user_id`（宿主自己的操作审计）与 `keelbase_bypass_log.caller_id`
 *       （上游 REST 写的旁路留痕）的并集，且限同一租户；</li>
 *   <li>本宿主的管理员（{@link YudaoAdministrator} 认的那一位）与审计读者**同一范围**——最常打开审计页的
 *       正是管理员，而过去只有读者读得出姓名、管理员看到的是裸 id（2026-11-08 走查 G-3）。</li>
 * </ul>
 *
 * <p>于是这条端点**当不了名录用**：它答不出一个从未在台账里出现过的 id，也答不出别的租户的人。读不出来时
 * **收窄**——查不到就是查不到，页面回落到 id，与从前一样；从不抛错。
 *
 * <p>English:
 *
 * <p>Puts a name on a ledger's caller id, with **the server doing the join**, so a reader no longer needs
 * the host's user-query permission.
 *
 * <p>A runtime audit row carries only `userId` (this host's `system_users.id`). The console used to name
 * callers itself through `GET /system/user/list`, which needs `system:user:query` — neither the audit
 * reader nor the M7 reader has it, so the page showed bare numbers (finding F-14, M7's third reader
 * session). On 2026-10-27 the user chose the server-side join: the host resolves the name, and **no
 * grant of any reader changes**.
 *
 * <p><b>This is not a directory.</b> The class answers only for people the caller could already meet in
 * the ledger: the caller themselves (any signed-in user may know their own name), and — when the caller
 * holds an enabled `audit_reader` role — the callers that appear in `ai_audit_logs.user_id` (the
 * runtime's audit chain) or `system_operate_log.user_id` (the host's own operation audit) or
 * `keelbase_bypass_log.caller_id` (the upstream REST write trail), within the same tenant. The host's
 * administrator (the one {@link YudaoAdministrator} answers for) gets that same range: the administrator
 * is the person who opens the audit page most, yet used to see bare ids where the reader saw names (G-3,
 * measured 2026-11-08). The endpoint therefore cannot be used as a directory: it will not name an id that
 * never appeared in a ledger, nor anyone in another tenant. A failed read narrows — no row simply means no
 * name, and the page falls back to the id exactly as before. It never throws.
 */
@Component
@Slf4j
public class YudaoCallerDirectory {

    /**
     * 一次最多认多少个 id。一页台账用不了更多；上限让这条端点不可能被当成名录遍历。
     *
     * <p>The most ids one call may ask about. A page of the ledger needs fewer, and the cap keeps this
     * endpoint from being walked like a directory.
     */
    static final int MAX_IDS = 100;

    private final DataSource dataSource;
    private final YudaoAuditReaderRules auditReaders;
    private final YudaoAdministrator administrators;

    /** 与 `Ai1RagTool` 一样按需构建一个、全局复用 —— 不额外向容器要一个 `JdbcTemplate` bean。 */
    /** Built once on first use and reused, as `Ai1RagTool` does — no separate `JdbcTemplate` bean. */
    private volatile JdbcTemplate jdbc;

    public YudaoCallerDirectory(DataSource dataSource, YudaoAuditReaderRules auditReaders,
                                YudaoAdministrator administrators) {
        this.dataSource = dataSource;
        this.auditReaders = auditReaders;
        this.administrators = administrators;
    }

    /**
     * 这个调用方**可以**知道名字的那些 id → 姓名。键是 id 的字符串形式（与运行时的 wire 形状一致）。
     *
     * <p>id → name for those of {@code requested} this caller may name. Keys are the ids as strings,
     * matching the runtime's wire shape.
     */
    public Map<String, String> namesFor(Long callerId, List<Long> requested) {
        Map<String, String> out = new LinkedHashMap<>();
        if (callerId == null || requested == null || requested.isEmpty()) {
            return out;
        }
        List<Long> ids = requested.stream()
                .filter(Objects::nonNull)
                .filter((id) -> id > 0)
                .distinct()
                .limit(MAX_IDS)
                .collect(Collectors.toList());
        if (ids.isEmpty()) {
            return out;
        }
        long tenantId = YudaoCallerTenant.current();

        Set<Long> allowed = new LinkedHashSet<>();
        if (ids.contains(callerId)) {
            allowed.add(callerId);
        }
        // 管理员与审计读者同一范围：账本里出现过的人。最常打开审计页的正是管理员，而过去只有读者读得出
        // 姓名、管理员看到的是裸 id（G-3）。这一条只决定「能认出谁」，不是一份名录。
        // An administrator gets the same range as an audit reader: the people who appear in a ledger. The
        // administrator opens the audit page most, yet used to see bare ids where the reader saw names
        // (G-3). This decides whom it may name, not a directory.
        if (auditReaders.isAuditReader(String.valueOf(callerId)) || administrators.isAdmin(callerId)) {
            allowed.addAll(ledgerCallers(ids, tenantId));
        }
        allowed.retainAll(ids);
        if (allowed.isEmpty()) {
            return out;
        }
        return namesOf(allowed, tenantId);
    }

    /**
     * 这些 id 里，**在账本里出现过**的那些。两条查询各自失败时只是少一批人——从不让整次请求失败。
     *
     * <p>Which of these ids appear in a ledger. Each query failing only drops its own batch; it never
     * fails the whole request.
     */
    private List<Long> ledgerCallers(List<Long> ids, long tenantId) {
        List<Long> found = new ArrayList<>();
        String placeholders = ids.stream().map((id) -> "?").collect(Collectors.joining(","));
        Object[] asStrings = ids.stream().map(String::valueOf).toArray();
        try {
            List<String> callers = jdbc().queryForList(
                    "select distinct user_id from ai_audit_logs where user_id in (" + placeholders + ")",
                    String.class, asStrings);
            for (String caller : callers) {
                found.add(Long.valueOf(caller));
            }
        } catch (DataAccessException | NumberFormatException cannotRead) {
            log.debug("[ledgerCallers] 审计链里读不出调用方，本批跳过：{}", cannotRead.getMessage());
        }
        Object[] asNumbers = ids.toArray();
        List<Object> params = new ArrayList<>();
        params.add(tenantId);
        params.addAll(List.of(asNumbers));
        try {
            List<Number> callers = jdbc().queryForList(
                    "select distinct user_id from system_operate_log"
                            + " where tenant_id = ? and deleted = 0 and user_id in (" + placeholders + ")",
                    Number.class, params.toArray());
            for (Number caller : callers) {
                found.add(caller.longValue());
            }
        } catch (DataAccessException cannotRead) {
            log.debug("[ledgerCallers] 操作审计里读不出操作者，本批跳过：{}", cannotRead.getMessage());
        }
        // 旁路留痕也是一本账：一次上游 REST 写在那里留下一行，写明是谁发的。它是**第三本**，不与上面两本合并
        // 成一行 —— 只在这条「能不能叫出名字」的问题上取并集：读者能在这张表里遇到的人，就该能在这里读到名字，
        // 否则边界页上那列只剩一串数字。
        //
        // The bypass trail is a ledger too: an upstream REST write leaves a row there naming who sent it. It is
        // a **third** ledger and is never merged into the other two as one row — only unified for this one
        // question, "may this caller be named": whoever a reader can meet in that table should be nameable
        // here, or the boundary page's column is back to bare numbers.
        try {
            List<Number> callers = jdbc().queryForList(
                    "select distinct caller_id from keelbase_bypass_log"
                            + " where tenant_id = ? and caller_id in (" + placeholders + ")",
                    Number.class, params.toArray());
            for (Number caller : callers) {
                found.add(caller.longValue());
            }
        } catch (DataAccessException cannotRead) {
            log.debug("[ledgerCallers] 旁路留痕里读不出调用方，本批跳过：{}", cannotRead.getMessage());
        }
        return found;
    }

    /** 姓名取自宿主自己的用户表：`nickname` 优先，其次 `username`。 / from the host's own user table. */
    private Map<String, String> namesOf(Set<Long> allowed, long tenantId) {
        Map<String, String> out = new LinkedHashMap<>();
        String placeholders = allowed.stream().map((id) -> "?").collect(Collectors.joining(","));
        List<Object> params = new ArrayList<>();
        params.add(tenantId);
        params.addAll(allowed);
        List<Map<String, Object>> rows;
        try {
            rows = jdbc().queryForList(
                    "select id, nickname, username from system_users"
                            + " where tenant_id = ? and deleted = 0 and id in (" + placeholders + ")",
                    params.toArray());
        } catch (DataAccessException cannotRead) {
            log.debug("[namesOf] 用户表读不出来，本次不给名字：{}", cannotRead.getMessage());
            return out;
        }
        for (Map<String, Object> row : rows) {
            Object id = row.get("id");
            Object nickname = row.get("nickname");
            Object username = row.get("username");
            String name = nickname != null && !String.valueOf(nickname).isBlank()
                    ? String.valueOf(nickname)
                    : (username != null ? String.valueOf(username) : null);
            if (id != null && name != null && !name.isBlank()) {
                out.put(String.valueOf(id), name);
            }
        }
        return out;
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
