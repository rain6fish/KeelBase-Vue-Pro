// SPDX-License-Identifier: Apache-2.0
//
// GENERATED for the Yudao host from specs/products.json — do not edit by hand; re-run the adapter.
// Our own file, not Yudao's generator output. / 由适配器从 specs/products.json 为芋道宿主生成——不要手改。
// 我们自己的文件，非芋道生成器的产出。
package cn.iocoder.yudao.server.keelbase.generated;

import cn.com.keelbase.runtime.authz.OwnershipGuard;
import cn.com.keelbase.runtime.authz.PermissionAuthorizer;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.module.products.controller.admin.products.vo.ProductsPageReqVO;
import cn.iocoder.yudao.module.products.controller.admin.products.vo.ProductsSaveReqVO;
import cn.iocoder.yudao.module.products.dal.dataobject.products.ProductsDO;
import cn.iocoder.yudao.module.products.service.products.ProductsService;
import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * products's AI tool face over the module Yudao's own code generator produced: a read and a write,
 * with their routes.
 *
 * <p>It calls the generated <em>service</em>, not the mapper, and it narrows nothing itself. That is the
 * point: the module's row scope lives in {@link ProductsGovernance}'s pointcuts, so a call through this
 * tool and a call through the module's REST path are held by the same advices. A tool that filtered on
 * its own would govern the tool and leave the REST path open — which is exactly what the first cut did.
 *
 * products 的 AI 工具面，跑在**芋道自己的代码生成器**产出的模块上：一读一写，各配路由。
 *
 * <p>它调生成的 **service**、不调 mapper，且它**自己一点不收束**。这正是要点：模块的行范围住在
 * {@link ProductsGovernance} 的切点里，于是经本工具的调用与经模块 REST 路径的调用被**同一批通知**管住。
 * 自己过滤的工具只会治理工具、把 REST 路径敞开——那正是第一版干的事。
 */
@Configuration
public class ProductsTools {

    @Bean
    AiTool listGeneratedProducts(ProductsService service) {
        return new ListTool(service);
    }

    @Bean
    AiTool createGeneratedProducts(ProductsService service) {
        return new CreateTool(service);
    }

    @Bean
    ModuleRoute productsListRoute() {
        return new ListRoute();
    }

    @Bean
    ModuleRoute productsCreateRoute() {
        return new CreateRoute();
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class ListTool implements AiTool {

        private final ProductsService service;

        ListTool(ProductsService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "list_generated_products";
        }

        @Override
        public String description() {
            return "List the 产品 held by the module Yudao's code generator produced (read-only)."
                    + " Returns only the caller's own rows.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            ProductsPageReqVO query = new ProductsPageReqVO();
            query.setPageSize(100);
            List<Map<String, Object>> rows = ActingCaller.as(principal.userId(),
                            () -> service.getProductsPage(query)).getList().stream()
                    .map(ListTool::project)
                    .toList();
            return ToolResult.ok(rows);
        }

        /** The fields that leave this tool — a projection is where that decision is legible. */
        private static Map<String, Object> project(ProductsDO row) {
            Map<String, Object> safe = new LinkedHashMap<>();
            safe.put("id", row.getId());
            safe.put("name", row.getName());
            safe.put("price", row.getPrice());
            safe.put("status", row.getStatus());
            return safe;
        }
    }

    /** The phrases this module's read answers to. / 本模块读所回答的短语。 */
    static final class ListRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "list_generated_products";
        }

        @Override
        public List<String> triggers() {
            // 「生成」是独占标记：手写路由也认「新建产品」这类短语，且按 bean 顺序先命中。
            // "生成" keeps these phrases disjoint from the hand-written routes, which win by bean order.
            return List.of("列出生成产品", "生成的产品", "查看生成产品");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            return Map.of();
        }
    }

    /** R3 — a write: the engine holds it for a human before it runs. / R3——写：引擎扣下等人。 */
    static final class CreateTool implements AiTool {

        private final ProductsService service;

        CreateTool(ProductsService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "create_generated_products";
        }

        @Override
        public String description() {
            return "Create a 产品 through the module Yudao's code generator produced.";
        }

        @Override
        public String riskLevel() {
            return "R3";
        }

        @Override
        public String resultType() {
            return "products";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.required("name", ToolParameter.STRING, "产品名称"),
                    ToolParameter.optional("price", ToolParameter.NUMBER, "价格"),
                    ToolParameter.optional("status", ToolParameter.STRING, "状态"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            ProductsSaveReqVO row = new ProductsSaveReqVO();
            row.setName(str(args.get("name")));
            row.setPrice(asLong(args.get("price")));
            row.setStatus(str(args.get("status")));
            // The owner is not set here on purpose: ProductsGovernance stamps it from the caller, the
            // same way it does for the module's own REST path.
            // 属主**刻意不在这里设**：由 ProductsGovernance 从调用方盖上去，与它对模块自己的 REST 路径一样。
            Long id = ActingCaller.as(principal.userId(), () -> service.createProducts(row));
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", id);
            return ToolResult.ok(out);
        }
    }

    static final class CreateRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "create_generated_products";
        }

        @Override
        public List<String> triggers() {
            return List.of("新建生成产品", "创建生成产品", "添加生成产品");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            if (context.get("name") != null) {
                args.put("name", context.get("name"));
            }
            if (context.get("price") != null) {
                args.put("price", context.get("price"));
            }
            if (context.get("status") != null) {
                args.put("status", context.get("status"));
            }
            // A placeholder for argument extraction, as the host's routes are: when nothing structured
            // arrived, the typed text names the row. / 参数抽取的占位，与宿主的那些路由一样。
            if (args.get("name") == null && context.get("message") instanceof String typed && !typed.isBlank()) {
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
