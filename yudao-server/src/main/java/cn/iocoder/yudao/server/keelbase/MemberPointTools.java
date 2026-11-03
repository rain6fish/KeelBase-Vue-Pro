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
import cn.iocoder.yudao.module.member.controller.admin.point.vo.recrod.MemberPointRecordPageReqVO;
import cn.iocoder.yudao.module.member.dal.dataobject.point.MemberPointRecordDO;
import cn.iocoder.yudao.module.member.service.point.MemberPointRecordService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 会员模块在积分记录上的工具面：一个读，走粗闸。
 *
 * <p><b>为什么必须要会员编号、且没有「列出全部」那种写法。</b>理由**不是**租户：框架的租户拦截器对这张表的查询
 * 同样会加 {@code tenant_id}（真栈实测——即使这个 DO 继承的是普通审计基类，那一列也必须存在）。理由是**不筛的分页
 * 是一次导出、不是一次查询**：它会答出本租户**每一个会员**的记录，那是另一种能力，不是「这个会员挣了什么」。
 * 故本面只答「这个会员的记录」，没有会员编号就不跑。
 *
 * <p><b>治理它的是什么。</b>与隔壁会员面相同：属主列存的是**会员**编号，而调用方是管理员编号，故属主收窄无从谈起，
 * {@code requireAction(principal, "MemberPointRecord", read)} 就是全部。今天的规则只把通配授予超级管理员，
 * 故本面比控制台的 {@code point:record:query} 更窄。
 *
 * The member module's tool face over point records: one read, through the coarse gate.
 *
 * <p><b>Why a member id is required and there is no "list everything" variant.</b> Tenancy is not the
 * reason: the framework's tenant interceptor adds {@code tenant_id} to this table's queries too (measured
 * on the real stack, even though the DO extends the plain audit base — the column has to exist). The
 * reason is that an unfiltered page is an <b>export, not a lookup</b>: it would answer with every member's
 * records in the tenant, which is a different capability from "what did this member earn". This face
 * therefore only answers "this member's records" and refuses to run without a member id.
 *
 * <p><b>What governs it.</b> Same as the member face next door: the owner column holds a <em>member</em>
 * id while the caller is an administrator id, so no ownership narrowing is possible and
 * {@code requireAction(principal, "MemberPointRecord", read)} is the whole gate. Today's rules grant the
 * wildcard only to the super administrator, so this face is narrower than the console's
 * {@code point:record:query}.
 */
@Configuration
public class MemberPointTools {

    /** The entity name the coarse gate is asked about. / 粗闸据以作答的实体名。 */
    static final String SUBJECT = "MemberPointRecord";

    /** Default and ceiling for one answer. / 一次答复的默认行数与上限。 */
    static final int DEFAULT_LIMIT = 20;
    static final int MAX_LIMIT = 50;

    @Bean
    AiTool listMemberPointRecords(MemberPointRecordService service, OwnershipGuard guard) {
        return new ListTool(service, guard);
    }

    @Bean
    ModuleRoute memberPointRecordRoute() {
        return new PointRecordRoute();
    }

    /** The fields that leave this tool. There is no identity field on a point record to drop. */
    private static Map<String, Object> project(MemberPointRecordDO record) {
        Map<String, Object> safe = new LinkedHashMap<>();
        safe.put("id", record.getId());
        safe.put("bizId", record.getBizId());
        safe.put("bizType", record.getBizType());
        safe.put("title", record.getTitle());
        safe.put("description", record.getDescription());
        safe.put("point", record.getPoint());
        safe.put("totalPoint", record.getTotalPoint());
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

    /** R1 — one member's point records. / R1——一个会员的积分记录。 */
    static final class ListTool implements AiTool {

        private final MemberPointRecordService service;
        private final OwnershipGuard guard;

        ListTool(MemberPointRecordService service, OwnershipGuard guard) {
            this.service = service;
            this.guard = guard;
        }

        @Override
        public String name() {
            return "list_member_point_records";
        }

        @Override
        public String description() {
            return "List one member's point records by member id (read-only), newest first. Returns at"
                    + " most " + MAX_LIMIT + " rows with the business type, title, the change and the"
                    + " running total. A member id is required: an unfiltered page would be an export of"
                    + " every member's records, not a lookup.";
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

            MemberPointRecordPageReqVO query = new MemberPointRecordPageReqVO();
            query.setUserId(memberId);
            query.setPageNo(1);
            query.setPageSize(limit);

            PageResult<MemberPointRecordDO> page = ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> service.getPointRecordPage(query)));

            List<Map<String, Object>> rows = page.getList().stream()
                    .map(MemberPointTools::project)
                    .toList();
            Map<String, Object> answer = new LinkedHashMap<>();
            answer.put("count", rows.size());
            answer.put("records", rows);
            return ToolResult.ok(answer);
        }
    }

    /** The phrases this read answers to. / 本读所回答的短语。 */
    static final class PointRecordRoute implements ModuleRoute {

        /** 「会员编号 / 会员号 / 会员」后面那个数字。 */
        private static final Pattern ID =
                Pattern.compile("会员(?:编号|号)?\\s*[=:：]?\\s*(\\d+)");

        @Override
        public String toolName() {
            return "list_member_point_records";
        }

        @Override
        public List<String> triggers() {
            return List.of("积分记录", "积分明细", "积分变动", "积分流水");
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
