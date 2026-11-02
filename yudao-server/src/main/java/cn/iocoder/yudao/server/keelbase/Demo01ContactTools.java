// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.infra.controller.admin.demo.demo01.vo.Demo01ContactPageReqVO;
import cn.iocoder.yudao.module.infra.controller.admin.demo.demo01.vo.Demo01ContactSaveReqVO;
import cn.iocoder.yudao.module.infra.dal.dataobject.demo.demo01.Demo01ContactDO;
import cn.iocoder.yudao.module.infra.service.demo.demo01.Demo01ContactService;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * The tool face over the infra module's demo contact: one read, a create and a rename, each with its
 * route. It is the third module delivered against the recipe and the first that is neither CRM nor FMS,
 * so what it tests is whether the recipe's per-module half survives a module with no owner column and
 * no module-specific permission table of its own.
 *
 * <p><b>The read is narrowed by the advice, not here.</b> The page VO has no caller filter to set, so
 * this face asks the module's own page query and lets {@link Demo01ContactGovernance} keep the caller's
 * rows. The projection is the second half of that decision: name, sex and description leave; the audit
 * string {@code creator} does not, because it is the identity seam rather than business content.
 *
 * <p><b>The create's name comes from what the user typed.</b> The chat request declares one structured
 * slot ({@code targetId}) and no free-form argument map, so the route takes a {@code name} from the
 * context when a caller supplies one and otherwise uses the message itself — the same placeholder the
 * generated products face uses. The create result carries {@code id}, because the engine's side-effect
 * ledger requires one.
 *
 * <p><b>The rename is the refused path.</b> It takes the row id from {@code targetId} and is held for a
 * human; a row outside the caller's scope is refused after approval by the aspect, with the same reason
 * the other modules use. Its result type is the same {@code infra_demo01_contact} as the create, and the
 * host's compensator will undo a create but refuse a rename — this runtime records no before-snapshot.
 *
 * infra 模块示例联系人上的工具面：一读、一建、一改名，各配路由。这是照 recipe 交付的第三个模块，也是第一个
 * 既非 CRM、也非 FMS 的模块；它检验的是：**一个没有属主列、也没有自己的权限表的模块，recipe 的逐模块那一半
 * 还站得住吗。**
 *
 * <p><b>读由通知收窄，不在这里。</b>分页 VO 没有可设的调用方筛选位，故本面只问模块自己的分页查询，由
 * {@link Demo01ContactGovernance} 留下调用方的行。投影是那个决定的另一半：名字、性别、简介出去；审计串
 * `creator` 不出去——它是身份缝，不是业务内容。
 *
 * <p><b>创建的名字取自用户所写。</b>聊天请求只声明一个结构化槽位（`targetId`），没有自由参数 map，故路由在
 * 上下文给了 `name` 时取它、否则把消息本身当名字——与生成的 products 面同一个占位法。创建结果必带 `id`，
 * 因为引擎的副作用台账要求它。
 *
 * <p><b>改名是那条会被拒的路。</b>行 id 取自 `targetId`，写被扣下等人；范围之外的行在批准之后仍由切面拒绝，
 * 理由与其它模块同一条。它的结果类型与创建同为 `infra_demo01_contact`；宿主的补偿器会撤销一次创建、但拒绝
 * 撤销一次改名——本运行时**不记 before 快照**。
 */
@Configuration
public class Demo01ContactTools implements GovernedPath {

    /** A tool face on this host's registry. / 本宿主登记处上的一个工具面。 */
    @Override
    public Kind kind() {
        return Kind.TOOL;
    }

    @Bean
    AiTool listMyDemoContacts(Demo01ContactService service) {
        return new ListTool(service);
    }

    @Bean
    AiTool createDemo01Contact(Demo01ContactService service) {
        return new CreateTool(service);
    }

    @Bean
    AiTool renameDemo01Contact(Demo01ContactService service) {
        return new RenameTool(service);
    }

    @Bean
    ModuleRoute demoContactListRoute() {
        return new ListRoute();
    }

    @Bean
    ModuleRoute demoContactCreateRoute() {
        return new CreateRoute();
    }

    @Bean
    ModuleRoute demoContactRenameRoute() {
        return new RenameRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class ListTool implements AiTool {

        private final Demo01ContactService service;

        ListTool(Demo01ContactService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "list_my_demo_contacts";
        }

        @Override
        public String description() {
            return "List the demo contacts the infra module holds for the caller (read-only)."
                    + " Only rows whose audit creator is the caller are returned.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Demo01ContactPageReqVO query = new Demo01ContactPageReqVO();
            query.setPageSize(100);
            List<Map<String, Object>> rows = ActingCaller.as(principal.userId(),
                            () -> TenantUtils.execute(YudaoCallerTenant.current(),
                                    () -> service.getDemo01ContactPage(query))).getList().stream()
                    .map(ListTool::project)
                    .toList();
            return ToolResult.ok(rows);
        }

        /** What leaves this tool: business fields only, not the audit string. / 离开本工具的字段：只有业务字段，不含审计串。 */
        private static Map<String, Object> project(Demo01ContactDO row) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("id", row.getId());
            safe.put("name", row.getName());
            safe.put("sex", row.getSex());
            safe.put("description", row.getDescription());
            return safe;
        }
    }

