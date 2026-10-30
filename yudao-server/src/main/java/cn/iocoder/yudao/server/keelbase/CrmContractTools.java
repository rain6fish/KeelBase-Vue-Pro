// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.crm.controller.admin.contract.vo.contract.CrmContractPageReqVO;
import cn.iocoder.yudao.module.crm.controller.admin.contract.vo.contract.CrmContractSaveReqVO;
import cn.iocoder.yudao.module.crm.dal.dataobject.contract.CrmContractDO;
import cn.iocoder.yudao.module.crm.enums.common.CrmSceneTypeEnum;
import cn.iocoder.yudao.module.crm.service.contract.CrmContractService;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 合同的工具面：**读自己负责或参与的**，**写新建一份**。合同是「钱」那一类对象，故它的写走 R3 —— 引擎扣下等人。
 *
 * <p><b>为什么读要带场景（`D3` 丙 读宽）。</b>上游的分页**不带场景时一个条件都不加**（等于全部行），代码里那一段是
 * 空的。工具因此必须自己说要哪一档：默认「我负责的」，显式 `scope=involved` 时问「我参与的」—— 参加方在
 * `crm_permission` 里有一行、但不是负责人。两档合起来就是用户在页面上能看到的范围；`CrmContractGovernance` 在
 * AI 路径上把 null 场景补成「我负责的」，于是「没说要哪档」永远不会等于「全部」。
 *
 * <p><b>为什么写只给「新建」。</b>改、删、转移都是**对已有钱的对象动手**；AI 侧先只开一条有明确产出的写（新建一份
 * 合同），它与客户那条同形：入参声明、结果带 `id`、属主由切面盖章、调用方身份随 `ActingCaller` 传进去。
 *
 * <p><b>投影。</b>出去的是合同这条业务事实：编号、名称、客户、属主、审批状态、金额、下单日期。签字人、备注与产品明细
 * 不出去 —— 前两者不是「这份合同是什么」，后者是另一个对象。
 *
 * The contract tool face: read what the caller owns or takes part in, and create one. A contract is money, so its
 * write is R3 — the engine holds it for a person. The read must state its scene, because upstream's page adds **no
 * condition at all** when none is given (that branch is empty in its code): the tool asks for "mine" by default and
 * for "involved" when `scope=involved` is named, which together is what the user sees on the page. The write is
 * create-only for now; the shape is the customer tool's — declared parameters, an `id` in the result, the owner
 * stamped by the aspect, and the caller carried through `ActingCaller`.
 */
@Configuration
public class CrmContractTools {

    /** The permission code the REST path requires for the same write — the same vocabulary, not a second one. */
    private static final String CREATE_PERMISSION = "crm:contract:create";

    @Bean
    AiTool listCrmContracts(CrmContractService service) {
        return new ListTool(service);
    }

    @Bean
    ModuleRoute crmContractListRoute() {
        return new ListRoute();
    }

    @Bean
    AiTool createCrmContract(CrmContractService service, YudaoToolPermissions permissions) {
        return new CreateTool(service, permissions);
    }

    @Bean
    ModuleRoute crmContractCreateRoute() {
        return new CreateRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class ListTool implements AiTool {

        private final CrmContractService service;

        ListTool(CrmContractService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "list_crm_contracts";
        }

        @Override
        public String description() {
            return "List the contracts this host's own CRM module holds (read-only). Returns the rows the"
                    + " caller owns (default) or takes part in (`scope=involved`); signing details and line"
                    + " items are not projected.";
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
            CrmContractPageReqVO query = new CrmContractPageReqVO();
            query.setPageSize(50);
            query.setSceneType(involved ? CrmSceneTypeEnum.INVOLVED.getType() : CrmSceneTypeEnum.OWNER.getType());
            Long caller = asId(principal.userId());
            // The identity travels as the argument the module's own query takes, so the page is scoped by the module
            // rather than post-filtered here.
            // 身份以模块自己查询所取的入参传递，于是分页由模块收束，而不是在这里事后过滤。
            List<Map<String, Object>> rows = ActingCaller.as(principal.userId(),
                            () -> TenantUtils.execute(YudaoCallerTenant.current(),
                                    () -> service.getContractPage(query, caller))).getList().stream()
                    .map(ListTool::project)
                    .toList();
            return ToolResult.ok(rows);
        }

        /** The fields that leave this tool — a projection is where that decision is legible. */
        private static Map<String, Object> project(CrmContractDO row) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("id", row.getId());
            safe.put("no", row.getNo());
            safe.put("name", row.getName());
            safe.put("customerId", row.getCustomerId());
            safe.put("ownerUserId", row.getOwnerUserId());
            safe.put("auditStatus", row.getAuditStatus());
            safe.put("totalPrice", row.getTotalPrice());
            safe.put("orderDate", row.getOrderDate() == null ? null : row.getOrderDate().toString());
            return safe;
        }
    }

    static final class ListRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "list_crm_contracts";
        }

        @Override
        public List<String> triggers() {
            return List.of("列出合同", "合同列表", "CRM 合同", "看合同", "有哪些合同");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            return Map.of();
        }
    }

    /** R3 — a write: the engine holds it for a human before it runs. / R3——写：引擎扣下等人。 */
    static final class CreateTool implements AiTool {

        private final CrmContractService service;
        private final YudaoToolPermissions permissions;

        CreateTool(CrmContractService service, YudaoToolPermissions permissions) {
            this.service = service;
            this.permissions = permissions;
        }

        @Override
        public String name() {
            return "create_crm_contract";
        }

        @Override
        public String description() {
            return "Create a contract for a customer in the CRM module this host already ships. The engine"
                    + " holds the call for a human before it runs.";
        }

        @Override
        public String riskLevel() {
            return "R3";
        }

        @Override
        public String resultType() {
            return "crm_contract";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.required("name", ToolParameter.STRING, "合同名称"),
                    ToolParameter.required("customerId", ToolParameter.NUMBER, "客户编号（合同的关联客户）"),
                    ToolParameter.optional("totalPrice", ToolParameter.NUMBER, "合同金额"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            String refusal = permissions.refusal(principal.userId(), CREATE_PERMISSION);
            if (refusal != null) {
                return ToolResult.fail(refusal);
            }
            CrmContractSaveReqVO row = new CrmContractSaveReqVO();
            row.setName(str(args.get("name")));
            row.setCustomerId(asLong(args.get("customerId")));
            if (args.get("totalPrice") != null) {
                row.setTotalPrice(new BigDecimal(String.valueOf(args.get("totalPrice"))));
            }
            // The owner is not set here on purpose: CrmContractGovernance stamps it from the caller, the way it does
            // for the module's own REST path.
            // 属主**刻意不在这里设**：由 CrmContractGovernance 从调用方盖上去，与它对模块 REST 路径的做法相同。
            Long caller = asId(principal.userId());
            Long id = YudaoGovernedCall.write(principal.userId(), () -> service.createContract(row, caller));
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", id);
            return ToolResult.ok(out);
        }
    }

    static final class CreateRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "create_crm_contract";
        }

        @Override
        public List<String> triggers() {
            return List.of("新建合同", "创建合同", "签合同", "起草合同");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            if (context.get("targetId") != null) {
                args.put("customerId", context.get("targetId"));
            }
            if (context.get("message") instanceof String typed && !typed.isBlank()) {
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
