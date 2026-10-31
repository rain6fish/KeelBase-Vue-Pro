// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.crm.controller.admin.business.vo.business.CrmBusinessPageReqVO;
import cn.iocoder.yudao.module.crm.controller.admin.business.vo.business.CrmBusinessSaveReqVO;
import cn.iocoder.yudao.module.crm.dal.dataobject.business.CrmBusinessDO;
import cn.iocoder.yudao.module.crm.enums.common.CrmSceneTypeEnum;
import cn.iocoder.yudao.module.crm.service.business.CrmBusinessService;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 商机的工具面：**读自己负责或参与的**，**写新建一条**。商机是「钱」那一类对象，故它的写走 R3 —— 引擎扣下等人。
 *
 * <p><b>为什么读要带场景（`D3` 丙 读宽）。</b>上游的分页**不带场景时一个条件都不加**（等于全部行）。工具因此必须
 * 自己说要哪一档：默认「我负责的」，显式 `scope=involved` 时问「我参与的」—— 参与方在 `crm_permission` 里有一行、
 * 但不是负责人。`CrmBusinessGovernance` 在 AI 路径上把 null 场景补成「我负责的」，于是「没说要哪档」永远不会等于
 * 「全部」。
 *
 * <p><b>为什么写只给「新建一条」。</b>改、删、转移、阶段流转都是**对已有钱的对象动手**；AI 侧先只开一条有明确产出的
 * 写，与合同、回款同形：入参声明、结果带 `id`、属主由切面盖章、调用方身份随 `ActingCaller` 传进去。
 *
 * <p><b>三个必填项一个都不能少，且路由要能从文字里读出来。</b>保存 VO 把 `name`、`customerId`、`statusTypeId`
 * 都声明为 `@NotNull`；`discountPercent` 也是必填，但它是「怎么算价」、不是「这条商机是什么」，工具替调用方取零
 * （与合同那条对折扣的做法相同）。缺了前三个，服务端 bean 校验会在**人批准之后**拒绝这次写；而路由若交不出它们，
 * 引擎会在**人批准之前**就以 `invalid_arguments` 拒掉提议 —— 两次都是这一类的实测缺陷，故路由把
 * 「客户=12 状态组=1 名称=大单」读成入参。
 *
 * <p><b>投影。</b>出去的是商机这条业务事实：编号、名称、客户、属主、状态组、状态、结束状态、预计成交日期、金额。
 * 产品明细与备注不出去 —— 前者是另一个对象，后者不是「这条商机是什么」。
 *
 * The business tool face: read what the caller owns or takes part in, and create one. A business is money, so
 * its write is R3 — the engine holds it for a person. The read must state its scene, because upstream's page
 * adds **no condition at all** when none is given: the tool asks for "mine" by default and for "involved" when
 * `scope=involved` is named. The write is create-only for now, shaped like the contract and receivable tools.
 * Three arguments are required and none may be assumed: the save VO declares `name`, `customerId` and
 * `statusTypeId` `@NotNull`, and the tool route reads them out of what the caller typed — an omitted required
 * argument is refused **before** a person is asked, while one missing from the bean is refused **after**
 * approval. `discountPercent` is required by the VO too, but it is how the price is computed rather than what
 * the business is, so the tool supplies zero, as the contract tool does.
 */
@Configuration
public class CrmBusinessTools {

    /** The permission code the REST path requires for the same write — the same vocabulary, not a second one. */
    private static final String CREATE_PERMISSION = "crm:business:create";

    @Bean
    AiTool listCrmBusinesses(CrmBusinessService service) {
        return new ListTool(service);
    }

    @Bean
    ModuleRoute crmBusinessListRoute() {
        return new ListRoute();
    }

    @Bean
    AiTool createCrmBusiness(CrmBusinessService service, YudaoToolPermissions permissions) {
        return new CreateTool(service, permissions);
    }

    @Bean
    ModuleRoute crmBusinessCreateRoute() {
        return new CreateRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class ListTool implements AiTool {

        private final CrmBusinessService service;

        ListTool(CrmBusinessService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "list_crm_businesses";
        }

        @Override
        public String description() {
            return "List the business opportunities this host's own CRM module holds (read-only). Returns the"
                    + " rows the caller owns (default) or takes part in (`scope=involved`); line items and"
                    + " remarks are not projected.";
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
            CrmBusinessPageReqVO query = new CrmBusinessPageReqVO();
            query.setPageSize(50);
            query.setSceneType(involved ? CrmSceneTypeEnum.INVOLVED.getType() : CrmSceneTypeEnum.OWNER.getType());
            Long caller = asId(principal.userId());
            // The identity travels as the argument the module's own query takes, so the page is scoped by the module
            // rather than post-filtered here.
            // 身份以模块自己查询所取的入参传递，于是分页由模块收束，而不是在这里事后过滤。
            List<Map<String, Object>> rows = ActingCaller.as(principal.userId(),
                            () -> TenantUtils.execute(YudaoCallerTenant.current(),
                                    () -> service.getBusinessPage(query, caller))).getList().stream()
                    .map(ListTool::project)
                    .toList();
            return ToolResult.ok(rows);
        }

        /** The fields that leave this tool — a projection is where that decision is legible. */
        private static Map<String, Object> project(CrmBusinessDO row) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("id", row.getId());
            safe.put("name", row.getName());
            safe.put("customerId", row.getCustomerId());
            safe.put("ownerUserId", row.getOwnerUserId());
            safe.put("statusTypeId", row.getStatusTypeId());
            safe.put("statusId", row.getStatusId());
            safe.put("endStatus", row.getEndStatus());
            safe.put("dealTime", row.getDealTime() == null ? null : row.getDealTime().toString());
            safe.put("totalPrice", row.getTotalPrice());
            return safe;
        }
    }

