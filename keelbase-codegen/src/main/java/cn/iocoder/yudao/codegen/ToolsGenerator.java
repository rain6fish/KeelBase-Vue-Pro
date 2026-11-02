// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.codegen;

import cn.com.keelbase.protocol.RiskLevel;
import java.util.ArrayList;
import java.util.List;

/**
 * 由一份规格产出该模块的 **AI 工具面**：一读一写两个 {@code AiTool}，各自配一条 {@code ModuleRoute}，
 * 装在同一个 {@code @Configuration} 里。
 *
 * <p>它调生成的 **service**、不调 mapper，且自己一点不收束——收束住在治理切面里（见 {@link GovernanceGenerator}），
 * 于是经本工具的调用与经模块 REST 路径的调用被同一批通知管住。读工具只投影出它**确实要交出去**的字段，
 * 写工具刻意**不设属主**（由治理切面盖章）。哪些工具出现、哪些 bean 出现，取决于规格里声明的 AI 能力
 * （有 `read` 才有读工具、有 `write` 才有写工具）。
 *
 * <p>Emits the module's AI tool face: a read tool and a write tool, each with a {@code ModuleRoute}, wired
 * as one {@code @Configuration}. It calls the generated <em>service</em>, not the mapper, and narrows
 * nothing itself — the row scope lives in the governance pointcuts, so a call through this tool and a
 * call through the module's REST path are held by the same advices. Which tools appear follows the AI
 * capabilities the Spec declares.
 */
final class ToolsGenerator {

    private ToolsGenerator() {
    }

