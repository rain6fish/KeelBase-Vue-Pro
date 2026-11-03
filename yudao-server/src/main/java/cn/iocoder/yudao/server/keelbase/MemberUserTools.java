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
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.member.dal.dataobject.user.MemberUserDO;
import cn.iocoder.yudao.module.member.service.user.MemberUserService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The member module's tool face, first batch: finding a member and reading one.
 *
 * <p><b>Why these two and not a record type.</b> Every other member question — points, sign-in, level
 * history — is asked <em>of a member</em>, so without a way to resolve the member first those tools
 * would have nothing to ask about. This is the anchor object.
 *
 * <p><b>What governs them: the coarse gate, and nothing else.</b> The owner column on the member tables
 * holds a <em>member</em> id; this host's caller is always an <em>administrator</em> id. The two
 * sequences are separate and collide, so pinning the page or the row to the acting caller would return
 * whichever member happens to carry the same number — not the caller's own row, and not nothing. That
 * is why there is no ownership advice here: {@code requireAction(principal, "MemberUser", read)} is the
 * whole gate, the same shape {@link ListYudaoUsersTool} already uses for rows that are not the caller's.
 *
 * <p><b>The narrowing, declared.</b> Today's rule source grants the wildcard only to this host's super
 * administrator, so these tools answer administrators and refuse everyone else — including a console
 * role that holds {@code member:user:query}. The tool face is therefore <b>narrower</b> than the
 * console, and that sentence is the point of publishing it.
 *
 * <p><b>Why a nickname is required to search.</b> The module's lookup passes a blank name through as
 * "no condition", which would hand every member in the tenant to the model. The search tool asks for a
 * term, and truncates what comes back.
 *
 * 会员模块的工具面，第一批：找会员、读一个会员。
 *
 * <p><b>为什么是这两个、而不是某个记录类型。</b>会员的其余问题——积分、签到、等级履历——都是**就某个会员**问的；
 * 不先解析出会员，那些工具就没有可问的对象。这是锚点对象。
 *
 * <p><b>治理它们的只有粗闸。</b>会员表上的属主列存的是**会员**编号；本宿主的调用方永远是**管理员**编号。两套序列
 * 相互独立、而且会撞号，故把分页或单行钉到行动调用方，只会交出**号码相同的那个会员**——既不是调用方自己的行，也不是
 * 空。这就是这里没有属主通知的原因：{@code requireAction(principal, "MemberUser", read)} 就是全部，
 * 与 {@link ListYudaoUsersTool} 对「不属于调用方的行」用的是同一个形状。
 *
 * <p><b>把收窄声明出来。</b>今天的规则源只把通配授予本宿主的超级管理员，故这些工具只答管理员、其余一律拒绝——包括
 * 一个持有 {@code member:user:query} 的控制台角色。**工具面因此比控制台更窄**，而这句话正是公开它的意义。
 *
 * <p><b>为什么搜索必须要一个昵称。</b>模块的查询把空名当作「不加条件」放过去，那会把整个租户的会员交给模型。搜索工具
 * 要一个词，并对回来的结果截断。
 */
@Configuration
public class MemberUserTools {

    /** The entity name the coarse gate is asked about. / 粗闸据以作答的实体名。 */
    static final String SUBJECT = "MemberUser";

    /** Enough to disambiguate a name; a search is not an export. / 够区分同名即可；搜索不是导出。 */
    static final int SEARCH_LIMIT = 20;

    @Bean
    AiTool findMembers(MemberUserService service, OwnershipGuard guard) {
        return new FindTool(service, guard);
    }

    @Bean
    ModuleRoute memberFindRoute() {
        return new FindRoute();
    }

    @Bean
    AiTool getMember(MemberUserService service, OwnershipGuard guard) {
        return new GetTool(service, guard);
    }

    @Bean
    ModuleRoute memberGetRoute() {
        return new GetRoute();
    }

