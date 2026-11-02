// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.common.enums.CommonStatusEnum;
import cn.iocoder.yudao.framework.common.pojo.PageResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.system.controller.admin.notice.vo.NoticePageReqVO;
import cn.iocoder.yudao.module.system.controller.admin.notice.vo.NoticeSaveReqVO;
import cn.iocoder.yudao.module.system.dal.dataobject.notice.NoticeDO;
import cn.iocoder.yudao.module.system.service.notice.NoticeService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 系统模块的工具面，跑在公告（`system_notice`）上：**一个读、一个写**——M2 的第一个面。
 *
 * <p><b>读为什么不需要参数。</b>公告是广播：模块的分页本就只按标题与状态筛，而「有哪些公告」的默认答案就是全部
 * （最新的在前，取 20 条）。故这个读**没有任何参数**——不是省掉，而是这个对象没有「哪一部分」可问。
 *
 * <p><b>写为什么只有「新建」。</b>改、删一次公告都是对**已经发出去的**东西动手；AI 侧先只开一条有明确产出的写，
 * 与回款 / 回款计划同形：参数声明齐全、结果带 `id`、身份随 `ActingCaller` 走，而**权限由切面问**——
 * 这里不再问第二遍，因为 {@code SystemNoticeGovernance} 已经把工具路径与 REST 收到同一句权限判据上。
 *
 * <p><b>状态默认「开启」。</b>`NoticeSaveReqVO` 的 `status` 没有必填约束，而上游枚举里 `0` 是开启、`1` 是关闭。
 * 一条「发布公告」的意图是发布，故缺省给 `0`；要发草稿的调用方**显式**写 `状态=1`，而不是让缺省去猜。
 *
 * <p><b>投影。</b>出去的是公告这条业务事实：编号、标题、类型、状态、内容、创建时间。没有身份字段可掩——这也是本对象
 * 与管理面对象不同的一处，而原因是它本来就没有属主。
 *
 * The system module's tool face over notices ({@code system_notice}): **one read and one write** — M2's
 * first face.
 *
 * <p><b>Why the read takes no arguments.</b> A notice is a broadcast: the module's page only filters by
 * title and status, and the default answer to "what has been announced" is all of it (newest first,
 * twenty rows). So the read has **no parameters** — not by omission, but because this object has no
 * "which part" to ask for.
 *
 * <p><b>Why the write is create-only.</b> Updating or deleting a notice acts on something already sent;
 * the AI side opens one write with a clear product first, shaped like the receivable and receivable-plan
 * faces: declared parameters, an {@code id} in the result, the caller carried through {@code
 * ActingCaller}, and **the permission asked by the aspect** — not asked again here, because {@code
 * SystemNoticeGovernance} already holds the tool path and REST to the same permission question.
 *
 * <p><b>Status defaults to enabled.</b> {@code NoticeSaveReqVO.status} has no required constraint, and
 * upstream's enum is {@code 0} enabled, {@code 1} disabled. "Publish a notice" means publish, so the
 * default is {@code 0}; a caller that wants a draft says {@code 状态=1} rather than letting a default
 * guess.
 *
 * <p><b>Projection.</b> What leaves is the business fact: id, title, type, status, content and create
 * time. There is no identity field to mask — the other way this object differs from the admin-console
 * ones, and the reason is that it has no owner to begin with.
 */
@Configuration
public class SystemNoticeTools {

    /** Newest first, and small enough that a list stays a list. / 最新在前，且小到「列表」仍是列表。 */
    private static final int PAGE_SIZE = 20;

    @Bean
    AiTool listNotices(NoticeService service) {
        return new ListTool(service);
    }

    @Bean
    ModuleRoute noticeListRoute() {
        return new ListRoute();
    }

    @Bean
    AiTool createNotice(NoticeService service) {
        return new CreateTool(service);
    }

    @Bean
    ModuleRoute noticeCreateRoute() {
        return new CreateRoute();
    }

    /** The fields that leave this face. / 离开本面的那些字段。 */
    private static Map<String, Object> project(NoticeDO row) {
        Map<String, Object> safe = new LinkedHashMap<>();
        safe.put("id", row.getId());
        safe.put("title", row.getTitle());
        safe.put("type", row.getType());
        safe.put("status", row.getStatus());
        safe.put("content", row.getContent());
        safe.put("createTime", String.valueOf(row.getCreateTime()));
        return safe;
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class ListTool implements AiTool {

        private final NoticeService service;

        ListTool(NoticeService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "list_notices";
        }

        @Override
        public String description() {
            return "List the announcements this host's own system module holds, newest first (read-only)."
                    + " A notice is a broadcast, so there is no per-caller scope to apply.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            NoticePageReqVO query = new NoticePageReqVO();
            query.setPageSize(PAGE_SIZE);
            PageResult<NoticeDO> page = ActingCaller.as(principal.userId(),
                    () -> TenantUtils.execute(YudaoCallerTenant.current(),
                            () -> service.getNoticePage(query)));
            return ToolResult.ok(page.getList().stream().map(SystemNoticeTools::project).toList());
        }
    }

    /** The phrases this module's list answers to. / 本模块的列表所回答的短语。 */
    static final class ListRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "list_notices";
        }