    static String build(Spec spec) {
        String module = spec.module();
        String entity = spec.entity();
        String label = spec.label();
        String pkg = "cn.iocoder.yudao.server.keelbase.generated";
        String modulePkg = "cn.iocoder.yudao.module." + module;
        Spec.Cap read = spec.caps().stream().filter(cap -> "read".equals(cap.kind())).findFirst().orElse(null);
        Spec.Cap write = spec.caps().stream().filter(cap -> "write".equals(cap.kind())).findFirst().orElse(null);
        // 写工具的风险级取自**唯一**定义它的那处（{@link Spec.Cap}），故规格的一致性检查与它产出的工具不会各行其是。
        // The write tool's level comes from the one place that defines it ({@link Spec.Cap}), so the Spec's
        // consistency check and the tool it produces cannot drift apart.
        String writeRisk = write != null ? write.effectiveLevel() : "R3";

        StringBuilder setters = new StringBuilder();
        for (Spec.Field field : spec.fields()) {
            setters.append("            row.set").append(Spec.pascal(field.name())).append("(")
                    .append(Types.convert(field.type())).append("(args.get(\"").append(field.name()).append("\")));\n");
        }
        StringBuilder params = new StringBuilder();
        for (int i = 0; i < spec.fields().size(); i++) {
            Spec.Field field = spec.fields().get(i);
            params.append(i == 0 ? "" : ",\n")
                    .append("                    ToolParameter.").append(field.required() ? "required" : "optional")
                    .append("(\"").append(field.name()).append("\", ToolParameter.")
                    .append(Types.toolParamType(field.type())).append(", \"").append(field.label()).append("\")");
        }
        StringBuilder routeArgs = new StringBuilder();
        for (Spec.Field field : spec.fields()) {
            routeArgs.append("            if (context.get(\"").append(field.name()).append("\") != null) {\n")
                    .append("                args.put(\"").append(field.name()).append("\", context.get(\"")
                    .append(field.name()).append("\"));\n            }\n");
        }
        StringBuilder projection = new StringBuilder();
        List<String> projected = new ArrayList<>();
        projected.add("id");
        spec.fields().forEach(field -> projected.add(field.name()));
        for (int i = 0; i < projected.size(); i++) {
            projection.append(i == 0 ? "" : "\n").append("            safe.put(\"").append(projected.get(i))
                    .append("\", row.get").append(Spec.pascal(projected.get(i))).append("());");
        }

        String readTool = read == null ? "" : """
    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class ListTool implements AiTool {

        private final %sService service;

        ListTool(%sService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "list_generated_%s";
        }

        @Override
        public String description() {
            return "List the %s held by the module Yudao's code generator produced (read-only)."
                    + " Returns only the caller's own rows.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            %sPageReqVO query = new %sPageReqVO();
            query.setPageSize(100);
            List<Map<String, Object>> rows = ActingCaller.as(principal.userId(),
                            () -> service.get%sPage(query)).getList().stream()
                    .map(ListTool::project)
                    .toList();
            return ToolResult.ok(rows);
        }

        /** The fields that leave this tool — a projection is where that decision is legible. */
        private static Map<String, Object> project(%sDO row) {
            Map<String, Object> safe = new LinkedHashMap<>();
%s
            return safe;
        }
    }

    /** The phrases this module's read answers to. / 本模块读所回答的短语。 */
    static final class ListRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "list_generated_%s";
        }

        @Override
        public List<String> triggers() {
            // 「生成」是独占标记：手写路由也认「新建产品」这类短语，且按 bean 顺序先命中。
            // "生成" keeps these phrases disjoint from the hand-written routes, which win by bean order.
            return List.of("列出生成%s", "生成的%s", "查看生成%s");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            return Map.of();
        }
    }
""".formatted(entity, entity, module, label, entity, entity, entity, entity, projection, module, label, label, label);

        // 写工具的说明随风险级变，故生成的文件**不会**宣称一次引擎不会做的扣下：R3/R4 的写为人停下，其余直接跑。
        // 对树上这些 Spec，这句话一字未变，故已提交的产物逐字节不变。
        // The write tool's blurb follows the level, so a generated file never claims a hold the engine
        // will not perform: an R3/R4 write stops for a human, anything else runs. For the Specs in the
        // tree this reads exactly as before, so the checked-in artifact stays byte-identical.
        boolean writeStops = RiskLevel.needsConfirmation(writeRisk);
        String writeBlurbEn = writeStops ? "the engine holds it for a human before it runs."
                : "the engine runs it without stopping for a human.";
        String writeBlurbZh = writeStops ? "引擎扣下等人。" : "引擎直接执行、不为人停下。";

        String writeTool = write == null ? "" : """

    /** %s — a write: %s / %s——写：%s */
    static final class CreateTool implements AiTool {

        private final %sService service;

        CreateTool(%sService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "create_generated_%s";
        }

        @Override
        public String description() {
            return "Create a %s through the module Yudao's code generator produced.";
        }

        @Override
        public String riskLevel() {
            return "%s";
        }

        @Override
        public String resultType() {
            return "%s";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
%s);
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            %sSaveReqVO row = new %sSaveReqVO();
%s            // The owner is not set here on purpose: %sGovernance stamps it from the caller, the
            // same way it does for the module's own REST path.
            // 属主**刻意不在这里设**：由 %sGovernance 从调用方盖上去，与它对模块自己的 REST 路径一样。
            Long id = ActingCaller.as(principal.userId(), () -> service.create%s(row));
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", id);
            return ToolResult.ok(out);
        }
    }

    static final class CreateRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "create_generated_%s";
        }

        @Override
        public List<String> triggers() {
            return List.of("新建生成%s", "创建生成%s", "添加生成%s");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
%s            // A placeholder for argument extraction, as the host's routes are: when nothing structured
            // arrived, the typed text names the row. / 参数抽取的占位，与宿主的那些路由一样。
            if (args.get("name") == null && context.get("message") instanceof String typed && !typed.isBlank()) {
                args.put("name", typed);
            }
            return args;
        }
    }
""".formatted(writeRisk, writeBlurbEn, writeRisk, writeBlurbZh, entity, entity, module, label, writeRisk, module,
                params, entity, entity, setters, entity, entity, entity, module, label, label, label, routeArgs);

        // Tool beans first, then route beans: the order the checked-in file has, so a regeneration is a
        // no-op rather than a reordering. / 工具 bean 在前、路由 bean 在后——与已提交的那份同序。
        String listToolBean = read == null ? "" : """
    @Bean
    AiTool listGenerated%s(%sService service) {
        return new ListTool(service);
    }

""".formatted(entity, entity);
        String createToolBean = write == null ? "" : """
    @Bean
    AiTool createGenerated%s(%sService service) {
        return new CreateTool(service);
    }

""".formatted(entity, entity);
        String listRouteBean = read == null ? "" : """
    @Bean
    ModuleRoute %sListRoute() {
        return new ListRoute();
    }

""".formatted(module);
        String createRouteBean = write == null ? "" : """
    @Bean
    ModuleRoute %sCreateRoute() {
        return new CreateRoute();
    }

""".formatted(module);

        String asBool = spec.fields().stream().anyMatch(field -> "bool".equals(field.type())) ? """

    private static Boolean asBool(Object value) {
        return value instanceof Boolean flag ? flag : null;
    }
""" : "";

        return """
// SPDX-License-Identifier: Apache-2.0
//
// GENERATED for the Yudao host from specs/%s.json — do not edit by hand; re-run the adapter.
// Our own file, not Yudao's generator output. / 由适配器从 specs/%s.json 为芋道宿主生成——不要手改。
// 我们自己的文件，非芋道生成器的产出。
package %s;

import cn.com.keelbase.runtime.authz.OwnershipGuard;
import cn.com.keelbase.runtime.authz.PermissionAuthorizer;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import %s.controller.admin.%s.vo.%sPageReqVO;
import %s.controller.admin.%s.vo.%sSaveReqVO;
import %s.dal.dataobject.%s.%sDO;
import %s.service.%s.%sService;
import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * %s's AI tool face over the module Yudao's own code generator produced: a read and a write,
 * with their routes.
 *
 * <p>It calls the generated <em>service</em>, not the mapper, and it narrows nothing itself. That is the
 * point: the module's row scope lives in {@link %sGovernance}'s pointcuts, so a call through this
 * tool and a call through the module's REST path are held by the same advices. A tool that filtered on
 * its own would govern the tool and leave the REST path open — which is exactly what the first cut did.
 *
 * %s 的 AI 工具面，跑在**芋道自己的代码生成器**产出的模块上：一读一写，各配路由。
 *
 * <p>它调生成的 **service**、不调 mapper，且它**自己一点不收束**。这正是要点：模块的行范围住在
 * {@link %sGovernance} 的切点里，于是经本工具的调用与经模块 REST 路径的调用被**同一批通知**管住。
 * 自己过滤的工具只会治理工具、把 REST 路径敞开——那正是第一版干的事。
 */
@Configuration
public class %sTools {

%s%s%s%s%s%s
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
%s}
""".formatted(module, module, pkg,
                modulePkg, module, entity, modulePkg, module, entity, modulePkg, module, entity, modulePkg, module, entity,
                module, entity, module, entity, entity,
                listToolBean, createToolBean, listRouteBean, createRouteBean, readTool, writeTool, asBool);
    }
}
