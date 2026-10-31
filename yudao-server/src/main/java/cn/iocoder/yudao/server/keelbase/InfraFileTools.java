// SPDX-License-Identifier: Apache-2.0
package cn.iocoder.yudao.server.keelbase;

import cn.com.keelbase.runtime.identity.ActingCaller;
import cn.com.keelbase.runtime.identity.Principal;
import cn.com.keelbase.runtime.pipeline.ModuleRoute;
import cn.com.keelbase.runtime.tool.AiTool;
import cn.com.keelbase.runtime.tool.ToolParameter;
import cn.com.keelbase.runtime.tool.ToolResult;
import cn.iocoder.yudao.framework.tenant.core.util.TenantUtils;
import cn.iocoder.yudao.module.infra.controller.admin.file.vo.file.FilePageReqVO;
import cn.iocoder.yudao.module.infra.dal.dataobject.file.FileDO;
import cn.iocoder.yudao.module.infra.service.file.FileService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 文件（`infra_file`）的工具面：一读（列表）一写（删除），各配路由。它是 M2 的第二个对象，也是本宿主上第一个
 * **写是删除**的面。
 *
 * <p><b>为什么不把上传做成工具。</b>上游的上传收的是 `byte[]`（`createFile(content, name, directory, type)`），
 * 模型没有可交的二进制、也不该有；另一条建记录的路（`createFile(FileCreateReqVO)`）要 configId / path / url——
 * 正是本面**不许投影**的存储细节。故本面不声明上传工具，写落在删除上：它不需要字节，只要一个 id，而「删掉我建的
 * 这个文件」正是调用方能独立表达的一件事。**这不是为了凑一个写**——删除是模块真实存在的那条写路径，也是切面
 * 「只认创建者」那条口径唯一能被门禁观测到的出口。
 *
 * <p><b>投影不含存储细节。</b>离开本面的只有 id、名称、大小、MIME 类型与创建时间；path、url、configId 一个都
 * 不出去——管理端红线要求输出不外泄身份与存储细节，而不给这些，也就拼不出那条 `@PermitAll` 的下载地址。
 *
 * <p><b>读由切面收窄，不在这里。</b>分页 VO 没有调用方筛选位，故本面只问模块自己的分页查询，由
 * {@link InfraFileGovernance} 只留调用方建的行，并把 total 重算为**本页留下的行数**。
 *
 * <p><b>写被扣下等人，且撤销会被拒。</b>删除是 R3：引擎先扣下等人，再跑；范围之外的文件由切面在写跑起来之前拒绝。
 * 删除不可撤销，故本宿主**没有**为 `infra_file` 声明补偿器——一次撤销会以「没有这条路」被拒，而不是假装能把文件
 * 复原。结果仍带 `id`，因为引擎的副作用台账要求一个。
 *
 * <p>The tool face over files (`infra_file`): one read and one write (delete), each with its route. It is M2's second
 * object and the first face on this host whose write is a deletion.
 *
 * <p><b>Why upload is not a tool.</b> Upstream's upload takes a `byte[]` — a model has no binary to hand over and
 * should not. The other create path (`createFile(FileCreateReqVO)`) needs configId / path / url, exactly the storage
 * details this face must not project. So no upload tool is declared, and the write is a delete: it needs no bytes,
 * only an id, and "delete this file I created" is something the caller can express on their own. This is not a write
 * cobbled together to have one — delete is a real upstream write path, and it is the only exit through which the
 * aspect's creator-only rule can be observed by a gate.
 *
 * <p><b>The projection holds no storage details.</b> Only id, name, size, MIME type and created time leave; path,
 * URL and config id do not — the admin red line forbids leaking identity and storage details, and without them the
 * `@PermitAll` download address cannot be composed.
 *
 * <p><b>The read is narrowed by the advice, not here.</b> The page VO has no caller filter, so this face asks the
 * module's own page query and {@link InfraFileGovernance} keeps only the caller's rows, recomputing the total as
 * <b>the rows this page kept</b>.
 *
 * <p><b>The write is held for a human, and a revoke is refused.</b> Delete is R3: the engine holds it for a human,
 * then runs it; a file outside the caller's scope is refused by the advice before the write runs. A delete cannot be
 * undone, so this host declares <b>no</b> compensator for `infra_file` — a revoke is refused by naming the missing
 * path rather than pretending the file can be restored. The result still carries an `id`, because the engine's
 * side-effect ledger requires one.
 */
