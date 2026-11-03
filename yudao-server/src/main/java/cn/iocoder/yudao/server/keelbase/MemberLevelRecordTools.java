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
import cn.iocoder.yudao.module.member.controller.admin.level.vo.record.MemberLevelRecordPageReqVO;
import cn.iocoder.yudao.module.member.dal.dataobject.level.MemberLevelRecordDO;
import cn.iocoder.yudao.module.member.service.level.MemberLevelRecordService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 会员模块在等级记录上的工具面：一个读，走粗闸。
 *
 * <p>与隔壁几个会员面同形：属主列是会员编号、调用方是管理员编号，故没有可做的属主收窄；
 * {@code requireAction(principal, "MemberLevelRecord", read)} 就是那道闸，而它比控制台的
 * {@code member:level-record:query} 更窄——通配只给超级管理员。
 *
 * <p>模块还有一个按记录 id 的读（{@code getLevelRecord}），本面**不用**它：记录 id 答的是「这是哪一行」，而这个面
 * 要答的是「这个会员的等级怎么变的」。按会员编号的分页才是对得上的那个。
 *
 * The member module's tool face over level records: one read, through the coarse gate.
 *
 * <p>Same shape as the neighbouring member faces: the owner column is a member id and the caller is an
 * administrator id, so there is no ownership narrowing to make; {@code requireAction(principal,
 * "MemberLevelRecord", read)} is the gate, and it is narrower than the console's
 * {@code member:level-record:query} because the wildcard goes to the super administrator only.
 *
 * <p>The module also exposes a read by record id ({@code getLevelRecord}), which is not used here: a
 * record id answers "which row is this", while the question this face serves is "how did this member's
 * level change". The page by member id is the one that matches.
 */
@Configuration
public class MemberLevelRecordTools {

    /** The entity name the coarse gate is asked about. / 粗闸据以作答的实体名。 */
    static final String SUBJECT = "MemberLevelRecord";

    static final int DEFAULT_LIMIT = 20;
    static final int MAX_LIMIT = 50;

    @Bean
    AiTool listMemberLevelRecords(MemberLevelRecordService service, OwnershipGuard guard) {
        return new ListTool(service, guard);
    }

    @Bean
    ModuleRoute memberLevelRecordRoute() {
        return new LevelRecordRoute();
    }

    /** The fields that leave this tool. / 离开本工具的那些字段。 */
    private static Map<String, Object> project(MemberLevelRecordDO record) {
        Map<String, Object> safe = new LinkedHashMap<>();
        safe.put("id", record.getId());
        safe.put("levelId", record.getLevelId());
        safe.put("level", record.getLevel());
        safe.put("discountPercent", record.getDiscountPercent());
        safe.put("experience", record.getExperience());
        safe.put("userExperience", record.getUserExperience());
        safe.put("description", record.getDescription());
        safe.put("remark", record.getRemark());
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

    /** R1 — one member's level records. / R1——一个会员的等级记录。 */
    static final class ListTool implements AiTool {

        private final MemberLevelRecordService service;
        private final OwnershipGuard guard;

        ListTool(MemberLevelRecordService service, OwnershipGuard guard) {
            this.service = service;
            this.guard = guard;
        }

        @Override
        public String name() {
            return "list_member_level_records";
        }

        @Override
        public String description() {
            return "List one member's level changes by member id (read-only), newest first. Returns at"
                    + " most " + MAX_LIMIT + " rows with the level, the discount, the experience change and"
                    + " the running total. A member id is required: an unfiltered page would be an export"
                    + " of every member's history, not a lookup.";
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

            MemberLevelRecordPageReqVO query = new MemberLevelRecordPageReqVO();
            query.setUserId(memberId);
            query.setPageNo(1);
            query.setPageSize(limit);

            PageResult<MemberLevelRecordDO> page = ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> service.getLevelRecordPage(query)));

            List<Map<String, Object>> rows = page.getList().stream()
                    .map(MemberLevelRecordTools::project)
                    .toList();
            Map<String, Object> answer = new LinkedHashMap<>();
            answer.put("count", rows.size());
            answer.put("records", rows);
            return ToolResult.ok(answer);
        }
    }

    /** The phrases this read answers to. / 本读所回答的短语。 */
    static final class LevelRecordRoute implements ModuleRoute {

        /** 「会员编号 / 会员号 / 会员」后面那个数字。 */
        private static final Pattern ID =
                Pattern.compile("会员(?:编号|号)?\\s*[=:：]?\\s*(\\d+)");

        @Override
        public String toolName() {
            return "list_member_level_records";
        }

        @Override
        public List<String> triggers() {
            return List.of("等级记录", "等级变动", "等级履历");
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
