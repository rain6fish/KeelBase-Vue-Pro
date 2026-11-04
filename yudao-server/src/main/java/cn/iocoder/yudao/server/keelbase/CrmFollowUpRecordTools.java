// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.crm.dal.dataobject.followup.CrmFollowUpRecordDO;
import cn.iocoder.yudao.module.crm.service.followup.CrmFollowUpRecordService;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * CRM 跟进记录的工具面：**只有一读**（调用方自己业务行下的一条记录，按记录编号点名），没有写。
 *
 * <p><b>为什么参数是记录编号，而不是「谁的记录」。</b>跟进记录行的属主不在这一行上，它只有 {@code biz_type} +
 * {@code biz_id}；让模型报一个人的编号去问记录，就是把「这是他业务行下的」变成「这是编号 42 的」。调用方报出它本来就
 * 知道的东西（跟进记录里那个编号），工具拿它去换一行；属主由 {@link CrmFollowUpRecordGovernance} 沿业务行走一跳、在
 * 工具路径上判定：不是调用方的行与不存在的行得到同一个答案。
 *
 * <p><b>为什么读得到一条、却列不出一页。</b>「这个客户跟进了什么」要一页，而分页的过滤位是业务行、不是属主位——那正是
 * 本切面在工具路径上拒绝它、而不是事后删行的理由。本面因此只开按编号读一条；要列表，等模块自己给出一条按调用方范围
 * 收窄的分页口。
 *
 * <p><b>投影。</b>出去的是这一条记录说了什么：编号、它挂在哪个业务行（{@code bizType} / {@code bizId}）、跟进方式、
 * 内容、下次联系时间、创建时间。身份（{@code creator} / {@code updater}）不出去——身份是问题的主语，不是答案的字段；
 * 附件与关联的联系人 / 商机编号也不出去：它们是**指向别的行**的指针，而那些行读不读得到，这个工具没有判过。
 *
 * <p>CRM's tool face over follow-up records: **one read only** (one record under a business row the caller may read,
 * named by its record id), no write.
 *
 * <p><b>Why the parameter is a record id, not "whose record".</b> The row does not carry its owner — only
 * {@code biz_type} + {@code biz_id}. Letting the model name a user id would turn "this hangs under his business row"
 * into "this is number 42's". The caller names something it already knows, and the tool turns it into one row; the owner
 * is decided by {@link CrmFollowUpRecordGovernance} one hop away on the tool path, so another's row and a missing row get
 * the same answer.
 *
 * <p><b>Why it can read one but not list a page.</b> "What did we say about this customer" needs a page, and the page's
 * filter is the business row rather than an owner slot — exactly why the aspect refuses it on the tool path instead of
 * deleting rows afterwards. This face therefore offers the read by id only.
 *
 * <p><b>Projection.</b> What leaves is what the record says, plus its business anchor and times. Identity
 * ({@code creator} / {@code updater}) stays in, and so do attachments and linked contact / business ids: those are
 * pointers to other rows, and whether those rows are readable is not this tool's decision.
 */
@Configuration
public class CrmFollowUpRecordTools {

    @Bean
    AiTool getCrmFollowUpRecord(CrmFollowUpRecordService service) {
        return new RecordReadTool(service);
    }

    @Bean
    ModuleRoute getCrmFollowUpRecordRoute() {
        return new RecordRoute();
    }

    /** R1——读：无需确认、无可撤销。 / R1 — a read: no confirmation, nothing to revoke. */
    static final class RecordReadTool implements AiTool {

        private final CrmFollowUpRecordService service;

        RecordReadTool(CrmFollowUpRecordService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "get_crm_followup_record";
        }

        @Override
        public String description() {
            return "Read one CRM follow-up record of the caller's (read-only), named by its record id. The record is"
                    + " answered only when the business row it hangs on (customer / business / clue / contact /"
                    + " contract) is readable by the caller; otherwise the answer is the same as for a record that"
                    + " does not exist.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.optional("recordId", ToolParameter.STRING, "跟进记录编号（跟进记录里的整数编号）"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Long caller = asId(principal.userId());
            if (caller == null) {
                return ToolResult.fail("there is no local caller to ask about");
            }
            Long id = asId(str(args.get("recordId")));
            if (id == null) {
                return ToolResult.fail("give a follow-up record id (recordId)");
            }
            return ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> run(id)));
        }

        private ToolResult run(Long id) {
            CrmFollowUpRecordDO record = service.getFollowUpRecord(id);
            if (record == null) {
                // 别人的记录与不存在的记录在这里同一个答案——这正是本接缝的可证伪面。
                // Another's record and a missing record give the same answer here — the seam's falsifiable face.
                return ToolResult.ok(Map.of("hasRecord", false));
            }
            return ToolResult.ok(project(record));
        }

        /** 出去的那些字段——投影就是这个决定可读的地方。 Fields that leave this face — the projection is where the decision is legible. */
        private static Map<String, Object> project(CrmFollowUpRecordDO record) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("hasRecord", true);
            safe.put("recordId", record.getId());
            safe.put("bizType", record.getBizType());
            safe.put("bizId", record.getBizId());
            safe.put("type", record.getType());
            safe.put("content", record.getContent());
            safe.put("nextTime", record.getNextTime() == null
                    ? null : record.getNextTime().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            safe.put("createTime", record.getCreateTime() == null
                    ? null : record.getCreateTime().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
            return safe;
        }
    }

    /**
     * 本模块读所回答的短语。刻意**避开**既有写面的触发词（`跟进记录` / `记一条跟进` / `记录跟进` / `建一条跟进记录`）：
     * 路由按声明顺序取第一个「消息包含其触发词」的路由，而 `contains` 会让一个短词吃掉包含它的长词。故这里的短语不含
     * 那四个中的任何一个，读与写不会互相抢。
     *
     * The phrases this module's read answers to. They deliberately steer clear of the write face's triggers
     * (`跟进记录` / `记一条跟进` / `记录跟进` / `建一条跟进记录`): routes are taken in declaration order with
     * {@code contains}, so a short trigger swallows any longer one that includes it.
     */
    static final class RecordRoute implements ModuleRoute {

        /** 「跟进 / 跟进单 / 跟进记录（内容/情况）」后面那个整数编号——本宿主的路由只做确定性抽取，不是语义解析。 */
        private static final Pattern IDENTIFIER =
                Pattern.compile("(?:跟进记录|跟进单|跟进)(?:内容|情况)?\\s*[=:：]?\\s*(\\d{1,19})");

        @Override
        public String toolName() {
            return "get_crm_followup_record";
        }

        @Override
        public List<String> triggers() {
            return List.of("查一条跟进", "这条跟进", "看看这条跟进", "跟进内容", "跟进说了什么", "上次跟进",
                    "跟进情况");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            // 运行时若已把这一轮点到的行解析出来，它走唯一的通用结构化槽位。
            // If the runtime already resolved the row this turn named, it arrives on the one generic structured slot.
            if (context.get("targetId") != null) {
                args.put("recordId", context.get("targetId"));
            }
            if (context.get("message") instanceof String typed && !typed.isBlank()) {
                Matcher matcher = IDENTIFIER.matcher(typed);
                if (matcher.find()) {
                    args.put("recordId", matcher.group(1));
                }
            }
            return args;
        }
    }

    private static String str(Object value) {
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    private static Long asId(String value) {
        if (value == null) {
            return null;
        }
        try {
            return Long.valueOf(value);
        } catch (NumberFormatException notAnId) {
            return null;
        }
    }
}