@Configuration
public class InfraFileTools {

    @Bean
    AiTool listMyInfraFiles(FileService service) {
        return new ListTool(service);
    }

    @Bean
    AiTool deleteInfraFile(FileService service) {
        return new DeleteTool(service);
    }

    @Bean
    ModuleRoute infraFileListRoute() {
        return new ListRoute();
    }

    @Bean
    ModuleRoute infraFileDeleteRoute() {
        return new DeleteRoute();
    }

    /** 离开本面的字段：业务元数据，不含 path / url / configId，也不含审计串。 / What leaves: business metadata only. */
    private static Map<String, Object> project(FileDO row) {
        Map<String, Object> safe = new LinkedHashMap<>();
        safe.put("id", row.getId());
        safe.put("name", row.getName());
        safe.put("size", row.getSize());
        safe.put("type", row.getType());
        safe.put("createTime", String.valueOf(row.getCreateTime()));
        return safe;
    }

    /** R1 — a read: no confirmation, nothing to revoke. / R1——读：无需确认、无可撤销。 */
    static final class ListTool implements AiTool {

        private final FileService service;

        ListTool(FileService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "list_my_infra_files";
        }

        @Override
        public String description() {
            return "List the files the infra module holds for the caller (read-only). Only rows whose audit"
                    + " creator is the caller are returned, and the projection carries no storage path, URL or"
                    + " config id.";
        }

        @Override
        public String riskLevel() {
            return "R1";
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            FilePageReqVO query = new FilePageReqVO();
            query.setPageSize(100);
            List<Map<String, Object>> rows = ActingCaller.as(principal.userId(),
                            () -> TenantUtils.execute(YudaoCallerTenant.current(),
                                    () -> service.getFilePage(query))).getList().stream()
                    .map(InfraFileTools::project)
                    .toList();
            return ToolResult.ok(rows);
        }
    }

    /** The phrases this module's read answers to. / 本模块读所回答的短语。 */
    static final class ListRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "list_my_infra_files";
        }

        @Override
        public List<String> triggers() {
            return List.of("我的文件", "文件列表", "列出文件", "看我的文件", "我上传的文件");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            return Map.of();
        }
    }

    /**
     * R3 — 删除：引擎扣下等人；范围之外的文件在写跑起来之前被切面拒绝。结果带 id，撤销没有补偿器。
     *
     * R3 — 删除: held for a human; a file outside the caller's scope is refused by the advice before the write runs;
     * the result carries the id, and there is no compensator for a revoke.
     */
    static final class DeleteTool implements AiTool {

        private final FileService service;

        DeleteTool(FileService service) {
            this.service = service;
        }

        @Override
        public String name() {
            return "delete_infra_file";
        }

        @Override
        public String description() {
            return "Delete one file the caller created in the infra module this host already ships. The engine"
                    + " holds the call for a human; a file outside the caller's scope is refused even after"
                    + " approval. The deletion cannot be undone.";
        }

        @Override
        public String riskLevel() {
            return "R3";
        }

        @Override
        public String resultType() {
            return "infra_file";
        }

        @Override
        public List<ToolParameter> parameters() {
            return List.of(
                    ToolParameter.required("id", ToolParameter.NUMBER, "文件编号"));
        }

        @Override
        public ToolResult execute(Map<String, Object> args, Principal principal) {
            Long id = asLong(args.get("id"));
            if (id == null) {
                return ToolResult.fail("a file id is required");
            }
            YudaoGovernedCall.write(principal.userId(), () -> {
                service.deleteFile(id);
                return null;
            });
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("id", id);
            out.put("deleted", true);
            return ToolResult.ok(out);
        }
    }

    static final class DeleteRoute implements ModuleRoute {

        @Override
        public String toolName() {
            return "delete_infra_file";
        }

        @Override
        public List<String> triggers() {
            return List.of("删除文件", "删掉文件", "删除我的文件");
        }

        @Override
        public Map<String, Object> args(Map<String, Object> context) {
            Map<String, Object> args = new LinkedHashMap<>();
            // 那一行以 `targetId` 传递——运行时唯一的结构化槽位，而它现在是**通用**的。
            // The row travels as `targetId` — the runtime's one structured slot, generic now.
            if (context.get("targetId") != null) {
                args.put("id", context.get("targetId"));
            }
            return args;
        }
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
