// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.crm.controller.admin.contact.vo.CrmContactPageReqVO;
import cn.iocoder.yudao.module.crm.controller.admin.contact.vo.CrmContactSaveReqVO;
import cn.iocoder.yudao.module.crm.dal.dataobject.contact.CrmContactDO;
import cn.iocoder.yudao.module.crm.enums.common.CrmSceneTypeEnum;
import cn.iocoder.yudao.module.crm.service.contact.CrmContactService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 联系人的工具面：**读自己负责或参与的**，**写新建一位**。联系人挂着这条商业关系本身（谁在对谁说话），故它的写走
 * R3 —— 引擎扣下等人。
 *
 * <p><b>为什么读要带场景（`D3` 丙 读宽）。</b>上游的分页**不带场景时一个条件都不加**（等于全部行）。工具因此必须自己
 * 说要哪一档：默认「我负责的」，显式 `scope=involved` 时问「我参与的」。`CrmContactGovernance` 在 AI 路径上把 null
 * 场景补成「我负责的」，于是「没说要哪档」永远不会等于「全部」。
 *
 * <p><b>为什么写只给「新建一位」。</b>改、删、转移、跟进都是**对已有关系动手**；AI 侧先只开一条有明确产出的写，与合同、
 * 回款同形：入参声明齐全、结果带 `id`、属主由切面盖章、调用方身份随 `ActingCaller` 传进去。**客户也是必填**：联系人
 * 挂在一个客户下面，而切面会先问调用方读不读得到那个客户，再放行。
 *
 * <p><b>投影：联系方式一律不出去。</b>手机、电话、邮箱、QQ、微信、详细地址都不投影 —— 管理端红线是身份字段与联系方式
 * 输出时掩码/不投影。出去的是这条关系的业务事实：编号、姓名、客户、属主。上游联系人**没有状态列**，故这里也不编一个。
 *
 * The contact tool face: read what the caller owns or takes part in, and create one. A contact carries the
 * business relation itself, so its write is R3 — the engine holds it for a person. The read must state its scene,
 * because upstream's page adds **no condition at all** when none is given. The write is create-only for now and
 * shaped like the contract and receivable tools: declared parameters, an `id` in the result, the owner stamped by
 * the aspect, the caller carried through `ActingCaller`. The customer is required too, and the aspect first asks
 * whether the caller can read that customer. The projection drops every contact channel — mobile, telephone,
 * email, QQ, WeChat, address — per the admin console's red line; contacts have no status column upstream, so none
 * is invented here.
 */
@Configuration
public class CrmContactTools {

    /** The permission code the REST path requires for the same write — the same vocabulary, not a second one. */
    private static final String CREATE_PERMISSION = "crm:contact:create";

    @Bean
    AiTool listCrmContacts(CrmContactService service) {
        return new ListTool(service);
    }

    @Bean
    ModuleRoute crmContactListRoute() {
        return new ListRoute();
    }

    @Bean
    AiTool createCrmContact(CrmContactService service, YudaoToolPermissions permissions) {
        return new CreateTool(service, permissions);
    }

    @Bean
    ModuleRoute crmContactCreateRoute() {
        return new CreateRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class ListTool implements AiTool {

        private final CrmContactService service;

        ListTool(CrmContactService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "list_crm_contacts";
        }

        @Override
        public String description() {
            return "List the contacts this host's own CRM module holds (read-only). Returns the rows the"
                    + " caller owns (default) or takes part in (`scope=involved`); phone numbers, e-mail"
                    + " addresses and addresses are not projected.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.optional("scope", ToolParameter.STRING, "owner（默认，我负责的）或 involved（我参与的）"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            boolean involved = "involved".equalsIgnoreCase(String.valueOf(args.get("scope")));
            CrmContactPageReqVO query = new CrmContactPageReqVO();
            query.setPageSize(50);
            query.setSceneType(involved ? CrmSceneTypeEnum.INVOLVED.getType() : CrmSceneTypeEnum.OWNER.getType());
            Long caller = asId(principal.userId());
            // The identity travels as the argument the module's own query takes, so the page is scoped by the module
            // rather than post-filtered here.
            // 身份以模块自己查询所取的入参传递，于是分页由模块收束，而不是在这里事后过滤。
            List<Map<String, Object>> rows = ActingCaller.as(principal.userId(),
                            () -> TenantUtils.execute(YudaoCallerTenant.current(),
                                    () -> service.getContactPage(query, caller))).getList().stream()
                    .map(ListTool::project)
                    .toList();
            return ToolResult.ok(rows);
        }

        /** The fields that leave this tool — a projection is where that decision is legible. */
        private static Map<String, Object> project(CrmContactDO row) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("id", row.getId());
            safe.put("name", row.getName());
            safe.put("customerId", row.getCustomerId());
            safe.put("ownerUserId", row.getOwnerUserId());
            return safe;
        }
    }