    static final class ListRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "list_crm_businesses";
        }

        @Override
        public List<String> triggers() {
            return List.of("列出商机", "商机列表", "CRM 商机", "看商机", "有哪些商机");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            return Map.of();
        }
    }

    /** R3 — a write: the engine holds it for a human before it runs. / R3——写：引擎扣下等人。 */
    static final class CreateTool implements AiTool {

        private final CrmBusinessService service;
        private final YudaoToolPermissions permissions;

        CreateTool(CrmBusinessService service, YudaoToolPermissions permissions) {
            this.service = service;
            this.permissions = permissions;
        }

        @Override
        public String name() {
            return "create_crm_business";
        }

        @Override
        public String description() {
            return "Create a business opportunity for a customer in the CRM module this host already ships."
                    + " The engine holds the call for a human before it runs.";
        }

        @Override
        public String riskLevel() {
            return "R3";
        }

        @Override
        public String resultType() {
            return "crm_business";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.required("name", ToolParameter.STRING, "商机名称"),
                    ToolParameter.required("customerId", ToolParameter.NUMBER, "客户编号（商机关联的客户）"),
                    ToolParameter.required("statusTypeId", ToolParameter.NUMBER, "商机状态组编号"),
                    ToolParameter.optional("dealTime", ToolParameter.STRING, "预计成交日期"),
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
            Long customerId = asLong(args.get("customerId"));
            if (customerId == null) {
                return ToolResult.fail("customerId is required and must be a number");
            }
            Long statusTypeId = asLong(args.get("statusTypeId"));
            if (statusTypeId == null) {
                return ToolResult.fail("statusTypeId is required and must be a number");
            }
            CrmBusinessSaveReqVO row = new CrmBusinessSaveReqVO();
            row.setName(name);
            row.setCustomerId(customerId);
            row.setStatusTypeId(statusTypeId);
            // VO 把折扣声明为必填，而工具面不向调用方索取：没有折扣的商机就是产品的原价合计。不补零，服务端的
            // bean 校验会在**批准之后**拒绝这次写。
            // The VO declares the discount required and this tool does not ask for it: a business without a
            // discount is the plain sum of its products. Without the zero the server-side bean validation would
            // refuse the write **after approval**.
            row.setDiscountPercent(BigDecimal.ZERO);
            row.setDealTime(asTime(args.get("dealTime")));
            row.setRemark(str(args.get("remark")));
            // The owner is not set here on purpose: CrmBusinessGovernance stamps it from the caller, the way it does
            // for the module's own REST path.
            // 属主**刻意不在这里设**：由 CrmBusinessGovernance 从调用方盖上去，与它对模块 REST 路径的做法相同。
            Long caller = asId(principal.userId());
            Long id = YudaoGovernedCall.write(principal.userId(), () -> service.createBusiness(row, caller));
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", id);
            return ToolResult.ok(out);
        }
    }

    static final class CreateRoute implements ModuleRoute {

        /** The three required arguments, as a caller writes them. / 三个必填项在文字里的写法。 */
        private static final Pattern CUSTOMER_ID = Pattern.compile("客户(?:编号|号)?\\s*[=:：]?\\s*(\\d+)");
        private static final Pattern STATUS_TYPE_ID = Pattern.compile("状态组(?:编号)?\\s*[=:：]?\\s*(\\d+)");
        private static final Pattern NAME = Pattern.compile("名称\\s*[=:：]\\s*([^\\s，,。]+)");

        @Override
        public String toolName() {
            return "create_crm_business";
        }

        @Override
        public List<String> triggers() {
            return List.of("新建商机", "创建商机", "商机新建", "录商机");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            // 商机的客户就是这条路的目标，故 `targetId` 仍是它最像的填法；但状态组只在文字里出现，而三者缺一个
            // 这次创建就提交不了 —— 用户在文字里写出的「客户=12 状态组=1 名称=大单」由这里读出来。名称没写时整条
            // 消息就是名称（与合同那条相同），不替调用方编一个。
            //
            // The customer is what this route's target slot names, so `targetId` is still its closest fill; the
            // status group appears only in the text, and the creation cannot be submitted without all three. What
            // the caller wrote explicitly — `客户=12 状态组=1 名称=大单` — is read here. Without an explicit name
            // the whole message is the name (as in the contract route); none is invented.
            Map<String, Object> args = new LinkedHashMap<>();
            if (context.get("targetId") != null) {
                args.put("customerId", context.get("targetId"));
            }
            if (context.get("message") instanceof String typed && !typed.isBlank()) {
                Long customerId = asLong(match(typed, CUSTOMER_ID));
                if (customerId != null) {
                    args.put("customerId", customerId);
                }
                Long statusTypeId = asLong(match(typed, STATUS_TYPE_ID));
                if (statusTypeId != null) {
                    args.put("statusTypeId", statusTypeId);
                }
                String name = match(typed, NAME);
                args.put("name", name.isBlank() ? typed : name);
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

    /**
     * 预计成交日期（可选）：解析不出来就交回 null，由服务端按「没填」处理 —— 它不是必填，也不该被猜。
     *
     * The optional expected closing date: an unreadable value comes back as null, which the server treats as
     * "not given". It is not required and is not guessed.
     */
    private static LocalDateTime asTime(Object value) {
        String text = str(value);
        if (text == null || text.isBlank()) {
            return null;
        }
        String trimmed = text.trim();
        try {
            return trimmed.length() <= 10
                    ? LocalDate.parse(trimmed).atStartOfDay()
                    : LocalDateTime.parse(trimmed.replace(' ', 'T'));
        } catch (DateTimeParseException notADate) {
            return null;
        }
    }
}
