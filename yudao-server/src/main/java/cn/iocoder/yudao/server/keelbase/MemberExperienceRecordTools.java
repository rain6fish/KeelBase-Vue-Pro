// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.authz.OwnershipGuard;
import cn.com.keelbase.runtime.authz.PermissionAuthorizer;
import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.member.controller.admin.level.vo.experience.MemberExperienceRecordPageReqVO;
import cn.iocoder.yudao.module.member.dal.dataobject.level.MemberExperienceRecordDO;
import cn.iocoder.yudao.module.member.service.level.MemberExperienceRecordService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 会员模块在经验记录上的工具面：一个读，走粗闸。
 *
 * <p>这是模块五个「记录型」对象里的最后一个。与它的兄弟同形：属主列是会员编号、调用方是管理员编号，故没有可做的
 * 属主收窄；{@code requireAction(principal, "MemberExperienceRecord", read)} 就是那道闸，而它比控制台的
 * {@code member:experience-record:query} 更窄——通配只给超级管理员。必须给会员编号：不筛的分页是导出，不是查询。
 *
 * <p>模块按记录 id 的读（{@code getExperienceRecord}）**刻意不用**，理由与等级面相同：记录 id 答的是「这是哪一行」，
 * 而这里要答的是「这个会员的经验怎么动的」。
 *
 * The member module's tool face over experience records: one read, through the coarse gate.
 *
 * <p>The last of the module's five "record" objects. Same shape as its siblings: the owner column is a
 * member id, the caller is an administrator id, so there is no ownership narrowing to make;
 * {@code requireAction(principal, "MemberExperienceRecord", read)} is the gate, and it is narrower than
 * the console's {@code member:experience-record:query} because the wildcard goes to the super
 * administrator only. A member id is required: an unfiltered page is an export, not a lookup.
 *
 * <p>The module's by-id read ({@code getExperienceRecord}) is deliberately not used, for the same reason
 * as on the level face: a record id answers "which row is this", while the question here is "how did this
 * member's experience move".
 */
@Configuration
public class MemberExperienceRecordTools {

    /** The entity name the coarse gate is asked about. / 粗闸据以作答的实体名。 */
    static final String SUBJECT = "MemberExperienceRecord";

    static final int DEFAULT_LIMIT = 20;
    static final int MAX_LIMIT = 50;

    @Bean
    AiTool listMemberExperienceRecords(MemberExperienceRecordService service, OwnershipGuard guard) {
        return new ListTool(service, guard);
    }

    @Bean
    ModuleRoute memberExperienceRecordRoute() {
        return new ExperienceRecordRoute();
    }

    /** The fields that leave this tool. / 离开本工具的那些字段。 */
    private static Map<String, Object> project(MemberExperienceRecordDO record) {
        Map<String, Object> safe = new LinkedHashMap<>();
        safe.put("id", record.getId());
        safe.put("bizId", record.getBizId());
        safe.put("bizType", record.getBizType());
        safe.put("title", record.getTitle());
        safe.put("description", record.getDescription());
        safe.put("experience", record.getExperience());
        safe.put("totalExperience", record.getTotalExperience());
        safe.put("createTime", String.valueOf(record.getCreateTime()));
        return safe;
    }

    private static Long asLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value == null) {
            return null;
        }
        try {
            return Long.valueOf(String.valueOf(value).trim());
        } catch (NumberFormatException notAnId) {
            return null;
        }
    }

    /** R1 — one member's experience records. / R1——一个会员的经验记录。 */
    static final class ListTool implements AiTool {

        private final MemberExperienceRecordService service;
        private final OwnershipGuard guard;

        ListTool(MemberExperienceRecordService service, OwnershipGuard guard) {
            this.service = service;
            this.guard = guard;
        }

        @Override
        public String name() {
            return "list_member_experience_records";
        }

        @Override
        public String description() {
            return "List one member's experience changes by member id (read-only), newest first. Returns"
                    + " at most " + MAX_LIMIT + " rows with the business type, the title, the change and the"
                    + " running total. A member id is required: an unfiltered page would be an export of"
                    + " every member's history, not a lookup.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.required("memberId", ToolParameter.NUMBER, "会员编号"),
                    ToolParameter.optional("limit", ToolParameter.NUMBER, "最多返回多少行，默认 20，上限 50"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            guard.requireAction(principal, SUBJECT, PermissionAuthorizer.ACTION_READ);
            Long memberId = asLong(args.get("memberId"));
            if (memberId == null) {
                return ToolResult.fail("memberId must be a number");
            }
            Long asked = asLong(args.get("limit"));
            int limit = asked == null ? DEFAULT_LIMIT : (int) Math.max(1, Math.min(MAX_LIMIT, asked));

            MemberExperienceRecordPageReqVO query = new MemberExperienceRecordPageReqVO();
            query.setUserId(memberId);
            query.setPageNo(1);
            query.setPageSize(limit);

            PageResult<MemberExperienceRecordDO> page = ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> service.getExperienceRecordPage(query)));

            List<Map<String, Object>> rows = page.getList().stream()
                    .map(MemberExperienceRecordTools::project)
                    .toList();
            Map<String, Object> answer = new LinkedHashMap<>();
            answer.put("count", rows.size());
            answer.put("records", rows);
            return ToolResult.ok(answer);
        }
    }

    /** The phrases this read answers to. / 本读所回答的短语。 */
    static final class ExperienceRecordRoute implements ModuleRoute {

        /** 「会员编号 / 会员号 / 会员」后面那个数字。 */
        private static final Pattern ID =
                Pattern.compile("会员(?:编号|号)?\\s*[=:：]?\\s*(\\d+)");

        @Override
        public String toolName() {
            return "list_member_experience_records";
        }

        @Override
        public List<String> triggers() {
            return List.of("经验记录", "经验明细", "经验变动");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            if (context.get("targetId") != null) {
                args.put("memberId", context.get("targetId"));
            }
            if (context.get("message") instanceof String typed && !typed.isBlank()) {
                Matcher matcher = ID.matcher(typed);
                if (matcher.find()) {
                    args.put("memberId", matcher.group(1));
                }
            }
            return args;
        }
    }
}