    /**
     * The fields that leave this tool. Identity fields are dropped here rather than at the edge: mobile,
     * e-mail, the password hash and both IPs are what the console's red line keeps out of a projection.
     *
     * 离开本工具的那些字段。身份字段在**这里**去掉，而不是到边界才去：手机、邮箱、口令散列与两个 IP，正是控制台红线
     * 要求不进入投影的东西。
     */
    private static Map<String, Object> project(MemberUserDO member) {
        Map<String, Object> safe = new LinkedHashMap<>();
        safe.put("id", member.getId());
        safe.put("nickname", member.getNickname());
        safe.put("status", member.getStatus());
        safe.put("levelId", member.getLevelId());
        safe.put("groupId", member.getGroupId());
        safe.put("point", member.getPoint());
        safe.put("experience", member.getExperience());
        safe.put("createTime", String.valueOf(member.getCreateTime()));
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

    /** R1 — a search by nickname. / R1——按昵称搜索。 */
    static final class FindTool implements AiTool {

        private final MemberUserService service;
        private final OwnershipGuard guard;

        FindTool(MemberUserService service, OwnershipGuard guard) {
            this.service = service;
            this.guard = guard;
        }

        @Override
        public String name() {
            return "find_members";
        }

        @Override
        public String description() {
            return "Find members of this tenant by nickname (read-only). Returns at most " + SEARCH_LIMIT
                    + " rows with id, nickname, status, level, group, points and experience; contact"
                    + " fields are not projected.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.required("nickname", ToolParameter.STRING, "会员昵称（模糊匹配）"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            guard.requireAction(principal, SUBJECT, PermissionAuthorizer.ACTION_READ);
            Object raw = args.get("nickname");
            String nickname = raw == null ? "" : String.valueOf(raw).trim();
            if (nickname.isEmpty()) {
                // The module would read a blank name as "no condition" — every member in the tenant.
                // 模块会把空名读成「不加条件」——即本租户的每一个会员。
                return ToolResult.fail("a nickname to search for is required");
            }
            List<Map<String, Object>> rows = ActingCaller.as(principal.userId(),
                            () -> TenantUtils.execute(YudaoCallerTenant.current(),
                                    () -> service.getUserListByNickname(nickname))).stream()
                    .limit(SEARCH_LIMIT)
                    .map(MemberUserTools::project)
                    .toList();
            // A map rather than a bare list: the chat answer renders a result map field by field and
            // drops a list, so "how many matched" and "which ones" would otherwise be invisible.
            // 用一张表而不是裸列表：聊天答复会逐字段渲染一张结果表、却把列表丢掉，否则「命中几个」与「是哪些」
            // 都看不见。
            Map<String, Object> answer = new LinkedHashMap<>();
            answer.put("count", rows.size());
            answer.put("members", rows);
            return ToolResult.ok(answer);
        }
    }

    /** The phrases this search answers to. / 本次搜索所回答的短语。 */
    static final class FindRoute implements ModuleRoute {

        /** 「找会员 / 搜索会员 / 会员昵称」后面那个词——本宿主的路由只做确定性抽取，不是语义解析。 */
        private static final Pattern NAME =
                Pattern.compile("(?:找会员|搜索会员|会员昵称)\\s*[=:：]?\\s*(\\S+)");

        @Override
        public String toolName() {
            return "find_members";
        }

        @Override
        public List<String> triggers() {
            return List.of("找会员", "搜索会员", "会员昵称", "哪个会员", "哪些会员");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            if (context.get("message") instanceof String typed && !typed.isBlank()) {
                Matcher matcher = NAME.matcher(typed);
                if (matcher.find()) {
                    args.put("nickname", matcher.group(1));
                }
            }
            return args;
        }
    }

    /** R1 — one member by id. / R1——按 id 读一个会员。 */
    static final class GetTool implements AiTool {

        private final MemberUserService service;
        private final OwnershipGuard guard;

        GetTool(MemberUserService service, OwnershipGuard guard) {
            this.service = service;
            this.guard = guard;
        }

        @Override
        public String name() {
            return "get_member";
        }

        @Override
        public String description() {
            return "Read one member of this tenant by id (read-only). Returns points, level, group and"
                    + " experience; contact fields are not projected. A member that does not exist"
                    + " reads as a failure rather than as an empty row.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.required("memberId", ToolParameter.NUMBER, "会员编号"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            guard.requireAction(principal, SUBJECT, PermissionAuthorizer.ACTION_READ);
            Long id = asLong(args.get("memberId"));
            if (id == null) {
                return ToolResult.fail("memberId must be a number");
            }
            MemberUserDO member = ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(), () -> service.getUser(id)));
            if (member == null) {
                return ToolResult.fail("no such member in this tenant");
            }
            return ToolResult.ok(project(member));
        }
    }

    /** The phrases this by-id read answers to. / 本按 id 读所回答的短语。 */
    static final class GetRoute implements ModuleRoute {

        /** 「会员编号 / 会员号 / 会员」后面那个数字。 */
        private static final Pattern ID =
                Pattern.compile("(?:会员编号|会员号|会员)\\s*[=:：]?\\s*(\\d+)");

        @Override
        public String toolName() {
            return "get_member";
        }

        @Override
        public List<String> triggers() {
            return List.of("会员资料", "会员详情", "查一下会员", "看会员", "会员编号", "这个会员");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            // 运行时若已把这一轮点到的行解析出来，它走唯一的通用结构化槽位。
            // If the runtime already resolved the row this turn named, it arrives on the one generic structured slot.
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
