// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.common.util.validation.ValidationUtils;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.crm.controller.admin.clue.vo.CrmCluePageReqVO;
import cn.iocoder.yudao.module.crm.controller.admin.clue.vo.CrmClueSaveReqVO;
import cn.iocoder.yudao.module.crm.dal.dataobject.clue.CrmClueDO;
import cn.iocoder.yudao.module.crm.enums.common.CrmSceneTypeEnum;
import cn.iocoder.yudao.module.crm.service.clue.CrmClueService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 线索的工具面：**读自己负责或参与的**，**写新建一条**。线索是「钱」的上游（它转化成客户，客户才生合同与回款），
 * 故它的写同样走 R3 —— 引擎扣下等人。
 *
 * <p><b>为什么读要带场景（`D3` 丙 读宽）。</b>上游的分页**不带场景时一个条件都不加**（等于全部行）。工具因此必须自己
 * 说要哪一档：默认「我负责的」，显式 `scope=involved` 时问「我参与的」—— 参与方在 `crm_permission` 里有一行、但
 * 不是负责人。`CrmClueGovernance` 在 AI 路径上把 null 场景补成「我负责的」，于是「没说要哪档」永远不会等于「全部」。
 *
 * <p><b>为什么写只给「新建一条」。</b>改、删、转移、转化（转化成客户）都是**对已有行动手**；AI 侧先只开一条有明确产出的
 * 写，与客户、合同、回款那条同形：入参声明齐全、结果带 `id`、属主由切面盖章、调用方身份随 `ActingCaller` 传进去。
 *
 * <p><b>投影。</b>出去的是线索这条业务事实：编号、名称、属主、转化状态与转化出的客户、跟进状态与两次联系时间、行业、
 * 等级、来源。联系方式（手机 / 电话 / QQ / 微信 / 邮箱）**不出去** —— 管理端那条红线：身份字段输出时掩码，这里连
 * 掩码都不发。
 *
 * <p>The clue tool face: read what the caller owns or takes part in, and create one. A clue sits upstream of money (it
 * becomes a customer, and the customer begets contracts and receivables), so its write is R3 — the engine holds it for
 * a person. The read must state its scene, because upstream's page adds **no condition at all** when none is given:
 * the tool asks for "mine" by default and for "involved" when `scope=involved` is named. The write is create-only for
 * now, shaped like the other CRM tools: declared parameters, an `id` in the result, the owner stamped by the aspect,
 * the caller carried through `ActingCaller`. The projection leaves the contact fields out entirely — the admin
 * console's red line masks identity fields on the way out; here they are not sent at all.
 */
@Configuration
public class CrmClueTools {

    /** The permission code the REST path requires for the same write — the same vocabulary, not a second one. */
    private static final String CREATE_PERMISSION = "crm:clue:create";

    @Bean
    AiTool listCrmClues(CrmClueService service) {
        return new ListTool(service);
    }

    @Bean
    ModuleRoute crmClueListRoute() {
        return new ListRoute();
    }

    @Bean
    AiTool createCrmClue(CrmClueService service, YudaoToolPermissions permissions) {
        return new CreateTool(service, permissions);
    }

    @Bean
    ModuleRoute crmClueCreateRoute() {
        return new CreateRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class ListTool implements AiTool {

        private final CrmClueService service;

        ListTool(CrmClueService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "list_crm_clues";
        }

        @Override
        public String description() {
            return "List the clues this host's own CRM module holds (read-only). Returns the rows the caller"
                    + " owns (default) or takes part in (`scope=involved`); contact fields are not projected.";
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
            CrmCluePageReqVO query = new CrmCluePageReqVO();
            query.setPageSize(50);
            query.setSceneType(involved ? CrmSceneTypeEnum.INVOLVED.getType() : CrmSceneTypeEnum.OWNER.getType());
            Long caller = asId(principal.userId());
            // The identity travels as the argument the module's own query takes, so the page is scoped by the module
            // rather than post-filtered here.
            // 身份以模块自己查询所取的入参传递，于是分页由模块收束，而不是在这里事后过滤。
            List<Map<String, Object>> rows = ActingCaller.as(principal.userId(),
                            () -> TenantUtils.execute(YudaoCallerTenant.current(),
                                    () -> service.getCluePage(query, caller))).getList().stream()
                    .map(ListTool::project)
                    .toList();
            return ToolResult.ok(rows);
        }

        /** The fields that leave this tool — a projection is where that decision is legible. */
        private static Map<String, Object> project(CrmClueDO row) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("id", row.getId());
            safe.put("name", row.getName());
            safe.put("ownerUserId", row.getOwnerUserId());
            safe.put("transformStatus", row.getTransformStatus());
            safe.put("customerId", row.getCustomerId());
            safe.put("followUpStatus", row.getFollowUpStatus());
            safe.put("contactLastTime", row.getContactLastTime() == null ? null : row.getContactLastTime().toString());
            safe.put("contactNextTime", row.getContactNextTime() == null ? null : row.getContactNextTime().toString());
            safe.put("industryId", row.getIndustryId());
            safe.put("level", row.getLevel());
            safe.put("source", row.getSource());
            return safe;
        }
    }