        @Override
        public List<String> triggers() {
            return List.of("公告列表", "查看公告", "有哪些公告", "最新公告");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            return Map.of();
        }
    }

    /**
     * R3 — a write: the engine holds it for a human, and the aspect holds it to
     * {@code system:notice:create}. The result carries the new {@code id} because the engine records one
     * side effect per result and {@code side_effects.result_id} is NOT NULL.
     *
     * R3——写：引擎扣下等人，切面把它收到 `system:notice:create` 上。结果带新 `id`，因为引擎按结果记一条副作用、
     * 而 `side_effects.result_id` 是 NOT NULL。
     */
    static final class CreateTool implements AiTool {

        private final NoticeService service;

        CreateTool(NoticeService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "create_notice";
        }

        @Override
        public String description() {
            return "Publish one announcement through this host's own system module. The engine holds the"
                    + " call for a human before it runs, and the caller needs 'system:notice:create'.";
        }

        @Override
        public String riskLevel() {
            return "R3";
        }

        @Override
        public String resultType() {
            return "system_notice";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.required("title", ToolParameter.STRING, "公告标题"),
                    ToolParameter.required("type", ToolParameter.NUMBER, "公告类型（1 通知，2 公告）"),
                    ToolParameter.required("content", ToolParameter.STRING, "公告内容"),
                    ToolParameter.optional("status", ToolParameter.NUMBER,
                            "状态（0 开启/发布，1 关闭；缺省 0）"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            String title = str(args.get("title"));
            if (title == null || title.isBlank()) {
                return ToolResult.fail("title is required and must be text");
            }
            Integer type = asInt(args.get("type"));
            if (type == null) {
                return ToolResult.fail("type is required and must be a number (1 notice, 2 announcement)");
            }
            String content = str(args.get("content"));
            if (content == null || content.isBlank()) {
                return ToolResult.fail("content is required and must be text");
            }
            Integer status = asInt(args.get("status"));
            NoticeSaveReqVO row = new NoticeSaveReqVO();
            row.setTitle(title);
            row.setType(type);
            row.setContent(content);
            row.setStatus(status == null ? CommonStatusEnum.ENABLE.getStatus() : status);
            Long id = YudaoGovernedCall.write(principal.userId(), () -> service.createNotice(row));
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", id);
            return ToolResult.ok(out);
        }
    }

    /**
     * The phrases this module's write answers to, and the arguments it reads out of the caller's own
     * words. The engine refuses a proposal that omits a required parameter **before** a person is asked,
     * so all three required values have to be readable from the text — the same lesson the receivable
     * plan's route records.
     *
     * 本模块的写所回答的短语，以及它从调用方**自己的话**里读出的实参。引擎会在**人批准之前**就拒掉一份漏了必填项的
     * 提议，故三个必填值都必须能从文字里读出来——与回款计划那条路由记下的是同一课。
     */
    static final class CreateRoute implements ModuleRoute {

        // 键值对的形式，键是中文；标题与内容读到下一个键为止，故标题里可以有空格。
        // Key-value pairs with Chinese keys; title and content run until the next key, so a title may contain spaces.
        private static final Pattern TITLE =
                Pattern.compile("(?s)标题\\s*[=:：]\\s*(.+?)(?=\\s*(?:类型|内容|状态)\\s*[=:：]|$)");
        private static final Pattern TYPE = Pattern.compile("类型\\s*[=:：]?\\s*(\\d+)");
        private static final Pattern CONTENT =
                Pattern.compile("(?s)内容\\s*[=:：]\\s*(.+?)(?=\\s*状态\\s*[=:：]|$)");
        private static final Pattern STATUS = Pattern.compile("状态\\s*[=:：]?\\s*(\\d+)");

        @Override
        public String toolName() {
            return "create_notice";
        }

        @Override
        public List<String> triggers() {
            return List.of("发布公告", "发公告", "新增公告", "新建公告", "创建公告");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            if (context.get("message") instanceof String typed && !typed.isBlank()) {
                String title = match(typed, TITLE);
                if (!title.isBlank()) {
                    args.put("title", title.trim());
                }
                String type = match(typed, TYPE);
                if (!type.isBlank()) {
                    args.put("type", type);
                }
                String content = match(typed, CONTENT);
                if (!content.isBlank()) {
                    args.put("content", content.trim());
                }
                String status = match(typed, STATUS);
                if (!status.isBlank()) {
                    args.put("status", status);
                }
            }
            return args;
        }

        private static String match(String text, Pattern pattern) {
            Matcher matcher = pattern.matcher(text);
            return matcher.find() ? matcher.group(1) : "";
        }
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static Integer asInt(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value instanceof String text) {
            try {
                return Integer.valueOf(text.trim());
            } catch (NumberFormatException notANumber) {
                return null;
            }
        }
        return null;
    }
}