    static final class ListRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "list_crm_contacts";
        }

        @Override
        public List<String> triggers() {
            return List.of("列出联系人", "联系人列表", "CRM 联系人", "看联系人", "有哪些联系人");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            return Map.of();
        }
    }

    /** R3 — a write: the engine holds it for a human before it runs. / R3——写：引擎扣下等人。 */
    static final class CreateTool implements AiTool {

        private final CrmContactService service;
        private final YudaoToolPermissions permissions;

        CreateTool(CrmContactService service, YudaoToolPermissions permissions) {
            this.service = service;
            this.permissions = permissions;
        }

        @Override
        public String name() {
            return "create_crm_contact";
        }

        @Override
        public String description() {
            return "Create a contact under a customer in the CRM module this host already ships. The engine"
                    + " holds the call for a human before it runs.";
        }

        @Override
        public String riskLevel() {
            return "R3";
        }

        @Override
        public String resultType() {
            return "crm_contact";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.required("name", ToolParameter.STRING, "联系人姓名"),
                    ToolParameter.required("customerId", ToolParameter.NUMBER, "客户编号（联系人所属的客户）"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            String refusal = permissions.refusal(principal.userId(), CREATE_PERMISSION);
            if (refusal != null) {
                return ToolResult.fail(refusal);
            }
            Long customerId = asLong(args.get("customerId"));
            if (customerId == null) {
                return ToolResult.fail("customerId is required and must be a number");
            }
            CrmContactSaveReqVO row = new CrmContactSaveReqVO();
            row.setName(str(args.get("name")));
            row.setCustomerId(customerId);
            // The owner is not set here on purpose: CrmContactGovernance stamps it from the caller. The contact's
            // permission row is opened from the second argument, and the same aspect asks first whether the caller
            // can read the customer named above.
            // 属主**刻意不在这里设**：由 CrmContactGovernance 从调用方盖上去；权限行按第二个入参开，同一个切面还会
            // 先问调用方读不读得到上面这个客户。
            Long caller = asId(principal.userId());
            Long id = YudaoGovernedCall.write(principal.userId(), () -> service.createContact(row, caller));
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", id);
            return ToolResult.ok(out);
        }
    }

    static final class CreateRoute implements ModuleRoute {

        /** The two required arguments, as a caller writes them. / 两个必填项在文字里的写法。 */
        private static final Pattern CUSTOMER_ID = Pattern.compile("客户(?:编号|号)?\\s*[=:：]?\\s*(\\d+)");
        private static final Pattern NAME = Pattern.compile("(?:姓名|名字)\\s*[=:：]?\\s*([^\\s，,。;；]+)");

        @Override
        public String toolName() {
            return "create_crm_contact";
        }

        @Override
        public List<String> triggers() {
            return List.of("新建联系人", "创建联系人", "新增联系人", "加联系人");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            // 两个必填项由这里从用户**明确写出的文字**里读出来 ——「新建联系人 客户=12 姓名=张三」。引擎会在**人批准
            // 之前**就拒掉一份漏了必填项的提议，故路由拿不到它们，这个工具就走不到人面前。
            // 会话那个结构化槽讲的是「目标」，不是「联系人挂在哪个客户下」；只有在文字里没写客户时才回落到它，并且
            // 回落这件事在这里写明、不藏。
            //
            // The two required arguments are read from what the caller wrote explicitly — "新建联系人 客户=12 姓名=张三".
            // The engine refuses a proposal missing them **before** a person is asked, so a route that cannot read
            // them never reaches a human. The chat's structured slot names a target, not the customer a contact hangs
            // from, so it is only a fallback when the text names no customer — and that fallback is stated here.
            Map<String, Object> args = new LinkedHashMap<>();
            if (context.get("message") instanceof String typed && !typed.isBlank()) {
                Long customerId = asLong(match(typed, CUSTOMER_ID));
                if (customerId != null) {
                    args.put("customerId", customerId);
                }
                String name = match(typed, NAME);
                if (!name.isBlank()) {
                    args.put("name", name);
                }
            }
            if (!args.containsKey("customerId") && context.get("targetId") != null) {
                args.put("customerId", context.get("targetId"));
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
