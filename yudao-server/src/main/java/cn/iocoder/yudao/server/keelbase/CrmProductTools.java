// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.crm.controller.admin.product.vo.product.CrmProductPageReqVO;
import cn.iocoder.yudao.module.crm.controller.admin.product.vo.product.CrmProductSaveReqVO;
import cn.iocoder.yudao.module.crm.dal.dataobject.product.CrmProductDO;
import cn.iocoder.yudao.module.crm.service.product.CrmProductService;
import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 产品的工具面：**读自己读得到的产品**，**写新建一件**。产品是目录，但**每一行都有自己的有权人**（创建时开一行
 * `crm_permission` 的 `OWNER`），故它的写与合同、回款同档，走 R3 —— 引擎扣下等人。
 *
 * <p><b>为什么读不带场景。</b>上游的分页**没有场景入参**（`getProductPage` 只收名称与状态），也就谈不上「补成我负责的
 * 或我参与的」。`CrmProductGovernance` 在模块答完之后按权限行后过滤，故本工具拿到的一页**已经是调用方读得到的行**；
 * 它只把名称与状态这两个上游本来就有的筛选透下去。
 *
 * <p><b>为什么写只给「新建一件」。</b>改、删都是**对已有产品动手**（删还会连带拒绝仍被合同 / 商机引用的产品）；AI 侧先
 * 只开一条有明确产出的写，与合同、回款、线索、商机、联系人同形：入参声明齐全、结果带 `id`、属主由切面盖章、调用方
 * 身份随 `ActingCaller` 传进去。
 *
 * <p><b>四个必填项一个都不能少，且路由要能从文字里读出来。</b>保存 VO 把 `name`、`no`、`price`、`status`、`categoryId`
 * 都声明为 `@NotNull`；缺了任何一个，服务端 bean 校验会在**人批准之后**拒绝这次写，而路由若交不出它们，引擎会在
 * **人批准之前**就以 `invalid_arguments` 拒掉提议 —— 两次都是这一类的实测缺陷（回款门、合同门），故路由把
 * 「名称=A 编码=B 价格=9.9 状态=1 分类=3」读成入参。`unit` 不是必填（上游是原始 `int`、无约束），工具不向调用方索取，
 * 缺省即 `0` —— 不替调用方编一个单位。
 *
 * <p><b>投影。</b>出去的是产品这条业务事实：编号、名称、产品编码、单位、价格、状态、分类、属主。描述不出去 —— 它是
 * 自由文本，不是「这件产品是什么」的结构化事实。
 *
 * The product tool face: read the products the caller can see, and create one. The catalogue is shared, but every
 * row has an owner of its own (an `OWNER` row in `crm_permission`, opened on create), so its write sits in the same
 * tier as contracts and receivables and runs at R3 — the engine holds it for a person. The read carries no scene
 * because upstream's page has no such argument: the aspect post-filters the page it gets back, so what this tool
 * receives is already the caller's own readable rows; the tool passes down only the name and status filters
 * upstream already has. The write is create-only for now, shaped like the other CRM tools. Five arguments are
 * required and none may be assumed: the save VO declares `name`, `no`, `price`, `status` and `categoryId`
 * `@NotNull`, an omitted one is refused **before** a person is asked, and one the VO is missing is refused
 * **after** approval — so the route reads them out of what the caller typed. `unit` is not required upstream (a
 * bare `int` with no constraint) and is left at zero rather than invented. The projection carries the product's
 * business facts and drops the free-text description.
 */
@Configuration
public class CrmProductTools {

    /** The permission code the REST path requires for the same write — the same vocabulary, not a second one. */
    private static final String CREATE_PERMISSION = "crm:product:create";

    @Bean
    AiTool listCrmProducts(CrmProductService service) {
        return new ListTool(service);
    }

    @Bean
    ModuleRoute crmProductListRoute() {
        return new ListRoute();
    }

    @Bean
    AiTool createCrmProduct(CrmProductService service, YudaoToolPermissions permissions) {
        return new CreateTool(service, permissions);
    }