    static final class ListRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "list_crm_clues";
        }

        @Override
        public List<String> triggers() {
            return List.of("列出线索", "线索列表", "CRM 线索", "看线索", "有哪些线索");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            return Map.of();
        }
    }

    /** R3 — a write: the engine holds it for a human before it runs. / R3——写：引擎扣下等人。 */
    static final class CreateTool implements AiTool {

        private final CrmClueService service;
        private final YudaoToolPermissions permissions;

        CreateTool(CrmClueService service, YudaoToolPermissions permissions) {
            this.service = service;
            this.permissions = permissions;
        }

        @Override
        public String name() {
            return "create_crm_clue";
        }

        @Override
        public String description() {
            return "Create a lead (clue) in the CRM module this host already ships. The engine holds the call"
                    + " for a human before it runs.";
        }

        @Override
        public String riskLevel() {
            return "R3";
        }

        @Override
        public String resultType() {
            return "crm_clue";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.required("name", ToolParameter.STRING, "线索名称"),
                    ToolParameter.optional("mobile", ToolParameter.STRING, "手机号（11 位手机号）"),
                    ToolParameter.optional("remark", ToolParameter.STRING, "备注"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            String refusal = permissions.refusal(principal.userId(), CREATE_PERMISSION);
            if (refusal != null) {
                return ToolResult.fail(refusal);
            }
            String name = str(args.get("name"));
            if (name == null || name.isBlank()) {
                return ToolResult.fail("name is required");
            }
            String mobile = str(args.get("mobile"));
            // 手机号的格式由上游的 `@Mobile` 在服务端校验，而那道校验在**人批准之后**才跑。同一份判据在这里先问一遍：
            // 不合格式就当场拒绝，不让人批准一次注定被 bean 校验打回的写。
            //
            // Upstream's `@Mobile` checks this format on the server, **after** a person has approved the call. The
            // same predicate is asked here first, so a malformed number is refused now instead of after approval.
            if (mobile != null && !mobile.isBlank() && !ValidationUtils.isMobile(mobile.trim())) {
                return ToolResult.fail("mobile must be an 11-digit mobile number");
            }
            CrmClueSaveReqVO row = new CrmClueSaveReqVO();
            row.setName(name.trim());
            row.setMobile(mobile);
            row.setRemark(str(args.get("remark")));
            // The owner is not set here on purpose: CrmClueGovernance stamps it from the caller, before the
            // server-side bean validation that declares `ownerUserId` required.
            // 属主**刻意不在这里设**：由 CrmClueGovernance 从调用方盖上去，且发生在「`ownerUserId` 必填」的服务端
            // bean 校验之前。
            Long id = YudaoGovernedCall.write(principal.userId(), () -> service.createClue(row));
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", id);
            return ToolResult.ok(out);
        }
    }

    static final class CreateRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "create_crm_clue";
        }

        @Override
        public List<String> triggers() {
            return List.of("新建线索", "创建线索", "录入线索", "登记线索", "加线索");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            // `name` 是这条写唯一的必填项，也是引擎在**人批准之前**就据以拒掉一份提议的那一项（漏了它，提议到不了
            // 人面前）。会话的结构化槽讲的是「目标」、不是线索名称，故不从它取；用户在文字里写下的就是名称——
            // 与合同那条同一种读法。
            //
            // `name` is this write's only required argument, and the one the engine refuses a proposal over
            // **before** a person sees it. The chat's structured slot names a target, not a clue name, so it is not
            // read here; what the caller typed is the name — the same reading the contract tool uses.
            Map<String, Object> args = new LinkedHashMap<>();
            if (context.get("message") instanceof String typed && !typed.isBlank()) {
                args.put("name", typed.trim());
            }
            return args;
        }
    }

    private static String str(Object value) {
        return value == null ? null : String.valueOf(value);
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