    /** The phrases this module's read answers to. / 本模块读所回答的短语。 */
    static final class ListRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "list_my_demo_contacts";
        }

        @Override
        public List<String> triggers() {
            // 「我的联系人」独占：手写的 `CrmContactTools` 也认「联系人列表」，路由按 bean 顺序先命中它。
            // "我的联系人" is exclusive: the hand-written `CrmContactTools` also claims 联系人列表,
            // and routing takes the first matching bean.
            return List.of("看我的联系人", "我的联系人", "我的联系人清单", "列联系人");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            return Map.of();
        }
    }

    /** R3 — a create: held for a human, and the result carries the new row's id. / R3——创建：扣下等人，结果带新行 id。 */
    static final class CreateTool implements AiTool {

        private final Demo01ContactService service;

        CreateTool(Demo01ContactService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "create_demo01_contact";
        }

        @Override
        public String description() {
            return "Create a demo contact through the infra module this host already ships. The engine"
                    + " holds the call for a human before it runs.";
        }

        @Override
        public String riskLevel() {
            return "R3";
        }

        @Override
        public String resultType() {
            return "infra_demo01_contact";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.required("name", ToolParameter.STRING, "联系人名字"),
                    ToolParameter.optional("description", ToolParameter.STRING, "简介"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Demo01ContactSaveReqVO request = new Demo01ContactSaveReqVO();
            request.setName(str(args.get("name")));
            request.setDescription(args.get("description") == null
                    ? "created by tool" : str(args.get("description")));
            request.setSex(1);
            request.setBirthday(LocalDateTime.now());
            Long id = YudaoGovernedCall.write(principal.userId(),
                    () -> service.createDemo01Contact(request));
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", id);
            out.put("name", request.getName());
            return ToolResult.ok(out);
        }
    }

    static final class CreateRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "create_demo01_contact";
        }

        @Override
        public List<String> triggers() {
            // 「示例」是独占标记：`CrmContactTools` 的同名写触发词会按 bean 顺序先命中。
            // "示例" is the marker that keeps these phrases out of `CrmContactTools`' same-named triggers.
            return List.of("新建示例联系人", "创建示例联系人", "新增示例联系人");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            if (context.get("name") != null) {
                args.put("name", context.get("name"));
            }
            // The same placeholder the generated products face uses: the typed message names the row
            // when nothing structured arrived. / 与生成的 products 面同一个占位：没有结构化参数时，消息本身就是名字。
            if (args.get("name") == null && context.get("message") instanceof String typed && !typed.isBlank()) {
                args.put("name", typed);
            }
            return args;
        }
    }

    /** R3 — a rename by id: held for a human, and another's row is refused after approval. / R3——按 id 改名：扣下等人，别人的行批准后仍拒。 */
    static final class RenameTool implements AiTool {

        private final Demo01ContactService service;

        RenameTool(Demo01ContactService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "rename_demo01_contact";
        }

        @Override
        public String description() {
            return "Rename a demo contact in the infra module this host already ships. The engine holds"
                    + " the call for a human; a row outside the caller's scope is refused even after"
                    + " approval.";
        }

        @Override
        public String riskLevel() {
            return "R3";
        }

        @Override
        public String resultType() {
            return "infra_demo01_contact";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.required("id", ToolParameter.NUMBER, "联系人编号"),
                    ToolParameter.optional("name", ToolParameter.STRING, "新名字"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Long id = asLong(args.get("id"));
            Demo01ContactSaveReqVO request = new Demo01ContactSaveReqVO();
            request.setId(id);
            request.setName(args.get("name") == null ? "renamed" : str(args.get("name")));
            request.setSex(1);
            request.setBirthday(LocalDateTime.now());
            request.setDescription("renamed by tool");
            YudaoGovernedCall.write(principal.userId(), () -> {
                service.updateDemo01Contact(request);
                return null;
            });
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", id);
            out.put("name", request.getName());
            return ToolResult.ok(out);
        }
    }

    static final class RenameRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "rename_demo01_contact";
        }

        @Override
        public List<String> triggers() {
            return List.of("重命名联系人", "改联系人名字", "修改联系人");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            if (context.get("targetId") != null) {
                args.put("id", context.get("targetId"));
            }
            if (context.get("name") != null) {
                args.put("name", context.get("name"));
            } else if (context.get("message") instanceof String typed && !typed.isBlank()) {
                args.put("name", typed);
            }
            return args;
        }
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
    }

    private static Long asLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text) {
            try {
                return Long.valueOf(text.trim());
            } catch (NumberFormatException notANumber) {
                return null;
            }
        }
        return null;
    }
}
