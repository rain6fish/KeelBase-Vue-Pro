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
import cn.iocoder.yudao.module.member.controller.admin.signin.vo.record.MemberSignInRecordPageReqVO;
import cn.iocoder.yudao.module.member.dal.dataobject.signin.MemberSignInRecordDO;
import cn.iocoder.yudao.module.member.service.signin.MemberSignInRecordService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The member module's tool face over sign-in records: one read, through the coarse gate.
 *
 * <p>The owner column holds a member id while the caller is an administrator id, so no ownership
 * narrowing is possible; {@code requireAction(principal, "MemberSignInRecord", read)} is the whole gate,
 * and the face is narrower than the console's {@code point:sign-in-record:query} because today's rules
 * grant the wildcard only to the super administrator.
 *
 * <p>A member id is required. An unfiltered page would answer with every member's sign-in history in the
 * tenant, which is an export rather than the "how often did this member check in" question this face
 * answers.
 *
 * 会员模块在签到记录上的工具面：一个读，走粗闸。
 *
 * <p>属主列存的是会员编号、调用方是管理员编号，故属主收窄无从谈起；{@code requireAction(principal,
 * "MemberSignInRecord", read)} 就是全部，而本面比控制台的 {@code point:sign-in-record:query} 更窄——今天的规则只把
 * 通配授予超级管理员。
 *
 * <p>必须给会员编号。不筛的分页会答出本租户每个会员的签到史，那是一次导出，不是这个面要答的「这个会员签到了几次」。
 */
@Configuration
public class MemberSignInTools {

    /** The entity name the coarse gate is asked about. / 粗闸据以作答的实体名。 */
    static final String SUBJECT = "MemberSignInRecord";

    static final int DEFAULT_LIMIT = 20;
    static final int MAX_LIMIT = 50;

    @Bean
    AiTool listMemberSignInRecords(MemberSignInRecordService service, OwnershipGuard guard) {
        return new ListTool(service, guard);
    }

    @Bean
    ModuleRoute memberSignInRecordRoute() {
        return new SignInRecordRoute();
    }

    /** The fields that leave this tool. / 离开本工具的那些字段。 */
    private static Map<String, Object> project(MemberSignInRecordDO record) {
        Map<String, Object> safe = new LinkedHashMap<>();
        safe.put("id", record.getId());
        safe.put("day", record.getDay());
        safe.put("point", record.getPoint());
        safe.put("experience", record.getExperience());
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

    /** R1 — one member's sign-in records. / R1——一个会员的签到记录。 */
    static final class ListTool implements AiTool {

        private final MemberSignInRecordService service;
        private final OwnershipGuard guard;

        ListTool(MemberSignInRecordService service, OwnershipGuard guard) {
            this.service = service;
            this.guard = guard;
        }

        @Override
        public String name() {
            return "list_member_sign_in_records";
        }

        @Override
        public String description() {
            return "List one member's sign-in records by member id (read-only), newest first. Returns at"
                    + " most " + MAX_LIMIT + " rows with the consecutive day, the points and the experience"
                    + " each check-in earned. A member id is required: an unfiltered page would be an"
                    + " export of every member's history, not a lookup.";
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

            MemberSignInRecordPageReqVO query = new MemberSignInRecordPageReqVO();
            query.setUserId(memberId);
            query.setPageNo(1);
            query.setPageSize(limit);

            PageResult<MemberSignInRecordDO> page = ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> service.getSignInRecordPage(query)));

            List<Map<String, Object>> rows = page.getList().stream()
                    .map(MemberSignInTools::project)
                    .toList();
            Map<String, Object> answer = new LinkedHashMap<>();
            answer.put("count", rows.size());
            answer.put("records", rows);
            return ToolResult.ok(answer);
        }
    }

    /** The phrases this read answers to. / 本读所回答的短语。 */
    static final class SignInRecordRoute implements ModuleRoute {

        /** 「会员编号 / 会员号 / 会员」后面那个数字。 */
        private static final Pattern ID =
                Pattern.compile("会员(?:编号|号)?\\s*[=:：]?\\s*(\\d+)");

        @Override
        public String toolName() {
            return "list_member_sign_in_records";
        }

        @Override
        public List<String> triggers() {
            return List.of("签到记录", "签到明细", "签到历史");
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