    @Bean
    ModuleRoute crmProductCreateRoute() {
        return new CreateRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class ListTool implements AiTool {

        private final CrmProductService service;

        ListTool(CrmProductService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "list_crm_products";
        }

        @Override
        public String description() {
            return "List the products this host's own CRM module holds (read-only). Returns only the rows the"
                    + " caller may read; an optional name and status narrow the page, and descriptions are not"
                    + " projected.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.optional("name", ToolParameter.STRING, "产品名称（模糊匹配）"),
                    ToolParameter.optional("status", ToolParameter.NUMBER, "状态：0 下架 / 1 上架"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            CrmProductPageReqVO query = new CrmProductPageReqVO();
            query.setPageSize(50);
            query.setName(str(args.get("name")));
            query.setStatus(asInteger(args.get("status")));
            // 上游的分页不收调用方；身份只能经 `ActingCaller` 传进去，切面再从那里读出来收窄这一页。
            // Upstream's page takes no caller, so the identity travels through `ActingCaller` and the aspect reads
            // it there to narrow this page.
            List<Map<String, Object>> rows = ActingCaller.as(principal.userId(),
                            () -> TenantUtils.execute(YudaoCallerTenant.current(),
                                    () -> service.getProductPage(query))).getList().stream()
                    .map(ListTool::project)
                    .toList();
            return ToolResult.ok(rows);
        }

        /** The fields that leave this tool — a projection is where that decision is legible. */
        private static Map<String, Object> project(CrmProductDO row) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("id", row.getId());
            safe.put("name", row.getName());
            safe.put("no", row.getNo());
            safe.put("unit", row.getUnit());
            safe.put("price", row.getPrice());
            safe.put("status", row.getStatus());
            safe.put("categoryId", row.getCategoryId());
            safe.put("ownerUserId", row.getOwnerUserId());
            return safe;
        }
    }

    static final class ListRoute implements ModuleRoute {

        /** The two filters upstream's page has, as a caller writes them. / 上游那两项筛选在文字里的写法。 */
        private static final Pattern NAME = Pattern.compile("名称\\s*[=:：]\\s*([^\\s，,。]+)");
        private static final Pattern STATUS = Pattern.compile("状态\\s*[=:：]?\\s*(\\d+)");

        @Override
        public String toolName() {
            return "list_crm_products";
        }

        @Override
        public List<String> triggers() {
            return List.of("列出产品", "产品列表", "CRM 产品", "看产品", "有哪些产品");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            if (context.get("message") instanceof String typed && !typed.isBlank()) {
                String name = match(typed, NAME);
                if (!name.isBlank()) {
                    args.put("name", name);
                }
                Integer status = asInteger(match(typed, STATUS));
                if (status != null) {
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

    /** R3 — a write: the engine holds it for a human before it runs. / R3——写：引擎扣下等人。 */
    static final class CreateTool implements AiTool {

        private final CrmProductService service;
        private final YudaoToolPermissions permissions;

        CreateTool(CrmProductService service, YudaoToolPermissions permissions) {
            this.service = service;
            this.permissions = permissions;
        }

        @Override
        public String name() {
            return "create_crm_product";
        }

        @Override
        public String description() {
            return "Create a product in the CRM module this host already ships. The engine holds the call for a"
                    + " human before it runs.";
        }

        @Override
        public String riskLevel() {
            return "R3";
        }

        @Override
        public String resultType() {
            return "crm_product";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.required("name", ToolParameter.STRING, "产品名称"),
                    ToolParameter.required("no", ToolParameter.STRING, "产品编码（全局唯一）"),
                    ToolParameter.required("price", ToolParameter.NUMBER, "价格"),
                    ToolParameter.required("status", ToolParameter.NUMBER, "状态：0 下架 / 1 上架"),
                    ToolParameter.required("categoryId", ToolParameter.NUMBER, "产品分类编号"),
                    ToolParameter.optional("unit", ToolParameter.NUMBER, "单位（字典 crm_product_unit）"));
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
            String no = str(args.get("no"));
            if (no == null || no.isBlank()) {
                return ToolResult.fail("no is required");
            }
            BigDecimal price = asDecimal(args.get("price"));
            if (price == null) {
                return ToolResult.fail("price is required and must be a number");
            }
            Integer status = asInteger(args.get("status"));
            if (status == null) {
                return ToolResult.fail("status is required and must be a number");
            }
            Long categoryId = asLong(args.get("categoryId"));
            if (categoryId == null) {
                return ToolResult.fail("categoryId is required and must be a number");
            }
            CrmProductSaveReqVO row = new CrmProductSaveReqVO();
            row.setName(name);
            row.setNo(no);
            row.setPrice(price);
            row.setStatus(status);
            row.setCategoryId(categoryId);
            // 单位不是必填（上游是无约束的原始 int），没给就是 0 —— 不替调用方编一个单位。
            // The unit is not required upstream (a bare `int` with no constraint); absent means zero, not a guess.
            Integer unit = asInteger(args.get("unit"));
            if (unit != null) {
                row.setUnit(unit);
            }
            // The owner is not set here on purpose: CrmProductGovernance stamps it from the caller, the way it does
            // for the module's own REST path.
            // 属主**刻意不在这里设**：由 CrmProductGovernance 从调用方盖上去，与它对模块 REST 路径的做法相同。
            Long id = YudaoGovernedCall.write(principal.userId(), () -> service.createProduct(row));
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", id);
            return ToolResult.ok(out);
        }
    }

    static final class CreateRoute implements ModuleRoute {

        /** The five required arguments, as a caller writes them. / 五个必填项在文字里的写法。 */
        private static final Pattern NAME = Pattern.compile("名称\\s*[=:：]\\s*([^\\s，,。]+)");
        private static final Pattern NO = Pattern.compile("编码\\s*[=:：]\\s*([^\\s，,。]+)");
        private static final Pattern PRICE = Pattern.compile("价格\\s*[=:：]?\\s*(\\d+(?:\\.\\d+)?)");
        private static final Pattern STATUS = Pattern.compile("状态\\s*[=:：]?\\s*(\\d+)");
        private static final Pattern CATEGORY_ID = Pattern.compile("分类(?:编号)?\\s*[=:：]?\\s*(\\d+)");
        private static final Pattern UNIT = Pattern.compile("单位\\s*[=:：]?\\s*(\\d+)");

        @Override
        public String toolName() {
            return "create_crm_product";
        }

        @Override
        public List<String> triggers() {
            return List.of("新建产品", "创建产品", "新增产品", "加产品");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            // 五个必填项由这里从用户**明确写出的文字**里读出来 ——「新建产品 名称=A 编码=B 价格=9.9 状态=1 分类=3」。
            // 引擎会在**人批准之前**就拒掉一份漏了必填项的提议，故路由拿不到它们，这个工具就走不到人面前（回款门、
            // 合同门各因此红过一次）。名称没写时整条消息就是名称（与合同、商机两条相同），不替调用方编一个；
            // 其余四个编不出来，缺了就让引擎在批准前拒绝。
            //
            // The five required arguments are read from what the caller wrote explicitly — "新建产品 名称=A 编码=B
            // 价格=9.9 状态=1 分类=3". The engine refuses a proposal missing them **before** a person is asked, so a
            // route that cannot read them never reaches a human (the receivable and contract gates each went red on
            // exactly this). Without an explicit name the whole message is the name, as in the contract and business
            // routes; the other four are not invented — missing ones are refused before approval.
            Map<String, Object> args = new LinkedHashMap<>();
            if (context.get("message") instanceof String typed && !typed.isBlank()) {
                String no = match(typed, NO);
                if (!no.isBlank()) {
                    args.put("no", no);
                }
                String price = match(typed, PRICE);
                if (!price.isBlank()) {
                    args.put("price", new BigDecimal(price));
                }
                Integer status = asInteger(match(typed, STATUS));
                if (status != null) {
                    args.put("status", status);
                }
                Long categoryId = asLong(match(typed, CATEGORY_ID));
                if (categoryId != null) {
                    args.put("categoryId", categoryId);
                }
                Integer unit = asInteger(match(typed, UNIT));
                if (unit != null) {
                    args.put("unit", unit);
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

    private static Integer asInteger(Object value) {
        Long parsed = asLong(value);
        return parsed == null ? null : parsed.intValue();
    }

    private static BigDecimal asDecimal(Object value) {
        if (value instanceof BigDecimal decimal) {
            return decimal;
        }
        if (value instanceof Number number) {
            return BigDecimal.valueOf(number.doubleValue());
        }
        if (value instanceof String text && !text.isBlank()) {
            try {
                return new BigDecimal(text.trim());
            } catch (NumberFormatException notANumber) {
                return null;
            }
        }
        return null;
    }
}
